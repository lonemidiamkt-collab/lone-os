// lib/cs/autoridade.ts — QUEM ESTÁ FALANDO decide o que o agente pode fazer. Fase 0A do Lone Agent V2.
//
// Até 13/09/2026, o inbound decidia por GRUPO: mensagem no grupo interno ou no grupo do time
// executava comando (criar card, cobrar, baixar pendência, marcar reunião). Quem estivesse no grupo
// mandava — cliente adicionado por engano, ex-funcionário não removido, número trocado. Chamar
// "Lone" também não é credencial: identifica intenção, não autoridade.
//
// Agora: número do remetente → team_members → papel → nível permitido. O mapeamento existia em
// dois lugares que divergiam (CS_LONE_TEAM_JIDS no .env com 7 números; team_members.whatsapp_phone
// com 5). Desde 14/09/2026 a fonte é UMA: a Gestão da Equipe. Quem não tem WhatsApp cadastrado é
// mudo para o agente — e a tela avisa.
//
// Níveis (Policy Matrix do plano V2):
//   A leitura · B análise → qualquer remetente, inclusive cliente no grupo dele
//   C ação interna (card, cobrança, pendência, reunião) → membro do time com papel operacional
//   D comunicação/modificação (enviar ao cliente, status, contrato, ativar regra) → manager/admin
//   E financeiro/destrutivo → admin (e MFA, quando existir)

import { supabaseAdmin } from "@/lib/supabase/server";
import { brCanonical } from "@/lib/cs/ingest";

export type Nivel = "A" | "B" | "C" | "D" | "E";
export type Papel = "admin" | "manager" | "traffic" | "social" | "designer" | "comercial";

export interface Autor {
  nome: string;
  papel: Papel;
  fonte: "banco";
}

const NIVEL_MINIMO: Record<Nivel, Papel[]> = {
  A: ["admin", "manager", "traffic", "social", "designer", "comercial"],
  B: ["admin", "manager", "traffic", "social", "designer", "comercial"],
  C: ["admin", "manager", "traffic", "social", "designer"],
  D: ["admin", "manager"],
  E: ["admin"],
};

/** O papel pode executar ações deste nível? Função pura. */
export function podeNoNivel(papel: Papel | null | undefined, nivel: Nivel): boolean {
  if (nivel === "A" || nivel === "B") return true; // leitura é de todo mundo, até de quem não é do time
  if (!papel) return false;
  return NIVEL_MINIMO[nivel].includes(papel);
}

const so = (s: string) => (s ?? "").replace(/\D/g, "");
/**
 * IDENTIDADE EXATA. A primeira versão usava os últimos 8 dígitos — serve para achar contato, não
 * para autorizar: dois números de DDDs diferentes com o mesmo final colidiam. Agora: JID →
 * dígitos → E.164 canônico (55 + DDD + 8, o nono dígito resolvido de forma determinística por
 * brCanonical) → correspondência exata. Sem fuzzy.
 */
const chave = (n: string) => brCanonical(so(n));

let cache: { at: number; porChave: Map<string, Autor> } | null = null;
const TTL = 10 * 60 * 1000;

async function tabela(): Promise<Map<string, Autor>> {
  if (cache && Date.now() - cache.at < TTL) return cache.porChave;
  const { data } = await supabaseAdmin.from("team_members")
    .select("name, role, whatsapp_phone").eq("is_active", true).not("whatsapp_phone", "is", null);
  const m = new Map<string, Autor>();
  for (const t of data ?? []) {
    const k = chave(t.whatsapp_phone as string);
    if (k.length >= 12) m.set(k, { nome: t.name as string, papel: t.role as Papel, fonte: "banco" });
  }
  cache = { at: Date.now(), porChave: m };
  return m;
}

/** Quem é o remetente. Null = não é do time (cliente, desconhecido, número não cadastrado). */
export async function quemEh(authorJid?: string | null): Promise<Autor | null> {
  if (!authorJid) return null;
  const k = chave(authorJid);
  if (k.length < 12) return null;
  const t = await tabela().catch(() => new Map<string, Autor>());
  return t.get(k) ?? null;
}

/** Números da equipe para o inbound decidir "mensagem da Lone nunca vira demanda". Fonte: team_members. */
export async function numerosDaEquipe(): Promise<string[]> {
  const t = await tabela().catch(() => new Map<string, Autor>());
  return [...t.keys()];
}

/** Atalho para o inbound: o remetente pode executar uma ação de nível C (ou acima)? */
export async function podeAgir(authorJid: string | null | undefined, nivel: Nivel = "C"): Promise<{ ok: boolean; autor: Autor | null }> {
  const autor = await quemEh(authorJid);
  return { ok: podeNoNivel(autor?.papel, nivel), autor };
}

/** Só para testes. */
export function _limparCacheAutoridade() { cache = null; }
