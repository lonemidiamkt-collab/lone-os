// lib/cs/enriquecer-briefing.ts — o ENRIQUECEDOR de briefing (Trilha A + Estágio 1 do motor).
// Junta TODA a matéria-prima de um cliente (fixed_briefing + campanha + onboarding + ficha do
// guia + notes + nicho + briefing atual) e monta um BRIEFING ESTRATÉGICO completo — incluindo o
// diagnóstico (desejos, objeções, crença-a-mudar, ângulos) que o briefing cru não tem. Suggest-
// only: gera o RASCUNHO; o time revisa e aprova antes de virar client_briefings (nova versão).
//
// Regra de ouro: FATO (contato, endereço, preço, produtos) só do material — NUNCA inventa.
// DIAGNÓSTICO (desejos/objeções/crença/ângulos) o estrategista INFERE do nicho+dores+posicionamento.
// O que não dá pra preencher com segurança → campos_faltando (pro time coletar).

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";
import { NUCLEO_CONTEUDO } from "@/lib/cs/estrategista";
import { fichaDoCliente } from "@/lib/cs/guia-legendas";
import { supabaseAdmin } from "@/lib/supabase/server";

export const ENRIQUECER_MODEL = "gpt-4o";

export interface MateriaPrimaBriefing {
  clienteId: string;
  nome: string;
  nicho?: string;
  instagramUser?: string;
  fixedBriefing?: string;
  campaignBriefing?: string;
  notes?: string;
  onboarding?: string;    // resumo formatado da submissão de onboarding
  ficha?: string;         // ficha do guia-legendas (voz + contato)
  briefingAtual?: string; // briefing estruturado atual, formatado (pra MELHORAR, não recomeçar)
  materialExtra?: string; // NOVO material trazido pelo time (colado na UI) — fonte PRIORITÁRIA
}

export interface MixPilares { autoridade: number; aproximacao: number; comercial: number }

/** O rascunho estruturado — mapeia pras colunas de client_briefings (existentes + diagnóstico novo). */
export interface BriefingEstruturado {
  resumo_estrategico: string;
  posicionamento: string;
  publico_alvo: string[];
  produtos: string[];
  produtos_destaque_atual: string[];
  dores: string[];
  desejos: string[];              // NOVO (diagnóstico)
  objecoes: string[];             // NOVO
  crenca_atual: string;           // NOVO
  crenca_desejada: string;        // NOVO
  diferenciais: string[];         // NOVO
  angulos_concorrencia: string[]; // NOVO
  maturidade_marca: "nova" | "em_crescimento" | "consolidada"; // NOVO
  mix_pilares: MixPilares;        // NOVO
  ganchos: string[];
  ctas: string[];
  tom_voz: string;
  pessoa_verbal: string;
  palavras_proibidas: string[];
  concorrentes_evitar_mencionar: string[];
  hashtags_padrao: string[];
  contato: string;
  observacoes_estrategicas: string;
  campos_faltando: string[];      // o que o time precisa coletar (material insuficiente)
}

const arr = { type: "array", items: { type: "string" } } as const;
const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: [
    "resumo_estrategico", "posicionamento", "publico_alvo", "produtos", "produtos_destaque_atual",
    "dores", "desejos", "objecoes", "crenca_atual", "crenca_desejada", "diferenciais",
    "angulos_concorrencia", "maturidade_marca", "mix_pilares", "ganchos", "ctas", "tom_voz",
    "pessoa_verbal", "palavras_proibidas", "concorrentes_evitar_mencionar", "hashtags_padrao",
    "contato", "observacoes_estrategicas", "campos_faltando",
  ],
  properties: {
    resumo_estrategico: { type: "string" }, posicionamento: { type: "string" },
    publico_alvo: arr, produtos: arr, produtos_destaque_atual: arr, dores: arr, desejos: arr,
    objecoes: arr, crenca_atual: { type: "string" }, crenca_desejada: { type: "string" },
    diferenciais: arr, angulos_concorrencia: arr,
    maturidade_marca: { type: "string", enum: ["nova", "em_crescimento", "consolidada"] },
    mix_pilares: {
      type: "object", additionalProperties: false,
      required: ["autoridade", "aproximacao", "comercial"],
      properties: { autoridade: { type: "number" }, aproximacao: { type: "number" }, comercial: { type: "number" } },
    },
    ganchos: arr, ctas: arr, tom_voz: { type: "string" }, pessoa_verbal: { type: "string" },
    palavras_proibidas: arr, concorrentes_evitar_mencionar: arr, hashtags_padrao: arr,
    contato: { type: "string" }, observacoes_estrategicas: { type: "string" }, campos_faltando: arr,
  },
};

const SYSTEM = `${NUCLEO_CONTEUDO}

Você está montando o BRIEFING ESTRATÉGICO COMPLETO de um cliente da Lone Mídia, a partir de TODO
o material disponível dele. Este briefing vai alimentar o motor que decide calendário, roteiros e
posts — então precisa ser afiado e útil, não institucional.

# A REGRA QUE NÃO SE QUEBRA
- FATO é só do material: contato, endereço, telefone, preço, produtos/serviços, nome — copie do
  material, NUNCA invente. Se não veio, não escreva (e liste em "campos_faltando").
- FATOS DIVERGENTES: se o material trouxer fatos conflitantes (ex.: 2 telefones, 2 endereços),
  NÃO escolha em silêncio. Prioridade: "Material novo trazido pelo time" > "Briefing fixo" > demais.
  Use o de maior prioridade E sinalize a divergência em "campos_faltando".
- DIAGNÓSTICO você INFERE (é seu trabalho de estrategista): desejos, objeções, crença atual→desejada,
  ângulos vs. concorrência, maturidade da marca — deduza do nicho + dores + posicionamento + público.
  Isso não é inventar fato: é ler o mercado. Seja específico ao nicho, não genérico.

# COMO PENSAR CADA CAMPO
- dores/desejos: do PONTO DE VISTA de quem compra do cliente (não do cliente). O que dói, o que ele quer.
- objecoes: o que trava a compra/contratação (preço, risco de trocar, "todos dizem o mesmo").
- crenca_atual → crenca_desejada: a virada de percepção que a marca precisa provocar (o coração).
- angulos_concorrencia: como fugir do post-padrão do nicho.
- maturidade_marca: nova / em_crescimento / consolidada (tempo de mercado, presença).
- mix_pilares: proporção-alvo autoridade/aproximacao/comercial somando 100, ajustada à maturidade e ao
  objetivo (marca nova ou que quer lead → mais autoridade+comercial; consolidada de relacionamento → mais aproximação).
- contato: monte a linha de contato final (endereço/telefone/WhatsApp) SÓ com o que veio no material.
- Se já existe um briefing atual, MELHORE-O: mantenha o que está bom, preencha lacunas, eleve ao estratégico.

# campos_faltando
Liste, objetivo, o que falta pro time coletar com o cliente (ex.: "preços dos serviços", "diferencial
concreto vs. concorrente X", "depoimentos"). Não encha: só o que realmente falta.

Responda APENAS no JSON do schema.`;

/** Junta a matéria-prima do cliente do banco. Server-only (supabaseAdmin). */
export async function coletarMateriaPrima(clienteId: string, materialExtra?: string): Promise<MateriaPrimaBriefing | null> {
  const { data: c } = await supabaseAdmin
    .from("clients")
    .select("name, nome_fantasia, nicho, instagram_user, fixed_briefing, campaign_briefing, notes")
    .eq("id", clienteId).maybeSingle();
  if (!c) return null;
  const nome = (c.nome_fantasia as string) || (c.name as string);

  const { data: sub } = await supabaseAdmin
    .from("client_onboarding_submissions")
    .select("nome_fantasia, razao_social, contact_name, contact_whatsapp, contact_email, cnpj, nicho, endereco_rua, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, notes")
    .eq("client_id", clienteId).order("submitted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  let onboarding: string | undefined;
  if (sub) {
    const end = [sub.endereco_rua, sub.endereco_bairro, sub.endereco_cidade, sub.endereco_estado, sub.endereco_cep].filter(Boolean).join(", ");
    onboarding = [
      sub.razao_social && `Razão social: ${sub.razao_social}`,
      sub.contact_name && `Contato: ${sub.contact_name}`,
      sub.contact_whatsapp && `WhatsApp: ${sub.contact_whatsapp}`,
      sub.contact_email && `E-mail: ${sub.contact_email}`,
      sub.cnpj && `CNPJ: ${sub.cnpj}`,
      sub.nicho && `Nicho: ${sub.nicho}`,
      end && `Endereço: ${end}`,
      sub.notes && `Observações: ${sub.notes}`,
    ].filter(Boolean).join("\n") || undefined;
  }

  // Briefing estruturado atual (pra MELHORAR, não recomeçar)
  const { data: b } = await supabaseAdmin
    .from("client_briefings")
    .select("resumo_estrategico, posicionamento, publico_alvo, produtos, dores, ganchos, ctas, tom_voz, observacoes_estrategicas")
    .eq("client_id", clienteId).eq("is_current", true).order("version", { ascending: false }).limit(1).maybeSingle();
  let briefingAtual: string | undefined;
  if (b) {
    const list = (x: unknown) => Array.isArray(x) && x.length ? (x as string[]).join("; ") : "";
    briefingAtual = [
      b.resumo_estrategico && `Resumo: ${b.resumo_estrategico}`,
      b.posicionamento && `Posicionamento: ${b.posicionamento}`,
      list(b.publico_alvo) && `Público: ${list(b.publico_alvo)}`,
      list(b.produtos) && `Produtos: ${list(b.produtos)}`,
      list(b.dores) && `Dores: ${list(b.dores)}`,
      list(b.ganchos) && `Ganchos: ${list(b.ganchos)}`,
      list(b.ctas) && `CTAs: ${list(b.ctas)}`,
      b.tom_voz && `Tom: ${b.tom_voz}`,
      b.observacoes_estrategicas && `Obs: ${b.observacoes_estrategicas}`,
    ].filter(Boolean).join("\n") || undefined;
  }

  return {
    clienteId, nome,
    nicho: (c.nicho as string) || undefined,
    instagramUser: (c.instagram_user as string) || undefined,
    fixedBriefing: (c.fixed_briefing as string) || undefined,
    campaignBriefing: (c.campaign_briefing as string) || undefined,
    notes: (c.notes as string) || undefined,
    onboarding,
    ficha: fichaDoCliente(nome) || undefined,
    briefingAtual,
    materialExtra: (materialExtra && materialExtra.trim()) ? materialExtra.trim() : undefined,
  };
}

/** Gera o rascunho estruturado a partir da matéria-prima. Suggest-only (não grava). */
export async function enriquecerBriefing(mp: MateriaPrimaBriefing): Promise<OpenAiResult<BriefingEstruturado>> {
  const bloco = (rot: string, v?: string) => (v && v.trim() ? `## ${rot}\n${v.trim()}\n` : "");
  const user =
    `Cliente: ${mp.nome}${mp.nicho ? ` · Nicho: ${mp.nicho}` : ""}${mp.instagramUser ? ` · @${mp.instagramUser}` : ""}\n\n` +
    `Material disponível (use SÓ isto como fato):\n\n` +
    bloco("⭐ Material novo trazido pelo time (FONTE PRIORITÁRIA)", mp.materialExtra) +
    bloco("Briefing fixo (marca)", mp.fixedBriefing) +
    bloco("Briefing de campanha", mp.campaignBriefing) +
    bloco("Onboarding do cliente", mp.onboarding) +
    bloco("Ficha (voz + contato)", mp.ficha) +
    bloco("Notas internas", mp.notes) +
    bloco("Briefing atual (melhore este)", mp.briefingAtual) +
    `\nMonte o briefing estratégico completo. Fatos só do material acima; diagnóstico você infere do nicho+dores+posicionamento.`;

  return chatJson<BriefingEstruturado>({
    model: ENRIQUECER_MODEL,
    system: SYSTEM,
    user,
    schema: SCHEMA,
    schemaName: "cs_briefing_estrategico",
    maxTokens: 2600,
    temperature: 0.4,
  });
}
