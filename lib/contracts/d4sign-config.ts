// lib/contracts/d4sign-config.ts — as chaves da D4Sign coladas no PAINEL (Configurações › Jurídico, só admin),
// com o .env da VPS de reserva.
//
// Pedido de 26/10/2026: o Roberto não edita o .env do servidor; ele cola as chaves na tela. Como fica seguro:
//   · Cifradas com AES-256-GCM pela VAULT_KEY do servidor (lib/crypto/vault.ts, a mesma do Cofre de Acessos).
//     Um vazamento do banco sozinho não entrega a chave: falta a VAULT_KEY, que só existe no .env.
//   · Tabela d4sign_config com RLS ligado e SEM policy: só o servidor (service role) lê. Nem o texto cifrado
//     vai para o navegador — o token da Meta, em agency_settings, volta inteiro para a tela; este não.
//   · A tela nunca mostra a chave de volta: só "configurada em dd/mm por fulano" e de onde vem (painel ou
//     servidor). Trocar é colar de novo; apagar do painel volta a valer o .env.
//   · Toda troca, remoção e teste fica no histórico da própria linha (quem, quando, quais campos — nunca o valor).
// Ordem: o que está no painel vale; campo vazio no painel cai no .env (D4SIGN_*).

import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptVault, encryptVault } from "@/lib/crypto/vault";
import { cadastrarWebhookDoCofre, configD4Sign, listaDeEmails, listarCofre, type ConfigD4Sign } from "./d4sign";

export type CampoD4Sign = "token" | "cryptKey" | "hmac" | "cofre" | "emailsLone";
export const CAMPOS_D4SIGN: CampoD4Sign[] = ["token", "cryptKey", "hmac", "cofre", "emailsLone"];
/** Não são segredo: ficam em texto e a tela mostra. */
const ABERTOS: CampoD4Sign[] = ["cofre", "emailsLone"];
const COLUNA: Record<CampoD4Sign, string> = { token: "token", cryptKey: "crypt_key", hmac: "hmac", cofre: "cofre", emailsLone: "emails_lone" };
const VARIAVEL: Record<CampoD4Sign, string> = {
  token: "D4SIGN_API_TOKEN", cryptKey: "D4SIGN_CRYPT_KEY", hmac: "D4SIGN_HMAC_SECRET", cofre: "D4SIGN_SAFE_UUID",
  emailsLone: "D4SIGN_EMAILS_LONE",
};
export const ROTULO_CAMPO: Record<CampoD4Sign, string> = {
  token: "Token da API (tokenAPI)", cryptKey: "Chave de criptografia (cryptKey)",
  hmac: "Segredo do webhook (Secret Key MAC)", cofre: "Identificador do cofre dos contratos",
  emailsLone: "E-mails de quem assina pela Lone",
};

export type PainelD4Sign = Partial<Record<CampoD4Sign, string | null>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Painel primeiro, .env de reserva, campo a campo. Pura. */
export function mesclarConfig(painel: PainelD4Sign | null, env: Record<string, string | undefined> = process.env): ConfigD4Sign | null {
  const junto: Record<string, string | undefined> = { ...env };
  for (const c of CAMPOS_D4SIGN) {
    const v = painel?.[c]?.trim();
    if (v) junto[VARIAVEL[c]] = v;
  }
  return configD4Sign(junto);
}

/** O valor de um campo pela régua de cada um. null = válido; texto = o que está errado. Pura. */
export function validarCampo(campo: CampoD4Sign, valor: string): string | null {
  const v = valor.trim();
  if (!v) return `${ROTULO_CAMPO[campo]}: vazio`;
  if (campo === "emailsLone") {
    const itens = v.split(/[,;\s]+/).filter(Boolean);
    const ruins = itens.filter((e) => !listaDeEmails(e).length);
    return ruins.length ? `${ROTULO_CAMPO[campo]}: "${ruins[0]}" não é e-mail` : null;
  }
  if (/\s/.test(v)) return `${ROTULO_CAMPO[campo]}: tem espaço no meio — confira se colou inteiro`;
  if (campo === "cofre" && !UUID.test(v)) return `${ROTULO_CAMPO[campo]}: precisa ser o UUID do cofre (formato xxxxxxxx-xxxx-…)`;
  if ((campo === "token" || campo === "cryptKey") && v.length < 10) return `${ROTULO_CAMPO[campo]}: curto demais para ser a chave da D4Sign`;
  if (campo === "hmac" && v.length < 8) return `${ROTULO_CAMPO[campo]}: curto demais`;
  if (v.length > 500) return `${ROTULO_CAMPO[campo]}: longo demais`;
  return null;
}

interface LinhaConfig {
  token?: string | null;
  crypt_key?: string | null;
  hmac?: string | null;
  cofre?: string | null;
  atualizado_em?: string | null;
  atualizado_por?: string | null;
  testado_em?: string | null;
  teste_ok?: boolean | null;
  teste_resultado?: string | null;
  historico?: unknown;
}

const TABELA = "d4sign_config";
let cache: { em: number; painel: PainelD4Sign | null } | null = null;
const VALIDADE_MS = 30_000;

/** Para os testes e depois de salvar. */
export function esquecerConfigD4Sign(): void { cache = null; }

async function lerLinha(): Promise<{ linha: LinhaConfig | null; erro: string | null }> {
  const r = await supabaseAdmin.from(TABELA).select("*").eq("id", 1).maybeSingle();
  return { linha: (r.data as LinhaConfig | null) ?? null, erro: r.error?.message ?? null };
}

function decifrar(linha: LinhaConfig | null): PainelD4Sign | null {
  if (!linha) return null;
  const painel: PainelD4Sign = {};
  for (const c of CAMPOS_D4SIGN) {
    const bruto = linha[COLUNA[c] as keyof LinhaConfig] as string | null | undefined;
    if (!bruto) continue;
    try { painel[c] = ABERTOS.includes(c) ? bruto : decryptVault(bruto); }
    catch (e) { console.error(`[d4sign-config] não consegui decifrar ${c} (VAULT_KEY trocada?):`, e instanceof Error ? e.message : e); }
  }
  return painel;
}

/**
 * A configuração que vale agora (painel + .env), com cache de 30 s. Banco fora do ar = vale só o .env
 * (e o log diz). Nunca lança.
 */
export async function carregarConfigD4Sign(env: Record<string, string | undefined> = process.env): Promise<ConfigD4Sign | null> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return mesclarConfig(cache.painel, env);
  try {
    const { linha, erro } = await lerLinha();
    if (erro) {
      console.warn(`[d4sign-config] não li as chaves do painel (${erro}) — vale o .env`);
      return mesclarConfig(null, env);
    }
    const painel = decifrar(linha);
    cache = { em: Date.now(), painel };
    return mesclarConfig(painel, env);
  } catch (e) {
    console.warn("[d4sign-config] chaves do painel indisponíveis — vale o .env:", e instanceof Error ? e.message : e);
    return mesclarConfig(null, env);
  }
}

export interface EntradaHistorico { quem: string; quando: string; acao: "trocou" | "apagou" | "testou" | "ligou o webhook"; campos: string[]; resultado?: string }

export interface SituacaoConfig {
  campos: Record<CampoD4Sign, { configurado: boolean; origem: "painel" | "servidor" | null }>;
  /** O cofre e os e-mails da Lone não são segredo: aparecem inteiros, para conferir. */
  cofre: string | null;
  emailsLone: string[];
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  testadoEm: string | null;
  testeOk: boolean | null;
  testeResultado: string | null;
  historico: EntradaHistorico[];
  ligada: boolean;
}

const lerHistorico = (v: unknown): EntradaHistorico[] =>
  Array.isArray(v) ? v.filter((x): x is EntradaHistorico => !!x && typeof x === "object" && typeof (x as EntradaHistorico).quem === "string") : [];

/** O que a tela mostra: configurado ou não, de onde, quando e por quem. Nunca o valor de um segredo. */
export async function situacaoDaConfig(env: Record<string, string | undefined> = process.env): Promise<{ ok: true; situacao: SituacaoConfig } | { ok: false; erro: string }> {
  const { linha, erro } = await lerLinha();
  if (erro) return { ok: false, erro: /d4sign_config/.test(erro) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : erro };
  const painel = decifrar(linha);
  const campos = {} as SituacaoConfig["campos"];
  for (const c of CAMPOS_D4SIGN) {
    const doPainel = !!painel?.[c];
    const doServidor = !!env[VARIAVEL[c]]?.trim();
    campos[c] = { configurado: doPainel || doServidor, origem: doPainel ? "painel" : doServidor ? "servidor" : null };
  }
  const cfg = mesclarConfig(painel, env);
  return {
    ok: true,
    situacao: {
      campos, cofre: cfg?.cofre ?? (painel?.cofre || env.D4SIGN_SAFE_UUID?.trim() || null),
      emailsLone: cfg?.emailsLone ?? listaDeEmails(painel?.emailsLone || env.D4SIGN_EMAILS_LONE),
      atualizadoEm: linha?.atualizado_em ?? null, atualizadoPor: linha?.atualizado_por ?? null,
      testadoEm: linha?.testado_em ?? null, testeOk: linha?.teste_ok ?? null, testeResultado: linha?.teste_resultado ?? null,
      historico: lerHistorico(linha?.historico).slice(0, 10),
      ligada: !!cfg,
    },
  };
}

/**
 * Grava (cifrado) os campos colados e apaga os pedidos. Só o que veio preenchido muda. Valida antes;
 * sem VAULT_KEY no servidor, recusa — chave em texto puro no banco não entra.
 */
export async function salvarConfigD4Sign(p: { novos: PainelD4Sign; apagar: CampoD4Sign[]; quem: string }): Promise<{ ok: true } | { ok: false; erro: string }> {
  const novos = CAMPOS_D4SIGN.filter((c) => typeof p.novos[c] === "string" && p.novos[c]!.trim());
  const apagar = p.apagar.filter((c) => CAMPOS_D4SIGN.includes(c) && !novos.includes(c));
  if (!novos.length && !apagar.length) return { ok: false, erro: "Nada para salvar: cole ao menos uma chave." };
  const invalidos = novos.map((c) => validarCampo(c, p.novos[c]!)).filter((x): x is string => !!x);
  if (invalidos.length) return { ok: false, erro: invalidos.join(" · ") };

  const campos: Record<string, string | null> = {};
  try {
    for (const c of novos) {
      campos[COLUNA[c]] = c === "emailsLone" ? listaDeEmails(p.novos[c]).join(", ")
        : ABERTOS.includes(c) ? p.novos[c]!.trim() : encryptVault(p.novos[c]!.trim());
    }
  } catch (e) {
    return { ok: false, erro: `Não salvei: o servidor está sem a chave de cifra (VAULT_KEY). ${e instanceof Error ? e.message.split(".")[0] : ""}`.trim() };
  }
  for (const c of apagar) campos[COLUNA[c]] = null;

  const { linha, erro } = await lerLinha();
  if (erro) return { ok: false, erro: /d4sign_config/.test(erro) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `Não li a configuração atual: ${erro}` };
  const agora = new Date().toISOString();
  const entradas: EntradaHistorico[] = [
    ...(novos.length ? [{ quem: p.quem, quando: agora, acao: "trocou" as const, campos: novos.map((c) => ROTULO_CAMPO[c]) }] : []),
    ...(apagar.length ? [{ quem: p.quem, quando: agora, acao: "apagou" as const, campos: apagar.map((c) => ROTULO_CAMPO[c]) }] : []),
  ];
  const historico = [...entradas, ...lerHistorico(linha?.historico)].slice(0, 30);
  const r = await supabaseAdmin.from(TABELA).upsert({
    id: 1, ...campos, atualizado_em: agora, atualizado_por: p.quem, historico,
    // Chave trocada: o teste anterior não vale mais.
    testado_em: null, teste_ok: null, teste_resultado: null,
  }, { onConflict: "id" });
  esquecerConfigD4Sign();
  if (r.error) return { ok: false, erro: `Não salvei: ${r.error.message}` };
  return { ok: true };
}

/** "Testar": lê o cofre na D4Sign com a configuração que vale agora e guarda o resultado. 1 chamada. */
export async function testarConfigD4Sign(quem: string): Promise<{ ok: boolean; resultado: string }> {
  esquecerConfigD4Sign();
  const cfg = await carregarConfigD4Sign();
  let ok = false;
  let resultado: string;
  if (!cfg) resultado = "Falta o token da API.";
  else if (!cfg.cofre) resultado = "Falta o identificador do cofre dos contratos.";
  else {
    const r = await listarCofre(cfg, cfg.cofre, "manual");
    ok = r.ok;
    resultado = r.ok
      ? `Funcionou: a D4Sign abriu o cofre e devolveu ${r.dados.length} documento(s).${cfg.hmac ? "" : " Falta o segredo do webhook (Secret Key MAC) para conferir os avisos da D4Sign."}`
      : `Não funcionou: ${r.erro}`;
  }
  const { linha } = await lerLinha();
  const agora = new Date().toISOString();
  const historico = [{ quem, quando: agora, acao: "testou" as const, campos: [], resultado: ok ? "funcionou" : "falhou" }, ...lerHistorico(linha?.historico)].slice(0, 30);
  if (linha) await supabaseAdmin.from(TABELA).update({ testado_em: agora, teste_ok: ok, teste_resultado: resultado.slice(0, 300), historico }).eq("id", 1);
  return { ok, resultado };
}

/** O endereço que a D4Sign chama: o webhook deste painel. */
export const urlDoWebhookD4Sign = (env: Record<string, string | undefined> = process.env) =>
  `${(env.NEXT_PUBLIC_APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "")}/api/integracoes/d4sign`;

/**
 * "Ligar o aviso da D4Sign": cadastra o webhook 2.0 do cofre apontando para este painel (1 chamada). Exige
 * token, cofre e o segredo do webhook — sem o segredo a porta do webhook recusa tudo, então nem cadastra.
 * Antes, na D4Sign: Opções da conta › Dev (API) › Webhook › Ativar Webhook 2.0.
 */
export async function ligarWebhookD4Sign(quem: string): Promise<{ ok: boolean; resultado: string }> {
  esquecerConfigD4Sign();
  const cfg = await carregarConfigD4Sign();
  let ok = false;
  let resultado: string;
  if (!cfg) resultado = "Falta o token da API.";
  else if (!cfg.cofre) resultado = "Falta o identificador do cofre dos contratos.";
  else if (!cfg.hmac) resultado = "Falta o segredo do webhook (Secret Key MAC): sem ele o Lone OS recusa os avisos da D4Sign.";
  else {
    const url = urlDoWebhookD4Sign();
    const r = await cadastrarWebhookDoCofre(cfg, cfg.cofre, url);
    ok = r.ok;
    resultado = r.ok
      ? `Ligado: a D4Sign vai avisar ${url} de cada assinatura no cofre dos contratos.`
      : `Não ligou: ${r.erro}. Confira se o Webhook 2.0 está ativado na D4Sign (Opções da conta › Dev (API) › Webhook).`;
  }
  const { linha } = await lerLinha();
  const historico = [{ quem, quando: new Date().toISOString(), acao: "ligou o webhook" as const, campos: [], resultado: ok ? "funcionou" : "falhou" }, ...lerHistorico(linha?.historico)].slice(0, 30);
  if (linha) await supabaseAdmin.from(TABELA).update({ historico }).eq("id", 1);
  return { ok, resultado };
}
