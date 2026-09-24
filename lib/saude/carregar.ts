// lib/saude/carregar.ts — a LEITURA da Saúde da carteira, num lote só. Server-only.
//
// Cinco consultas em paralelo: clientes (com o cache da saúde do escritor único), time, 14 dias de
// client_health_scores (tendência + breakdown), recomendações abertas do feed (a próxima ação
// sugerida) e client_journey (a próxima ação confirmada e a ficha de relacionamento). Fonte que
// falhar vira um nome em `falhas` — nunca um zero silencioso. Sem clientes não há tela: sobe erro.
//
// Colunas escolhidas a dedo: nada de valor de contrato, fee ou faturamento.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { Papel } from "@/lib/api/require-role";
import { hojeSP } from "@/lib/clients/pausa";
import type { MembroRow } from "@/lib/inicio/dados";
import { montarCarteira, type ClienteSaudeRow, type HistoricoRow, type RecomendacaoRow } from "./montar";
import type { RespostaSaude } from "./tipos";

const COLS_CLIENTE = "id, name, nome_fantasia, logo, doc_logo, status, active, churned_at, draft_status, paused_at, paused_until, created_at, assigned_social, assigned_traffic, assigned_designer, service_type, current_health_level, current_health_score, health_computed_at, last_client_msg_at, agente_ativo, meta_ad_account_id, public_report_enabled, instagram_user, last_post_date";
const COLS_REC = "id, fingerprint, fonte, client_id, titulo, fato, recomendacao, score, owner";
const ABERTAS = ["nova", "vista", "aceita"];
const DIA_MS = 86_400_000;

type Resultado<T> = { data: T[] | null; error: { message: string } | null };

export async function carregarCarteira(
  viewer: { nome: string | null; papel: Papel },
  opcoes: { clientId?: string; agora?: Date } = {},
): Promise<RespostaSaude> {
  const agora = opcoes.agora ?? new Date();
  const falhas: string[] = [];
  const ler = async <T,>(rotulo: string, q: PromiseLike<Resultado<T>>): Promise<T[]> => {
    try {
      const r = await q;
      if (r.error) { falhas.push(rotulo); return []; }
      return r.data ?? [];
    } catch {
      falhas.push(rotulo);
      return [];
    }
  };
  const desde = hojeSP(new Date(agora.getTime() - 14 * DIA_MS));
  const id = opcoes.clientId ?? null;

  let qClientes = supabaseAdmin.from("clients").select(COLS_CLIENTE).is("draft_status", null).or("active.is.null,active.eq.true");
  let qHistorico = supabaseAdmin.from("client_health_scores").select("client_id, score, level, breakdown, computed_for_date")
    .gte("computed_for_date", desde);
  let qRecs = supabaseAdmin.from("recommendations").select(COLS_REC).in("estado", ABERTAS).not("client_id", "is", null);
  let qJornada = supabaseAdmin.from("client_journey").select("*");
  if (id) {
    qClientes = qClientes.eq("id", id);
    qHistorico = qHistorico.eq("client_id", id);
    qRecs = qRecs.eq("client_id", id);
    qJornada = qJornada.eq("client_id", id);
  }

  const [clientesRes, time, historico, recomendacoes, jornadas, migracao] = await Promise.all([
    qClientes,
    ler<{ name: string; role: string | null; is_active: boolean | null; deleted_at: string | null }>("time",
      supabaseAdmin.from("team_members").select("name, role, is_active, deleted_at") as never),
    ler<HistoricoRow>("histórico da saúde", qHistorico.limit(5000) as never),
    ler<RecomendacaoRow>("feed de prioridades", qRecs.limit(2000) as never),
    ler<Record<string, unknown>>("ficha de relacionamento", qJornada as never),
    // A migration da próxima ação confirmada já está no banco? Sem ela, grava só o texto.
    supabaseAdmin.from("client_journey").select("client_id, proxima_acao_origem").limit(1)
      .then((r) => !r.error, () => false),
  ]);

  if (clientesRes.error) throw new Error(`clients: ${clientesRes.error.message}`);

  const membros: MembroRow[] = time
    .filter((m) => m.name && m.is_active !== false && !m.deleted_at)
    .map((m) => ({ nome: m.name, papel: (m.role as Papel) ?? null }));

  const montado = montarCarteira({
    agora,
    clientes: (clientesRes.data ?? []) as unknown as ClienteSaudeRow[],
    time: membros,
    historico,
    recomendacoes: recomendacoes.map((r) => ({ ...r, fato: Array.isArray(r.fato) ? r.fato : [], score: Number(r.score) || 0 })),
    jornadas,
    viewer,
  });

  return { ...montado, geradoEm: agora.toISOString(), falhas, semMigracaoProximaAcao: !migracao };
}

/** Nome do time de quem está logado (team_members por e-mail). */
export async function nomeDoUsuario(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabaseAdmin.from("team_members").select("name").eq("email", email).maybeSingle();
  return (data?.name as string) ?? null;
}
