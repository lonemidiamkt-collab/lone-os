// lib/team/whatsapp.ts — o WhatsApp de quem é do time, validado.
//
// É a credencial da pessoa perante o agente (lib/cs/autoridade.ts) E o JID que a menção real do
// WhatsApp usa (lib/cs/mencao.ts). Por isso se GUARDA o número completo, com o nono dígito, do jeito
// que o WhatsApp o identifica (5522988711913) — e se CANONIZA só na comparação (autoridade.ts faz
// brCanonical dos dois lados). A primeira versão (14/09, manhã) guardava o canônico sem o 9 e a
// menção do Lucas deixou de notificar: @552288711913 não é ninguém.

import { brCanonical } from "@/lib/cs/ingest";

export type ValidacaoWhatsapp = { ok: true; numero: string | null } | { ok: false; erro: string };

export function validarWhatsapp(entrada: unknown): ValidacaoWhatsapp {
  if (entrada === null || entrada === undefined) return { ok: true, numero: null };
  if (typeof entrada !== "string") return { ok: false, erro: "WhatsApp precisa ser texto" };
  const digitos = entrada.replace(/\D/g, "");
  if (!digitos) return { ok: true, numero: null }; // campo limpo = apagar
  // "+" explícito com outro DDI é outro país — não tem como ser da equipe daqui.
  if (entrada.trim().startsWith("+") && !digitos.startsWith("55")) return { ok: false, erro: "WhatsApp fora do Brasil (+55) não é aceito" };
  // Sem DDI: assume Brasil. "22981530700" → "5522981530700".
  const comDdi = digitos.length === 10 || digitos.length === 11 ? "55" + digitos : digitos;
  if (!/^55\d{10,11}$/.test(comDdi)) return { ok: false, erro: "WhatsApp inválido — use DDD + número (ex.: 22 98153-0700)" };
  if (brCanonical(comDdi).length !== 12) return { ok: false, erro: "WhatsApp inválido — confira o DDD e o número" };
  // Celular BR tem o 9: se veio sem (10 dígitos depois do 55), acrescenta — é assim que o JID existe.
  const completo = comDdi.length === 12 ? comDdi.slice(0, 4) + "9" + comDdi.slice(4) : comDdi;
  return { ok: true, numero: completo };
}

/** Dois números guardados são a mesma pessoa? Compara o canônico (sem o nono dígito). */
export function mesmoWhatsapp(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return brCanonical(a.replace(/\D/g, "")) === brCanonical(b.replace(/\D/g, ""));
}

/** "5522981530700" → "(22) 98153-0700". */
export function formatarWhatsapp(numero: string | null | undefined): string {
  if (!numero) return "";
  const m = /^55(\d{2})(\d{5})(\d{4})$/.exec(numero);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : numero;
}
