// lib/academy/assinatura.ts — assinatura dos pedidos Lone OS → Lone Academy (HMAC-SHA256).
// CÓPIA de lone-academy/lib/assinatura-lone-os.ts: o texto assinado tem que ser idêntico nos dois.
// "<timestamp>.<MÉTODO>.<caminho com ?query>.<corpo>" — mudar qualquer pedaço invalida o pedido.

import { createHmac } from "node:crypto";

export const textoAssinado = (ts: string, metodo: string, caminho: string, corpo: string) =>
  `${ts}.${metodo.toUpperCase()}.${caminho}.${corpo}`;

export const assinar = (segredo: string, texto: string) =>
  `sha256=${createHmac("sha256", segredo).update(texto).digest("hex")}`;
