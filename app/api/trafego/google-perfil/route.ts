export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { somarDias } from "@/lib/reports/relatorioCliente";
import { temColunasGoogle, temTrafegoGoogle } from "@/lib/google/colunas";
import { estadoMarketing } from "@/lib/google/marketing-auth";
import { montarLinhaPerfil, type Avaliacao, type DiaPerfil, type LinhaPerfil } from "@/lib/google/carteira";

// Tráfego › Google Meu Negócio (19/11/2026). Uma linha por cliente com Perfil da Empresa vinculado: contatos dos
// últimos 28 dias entregues (ligações, rotas, site, conversas) contra os 28 anteriores, Busca × Maps, nota, total e a
// fila de avaliações sem resposta. Lê só o banco (rotina google-sync, 7h).

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

/** Lê todas as linhas (o PostgREST corta em 1.000). */
async function lerTudo(montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ data: unknown[]; error: { message: string } | null }> {
  const out: unknown[] = [];
  for (let i = 0; i < 50; i++) {
    const { data, error } = await montar(i * 1000, i * 1000 + 999);
    if (error) return { data: [], error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

export interface ClientePerfil {
  clientId: string;
  nome: string;
  gestor: string | null;
  perfilNome: string | null;
  local: string;
  nota: number | null;
  total: number | null;
  sincronizadoEm: string | null;
  ultimoDia: string | null;
  linha: LinhaPerfil;
  termos: { termo: string; valor: number | null; limiar: number | null }[];
  mesTermos: string | null;
  /** Link para responder no Google (a resposta se escreve lá: o sistema só lê). */
  linkAvaliacoes: string;
}

export interface RespostaPerfil {
  conexao: { conectado: boolean; perfil: boolean };
  migracao: boolean;
  hoje: string;
  clientes: ClientePerfil[];
  semPerfil: { clientId: string; nome: string; gestor: string | null; sugestao: string | null }[];
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
    const [conexao, cliRes, sug] = await Promise.all([
      estadoMarketing(),
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic, service_type, active, churned_at, draft_status, google_perfil_local, google_perfil_nome"),
      supabaseAdmin.from("google_sugestoes").select("client_id, nome").eq("tipo", "perfil"),
    ]);
    if (cliRes.error) throw new Error(cliRes.error.message);
    type Cli = { id: string; name: string | null; nome_fantasia: string | null; assigned_traffic: string | null; service_type: string | null; active: boolean | null; churned_at: string | null; draft_status: string | null; google_perfil_local: string | null; google_perfil_nome: string | null };
    const ativos = ((cliRes.data ?? []) as Cli[]).filter((c) => c.active !== false && !c.churned_at && c.draft_status == null);
    const comPerfil = ativos.filter((c) => c.google_perfil_local);
    const locais = [...new Set(comPerfil.map((c) => c.google_perfil_local!))];
    const ids = comPerfil.map((c) => c.id);
    const desde = somarDias(hoje, -75);

    const [dias, sinc, termos, resumos, avals] = await Promise.all([
      locais.length ? lerTudo((a, b) => supabaseAdmin.from("google_perfil_dia").select("local, dia, impressoes_busca_celular, impressoes_busca_computador, impressoes_mapas_celular, impressoes_mapas_computador, ligacoes, rotas, cliques_site, conversas, reservas").in("local", locais).gte("dia", desde).order("local").order("dia").range(a, b)) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabaseAdmin.from("google_sincronia").select("client_id, perfil_sincronizado_em, perfil_erro, perfil_ultimo_dia").in("client_id", ids) : Promise.resolve({ data: [], error: null }),
      locais.length ? supabaseAdmin.from("google_perfil_buscas").select("local, mes, termo, valor, limiar").in("local", locais).gte("mes", somarDias(`${hoje.slice(0, 8)}01`, -70)) : Promise.resolve({ data: [], error: null }),
      migracao && locais.length ? supabaseAdmin.from("google_perfil_resumo").select("local, nota_media, total_avaliacoes, erro, lido_em").in("local", locais) : Promise.resolve({ data: [], error: null }),
      migracao && locais.length ? lerTudo((a, b) => supabaseAdmin.from("google_perfil_avaliacao").select("local, review_id, nota, comentario, autor, criada_em, resposta, respondida_em").in("local", locais).order("local").order("review_id").range(a, b)) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [dias, sinc, termos, resumos, avals]) if (r.error) throw new Error(r.error.message);

    const agrupar = <T extends { local: string }>(xs: T[]) => { const m = new Map<string, T[]>(); for (const x of xs) { const a = m.get(x.local) ?? []; a.push(x); m.set(x.local, a); } return m; };
    const diasDe = agrupar((dias.data ?? []) as (DiaPerfil & { local: string })[]);
    const termosDe = agrupar((termos.data ?? []) as { local: string; mes: string; termo: string; valor: number | null; limiar: number | null }[]);
    const avalDe = agrupar((avals.data ?? []) as (Avaliacao & { local: string })[]);
    const resumoDe = new Map(((resumos.data ?? []) as { local: string; nota_media: number | null; total_avaliacoes: number | null; erro: string | null; lido_em: string | null }[]).map((r) => [r.local, r]));
    const sincDe = new Map(((sinc.data ?? []) as { client_id: string; perfil_sincronizado_em: string | null; perfil_erro: string | null; perfil_ultimo_dia: string | null }[]).map((s) => [s.client_id, s]));
    const sugDe = new Map(((sug.data ?? []) as { client_id: string; nome: string | null }[]).map((s) => [s.client_id, s.nome]));
    const agora = Date.now();

    const clientes: ClientePerfil[] = comPerfil.map((c) => {
      const local = c.google_perfil_local!;
      const s = sincDe.get(c.id);
      const res = resumoDe.get(local);
      const ts = termosDe.get(local) ?? [];
      const mesTermos = ts.map((t) => t.mes).sort().pop() ?? null;
      const linha = montarLinhaPerfil({
        hoje, agora, dias: diasDe.get(local) ?? [], ultimoDia: s?.perfil_ultimo_dia ?? null,
        sincronizadoEm: s?.perfil_sincronizado_em ?? null, erro: s?.perfil_erro ?? null,
        nota: res?.nota_media != null ? Number(res.nota_media) : null, total: res?.total_avaliacoes ?? null,
        avaliacoes: avalDe.get(local) ?? [], avaliacoesLidas: !!res?.lido_em && !res.erro, erroAvaliacoes: res?.erro ?? null,
      });
      return {
        clientId: c.id, nome: c.nome_fantasia || c.name || "(sem nome)", gestor: c.assigned_traffic,
        perfilNome: c.google_perfil_nome, local,
        nota: res?.nota_media != null ? Number(res.nota_media) : null, total: res?.total_avaliacoes ?? null,
        sincronizadoEm: s?.perfil_sincronizado_em ?? null, ultimoDia: s?.perfil_ultimo_dia ?? null, linha,
        termos: ts.filter((t) => t.mes === mesTermos).sort((a, b) => (b.valor ?? b.limiar ?? 0) - (a.valor ?? a.limiar ?? 0)).slice(0, 8)
          .map(({ termo, valor, limiar }) => ({ termo, valor, limiar })),
        mesTermos,
        linkAvaliacoes: `https://business.google.com/reviews/l/${local.split("/")[1]}`,
      };
    });

    const semPerfil = ativos
      .filter((c) => !c.google_perfil_local)
      .map((c) => ({ clientId: c.id, nome: c.nome_fantasia || c.name || "(sem nome)", gestor: c.assigned_traffic, sugestao: sugDe.get(c.id) ?? null }))
      .sort((a, b) => Number(!!b.sugestao) - Number(!!a.sugestao) || a.nome.localeCompare(b.nome, "pt-BR"));

    const resposta: RespostaPerfil = { conexao: { conectado: conexao.conectado, perfil: !!conexao.perfil }, migracao, hoje, clientes, semPerfil };
    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[trafego/google-perfil]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: `Não consegui montar a carteira do Google Meu Negócio (${err instanceof Error ? err.message : "erro"}). Recarregue em instantes.` }, { status: 500 });
  }
}
