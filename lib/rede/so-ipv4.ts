// lib/rede/so-ipv4.ts — as conexões de saída do servidor usam só IPv4.
//
// POR QUE (29/10/2026). As rotinas caíam com "fetch failed" + "AggregateError ETIMEDOUT" cerca de
// 270 ms depois de começar a chamada (defense-scan, conferência do token da Meta, radar do Instagram,
// "Meta insights de hoje"). Queda de rede de verdade leva 10 s para desistir; 270 ms é o relógio do
// "happy eyeballs" do Node 20: ele dá 250 ms para o endereço IPv4 conectar e, se não deu, pula para o
// IPv6. Dentro do container o IPv6 não existe (ENETUNREACH na hora), então a chamada inteira falha.
//
// Basta o processo ficar ocupado uns décimos de segundo logo depois de abrir a conexão (rotinas em
// paralelo, PDF, JSON grande, a VPS com 7–15% de CPU "roubada" pelo provedor no horário comercial)
// para o relógio estourar com a conexão já feita. Reproduzido no servidor: processo ocupado 400 ms
// depois da tentativa → 10 de 10 conexões com ETIMEDOUT no padrão do Node; 10 de 10 ok só com IPv4.
//
// Sem a escolha automática, o Node usa o primeiro endereço (IPv4, pela ordem abaixo) e espera o
// tempo normal do TCP. REDE_IPV6=1 volta ao padrão, caso o container ganhe IPv6 um dia.

import dns from "node:dns";
import net from "node:net";

export function usarSoIpv4(env: Record<string, string | undefined> = process.env): boolean {
  if (env.REDE_IPV6 === "1") return false;
  dns.setDefaultResultOrder("ipv4first");
  net.setDefaultAutoSelectFamily?.(false);
  return true;
}
