// Descoberta: achar quem a gente não conhece.
//
// A porta natural seria a busca por hashtag do Instagram. O capability probe mostrou que ela está
// BLOQUEADA para este app (erro #10 — exige "Instagram Public Content Access", que passa por App
// Review da Meta). Registrado em radar_capabilities.
//
// Enquanto isso, a descoberta entra por BUSCA WEB: a IA procura perfis do nicho e devolve
// candidatos; quem mede é sempre a API oficial. Essa divisão importa — modelo de linguagem não sabe
// quantos seguidores alguém tem hoje, e pedir isso a ele produz número inventado com cara de dado.
// Ele acha o endereço; a Meta diz o que há lá dentro.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface CandidatoPerfil { username: string; queryId?: string; query?: string }

/** As perguntas de partida de um nicho. Curtas e específicas — busca vaga traz perfil vago. */
export function queriesIniciais(nicho: string): { query: string; tipo: string }[] {
  const base: Record<string, { query: string; tipo: string }[]> = {
    "Construção e materiais": [
      { query: "loja de material de construção instagram", tipo: "keyword" },
      { query: "loja de pisos e porcelanato instagram", tipo: "keyword" },
      { query: "depósito de material de construção instagram", tipo: "keyword" },
      { query: "loja de tintas instagram brasil", tipo: "produto" },
      { query: "revestimentos e acabamentos instagram loja", tipo: "produto" },
      { query: "erros ao escolher piso instagram reels", tipo: "problema" },
      { query: "dicas antes de comprar porcelanato instagram", tipo: "problema" },
      { query: "loja material construção Rio de Janeiro instagram", tipo: "regional" },
      { query: "madeireira instagram brasil", tipo: "produto" },
      { query: "loja de ferragens e hidráulica instagram", tipo: "produto" },
    ],
    "Móveis e decoração": [
      { query: "loja de móveis planejados instagram", tipo: "keyword" },
      { query: "loja de estofados instagram brasil", tipo: "produto" },
      { query: "decoração de interiores loja instagram", tipo: "keyword" },
      { query: "antes e depois decoração instagram reels", tipo: "formato" },
    ],
    "Beleza e estética": [
      { query: "clínica de estética instagram brasil", tipo: "keyword" },
      { query: "salão de beleza instagram reels", tipo: "keyword" },
      { query: "depilação a laser clínica instagram", tipo: "produto" },
      { query: "transformação de cabelo antes e depois instagram", tipo: "formato" },
    ],
    "Automotivo": [
      { query: "loja de pneus instagram brasil", tipo: "produto" },
      { query: "oficina mecânica instagram reels", tipo: "keyword" },
      { query: "estética automotiva instagram", tipo: "keyword" },
    ],
    "Saúde e clínicas": [
      { query: "clínica veterinária instagram brasil", tipo: "keyword" },
      { query: "farmácia de manipulação instagram", tipo: "keyword" },
      { query: "clínica médica instagram reels dicas", tipo: "keyword" },
    ],
    "Energia solar": [
      { query: "empresa de energia solar instagram brasil", tipo: "keyword" },
      { query: "instalação painel solar residencial instagram", tipo: "produto" },
    ],
    "Moda e vestuário": [
      { query: "loja de roupas femininas instagram brasil", tipo: "keyword" },
      { query: "bazar de roupas instagram reels", tipo: "keyword" },
    ],
    "Alimentação": [
      { query: "açaiteria instagram brasil", tipo: "keyword" },
      { query: "restaurante instagram reels bastidores", tipo: "formato" },
    ],
    "Ótica": [{ query: "ótica instagram brasil loja", tipo: "keyword" }],
    "Pet": [{ query: "petshop instagram brasil", tipo: "keyword" }],
    "Fitness e academia": [{ query: "academia instagram brasil reels", tipo: "keyword" }],
    "Seguros": [{ query: "corretora de seguros instagram brasil", tipo: "keyword" }],
    "Serviços profissionais": [{ query: "escritório de contabilidade instagram brasil", tipo: "keyword" }],
    "Varejo geral": [{ query: "loja de variedades instagram brasil", tipo: "keyword" }],
  };
  return base[nicho] ?? [{ query: `${nicho} instagram brasil loja`, tipo: "keyword" }];
}

/**
 * Escolhe as perguntas da semana.
 *
 * Rodízio pelo que faz mais tempo que não é usado, para o radar não perguntar as mesmas cinco
 * coisas para sempre e voltar sempre com os mesmos perfis. Pergunta que nunca trouxe nada útil em
 * 3 tentativas é desativada — pesquisa custa, e pergunta ruim custa igual.
 */
export async function escolherQueries(nicho: string, quantas = 5) {
  const { data } = await supabaseAdmin.from("radar_queries")
    .select("id, query, tipo, usos, achados_uteis")
    .eq("nicho", nicho).eq("ativa", true)
    .order("ultima_vez", { ascending: true, nullsFirst: true })
    .limit(quantas);
  return data ?? [];
}

export async function semearQueries(nicho: string) {
  const linhas = queriesIniciais(nicho).map((q) => ({ nicho, query: q.query, tipo: q.tipo }));
  if (linhas.length) await supabaseAdmin.from("radar_queries").upsert(linhas, { onConflict: "nicho,query" });
}

/** Extrai @handles de um texto solto. O modelo às vezes devolve prosa junto; isso limpa. */
export function extrairHandles(texto: string): string[] {
  const achados = new Set<string>();
  for (const bruto of texto.split(/[\s,;\n]+/)) {
    const limpo = bruto.trim().replace(/^@/, "").replace(/[.,;:)\]]+$/, "").toLowerCase();
    // instagram.com/loja → loja
    const doLink = limpo.match(/instagram\.com\/([a-z0-9._]{2,30})/)?.[1];
    const cand = doLink ?? limpo;
    if (/^[a-z0-9._]{3,30}$/.test(cand) && !/^(instagram|www|com|https?|reels?|explore|p)$/.test(cand)) {
      achados.add(cand);
    }
  }
  return [...achados];
}

/** Pergunta à IA com busca web. Só handles — a métrica quem dá é a Meta. */
export async function buscarCandidatos(query: string, apiKey: string, modelo = "gpt-5.4-mini"): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: "web_search" }],
      input:
        `Pesquise na web: ${query}\n\n` +
        `Liste perfis do Instagram de empresas BRASILEIRAS desse mercado. ` +
        `Priorize lojas REGIONAIS e de pequeno/médio porte — grandes marcas nacionais são menos úteis aqui. ` +
        `NÃO tente estimar seguidores nem desempenho: responda APENAS os nomes de usuário, ` +
        `separados por vírgula, sem @ e sem nenhum outro texto. No máximo 20.`,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const json = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!json) return [];
  if (json.error) throw new Error(String((json.error as Record<string, unknown>)?.message ?? "web_search falhou"));

  let texto = typeof json.output_text === "string" ? json.output_text : "";
  if (!texto) {
    for (const o of (json.output as Array<Record<string, unknown>>) ?? []) {
      for (const c of (o.content as Array<Record<string, unknown>>) ?? []) {
        if (typeof c.text === "string") texto += `\n${c.text}`;
      }
    }
  }
  return extrairHandles(texto);
}
