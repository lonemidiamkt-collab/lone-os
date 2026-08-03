// lib/processos/redator.ts — a IA que transforma texto corrido em PROCESSO no padrão da Lone.
//
// O problema que resolve: o "como se faz" está na cabeça dos sócios. Pedir pro time "documentar"
// devolve parágrafo solto — "acompanhar as campanhas", "otimizar quando necessário" — que ninguém
// consegue executar e nada consegue medir. Aqui a pessoa descreve do jeito que sabe e a IA devolve
// no contrato: dono, entrada, passo, decisão, SLA, evidência, KPI.
//
// A IA NÃO tem a palavra final. Todo rascunho passa por `validarProcesso()` antes de virar linha no
// banco, e nasce sempre em `draft` — publicar é decisão humana (gestão). Guarda-corpos no mesmo
// espírito de lib/cs/mensagem-cliente.ts, onde a revisão com dado real derrubou 5 furos que
// nenhum teste sintético pegaria.
//
// Base: SKILL.md §6 (contrato mínimo), §7 (escrita operacional) e §12 (antipadrões).

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";

export type AreaProcesso = "social" | "traffic" | "cs" | "comercial" | "geral";
export type TipoDoc = "processo" | "playbook" | "sop" | "checklist" | "politica" | "template";

export interface PassoRascunho {
  seq: number;
  titulo: string;
  instrucao: string;
  papel: string | null;
  sistema: string | null;
  slaMinutos: number | null;
  evidencia: string | null;
  decisao: string | null;
  opcional: boolean;
}

export interface ProcessoRascunho {
  titulo: string;
  objetivo: string;
  problema: string;
  escopo: string;
  foraDeEscopo: string;
  gatilho: string;
  frequencia: string;
  preRequisitos: string;
  entradas: string;
  saidas: string;
  criterioPronto: string;
  criteriosQualidade: string;
  sla: string;
  /** Opcional: a quem recorrer quando o processo trava. O responsável de cada passo é que manda. */
  donoPapel?: string;
  passos: PassoRascunho[];
  kpis: { nome: string; definicao: string; fonte: string; meta: string; acaoAbaixo: string }[];
  riscos: { risco: string; controle: string; escalonamento: string }[];
  excecoes: { situacao: string; tratamento: string; escalonarPara: string }[];
}

// ── Vocabulário da casa ──────────────────────────────────────────────────────
// PAPEL DE PROCESSO ≠ PAPEL DE LOGIN. O sistema autentica admin/manager/traffic/social/designer/
// comercial (lib/api/require-role.ts), mas quem executa um processo inclui gente sem acesso ao
// painel: o EDITOR de vídeo (playbook §7, "Fluxo com Designer e Editor") e o próprio CLIENTE, que
// aprova arte. Amarrar processo aos papéis de login deixaria esses passos órfãos.
//
// A IA não pode inventar cargo fora desta lista, nem usar nome de pessoa — gente entra e sai, o
// papel fica (antipadrão SKILL.md §12).
export const PAPEIS = [
  "admin", "gestor", "trafego", "social", "designer", "editor", "comercial", "cliente",
] as const;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "objetivo", "problema", "escopo", "foraDeEscopo", "gatilho", "frequencia",
    "preRequisitos", "entradas", "saidas", "criterioPronto", "criteriosQualidade", "sla",
    "passos", "kpis", "riscos", "excecoes"],
  properties: {
    titulo: { type: "string" }, objetivo: { type: "string" }, problema: { type: "string" },
    escopo: { type: "string" }, foraDeEscopo: { type: "string" }, gatilho: { type: "string" },
    frequencia: { type: "string" }, preRequisitos: { type: "string" }, entradas: { type: "string" },
    saidas: { type: "string" }, criterioPronto: { type: "string" }, criteriosQualidade: { type: "string" },
    sla: { type: "string" }, donoPapel: { type: "string" },
    passos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["seq", "titulo", "instrucao", "papel", "sistema", "slaMinutos", "evidencia", "decisao", "opcional"],
        properties: {
          seq: { type: "integer" }, titulo: { type: "string" }, instrucao: { type: "string" },
          papel: { type: ["string", "null"] }, sistema: { type: ["string", "null"] },
          slaMinutos: { type: ["integer", "null"] }, evidencia: { type: ["string", "null"] },
          decisao: { type: ["string", "null"] }, opcional: { type: "boolean" },
        },
      },
    },
    kpis: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["nome", "definicao", "fonte", "meta", "acaoAbaixo"],
        properties: { nome: { type: "string" }, definicao: { type: "string" }, fonte: { type: "string" }, meta: { type: "string" }, acaoAbaixo: { type: "string" } },
      },
    },
    riscos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["risco", "controle", "escalonamento"],
        properties: { risco: { type: "string" }, controle: { type: "string" }, escalonamento: { type: "string" } },
      },
    },
    excecoes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["situacao", "tratamento", "escalonarPara"],
        properties: { situacao: { type: "string" }, tratamento: { type: "string" }, escalonarPara: { type: "string" } },
      },
    },
  },
};

const SYSTEM = `Você é Arquiteto Sênior de Processos de uma assessoria de marketing e vendas
(Lone Mídia: tráfego pago, social media estratégico, criativos, CRM e CS). Transforma conhecimento
solto em processo que uma PESSOA NOVA consegue executar sem perguntar pro dono da agência.

# Como escrever cada passo
Verbo + objeto + onde se faz + condição + o que comprova.

RUIM:  "Analisar a campanha e otimizar."
BOM:   "Toda segunda, o gestor de tráfego compara custo por resultado, volume e distribuição de
        verba no Gerenciador da Meta; registra a hipótese no log de otimização ANTES de alterar
        orçamento, criativo ou público. Evidência: hipótese registrada com data."

# Regras duras
- Todo passo tem PAPEL responsável e EVIDÊNCIA de conclusão. Passo sem isso não acontece.
- Papel é CARGO, nunca nome de pessoa. Use apenas: admin, gestor, trafego, social, designer,
  editor, comercial, cliente.
  · designer = arte estática, identidade visual
  · editor   = vídeo/Reels (corte, legenda, trilha)
  · cliente  = quando o passo depende do cliente (aprovar arte, mandar promoção, gravar vídeo)
- Frequência é data ou cadência real ("toda segunda", "no dia 20", "a cada entrega"), nunca
  "periodicamente" ou "quando necessário".
- Todo KPI tem fonte do dado, meta e o que fazer quando fica abaixo. Métrica sem ação é enfeite.
- Toda exceção relevante tem tratamento e pra quem escala.
- Se a informação não foi dada, escreva "A DEFINIR: <o que falta>". NUNCA invente política,
  preço, prazo ou ferramenta que não foi mencionada.
- Separe execução de aprovação: não misture no mesmo passo quem faz e quem aprova.

# Proibido
- "acompanhar", "otimizar", "melhorar", "monitorar" sem frequência, critério e responsável
- passo que termina sem evidência
- documentação genérica que serviria pra qualquer agência

Responda APENAS no JSON do schema.`;

export interface EntradaRedator {
  /** O que a pessoa escreveu, do jeito que ela sabe. */
  texto: string;
  area: AreaProcesso;
  tipo: TipoDoc;
  /** Contexto opcional: playbook vigente, processo parecido que já existe. */
  contexto?: string;
}

const ROTULO_AREA: Record<AreaProcesso, string> = {
  social: "Social Media", traffic: "Tráfego Pago", cs: "Customer Success",
  comercial: "Comercial", geral: "Geral / toda a agência",
};

export async function redigirProcesso(inp: EntradaRedator): Promise<OpenAiResult<ProcessoRascunho>> {
  const user = [
    `Área: ${ROTULO_AREA[inp.area]}`,
    `Tipo de documento: ${inp.tipo}`,
    "",
    "O que foi descrito:",
    inp.texto.slice(0, 6000),
    inp.contexto ? `\nContexto da casa (respeite, não contradiga):\n${inp.contexto.slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n");

  return chatJson<ProcessoRascunho>({
    model: "gpt-4o-mini", system: SYSTEM, user,
    schema: SCHEMA, schemaName: "processo", maxTokens: 3500, temperature: 0.3,
  });
}

// ── Validação estrutural ─────────────────────────────────────────────────────

export interface Problema {
  campo: string;
  /** `bloqueia` impede salvar. `aviso` deixa passar como pendência assumida. */
  gravidade: "bloqueia" | "aviso";
  mensagem: string;
}

/** Frases que dizem "eu não sei quando nem quem" fingindo que dizem alguma coisa (SKILL.md §7). */
const VAGO = /\b(quando necess[áa]rio|periodicamente|de tempos em tempos|se poss[íi]vel|conforme a demanda|sempre que der)\b/i;

/**
 * Confere se o rascunho é executável. Exportada e pura de propósito: é ela que decide se vira
 * processo ou volta pro autor, então precisa ser testável sem chamar a IA.
 */
export function validarProcesso(p: ProcessoRascunho): Problema[] {
  const out: Problema[] = [];
  const exigir = (campo: string, valor: string | undefined | null, oQue: string) => {
    if (!valor || valor.trim().length < 8) out.push({ campo, gravidade: "bloqueia", mensagem: oQue });
  };

  exigir("titulo", p.titulo, "Sem título não dá pra encontrar o processo depois.");
  exigir("objetivo", p.objetivo, "Falta dizer PRA QUE o processo existe.");
  exigir("gatilho", p.gatilho, "Falta o gatilho: quando este processo começa?");
  exigir("criterioPronto", p.criterioPronto, "Falta o critério de pronto: o que comprova que terminou?");

  // DONO DO PROCESSO NÃO BLOQUEIA. Num time de seis, quem executa é o responsável — um "dono"
  // separado do executor vira campo que ninguém preenche e ninguém consulta (foi a correção do
  // Roberto quando viu a primeira versão). O responsável REAL está em cada passo, e ali sim é
  // obrigatório. Aqui o campo sobrevive como sugestão de a quem recorrer, quando a IA souber.
  if (p.donoPapel?.trim() && !(PAPEIS as readonly string[]).includes(p.donoPapel.trim().toLowerCase())) {
    out.push({ campo: "donoPapel", gravidade: "aviso", mensagem: `"${p.donoPapel}" não é um papel do sistema — deixei em branco.` });
  }

  if (VAGO.test(p.frequencia || "")) {
    out.push({ campo: "frequencia", gravidade: "bloqueia", mensagem: `"${p.frequencia}" não é frequência. Diga quando: "toda segunda", "no dia 20", "a cada entrega".` });
  }

  if (!p.passos?.length) {
    out.push({ campo: "passos", gravidade: "bloqueia", mensagem: "Um processo sem passos é um título." });
  }

  for (const s of p.passos ?? []) {
    const onde = `passo ${s.seq}`;
    if (!s.papel?.trim()) {
      out.push({ campo: onde, gravidade: "bloqueia", mensagem: `"${s.titulo}" não tem responsável — passo sem dono não acontece.` });
    } else if (!(PAPEIS as readonly string[]).includes(s.papel.trim().toLowerCase())) {
      out.push({ campo: onde, gravidade: "bloqueia", mensagem: `"${s.papel}" não é papel do sistema (${onde}). Use: ${PAPEIS.join(", ")}.` });
    }
    // Passo opcional pode não ter evidência; obrigatório sem evidência não dá pra auditar.
    if (!s.opcional && !s.evidencia?.trim()) {
      out.push({ campo: onde, gravidade: "bloqueia", mensagem: `"${s.titulo}" não diz o que comprova a conclusão.` });
    }
    if (VAGO.test(s.instrucao || "")) {
      out.push({ campo: onde, gravidade: "aviso", mensagem: `"${s.titulo}" usa linguagem vaga — vale trocar por regra objetiva.` });
    }
  }

  // Métrica sem ação é enfeite de dashboard (antipadrão SKILL.md §12).
  for (const k of p.kpis ?? []) {
    if (!k.fonte?.trim()) out.push({ campo: `KPI ${k.nome}`, gravidade: "bloqueia", mensagem: "KPI sem fonte do dado não é verificável." });
    if (!k.acaoAbaixo?.trim()) out.push({ campo: `KPI ${k.nome}`, gravidade: "aviso", mensagem: "KPI sem ação quando fica abaixo da meta vira enfeite." });
  }

  if (!p.kpis?.length) out.push({ campo: "kpis", gravidade: "aviso", mensagem: "Sem KPI, não dá pra saber se o processo funciona." });
  if (!p.excecoes?.length) out.push({ campo: "excecoes", gravidade: "aviso", mensagem: "Nenhuma exceção prevista — o que fazer quando sai do trilho?" });

  return out;
}

/** Atalho: dá pra salvar? Aviso não impede — pendência assumida é melhor que processo não escrito. */
export const podeSalvar = (problemas: Problema[]) => !problemas.some((p) => p.gravidade === "bloqueia");

/** Lista o que ficou "A DEFINIR" no texto — vira pendência visível na tela, não some. */
export function pendencias(p: ProcessoRascunho): string[] {
  const achados: string[] = [];
  const varrer = (campo: string, texto?: string | null) => {
    const m = (texto || "").match(/A DEFINIR:?\s*([^.\n]{0,90})/gi);
    if (m) for (const x of m) achados.push(`${campo}: ${x.replace(/A DEFINIR:?\s*/i, "").trim()}`);
  };
  varrer("objetivo", p.objetivo); varrer("escopo", p.escopo); varrer("entradas", p.entradas);
  varrer("saídas", p.saidas); varrer("SLA", p.sla); varrer("critério de pronto", p.criterioPronto);
  for (const s of p.passos ?? []) varrer(`passo ${s.seq}`, s.instrucao);
  return achados;
}
