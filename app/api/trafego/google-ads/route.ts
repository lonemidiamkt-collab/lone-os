export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { temTrafego } from "@/lib/clients/servico";
import { somarDias } from "@/lib/reports/relatorioCliente";
import { normalizarIdAds, formatarIdAds } from "@/lib/google/ids";
import { temColunasGoogle, temTrafegoGoogle } from "@/lib/google/colunas";
import { estadoMarketing } from "@/lib/google/marketing-auth";
import { rotuloCanal } from "@/lib/google/relatorio";
import { montarLinhaAds, type DiaAds, type EstadoCampanha, type LinhaAds } from "@/lib/google/carteira";

// Tráfego › Google Ads (19/11/2026). Uma linha por cliente com conta do Google Ads vinculada: verba, ritmo do mês,
// custo por conversão, parcela perdida por orçamento e os sinais do dia. Lê só o banco (rotina google-sync, 7h).
//   GET                                  → a carteira
//   POST { acao: "verba", clientId, verba } → grava a verba mensal do Google (null apaga)

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

export interface CampanhaCarteira {
  id: string; nome: string; canal: string; status: string | null; statusPrincipal: string | null; motivos: string[];
  orcamentoDiario: number | null; custoMes: number; cliquesMes: number; conversoesMes: number; custoPorConversao: number | null;
  perdidaOrcamento: number | null; perdidaClassificacao: number | null; impressoes7d: number | null;
}

export interface ClienteGoogleAds {
  clientId: string;
  nome: string;
  gestor: string | null;
  contaId: string;
  contaNome: string | null;
  verba: number | null;
  sincronizadoEm: string | null;
  erro: string | null;
  linha: LinhaAds;
  acoesMes: { categoria: string; conversoes: number }[];
  campanhas: CampanhaCarteira[];
}

export interface RespostaGoogleAds {
  conexao: { conectado: boolean; ads: boolean; email: string | null };
  migracao: boolean;               // false = a 20261119150000 ainda não foi aplicada (sem verba e sem estado das campanhas)
  hoje: string;
  clientes: ClienteGoogleAds[];
  semConta: { clientId: string; nome: string; gestor: string | null; sugestao: string | null }[];
}

const PAGINA = 1000;
async function lerTudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await montar(i * PAGINA, (i + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  if (!(await temColunasGoogle())) {
    return NextResponse.json({ error: "O Google ainda não foi ligado no banco: falta aplicar a migração 20261118120000_google_relatorios.sql." }, { status: 503 });
  }
  try {
    const migracao = await temTrafegoGoogle();
    const hoje = hojeSP();
    const ontem = somarDias(hoje, -1);
    const desde = [somarDias(ontem, -59), `${hoje.slice(0, 8)}01`].sort()[0];

    const [conexao, cliRes] = await Promise.all([
      estadoMarketing(),
      supabaseAdmin.from("clients").select(`id, name, nome_fantasia, assigned_traffic, service_type, active, churned_at, draft_status, google_ads_customer_id, google_ads_nome${migracao ? ", google_ads_verba_mensal" : ""}`),
    ]);
    if (cliRes.error) throw new Error(cliRes.error.message);
    type Cli = { id: string; name: string | null; nome_fantasia: string | null; assigned_traffic: string | null; service_type: string | null; active: boolean | null; churned_at: string | null; draft_status: string | null; google_ads_customer_id: string | null; google_ads_nome: string | null; google_ads_verba_mensal?: number | null };
    const ativos = ((cliRes.data ?? []) as unknown as Cli[]).filter((c) => c.active !== false && !c.churned_at && c.draft_status == null);
    const comConta = ativos.filter((c) => normalizarIdAds(c.google_ads_customer_id));
    const contas = [...new Set(comConta.map((c) => normalizarIdAds(c.google_ads_customer_id)!))];
    const ids = comConta.map((c) => c.id);

    type LinhaCamp = { customer_id: string; campaign_id: string; dia: string; campanha: string | null; canal: string | null; custo: number; cliques: number; impressoes: number; conversoes: number; ligacoes: number | null };
    type LinhaAcao = { customer_id: string; dia: string; categoria: string; todas_conversoes: number };
    const [linhas, acoes, estados, sinc, sug] = await Promise.all([
      contas.length ? lerTudo<LinhaCamp>((a, b) => supabaseAdmin.from("google_ads_campanha_dia")
        .select("customer_id, campaign_id, dia, campanha, canal, custo, cliques, impressoes, conversoes, ligacoes")
        .in("customer_id", contas).gte("dia", desde).lte("dia", ontem).order("dia").range(a, b)) : Promise.resolve([]),
      contas.length ? lerTudo<LinhaAcao>((a, b) => supabaseAdmin.from("google_ads_acao_dia")
        .select("customer_id, dia, categoria, todas_conversoes")
        .in("customer_id", contas).gte("dia", `${hoje.slice(0, 8)}01`).lte("dia", ontem).order("dia").range(a, b)) : Promise.resolve([]),
      migracao && contas.length
        ? lerTudo<EstadoCampanha & { customer_id: string }>((a, b) => supabaseAdmin.from("google_ads_campanha_estado").select("*").in("customer_id", contas).order("campaign_id").range(a, b))
        : Promise.resolve([] as (EstadoCampanha & { customer_id: string })[]),
      ids.length ? supabaseAdmin.from("google_sincronia").select("client_id, ads_sincronizado_em, ads_erro").in("client_id", ids) : Promise.resolve({ data: [], error: null }),
      supabaseAdmin.from("google_sugestoes").select("client_id, nome").eq("tipo", "ads"),
    ]);
    if (sinc.error) throw new Error(sinc.error.message);
    const sincDe = new Map(((sinc.data ?? []) as { client_id: string; ads_sincronizado_em: string | null; ads_erro: string | null }[]).map((s) => [s.client_id, s]));
    const sugDe = new Map(((sug.data ?? []) as { client_id: string; nome: string | null }[]).map((s) => [s.client_id, s.nome]));

    const porConta = new Map<string, LinhaCamp[]>();
    for (const l of linhas) { const arr = porConta.get(l.customer_id) ?? []; arr.push(l); porConta.set(l.customer_id, arr); }
    const estadosDe = new Map<string, (EstadoCampanha & { customer_id: string })[]>();
    for (const e of estados) { const arr = estadosDe.get(e.customer_id) ?? []; arr.push(e); estadosDe.set(e.customer_id, arr); }
    const acoesDe = new Map<string, Map<string, number>>();
    for (const a of acoes) {
      const m = acoesDe.get(a.customer_id) ?? new Map<string, number>();
      m.set(a.categoria, (m.get(a.categoria) ?? 0) + Number(a.todas_conversoes));
      acoesDe.set(a.customer_id, m);
    }

    const agora = Date.now();
    const iniMes = `${hoje.slice(0, 8)}01`;
    const clientes: ClienteGoogleAds[] = comConta.map((c) => {
      const conta = normalizarIdAds(c.google_ads_customer_id)!;
      const brutas = porConta.get(conta) ?? [];
      // Campanha × dia → dia (a linha do cliente).
      const porDia = new Map<string, DiaAds>();
      for (const l of brutas) {
        const d = porDia.get(l.dia) ?? { dia: l.dia, custo: 0, cliques: 0, impressoes: 0, conversoes: 0, ligacoes: null };
        d.custo += Number(l.custo); d.cliques += Number(l.cliques); d.impressoes += Number(l.impressoes); d.conversoes += Number(l.conversoes);
        if (l.ligacoes != null) d.ligacoes = (d.ligacoes ?? 0) + Number(l.ligacoes);
        porDia.set(l.dia, d);
      }
      const est = estadosDe.get(conta) ?? [];
      const s = sincDe.get(c.id);
      const linha = montarLinhaAds({
        hoje, agora, verba: c.google_ads_verba_mensal ?? null, dias: [...porDia.values()], estados: est,
        sincronizadoEm: s?.ads_sincronizado_em ?? null, erro: s?.ads_erro ?? null,
      });
      // Campanhas do mês (+ as ativas sem gasto, que são as travadas).
      const camp = new Map<string, CampanhaCarteira>();
      for (const l of brutas.filter((x) => x.dia >= iniMes)) {
        const k = camp.get(l.campaign_id) ?? { id: l.campaign_id, nome: l.campanha ?? l.campaign_id, canal: rotuloCanal(l.canal), status: null, statusPrincipal: null, motivos: [], orcamentoDiario: null, custoMes: 0, cliquesMes: 0, conversoesMes: 0, custoPorConversao: null, perdidaOrcamento: null, perdidaClassificacao: null, impressoes7d: null };
        k.custoMes += Number(l.custo); k.cliquesMes += Number(l.cliques); k.conversoesMes += Number(l.conversoes);
        camp.set(l.campaign_id, k);
      }
      for (const e of est) {
        const k = camp.get(e.campaign_id) ?? { id: e.campaign_id, nome: e.campanha ?? e.campaign_id, canal: rotuloCanal(e.canal), status: null, statusPrincipal: null, motivos: [], orcamentoDiario: null, custoMes: 0, cliquesMes: 0, conversoesMes: 0, custoPorConversao: null, perdidaOrcamento: null, perdidaClassificacao: null, impressoes7d: null };
        Object.assign(k, { nome: e.campanha ?? k.nome, canal: rotuloCanal(e.canal), status: e.status, statusPrincipal: e.status_principal, motivos: e.motivos_status ?? [], orcamentoDiario: e.orcamento_diario, perdidaOrcamento: e.perdida_orcamento, perdidaClassificacao: e.perdida_classificacao, impressoes7d: e.impressoes_7d });
        camp.set(e.campaign_id, k);
      }
      const campanhas = [...camp.values()]
        .map((k) => ({ ...k, custoMes: Math.round(k.custoMes * 100) / 100, conversoesMes: Math.round(k.conversoesMes * 100) / 100, custoPorConversao: k.conversoesMes > 0 ? Math.round((k.custoMes / k.conversoesMes) * 100) / 100 : null }))
        .filter((k) => k.custoMes > 0 || k.status === "ENABLED")
        .sort((a, b) => b.custoMes - a.custoMes);
      const acoesMes = [...(acoesDe.get(conta) ?? new Map()).entries()]
        .map(([categoria, conversoes]) => ({ categoria, conversoes: Math.round(conversoes * 10) / 10 }))
        .filter((a) => a.conversoes > 0).sort((a, b) => b.conversoes - a.conversoes);
      return {
        clientId: c.id, nome: c.nome_fantasia || c.name || "(sem nome)", gestor: c.assigned_traffic,
        contaId: formatarIdAds(conta), contaNome: c.google_ads_nome, verba: c.google_ads_verba_mensal ?? null,
        sincronizadoEm: s?.ads_sincronizado_em ?? null, erro: s?.ads_erro ?? null, linha, acoesMes, campanhas,
      };
    });

    const semConta = ativos
      .filter((c) => !normalizarIdAds(c.google_ads_customer_id) && temTrafego(c))
      .map((c) => ({ clientId: c.id, nome: c.nome_fantasia || c.name || "(sem nome)", gestor: c.assigned_traffic, sugestao: sugDe.get(c.id) ?? null }))
      .sort((a, b) => Number(!!b.sugestao) - Number(!!a.sugestao) || a.nome.localeCompare(b.nome, "pt-BR"));

    const resposta: RespostaGoogleAds = {
      conexao: { conectado: conexao.conectado, ads: !!conexao.ads, email: conexao.email ?? null },
      migracao, hoje, clientes, semConta,
    };
    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[trafego/google-ads]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: `Não consegui montar a carteira do Google Ads (${err instanceof Error ? err.message : "erro"}). Recarregue em instantes.` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  const b = (await req.json().catch(() => null)) as { acao?: string; clientId?: string; verba?: number | null } | null;
  if (b?.acao !== "verba" || !b.clientId) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (!(await temTrafegoGoogle())) {
    return NextResponse.json({ error: "A verba do Google ainda não pode ser gravada: falta aplicar a migração 20261119150000_trafego_google.sql." }, { status: 503 });
  }
  const verba = b.verba == null ? null : Number(b.verba);
  if (verba !== null && (!Number.isFinite(verba) || verba < 0 || verba > 10_000_000)) {
    return NextResponse.json({ error: "Verba inválida: use um valor em reais entre 0 e 10 milhões." }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("clients").update({ google_ads_verba_mensal: verba && verba > 0 ? Math.round(verba * 100) / 100 : null }).eq("id", b.clientId);
  if (error) return NextResponse.json({ error: `Não gravei a verba (${error.message}).` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
