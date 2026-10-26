// lib/contracts/assinatura.ts — "✅ Cliente X assinou o contrato" no grupo de cadastro, UMA vez.
//
// Pedido do Roberto (26/10/2026): o contrato sai do Lone OS (.docx), alguém sobe na D4Sign e manda para
// assinar — e depois ninguém olhava a D4Sign; a equipe perguntava ao cliente se ele já tinha assinado
// quando ele já tinha. Agora:
//
//   · webhook 2.0 do cofre (POST /api/integracoes/d4sign) ............ na hora em que o documento fecha
//   · consulta de hora em hora (POST /api/system/contratos-d4sign) .... o que o webhook não trouxe, e há
//                                                                       quantos dias cada um espera
//   · resumo da manhã (cs-manha) ...................................... uma linha com quem está há mais de
//                                                                       DIAS_SEM_ASSINATURA dias sem assinar
//
// Os dois caminhos chamam processarDocumento(), que nunca confia no evento: relê o documento na D4Sign e
// só chama de "assinado" a fase Finalizado (ou Arquivado com todos os signatários assinados).
//
// Regras que não se negociam:
//   · UMA mensagem por documento. A trava é d4sign_documentos.aviso_reservado_em, marcada ANTES do envio
//     com `update … where aviso_reservado_em is null` — webhook repetido, retry da D4Sign e a consulta
//     caem na mesma linha e só um manda. Envio que falha solta a trava (a D4Sign repete o webhook e a
//     consulta tenta na próxima hora); envio INCERTO (o WhatsApp não respondeu a tempo) não solta.
//   · Leitura que falha (D4Sign ou banco) não vira "não assinado" nem "assinado": não grava, não manda,
//     e devolve erro com tentarDeNovo.
//   · Não é novidade, não é aviso: documento assinado há mais de JANELA_AVISO_DIAS dias (a primeira
//     consulta encontra o histórico do cofre inteiro) é registrado em silêncio.
//   · Ligação ao cadastro só com par ÚNICO (e-mail do signatário, depois o nome do arquivo). Sem par, a
//     mensagem sai com o nome do documento e diz que a data não foi gravada na ficha.
//   · Não mexe em signed_at nem em status do contrato: ele fecha com o PDF assinado na ficha, como sempre.
//     Grava contracts.d4sign_assinado_em e clients.contrato_assinado_em ("assinado na D4Sign em dd/mm").
//   · NUNCA para grupo de cliente: confere que o grupo configurado não é o de nenhum cliente.
//
// Testado em tests/contrato-assinado-d4sign.test.ts (D4Sign e banco simulados).

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { jidDoGrupoCadastro } from "@/lib/portal/link-automatico";
import {
  buscarDocumento, configD4Sign, listarCofre, statusEfetivo,
  type ConfigD4Sign, type DocumentoD4Sign, type StatusDoc,
} from "./d4sign";

export const JANELA_AVISO_DIAS = 4;
export const DIAS_SEM_ASSINATURA = 3;
export const REPETE_COBRANCA_DIAS = 7;
/** Leituras de documento por consulta (a primeira consulta encontra o histórico do cofre). */
export const LEITURAS_POR_CONSULTA = 40;

const DIA = 86_400_000;
const TABELA = "d4sign_documentos";
const ORIGEM_ENVIO = "contrato-assinado";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Origem = "webhook" | "consulta";
export type Vinculo = "documento" | "email" | "nome";

export const uuidValido = (s: string) => UUID.test(s);
export const idemDoAviso = (uuid: string) => `contrato-assinado:${uuid}`;

// ── Puras ────────────────────────────────────────────────────────────────────────────────────────

export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** dd/mm no horário de Brasília. */
export function ddmm(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

/**
 * O nome do cliente dentro do nome do arquivo. O .docx do Lone OS sai como
 * "Padaria do Zé V2 - Contrato - Social Media.docx" (lib/contracts/generateDocx.ts).
 */
export function nomeDoDocumento(nome: string): string {
  const sem = nome.replace(/\.(docx?|pdf)$/i, "").trim();
  const antes = sem.split(/\s+-\s+contrato\b/i)[0].trim();
  const limpo = (antes || sem).replace(/\s+V\d+$/i, "").replace(/^contrato\s*(-\s*)?/i, "").trim();
  return limpo || sem || nome;
}

/** Distrato, aditivo, termo… não é "assinou o contrato". */
export function tipoDoDocumento(nome: string): "contrato" | "documento" {
  return /\b(distrato|aditivo|adendo|termo|procuracao|rescisao)\b/.test(normalizar(nome)) ? "documento" : "contrato";
}

/** Quando o último signatário assinou. */
export function quandoAssinou(doc: Pick<DocumentoD4Sign, "signatarios">): string | null {
  const datas = doc.signatarios.map((s) => s.assinadoEm).filter((d): d is string => !!d).sort();
  return datas.length ? datas[datas.length - 1] : null;
}

/** Quando o documento saiu para assinatura (o primeiro signatário incluído). */
export function quandoEnviou(doc: Pick<DocumentoD4Sign, "signatarios">): string | null {
  const datas = doc.signatarios.map((s) => s.incluidoEm).filter((d): d is string => !!d).sort();
  return datas.length ? datas[0] : null;
}

export interface ClienteCadastro {
  id: string;
  name?: string | null;
  nome_fantasia?: string | null;
  email?: string | null;
  email_corporativo?: string | null;
}

export const nomeDoCliente = (c: ClienteCadastro) => (c.nome_fantasia || c.name || "Cliente").trim() || "Cliente";

/**
 * Qual cliente assinou. Par ÚNICO ou nada: primeiro o e-mail de um signatário igual ao do cadastro;
 * depois o nome do arquivo igual ao do cliente; por fim o nome do cliente contido no do arquivo, só se
 * um contém todos os outros candidatos ("Veneza Nova Iguaçu" ganha de "Veneza"). Pura.
 */
export function ligarAoCadastro(doc: Pick<DocumentoD4Sign, "nome" | "signatarios">, clientes: ClienteCadastro[]):
  { clientId: string | null; vinculo: Vinculo | null; motivo: string | null } {
  const emails = new Set(doc.signatarios.map((s) => s.email).filter((e): e is string => !!e));
  const porEmail = clientes.filter((c) =>
    [c.email, c.email_corporativo].some((e) => !!e && emails.has(e.trim().toLowerCase())));

  const porNome = (lista: ClienteCadastro[]): ClienteCadastro[] => {
    const alvo = normalizar(nomeDoDocumento(doc.nome));
    if (!alvo) return [];
    const nomes = (c: ClienteCadastro) => [c.nome_fantasia, c.name].filter((n): n is string => !!n?.trim()).map(normalizar);
    const exatos = lista.filter((c) => nomes(c).includes(alvo));
    if (exatos.length) return exatos;
    const inteiro = ` ${normalizar(doc.nome)} `;
    const contidos = lista
      .map((c) => ({ c, n: nomes(c).filter((n) => n.length >= 4 && inteiro.includes(` ${n} `)).sort((a, b) => b.length - a.length)[0] }))
      .filter((x): x is { c: ClienteCadastro; n: string } => !!x.n)
      .sort((a, b) => b.n.length - a.n.length);
    if (contidos.length <= 1) return contidos.map((x) => x.c);
    const maior = contidos[0];
    const outros = contidos.slice(1).filter((x) => x.c.id !== maior.c.id);
    return outros.every((x) => maior.n.includes(x.n)) ? [maior.c] : contidos.map((x) => x.c);
  };

  const unicos = (l: ClienteCadastro[]) => [...new Map(l.map((c) => [c.id, c])).values()];
  const e = unicos(porEmail);
  if (e.length === 1) return { clientId: e[0].id, vinculo: "email", motivo: null };
  if (e.length > 1) {
    const desempate = unicos(porNome(e));
    if (desempate.length === 1) return { clientId: desempate[0].id, vinculo: "email", motivo: null };
  }
  const n = unicos(porNome(clientes));
  if (n.length === 1) return { clientId: n[0].id, vinculo: "nome", motivo: null };
  if (n.length > 1 || e.length > 1) return { clientId: null, vinculo: null, motivo: `mais de um cadastro parece ser este (${[...e, ...n].map(nomeDoCliente).slice(0, 3).join(", ")})` };
  return { clientId: null, vinculo: null, motivo: "nenhum cadastro com o e-mail de quem assinou nem com o nome do arquivo" };
}

export interface ContratoCadastro {
  id: string;
  client_id: string;
  created_at?: string | null;
  signed_at?: string | null;
  d4sign_document_uuid?: string | null;
  d4sign_assinado_em?: string | null;
}

/**
 * Qual contrato do cliente é este documento: o já ligado a ele, ou o mais recente ainda sem assinatura
 * que já existia quando o documento saiu para assinatura (`referencia`). Sem esse corte, o documento de
 * um ano atrás, visto pela primeira vez, caía no rascunho de renovação criado mês passado.
 */
export function escolherContrato(contratos: ContratoCadastro[], uuid: string, referencia: string): string | null {
  const ligado = contratos.find((c) => c.d4sign_document_uuid === uuid);
  if (ligado) return ligado.id;
  const limite = new Date(referencia).getTime();
  const livres = contratos
    .filter((c) => !c.d4sign_document_uuid && !c.signed_at && !c.d4sign_assinado_em)
    .filter((c) => !c.created_at || new Date(c.created_at).getTime() <= limite)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return livres[0]?.id ?? null;
}

export function decidirAviso(p: {
  status: StatusDoc;
  assinadoEm: string | null;
  agora: Date;
  /** O Lone OS já tinha visto este documento esperando assinatura. */
  viuPendente: boolean;
  reservadoEm: string | null;
}): { avisar: boolean; motivo: string | null } {
  if (p.status !== "assinado") return { avisar: false, motivo: null };
  if (p.reservadoEm) return { avisar: false, motivo: "o grupo de cadastro já recebeu este aviso" };
  if (p.assinadoEm) {
    const dias = (p.agora.getTime() - new Date(p.assinadoEm).getTime()) / DIA;
    if (dias > JANELA_AVISO_DIAS) {
      return { avisar: false, motivo: `assinado em ${ddmm(p.assinadoEm)}, há mais de ${JANELA_AVISO_DIAS} dias: não é novidade` };
    }
    return { avisar: true, motivo: null };
  }
  if (p.viuPendente) return { avisar: true, motivo: null };
  return { avisar: false, motivo: "a D4Sign não trouxe a data da assinatura e o documento nunca foi visto pendente" };
}

export function mensagemAssinatura(p: {
  nome: string;
  assinadoEm: string | null;
  tipo: "contrato" | "documento";
  nomeDocumento: string;
  ligado: boolean;
}): string {
  const quando = p.assinadoEm ? ` em ${ddmm(p.assinadoEm)}` : "";
  const linha = p.tipo === "contrato"
    ? `✅ *${p.nome}* assinou o contrato${quando}.`
    : `✅ *${p.nome}* assinou _${p.nomeDocumento.replace(/\.(docx?|pdf)$/i, "")}_${quando}.`;
  return p.ligado ? linha : `${linha}\n_Não achei o cadastro no Lone OS: a data não foi gravada na ficha._`;
}

/** A linha do resumo da manhã. "" = ninguém esperando há tempo demais. */
export function linhaSemAssinatura(itens: { nome: string; dias: number }[]): string {
  if (!itens.length) return "";
  const ordem = [...itens].sort((a, b) => b.dias - a.dias);
  const nomes = ordem.slice(0, 5).map((i) => `${i.nome} (${i.dias} dias)`).join(", ");
  const resto = ordem.length > 5 ? ` e mais ${ordem.length - 5}` : "";
  return `✍️ *Contrato sem assinatura na D4Sign:* ${nomes}${resto}.`;
}

// ── Banco ────────────────────────────────────────────────────────────────────────────────────────

export interface LinhaDocumento {
  document_uuid: string;
  nome?: string | null;
  status?: StatusDoc;
  status_id?: string | null;
  contract_id?: string | null;
  client_id?: string | null;
  vinculo?: Vinculo | null;
  enviado_em?: string | null;
  assinado_em?: string | null;
  visto_em?: string | null;
  atualizado_em?: string | null;
  origem?: Origem | null;
  aviso_reservado_em?: string | null;
  aviso_enviado_em?: string | null;
  aviso_motivo?: string | null;
  cobrado_em?: string | null;
  leitura_erro?: string | null;
}

const COLS_CONTRATO = "id, client_id, created_at, signed_at, d4sign_document_uuid, d4sign_assinado_em";

/** A tabela (ou a coluna) da migration 20261026150000 ainda não existe. */
export function faltaMigracao(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "42703" || err.code === "PGRST205"
    || /d4sign_|contrato_assinado_em/.test(err.message ?? "") && /does not exist|not find|schema cache/i.test(err.message ?? "");
}

/** O JID configurado é o grupo de algum cliente? Na dúvida (consulta falhou), trata como se fosse. */
async function ehGrupoDeCliente(jid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("clients").select("id").eq("whatsapp_group_jid", jid).limit(1);
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

export interface ResultadoDocumento {
  uuid: string;
  ok: boolean;
  /** Vale tentar de novo: o webhook devolve 503 (a D4Sign repete) e a consulta pega na próxima hora. */
  tentarDeNovo: boolean;
  acao: "avisado" | "avisaria" | "ja_avisado" | "registrado" | "ignorado" | "erro";
  status?: StatusDoc;
  /** Do cadastro, ou do nome do arquivo quando não ligou. */
  nome?: string;
  clientId?: string | null;
  contractId?: string | null;
  vinculo?: Vinculo | null;
  assinadoEm?: string | null;
  /** O texto que saiu (ou sairia, no ensaio). */
  mensagem?: string;
  motivo?: string | null;
  /** O que falhou sem impedir o resto (gravar a data no contrato, etc.). */
  avisos?: string[];
}

export interface OpcoesDocumento {
  origem: Origem;
  /** Ensaio: lê a D4Sign e o banco, devolve o que faria, não grava nem manda nada. */
  dry?: boolean;
  agora?: Date;
  /** A data do evento do webhook — só usada se a D4Sign não trouxer a do último signatário. */
  quandoEvento?: string | null;
  cfg?: ConfigD4Sign | null;
  /** Já lido (a consulta reaproveita); sem isto, lê na D4Sign. */
  doc?: DocumentoD4Sign;
}

/** Relê o documento na D4Sign, registra, liga ao cadastro, grava a data e avisa uma vez. Nunca lança. */
export async function processarDocumento(uuid: string, opts: OpcoesDocumento): Promise<ResultadoDocumento> {
  const agora = opts.agora ?? new Date();
  const agoraIso = agora.toISOString();
  const falha = (erro: string, tentarDeNovo = true): ResultadoDocumento => ({ uuid, ok: false, tentarDeNovo, acao: "erro", motivo: erro });
  try {
    if (!uuidValido(uuid)) return falha("UUID de documento inválido", false);
    const cfg = opts.cfg === undefined ? configD4Sign() : opts.cfg;
    if (!cfg) return falha("D4Sign não configurada (D4SIGN_API_TOKEN e D4SIGN_CRYPT_KEY no .env da VPS)");

    // 1. A verdade é a D4Sign, não o evento.
    let doc = opts.doc;
    if (!doc) {
      const lido = await buscarDocumento(cfg, uuid);
      if (!lido.ok) {
        if (!opts.dry) {
          await supabaseAdmin.from(TABELA).update({ leitura_erro: lido.erro.slice(0, 300), atualizado_em: agoraIso }).eq("document_uuid", uuid);
        }
        return falha(lido.erro);
      }
      doc = lido.dados;
    }
    if (cfg.cofre && doc.cofre && doc.cofre !== cfg.cofre) {
      return { uuid, ok: true, tentarDeNovo: false, acao: "ignorado", motivo: "documento de outro cofre (não é contrato)" };
    }

    // 2. O que já se sabia deste documento.
    const ex = await supabaseAdmin.from(TABELA).select("*").eq("document_uuid", uuid).maybeSingle();
    if (ex.error) return falha(faltaMigracao(ex.error) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `não consegui ler o registro: ${ex.error.message}`);
    const existente = (ex.data as LinhaDocumento | null) ?? null;

    // Assinado não "desassina": arquivado depois de finalizado, lido sem a lista de signatários, segue assinado.
    const lida = statusEfetivo(doc);
    const status: StatusDoc = existente?.status === "assinado" && lida === "outro" ? "assinado" : lida;
    const tipo = tipoDoDocumento(doc.nome);
    const assinadoEm = status === "assinado"
      ? (quandoAssinou(doc) ?? existente?.assinado_em ?? (opts.origem === "webhook" ? opts.quandoEvento ?? null : null))
      : null;

    // 3. Ligar ao cadastro: o que já estava ligado > contrato com este documento > e-mail/nome.
    let clientId = existente?.client_id ?? null;
    let contractId = existente?.contract_id ?? null;
    let vinculo: Vinculo | null = existente?.vinculo ?? null;
    let motivoVinculo: string | null = null;
    if (!clientId) {
      const pelo = await supabaseAdmin.from("contracts").select(COLS_CONTRATO).eq("d4sign_document_uuid", uuid).limit(1);
      if (pelo.error) return falha(faltaMigracao(pelo.error) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `não consegui ler os contratos: ${pelo.error.message}`);
      const c = (pelo.data as ContratoCadastro[] | null)?.[0];
      if (c) { clientId = c.client_id; contractId = c.id; vinculo = "documento"; }
    }
    const cl = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, email, email_corporativo").is("churned_at", null);
    if (cl.error) return falha(`não consegui ler os clientes: ${cl.error.message}`);
    const clientes = (cl.data as ClienteCadastro[] | null) ?? [];
    if (!clientId) {
      const l = ligarAoCadastro(doc, clientes);
      clientId = l.clientId; vinculo = l.vinculo; motivoVinculo = l.motivo;
    }
    if (clientId && !contractId && tipo === "contrato") {
      const cs = await supabaseAdmin.from("contracts").select(COLS_CONTRATO).eq("client_id", clientId)
        .order("created_at", { ascending: false }).limit(20);
      if (cs.error) return falha(`não consegui ler os contratos do cliente: ${cs.error.message}`);
      contractId = escolherContrato((cs.data as ContratoCadastro[] | null) ?? [], uuid,
        quandoEnviou(doc) ?? existente?.enviado_em ?? assinadoEm ?? agoraIso);
    }
    const cliente = clientId ? clientes.find((c) => c.id === clientId) : undefined;
    const nome = cliente ? nomeDoCliente(cliente) : nomeDoDocumento(doc.nome);

    // 4. Avisar?
    const d = decidirAviso({ status, assinadoEm, agora, viuPendente: existente?.status === "pendente", reservadoEm: existente?.aviso_reservado_em ?? null });
    const mensagem = d.avisar
      ? mensagemAssinatura({ nome, assinadoEm, tipo, nomeDocumento: doc.nome, ligado: !!clientId })
      : undefined;
    const base: ResultadoDocumento = {
      uuid, ok: true, tentarDeNovo: false, acao: "registrado", status, nome, clientId, contractId, vinculo, assinadoEm,
      motivo: d.motivo ?? (clientId ? null : motivoVinculo),
    };

    const linha: LinhaDocumento = {
      document_uuid: uuid,
      nome: doc.nome,
      status,
      status_id: doc.statusId,
      client_id: clientId,
      contract_id: contractId,
      vinculo,
      enviado_em: quandoEnviou(doc) ?? existente?.enviado_em ?? null,
      assinado_em: assinadoEm,
      visto_em: existente?.visto_em ?? agoraIso,
      atualizado_em: agoraIso,
      origem: opts.origem,
      leitura_erro: null,
      ...(status === "assinado" && !d.avisar && !existente?.aviso_reservado_em ? { aviso_motivo: d.motivo } : {}),
    };

    if (opts.dry) {
      return { ...base, acao: d.avisar ? "avisaria" : existente?.aviso_reservado_em ? "ja_avisado" : "registrado", mensagem };
    }

    // 5. Registrar (o registro vem antes do aviso: é nele que mora a trava).
    const up = await supabaseAdmin.from(TABELA).upsert(linha, { onConflict: "document_uuid" });
    if (up.error) return falha(faltaMigracao(up.error) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `não consegui registrar o documento: ${up.error.message}`);

    // 6. A data na ficha: contrato e cliente. Falhar aqui não segura o aviso, mas aparece no resultado.
    const avisos: string[] = [];
    if (contractId && status === "cancelado") {
      // Cancelado para reenviar corrigido: o contrato se solta, e o documento novo consegue se ligar a ele.
      const r = await supabaseAdmin.from("contracts").update({ d4sign_document_uuid: null })
        .eq("id", contractId).eq("d4sign_document_uuid", uuid);
      if (r.error) avisos.push(`soltar o contrato do documento cancelado: ${r.error.message}`);
    } else if (contractId && tipo === "contrato") {
      const campos: Record<string, string> = { d4sign_document_uuid: uuid };
      if (status === "assinado" && assinadoEm) campos.d4sign_assinado_em = assinadoEm;
      const r = await supabaseAdmin.from("contracts").update(campos).eq("id", contractId)
        .or(`d4sign_document_uuid.is.null,d4sign_document_uuid.eq.${uuid}`).select("id");
      if (r.error) avisos.push(`data no contrato: ${r.error.message}`);
      else if (!r.data?.length) avisos.push("o contrato já estava ligado a outro documento da D4Sign: não mexi");
    }
    if (clientId && tipo === "contrato" && status === "assinado" && assinadoEm) {
      const r = await supabaseAdmin.from("clients").update({ contrato_assinado_em: assinadoEm }).eq("id", clientId)
        .or(`contrato_assinado_em.is.null,contrato_assinado_em.lt.${assinadoEm}`);
      if (r.error) avisos.push(`data no cliente: ${r.error.message}`);
    }
    const comAvisos = (r: ResultadoDocumento): ResultadoDocumento => (avisos.length ? { ...r, avisos } : r);

    if (!d.avisar || !mensagem) {
      return comAvisos({ ...base, acao: existente?.aviso_reservado_em ? "ja_avisado" : "registrado" });
    }

    // 7. O aviso: grupo de cadastro, nunca de cliente; reserva antes de mandar.
    const jid = jidDoGrupoCadastro();
    if (!jid) return comAvisos({ ...base, ok: false, tentarDeNovo: true, acao: "erro", motivo: "grupo de cadastro não configurado (CS_CADASTRO_GROUP_JID)" });
    if (await ehGrupoDeCliente(jid)) return comAvisos({ ...base, ok: false, acao: "erro", motivo: "o grupo configurado é de um cliente — não mando" });

    const marca = new Date().toISOString();
    const reserva = await supabaseAdmin.from(TABELA).update({ aviso_reservado_em: marca })
      .eq("document_uuid", uuid).is("aviso_reservado_em", null).select("document_uuid");
    if (reserva.error) return comAvisos({ ...base, ok: false, tentarDeNovo: true, acao: "erro", motivo: `não consegui reservar o aviso: ${reserva.error.message}` });
    if (!reserva.data?.length) return comAvisos({ ...base, acao: "ja_avisado", motivo: "o grupo de cadastro já recebeu este aviso" });

    const env = await csSendGroupText(jid, mensagem, undefined,
      { origem: ORIGEM_ENVIO, destino: "interno", clientId, idem: idemDoAviso(uuid) });
    if (env.ok) {
      await supabaseAdmin.from(TABELA).update({ aviso_enviado_em: new Date().toISOString(), aviso_motivo: null }).eq("document_uuid", uuid);
      return comAvisos({ ...base, acao: "avisado", mensagem, motivo: null });
    }
    if (env.incerto) {
      // Pode ter saído: manter a trava. Repetir seria pior que faltar (e o motivo fica no registro).
      await supabaseAdmin.from(TABELA).update({ aviso_motivo: `envio incerto: ${env.error ?? "sem resposta"}` }).eq("document_uuid", uuid);
      return comAvisos({ ...base, ok: false, acao: "erro", mensagem, motivo: `o WhatsApp não confirmou o envio (pode ter saído): ${env.error ?? ""}`.trim() });
    }
    // Não saiu: solta a trava (só a nossa) para a próxima tentativa.
    await supabaseAdmin.from(TABELA).update({ aviso_reservado_em: null, aviso_motivo: `envio falhou: ${env.error ?? "erro"}` })
      .eq("document_uuid", uuid).eq("aviso_reservado_em", marca);
    return comAvisos({ ...base, ok: false, tentarDeNovo: true, acao: "erro", mensagem, motivo: `o aviso não saiu: ${env.error ?? "erro no WhatsApp"}` });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "erro");
  }
}

// ── Consulta de hora em hora ─────────────────────────────────────────────────────────────────────

export interface ResultadoConsulta {
  ok: boolean;
  dry: boolean;
  /** Integração desligada (sem chave ou sem cofre): não é erro, é "ainda não ligado". */
  desligado?: string;
  noCofre: number;
  lidos: number;
  /** Ficaram para a próxima consulta (teto de leituras por vez). */
  sobraram: number;
  resultados: ResultadoDocumento[];
  erros: string[];
}

/**
 * Lê o cofre, relê só o que mudou de fase (ou que o Lone OS ainda não conhece) e passa cada um por
 * processarDocumento. Prioridade: os que o Lone OS viu pendentes e mudaram de fase; depois os pendentes
 * novos; por fim os finalizados que nunca viu (histórico, ou o que o webhook não trouxe).
 */
export async function consultarCofre(opts: { dry?: boolean; agora?: Date; cfg?: ConfigD4Sign | null; limite?: number } = {}): Promise<ResultadoConsulta> {
  const dry = !!opts.dry;
  const vazio = { dry, noCofre: 0, lidos: 0, sobraram: 0, resultados: [] as ResultadoDocumento[] };
  const cfg = opts.cfg === undefined ? configD4Sign() : opts.cfg;
  if (!cfg) return { ...vazio, ok: true, desligado: "D4Sign não configurada (D4SIGN_API_TOKEN e D4SIGN_CRYPT_KEY)", erros: [] };
  if (!cfg.cofre) return { ...vazio, ok: true, desligado: "cofre dos contratos não configurado (D4SIGN_SAFE_UUID)", erros: [] };

  const lista = await listarCofre(cfg, cfg.cofre);
  if (!lista.ok) return { ...vazio, ok: false, erros: [lista.erro] };
  const docs = lista.dados.filter((d) => uuidValido(d.uuid));

  const conhecidos = new Map<string, LinhaDocumento>();
  for (let i = 0; i < docs.length; i += 100) {
    const lote = docs.slice(i, i + 100).map((d) => d.uuid);
    const r = await supabaseAdmin.from(TABELA).select("document_uuid, status, assinado_em, aviso_reservado_em").in("document_uuid", lote);
    if (r.error) {
      return { ...vazio, ok: false, noCofre: docs.length,
        erros: [faltaMigracao(r.error) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `não consegui ler os registros: ${r.error.message}`] };
    }
    for (const l of (r.data as LinhaDocumento[] | null) ?? []) conhecidos.set(l.document_uuid, l);
  }

  const agora = opts.agora ?? new Date();
  const recente = (iso?: string | null) => !!iso && agora.getTime() - new Date(iso).getTime() <= JANELA_AVISO_DIAS * DIA;
  const fila: { uuid: string; prioridade: number }[] = [];
  for (const d of docs) {
    const k = conhecidos.get(d.uuid);
    const fase = String(d.statusId);
    if (k) {
      if (k.status === "pendente" && fase !== "3") fila.push({ uuid: d.uuid, prioridade: 0 });
      // Assinado cujo aviso não saiu (envio falhou e soltou a trava): tenta de novo dentro da janela.
      else if (k.status === "assinado" && !k.aviso_reservado_em && recente(k.assinado_em)) fila.push({ uuid: d.uuid, prioridade: 0 });
      continue;
    }
    if (fase === "3") fila.push({ uuid: d.uuid, prioridade: 1 });
    else if (fase === "4" || fase === "5") fila.push({ uuid: d.uuid, prioridade: 2 });
  }
  fila.sort((a, b) => a.prioridade - b.prioridade);
  const limite = opts.limite ?? LEITURAS_POR_CONSULTA;
  const agoraLer = fila.slice(0, limite);

  const resultados: ResultadoDocumento[] = [];
  for (const f of agoraLer) {
    resultados.push(await processarDocumento(f.uuid, { origem: "consulta", dry, agora, cfg }));
  }
  const erros = resultados.filter((r) => !r.ok).map((r) => `${r.nome ?? r.uuid}: ${r.motivo ?? "erro"}`);
  return { ok: erros.length === 0, dry, noCofre: docs.length, lidos: agoraLer.length, sobraram: fila.length - agoraLer.length, resultados, erros };
}

// ── Resumo da manhã ──────────────────────────────────────────────────────────────────────────────

export type ColetaSemAssinatura =
  | { texto: string; itens: { uuid: string; nome: string; dias: number }[] }
  | { pulado: string }
  | { erro: string };

/**
 * Quem está há DIAS_SEM_ASSINATURA dias ou mais esperando assinatura. Cada documento volta à linha no
 * máximo uma vez por semana (cobrado_em) — a manhã não repete o mesmo nome todo dia.
 * `aplicar` marca cobrado_em (fora do ensaio).
 */
export async function coletarSemAssinatura(agora: Date, opts: { aplicar: boolean }): Promise<ColetaSemAssinatura> {
  const r = await supabaseAdmin.from(TABELA).select("document_uuid, nome, client_id, contract_id, enviado_em, visto_em, cobrado_em").eq("status", "pendente");
  if (r.error) {
    return faltaMigracao(r.error) ? { pulado: "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" } : { erro: r.error.message };
  }
  const linhas = (r.data as LinhaDocumento[] | null) ?? [];
  const folga = 2 * 3600_000; // o cron das 8h não cai sempre no mesmo minuto
  const candidatos = linhas
    .map((l) => ({ l, dias: Math.floor((agora.getTime() - new Date(l.enviado_em ?? l.visto_em ?? agora.toISOString()).getTime()) / DIA) }))
    .filter(({ l, dias }) => dias >= DIAS_SEM_ASSINATURA
      && (!l.cobrado_em || agora.getTime() - new Date(l.cobrado_em).getTime() >= REPETE_COBRANCA_DIAS * DIA - folga));
  if (!candidatos.length) return { texto: "", itens: [] };

  const idsCliente = [...new Set(candidatos.map((c) => c.l.client_id).filter((x): x is string => !!x))];
  const idsContrato = [...new Set(candidatos.map((c) => c.l.contract_id).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (idsCliente.length) {
    const c = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", idsCliente);
    if (c.error) return { erro: `clientes: ${c.error.message}` };
    for (const x of (c.data as ClienteCadastro[] | null) ?? []) nomes.set(x.id, nomeDoCliente(x));
  }
  // Contrato que já fechou por outro caminho (PDF assinado subido na ficha) não é cobrado.
  const fechados = new Set<string>();
  if (idsContrato.length) {
    const c = await supabaseAdmin.from("contracts").select("id, signed_at").in("id", idsContrato);
    if (c.error) return { erro: `contratos: ${c.error.message}` };
    for (const x of (c.data as { id: string; signed_at: string | null }[] | null) ?? []) if (x.signed_at) fechados.add(x.id);
  }
  const itens = candidatos
    .filter(({ l }) => !(l.contract_id && fechados.has(l.contract_id)))
    .map(({ l, dias }) => ({ uuid: l.document_uuid, nome: (l.client_id && nomes.get(l.client_id)) || nomeDoDocumento(l.nome ?? ""), dias }));
  if (!itens.length) return { texto: "", itens: [] };

  if (opts.aplicar) {
    const u = await supabaseAdmin.from(TABELA).update({ cobrado_em: agora.toISOString() }).in("document_uuid", itens.map((i) => i.uuid));
    if (u.error) return { erro: `não consegui marcar a cobrança: ${u.error.message}` };
  }
  return { texto: linhaSemAssinatura(itens), itens };
}
