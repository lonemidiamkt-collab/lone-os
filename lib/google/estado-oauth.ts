// lib/google/estado-oauth.ts — o `state` do consentimento do Google: assinado (HMAC) e com o DESTINO de
// volta. O callback (/api/auth/google/callback) é público no middleware — o navegador volta do Google sem
// sessão —, então é o state assinado que prova que o fluxo começou dentro do Lone OS. Vale 10 minutos.
// Destinos: "prospeccao" (piloto antigo) e "comercial" (Agenda do comercial.lonemidia.com, out/2026).

import { createHmac, timingSafeEqual } from "crypto";

export type DestinoGoogle = "prospeccao" | "comercial";
const DESTINOS: DestinoGoogle[] = ["prospeccao", "comercial"];
const segredo = () => process.env.CRON_SECRET || process.env.VAULT_KEY || "lone";
const mac = (ts: string, destino: string) => createHmac("sha256", segredo()).update(`${ts}.${destino}`).digest("hex").slice(0, 32);

export function assinarState(destino: DestinoGoogle, agora = Date.now()): string {
  const ts = agora.toString(36);
  return `${ts}.${destino}.${mac(ts, destino)}`;
}

export function lerState(state: string | null, agora = Date.now()): { valido: boolean; destino: DestinoGoogle } {
  const invalido = { valido: false, destino: "prospeccao" as DestinoGoogle };
  if (!state) return invalido;
  const [ts, destino, m] = state.split(".");
  if (!ts || !destino || !m || !DESTINOS.includes(destino as DestinoGoogle)) return invalido;
  const idade = agora - parseInt(ts, 36);
  if (!Number.isFinite(idade) || idade < 0 || idade > 10 * 60_000) return invalido;
  const a = Buffer.from(m), b = Buffer.from(mac(ts, destino));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return invalido;
  return { valido: true, destino: destino as DestinoGoogle };
}
