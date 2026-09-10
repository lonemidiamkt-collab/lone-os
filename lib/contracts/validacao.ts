// lib/contracts/validacao.ts — AUDITORIA DO CONTRATO ANTES DE GERAR.
//
// Roberto, 10/09/2026, sobre o contrato do Max (Celmapel Festas): "a empresa contratante é Marinho
// e Braga Comércio de Artigos de Festas Ltda, mas o segmento foi preenchido como Construção Civil.
// Pelo próprio nome do arquivo e da razão social, isso parece ter sido herdado do contrato anterior."
//
// Fui olhar o banco: o contrato não herdou nada. `clients.nicho` do Max está gravado como
// "Construção Civil" e `industry` como "Tecnologia" — o cadastro é que está errado, e o gerador
// imprimiu fielmente. Isso muda o remédio: não adianta instruir o gerador a "não herdar dados", tem
// que RECUSAR o contrato quando o dado do cadastro contradiz a razão social.
//
// Implementa o §48 (10 ERRO_CRITICO, que bloqueiam) e o §49 (alertas de revisão, que avisam) do
// TREINAMENTO MESTRE. Funções puras: recebem os dados já resolvidos, não tocam banco nem rede.

export type Gravidade = "bloqueio" | "revisao";

export interface Achado {
  codigo: string;
  gravidade: Gravidade;
  mensagem: string;
}

export interface ClausulaTexto { title: string; body: string }

export interface EntradaValidacao {
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj?: string | null;
  segmento?: string | null;
  enderecoRua?: string | null;
  enderecoNumero?: string | null;
  cidade?: string | null;
  representante?: string | null;
  cargo?: string | null;
  cpf?: string | null;
  email?: string | null;
  tipoServico: string;
  valorMensal?: number | null;
  diaPagamento?: number | null;
  duracaoMeses?: number | null;
  /** Mesmo domínio de lib/contracts/contratoPdf.ts: ciclos trimestrais ou prazo determinado. */
  modalidade?: "ciclos" | "determinado";
  clausulas: ClausulaTexto[];
}

const TIPOS_VALIDOS = ["assessoria_trafego", "assessoria_social", "lone_growth", "trafego_social_site", "site", "ia_automacao", "crm_software"];

// ── Nomes de PACOTE que não são ramo de atividade. `clients.industry` guarda o pacote em 30 dos 52
// cadastros ativos ("Lone Growth" em 24), então cair nele pro segmento escreve besteira no contrato.
const PACOTES = /^(lone growth|tr[áa]fego pago|trafego pago|social media|designer|assessoria|grava[çc][ãa]o de conte[úu]dos|outro|n\/a|-+)$/i;

// ── Famílias de atividade. Se a RAZÃO SOCIAL diz uma coisa e o SEGMENTO diz outra, é dado herdado
// ou cadastro copiado — o erro do Celmapel.
const FAMILIAS: Record<string, RegExp> = {
  festas: /\b(festas?|artigos para festas|descart[áa]veis|embalagens)\b/i,
  construcao: /\b(constru[çc][ãa]o|material de constru[çc][ãa]o|cimento|pisos?|revestimentos?|tintas?|ferragens?|madeireira|marmoraria)\b/i,
  alimentacao: /\b(restaurante|pizzaria|lanchonete|padaria|a[çc]a[íi]|hamburgueria|alimentos|distribuidora de bebidas)\b/i,
  saude: /\b(farm[áa]cia|manipula[çc][ãa]o|cl[íi]nica|odonto|odontol[óo]gic|est[ée]tica|fisioterapia|laborat[óo]rio)\b/i,
  automotivo: /\b(auto pe[çc]as|autope[çc]as|ve[íi]culos?|pneus?|oficina|funilaria|lava\s?jato)\b/i,
  moda: /\b(confec[çc][õo]es|moda|vestu[áa]rio|cal[çc]ados?|boutique|[óo]tica)\b/i,
  moveis: /\b(m[óo]veis|decora[çc][õo]es|decora[çc][ãa]o|estofados|colch[õo]es)\b/i,
  suplementos: /\b(suplementos?|nutri[çc][ãa]o|nutracêutic)\b/i,
  imobiliario: /\b(im[óo]veis|imobili[áa]ri|incorporadora|loteamento)\b/i,
  energia: /\b(energia solar|fotovoltaic|solar)\b/i,
  tecnologia: /\b(tecnologia|software|sistemas|inform[áa]tica|ti\b)\b/i,
  educacao: /\b(escola|col[ée]gio|cursos?|educa[çc]ional|idiomas)\b/i,
  pet: /\b(pet\s?shop|petshop|veterin[áa]ri|agropecu[áa]ri)\b/i,
};

/** Famílias de atividade que o texto sugere. Vazio = não deu pra dizer. */
export function familias(texto: string): string[] {
  const t = texto ?? "";
  return Object.entries(FAMILIAS).filter(([, rx]) => rx.test(t)).map(([k]) => k);
}

// ── Vocabulário de escopo, para as auditorias 004/005/006.
const RX_SOCIAL = /\b(social media|artes?\b|reels?|carrossel|feed|stories|legendas?|calend[áa]rio editorial|postagens?)\b/i;
const RX_TRAFEGO = /\b(meta ads|google ads|facebook ads|gerenciador de an[úu]ncios|campanhas? de an[úu]ncio|tr[áa]fego pago|verba de an[úu]ncios?)\b/i;
const RX_CICLO_TRIMESTRAL = /\bciclos? (?:sucessivos? )?de (?:tr[êe]s|3) (?:meses|m[êe]s)\b/i;

const so = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
const norm = (s: string) => so(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Valores em reais citados no corpo de uma cláusula. */
export function valoresCitados(texto: string): number[] {
  const out: number[] = [];
  const rx = /R\$\s*([\d.]+,\d{2}|\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(texto))) {
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/** Dias de vencimento citados ("todo dia 10", "até o dia 05"). */
export function diasCitados(texto: string): number[] {
  const out: number[] = [];
  const rx = /\bdia\s+(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(texto))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 31) out.push(n);
  }
  return out;
}

/**
 * Roda as 4 auditorias do §43 e devolve os achados. `bloqueio` impede a geração; `revisao` deixa
 * gerar mas exige olhada humana. Ordem: bloqueios primeiro.
 */
export function validarContrato(e: EntradaValidacao): Achado[] {
  const achados: Achado[] = [];
  const bloqueio = (codigo: string, mensagem: string) => achados.push({ codigo, gravidade: "bloqueio", mensagem });
  const revisao = (codigo: string, mensagem: string) => achados.push({ codigo, gravidade: "revisao", mensagem });

  const corpoTudo = e.clausulas.map((c) => `${c.title}\n${c.body}`).join("\n");

  // ── AUDITORIA 2 — COMERCIAL
  if (!e.tipoServico || !TIPOS_VALIDOS.includes(e.tipoServico)) {
    bloqueio("ERRO_CRITICO_001", `Serviço não identificado ("${e.tipoServico || "vazio"}").`);
  }
  if (!e.valorMensal || e.valorMensal <= 0) {
    bloqueio("ERRO_CRITICO_002", "Valor mensal ausente ou zerado.");
  }
  if (!e.duracaoMeses || e.duracaoMeses <= 0) {
    bloqueio("ERRO_CRITICO_003", "Prazo ausente.");
  } else if (e.modalidade === "ciclos" && e.duracaoMeses && e.duracaoMeses % 3 !== 0) {
    bloqueio("ERRO_CRITICO_003", `Prazo contraditório: modalidade em ciclos trimestrais com ${e.duracaoMeses} meses.`);
  }

  // ── AUDITORIA 3 — ESCOPO. O contrato só pode conter o que foi vendido.
  if (e.tipoServico === "assessoria_trafego" && RX_SOCIAL.test(corpoTudo)) {
    bloqueio("ERRO_CRITICO_004", "Contrato só de tráfego contém cláusula de Social Media.");
  }
  if (e.tipoServico === "assessoria_social" && RX_TRAFEGO.test(corpoTudo)) {
    bloqueio("ERRO_CRITICO_005", "Contrato só de Social Media contém cláusula de tráfego pago.");
  }
  if (e.tipoServico === "site" && e.modalidade !== "ciclos" && RX_CICLO_TRIMESTRAL.test(corpoTudo)) {
    bloqueio("ERRO_CRITICO_006", "Contrato de site com renovação trimestral sem que ela tenha sido contratada.");
  }

  // ── AUDITORIA 1 — DADOS. O erro do Celmapel mora aqui.
  const seg = so(e.segmento ?? "");
  if (seg && PACOTES.test(seg)) {
    bloqueio("ERRO_CRITICO_007", `Segmento "${seg}" é o nome do PACOTE contratado, não o ramo do cliente. Corrija o campo Nicho no cadastro.`);
  } else if (seg) {
    const fRazao = familias(`${e.razaoSocial} ${e.nomeFantasia ?? ""}`);
    const fSeg = familias(seg);
    if (fRazao.length && fSeg.length && !fSeg.some((f) => fRazao.includes(f))) {
      bloqueio("ERRO_CRITICO_007",
        `Segmento "${seg}" não bate com a razão social "${so(e.razaoSocial)}". Parece dado herdado de outro contrato.`);
    }
  }
  if (!seg) revisao("REVISAO_SEGMENTO", "Segmento da CONTRATANTE não preenchido no cadastro.");

  // ── AUDITORIA 4 — JURÍDICA: quadro-resumo x cláusula financeira.
  if (e.valorMensal && e.valorMensal > 0) {
    const outros = valoresCitados(corpoTudo).filter((v) => Math.abs(v - e.valorMensal!) > 0.009);
    // Verba de anúncios e multa aparecem legitimamente com outro valor; só acusa quando a cláusula
    // que fala de mensalidade cita um valor diferente.
    const financeiras = e.clausulas.filter((c) => /mensal|pagamento|remunera|valor/i.test(`${c.title} ${c.body}`));
    const conflito = financeiras.flatMap((c) => valoresCitados(c.body)).filter((v) => Math.abs(v - e.valorMensal!) > 0.009);
    if (conflito.length) {
      bloqueio("ERRO_CRITICO_008", `Quadro-resumo diz R$ ${e.valorMensal.toFixed(2)} mas a cláusula financeira cita R$ ${conflito[0].toFixed(2)}.`);
    } else if (outros.length) {
      revisao("REVISAO_VALOR", `Há outro valor no contrato (R$ ${outros[0].toFixed(2)}) — confira se é verba de anúncios ou multa.`);
    }
  }
  if (e.diaPagamento) {
    const financeiras = e.clausulas.filter((c) => /vencimento|pagamento|mensal/i.test(`${c.title} ${c.body}`));
    const conflito = financeiras.flatMap((c) => diasCitados(c.body)).filter((d) => d !== e.diaPagamento);
    if (conflito.length) {
      bloqueio("ERRO_CRITICO_009", `Vencimento no dia ${e.diaPagamento} no quadro-resumo, mas a cláusula fala em dia ${conflito[0]}.`);
    }
  }
  if (e.duracaoMeses && e.modalidade === "ciclos" && !RX_CICLO_TRIMESTRAL.test(corpoTudo)) {
    revisao("REVISAO_PRAZO", "Modalidade em ciclos trimestrais mas nenhuma cláusula descreve o ciclo de três meses.");
  }

  // ── §49 — ALERTAS DE QUALIDADE
  const rua = so(e.enderecoRua ?? "");
  const temNumero = !!so(e.enderecoNumero ?? "") || /\d/.test(rua);
  if (rua && !temNumero) {
    revisao("REVISAO_ENDERECO", `Endereço sem número: "${rua}". Confira no cadastro/CNPJ antes da assinatura.`);
  }
  if (!so(e.cargo ?? "")) revisao("REVISAO_CARGO", "Representante sem cargo informado.");
  if (!so(e.email ?? "")) revisao("REVISAO_EMAIL", "E-mail da CONTRATANTE não informado.");

  // Cláusula duplicada — o mesmo corpo aparecendo duas vezes.
  const vistos = new Map<string, string>();
  for (const c of e.clausulas) {
    const chave = norm(c.body).slice(0, 160);
    if (!chave) continue;
    const antes = vistos.get(chave);
    if (antes) revisao("REVISAO_DUPLICADA", `Cláusulas "${antes}" e "${c.title}" têm o mesmo texto.`);
    else vistos.set(chave, c.title);
  }

  return achados.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === "bloqueio" ? -1 : 1));
}

/** Só os que impedem a geração. */
export function bloqueios(achados: Achado[]): Achado[] {
  return achados.filter((a) => a.gravidade === "bloqueio");
}

/**
 * Trecho para colar na legenda do PDF. §50 do treinamento pede "ALERTAS: nenhum" explícito — dizer
 * que não há alerta vale tanto quanto listar os que há: sem isso ninguém sabe se a auditoria rodou.
 */
export function avisosDaAuditoria(achados?: Achado[]): string {
  const revisoes = (achados ?? []).filter((a) => a.gravidade === "revisao");
  if (!revisoes.length) return "\n\n✅ _Auditoria: nenhum alerta._";
  return `\n\n⚠️ _Auditoria — confira antes de assinar:_\n${revisoes.map((a) => `• ${a.mensagem}`).join("\n")}`;
}
