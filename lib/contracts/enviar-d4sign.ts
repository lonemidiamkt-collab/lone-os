// lib/contracts/enviar-d4sign.ts — "Cliente concordou → enviar para assinatura" (28/10/2026, leva 3).
//
// Pedido do Roberto: "pós nos confirmarmos na plataforma do Lone OS que ele concorda com o contrato, você já envia
// para o e-mail dele e colhe a assinatura". O contrato registrado (ficha › Contratos, gerado na ficha ou no grupo) vai
// para a D4Sign: sobe o PDF no cofre do serviço, cadastra quem assina (o cliente e a Lone — lonemidiamkt@gmail.com) e
// manda para assinar; a D4Sign envia o e-mail com o link. Daí em diante é o fluxo de sempre: "✍️"/"✅" no grupo de
// cadastro (lib/contracts/assinatura.ts).
//
// Regras:
//   · Só gestão clica, e só depois de ver a prévia (quem assina, e-mail, cofre). Nada sai sozinho.
//   · Um contrato, um documento: a etapa fica gravada (contracts.d4sign_envio_etapa) e a trava é atômica — clique duplo
//     ou falha no meio CONTINUA de onde parou, nunca sobe de novo (cada envio gasta 1 dos envios do mês do plano).
//   · Contrato já ligado a um documento da D4Sign (mandado pelo painel), assinado ou arquivado não é enviado.
//   · Mensagem ao cliente curta e sem valor; no grupo de cadastro também sem valor.

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { jidDoGrupoCadastro } from "@/lib/portal/link-automatico";
import { SERVICE_LABELS } from "./types";
import { carregarConfigD4Sign } from "./d4sign-config";
import { cadastrarSignatarios, listarCofresDaConta, mandarParaAssinar, subirDocumento, type ConfigD4Sign, type CofreD4Sign } from "./d4sign";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MENSAGEM_AO_CLIENTE = "Olá! Segue o contrato de prestação de serviços da Lone Mídia para assinatura eletrônica. Qualquer dúvida, é só chamar a gente no grupo.";

export interface ContratoParaEnviar {
  id: string;
  client_id: string;
  version: number | null;
  service_type: string | null;
  pdf_url: string | null;
  signed_at: string | null;
  archived_at?: string | null;
  d4sign_document_uuid: string | null;
  d4sign_assinado_em?: string | null;
  d4sign_envio_etapa?: "subido" | "signatarios" | "enviado" | null;
}

/** Pode enviar? E de que etapa continua. Pura. */
export function situacaoDoEnvio(c: ContratoParaEnviar): { ok: true; continuaDe: "subir" | "signatarios" | "mandar" } | { ok: false; motivo: string } {
  if (c.signed_at || c.d4sign_assinado_em) return { ok: false, motivo: "Este contrato já está assinado." };
  if (c.archived_at) return { ok: false, motivo: "Este contrato está arquivado." };
  if (c.d4sign_envio_etapa === "enviado") return { ok: false, motivo: "Este contrato já foi enviado para assinatura." };
  if (c.d4sign_document_uuid && !c.d4sign_envio_etapa) {
    return { ok: false, motivo: "Este contrato já está ligado a um documento na D4Sign (enviado pelo painel). Acompanhe por lá." };
  }
  if (!c.pdf_url) return { ok: false, motivo: "Este contrato não tem PDF guardado. Gere de novo." };
  if (c.d4sign_envio_etapa === "signatarios") return { ok: true, continuaDe: "mandar" };
  if (c.d4sign_envio_etapa === "subido") return { ok: true, continuaDe: "signatarios" };
  return { ok: true, continuaDe: "subir" };
}

/** O nome do arquivo na D4Sign segue o padrão "Cliente - Contrato - Serviço" — é como o aviso acha o cliente pelo nome. Pura. */
export function nomeDoArquivo(cliente: string, servico: string | null, versao: number | null): string {
  const limpo = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const rotulo = (servico && SERVICE_LABELS[servico]) || "Marketing Digital";
  return `${limpo(cliente)} - Contrato - ${limpo(rotulo)}${versao && versao > 1 ? ` V${versao}` : ""}.pdf`;
}

/** O cofre sugerido para o serviço, pelo nome do cofre na D4Sign ("LM - Lone Growth (pacote completo)"…). Pura. */
export function cofreSugerido(cofres: CofreD4Sign[], servico: string | null): string | null {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const chave: Record<string, RegExp> = {
    lone_growth: /growth|completo/, assessoria_trafego: /trafego/, assessoria_social: /social/, trafego_social_site: /site|growth/,
  };
  const rx = servico ? chave[servico] : undefined;
  const contrato = cofres.filter((c) => !/renova|encerra|termo|experiencia|prestador/.test(n(c.nome)));
  return (rx && contrato.find((c) => rx.test(n(c.nome)))?.uuid) ?? contrato[0]?.uuid ?? cofres[0]?.uuid ?? null;
}

/** Caminho no storage a partir do pdf_url gravado ("/storage/v1/object/public/contracts/<cliente>/<arquivo>.pdf"). Pura. */
export function caminhoDoPdf(pdfUrl: string): { bucket: string; caminho: string } | null {
  const m = pdfUrl.match(/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (m) return { bucket: m[1], caminho: decodeURIComponent(m[2]) };
  const p = pdfUrl.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  if (p) return { bucket: p[1] === "legal" ? "legal-docs" : p[1], caminho: p[2] };
  return null;
}

// Nomes dos cofres: 1 das 10 chamadas da hora — guardados por 6 h (os cofres quase nunca mudam).
let cacheCofres: { em: number; cofres: CofreD4Sign[] } | null = null;
async function cofresEscolhidos(cfg: ConfigD4Sign): Promise<{ ok: true; cofres: CofreD4Sign[] } | { ok: false; erro: string }> {
  if (!cacheCofres || Date.now() - cacheCofres.em > 6 * 3600_000) {
    const r = await listarCofresDaConta(cfg);
    if (!r.ok) {
      // Sem os nomes, segue com os escolhidos pelo identificador: o envio não depende do nome.
      if (cfg.cofres.length) return { ok: true, cofres: cfg.cofres.map((uuid) => ({ uuid, nome: uuid })) };
      return { ok: false, erro: r.erro };
    }
    cacheCofres = { em: Date.now(), cofres: r.dados };
  }
  const escolhidos = cacheCofres.cofres.filter((c) => cfg.cofres.includes(c.uuid));
  return { ok: true, cofres: escolhidos.length ? escolhidos : cfg.cofres.map((uuid) => ({ uuid, nome: uuid })) };
}
export function _esquecerCofres() { cacheCofres = null; }

export interface Previa {
  contratoId: string;
  cliente: string;
  servico: string;
  versao: number | null;
  arquivo: string;
  /** E-mails do cadastro do cliente (o primeiro é o sugerido). */
  emailsCliente: string[];
  emailsLone: string[];
  cofres: { uuid: string; nome: string; sugerido: boolean }[];
  continuaDe: "subir" | "signatarios" | "mandar";
}

async function lerContrato(contractId: string) {
  const r = await supabaseAdmin.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (r.error) return { erro: `Não consegui ler o contrato: ${r.error.message}` } as const;
  if (!r.data) return { erro: "Contrato não encontrado." } as const;
  const c = r.data as ContratoParaEnviar;
  const cl = await supabaseAdmin.from("clients").select("name, nome_fantasia, email, email_corporativo").eq("id", c.client_id).maybeSingle();
  if (cl.error || !cl.data) return { erro: `Não consegui ler o cliente: ${cl.error?.message ?? "não encontrado"}` } as const;
  const cli = cl.data as { name: string | null; nome_fantasia: string | null; email: string | null; email_corporativo: string | null };
  return { contrato: c, cliente: (cli.nome_fantasia || cli.name || "Cliente").trim(), emails: [...new Set([cli.email, cli.email_corporativo].map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e && EMAIL.test(e)))] } as const;
}

/** A prévia que a tela mostra antes do envio. Gasta no máximo 1 chamada da D4Sign (os nomes dos cofres, guardados por 6 h). */
export async function preverEnvio(contractId: string): Promise<{ ok: true; previa: Previa } | { ok: false; erro: string }> {
  const cfg = await carregarConfigD4Sign();
  if (!cfg) return { ok: false, erro: "A D4Sign não está configurada (Configurações › Jurídico)." };
  if (!cfg.cofres.length) return { ok: false, erro: "Nenhum cofre de contrato escolhido (Configurações › Jurídico › D4Sign)." };
  if (!cfg.emailsLone.length) return { ok: false, erro: "Falta o e-mail de quem assina pela Lone (Configurações › Jurídico › D4Sign)." };
  const l = await lerContrato(contractId);
  if ("erro" in l) return { ok: false, erro: l.erro! };
  const s = situacaoDoEnvio(l.contrato);
  if (!s.ok) return { ok: false, erro: s.motivo };
  if (!l.emails.length) return { ok: false, erro: `${l.cliente} não tem e-mail válido no cadastro. Corrija na ficha antes de enviar.` };
  const cf = await cofresEscolhidos(cfg);
  if (!cf.ok) return { ok: false, erro: `Não consegui ler os cofres da D4Sign: ${cf.erro}` };
  const sugerido = cofreSugerido(cf.cofres, l.contrato.service_type);
  return {
    ok: true,
    previa: {
      contratoId: contractId, cliente: l.cliente, versao: l.contrato.version,
      servico: (l.contrato.service_type && SERVICE_LABELS[l.contrato.service_type]) || l.contrato.service_type || "—",
      arquivo: nomeDoArquivo(l.cliente, l.contrato.service_type, l.contrato.version),
      emailsCliente: [...l.emails], emailsLone: cfg.emailsLone,
      cofres: cf.cofres.map((c) => ({ ...c, sugerido: c.uuid === sugerido })),
      continuaDe: s.continuaDe,
    },
  };
}

export interface ResultadoEnvio { ok: boolean; etapa: "subido" | "signatarios" | "enviado" | null; documento?: string; erro?: string; limite?: boolean; avisos?: string[] }

/**
 * Envia (ou continua o envio). Nunca lança. Cada etapa fica gravada antes da seguinte — a falha no meio vira
 * "continuar" na próxima vez, com o mesmo documento.
 */
export async function enviarParaAssinatura(p: { contractId: string; cofre: string; email: string; quem: string }): Promise<ResultadoEnvio> {
  const falhou = async (etapa: ResultadoEnvio["etapa"], erro: string, limite = false): Promise<ResultadoEnvio> => {
    await supabaseAdmin.from("contracts").update({ d4sign_envio_erro: erro.slice(0, 300) }).eq("id", p.contractId);
    return { ok: false, etapa, erro, limite };
  };
  try {
    const cfg = await carregarConfigD4Sign();
    if (!cfg) return { ok: false, etapa: null, erro: "A D4Sign não está configurada." };
    if (!cfg.cofres.includes(p.cofre)) return { ok: false, etapa: null, erro: "Esse cofre não é um dos cofres de contrato escolhidos." };
    const email = p.email.trim().toLowerCase();
    if (!EMAIL.test(email)) return { ok: false, etapa: null, erro: "E-mail do cliente inválido." };
    const l = await lerContrato(p.contractId);
    if ("erro" in l) return { ok: false, etapa: null, erro: l.erro };
    if (!l.emails.includes(email)) return { ok: false, etapa: null, erro: "Esse e-mail não é o do cadastro do cliente. Corrija na ficha antes." };
    const s = situacaoDoEnvio(l.contrato);
    if (!s.ok) return { ok: false, etapa: l.contrato.d4sign_envio_etapa ?? null, erro: s.motivo };

    let uuid = l.contrato.d4sign_document_uuid;
    let etapa: ResultadoEnvio["etapa"] = l.contrato.d4sign_envio_etapa ?? null;

    if (s.continuaDe === "subir") {
      // A trava: só um clique sobe o arquivo. Quem perde a corrida não faz nada.
      const trava = await supabaseAdmin.from("contracts").update({ d4sign_envio_por: p.quem, d4sign_envio_erro: null })
        .eq("id", p.contractId).is("d4sign_document_uuid", null).is("d4sign_envio_etapa", null).is("d4sign_envio_por", null).select("id");
      if (trava.error) return { ok: false, etapa: null, erro: `Não consegui reservar o envio: ${trava.error.message}` };
      if (!trava.data?.length) return { ok: false, etapa: null, erro: "Este contrato já está sendo enviado por outra pessoa agora. Recarregue em instantes." };
      const solta = () => supabaseAdmin.from("contracts").update({ d4sign_envio_por: null }).eq("id", p.contractId).is("d4sign_envio_etapa", null);

      const onde = caminhoDoPdf(l.contrato.pdf_url!);
      if (!onde) { await solta(); return falhou(null, "Não reconheci onde o PDF do contrato está guardado."); }
      const arq = await supabaseAdmin.storage.from(onde.bucket).download(onde.caminho);
      if (arq.error || !arq.data) { await solta(); return falhou(null, `Não consegui abrir o PDF do contrato: ${arq.error?.message ?? "vazio"}`); }
      const pdf = Buffer.from(await arq.data.arrayBuffer());
      const sub = await subirDocumento(cfg, p.cofre, pdf, nomeDoArquivo(l.cliente, l.contrato.service_type, l.contrato.version));
      if (!sub.ok) { await solta(); return falhou(null, `A D4Sign não recebeu o arquivo: ${sub.erro}`, !!sub.limite); }
      uuid = sub.dados;
      etapa = "subido";
      const g = await supabaseAdmin.from("contracts").update({ d4sign_document_uuid: uuid, d4sign_envio_etapa: "subido" }).eq("id", p.contractId);
      if (g.error) return { ok: false, etapa, documento: uuid, erro: `O arquivo subiu na D4Sign (${uuid}), mas não gravei aqui: ${g.error.message}. Termine pelo painel da D4Sign.` };
    }

    if (s.continuaDe === "subir" || s.continuaDe === "signatarios") {
      const sig = await cadastrarSignatarios(cfg, uuid!, [{ email, act: "4" }, ...cfg.emailsLone.filter((e) => e !== email).map((e) => ({ email: e, act: "4" as const }))]);
      if (!sig.ok) return falhou(etapa, `O arquivo está na D4Sign, mas não cadastrei quem assina: ${sig.erro}. Clique de novo para continuar.`, !!sig.limite);
      etapa = "signatarios";
      await supabaseAdmin.from("contracts").update({ d4sign_envio_etapa: "signatarios" }).eq("id", p.contractId);
    }

    const env = await mandarParaAssinar(cfg, uuid!, MENSAGEM_AO_CLIENTE);
    if (!env.ok) return falhou(etapa, `Quem assina já está cadastrado, mas a D4Sign não mandou para assinatura: ${env.erro}. Clique de novo para continuar.`, !!env.limite);
    const agora = new Date().toISOString();
    await supabaseAdmin.from("contracts").update({ d4sign_envio_etapa: "enviado", d4sign_enviado_em: agora, d4sign_envio_erro: null }).eq("id", p.contractId);

    // O Lone OS já conhece o documento (sem esperar a consulta): quem falta assinar aparece na hora.
    const avisos: string[] = [];
    const reg = await supabaseAdmin.from("d4sign_documentos").upsert({
      document_uuid: uuid, nome: nomeDoArquivo(l.cliente, l.contrato.service_type, l.contrato.version), status: "pendente", status_id: "3", tipo: "contrato",
      client_id: l.contrato.client_id, contract_id: p.contractId, vinculo: "documento", enviado_em: agora, visto_em: agora, atualizado_em: agora, origem: "consulta",
      signatarios: [{ email, papel: "cliente", assinou: false }, ...cfg.emailsLone.filter((e) => e !== email).map((e) => ({ email: e, papel: "lone", assinou: false }))],
    }, { onConflict: "document_uuid" });
    if (reg.error) avisos.push(`o documento não entrou na lista de pendentes agora (entra na próxima consulta): ${reg.error.message}`);
    await supabaseAdmin.from("contract_audit_log").insert({ contract_id: p.contractId, action: "d4sign_sent", actor: p.quem, details: `Enviado para assinatura na D4Sign (${email} e a Lone).` });
    const jid = jidDoGrupoCadastro();
    if (jid) {
      const msg = await csSendGroupText(jid, `📨 Contrato de *${l.cliente}* enviado para assinatura na D4Sign — o link vai para o e-mail do cliente e da Lone. Aviso aqui quando assinarem.`,
        undefined, { origem: "contrato-enviado", destino: "interno", clientId: l.contrato.client_id, idem: `contrato-enviado:${uuid}` });
      if (!msg.ok && !msg.incerto) avisos.push(`o aviso no grupo de cadastro não saiu: ${msg.error ?? "erro"}`);
    }
    return { ok: true, etapa: "enviado", documento: uuid!, ...(avisos.length ? { avisos } : {}) };
  } catch (e) {
    return falhou(null, e instanceof Error ? e.message : "erro");
  }
}
