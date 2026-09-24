// lib/clients/cofre.ts — O COFRE DE ACESSOS COM STATUS (Leva 7C, N24). Módulo PURO.
//
// Antes o cofre só sabia "tem login / não tem". Login preenchido não prova que o acesso funciona —
// senha trocada pelo cliente, 2FA no celular do sobrinho, conta desativada — e o time descobria na
// hora de subir o anúncio. Agora cada plataforma tem um estado que ALGUÉM conferiu:
//   ok        — alguém entrou e funcionou
//   pendente  — falta (sem login, ou recebido e ainda não testado)
//   inválido  — tentou e não entrou
// e o pedido por link: o cliente digita login e senha numa página própria e a senha entra cifrada no
// cofre, sem passar pelo WhatsApp. Revelar a senha continua só para quem já podia (/api/client-vault).

export type Plataforma = "meta" | "instagram" | "google";
export type StatusAcesso = "ok" | "pendente" | "invalido";

export interface InfoPlataforma {
  id: Plataforma;
  rotulo: string;
  /** Colunas em `clients`. A senha é CIFRADA (lib/crypto/vault). */
  colunaLogin: "facebook_login" | "instagram_login" | "google_ads_login";
  colunaSenha: "facebook_password" | "instagram_password" | "google_ads_password";
  /** Quem trabalha com este acesso (além da gestão). É o mesmo recorte do cofre na ficha. */
  papel: "traffic" | "social";
  /** Onde testar. */
  url: string;
  /** O que pedir ao cliente na página do link. */
  dica: string;
}

export const PLATAFORMAS: readonly InfoPlataforma[] = [
  { id: "meta", rotulo: "Meta / Facebook Ads", colunaLogin: "facebook_login", colunaSenha: "facebook_password", papel: "traffic",
    url: "https://business.facebook.com", dica: "O e-mail ou telefone e a senha do Facebook que administra a página e a conta de anúncios." },
  { id: "instagram", rotulo: "Instagram", colunaLogin: "instagram_login", colunaSenha: "instagram_password", papel: "social",
    url: "https://www.instagram.com/accounts/login/", dica: "O usuário (@) e a senha do Instagram da empresa." },
  { id: "google", rotulo: "Google Ads", colunaLogin: "google_ads_login", colunaSenha: "google_ads_password", papel: "traffic",
    url: "https://ads.google.com", dica: "O e-mail da conta Google que acessa o Google Ads e a senha dela." },
] as const;

export const ROTULO_STATUS: Record<StatusAcesso, string> = { ok: "Ok", pendente: "Pendente", invalido: "Inválido" };

export function infoPlataforma(p: string | null | undefined): InfoPlataforma | null {
  return PLATAFORMAS.find((x) => x.id === p) ?? null;
}

export function ehStatus(s: unknown): s is StatusAcesso {
  return s === "ok" || s === "pendente" || s === "invalido";
}

/** Gestão vê e mexe em tudo; tráfego no Meta e Google; social no Instagram. Designer e comercial, nada. */
export function podeMexer(papel: string | null | undefined, p: Plataforma): boolean {
  if (papel === "admin" || papel === "manager") return true;
  const info = infoPlataforma(p);
  return !!info && info.papel === papel;
}

export interface PedidoResumo { status: "aberto" | "recebido" | "cancelado"; criadoEm: string; expiraEm: string; recebidoEm: string | null }

export interface EstadoAcesso {
  status: StatusAcesso;
  /** Frase curta para quem olha o cartão. */
  motivo: string;
  /** Pedido por link ainda valendo (aberto e não vencido). */
  pedidoAberto: boolean;
  /** Chegou pelo link DEPOIS da última conferência: falta alguém testar. */
  recebidoSemConferir: boolean;
}

/**
 * O estado que a tela mostra, a partir do que está gravado.
 *   · Status conferido vale — MAS se o cliente mandou credencial nova pelo link depois disso, a
 *     conferência antiga não vale mais para esta senha: volta a "pendente, recebido — testar".
 *   · Sem conferência: sem login = pendente; com login = pendente ("nunca conferido").
 */
export function estadoDoAcesso(e: {
  temLogin: boolean;
  gravado: { status: StatusAcesso; atualizadoEm: string } | null;
  pedido: PedidoResumo | null;
  agora?: Date;
}): EstadoAcesso {
  const agora = e.agora ?? new Date();
  const pedidoAberto = !!e.pedido && e.pedido.status === "aberto" && new Date(e.pedido.expiraEm).getTime() > agora.getTime();
  const recebidoEm = e.pedido?.status === "recebido" ? e.pedido.recebidoEm : null;
  const recebidoSemConferir = !!recebidoEm && (!e.gravado || new Date(recebidoEm).getTime() > new Date(e.gravado.atualizadoEm).getTime());

  if (recebidoSemConferir) return { status: "pendente", motivo: "Recebido pelo link — falta testar", pedidoAberto, recebidoSemConferir };
  if (e.gravado) {
    const motivo = e.gravado.status === "ok" ? "Conferido e funcionando"
      : e.gravado.status === "invalido" ? "Tentaram entrar e não funcionou" : "Marcado como pendente";
    return { status: e.gravado.status, motivo, pedidoAberto, recebidoSemConferir };
  }
  if (pedidoAberto) return { status: "pendente", motivo: "Pedido enviado ao cliente — esperando", pedidoAberto, recebidoSemConferir };
  return { status: "pendente", motivo: e.temLogin ? "Tem login, nunca conferido" : "Sem login no cofre", pedidoAberto, recebidoSemConferir };
}

/** Limpa o que o cliente digitou na página do link. Devolve o erro em frase, para a própria página. */
export function validarCredencial(login: unknown, senha: unknown): { ok: true; login: string; senha: string } | { ok: false; erro: string } {
  const l = typeof login === "string" ? login.trim() : "";
  const s = typeof senha === "string" ? senha : "";
  if (!l) return { ok: false, erro: "Informe o login (e-mail, telefone ou usuário)." };
  if (l.length > 200) return { ok: false, erro: "O login está longo demais." };
  if (!s.trim()) return { ok: false, erro: "Informe a senha." };
  if (s.length > 200) return { ok: false, erro: "A senha está longa demais." };
  return { ok: true, login: l, senha: s };
}

/** Token do link (128 bits, não enumerável). Mesmo formato forte do onboarding. */
export function tokenValido(t: string | null | undefined): boolean {
  return typeof t === "string" && /^ac-[0-9a-f]{32}$/.test(t);
}
