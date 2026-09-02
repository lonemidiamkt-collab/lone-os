// lib/cs/sem-postar.ts — cliente parou de postar? A pergunta que ninguém respondeu por 35 dias.
//
// O QUE ACONTECEU (03/08). O Bazar Ribeiro ficou **35 dias** sem post e o Bazar Ribeiro Saquarema
// 10, os dois do mesmo social. Ninguém foi avisado. O Roberto descobriu pelo cliente.
//
// POR QUE O ALERTA NÃO PEGOU — duas falhas somadas:
//
//   1. FONTE ERRADA. `cs-saude` media "dias sem postagem" pelo status do CARD no board. Só que o
//      time não move card pra "publicado" — então o board não sabe o que foi ao ar. Quem sabe é o
//      Instagram, e o sistema já sincroniza isso (client_ig_posts) desde julho.
//
//   2. "NUNCA POSTOU" ERA TRATADO COMO "SEM DADO". A regra antiga só avaliava quem tinha data:
//      `if (dias !== null && dias > 30)`. Cliente sem NENHUM post publicado caía no null e passava
//      batido — o caso mais grave era exatamente o que o alerta ignorava.
//
// A LIÇÃO QUE ESTE ARQUIVO GUARDA: ausência de dado sobre trabalho entregue é MÁ notícia, não
// notícia nenhuma. Aqui, quem não tem post é o mais grave da lista, não o ausente dela.

import { supabaseAdmin } from "@/lib/supabase/server";

/** Postagem é seg/qua/sex. Passar disso significa ter perdido ao menos uma janela inteira. */
export const DIAS_ATENCAO = 5;
/** Uma semana inteira sem post: já é falha de operação, sobe pra gestão. */
export const DIAS_GRAVE = 7;

export type Gravidade = "grave" | "atencao";

export interface ClienteParado {
  clientId: string;
  cliente: string;
  responsavel: string | null;
  /** null = o Instagram foi lido e não há post nenhum. NUNCA significa "não consegui ler" —
   *  esse caso sai em `clientesIlegiveis()`. Ver o comentário grande em clientesSemPostar(). */
  diasSemPostar: number | null;
  gravidade: Gravidade;
}

/** Cliente cujo Instagram TEM publicações que a gente não consegue enxergar. */
export interface ClienteIlegivel {
  clientId: string;
  cliente: string;
  responsavel: string | null;
  /** Quantos posts a conta tem, segundo a própria Meta. */
  postsNaConta: number;
  usuario: string | null;
}

/**
 * Quem está sem postar, pelos posts REAIS do Instagram.
 *
 * Só olha cliente de social (tem `assigned_social`): cobrar postagem de conta que a gente não
 * administra seria ruído — e ruído é o que faz o time parar de ler o alerta.
 */
/**
 * Contas cujo Instagram TEM publicações que a gente não consegue LISTAR.
 *
 * O caso real (02/09, apontado pelo Roberto: "Varejão e UNAFER foi feito post sim!"): as duas
 * contas têm Instagram vinculado, e a Meta responde `media_count` normalmente — 138 e 124 posts.
 * Mas pedir `/media` devolve `(#10) Application does not have permission for this action`, porque
 * essas contas não estão ligadas à Página que a gente administra. Resultado: `client_ig_posts`
 * vazio, e o agente anunciando "sem NENHUM post registrado" para dois clientes que postam há meses.
 *
 * O snapshot já guardava a prova e ninguém a lia: `conta.posts = 124` junto de `posts: []` é a
 * assinatura exata de "não consegui ler" — nunca de "não postou". A diferença importa porque uma é
 * pendência de ACESSO, que o Roberto resolve na Meta, e a outra é cobrança do social.
 */
export async function clientesIlegiveis(): Promise<ClienteIlegivel[]> {
  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, assigned_social")
    .or("active.is.null,active.eq.true")
    .not("assigned_social", "is", null)
    .not("ig_business_account_id", "is", null);
  if (!clientes?.length) return [];

  const ids = clientes.map((c) => c.id as string);
  const [{ data: posts }, { data: snaps }] = await Promise.all([
    supabaseAdmin.from("client_ig_posts").select("client_id").in("client_id", ids),
    supabaseAdmin.from("client_ig_snapshots").select("client_id, data").in("client_id", ids),
  ]);
  const temPost = new Set((posts ?? []).map((p) => p.client_id as string));

  // Do snapshot mais completo de cada cliente, o total de posts que a Meta declara.
  const contaPosts = new Map<string, { posts: number; usuario: string | null }>();
  for (const s of snaps ?? []) {
    const d = (s.data ?? {}) as { conta?: { posts?: number; username?: string } };
    const n = Number(d.conta?.posts ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    const cid = s.client_id as string;
    const atual = contaPosts.get(cid);
    if (!atual || n > atual.posts) contaPosts.set(cid, { posts: n, usuario: d.conta?.username ?? null });
  }

  const out: ClienteIlegivel[] = [];
  for (const c of clientes) {
    const cid = c.id as string;
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    if (/\(teste\)/i.test(nome)) continue;
    const info = contaPosts.get(cid);
    // A conta tem post e a gente não gravou NENHUM: é cegueira nossa.
    if (info && !temPost.has(cid)) {
      out.push({ clientId: cid, cliente: nome, responsavel: (c.assigned_social as string) ?? null,
                 postsNaConta: info.posts, usuario: info.usuario });
    }
  }
  return out.sort((a, b) => b.postsNaConta - a.postsNaConta);
}

/**
 * Contas de Instagram cadastradas em MAIS DE UM cliente.
 *
 * Caso real (02/09): "Bazar Ribeiro - Maricá" e "Bazar Ribeiro Saquarema" apontam para o mesmo
 * `ig_business_account_id`. A sincronização grava os posts em um dos dois — o outro fica com o
 * histórico velho e o agente anuncia "54 dias sem postar" de um perfil que postou anteontem.
 *
 * Não dá para saber qual dos dois é o certo sem alguém decidir, e escolher no chute gravaria post
 * no cliente errado. Então a regra é a mesma dos outros casos ambíguos: sai da cobrança e vira
 * pendência de cadastro, nomeada. Ver [[loneos-report-group-leak]] — grupo de WhatsApp duplicado
 * já tinha causado exatamente este tipo de erro nos relatórios.
 */
export async function instagramDuplicado(): Promise<Map<string, string[]>> {
  const { data } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, ig_business_account_id")
    .or("active.is.null,active.eq.true")
    .not("ig_business_account_id", "is", null);

  const porConta = new Map<string, { id: string; nome: string }[]>();
  for (const c of data ?? []) {
    const k = String(c.ig_business_account_id);
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    if (/\(teste\)/i.test(nome)) continue;
    (porConta.get(k) ?? porConta.set(k, []).get(k)!).push({ id: c.id as string, nome });
  }

  // clientId → nomes dos OUTROS clientes que dividem a mesma conta.
  const out = new Map<string, string[]>();
  for (const [, lista] of porConta) {
    if (lista.length < 2) continue;
    for (const c of lista) out.set(c.id, lista.filter((o) => o.id !== c.id).map((o) => o.nome));
  }
  return out;
}

export async function clientesSemPostar(): Promise<ClienteParado[]> {
  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, assigned_social, ig_business_account_id, ig_public_username")
    .or("active.is.null,active.eq.true")
    .not("assigned_social", "is", null);
  if (!clientes?.length) return [];

  const ids = clientes.map((c) => c.id as string);
  const [{ data: posts }, ilegiveis, duplicados] = await Promise.all([
    supabaseAdmin.from("client_ig_posts").select("client_id, posted_at").in("client_id", ids),
    clientesIlegiveis(),
    instagramDuplicado(),
  ]);
  // Quem a gente não consegue LER não entra na cobrança de postagem — sai em lista própria.
  const cegos = new Set(ilegiveis.map((i) => i.clientId));

  const ultimo = new Map<string, string>();
  for (const p of posts ?? []) {
    const cid = p.client_id as string;
    const q = p.posted_at as string | null;
    if (!cid || !q) continue;
    const atual = ultimo.get(cid);
    if (!atual || q > atual) ultimo.set(cid, q);
  }

  const parados: ClienteParado[] = [];
  const semIg: string[] = [];
  for (const c of clientes) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    if (/\(teste\)/i.test(nome)) continue; // cliente de teste não é operação

    // SEM INSTAGRAM LIGADO NÃO É "PAROU DE POSTAR" — é cadastro incompleto, e acusar o social por
    // isso queimaria o alerta inteiro: na primeira lista com cinco nomes errados o time aprende a
    // ignorar, e aí o Bazar de 35 dias volta a passar batido. Esse caso sai em `semInstagram`.
    const temIg = !!(c.ig_business_account_id || c.ig_public_username);
    if (!temIg) { semIg.push(nome); continue; }

    const q = ultimo.get(c.id as string);
    const dias = q ? Math.floor((Date.now() - new Date(q).getTime()) / 86_400_000) : null;

    // A conta TEM posts que a gente não enxerga → pendência de acesso, não de postagem. Acusar
    // aqui é o erro que o Roberto pegou no Varejão e no UNAFER, que postam há meses.
    if (cegos.has(c.id as string)) continue;

    // Mesmo Instagram em dois clientes: os posts caem em um só e o outro parece parado. Sem saber
    // qual é o certo, cobrar seria acusar no escuro.
    if (duplicados.has(c.id as string)) continue;

    // NUNCA POSTOU, TENDO INSTAGRAM: é grave de verdade. Foi a brecha que deixou o Bazar invisível.
    if (dias === null) {
      parados.push({ clientId: c.id as string, cliente: nome, responsavel: (c.assigned_social as string) ?? null, diasSemPostar: null, gravidade: "grave" });
      continue;
    }
    if (dias >= DIAS_GRAVE) {
      parados.push({ clientId: c.id as string, cliente: nome, responsavel: (c.assigned_social as string) ?? null, diasSemPostar: dias, gravidade: "grave" });
    } else if (dias >= DIAS_ATENCAO) {
      parados.push({ clientId: c.id as string, cliente: nome, responsavel: (c.assigned_social as string) ?? null, diasSemPostar: dias, gravidade: "atencao" });
    }
  }

  // Pior primeiro; "nunca postou" na frente de todos.
  parados.sort((a, b) => (b.diasSemPostar ?? 9999) - (a.diasSemPostar ?? 9999));
  return parados;
}

/** Clientes de social sem Instagram vinculado — o sistema é CEGO pra eles. Problema real, mas de
 *  cadastro, não de postagem: vai num aviso próprio pra não contaminar a cobrança do social. */
export async function clientesSemInstagram(): Promise<{ cliente: string; responsavel: string | null }[]> {
  // Devolve o RESPONSÁVEL junto (02/09). Antes eram só nomes, o que bastava para a linha solta no
  // fim da mensagem; com o PDF por pessoa, um cliente sem dono não sabe em qual documento entrar —
  // e um aviso de cadastro no PDF errado vira cobrança da pessoa errada.
  const { data } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, assigned_social")
    .or("active.is.null,active.eq.true")
    .not("assigned_social", "is", null)
    .is("ig_business_account_id", null).is("ig_public_username", null);
  return (data ?? [])
    .map((c) => ({
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      responsavel: (c.assigned_social as string) ?? null,
    }))
    .filter((c) => !/\(teste\)/i.test(c.cliente));
}

const rotuloDias = (d: number | null) => (d === null ? "sem NENHUM post registrado" : `${d} dias sem postar`);

/** Cobrança nominal pro grupo da equipe. "" quando não há ninguém parado. */
export function textoCobranca(parados: ClienteParado[]): string {
  if (!parados.length) return "";

  const porDono = new Map<string, ClienteParado[]>();
  for (const p of parados) {
    const k = p.responsavel?.trim() || "sem dono";
    if (!porDono.has(k)) porDono.set(k, []);
    porDono.get(k)!.push(p);
  }

  const graves = parados.filter((p) => p.gravidade === "grave").length;
  const l: string[] = [
    graves
      ? `🚨 *${graves} cliente(s) há ${DIAS_GRAVE}+ dias sem postar* — isso é o cliente pagando e não recebendo.`
      : `⚠️ *${parados.length} cliente(s) passando do ponto sem postar.*`,
  ];

  for (const [dono, lista] of porDono) {
    l.push("", `👤 *${dono}*`);
    for (const p of lista.slice(0, 5)) {
      l.push(`${p.gravidade === "grave" ? "🚨" : "•"} ${p.cliente} — ${rotuloDias(p.diasSemPostar)}`);
    }
    if (lista.length > 5) l.push(`_+${lista.length - 5} outro(s)_`);
  }

  l.push("", "_Se já postou e não apareceu aqui, me avisa — eu leio direto do Instagram do cliente._");
  return l.join("\n");
}

/**
 * Aviso pro DONO da agência. Separado de propósito: o grupo recebe a cobrança do dia a dia, o
 * Roberto recebe só o que virou risco de perder cliente — senão ele para de ler também.
 */
export function textoEscalada(parados: ClienteParado[]): string {
  const graves = parados.filter((p) => p.gravidade === "grave");
  if (!graves.length) return "";
  const l = [
    `🚨 *Precisa da sua atenção* — ${graves.length} cliente(s) há ${DIAS_GRAVE}+ dias sem post no ar:`,
    "",
  ];
  for (const p of graves.slice(0, 10)) {
    l.push(`• *${p.cliente}* — ${rotuloDias(p.diasSemPostar)}${p.responsavel ? ` (${p.responsavel})` : ""}`);
  }
  if (graves.length > 10) l.push(`_…e mais ${graves.length - 10}._`);
  l.push("", "_Conferido nos posts reais do Instagram, não no quadro._");
  return l.join("\n");
}
