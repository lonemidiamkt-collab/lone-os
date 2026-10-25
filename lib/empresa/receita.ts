// lib/empresa/receita.ts — o que a Receita Federal (via BrasilAPI) diz da empresa, e a faixa de
// faturamento que o próprio cliente declara.
//
// POR QUE (18/10/2026). Roberto, a partir da dica de um cliente: no cadastro pelo link, puxar
// primeiro o CNPJ — a BrasilAPI devolve razão social, nome fantasia, endereço e as atividades (CNAE),
// e o CNAE já sugere o nicho. E perguntar a faixa de faturamento, para saber em que faixas os clientes
// que fecham com a Lone costumam estar e mirar o tráfego da própria Lone nelas.
//
// Dois cuidados que separam dado de palpite:
//  - a Receita NÃO informa faturamento. O PORTE (MEI, ME, EPP, Demais) é enquadramento legal com
//    teto anual — serve de pista, nunca de faturamento. Por isso porte e faixa declarada são campos
//    separados, e a tela nunca deduz um do outro;
//  - o nicho vindo do CNAE é SUGESTÃO: o cliente confirma ou troca. CNAE errado ou genérico
//    ("comércio varejista de mercadorias em geral") é comum.
//
// Puro (sem rede, sem banco). Testado em tests/empresa-receita.test.ts.

import { normalizarNicho, ROTULO_NICHO, type Nicho } from "@/lib/cs/nicho";

// ── Faixa de faturamento (declarada pelo cliente) ───────────────────────────
export const FAIXAS_FATURAMENTO = [
  { chave: "ate_30k", rotulo: "Até R$ 30 mil" },
  { chave: "30k_50k", rotulo: "R$ 30 mil a R$ 50 mil" },
  { chave: "50k_100k", rotulo: "R$ 50 mil a R$ 100 mil" },
  { chave: "100k_200k", rotulo: "R$ 100 mil a R$ 200 mil" },
  { chave: "200k_500k", rotulo: "R$ 200 mil a R$ 500 mil" },
  { chave: "acima_500k", rotulo: "Acima de R$ 500 mil" },
  { chave: "nao_informado", rotulo: "Prefiro não informar" },
] as const;

export type FaixaFaturamento = (typeof FAIXAS_FATURAMENTO)[number]["chave"];

export function faixaValida(v: unknown): v is FaixaFaturamento {
  return typeof v === "string" && FAIXAS_FATURAMENTO.some((f) => f.chave === v);
}

export function rotuloFaixa(v: string | null | undefined): string | null {
  return FAIXAS_FATURAMENTO.find((f) => f.chave === v)?.rotulo ?? null;
}

// ── Porte (enquadramento na Receita) ────────────────────────────────────────
export type Porte = "MEI" | "ME" | "EPP" | "DEMAIS";

export const PORTES: Record<Porte, { rotulo: string; teto: string }> = {
  MEI: { rotulo: "Microempreendedor individual (MEI)", teto: "receita bruta anual de até R$ 81 mil" },
  ME: { rotulo: "Microempresa (ME)", teto: "receita bruta anual de até R$ 360 mil" },
  EPP: { rotulo: "Empresa de pequeno porte (EPP)", teto: "receita bruta anual de R$ 360 mil a R$ 4,8 milhões" },
  DEMAIS: { rotulo: "Demais (acima de EPP ou sem enquadramento)", teto: "sem teto definido pelo enquadramento" },
};

export function porteValido(v: unknown): v is Porte {
  return typeof v === "string" && v in PORTES;
}

/** MEI vem como flag à parte (opcao_pelo_mei) — a coluna porte diz "MICRO EMPRESA" para ele. */
export function porteDaReceita(porte: unknown, mei?: unknown): Porte | null {
  if (mei === true) return "MEI";
  const p = String(porte ?? "").toUpperCase();
  if (/MICRO/.test(p)) return "ME";
  if (/PEQUENO/.test(p)) return "EPP";
  if (/DEMAIS/.test(p)) return "DEMAIS";
  return null;
}

// ── CNAE → nicho ────────────────────────────────────────────────────────────

/** 4744099 → "4744-0/99" (o formato que aparece no cartão CNPJ). */
export function formatarCnae(codigo: unknown): string | null {
  const d = String(codigo ?? "").replace(/\D/g, "");
  if (d.length !== 7) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`;
}

// Códigos que a descrição sozinha classifica mal. Por prefixo (classe ou subclasse), do mais longo
// para o mais curto: "Instalação e manutenção elétrica" é onde a maioria das empresas de energia
// solar está registrada, mas pela descrição cairia em construção — fica sem palpite e o cliente marca.
const CNAE_FIXO: { prefixo: string; nicho: Nicho | null }[] = [
  { prefixo: "3511", nicho: "energia_solar" },      // geração de energia elétrica
  { prefixo: "4321", nicho: null },                 // instalação elétrica: solar OU obra — não chuta
  { prefixo: "4774", nicho: "otica" },              // comércio varejista de artigos de óptica
  { prefixo: "4789004", nicho: "pet" },             // comércio varejista de animais vivos e artigos para animais
  { prefixo: "7500", nicho: "pet" },                // atividades veterinárias
  { prefixo: "6810", nicho: "imobiliario" },
  { prefixo: "6821", nicho: "imobiliario" },
  { prefixo: "6822", nicho: "imobiliario" },
  { prefixo: "6511", nicho: "seguros" },
  { prefixo: "6512", nicho: "seguros" },
  { prefixo: "6622", nicho: "seguros" },             // corretores e agentes de seguros
  { prefixo: "9313", nicho: "fitness" },             // academias
  { prefixo: "4754", nicho: "movelaria" },           // móveis, colchoaria, iluminação
  { prefixo: "3101", nicho: "movelaria" },           // fabricação de móveis
  { prefixo: "3102", nicho: "movelaria" },
  { prefixo: "3103", nicho: "movelaria" },
  { prefixo: "3104", nicho: "movelaria" },
];

/** Nicho de UMA atividade: tabela de códigos primeiro, descrição depois. undefined = sem opinião. */
function nichoDaAtividade(codigo: unknown, descricao: unknown): Nicho | null | undefined {
  const d = String(codigo ?? "").replace(/\D/g, "");
  const fixo = [...CNAE_FIXO].sort((a, b) => b.prefixo.length - a.prefixo.length).find((f) => d.startsWith(f.prefixo));
  if (fixo) return fixo.nicho;
  const n = normalizarNicho(String(descricao ?? ""));
  return n ?? undefined;
}

const GENERICO = new Set<Nicho>(["varejo", "outro"]);

/**
 * O nicho sugerido pelas atividades da empresa. A principal manda; se ela for genérica (varejo,
 * outro) ou ambígua, a primeira secundária específica decide — uma loja registrada como "comércio
 * varejista de mercadorias em geral" com secundária de material de construção é de construção.
 */
export function nichoPorCnae(
  principal: { codigo?: unknown; descricao?: unknown },
  secundarias: { codigo?: unknown; descricao?: unknown }[] = [],
): Nicho | null {
  const p = nichoDaAtividade(principal.codigo, principal.descricao);
  if (p && !GENERICO.has(p)) return p;
  for (const s of secundarias) {
    const n = nichoDaAtividade(s.codigo, s.descricao);
    if (n && !GENERICO.has(n)) return n;
  }
  // "Outro" não é sugestão: preencher o nicho com ele só esconde que ninguém escolheu (Horto Naenc,
  // atividades paisagísticas, 19/10). Sem palpite útil, o campo fica vazio para o cliente escolher.
  return p && p !== "outro" ? p : null;
}

// ── A resposta da BrasilAPI, limpa ──────────────────────────────────────────

export interface EmpresaReceita {
  cnpj: string;                  // só dígitos
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;       // "ATIVA", "BAIXADA", "INAPTA"...
  ativa: boolean;
  situacaoDesde: string | null;  // "2026-09-21" — desde quando está assim
  motivoSituacao: string | null; // "Extinção por encerramento liquidação voluntária"
  cnaePrincipal: string | null;  // "4744-0/99"
  cnaeDescricao: string | null;
  cnaesSecundarios: { codigo: string; descricao: string }[];
  porte: Porte | null;
  capitalSocial: number | null;
  inicioAtividade: string | null;
  telefone: string | null;       // "(22) 2665-1234"
  /** Rua SEM o número (desde 24/10/2026 o número e o complemento vêm separados, para os campos próprios do cadastro). */
  endereco: { cep: string | null; rua: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null };
  nicho: Nicho | null;
  nichoRotulo: string | null;
}

const PALAVRAS_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no"]);

/** "RUA DOS PINHEIROS" → "Rua dos Pinheiros". A Receita grava tudo em caixa alta. */
export function capitalizar(s: unknown): string | null {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.toLowerCase().split(" ").map((p, i) =>
    i > 0 && PALAVRAS_MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1),
  ).join(" ");
}

/** "EXTINCAO POR ENCERRAMENTO" → "Extincao por encerramento" (só a primeira maiúscula; "SEM MOTIVO" vira nulo). */
function capitalizarFrase(v: unknown): string | null {
  const t = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!t || /^sem motivo$/i.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function telefoneDe(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return null;
}

function cepDe(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
}

/** Converte a resposta crua de GET brasilapi.com.br/api/cnpj/v1/{cnpj}. */
export function empresaDaBrasilApi(r: Record<string, unknown>): EmpresaReceita {
  const sec = Array.isArray(r.cnaes_secundarios) ? (r.cnaes_secundarios as { codigo?: unknown; descricao?: unknown }[]) : [];
  const secundarios = sec
    .map((s) => ({ codigo: formatarCnae(s.codigo) ?? "", descricao: String(s.descricao ?? "").trim() }))
    .filter((s) => s.codigo && s.descricao);
  const nicho = nichoPorCnae({ codigo: r.cnae_fiscal, descricao: r.cnae_fiscal_descricao }, sec);
  const tipo = capitalizar(r.descricao_tipo_de_logradouro);
  const logradouro = capitalizar(r.logradouro);
  const numeroCru = String(r.numero ?? "").trim().toUpperCase();
  const numero = !numeroCru ? null : /^S\/?N$/.test(numeroCru) ? "S/N" : numeroCru;
  const rua = logradouro ? `${tipo && !logradouro.toLowerCase().startsWith(tipo.toLowerCase()) ? `${tipo} ` : ""}${logradouro}` : null;
  const situacao = r.descricao_situacao_cadastral ? String(r.descricao_situacao_cadastral).toUpperCase() : null;
  const capital = Number(r.capital_social);
  return {
    cnpj: String(r.cnpj ?? "").replace(/\D/g, ""),
    razaoSocial: String(r.razao_social ?? "").trim() || null,
    nomeFantasia: String(r.nome_fantasia ?? "").trim() || null,
    situacao,
    ativa: situacao === "ATIVA",
    situacaoDesde: typeof r.data_situacao_cadastral === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.data_situacao_cadastral) ? r.data_situacao_cadastral : null,
    motivoSituacao: capitalizarFrase(r.descricao_motivo_situacao_cadastral),
    cnaePrincipal: formatarCnae(r.cnae_fiscal),
    cnaeDescricao: String(r.cnae_fiscal_descricao ?? "").trim() || null,
    cnaesSecundarios: secundarios,
    porte: porteDaReceita(r.porte, r.opcao_pelo_mei),
    capitalSocial: Number.isFinite(capital) ? capital : null,
    inicioAtividade: typeof r.data_inicio_atividade === "string" ? r.data_inicio_atividade : null,
    telefone: telefoneDe(r.ddd_telefone_1),
    endereco: {
      cep: cepDe(r.cep), rua, numero, complemento: capitalizar(r.complemento), bairro: capitalizar(r.bairro), cidade: capitalizar(r.municipio),
      uf: r.uf ? String(r.uf).toUpperCase() : null,
    },
    nicho,
    nichoRotulo: nicho ? ROTULO_NICHO[nicho] : null,
  };
}

/** Dígitos verificadores do CNPJ (a Receita responde 400 para CNPJ que não fecha a conta). */
export function cnpjValido(v: unknown): boolean {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => {
    const r = base.split("").reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(d.slice(0, 12), p1) === Number(d[12]) && dv(d.slice(0, 13), p2) === Number(d[13]);
}

/** As colunas que a consulta grava (clients e client_onboarding_submissions têm as mesmas). */
export function colunasDaReceita(e: EmpresaReceita, agora = new Date()) {
  return {
    porte_receita: e.porte,
    cnae_principal: e.cnaePrincipal,
    cnae_descricao: e.cnaeDescricao,
    cnaes_secundarios: e.cnaesSecundarios,
    capital_social: e.capitalSocial,
    situacao_cadastral: e.situacao,
    receita_consultada_em: agora.toISOString(),
  };
}
