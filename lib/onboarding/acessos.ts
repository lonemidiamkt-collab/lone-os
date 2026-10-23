// lib/onboarding/acessos.ts — os acessos (Facebook/Meta, Instagram, Google) do link de cadastro.
//
// POR QUE (21/10/2026, auditoria de erro recuperável, item 1.1). O cliente recarregava a página e o
// login e a escolha "Não tenho"/"Convite Partner" de cada acesso sumiam: o GET não devolvia os
// logins e a página não restaurava nem os status. O salvamento automático seguinte gravava nulo por
// cima do que ele já tinha mandado. Agora:
//   · o GET devolve login e status; a senha NUNCA sai — só "senha já recebida" (sim/não);
//   · a página restaura e mostra "senha já recebida", com opção de trocar;
//   · o rascunho só apaga um login quando a página tinha mostrado esse login ao cliente e ele
//     apagou de propósito (`restaurados`). Aba aberta numa versão antiga não apaga nada.
//
// Puro (sem banco). Testado em tests/onboarding-acessos.test.ts.

export type StatusAcesso = "fill_now" | "waiting_client" | "partner_invite";
export const STATUS_ACESSO: readonly StatusAcesso[] = ["fill_now", "waiting_client", "partner_invite"];

export type Plataforma = "meta" | "instagram" | "google";

/** Onde cada acesso mora: no rascunho (client_onboarding_submissions), no formulário e na ficha (clients). */
export const ACESSOS = [
  {
    plataforma: "meta", login: "meta_login", senha: "meta_password", status: "meta_status",
    form: { login: "metaLogin", senha: "metaPassword", status: "metaStatus" },
    ficha: { login: "facebook_login", senha: "facebook_password" },
  },
  {
    plataforma: "instagram", login: "instagram_login", senha: "instagram_password", status: "instagram_status",
    form: { login: "instagramLogin", senha: "instagramPassword", status: "instagramStatus" },
    ficha: { login: "instagram_login", senha: "instagram_password" },
  },
  {
    plataforma: "google", login: "google_login", senha: "google_password", status: "google_status",
    form: { login: "googleLogin", senha: "googlePassword", status: "googleStatus" },
    ficha: { login: "google_ads_login", senha: "google_ads_password" },
  },
] as const;

/** Colunas de senha do rascunho: o GET lê só para saber se chegaram, e tira antes de responder. */
export const COLUNAS_SENHA: string[] = ACESSOS.map((a) => a.senha);

const preenchido = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Status que a tela conhece. "pending" (padrão antigo do envio) e lixo viram null. */
export function statusDeAcesso(v: unknown): StatusAcesso | null {
  return typeof v === "string" && (STATUS_ACESSO as readonly string[]).includes(v) ? (v as StatusAcesso) : null;
}

export type SenhasRecebidas = Record<Plataforma, boolean>;

/**
 * O que o GET público devolve: a linha SEM nenhuma coluna de senha, mais `senhas_recebidas`.
 * Quem tem o link é o próprio cliente, mas a senha (mesmo cifrada) não volta para o navegador.
 */
export function paraPaginaPublica(linha: Record<string, unknown>): Record<string, unknown> & { senhas_recebidas: SenhasRecebidas } {
  const senhas_recebidas = {} as SenhasRecebidas;
  for (const a of ACESSOS) senhas_recebidas[a.plataforma] = preenchido(linha[a.senha]);
  const resto: Record<string, unknown> = {};
  // Defesa a mais: qualquer coluna de senha que entrar no select por engano também não sai.
  for (const [k, v] of Object.entries(linha)) if (!/password|senha/i.test(k)) resto[k] = v;
  return { ...resto, senhas_recebidas };
}

export interface AcessoRestaurado { login: string; status: StatusAcesso | null; senhaRecebida: boolean }

/** Página: o que restaurar de cada acesso a partir da resposta do GET. */
export function lerAcessos(d: Record<string, unknown>): Record<Plataforma, AcessoRestaurado> {
  const recebidas = (d.senhas_recebidas ?? {}) as Partial<SenhasRecebidas>;
  const out = {} as Record<Plataforma, AcessoRestaurado>;
  for (const a of ACESSOS) {
    out[a.plataforma] = {
      login: preenchido(d[a.login]) ? (d[a.login] as string) : "",
      status: statusDeAcesso(d[a.status]),
      senhaRecebida: recebidas[a.plataforma] === true,
    };
  }
  return out;
}

/**
 * Colunas de acesso a gravar no RASCUNHO (auto_save e envio final), a partir do corpo da página.
 *  · senha: só a digitada — o formulário nunca recebe a senha de volta; vazio = "não mexer".
 *  · login: o digitado. Vazio só apaga com `restaurados` (a página mostrou o login gravado e o
 *    cliente apagou). Sem isso, vazio é "não sei" e não mexe.
 *  · status: o escolhido. Sem `restaurados`, "Preencher" é só o padrão da tela e não pode
 *    sobrescrever um "Não tenho"/"Convite" já gravado.
 * `cifrar` roda no servidor (lib/crypto/vault); aqui fica injetável para testar.
 */
export function acessosDoRascunho(
  campos: Record<string, unknown>,
  opts: { restaurados: boolean; cifrar: (senha: string) => string | null },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of ACESSOS) {
    const login = campos[a.form.login];
    if (preenchido(login)) out[a.login] = login.trim();
    else if (opts.restaurados) out[a.login] = null;

    const senha = campos[a.form.senha];
    if (preenchido(senha)) out[a.senha] = opts.cifrar(senha);

    const status = statusDeAcesso(campos[a.form.status]);
    if (status && (opts.restaurados || status !== "fill_now")) out[a.status] = status;
  }
  return out;
}

/**
 * Rascunho → ficha: login e senha (já cifrada no rascunho) só quando preenchidos. Vazio nunca apaga
 * o login ou a senha que a equipe já tinha na ficha (item 1.2 da auditoria de 21/10/2026).
 */
export function acessosParaFicha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of ACESSOS) {
    const login = linha[a.login];
    if (preenchido(login)) out[a.ficha.login] = login.trim();
    const senha = linha[a.senha];
    if (preenchido(senha)) out[a.ficha.senha] = senha;
  }
  return out;
}
