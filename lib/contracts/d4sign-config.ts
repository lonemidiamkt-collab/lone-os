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
import {
  cadastrarWebhookDoCofre, configD4Sign, listaDeEmails, listaDeUuids, listarCofresDaConta, listarPendentesDaConta, type ConfigD4Sign,
} from "./d4sign";

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
  hmac: "Segredo do webhook (Secret Key MAC)", cofre: "Cofres dos contratos",
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
  if (campo === "cofre") {
    const ruins = v.split(/[,;\s]+/).filter(Boolean).filter((u) => !UUID.test(u));
    return ruins.length ? `${ROTULO_CAMPO[campo]}: "${ruins[0]}" precisa ser o UUID de um cofre (formato xxxxxxxx-xxxx-…)` : null;
  }
  if (/\s/.test(v)) return `${ROTULO_CAMPO[campo]}: tem espaço no meio — confira se colou inteiro`;
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
  /** Cofres em que o webhook 2.0 já foi cadastrado (UUIDs separados por vírgula; migration 20261026170000). */
  webhook_cofres?: string | null;
  atualizado_em?: string | null;
  atualizado_por?: string | null;
  testado_em?: string | null;
  teste_ok?: boolean | null;
  teste_resultado?: string | null;
  historico?: unknown;
  /** Conferência do código do aviso (migration 20261028120000). */
  hmac_conferiu_em?: string | null;
  hmac_variante?: string | null;
  hmac_falhou_em?: string | null;
  hmac_recebido?: string | null;
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

/** Os cofres em que o aviso (webhook 2.0) já está ligado. */
const cofresComAviso = (linha: LinhaConfig | null) => listaDeUuids(linha?.webhook_cofres);

export interface SituacaoConfig {
  campos: Record<CampoD4Sign, { configurado: boolean; origem: "painel" | "servidor" | null }>;
  /** Os cofres e os e-mails da Lone não são segredo: aparecem inteiros, para conferir. */
  cofres: string[];
  /** Cofres escolhidos em que o aviso da D4Sign já foi ligado. */
  cofresComAviso: string[];
  emailsLone: string[];
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  testadoEm: string | null;
  testeOk: boolean | null;
  testeResultado: string | null;
  historico: EntradaHistorico[];
  ligada: boolean;
  /**
   * O código que a D4Sign manda em cada aviso bate com o segredo colado? `segredoErrado` = o último aviso não bateu
   * (e nenhum bateu depois): o Lone OS relê o contrato mesmo assim, mas o segredo precisa ser colado de novo.
   */
  aviso: { conferiuEm: string | null; falhouEm: string | null; recebido: string | null; segredoErrado: boolean };
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
      campos, cofres: cfg?.cofres ?? listaDeUuids(painel?.cofre || env.D4SIGN_SAFE_UUID),
      cofresComAviso: cofresComAviso(linha).filter((c) => (cfg?.cofres ?? []).includes(c)),
      emailsLone: cfg?.emailsLone ?? listaDeEmails(painel?.emailsLone || env.D4SIGN_EMAILS_LONE),
      atualizadoEm: linha?.atualizado_em ?? null, atualizadoPor: linha?.atualizado_por ?? null,
      testadoEm: linha?.testado_em ?? null, testeOk: linha?.teste_ok ?? null, testeResultado: linha?.teste_resultado ?? null,
      historico: lerHistorico(linha?.historico).slice(0, 10),
      ligada: !!cfg,
      aviso: {
        conferiuEm: linha?.hmac_conferiu_em ?? null, falhouEm: linha?.hmac_falhou_em ?? null, recebido: linha?.hmac_recebido ?? null,
        segredoErrado: segredoErrado(linha?.hmac_conferiu_em ?? null, linha?.hmac_falhou_em ?? null),
      },
    },
  };
}

/** O último aviso não bateu e nenhum bateu depois. Pura. */
export function segredoErrado(conferiuEm: string | null, falhouEm: string | null): boolean {
  return !!falhouEm && (!conferiuEm || falhouEm > conferiuEm);
}

/**
 * Registra como foi a conferência do código de um aviso da D4Sign (o painel mostra). Só datas, a variante que bateu
 * e o FORMATO do que chegou — nunca o segredo nem o código. Nunca lança.
 */
export async function registrarConferenciaDoAviso(r: { ok: boolean; variante: string | null; recebido: string }): Promise<void> {
  const agora = new Date().toISOString();
  const campos = r.ok ? { hmac_conferiu_em: agora, hmac_variante: r.variante } : { hmac_falhou_em: agora, hmac_recebido: r.recebido };
  const u = await supabaseAdmin.from(TABELA).update(campos).eq("id", 1);
  if (u.error) console.warn(`[d4sign-config] não registrei a conferência do aviso: ${u.error.message}`);
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
        : c === "cofre" ? listaDeUuids(p.novos[c]).join(", ")
        : ABERTOS.includes(c) ? p.novos[c]!.trim() : encryptVault(p.novos[c]!.trim());
    }
  } catch (e) {
    return { ok: false, erro: `Não salvei: o servidor está sem a chave de cifra (VAULT_KEY). ${e instanceof Error ? e.message.split(".")[0] : ""}`.trim() };
  }
  for (const c of apagar) campos[COLUNA[c]] = null;
  // Segredo do aviso trocado: o "não bate" de antes era do segredo velho (o próximo aviso diz se o novo bate).
  if (novos.includes("hmac") || apagar.includes("hmac")) campos.hmac_falhou_em = null;

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

/** "Testar": lista na D4Sign o que espera assinatura nos cofres escolhidos e guarda o resultado. 1 chamada. */
export async function testarConfigD4Sign(quem: string): Promise<{ ok: boolean; resultado: string }> {
  esquecerConfigD4Sign();
  const cfg = await carregarConfigD4Sign();
  let ok = false;
  let resultado: string;
  if (!cfg) resultado = "Falta o token da API.";
  else if (!cfg.cofres.length) resultado = "Falta escolher os cofres dos contratos (botão \"Buscar meus cofres na D4Sign\").";
  else {
    const r = await listarPendentesDaConta(cfg, "manual");
    ok = r.ok;
    const nos = r.ok ? r.dados.docs.filter((d) => !d.cofre || cfg.cofres.includes(d.cofre)).length : 0;
    resultado = r.ok
      ? `Funcionou: ${nos} documento(s) esperando assinatura nos ${cfg.cofres.length} cofre(s) escolhido(s).${cfg.hmac ? "" : " Falta o segredo do webhook (Secret Key MAC) para conferir os avisos da D4Sign."}`
      : `Não funcionou: ${r.erro}`;
  }
  const { linha } = await lerLinha();
  const agora = new Date().toISOString();
  const historico = [{ quem, quando: agora, acao: "testou" as const, campos: [], resultado: ok ? "funcionou" : "falhou" }, ...lerHistorico(linha?.historico)].slice(0, 30);
  if (linha) await supabaseAdmin.from(TABELA).update({ testado_em: agora, teste_ok: ok, teste_resultado: resultado.slice(0, 300), historico }).eq("id", 1);
  return { ok, resultado };
}

/** "Buscar meus cofres": todos os cofres da conta, com os já escolhidos e os que já têm o aviso ligado. 1 chamada. */
export async function listarCofresD4Sign(): Promise<
  { ok: true; cofres: { uuid: string; nome: string; escolhido: boolean; avisoLigado: boolean }[] } | { ok: false; erro: string }
> {
  esquecerConfigD4Sign();
  const cfg = await carregarConfigD4Sign();
  if (!cfg) return { ok: false, erro: "Falta o token da API: salve as chaves antes de buscar os cofres." };
  const r = await listarCofresDaConta(cfg);
  if (!r.ok) return { ok: false, erro: `Não consegui buscar os cofres: ${r.erro}` };
  const { linha } = await lerLinha();
  const comAviso = cofresComAviso(linha);
  return {
    ok: true,
    cofres: r.dados.map((c) => ({ ...c, escolhido: cfg.cofres.includes(c.uuid), avisoLigado: comAviso.includes(c.uuid) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** O endereço que a D4Sign chama: o webhook deste painel. */
export const urlDoWebhookD4Sign = (env: Record<string, string | undefined> = process.env) =>
  `${(env.NEXT_PUBLIC_APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "")}/api/integracoes/d4sign`;

/**
 * "Ligar o aviso da D4Sign": cadastra o webhook 2.0 em CADA cofre escolhido, apontando para este painel (1
 * chamada por cofre). Lembra os cofres já feitos (d4sign_config.webhook_cofres): clicar de novo só faz os que
 * faltam. A conta responde a 10 chamadas por hora — parou na cota, diz quantos faltam. Exige token, cofres e o
 * segredo do webhook (sem o segredo a porta do webhook recusa tudo, então nem cadastra).
 * Antes, na D4Sign: Gerenciar conta › Webhooks › Ativar webhook 2.0.
 */
export async function ligarWebhookD4Sign(quem: string, opts: { dry?: boolean } = {}): Promise<{ ok: boolean; resultado: string; feitos: string[]; faltam: string[] }> {
  esquecerConfigD4Sign();
  const cfg = await carregarConfigD4Sign();
  const { linha } = await lerLinha();
  const jaFeitos = cofresComAviso(linha);
  const faltavam = (cfg?.cofres ?? []).filter((c) => !jaFeitos.includes(c));
  const feitosAgora: string[] = [];
  let ok = false;
  let resultado: string;
  if (!cfg) resultado = "Falta o token da API.";
  else if (!cfg.cofres.length) resultado = "Falta escolher os cofres dos contratos (botão \"Buscar meus cofres na D4Sign\").";
  else if (!cfg.hmac) resultado = "Falta o segredo do webhook (Secret Key MAC): sem ele o Lone OS recusa os avisos da D4Sign.";
  else if (!faltavam.length) { ok = true; resultado = `O aviso já está ligado nos ${cfg.cofres.length} cofre(s) escolhido(s).`; }
  else if (opts.dry) { ok = true; resultado = `Ligaria o aviso em ${faltavam.length} cofre(s), apontando para ${urlDoWebhookD4Sign()}.`; }
  else {
    const url = urlDoWebhookD4Sign();
    let parou: string | null = null;
    let erro: string | null = null;
    for (const cofre of faltavam) {
      const r = await cadastrarWebhookDoCofre(cfg, cofre, url);
      if (!r.ok) { if (r.limite) parou = r.erro; else erro = r.erro; break; }
      feitosAgora.push(cofre);
      // Grava a cada cofre: se o próximo falhar, o que já foi feito não se perde nem se repete.
      await supabaseAdmin.from(TABELA).upsert({ id: 1, webhook_cofres: [...jaFeitos, ...feitosAgora].join(", ") }, { onConflict: "id" });
    }
    const faltam = faltavam.length - feitosAgora.length;
    ok = !erro && !parou;
    resultado = ok
      ? `Ligado nos ${cfg.cofres.length} cofre(s) escolhido(s): a D4Sign vai avisar ${url} de cada assinatura.`
      : parou
        ? `Liguei ${feitosAgora.length} de ${faltavam.length}; faltam ${faltam}. A D4Sign só responde a 10 chamadas por hora: clique de novo daqui a uma hora (os já ligados não se repetem).`
        : `Liguei ${feitosAgora.length} de ${faltavam.length}; parou com erro: ${erro}. Confira se o Webhook 2.0 está ativado na D4Sign (Gerenciar conta › Webhooks).`;
  }
  if (!opts.dry) {
    const atual = (await lerLinha()).linha;
    const historico = [{ quem, quando: new Date().toISOString(), acao: "ligou o webhook" as const, campos: [], resultado: ok ? "funcionou" : "falhou" }, ...lerHistorico(atual?.historico)].slice(0, 30);
    if (atual) await supabaseAdmin.from(TABELA).update({ historico }).eq("id", 1);
  }
  const feitos = [...jaFeitos, ...feitosAgora].filter((c) => (cfg?.cofres ?? []).includes(c));
  return { ok, resultado, feitos, faltam: (cfg?.cofres ?? []).filter((c) => !feitos.includes(c)) };
}
