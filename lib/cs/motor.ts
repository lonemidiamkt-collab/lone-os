// lib/cs/motor.ts — O MOTOR DE DECISÃO (Fase 3). Roda o pipeline: diagnosticar → objetivo do
// período → decidir peças. Cada peça sai com pilar/objetivo/dor-alvo/ângulo/funil + POR QUE AGORA.
// Consome o briefing enriquecido (Trilha A) e as bibliotecas. Ver docs/lone-marketing-os.md.
// Preview-first: planejarPeriodo devolve o plano; persistir cards/plano é o passo seguinte.

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";
import { NUCLEO_PLANEJAMENTO, NUCLEO_CONTEUDO } from "@/lib/cs/estrategista";
import { ESTRUTURAS_FORMATO, estruturaDoFormato, ARQUITETURA_CONTEUDO } from "@/lib/cs/bibliotecas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { coletarMateriaPrima, enriquecerBriefing } from "@/lib/cs/enriquecer-briefing";
import type {
  DiagnosticoEstrategico, ObjetivoPeriodo, DecisaoDeConteudo, PlanoDePeriodo, MixPilares,
} from "@/lib/cs/pipeline";

const MODEL = "gpt-4o";
const norm = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]).filter(Boolean) : []);

// ── Estágio 1 — DIAGNÓSTICO ──────────────────────────────────────────────────
// Lê o briefing enriquecido (client_briefings current). Se não houver diagnóstico gravado,
// gera um efêmero via Trilha A (não salva) — assim o motor nunca roda no vazio.
export async function diagnosticar(clienteId: string): Promise<DiagnosticoEstrategico | null> {
  const { data: c } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", clienteId).maybeSingle();
  if (!c) return null;
  const nome = (c.nome_fantasia as string) || (c.name as string);

  const { data: b } = await supabaseAdmin.from("client_briefings")
    .select("publico_alvo, dores, desejos, objecoes, crenca_atual, crenca_desejada, diferenciais, angulos_concorrencia, maturidade_marca, posicionamento, resumo_estrategico")
    .eq("client_id", clienteId).eq("is_current", true).order("version", { ascending: false }).limit(1).maybeSingle();

  // Briefing enriquecido (tem o diagnóstico gravado)?
  if (b && (norm(b.dores).length || (b.crenca_desejada as string))) {
    return {
      clienteId,
      publico: { quemE: norm(b.publico_alvo).join("; "), oQueSente: "", momento: "" },
      dores: norm(b.dores), desejos: norm(b.desejos), objecoes: norm(b.objecoes),
      crencaAtual: (b.crenca_atual as string) || "", crencaDesejada: (b.crenca_desejada as string) || "",
      diferenciais: norm(b.diferenciais), angulosVsConcorrencia: norm(b.angulos_concorrencia),
      oportunidades: norm(b.angulos_concorrencia),
      maturidadeMarca: ((b.maturidade_marca as string) || "em_crescimento") as DiagnosticoEstrategico["maturidadeMarca"],
      geradoEm: new Date().toISOString(), fonteBriefing: "client_briefings",
    };
  }

  // Fallback: gera diagnóstico efêmero pela Trilha A (não salva).
  const mp = await coletarMateriaPrima(clienteId);
  if (!mp) return null;
  const res = await enriquecerBriefing(mp);
  if (!res.ok || !res.data) return null;
  const d = res.data;
  return {
    clienteId,
    publico: { quemE: d.publico_alvo.join("; "), oQueSente: "", momento: "" },
    dores: d.dores, desejos: d.desejos, objecoes: d.objecoes,
    crencaAtual: d.crenca_atual, crencaDesejada: d.crenca_desejada,
    diferenciais: d.diferenciais, angulosVsConcorrencia: d.angulos_concorrencia, oportunidades: d.angulos_concorrencia,
    maturidadeMarca: d.maturidade_marca, geradoEm: new Date().toISOString(), fonteBriefing: "efemero",
  };
}

function fmtDiag(nome: string, d: DiagnosticoEstrategico): string {
  const li = (t: string, a: string[]) => (a.length ? `${t}: ${a.join(" · ")}\n` : "");
  return `Cliente: ${nome} (maturidade: ${d.maturidadeMarca})\n` +
    `Público: ${d.publico.quemE}\n` + li("Dores", d.dores) + li("Desejos", d.desejos) + li("Objeções", d.objecoes) +
    `Crença atual: ${d.crencaAtual}\nCrença desejada: ${d.crencaDesejada}\n` +
    li("Diferenciais", d.diferenciais) + li("Ângulos vs. concorrência", d.angulosVsConcorrencia);
}

// ── Estágio 2 — OBJETIVO DO PERÍODO + NARRATIVA ──────────────────────────────
const OBJ_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["objetivo_principal", "narrativa", "mix_pilares"],
  properties: {
    objetivo_principal: { type: "string" }, narrativa: { type: "string" },
    mix_pilares: {
      type: "object", additionalProperties: false, required: ["autoridade", "aproximacao", "comercial"],
      properties: { autoridade: { type: "number" }, aproximacao: { type: "number" }, comercial: { type: "number" } },
    },
  },
};

export async function definirObjetivoPeriodo(
  nome: string, diag: DiagnosticoEstrategico, periodo: string, eventos?: string[], contexto?: string,
): Promise<OpenAiResult<{ objetivo_principal: string; narrativa: string; mix_pilares: MixPilares }>> {
  const system = `${NUCLEO_PLANEJAMENTO}

Você define o OBJETIVO ESTRATÉGICO e a NARRATIVA do período (semana/mês) de um cliente. O que essa
marca precisa PROVAR/mover agora? Qual tema costura as peças? E o mix-alvo de pilares (autoridade/
aproximacao/comercial, somando 100), ajustado à maturidade e ao objetivo. Se houver CAMPANHA/PROMOÇÃO
no contexto do período, a narrativa deve girar em torno dela (e o mix pende pro comercial). Responda só no JSON.`;
  const user = fmtDiag(nome, diag) + `\nPeríodo: ${periodo}\n` +
    (contexto ? `\n⭐ Contexto/campanha DESTE período (abastecido pelo time — prioritário):\n${contexto}\n` : "") +
    (eventos?.length ? `Datas/eventos marcados: ${eventos.join("; ")}\n` : "") +
    `\nDefina o objetivo do período, a narrativa que amarra as peças, e o mix-alvo de pilares.`;
  return chatJson({ model: MODEL, system, user, schema: OBJ_SCHEMA, schemaName: "cs_objetivo_periodo", maxTokens: 700, temperature: 0.5 });
}

// ── Estágio 3 — DECISÃO POR PEÇA (o funil da semana) ─────────────────────────
const PILARES = ["autoridade", "aproximacao", "comercial"];
const OBJETIVOS = ["autoridade", "educacao", "relacionamento", "prova_social", "humanizacao", "desejo", "quebra_objecao", "posicionamento", "venda", "reconhecimento"];
const FUNIL = ["topo", "meio", "fundo"];

const DEC_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["itens"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["data", "formato", "pilar", "objetivo", "posicao_funil", "tema", "angulo", "dor_alvo", "objecao_alvo", "por_que_agora"],
        properties: {
          data: { type: "string" }, formato: { type: "string" },
          pilar: { type: "string", enum: PILARES }, objetivo: { type: "string", enum: OBJETIVOS },
          posicao_funil: { type: "string", enum: FUNIL },
          tema: { type: "string" }, angulo: { type: "string" },
          dor_alvo: { type: "string" }, objecao_alvo: { type: ["string", "null"] }, por_que_agora: { type: "string" },
        },
      },
    },
  },
};

export async function decidirPecas(
  nome: string, diag: DiagnosticoEstrategico, obj: { objetivo_principal: string; narrativa: string; mix_pilares: MixPilares },
  datas: string[], eventos?: string[], contexto?: string,
): Promise<OpenAiResult<{ itens: Array<Omit<DecisaoDeConteudo, "clienteId" | "baseadoEmPeriodo"> & { objecao_alvo: string | null; posicao_funil: string; dor_alvo: string; por_que_agora: string }> }>> {
  const estruturas = ESTRUTURAS_FORMATO.map((e) => `- ${e.formato}: ${e.passos[0]}`).join("\n");
  const mes = datas.length > 4;
  const system = `${NUCLEO_PLANEJAMENTO}

Você DECIDE cada peça do período — uma por data. As peças formam um FUNIL (ex.: uma quebra
percepção, uma educa/compartilha, uma posiciona/vende), respeitando o mix-alvo de pilares. Para
cada peça decida: formato, pilar, objetivo, posição no funil, tema, ÂNGULO (a ideia central que a
peça defende), dor-alvo, objeção-alvo (ou null), e POR QUE AGORA (a justificativa). Não repita
pilar/ângulo em todas.${mes ? ` Este é um MÊS: as peças devem CONVERSAR ENTRE SI e construir um ARCO ao
longo das semanas (ex.: aquecimento → anúncio → prova/depoimento → urgência/última chance se houver
promoção), nunca posts isolados. Distribua o mix ao longo do mês.` : ""} Formatos possíveis:\n${estruturas}\nResponda só no JSON (itens na ordem das datas).`;
  const user = fmtDiag(nome, diag) +
    `\nObjetivo do período: ${obj.objetivo_principal}\nNarrativa: ${obj.narrativa}\n` +
    `Mix-alvo: autoridade ${obj.mix_pilares.autoridade} / aproximacao ${obj.mix_pilares.aproximacao} / comercial ${obj.mix_pilares.comercial}\n` +
    (contexto ? `⭐ Contexto/campanha do período: ${contexto}\n` : "") +
    `Datas (uma peça por data): ${datas.join(", ")}\n` +
    (eventos?.length ? `Datas/eventos marcados: ${eventos.join("; ")}\n` : "") +
    `\nDecida as peças${mes ? " formando o arco do mês" : " formando o funil"}.`;
  return chatJson({ model: MODEL, system, user, schema: DEC_SCHEMA, schemaName: "cs_decisao_pecas", maxTokens: mes ? 4000 : 1800, temperature: 0.6 });
}

// ── planejarPeriodo — compõe os 3 estágios ───────────────────────────────────
export interface PlanoResult { ok: boolean; plano?: PlanoDePeriodo; nome?: string; error?: string }

export async function planejarPeriodo(clienteId: string, periodo: string, datas: string[], eventos?: string[], contexto?: string): Promise<PlanoResult> {
  const { data: c } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", clienteId).maybeSingle();
  if (!c) return { ok: false, error: "Cliente não encontrado" };
  const nome = (c.nome_fantasia as string) || (c.name as string);

  const diag = await diagnosticar(clienteId);
  if (!diag) return { ok: false, error: "Sem material pra diagnosticar este cliente (cadastre um briefing)" };

  const objRes = await definirObjetivoPeriodo(nome, diag, periodo, eventos, contexto);
  if (!objRes.ok || !objRes.data) return { ok: false, error: objRes.error ?? "Falha ao definir objetivo" };

  const decRes = await decidirPecas(nome, diag, objRes.data, datas, eventos, contexto);
  if (!decRes.ok || !decRes.data) return { ok: false, error: decRes.error ?? "Falha ao decidir peças" };

  const objetivo: ObjetivoPeriodo = {
    clienteId, periodo, objetivoPrincipal: objRes.data.objetivo_principal, narrativa: objRes.data.narrativa,
    mixPilares: objRes.data.mix_pilares, baseadoEmDiagnostico: diag.fonteBriefing ?? "",
  };
  const decisoes: DecisaoDeConteudo[] = decRes.data.itens.map((it) => ({
    clienteId, data: it.data, formato: it.formato, pilar: it.pilar, objetivo: it.objetivo,
    posicaoFunil: it.posicao_funil as DecisaoDeConteudo["posicaoFunil"],
    tema: it.tema, angulo: it.angulo, dorAlvo: it.dor_alvo,
    objecaoAlvo: it.objecao_alvo ?? undefined, porQueAgora: it.por_que_agora, baseadoEmPeriodo: periodo,
  }));

  return { ok: true, nome, plano: { diagnostico: diag, objetivo, decisoes } };
}

// ── Estágio 4 — EXECUÇÃO: PROJETAR a peça (não preencher slides) ──────────────
// O agente NÃO pica um texto em slides. Ele PROJETA uma peça de comunicação: objetivo → padrão
// narrativo → nº de artes que a mensagem PEDE → conceito visual → DIREÇÃO DE ARTE por peça.
// Cada arte serve o designer, o social E a IA: objetivo + headline + subheadline + direção de arte.
export interface BlocoPeca {
  rotulo: string;       // "ARTE 01", "GANCHO", "PROBLEMA"…
  objetivo: string;     // o objetivo DESTA arte (o que ela faz na narrativa)
  headline: string;     // o texto forte que aparece (headline / fala)
  subheadline: string;  // apoio (vazio se n/a)
  direcao_arte: string; // CONCEITO VISUAL: cena, cores, sensação, elementos — designer cria sem perguntar
  topicos: string[];    // bullets só quando for lista real
}
export interface PecaFinal {
  data: string; formato: string;
  titulo: string;          // tema da peça
  objetivo_peca: string;   // o que a pessoa deve PENSAR/SENTIR depois de ver
  narrativa: string;       // o padrão narrativo escolhido + por que esse nº de artes
  conceito_visual: string; // mood/direção geral da peça
  duracao: string;         // reel/vídeo: "40s"; senão ""
  blocos: BlocoPeca[];
  cta: string; legenda: string;
}

const BLOCO_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["rotulo", "objetivo", "headline", "subheadline", "direcao_arte", "topicos"],
  properties: {
    rotulo: { type: "string" }, objetivo: { type: "string" }, headline: { type: "string" },
    subheadline: { type: "string" }, direcao_arte: { type: "string" }, topicos: { type: "array", items: { type: "string" } },
  },
};
const PECA_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["titulo", "objetivo_peca", "narrativa", "conceito_visual", "duracao", "blocos", "cta", "legenda"],
  properties: {
    titulo: { type: "string" }, objetivo_peca: { type: "string" }, narrativa: { type: "string" },
    conceito_visual: { type: "string" }, duracao: { type: "string" },
    blocos: { type: "array", items: BLOCO_SCHEMA }, cta: { type: "string" }, legenda: { type: "string" },
  },
};

export async function executarDecisao(nome: string, diag: DiagnosticoEstrategico, dec: DecisaoDeConteudo): Promise<OpenAiResult<PecaFinal> & { peca?: PecaFinal }> {
  const padroes = ARQUITETURA_CONTEUDO.map((p) => `- ${p.nome} (${p.etapas.join(" → ")}) — ${p.quando}`).join("\n");
  const system = `${NUCLEO_CONTEUDO}

${estruturaDoFormato(dec.formato) || ""}

Você PROJETA uma peça de comunicação — você NÃO preenche slides nem pica um texto em partes.
Pense como diretor criativo, NESTA ordem:

1. OBJETIVO DA PEÇA: o que a pessoa deve PENSAR ou SENTIR depois de ver? (campo "objetivo_peca")
2. PADRÃO NARRATIVO: escolha o que melhor VENDE a ideia (não o que "preenche"):
${padroes}
   Descreva o padrão escolhido + por que, em "narrativa".
3. Nº DE ARTES: só o que a mensagem PEDE. MENOS É MAIS. Se resolve em 2, faça 2; não estique até 6/7
   sem motivo. Cada arte precisa ter uma FUNÇÃO na narrativa — se não tem, corta.
4. CONCEITO VISUAL geral da peça (mood, direção): campo "conceito_visual".
5. DIREÇÃO DE ARTE por arte (cada "bloco"): o documento serve o DESIGNER, o social e a IA. Para
   cada arte preencha:
   - "objetivo": o que esta arte faz na narrativa.
   - "headline": o texto forte que aparece na arte (fala, no caso de reel/vídeo).
   - "subheadline": apoio (ou "").
   - "direcao_arte": o CONCEITO VISUAL concreto — cena, quem aparece, cores, sensação, elementos
     gráficos. O designer tem que saber o que criar SEM perguntar. NUNCA escreva "imagem.jpg".
   - "topicos": só quando a arte é uma lista real (senão []).

Regras: gancho/headline da capa nunca começa por "Somos"/nome da empresa. Use só o que está na
decisão/diagnóstico — não invente preço/oferta/depoimento. Sempre entregue "cta" (chamada única) e
"legenda" pronta (tom da marca; feche com o contato se souber). "duracao" só p/ reel/vídeo. Responda só no JSON.`;
  const user = `Cliente: ${nome}\nFormato decidido: ${dec.formato} · Pilar: ${dec.pilar} · Objetivo estratégico: ${dec.objetivo} · Funil: ${dec.posicaoFunil}\n` +
    `Tema: ${dec.tema}\nÂngulo (a ideia central): ${dec.angulo}\nDor-alvo: ${dec.dorAlvo}\n` +
    (dec.objecaoAlvo ? `Objeção a quebrar: ${dec.objecaoAlvo}\n` : "") +
    `Por que agora: ${dec.porQueAgora}\n\nContexto do cliente:\n` +
    `Crença a mudar: ${diag.crencaAtual} → ${diag.crencaDesejada}\n` +
    (diag.diferenciais.length ? `Diferenciais: ${diag.diferenciais.join("; ")}\n` : "") +
    `\nProjete a peça: objetivo → padrão narrativo → nº de artes que a mensagem pede → direção de arte de cada uma.`;
  const res = await chatJson<PecaFinal>({ model: MODEL, system, user, schema: PECA_SCHEMA, schemaName: "cs_peca_final", maxTokens: 2400, temperature: 0.6 });
  const peca = res.ok && res.data ? { ...res.data, data: dec.data, formato: dec.formato } : undefined;
  return { ...res, peca };
}

/** Achata a peça projetada em texto (pro briefing do card). */
export function pecaParaTexto(p: PecaFinal): string {
  const blocos = p.blocos.map((b) => {
    const parts = [
      b.rotulo ? `【${b.rotulo}】` : "", b.objetivo ? `Objetivo: ${b.objetivo}` : "",
      b.headline ? `Headline: ${b.headline}` : "", b.subheadline ? `Subheadline: ${b.subheadline}` : "",
      b.topicos.length ? b.topicos.map((t) => `• ${t}`).join("\n") : "",
      b.direcao_arte ? `Direção de arte: ${b.direcao_arte}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  }).join("\n\n");
  return `${p.titulo}${p.duracao ? ` (${p.duracao})` : ""}\nObjetivo: ${p.objetivo_peca}\nNarrativa: ${p.narrativa}\nConceito visual: ${p.conceito_visual}\n\n${blocos}\n\nCTA: ${p.cta}\n\n— Legenda —\n${p.legenda}`;
}

/** Executa todas as decisões do plano, com concorrência limitada (mês pode ter ~13 peças). */
export async function executarPlano(nome: string, diag: DiagnosticoEstrategico, decisoes: DecisaoDeConteudo[]): Promise<PecaFinal[]> {
  const out: PecaFinal[] = [];
  const LIMITE = 4;
  for (let i = 0; i < decisoes.length; i += LIMITE) {
    const lote = decisoes.slice(i, i + LIMITE);
    const rs = await Promise.all(lote.map((d) => executarDecisao(nome, diag, d)));
    for (const r of rs) if (r.peca) out.push(r.peca);
  }
  return out;
}
