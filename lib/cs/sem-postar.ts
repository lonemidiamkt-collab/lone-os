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
  /** null = nunca postou (ou nunca sincronizou) — tratado como o caso MAIS grave. */
  diasSemPostar: number | null;
  gravidade: Gravidade;
}

/**
 * Quem está sem postar, pelos posts REAIS do Instagram.
 *
 * Só olha cliente de social (tem `assigned_social`): cobrar postagem de conta que a gente não
 * administra seria ruído — e ruído é o que faz o time parar de ler o alerta.
 */
export async function clientesSemPostar(): Promise<ClienteParado[]> {
  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, assigned_social, ig_business_account_id, ig_public_username")
    .or("active.is.null,active.eq.true")
    .not("assigned_social", "is", null);
  if (!clientes?.length) return [];

  const ids = clientes.map((c) => c.id as string);
  const { data: posts } = await supabaseAdmin
    .from("client_ig_posts").select("client_id, posted_at").in("client_id", ids);

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
export async function clientesSemInstagram(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia")
    .or("active.is.null,active.eq.true")
    .not("assigned_social", "is", null)
    .is("ig_business_account_id", null).is("ig_public_username", null);
  return (data ?? [])
    .map((c) => (c.nome_fantasia as string) || (c.name as string) || "Cliente")
    .filter((n) => !/\(teste\)/i.test(n));
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
