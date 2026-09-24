// /api/clientes/proxima-acao — a PRÓXIMA AÇÃO de um cliente, a mesma em toda tela (lib/clientes/proxima-acao.ts).
//
//   GET  ?clientId=…  → { proximaAcao, podeEditar }  (qualquer pessoa do time com papel)
//   POST { clientId, acao: "confirmar" | "editar" | "concluir", texto?, responsavel?, prazo?, fingerprint? }
//        confirmar → a sugestão do sistema vira a próxima ação (e a recomendação do feed fica "aceita")
//        editar    → a pessoa escreve a própria (escrever é confirmar)
//        concluir  → feita: limpa, e a próxima sugestão aparece sozinha (a recomendação vira "executada")
//
// Quem grava: a gestão, ou o social/tráfego que é dono do relacionamento do cliente. A sugestão é
// recalculada AQUI no servidor — o navegador só diz qual viu (fingerprint), para não confirmar outra.
// Sem a migration 20260925100000 aplicada, grava o texto sem o "quem/quando".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { carregarCarteira, nomeDoUsuario } from "@/lib/saude/carregar";
import { decidir } from "@/lib/priority/repo";
import {
  ehColunaAusente, patchConcluir, patchConfirmar, patchEditar, semColunasNovas,
  type PatchJornada, type ProximaAcao, type Sugestao,
} from "@/lib/clientes/proxima-acao";

const TODOS: Papel[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function linhaDo(clientId: string, viewer: { nome: string | null; papel: Papel }) {
  const r = await carregarCarteira(viewer, { clientId });
  return { linha: r.linhas.find((l) => l.id === clientId) ?? null, semMigracao: r.semMigracaoProximaAcao };
}

/** A sugestão que está na tela: a própria (se sugerida) ou a "outra" (se já há uma confirmada). */
function sugestaoDe(pa: ProximaAcao): Sugestao | null {
  if (pa.estado === "sugerida" && pa.texto) {
    return {
      texto: pa.texto, porque: pa.porque, fonte: pa.fonte ?? "", responsavel: pa.responsavel,
      recomendacaoId: pa.recomendacaoId, fingerprint: pa.fingerprint,
    };
  }
  return pa.outraSugestao;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  if (!UUID.test(clientId)) return NextResponse.json({ error: "clientId inválido" }, { status: 400 });
  try {
    const nome = await nomeDoUsuario(gate.user.email);
    const { linha, semMigracao } = await linhaDo(clientId, { nome, papel: gate.papel as Papel });
    if (!linha) return NextResponse.json({ error: "Cliente fora da carteira ativa." }, { status: 404 });
    return NextResponse.json({ proximaAcao: linha.proximaAcao, podeEditar: linha.podeEditar, semMigracao });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as {
    clientId?: string; acao?: string; texto?: string; responsavel?: string | null; prazo?: string | null; fingerprint?: string | null;
  } | null;
  const clientId = b?.clientId ?? "";
  if (!UUID.test(clientId)) return NextResponse.json({ error: "clientId inválido" }, { status: 400 });
  if (!["confirmar", "editar", "concluir"].includes(b?.acao ?? "")) {
    return NextResponse.json({ error: "acao deve ser confirmar, editar ou concluir" }, { status: 400 });
  }

  try {
    const nome = await nomeDoUsuario(gate.user.email);
    const viewer = { nome, papel: gate.papel as Papel };
    const quem = nome ?? gate.user.email ?? "alguém do time";
    const { linha } = await linhaDo(clientId, viewer);
    if (!linha) return NextResponse.json({ error: "Cliente fora da carteira ativa." }, { status: 404 });
    if (!linha.podeEditar) {
      return NextResponse.json({ error: "Só a gestão ou o responsável pelo cliente confirma a próxima ação." }, { status: 403 });
    }
    const pa = linha.proximaAcao;
    const agoraIso = new Date().toISOString();
    let patch: PatchJornada;
    let decisao: { id: string; estado: "aceita" | "executada" } | null = null;

    if (b!.acao === "confirmar") {
      const s = sugestaoDe(pa);
      if (!s) return NextResponse.json({ error: "Não há sugestão para confirmar agora." }, { status: 409 });
      // O navegador diz qual sugestão viu; se o feed recalculou no meio, não confirma a outra às cegas.
      if (b!.fingerprint !== undefined && (b!.fingerprint ?? null) !== (s.fingerprint ?? null)) {
        return NextResponse.json({ error: "A sugestão mudou desde que a tela abriu. Atualize e confira." }, { status: 409 });
      }
      patch = patchConfirmar(s, quem, agoraIso);
      if (s.recomendacaoId) decisao = { id: s.recomendacaoId, estado: "aceita" };
    } else if (b!.acao === "editar") {
      const texto = (b!.texto ?? "").trim();
      if (!texto) return NextResponse.json({ error: "Escreva a próxima ação." }, { status: 400 });
      patch = patchEditar({ texto, responsavel: b!.responsavel ?? pa.responsavel, prazo: b!.prazo ?? null }, quem, agoraIso);
    } else {
      patch = patchConcluir();
      if (pa.recomendacaoId) decisao = { id: pa.recomendacaoId, estado: "executada" };
    }

    const base = { client_id: clientId, updated_at: agoraIso, updated_by: gate.user.email ?? null };
    let { error } = await supabaseAdmin.from("client_journey").upsert({ ...base, ...patch }, { onConflict: "client_id" });
    let semMigracao = false;
    if (error && ehColunaAusente(error.message)) {
      // Migration ainda não aplicada: grava o texto, sem o quem/quando.
      semMigracao = true;
      ({ error } = await supabaseAdmin.from("client_journey").upsert({ ...base, ...semColunasNovas(patch) }, { onConflict: "client_id" }));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Confirmar a sugestão É decidir a recomendação — é o número que a Fase 1 do agente mede.
    if (decisao) await decidir(decisao.id, decisao.estado, quem).catch(() => null);

    const depois = await linhaDo(clientId, viewer);
    return NextResponse.json({
      ok: true,
      proximaAcao: depois.linha?.proximaAcao ?? null,
      podeEditar: depois.linha?.podeEditar ?? linha.podeEditar,
      semMigracao: semMigracao || depois.semMigracao,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
