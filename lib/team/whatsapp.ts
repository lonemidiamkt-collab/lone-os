// lib/team/whatsapp.ts — o WhatsApp de quem é do time, validado e canônico.
//
// É a credencial da pessoa perante o agente (lib/cs/autoridade.ts). Guarda-se no formato E.164
// canônico do Brasil (55 + DDD + 8 dígitos, o nono resolvido por brCanonical) para a comparação
// ser exata — "(22) 98153-0700", "+55 22 8153 0700" e "5522981530700" são a mesma pessoa.

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
  const canon = brCanonical(comDdi);
  if (canon.length !== 12) return { ok: false, erro: "WhatsApp inválido — confira o DDD e o número" };
  return { ok: true, numero: canon };
}

/** "5522981530700" → "(22) 9 8153-0700" (o canônico não guarda o nono dígito; celular BR tem). */
export function formatarWhatsapp(canon: string | null | undefined): string {
  if (!canon) return "";
  const m = /^55(\d{2})(\d{4})(\d{4})$/.exec(canon);
  return m ? `(${m[1]}) 9${m[2]}-${m[3]}` : canon;
}
