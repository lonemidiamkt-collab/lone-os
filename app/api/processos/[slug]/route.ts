// app/api/processos/[slug]/route.ts — abrir um processo, editar rascunho, publicar, descontinuar.
//
// GET   → processo + versão ativa (ou o rascunho, se ainda não tem ativa) + passos em ordem
// PATCH → { acao: "publicar" | "descontinuar" }  ....... só gestão
//         { campos: {...}, passos: [...] }  ............ edita RASCUNHO (versão ativa é imutável)
//
// A imutabilidade da versão ativa também está no banco (trigger). Aqui a checagem existe pra
// devolver mensagem que a pessoa entende, em vez de erro cru do Postgres.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pode } from "@/lib/processos/permissoes";
import type { AreaProcesso } from "@/lib/processos/redator";

const TODOS: Papel[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];

/** Campos de texto que a edição de rascunho pode mexer. Lista fechada: nada de repassar o body cru. */
const EDITAVEIS = [
  "objective", "problem", "scope", "out_of_scope", "trigger_event", "frequency",
  "inputs", "outputs", "completion_criteria", "quality_criteria", "sla",
] as const;

async function carregar(slug: string) {
  const { data: proc } = await supabaseAdmin
    .from("processes")
    .select("id, code, slug, title, area, doc_type, status, summary, tags, active_version_id, updated_at, created_by")
    .eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!proc) return null;

  // Sem versão ativa, mostra o rascunho mais recente — senão o processo recém-criado abre vazio.
  let versao = null;
  if (proc.active_version_id) {
    const { data } = await supabaseAdmin.from("process_versions").select("*").eq("id", proc.active_version_id).maybeSingle();
    versao = data;
  }
  if (!versao) {
    const { data } = await supabaseAdmin.from("process_versions").select("*")
      .eq("process_id", proc.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    versao = data;
  }

  const passos = versao
    ? (await supabaseAdmin.from("process_steps").select("*").eq("version_id", versao.id).order("seq")).data ?? []
    : [];

  return { processo: proc, versao, passos };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;

  const { slug } = await ctx.params;
  const r = await carregar(slug);
  if (!r) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });

  const area = r.processo.area as AreaProcesso;
  return NextResponse.json({
    ...r,
    papel: gate.papel,
    // A tela usa isto pra não oferecer botão que a rota vai negar.
    permissoes: {
      editar: pode(gate.papel, "editar_rascunho", area),
      publicar: pode(gate.papel, "publicar", area),
      descontinuar: pode(gate.papel, "descontinuar", area),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;

  const { slug } = await ctx.params;
  const r = await carregar(slug);
  if (!r || !r.versao) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });

  const area = r.processo.area as AreaProcesso;
  const body = await req.json().catch(() => ({}));
  const acao = body?.acao as string | undefined;
  const autor = gate.user.email || "desconhecido";

  // ── Publicar / descontinuar ────────────────────────────────────────────────
  if (acao === "publicar" || acao === "descontinuar") {
    if (!pode(gate.papel, acao === "publicar" ? "publicar" : "descontinuar", area)) {
      return NextResponse.json({ error: "Só a gestão publica ou descontinua processo." }, { status: 403 });
    }
    if (acao === "publicar") {
      if (r.processo.status === "active") return NextResponse.json({ error: "Este processo já está ativo." }, { status: 400 });
      if (!r.passos.length) return NextResponse.json({ error: "Processo sem passo nenhum não pode ir pro ar." }, { status: 422 });
      await supabaseAdmin.from("process_versions")
        .update({ status: "active", approved_at: new Date().toISOString(), approved_by: autor })
        .eq("id", r.versao.id);
      await supabaseAdmin.from("processes")
        .update({ status: "active", active_version_id: r.versao.id }).eq("id", r.processo.id);
    } else {
      await supabaseAdmin.from("processes").update({ status: "deprecated" }).eq("id", r.processo.id);
    }
    await supabaseAdmin.from("audit_log").insert({
      table_name: "processes", operation: acao, record_id: r.processo.id,
      user_role: gate.papel, user_name: autor, new_data: { code: r.processo.code, title: r.processo.title },
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, status: acao === "publicar" ? "active" : "deprecated" });
  }

  // ── Editar rascunho ────────────────────────────────────────────────────────
  if (!pode(gate.papel, "editar_rascunho", area)) {
    return NextResponse.json({ error: `Seu papel não edita processo da área ${area}.` }, { status: 403 });
  }
  // VERSÃO NO AR NÃO SE EDITA POR CIMA. Quem segue o processo hoje precisa que o texto pare
  // quieto; correção em processo ativo vira versão nova (fatia 2). Enquanto isso, resposta clara.
  if (r.versao.status === "active" || r.versao.status === "approved") {
    return NextResponse.json({
      error: "Esta versão está no ar e não pode ser alterada. Para mudar o processo, crie uma versão nova.",
    }, { status: 409 });
  }

  const campos = (body?.campos ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of EDITAVEIS) if (typeof campos[k] === "string") patch[k] = campos[k];
  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from("process_versions").update(patch).eq("id", r.versao.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body?.passos)) {
    const passos = body.passos as { titulo: string; instrucao: string; papel: string; sistema?: string; evidencia?: string; opcional?: boolean }[];
    const validos = passos.filter((s) => s?.titulo?.trim() && s?.instrucao?.trim() && s?.papel?.trim());
    if (validos.length !== passos.length) {
      return NextResponse.json({ error: "Todo passo precisa de título, instrução e responsável." }, { status: 422 });
    }
    await supabaseAdmin.from("process_steps").delete().eq("version_id", r.versao.id);
    if (validos.length) {
      const { error } = await supabaseAdmin.from("process_steps").insert(
        validos.map((s, i) => ({
          version_id: r.versao!.id, seq: i + 1, title: s.titulo, instruction: s.instrucao,
          role: s.papel, system_ref: s.sistema ?? null, evidence_type: s.evidencia ?? null,
          evidence_required: !s.opcional && !!s.evidencia, optional: !!s.opcional,
        })),
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
