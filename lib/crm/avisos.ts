// lib/crm/avisos.ts — QUANDO e O QUÊ o comercial avisa sozinho. Módulo PURO, testado.
//
// Dois avisos, com teto, porque aviso demais ensina a ignorar (o Loninho já chegou a 21–59/dia):
//  1. Lead do site sem resposta em 1 h → um lembrete por lead, das 8h às 20h.
//  2. Cobrança da meta → no máximo 1 por dia: segunda (resumo da semana), ritmo abaixo do necessário
//     por 3 dias úteis seguidos (de 3 em 3 dias, não todo dia) ou marco do dia 10/20 com a projeção
//     abaixo de 80% da meta.
// O SINO leva os números (só quem cuida do comercial vê). O WHATSAPP do dono leva só o empurrão —
// nome de empresa sim, valor e meta em R$ nunca (o WhatsApp do Loninho grava tudo no banco do time).

import { brl, calcularMeta, diaDe, diasUteisDoMes, type LeadParaMeta } from "@/lib/crm/meta";
import { chanceDe, ehAberta } from "@/lib/crm/etapas";

// ─── 1. Lembrete de lead novo ──────────────────────────────────────────

export interface LeadNovoSite {
  id: string;
  empresa: string | null;
  contatoNome: string;
  segmento: string | null;
  estagio: string;
  createdAt: string;
  primeiroContatoEm: string | null;
  lembreteEm: string | null;
}

export const MINUTOS_LEMBRETE = 60;

/** Hora cheia em São Paulo (0–23). */
export const horaSP = (agora: Date) => Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false })) % 24;

export function leadsParaLembrete(leads: LeadNovoSite[], agora: Date): LeadNovoSite[] {
  const h = horaSP(agora);
  if (h < 8 || h >= 21) return []; // de madrugada ninguém responde; às 8h sai o que acumulou
  const limite = agora.getTime() - MINUTOS_LEMBRETE * 60_000;
  const semana = agora.getTime() - 7 * 86_400_000;
  return leads.filter((l) => {
    const t = new Date(l.createdAt).getTime();
    return l.estagio === "novo" && !l.primeiroContatoEm && !l.lembreteEm && t <= limite && t >= semana;
  });
}

export function textosLembrete(leads: LeadNovoSite[]): { titulo: string; corpo: string; whatsapp: string } {
  const nomes = leads.map((l) => `${l.empresa || l.contatoNome}${l.segmento ? ` (${l.segmento})` : ""}`);
  const um = leads.length === 1;
  return {
    titulo: um ? `Lead do site sem resposta há mais de 1 h: ${nomes[0]}` : `${leads.length} leads do site sem resposta há mais de 1 h`,
    corpo: um ? "Está no topo do Comercial → Hoje, com a mensagem pronta." : `${nomes.join(", ")}. Estão no topo do Comercial → Hoje, com a mensagem pronta.`,
    whatsapp: um
      ? `Roberto, o lead ${nomes[0]} chegou pelo site há mais de 1 hora e ainda não teve resposta. A mensagem está pronta no painel: Comercial → Hoje.`
      : `Roberto, ${leads.length} leads do site estão sem resposta há mais de 1 hora: ${nomes.join(", ")}. As mensagens estão prontas no painel: Comercial → Hoje.`,
  };
}

// ─── 2. Cobrança da meta ───────────────────────────────────────────────

export interface LeadParaAviso extends LeadParaMeta {
  empresa: string | null;
  contatoNome: string;
}

export type MotivoAvisoMeta = "segunda" | "ritmo" | "marco";

const diaSemana = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = domingo

/** Quantos dias úteis seguidos (terminando ontem) o vendido ficou abaixo do ritmo linear da meta. */
export function diasAbaixoDoRitmo(leads: LeadParaMeta[], meta: number, hoje: string): number {
  const ym = hoje.slice(0, 7);
  const uteis = diasUteisDoMes(ym);
  const passados = uteis.filter((d) => d < hoje);
  const ganhos = leads.filter((l) => ehGanho(l) && l.fechadoEm && diaDe(l.fechadoEm).slice(0, 7) === ym);
  let seguidos = 0;
  for (let i = passados.length - 1; i >= 0; i--) {
    const d = passados[i];
    const vendidoAte = ganhos.filter((l) => diaDe(l.fechadoEm!) <= d).reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);
    const esperado = (meta * (i + 1)) / uteis.length;
    if (vendidoAte < esperado) seguidos++;
    else break;
  }
  return seguidos;
}
const ehGanho = (l: LeadParaMeta) => String(l.estagio) === "ganho";

/** Os negócios abertos que mais mexem no ponteiro: mensalidade × chance, fechando neste mês. */
export function quemMexeNoPonteiro<L extends LeadParaAviso>(leads: L[], hoje: string, n = 3): L[] {
  const ym = hoje.slice(0, 7);
  return leads
    .filter((l) => ehAberta(l.estagio) && (l.valorOrcamento ?? 0) > 0 && (!l.previsaoFechamento || diaDe(l.previsaoFechamento).slice(0, 7) === ym))
    .sort((a, b) => (b.valorOrcamento! * chanceDe(b)) - (a.valorOrcamento! * chanceDe(a)))
    .slice(0, n);
}

/** Marco do dia 10 e do dia 20: o primeiro dia útil a partir de cada um. */
export function ehMarco(hoje: string): boolean {
  const uteis = diasUteisDoMes(hoje.slice(0, 7));
  const marco = (dia: number) => uteis.find((d) => Number(d.slice(8, 10)) >= dia);
  return hoje === marco(10) || hoje === marco(20);
}

export interface AvisoMeta {
  motivo: MotivoAvisoMeta;
  titulo: string;
  corpo: string;
  whatsapp: string;
}

/**
 * O aviso de hoje (ou null). `paraFazerHoje` e `esfriando` vêm da fila do Hoje (lib/crm/hoje.ts) —
 * entram no resumo de segunda e no WhatsApp, que não leva valor.
 */
export function avisoDaMeta<L extends LeadParaAviso>(p: { leads: L[]; metaValor: number | null; hoje: string; paraFazerHoje: number; esfriando: number }): AvisoMeta | null {
  const dow = diaSemana(p.hoje);
  if (dow === 0 || dow === 6) return null;
  const r = calcularMeta({ leads: p.leads, metaValor: p.metaValor, hoje: p.hoje });
  const top = quemMexeNoPonteiro(p.leads, p.hoje);
  const nomesTop = top.map((l) => l.empresa || l.contatoNome);
  const topComValor = top.map((l) => `${l.empresa || l.contatoNome} (${brl(l.valorOrcamento!)}/mês · ${Math.round(chanceDe(l) * 100)}%)`);
  const linhaMeta = r.meta == null
    ? `Sem meta definida para o mês. Vendido: ${brl(r.vendido)} · pipeline ponderado: ${brl(r.ponderado)}.`
    : r.bateu
      ? `Meta batida: ${brl(r.vendido)} de ${brl(r.meta)}.`
      : `Faltam ${brl(r.falta!)} de ${brl(r.meta)} (${Math.round((r.progresso ?? 0) * 100)}% vendido)${r.ritmoNecessario != null ? ` · precisa de ${brl(r.ritmoNecessario)} por dia útil (${r.restantes} restantes)` : ""}${r.projecao != null ? ` · no ritmo atual: ${brl(r.projecao)}` : ""} · pipeline ponderado ${brl(r.ponderado)}${r.cobertura != null ? ` (cobre ${r.cobertura.toFixed(1).replace(".", ",")}×)` : ""}.`;
  const linhaTop = topComValor.length ? ` Mexem no ponteiro: ${topComValor.join("; ")}.` : "";
  const nomesWhats = nomesTop.length ? ` Os que mais mexem na meta: ${nomesTop.join(", ")}.` : "";

  if (dow === 1) {
    return {
      motivo: "segunda",
      titulo: "Comercial — semana começando",
      corpo: `${linhaMeta} Hoje: ${p.paraFazerHoje} contato(s) para fazer e ${p.esfriando} negócio(s) esfriando.${linhaTop}`,
      whatsapp: `Bom dia, Roberto. Comercial da semana: ${p.paraFazerHoje} contato(s) para fazer hoje e ${p.esfriando} negócio(s) esfriando.${nomesWhats} A meta e o ritmo estão no painel: Comercial → Hoje.`,
    };
  }
  if (r.meta == null || r.bateu) return null;
  const abaixo = diasAbaixoDoRitmo(p.leads, r.meta, p.hoje);
  if (abaixo >= 3 && abaixo % 3 === 0) {
    return {
      motivo: "ritmo",
      titulo: `Meta abaixo do ritmo há ${abaixo} dias úteis`,
      corpo: `${linhaMeta}${linhaTop}`,
      whatsapp: `Roberto, a meta do comercial está abaixo do ritmo há ${abaixo} dias úteis.${nomesWhats} Os números estão no painel: Comercial → Hoje.`,
    };
  }
  if (ehMarco(p.hoje) && r.projecao != null && r.projecao < 0.8 * r.meta) {
    return {
      motivo: "marco",
      titulo: `Dia ${p.hoje.slice(8, 10)}: a projeção está abaixo de 80% da meta`,
      corpo: `${linhaMeta}${linhaTop}`,
      whatsapp: `Roberto, pela projeção de hoje o comercial não chega a 80% da meta do mês.${nomesWhats} Os números estão no painel: Comercial → Hoje.`,
    };
  }
  return null;
}
