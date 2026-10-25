// lib/agentes/central-server.ts — monta a Central de Agentes: o catálogo + o uso real. Só servidor.
//
// Lê llm_calls (cada chamada de IA, com a etiqueta do agente) e agent_runs (cada execução), mais a
// Central de Automações (as rotinas que põem os agentes para rodar) e os interruptores. Nenhuma coluna
// de custo é lida: o custo em dinheiro é número da agência e fica fora do Lone OS.
//
// Sem migração nova: soma aqui, com paginação. Se a semana tiver mais chamadas que o teto, a tela diz
// que a contagem é parcial em vez de mostrar um número menor como se fosse o total.

import { supabaseAdmin } from "@/lib/supabase/server";
import { montarPainel } from "@/lib/automacoes/painel";
import { iaFora, type FalhaIa, type IaFora } from "@/lib/ia/saude-ia";
import { rotuloDaOrigem } from "@/lib/ia/causa-erro";
import {
  AGENTES, CONTADOS_NO_INVENTARIO, REMOVIDOS_NA_FAXINA, agenteDaExecucao, agenteDaOrigem, type Agente,
} from "./catalogo";
import {
  USO_VAZIO, avaliarAgente, estadoDoInterruptor, type Ambiente, type Avaliacao, type EstadoInterruptor,
  type RotinaDoAgente, type UsoAgente,
} from "./estado";
import { lerInterruptorLoninho, type InterruptorLoninho } from "./loninho-server";

const DIA = 86400_000;
const PAGINA = 1000;
/** Teto de linhas lidas por tabela na semana. Passou disso, a contagem é parcial (e a tela avisa). */
const MAX_PAGINAS = 40;
/** Para quem não rodou na semana: até onde procurar a última vez. */
const BUSCA_ANTIGA_DIAS = 90;

export interface LinhaAgente extends Avaliacao {
  agente: Agente;
  uso: UsoAgente;
  interruptores: EstadoInterruptor[];
  rotinas: RotinaDoAgente[];
}

export interface CentralDeAgentes {
  agentes: LinhaAgente[];
  loninho: InterruptorLoninho | null;
  /** A IA inteira fora (OpenAI sem crédito, chave recusada): todos param juntos. */
  iaFora: IaFora | null;
  /** Chamadas da semana que não casam com nenhum agente (antes da etiqueta obrigatória). */
  semEtiqueta: { total: number; porOrigem: { origem: string; rotulo: string; chamadas: number }[] };
  /** A semana tinha mais linhas que o teto: os números de 7 dias são um mínimo. */
  parcial: boolean;
  /** Partes que não carregaram (a tela mostra o resto e diz o que faltou). */
  avisos: string[];
  inventario: { contados: number; removidos: readonly { nome: string; motivo: string }[] };
  geradoEm: string;
}

type LinhaIa = { origem: string | null; ok: boolean; created_at: string };
type FalhaLida = { origem: string | null; erro: string | null; created_at: string };
type LinhaRun = { origem: string; iniciado_em: string; erro: string | null };

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ linhas: T[]; parcial: boolean }> {
  const linhas: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await consulta(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) return { linhas, parcial: false };
  }
  return { linhas, parcial: true };
}

/** Lê uma parte; se falhar, anota o aviso e devolve o reserva (a tela mostra o resto). */
async function parte<T>(avisos: string[], oQue: string, ler: () => Promise<T>, reserva: T): Promise<T> {
  try { return await ler(); } catch (e) {
    avisos.push(`Não consegui ler ${oQue} (${e instanceof Error ? e.message : String(e)}).`);
    return reserva;
  }
}

/** O curinga de um agente (":*" → prefixo para like), ou null quando as etiquetas são exatas. */
function prefixoCuringa(origens: readonly string[]): string | null {
  const c = origens.find((o) => o.endsWith(":*"));
  return c ? `${c.slice(0, -1)}%` : null;
}

const keyDe = (a: Agente) => a.id;

export async function montarCentralDeAgentes(agora = new Date()): Promise<CentralDeAgentes> {
  const desde7 = new Date(agora.getTime() - 7 * DIA).toISOString();
  const desdeAntigo = new Date(agora.getTime() - BUSCA_ANTIGA_DIAS * DIA).toISOString();
  const avisos: string[] = [];
  const agentes = AGENTES as readonly Agente[];

  const chavesAjustes = [...new Set(agentes.flatMap((a) => a.interruptores.flatMap((i) => (i.tipo === "agency_settings" ? [i.chave] : []))))];

  const [chamadas, falhas, runs, painel, ajustes, loninho] = await Promise.all([
    parte(avisos, "as chamadas de IA", () => paginar<LinhaIa>((de, ate) => supabaseAdmin.from("llm_calls")
      .select("origem, ok, created_at").gte("created_at", desde7)
      .order("created_at", { ascending: false }).range(de, ate)), null),
    parte(avisos, "as falhas de IA", async () => {
      const { data, error } = await supabaseAdmin.from("llm_calls").select("origem, erro, created_at")
        .eq("ok", false).gte("created_at", desde7).order("created_at", { ascending: false }).limit(3000);
      if (error) throw new Error(error.message);
      return (data ?? []) as FalhaLida[];
    }, [] as FalhaLida[]),
    // "inbound" é uma execução por mensagem recebida — é o Loninho inteiro, não um agente; fica de fora.
    parte(avisos, "as execuções", () => paginar<LinhaRun>((de, ate) => supabaseAdmin.from("agent_runs")
      .select("origem, iniciado_em, erro").gte("iniciado_em", desde7).neq("origem", "inbound")
      .order("iniciado_em", { ascending: false }).range(de, ate)), { linhas: [] as LinhaRun[], parcial: false }),
    parte(avisos, "a Central de Automações", () => montarPainel(agora), null),
    parte(avisos, "as configurações", async () => {
      if (!chavesAjustes.length) return [] as { key: string; value: string | null }[];
      const { data, error } = await supabaseAdmin.from("agency_settings").select("key, value").in("key", chavesAjustes);
      if (error) throw new Error(error.message);
      return (data ?? []) as { key: string; value: string | null }[];
    }, null),
    parte(avisos, "o interruptor do Loninho", () => lerInterruptorLoninho(agora), null),
  ]);
  const linhasIa = chamadas?.linhas ?? [];

  // ── Uso de cada agente na semana ──────────────────────────────────────────────────────────────
  const uso = new Map<string, UsoAgente>();
  const de = (a: Agente) => { let u = uso.get(keyDe(a)); if (!u) { u = { ...USO_VAZIO }; uso.set(keyDe(a), u); } return u; };
  const semDono = new Map<string, number>();

  for (const c of linhasIa) {
    const a = agenteDaOrigem(c.origem);
    if (!a) { const k = c.origem ?? "(vazio)"; semDono.set(k, (semDono.get(k) ?? 0) + 1); continue; }
    const u = de(a);
    u.chamadas7d++;
    if (!c.ok) u.falhasIa7d++;
    if (!u.ultimaIa) u.ultimaIa = { em: c.created_at, ok: c.ok }; // a lista vem da mais recente
  }
  for (const f of falhas) {
    const a = agenteDaOrigem(f.origem);
    if (a && !de(a).ultimaFalhaIa) de(a).ultimaFalhaIa = { em: f.created_at, erro: f.erro };
  }
  for (const r of runs.linhas) {
    const a = agenteDaExecucao(r.origem);
    if (!a) continue;
    const u = de(a);
    if (r.erro) u.errosExecucao7d++;
    if (!u.ultimaExecucao) u.ultimaExecucao = { em: r.iniciado_em, erro: r.erro };
  }

  // ── Quem não rodou na semana: a última vez nos 90 dias ────────────────────────────────────────
  const semSemana = agentes.filter((a) => !uso.get(keyDe(a))?.ultimaIa && !uso.get(keyDe(a))?.ultimaExecucao);
  await Promise.all(semSemana.map(async (a) => {
    const base = supabaseAdmin.from("llm_calls").select("ok, created_at");
    const prefixo = prefixoCuringa(a.origens);
    const [ia, run] = await Promise.all([
      (prefixo ? base.like("origem", prefixo) : base.in("origem", [...a.origens]))
        .gte("created_at", desdeAntigo).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      a.execucoes?.length
        ? supabaseAdmin.from("agent_runs").select("iniciado_em, erro").in("origem", [...a.execucoes])
          .gte("iniciado_em", desdeAntigo).order("iniciado_em", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (ia.error || run.error) { avisos.push(`Não consegui ler a última execução de “${a.nome}”.`); return; }
    const u = de(a);
    if (ia.data) u.ultimaIa = { em: ia.data.created_at as string, ok: ia.data.ok as boolean };
    if (run.data) u.ultimaExecucao = { em: run.data.iniciado_em as string, erro: (run.data.erro as string | null) ?? null };
  }));

  // ── Interruptores e rotinas ───────────────────────────────────────────────────────────────────
  const rotinas: Record<string, RotinaDoAgente> = {};
  for (const l of painel?.linhas ?? []) {
    rotinas[l.id] = {
      id: l.id, nome: l.nome, agendaBRT: l.agendaBRT, saude: l.saude,
      ligada: l.config.ligado, pausadaAte: l.config.pausadoAte,
      ultimaEm: l.ultima?.em ?? null, ultimoSucessoEm: l.ultimoSucessoEm, erros7d: l.semana.erro, maxSilencioHoras: l.maxSilencioHoras,
    };
  }
  const env: Record<string, string | undefined> = {};
  for (const a of agentes) for (const i of a.interruptores) if (i.tipo === "env") env[i.variavel] = process.env[i.variavel];
  const amb: Ambiente = {
    loninho,
    rotinas,
    env,
    ajustes: Object.fromEntries((ajustes ?? []).map((r) => [r.key, r.value])),
  };

  const linhas: LinhaAgente[] = agentes.map((a) => {
    const ints = a.interruptores.map((i) => estadoDoInterruptor(i, amb));
    if (ajustes === null) ints.forEach((i) => { if (i.tipo === "agency_settings") { i.ligado = null; i.detalhe = "Não consegui ler a configuração agora."; } });
    const rs = a.gatilhos.flatMap((g) => (g.tipo === "cron" && rotinas[g.automacao] ? [rotinas[g.automacao]] : []));
    const u = uso.get(keyDe(a)) ?? { ...USO_VAZIO };
    return { agente: a, uso: u, interruptores: ints, rotinas: rs, ...avaliarAgente(a, u, ints, rs, agora) };
  });

  // ── A IA inteira fora? Falhas desde o último sucesso (todas as origens) ─────────────────────────
  // Sem as chamadas da semana não dá para saber o último sucesso: melhor não acusar do que acusar errado.
  const ultimoOk = linhasIa.find((c) => c.ok)?.created_at ?? null;
  const fora = chamadas ? iaFora(falhas.filter((f) => !ultimoOk || f.created_at > ultimoOk) as FalhaIa[], agora) : null;

  const porOrigem = [...semDono].sort((x, y) => y[1] - x[1]).slice(0, 12)
    .map(([origem, n]) => ({ origem, rotulo: rotuloDaOrigem(origem), chamadas: n }));

  return {
    agentes: linhas,
    loninho,
    iaFora: fora,
    semEtiqueta: { total: [...semDono.values()].reduce((s, n) => s + n, 0), porOrigem },
    parcial: !!chamadas?.parcial || runs.parcial,
    avisos,
    inventario: { contados: CONTADOS_NO_INVENTARIO, removidos: REMOVIDOS_NA_FAXINA },
    geradoEm: agora.toISOString(),
  };
}
