// lib/google/credencial.ts — confere a credencial do app do Google (Client ID + segredo) ANTES de guardar.
//
// Por quê (18/10/2026): o Roberto colou o Client ID nos dois campos; a tela aceitou, escondeu o formulário
// e a conexão falhou com "client secret is invalid" sem caminho para corrigir. Agora:
//   1) formato — o segredo não pode ser o próprio Client ID;
//   2) o par é testado no Google com um código falso: credencial certa → `invalid_grant` (o código é que é
//      falso); segredo errado ou cliente inexistente → `invalid_client`.
// Puro (sem rede) — a chamada ao Google fica em lib/prospeccao/google.ts (conferirNoGoogle).

const SUFIXO_ID = /\.apps\.googleusercontent\.com$/;

/** Erro de formato, em português para a tela; null = formato ok. */
export function problemaNoFormato(id: string, secret: string): string | null {
  if (!SUFIXO_ID.test(id)) return "O Client ID termina em .apps.googleusercontent.com — confira o que foi colado.";
  if (secret === id || SUFIXO_ID.test(secret)) return "No campo do segredo foi colado o Client ID. Copie a \"Chave secreta do cliente\" (começa com GOCSPX-).";
  if (secret.length < 15 || /\s/.test(secret)) return "Segredo do cliente inválido — copie de novo a \"Chave secreta do cliente\" (começa com GOCSPX-).";
  return null;
}

/** Lê a resposta do Google ao teste com código falso. "indefinido" = não deu para concluir (rede, resposta nova). */
export function lerTesteNoGoogle(r: { error?: string; error_description?: string } | null): "ok" | "segredo_errado" | "cliente_inexistente" | "indefinido" {
  if (!r?.error) return "indefinido";
  if (r.error === "invalid_grant") return "ok";
  if (r.error === "invalid_client") return /not found|deleted/i.test(r.error_description ?? "") ? "cliente_inexistente" : "segredo_errado";
  return "indefinido";
}

/** Motivo que o callback devolve → frase que o Roberto entende e sabe o que fazer. */
export function motivoLegivel(motivo: string | null): string {
  const m = motivo ?? "";
  if (/client secret is invalid|invalid_client/i.test(m)) return "o segredo do cliente não confere. Clique em \"trocar credencial\" e cole a Chave secreta (GOCSPX-…).";
  if (/access_denied/i.test(m)) return "a permissão não foi concedida na tela do Google. Tente de novo e clique em Permitir.";
  if (m === "state") return "o pedido expirou (mais de 10 minutos). Clique em Conectar de novo.";
  if (/refresh_token/i.test(m)) return "o Google não devolveu o acesso permanente. Remova o Lone OS em myaccount.google.com/permissions e conecte de novo.";
  return m || "erro";
}
