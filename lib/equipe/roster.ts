// lib/equipe/roster.ts — a linha da equipe como a tela vê. Puro (usado pela rota e pelo navegador).
//
// DUAS FORMAS (Fase 0, leva 0B, 25/11/2026). A tela de login precisa da lista ANTES de alguém entrar,
// então /api/team/roster é pública. Ela devolvia o e-mail de cada pessoa e o final do WhatsApp para
// qualquer um na internet — e o id era derivado do e-mail. Agora:
//  · perfilPublico: só o que a tela de login mostra — id da equipe (uuid), nome, iniciais e função;
//  · perfilCompleto: com sessão válida — e-mail, id da equipe e final do WhatsApp.
// O id é o MESMO nas duas (team_members.id): a pessoa escolhe a foto na lista pública e, depois de
// entrar, a lista completa substitui a pública sem trocar o id de ninguém.
// Testado em tests/roster-publico.test.ts.

export interface LinhaDaEquipe {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  initials?: string | null;
  whatsapp_phone?: string | null;
}

export interface PerfilPublico {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
}

export interface PerfilCompleto extends PerfilPublico {
  email: string;
  teamMemberId: string;
  /** Últimos 4 dígitos do WhatsApp (null = a pessoa é MUDA para o agente). Nunca o número inteiro. */
  whatsappFinal: string | null;
}

/** Cor por papel — o banco guarda quem a pessoa é, a aparência é decisão da interface. */
const COR: Record<string, string> = {
  admin: "text-[#0d4af5]",
  manager: "text-[#0d4af5]",
  comercial: "text-[#0d4af5]",
  social: "text-[#3b6ff5]",
  designer: "text-[#3b6ff5]",
  traffic: "text-[#3b6ff5]",
};

export const corDoPapel = (papel: string): string => COR[papel] ?? "text-[#3b6ff5]";

export const iniciaisDe = (nome: string, iniciais?: string | null): string =>
  (iniciais ?? "").trim() || nome.trim().slice(0, 2).toUpperCase();

export function perfilPublico(m: LinhaDaEquipe): PerfilPublico {
  return { id: m.id, name: m.name, role: m.role, initials: iniciaisDe(m.name, m.initials), color: corDoPapel(m.role) };
}

export function perfilCompleto(m: LinhaDaEquipe): PerfilCompleto {
  return {
    ...perfilPublico(m),
    email: (m.email ?? "").trim().toLowerCase(),
    teamMemberId: m.id,
    whatsappFinal: m.whatsapp_phone ? String(m.whatsapp_phone).slice(-4) : null,
  };
}
