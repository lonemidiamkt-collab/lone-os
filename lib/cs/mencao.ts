// Menção de verdade no WhatsApp.
//
// Roberto: "quando você marca arroba Thiago, não está funcionando direito". Não estava mesmo — o
// código escrevia `@Thiago` como texto puro, e no WhatsApp isso não notifica ninguém. Uma menção
// real exige duas coisas juntas: o NÚMERO no corpo (@5522999999999) e o array `mentioned` no envio.
//
// Sem o número cadastrado, a escolha aqui é deliberada: escrever o primeiro nome SEM arroba. Um "@"
// que não notifica é pior que nenhum — cria a impressão de que a pessoa foi avisada quando ninguém
// avisou, e é assim que um pedido fica dois dias parado com todo mundo achando que está tratado.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface Mencao {
  /** Trecho para colar no texto: "@5522999999999" quando há número, "Thiago" quando não há. */
  trecho: string;
  /** JIDs para o campo `mentioned` da Evolution. Vazio quando não há número. */
  jids: string[];
  /** Se falso, ninguém será notificado — só verá quem estiver lendo o grupo. */
  notifica: boolean;
}

const so = (s: string) => s.replace(/\D/g, "");

/** Normaliza para o formato que o WhatsApp usa: DDI+DDD+número, só dígitos. */
export function normalizarNumero(bruto?: string | null): string | null {
  const d = so(bruto ?? "");
  if (!d) return null;
  if (d.length >= 12 && d.startsWith("55")) return d;      // já tem DDI
  if (d.length === 10 || d.length === 11) return `55${d}`;  // DDD + número
  return d.length >= 12 ? d : null;
}

/**
 * Monta a menção de uma pessoa da equipe pelo nome como ele aparece no cadastro do cliente
 * (`assigned_social`, `assigned_designer`…), que nem sempre é o nome completo.
 */
export async function mencionar(nomeOuPrimeiro?: string | null): Promise<Mencao> {
  const nome = (nomeOuPrimeiro ?? "").trim();
  if (!nome) return { trecho: "", jids: [], notifica: false };
  const primeiro = nome.split(/\s+/)[0];

  const { data } = await supabaseAdmin
    .from("team_members")
    .select("name, whatsapp_phone")
    .eq("is_active", true)
    .not("whatsapp_phone", "is", null);

  // Casa pelo primeiro nome: o cadastro do cliente guarda "Thiago", a equipe guarda "Thiago Silva".
  const alvo = (data ?? []).find((m) => {
    const n = String(m.name ?? "").trim().toLowerCase();
    return n === nome.toLowerCase() || n.split(/\s+/)[0] === primeiro.toLowerCase();
  });

  const numero = normalizarNumero(alvo?.whatsapp_phone as string);
  if (!numero) return { trecho: primeiro, jids: [], notifica: false };

  return { trecho: `@${numero}`, jids: [`${numero}@s.whatsapp.net`], notifica: true };
}
