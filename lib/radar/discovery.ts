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

/**
 * O que a descoberta devolve.
 *
 * `perfil` nasce de "quem são as empresas desse mercado"; `conteudo` nasce de "que post/Reel está
 * circulando nesse mercado" — e este segundo é o que faltava. Descobrir a empresa e depois olhar o
 * que ela publica encontra empresas novas, mas ainda parte de quem publica. Partir do CONTEÚDO é o
 * caminho que acha a loja que ninguém conhece porque um Reel dela estourou.
 */
export interface AchadoDescoberta {
  username: string;
  permalink?: string;
  origem: "perfil" | "conteudo";
  queryId?: string;
}

/**
 * Perguntas orientadas ao CONTEÚDO — mas perguntando por QUEM FAZ, não por links.
 *
 * A ideia original era content-first puro: achar o Reel que está circulando e chegar ao autor por
 * ele. Testei e NÃO FUNCIONA por busca web: o Instagram não deixa post e Reel individuais serem
 * indexados. Três buscas com `site:instagram.com/reel/` voltaram zero resultados e texto vazio.
 * Não é limitação da implementação; é da web. Content-first de verdade depende da Hashtag Search
 * da Meta, que está bloqueada aguardando App Review (ver radar_capabilities).
 *
 * O que funciona hoje e chega perto: perguntar quem PRODUZ aquele tipo de conteúdo. "Quais lojas
 * fazem vídeo de antes e depois de obra?" devolveu perfis; "liste links de Reels de antes e depois"
 * não devolveu nada. Continua sendo o perfil como porta de entrada, mas escolhido pelo conteúdo
 * que produz — e isso encontra gente que uma busca por "loja de material de construção" não acha.
 */
export function queriesDeConteudo(nicho: string): { query: string; tipo: string }[] {
  const porNicho: Record<string, string[]> = {
    "Construção e materiais": [
      "antes e depois de obra instagram reels",
      "erros ao escolher piso instagram reels",
      "dicas antes de comprar material de construção reels instagram",
      "site:instagram.com/reel porcelanato obra",
      "transformação de ambiente com porcelanato instagram",
    ],
    "Móveis e decoração": [
      "Lojas de móveis brasileiras que publicam antes e depois de ambientes no Instagram",
      "Perfis do Instagram de lojas de móveis que mostram montagem e bastidores",
    ],
    "Beleza e estética": [
      "Salões e clínicas de estética brasileiras que publicam transformação antes e depois no Instagram",
      "Perfis de estética no Instagram que explicam procedimentos para o cliente leigo",
    ],
    "Automotivo": [
      "Oficinas e lojas automotivas brasileiras que fazem antes e depois no Instagram",
      "Perfis automotivos no Instagram que dão dicas de manutenção para o dono do carro",
    ],
    "Saúde e clínicas": ["Clínicas brasileiras que publicam orientação ao paciente no Instagram", "Perfis de saúde no Instagram que desmentem mitos comuns"],
    "Energia solar": ["Empresas de energia solar que mostram instalação e economia real no Instagram", "Perfis de energia solar que explicam o retorno do investimento"],
    "Moda e vestuário": ["Lojas de roupas brasileiras que fazem provador e looks no Instagram", "Perfis de moda no Instagram que mostram novidades da loja"],
    "Alimentação": ["Restaurantes brasileiros que mostram bastidores da cozinha no Instagram", "Perfis de alimentação que mostram o preparo do produto"],
    "Ótica": ["Óticas brasileiras que mostram clientes provando armações no Instagram"],
    "Pet": ["Petshops brasileiros que publicam antes e depois de banho e tosa no Instagram"],
    "Fitness e academia": ["Academias brasileiras que publicam dicas de treino no Instagram"],
  };
  return (porNicho[nicho] ?? [`Perfis brasileiros do Instagram de ${nicho} que produzem conteúdo educativo`])
    .map((q) => ({ query: q, tipo: "conteudo" }));
}

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
  const linhas = [...queriesIniciais(nicho), ...queriesDeConteudo(nicho)]
    .map((q) => ({ nicho, query: q.query, tipo: q.tipo }));
  if (linhas.length) await supabaseAdmin.from("radar_queries").upsert(linhas, { onConflict: "nicho,query" });
}

/**
 * Escolhe as perguntas da semana MISTURANDO as duas famílias.
 *
 * Só rodízio por data faria semanas inteiras caírem só em busca por empresa (que é a maioria das
 * perguntas cadastradas) e o content-first nunca sairia do papel. Metade e metade, sempre.
 */
export async function escolherQueriesMistas(nicho: string, quantas = 4) {
  const metade = Math.max(1, Math.floor(quantas / 2));
  const [{ data: conteudo }, { data: perfil }] = await Promise.all([
    supabaseAdmin.from("radar_queries").select("id, query, tipo, usos, achados_uteis")
      .eq("nicho", nicho).eq("ativa", true).eq("tipo", "conteudo")
      .order("ultima_vez", { ascending: true, nullsFirst: true }).limit(metade),
    supabaseAdmin.from("radar_queries").select("id, query, tipo, usos, achados_uteis")
      .eq("nicho", nicho).eq("ativa", true).neq("tipo", "conteudo")
      .order("ultima_vez", { ascending: true, nullsFirst: true }).limit(quantas - metade),
  ]);
  return [...(conteudo ?? []), ...(perfil ?? [])];
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

/** Extrai links de post/Reel do texto — o caminho content-first. */
export function extrairPermalinks(texto: string): { permalink: string; username?: string }[] {
  const achados: { permalink: string; username?: string }[] = [];
  const rx = /https?:\/\/(?:www\.)?instagram\.com\/(?:([a-z0-9._]{2,30})\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]{5,})/gi;
  for (const m of texto.matchAll(rx)) {
    achados.push({ permalink: `https://www.instagram.com/${m[1] ? `${m[1]}/` : ""}${m[0].includes("/reel") ? "reel" : "p"}/${m[2]}/`, username: m[1]?.toLowerCase() });
  }
  return achados;
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
        `Encontre CONTEÚDOS e PERFIS do Instagram de empresas BRASILEIRAS desse mercado. ` +
        `Priorize lojas REGIONAIS e de pequeno/médio porte — grandes marcas nacionais são menos úteis aqui. ` +
        `Se encontrar links de posts ou Reels, inclua os links completos. ` +
        `NÃO tente estimar seguidores nem desempenho — isso é medido depois. ` +
        `Responda apenas com nomes de usuário e/ou links do Instagram, separados por vírgula ou quebra de linha, sem texto explicativo.`,
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

/** Busca que devolve as duas coisas: quem publica e o que foi publicado. */
export async function buscarAchados(query: string, tipo: string, apiKey: string, modelo = "gpt-5.4-mini"): Promise<AchadoDescoberta[]> {
  const texto = await buscarTextoBruto(query, apiKey, modelo);
  const porConteudo = extrairPermalinks(texto);
  const achados = new Map<string, AchadoDescoberta>();

  // Quem apareceu por causa de um post entra marcado como content-first: é o caminho que encontra
  // a loja desconhecida cujo Reel circulou.
  for (const c of porConteudo) {
    if (c.username) achados.set(c.username, { username: c.username, permalink: c.permalink, origem: "conteudo" });
  }
  for (const u of extrairHandles(texto)) {
    if (!achados.has(u)) achados.set(u, { username: u, origem: tipo === "conteudo" ? "conteudo" : "perfil" });
  }
  return [...achados.values()];
}

async function buscarTextoBruto(query: string, apiKey: string, modelo: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: "web_search" }],
      input:
        `Pesquise na web: ${query}\n\n` +
        `Encontre CONTEÚDOS e PERFIS do Instagram de empresas BRASILEIRAS desse mercado. ` +
        `Priorize lojas REGIONAIS e de pequeno/médio porte. ` +
        `Se encontrar links de posts ou Reels, inclua os links completos. ` +
        `NÃO estime seguidores nem desempenho — isso é medido depois. ` +
        `Responda apenas com nomes de usuário e/ou links do Instagram.`,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!json) return "";
  if (json.error) throw new Error(String((json.error as Record<string, unknown>)?.message ?? "web_search falhou"));
  if (typeof json.output_text === "string" && json.output_text) return json.output_text;
  let texto = "";
  for (const o of (json.output as Array<Record<string, unknown>>) ?? []) {
    for (const c of (o.content as Array<Record<string, unknown>>) ?? []) {
      if (typeof c.text === "string") texto += `\n${c.text}`;
    }
  }
  return texto;
}
