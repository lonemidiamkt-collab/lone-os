// lib/equipe/gestao.ts — regras da Gestão da Equipe (Área CEO). Puro: vale para a rota e para a tela.
//
// 25/10/2026 (onda 6 da auditoria de erro recuperável, itens 8.1, 8.2, 8.6, 8.7 e 8.8):
//  · desativar era um clique sem confirmação, valia para si mesmo e para o último admin, e quem foi
//    desativado sumia da lista depois do F5 — sem "Reativar" (8.1);
//  · remover não tinha volta: recriar com o mesmo e-mail dava 409 (8.2);
//  · a senha curta só era recusada depois de nome/função/WhatsApp já gravados (8.7);
//  · rebaixar um admin fixo dizia "salvo" e ele seguia admin (8.8).
// Testado em tests/equipe-gestao.test.ts.

import { ehAdminFixo } from "@/lib/auth/admins-fixos";
import { normalizarEmail } from "@/lib/equipe/email";

export const SENHA_MINIMA = 6;

export interface MembroDaEquipe {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean | null;
  deleted_at?: string | null;
}

export type Situacao = "ativo" | "desativado" | "removido";

export function situacaoDoMembro(m: Pick<MembroDaEquipe, "is_active" | "deleted_at">): Situacao {
  if (m.deleted_at) return "removido";
  return m.is_active === false ? "desativado" : "ativo";
}

/** A lista da tela em três grupos — quem saiu continua visível, com o caminho de volta. */
export function separarEquipe<T extends Pick<MembroDaEquipe, "is_active" | "deleted_at">>(lista: T[]): Record<Situacao, T[]> {
  const grupos: Record<Situacao, T[]> = { ativo: [], desativado: [], removido: [] };
  for (const m of lista) grupos[situacaoDoMembro(m)].push(m);
  return grupos;
}

/** Admins que contam para "não deixar a equipe sem admin": função admin, ativos e não removidos. */
export function contarAdminsAtivos(lista: Array<Pick<MembroDaEquipe, "role" | "is_active" | "deleted_at">>): number {
  return lista.filter((m) => m.role === "admin" && situacaoDoMembro(m) === "ativo").length;
}

export type MudancaDeAcesso = "desativar" | "remover" | "rebaixar";

/**
 * Pode tirar o acesso desta pessoa? Ninguém tranca a si mesmo nem deixa a equipe sem admin.
 * `adminsAtivos` conta a própria pessoa-alvo (se ela for admin ativa).
 */
export function podeMudarAcesso(p: {
  alvo: Pick<MembroDaEquipe, "email" | "role" | "is_active" | "deleted_at" | "name">;
  euEmail: string;
  adminsAtivos: number;
  mudanca: MudancaDeAcesso;
}): { ok: true } | { ok: false; erro: string } {
  const souEu = normalizarEmail(p.alvo.email) === normalizarEmail(p.euEmail);
  if (souEu) {
    const frase = p.mudanca === "desativar" ? "desativar a si mesmo"
      : p.mudanca === "remover" ? "remover a si mesmo"
      : "tirar o seu próprio acesso de administrador";
    return { ok: false, erro: `Você não pode ${frase} — peça a outro administrador.` };
  }
  const alvoEhAdminAtivo = p.alvo.role === "admin" && situacaoDoMembro(p.alvo) === "ativo";
  if (alvoEhAdminAtivo && p.adminsAtivos <= 1) {
    return { ok: false, erro: `${p.alvo.name} é o último administrador ativo. Promova outra pessoa a administrador antes.` };
  }
  return { ok: true };
}

/** Senha nova no editar: vazia = mantém. Conferida ANTES de gravar qualquer outra coisa (8.7). */
export function validarSenhaNova(senha: string): { ok: true; trocar: boolean } | { ok: false; erro: string } {
  const s = senha.trim();
  if (!s) return { ok: true, trocar: false };
  if (s.length < SENHA_MINIMA) {
    return { ok: false, erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres (tem ${s.length}). Nada foi salvo.` };
  }
  return { ok: true, trocar: true };
}

/**
 * Aviso quando a função de um admin fixo deixa de ser admin: a tela não pode dizer "salvo" como se o
 * acesso tivesse mudado (8.8). Devolve null quando não há o que avisar.
 */
export function avisoAdminFixo(nome: string, email: string, papelNovo: string): string | null {
  if (!ehAdminFixo(email) || papelNovo === "admin") return null;
  return `${nome} continua administrador no servidor: o e-mail está na lista fixa dos sócios. A função muda o menu e as carteiras, não esse acesso.`;
}

/** Texto da confirmação de desativar (com o nome — 8.1). */
export function confirmacaoDesativar(nome: string): string {
  return `Desativar ${nome}? A pessoa perde o acesso em até 1 minuto e some da tela de login. O cadastro, a carteira e o histórico ficam — dá para reativar depois em "Desativados".`;
}

/** Texto da confirmação de remover (com o nome — 8.2). */
export function confirmacaoRemover(nome: string, email: string): string {
  return `Remover ${nome} (${email}) da equipe? O login é bloqueado na hora e o WhatsApp deixa de valer para o agente. O histórico de quem fez o quê fica. Dá para restaurar em "Removidos".`;
}
