// lib/traffic/alarmes/sem-conversa.ts — ALARME "GASTOU SEM CONVERSA". Regras puras (o I/O mora em ./servidor).
//
// O caso (25/10/2026): a Reformar construção gastou ~R$ 497 de 22 a 25/10 sem receber UMA conversa (antes eram
// 7 a 31 por dia). O número do encarte estava errado. O Julio só perguntou no grupo 28 horas depois, por acaso.
// Nada no sistema avisava: a Defesa Ativa ignora dia com zero conversa (o custo por conversa fica vazio) e o
// "Desperdício" do diagnóstico exige 7 dias seguidos zerados.
//
// A REGRA, em código (sem IA):
//   1. Só campanhas DE MENSAGEM: as que trouxeram conversa nos 14 dias anteriores. Campanha de perfil ou de
//      tráfego nunca traz conversa e faria a conta parecer morta (Reformar, 17/10, "TRÁFEGO - PERFIL").
//   2. Só conta com amostra: 10 ou mais conversas nos 14 dias (fora o trecho zerado). Conta pequena erra demais.
//   3. Custo de referência = o MAIOR entre a meta do cliente (client_traffic_policy) e o custo real dos 14 dias.
//      O maior porque um custo subindo (criativo cansado) não pode virar "WhatsApp caiu".
//   4. Limite = max(R$ 30, 4 × custo de referência). Com 4× o custo normal, a chance de zero conversas por azar
//      fica abaixo de 2%.
//   5. Dispara um EPISÓDIO NOVO quando, sem nenhuma conversa hoje, (a) o gasto de hoje passa do limite, ou
//      (b) os dias FECHADOS seguidos sem conversa já passaram do limite. Só dias fechados em (b): somar a
//      madrugada de hoje ao dia anterior fazia o alarme das 8h tocar antes de o público acordar.
//   6. Episódio aberto relembra uma vez por dia, só com evidência DE HOJE (a). Fecha com 2 conversas.
//
// Calibrado em 25/10/2026 com 30 dias de gasto e conversa POR HORA das 46 contas (simulando as leituras de
// 2 em 2 h): 4 episódios em 17 dias, nenhum falso. Testado em tests/alarmes-sem-conversa.test.ts.

export const FATOR_CPL = 4;
export const PISO_RS = 30;
export const CONVERSAS_MIN_BASE = 10;
export const DIAS_BASE = 14;
/** Conversas no dia que encerram o episódio (uma só pode ser o resto de um clique antigo). */
export const CONVERSAS_PARA_FECHAR = 2;

/** Uma linha da Meta: uma campanha num dia. */
export interface DiaCampanha {
  data: string;
  campanhaId: string;
  gasto: number;
  conversas: number;
}

export interface LeituraSemConversa {
  elegivel: boolean;
  /** Por que não dá para julgar (sem campanha de mensagem, pouca amostra). */
  motivo: string | null;
  campanhasDeMensagem: number;
  conversasBase: number;
  cplRef: number | null;
  limite: number | null;
  gastoHoje: number;
  conversasHoje: number;
  /** Dias fechados seguidos, até ontem, com gasto e nenhuma conversa (o mais antigo primeiro). */
  diasZerados: string[];
  gastoDiasZerados: number;
  /** O que saiu sem conversa: hoje (se ainda não veio nenhuma) + os dias fechados zerados. */
  gastoSemConversa: number;
  /** Primeiro dia sem conversa do trecho atual ("YYYY-MM-DD"), ou null quando hoje já teve conversa. */
  desde: string | null;
  /** Conversas que o custo de referência faria esperar com o gasto sem conversa. */
  esperadas: number | null;
}

/** Dias "YYYY-MM-DD" de `ate - n` até `ate - 1` (o mais antigo primeiro). */
export function diasAntes(ate: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${ate}T12:00:00Z`); // meio-dia UTC: subtrair dias nunca atravessa a data por fuso
  for (let i = n; i >= 1; i--) {
    const x = new Date(d.getTime() - i * 86400000);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lerSemConversa(p: { linhas: DiaCampanha[]; hoje: string; cplMeta: number | null }): LeituraSemConversa {
  const janela = diasAntes(p.hoje, DIAS_BASE);
  const naJanela = new Set(janela);
  const mensagem = new Set(p.linhas.filter((l) => naJanela.has(l.data) && l.conversas > 0).map((l) => l.campanhaId));

  const porDia = new Map<string, { gasto: number; conversas: number }>();
  for (const l of p.linhas) {
    if (!mensagem.has(l.campanhaId)) continue;
    const d = porDia.get(l.data) ?? { gasto: 0, conversas: 0 };
    d.gasto += Number.isFinite(l.gasto) ? l.gasto : 0;
    d.conversas += Number.isFinite(l.conversas) ? l.conversas : 0;
    porDia.set(l.data, d);
  }
  const dia = (d: string) => porDia.get(d) ?? { gasto: 0, conversas: 0 };

  // Trecho zerado: de ontem para trás, dias com gasto e nenhuma conversa. Dia sem gasto (conta parada) não
  // quebra nem soma; o primeiro dia com conversa encerra.
  const zerados: string[] = [];
  let gastoZerados = 0;
  for (const d of [...janela].reverse()) {
    const x = dia(d);
    if (x.gasto <= 0) continue;
    if (x.conversas > 0) break;
    zerados.unshift(d);
    gastoZerados += x.gasto;
  }
  const foraDoTrecho = janela.filter((d) => !zerados.includes(d));
  const conversasBase = foraDoTrecho.reduce((s, d) => s + dia(d).conversas, 0);
  const gastoBase = foraDoTrecho.reduce((s, d) => s + dia(d).gasto, 0);
  const hoje = dia(p.hoje);

  const base = {
    campanhasDeMensagem: mensagem.size, conversasBase, gastoHoje: r2(hoje.gasto), conversasHoje: hoje.conversas,
    diasZerados: zerados, gastoDiasZerados: r2(gastoZerados),
  };
  const semConversa = hoje.conversas === 0 ? hoje.gasto + gastoZerados : 0;
  const desde = hoje.conversas > 0 ? null : (zerados[0] ?? p.hoje);

  if (mensagem.size === 0) {
    return { ...base, elegivel: false, motivo: "sem campanha de mensagem nos 14 dias", cplRef: null, limite: null, gastoSemConversa: r2(semConversa), desde, esperadas: null };
  }
  if (conversasBase < CONVERSAS_MIN_BASE) {
    return { ...base, elegivel: false, motivo: `só ${conversasBase} conversas em 14 dias`, cplRef: null, limite: null, gastoSemConversa: r2(semConversa), desde, esperadas: null };
  }
  const cplReal = gastoBase / conversasBase;
  const cplRef = Math.max(p.cplMeta != null && p.cplMeta > 0 ? p.cplMeta : 0, cplReal);
  const limite = Math.max(PISO_RS, FATOR_CPL * cplRef);
  return {
    ...base, elegivel: true, motivo: null, cplRef: r2(cplRef), limite: r2(limite),
    gastoSemConversa: r2(semConversa), desde, esperadas: Math.round((semConversa / cplRef) * 10) / 10,
  };
}

export type DecisaoSemConversa = "novo" | "lembrete" | "fechar" | null;

/**
 * O que fazer com a leitura. `aberto` = existe episódio sem conversa ainda não resolvido desta conta.
 * "lembrete" só sai uma vez por dia — quem chama garante (o evento é único por conta e dia).
 */
export function decidirSemConversa(l: LeituraSemConversa, aberto: boolean): DecisaoSemConversa {
  if (l.conversasHoje >= CONVERSAS_PARA_FECHAR) return aberto ? "fechar" : null;
  if (!l.elegivel || l.limite === null || l.conversasHoje > 0) return null;
  const pelaHoje = l.gastoHoje >= l.limite;
  const pelosDiasFechados = l.gastoDiasZerados >= l.limite;
  if (!aberto) return pelaHoje || pelosDiasFechados ? "novo" : null;
  return pelaHoje ? "lembrete" : null;
}

// ── Textos ────────────────────────────────────────────────────────────────────

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export interface ContaSemConversa {
  nome: string;
  leitura: LeituraSemConversa;
  decisao: "novo" | "lembrete";
  hoje: string;
  /** "@5522…" quando o gestor tem número (menção de verdade), senão o primeiro nome. */
  gestorTrecho: string;
}

/** "gastou R$ 40 hoje" · "R$ 214 desde 22/10" — o pedaço que diz quanto saiu e desde quando. */
export function quantoDesde(c: Pick<ContaSemConversa, "leitura" | "hoje">): string {
  const l = c.leitura;
  return !l.desde || l.desde === c.hoje
    ? `gastou ${brl0(l.gastoSemConversa)} hoje`
    : `gastou ${brl0(l.gastoSemConversa)} desde ${dataCurta(l.desde)}`;
}

/** Uma linha por conta: quanto saiu, o que seria normal e de quem é. */
export function linhaSemConversa(c: ContaSemConversa): string {
  const l = c.leitura;
  const normal = l.esperadas != null && l.esperadas >= 1 ? ` (o normal seria ~${Math.round(l.esperadas)}, a ${brl2(l.cplRef ?? 0)} cada)` : "";
  const prefixo = c.decisao === "lembrete" ? "continua sem conversa: " : "";
  return `• *${c.nome}* ${prefixo}${quantoDesde(c)} e nenhuma conversa${normal}${c.gestorTrecho ? ` · ${c.gestorTrecho}` : ""}`;
}

/** A mensagem do grupo de tráfego. Quem gastou mais sem conversa primeiro. */
export function textoSemConversa(contas: ContaSemConversa[], hora: string): string {
  const linhas = [...contas].sort((a, b) => b.leitura.gastoSemConversa - a.leitura.gastoSemConversa).map(linhaSemConversa);
  const titulo = contas.length === 1
    ? "*Conta gastando sem receber conversa*"
    : `*${contas.length} contas gastando sem receber conversa*`;
  return [
    `${titulo} (leitura das ${hora})`,
    "",
    ...linhas,
    "",
    "Confira o WhatsApp do anúncio: número certo, WhatsApp Business ainda ligado à página, anúncio levando para a conversa. Se o problema for do cliente, vale pausar as campanhas de mensagem até resolver.",
  ].join("\n");
}

/** O que a voz fala (curto: é a primeira coisa que a pessoa ouve). */
export function falaSemConversa(nome: string, c: Pick<ContaSemConversa, "leitura" | "hoje">): { titulo: string; corpo: string } {
  const l = c.leitura;
  const reais = Math.max(1, Math.round(l.gastoSemConversa));
  const quando = !l.desde || l.desde === c.hoje ? "hoje" : `desde o dia ${Number(l.desde.slice(8, 10))}`;
  return {
    titulo: `${nome} gastou ${reais} reais ${quando} sem nenhuma conversa`,
    corpo: "Vale conferir o WhatsApp do anúncio agora.",
  };
}
