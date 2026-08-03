// app/api/processos/route.ts — biblioteca de processos: listar e criar.
//
// GET  → lista (todo papel com login vê; processo escondido é processo não seguido)
// POST → cria rascunho. Dois modos:
//        { texto, area, tipo }        → a IA redige no padrão e devolve o que ainda falta
//        { rascunho, area, tipo }     → salva um rascunho já revisado por gente
//
// Autorização SEMPRE aqui, nunca só na tela (lib/api/require-role.ts explica por quê).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pode } from "@/lib/processos/permissoes";
import {
  redigirProcesso, validarProcesso, podeSalvar, pendencias,
  type AreaProcesso, type TipoDoc, type ProcessoRascunho,
} from "@/lib/processos/redator";

const TODOS: Papel[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];
const AREAS: AreaProcesso[] = ["social", "traffic", "cs", "comercial", "geral"];
const TIPOS: TipoDoc[] = ["processo", "playbook", "sop", "checklist", "politica", "template"];

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Código curto e falável por área: SOC-01, TRF-02, CS-03. Dá pra citar em conversa e em card. */
const PREFIXO: Record<AreaProcesso, string> = {
  social: "SOC", traffic: "TRF", cs: "CS", comercial: "COM", geral: "GER",
};

async function proximoCodigo(area: AreaProcesso): Promise<string> {
  const { data } = await supabaseAdmin.from("processes").select("code").eq("area", area).is("deleted_at", null);
  const n = (data ?? []).reduce((max, r) => {
    const m = /(\d+)$/.exec((r.code as string) || "");
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `${PREFIXO[area]}-${String(n + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const area = url.searchParams.get("area");
  const tipo = url.searchParams.get("tipo");
  const busca = (url.searchParams.get("q") || "").trim();

  let q = supabaseAdmin
    .from("processes")
    .select("id, code, slug, title, area, doc_type, owner_role, status, summary, tags, updated_at, active_version_id")
    .is("deleted_at", null)
    .order("area").order("code");
  if (area && AREAS.includes(area as AreaProcesso)) q = q.eq("area", area);
  if (tipo && TIPOS.includes(tipo as TipoDoc)) q = q.eq("doc_type", tipo);
  if (busca) q = q.or(`title.ilike.%${busca}%,summary.ilike.%${busca}%,code.ilike.%${busca}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ processos: data ?? [], papel: gate.papel });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const area = (body?.area as AreaProcesso) || "geral";
  const tipo = (body?.tipo as TipoDoc) || "processo";
  if (!AREAS.includes(area) || !TIPOS.includes(tipo)) {
    return NextResponse.json({ error: "Área ou tipo inválido." }, { status: 400 });
  }
  if (!pode(gate.papel, "criar", area)) {
    return NextResponse.json({ error: `Seu papel não escreve processo da área ${area}.` }, { status: 403 });
  }

  // ── Modo 1: a IA redige a partir do texto corrido ──────────────────────────
  let rascunho = body?.rascunho as ProcessoRascunho | undefined;
  if (!rascunho) {
    const texto = (body?.texto as string) || "";
    if (texto.trim().length < 40) {
      return NextResponse.json({ error: "Descreva o processo com um pouco mais de detalhe (mínimo ~40 caracteres)." }, { status: 400 });
    }
    const r = await redigirProcesso({ texto, area, tipo, contexto: body?.contexto as string });
    if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "A IA não conseguiu redigir agora." }, { status: 502 });
    rascunho = r.data;
  }

  const problemas = validarProcesso(rascunho);
  // ?revisar=1 → só devolve o rascunho + o que falta, sem gravar. É o passo de revisão humana:
  // a pessoa lê, corrige e só então salva. Publicar continua sendo outra ação, da gestão.
  if (req.nextUrl.searchParams.get("revisar") === "1") {
    return NextResponse.json({ rascunho, problemas, pendencias: pendencias(rascunho), podeSalvar: podeSalvar(problemas) });
  }
  if (!podeSalvar(problemas)) {
    return NextResponse.json({ error: "O rascunho ainda não está executável.", problemas }, { status: 422 });
  }

  const code = await proximoCodigo(area);
  const autor = gate.user.email || "desconhecido";

  const { data: proc, error: e1 } = await supabaseAdmin.from("processes").insert({
    code, slug: `${slugify(rascunho.titulo)}-${code.toLowerCase()}`,
    title: rascunho.titulo, area, doc_type: tipo,
    owner_role: rascunho.donoPapel?.trim() || null, status: "draft",
    summary: rascunho.objetivo?.slice(0, 240) ?? null,
    created_by: autor,
  }).select("id, slug, code").maybeSingle();
  if (e1 || !proc) return NextResponse.json({ error: e1?.message || "Não consegui criar o processo." }, { status: 500 });

  const { data: ver, error: e2 } = await supabaseAdmin.from("process_versions").insert({
    process_id: proc.id, version: "1.0", status: "draft",
    objective: rascunho.objetivo, problem: rascunho.problema, scope: rascunho.escopo,
    out_of_scope: rascunho.foraDeEscopo, trigger_event: rascunho.gatilho, frequency: rascunho.frequencia,
    prerequisites: rascunho.preRequisitos, inputs: rascunho.entradas, outputs: rascunho.saidas,
    completion_criteria: rascunho.criterioPronto, quality_criteria: rascunho.criteriosQualidade,
    sla: rascunho.sla, kpis: rascunho.kpis, risks: rascunho.riscos, exceptions: rascunho.excecoes,
    created_by: autor,
  }).select("id").maybeSingle();
  if (e2 || !ver) return NextResponse.json({ error: e2?.message || "Não consegui gravar a versão." }, { status: 500 });

  if (rascunho.passos?.length) {
    const { error: e3 } = await supabaseAdmin.from("process_steps").insert(
      rascunho.passos.map((s, i) => ({
        version_id: ver.id, seq: s.seq || i + 1, title: s.titulo, instruction: s.instrucao,
        role: s.papel, system_ref: s.sistema, sla_minutes: s.slaMinutos,
        decision_type: s.decisao, evidence_type: s.evidencia,
        evidence_required: !s.opcional, optional: s.opcional,
      })),
    );
    if (e3) return NextResponse.json({ error: `Passos: ${e3.message}` }, { status: 500 });
  }

  await supabaseAdmin.from("audit_log").insert({
    table_name: "processes", operation: "created", record_id: proc.id,
    user_role: gate.papel, user_name: autor, new_data: { code, title: rascunho.titulo, area },
  }).then(() => {}, () => {}); // auditoria não derruba a criação

  return NextResponse.json({
    ok: true, id: proc.id, slug: proc.slug, code: proc.code,
    avisos: problemas.filter((p) => p.gravidade === "aviso"),
    pendencias: pendencias(rascunho),
  });
}
