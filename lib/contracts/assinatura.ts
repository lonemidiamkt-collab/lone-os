// lib/contracts/assinatura.ts — quem assinou e quem falta na D4Sign, avisado no grupo de cadastro.
//
// Pedido do Roberto (26/10/2026): "a maior questão é a gente saber quem assinou, quem não assinou; se o
// cliente assinou, enviar lá no nosso grupo de cadastro 'cliente acabou de assinar o contrato', ou 'o cliente
// ainda não assinou o contrato'". Três mensagens, todas no grupo de cadastro:
//
//   · ✅ "Cliente X assinou o contrato em dd/mm" ..... todas as assinaturas feitas (uma vez por documento)
//   · ✍️ "Cliente X: assinado por A em dd/mm · falta B"  uma parte assinou (uma vez a cada assinatura nova)
//   · ⏳ "Ainda não assinaram o contrato" ............. dia útil de manhã, só se houver contrato enviado há 3 dias
//                                                       ou mais sem todas as assinaturas (avisarPendentes)
//
// De onde vem: o webhook 2.0 de cada cofre de contrato (POST /api/integracoes/d4sign) a cada assinatura, e uma
// consulta a cada 3 horas (POST /api/system/contratos-d4sign) para o que o webhook não trouxe. Os contratos da
// Lone ficam em vários cofres (um por pacote, renovação…): só contam os escolhidos no painel. Os dois chamam
// processarDocumento(), que nunca confia no evento: relê o documento na D4Sign (signatários, quem assinou,
// quando) e só chama de "assinado" a fase Finalizado (ou Arquivado com todos assinados). A D4Sign responde a
// 10 chamadas por hora (lib/contracts/d4sign-cota.ts): as rotinas leem pouco e param antes das últimas.
//
// Regras que não se negociam:
//   · Cada aviso sai UMA vez. Trava antes de mandar: aviso_reservado_em (final) e aviso_parcial (o retrato de
//     quem já tinha assinado). Evento repetido, retry da D4Sign e a consulta caem na mesma linha e só um manda.
//     Envio que falha solta a trava; envio INCERTO (o WhatsApp não respondeu a tempo) não solta.
//   · Leitura que falha (D4Sign ou banco) não vira "não assinado" nem "assinado": não grava, não manda.
//   · Não é novidade, não é aviso: assinatura de mais de JANELA_AVISO_DIAS dias é registrada em silêncio.
//   · Ligação ao cadastro só com par ÚNICO (e-mail do signatário, depois o nome do arquivo). Sem par, a
//     mensagem sai com o nome do documento e diz que a data não foi gravada na ficha.
//   · Não mexe em signed_at nem em status do contrato: ele fecha com o PDF assinado na ficha, como sempre.
//     Grava contracts.d4sign_assinado_em e clients.contrato_assinado_em.
//   · NUNCA para grupo de cliente: confere que o grupo configurado não é o de nenhum cliente.
//
// Testado em tests/contrato-assinado-d4sign.test.ts (D4Sign e banco simulados).

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { jidDoGrupoCadastro } from "@/lib/portal/link-automatico";
import {
  buscarDocumento, listarPendentesDaConta, statusEfetivo,
  type ConfigD4Sign, type DocumentoD4Sign, type StatusDoc,
} from "./d4sign";
import { chaveDoParcial, gravarSignatarios, lerSignatariosGravados, type SignatarioGravado } from "./d4sign-signatarios";
import { juntar, quemAssina, resumoAssinaturas } from "./d4sign-resumo";
import { carregarConfigD4Sign } from "./d4sign-config";

export const JANELA_AVISO_DIAS = 4;
export const DIAS_SEM_ASSINATURA = 3;
/** Chamadas por rodada além da listagem (a conta responde a 10 por hora; o resto fica para a próxima). */
export const LEITURAS_POR_CONSULTA = 3;

const DIA = 86_400_000;
const TABELA = "d4sign_documentos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Origem = "webhook" | "consulta" | "manha";
export type Vinculo = "documento" | "email" | "nome";

export const uuidValido = (s: string) => UUID.test(s);
export const idemDoAviso = (uuid: string) => `contrato-assinado:${uuid}`;
export const idemDoParcial = (uuid: string, chave: string) => `contrato-parcial:${uuid}:${chave}`;
export const idemDosPendentes = (dia: string) => `contratos-pendentes:${dia}`;

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

/** Aviso parcial? Só documento esperando assinatura, com alguém que assinou E alguém que falta, assinatura
 *  recente, e um retrato de "quem já assinou" diferente do último avisado. Pura. */
export function decidirParcial(p: {
  status: StatusDoc;
  signatarios: SignatarioGravado[];
  agora: Date;
  jaAvisado: string | null;
}): { avisar: boolean; chave: string; motivo: string | null } {
  const chave = chaveDoParcial(p.signatarios);
  const nada = (motivo: string | null) => ({ avisar: false, chave, motivo });
  if (p.status !== "pendente") return nada(null);
  const feitos = p.signatarios.filter((s) => s.assinou);
  if (!feitos.length || feitos.length === p.signatarios.length) return nada(null);
  const ultima = feitos.map((s) => s.assinadoEm).filter((d): d is string => !!d).sort().pop();
  if (!ultima || p.agora.getTime() - new Date(ultima).getTime() > JANELA_AVISO_DIAS * DIA) return nada("assinatura parcial antiga: não é novidade");
  if (p.jaAvisado === chave) return nada("o grupo de cadastro já recebeu esta assinatura");
  return { avisar: true, chave, motivo: null };
}

export const mensagemParcial = (nome: string, lista: SignatarioGravado[]) => `✍️ *${nome}*: ${resumoAssinaturas(lista)}.`;

export interface ItemPendente { uuid: string; nome: string; faltam: SignatarioGravado[]; dias: number }

/** O aviso da manhã. "" = ninguém esperando. Os mais antigos primeiro, no máximo 10 linhas. Pura. */
export function mensagemPendentes(itens: ItemPendente[]): string {
  if (!itens.length) return "";
  const ordem = [...itens].sort((a, b) => b.dias - a.dias);
  const linhas = ordem.slice(0, 10).map((i) =>
    `• *${i.nome}* — falta ${i.faltam.length ? juntar(i.faltam.map(quemAssina)) : "assinar (a D4Sign não disse quem)"} · enviado há ${i.dias} dia${i.dias === 1 ? "" : "s"}`);
  if (ordem.length > 10) linhas.push(`• e mais ${ordem.length - 10}`);
  return ["⏳ *Ainda não assinaram o contrato*", ...linhas].join("\n");
}

// ── Banco ────────────────────────────────────────────────────────────────────────────────────────

export interface LinhaDocumento {
  document_uuid: string;
  nome?: string | null;
  status?: StatusDoc;
  status_id?: string | null;
  tipo?: "contrato" | "documento" | null;
  contract_id?: string | null;
  client_id?: string | null;
  vinculo?: Vinculo | null;
  signatarios?: SignatarioGravado[] | unknown;
  enviado_em?: string | null;
  assinado_em?: string | null;
  visto_em?: string | null;
  atualizado_em?: string | null;
  origem?: Origem | null;
  aviso_reservado_em?: string | null;
  aviso_enviado_em?: string | null;
  aviso_motivo?: string | null;
  aviso_parcial?: string | null;
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

/** O grupo de cadastro, conferido. null = pode mandar; texto = por que não. */
async function grupoDeCadastro(): Promise<{ jid: string } | { erro: string; tentarDeNovo: boolean }> {
  const jid = jidDoGrupoCadastro();
  if (!jid) return { erro: "grupo de cadastro não configurado (CS_CADASTRO_GROUP_JID)", tentarDeNovo: true };
  if (await ehGrupoDeCliente(jid)) return { erro: "o grupo configurado é de um cliente — não mando", tentarDeNovo: false };
  return { jid };
}

export interface ResultadoDocumento {
  uuid: string;
  ok: boolean;
  /** Vale tentar de novo: o webhook devolve 503 (a D4Sign repete) e a consulta pega na próxima rodada. */
  tentarDeNovo: boolean;
  acao: "avisado" | "avisaria" | "parcial" | "parcial_avisaria" | "ja_avisado" | "registrado" | "ignorado" | "erro";
  status?: StatusDoc;
  /** Do cadastro, ou do nome do arquivo quando não ligou. */
  nome?: string;
  clientId?: string | null;
  contractId?: string | null;
  vinculo?: Vinculo | null;
  assinadoEm?: string | null;
  /** "assinado por X em dd/mm · falta Y". */
  resumo?: string;
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
  /** Já lido (a consulta reaproveita a listagem); sem isto, lê na D4Sign. */
  doc?: DocumentoD4Sign;
  /** Aviso parcial ("assinado por X · falta Y"). Padrão: sim; a releitura da manhã passa false. */
  avisarParcial?: boolean;
}

const ehLimite = (motivo: string | null | undefined) => /limite de chamadas/.test(motivo ?? "");

/** Relê o documento na D4Sign, registra quem assinou, liga ao cadastro, grava a data e avisa. Nunca lança. */
export async function processarDocumento(uuid: string, opts: OpcoesDocumento): Promise<ResultadoDocumento> {
  const agora = opts.agora ?? new Date();
  const agoraIso = agora.toISOString();
  const falha = (erro: string, tentarDeNovo = true): ResultadoDocumento => ({ uuid, ok: false, tentarDeNovo, acao: "erro", motivo: erro });
  const semMigracao = (e: { code?: string; message?: string }, o: string) =>
    faltaMigracao(e) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `${o}: ${e.message}`;
  try {
    if (!uuidValido(uuid)) return falha("UUID de documento inválido", false);
    const cfg = opts.cfg === undefined ? await carregarConfigD4Sign() : opts.cfg;
    if (!cfg) return falha("D4Sign não configurada (chaves em Configurações › Jurídico, ou no servidor)");

    // 1. A verdade é a D4Sign, não o evento.
    let doc = opts.doc;
    if (!doc) {
      const lido = await buscarDocumento(cfg, uuid, opts.origem);
      if (!lido.ok) {
        if (!opts.dry && !lido.limite) {
          await supabaseAdmin.from(TABELA).update({ leitura_erro: lido.erro.slice(0, 300), atualizado_em: agoraIso }).eq("document_uuid", uuid);
        }
        return falha(lido.erro);
      }
      doc = lido.dados;
    }
    if (!cfg.cofres.length) {
      return { uuid, ok: true, tentarDeNovo: false, acao: "ignorado", motivo: "nenhum cofre de contrato escolhido no painel" };
    }
    if (doc.cofre && !cfg.cofres.includes(doc.cofre.toLowerCase())) {
      return { uuid, ok: true, tentarDeNovo: false, acao: "ignorado", motivo: "documento de um cofre que não é de contrato" };
    }

    // 2. O que já se sabia deste documento.
    const ex = await supabaseAdmin.from(TABELA).select("*").eq("document_uuid", uuid).maybeSingle();
    if (ex.error) return falha(semMigracao(ex.error, "não consegui ler o registro"));
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
      if (pelo.error) return falha(semMigracao(pelo.error, "não consegui ler os contratos"));
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

    // Quem assinou e quem falta. A listagem do cofre não traz signatários: sem leitura, fica o que já se sabia.
    const emailsCliente = [cliente?.email, cliente?.email_corporativo].filter((e): e is string => !!e);
    const signatarios = doc.signatarios.length
      ? gravarSignatarios(doc.signatarios, { emailsLone: cfg.emailsLone, emailsCliente })
      : lerSignatariosGravados(existente?.signatarios);

    // 4. Avisar? O final (todos assinaram) ou o parcial (alguém assinou, alguém falta).
    const d = decidirAviso({ status, assinadoEm, agora, viuPendente: existente?.status === "pendente", reservadoEm: existente?.aviso_reservado_em ?? null });
    const parcial = opts.avisarParcial === false
      ? { avisar: false, chave: chaveDoParcial(signatarios), motivo: null }
      : decidirParcial({ status, signatarios, agora, jaAvisado: existente?.aviso_parcial ?? null });
    const mensagem = d.avisar
      ? mensagemAssinatura({ nome, assinadoEm, tipo, nomeDocumento: doc.nome, ligado: !!clientId })
      : parcial.avisar ? mensagemParcial(nome, signatarios) : undefined;
    const base: ResultadoDocumento = {
      uuid, ok: true, tentarDeNovo: false, acao: "registrado", status, nome, clientId, contractId, vinculo, assinadoEm,
      resumo: resumoAssinaturas(signatarios),
      motivo: d.motivo ?? parcial.motivo ?? (clientId ? null : motivoVinculo),
    };

    const linha: LinhaDocumento = {
      document_uuid: uuid,
      nome: doc.nome,
      status,
      status_id: doc.statusId,
      tipo,
      signatarios,
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
      const acao = d.avisar ? "avisaria" : parcial.avisar ? "parcial_avisaria" : existente?.aviso_reservado_em ? "ja_avisado" : "registrado";
      return { ...base, acao, mensagem };
    }

    // 5. Registrar (o registro vem antes do aviso: é nele que moram as travas).
    const up = await supabaseAdmin.from(TABELA).upsert(linha, { onConflict: "document_uuid" });
    if (up.error) return falha(semMigracao(up.error, "não consegui registrar o documento"));

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

    if (!mensagem) return comAvisos({ ...base, acao: existente?.aviso_reservado_em ? "ja_avisado" : "registrado" });

    // 7. O aviso: grupo de cadastro, nunca de cliente; reserva antes de mandar.
    const grupo = await grupoDeCadastro();
    if ("erro" in grupo) return comAvisos({ ...base, ok: false, tentarDeNovo: grupo.tentarDeNovo, acao: "erro", motivo: grupo.erro });

    if (d.avisar) {
      const marca = new Date().toISOString();
      const reserva = await supabaseAdmin.from(TABELA).update({ aviso_reservado_em: marca })
        .eq("document_uuid", uuid).is("aviso_reservado_em", null).select("document_uuid");
      if (reserva.error) return comAvisos({ ...base, ok: false, tentarDeNovo: true, acao: "erro", motivo: `não consegui reservar o aviso: ${reserva.error.message}` });
      if (!reserva.data?.length) return comAvisos({ ...base, acao: "ja_avisado", motivo: "o grupo de cadastro já recebeu este aviso" });

      const env = await csSendGroupText(grupo.jid, mensagem, undefined, { origem: "contrato-assinado", destino: "interno", clientId, idem: idemDoAviso(uuid) });
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
    }

    // Parcial: a trava é o retrato de quem já tinha assinado (só letras, números e hífen — seguro no filtro).
    const anterior = existente?.aviso_parcial ?? null;
    const reserva = await supabaseAdmin.from(TABELA).update({ aviso_parcial: parcial.chave })
      .eq("document_uuid", uuid).or(`aviso_parcial.is.null,aviso_parcial.neq.${parcial.chave}`).select("document_uuid");
    if (reserva.error) return comAvisos({ ...base, ok: false, tentarDeNovo: true, acao: "erro", motivo: `não consegui reservar o aviso parcial: ${reserva.error.message}` });
    if (!reserva.data?.length) return comAvisos({ ...base, acao: "ja_avisado", motivo: "o grupo de cadastro já recebeu esta assinatura" });
    const env = await csSendGroupText(grupo.jid, mensagem, undefined, { origem: "contrato-parcial", destino: "interno", clientId, idem: idemDoParcial(uuid, parcial.chave) });
    if (env.ok) return comAvisos({ ...base, acao: "parcial", mensagem, motivo: null });
    if (env.incerto) return comAvisos({ ...base, ok: false, acao: "erro", mensagem, motivo: `o WhatsApp não confirmou o envio (pode ter saído): ${env.error ?? ""}`.trim() });
    await supabaseAdmin.from(TABELA).update({ aviso_parcial: anterior }).eq("document_uuid", uuid).eq("aviso_parcial", parcial.chave);
    return comAvisos({ ...base, ok: false, tentarDeNovo: true, acao: "erro", mensagem, motivo: `o aviso não saiu: ${env.error ?? "erro no WhatsApp"}` });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "erro");
  }
}

// ── Consulta a cada 3 horas ──────────────────────────────────────────────────────────────────────

export interface ResultadoConsulta {
  ok: boolean;
  dry: boolean;
  /** Integração desligada (sem chave ou sem cofre escolhido): não é erro, é "ainda não ligado". */
  desligado?: string;
  /** A cota da hora da D4Sign acabou antes da listagem: não é erro, fica para a próxima rodada. */
  adiado?: string;
  /** Documentos esperando assinatura nos cofres escolhidos (pela listagem da conta). */
  pendentes: number;
  /** Documentos relidos na D4Sign (cada um gasta uma chamada). */
  lidos: number;
  /** Ficaram para a próxima rodada (teto por vez ou cota da hora). */
  sobraram: number;
  resultados: ResultadoDocumento[];
  erros: string[];
}

/**
 * Lista os documentos da CONTA esperando assinatura (1 chamada por página, não uma por cofre) e relê no
 * máximo `limite` documentos, nesta ordem:
 *   0. o que o Lone OS viu pendente e saiu da lista (assinou, cancelou) — só quando a lista veio completa;
 *   0. assinado cujo aviso não saiu (envio falhou e soltou a trava), dentro da janela;
 *   1. pendente de um cofre escolhido que o Lone OS ainda não conhece — para ligar ao cadastro e saber quem assina.
 * Documento de cofre não escolhido não gasta chamada. O que fecha chega pelo webhook (a D4Sign repete por 27 h).
 */
export async function consultarCofre(opts: { dry?: boolean; agora?: Date; cfg?: ConfigD4Sign | null; limite?: number } = {}): Promise<ResultadoConsulta> {
  const dry = !!opts.dry;
  const vazio = { dry, pendentes: 0, lidos: 0, sobraram: 0, resultados: [] as ResultadoDocumento[] };
  const cfg = opts.cfg === undefined ? await carregarConfigD4Sign() : opts.cfg;
  if (!cfg) return { ...vazio, ok: true, desligado: "D4Sign não configurada (chaves em Configurações › Jurídico, ou no servidor)", erros: [] };
  if (!cfg.cofres.length) return { ...vazio, ok: true, desligado: "nenhum cofre de contrato escolhido (Configurações › Jurídico › D4Sign)", erros: [] };

  const lista = await listarPendentesDaConta(cfg, "consulta");
  if (!lista.ok) return { ...vazio, ok: !!lista.limite, ...(lista.limite ? { adiado: lista.erro } : {}), erros: lista.limite ? [] : [lista.erro] };
  const naConta = new Set(lista.dados.docs.map((d) => d.uuid));
  const escolhidos = lista.dados.docs.filter((d) => uuidValido(d.uuid) && (!d.cofre || cfg.cofres.includes(d.cofre)));

  const agora = opts.agora ?? new Date();
  const erroDoBanco = (e: { code?: string; message?: string }) => ({ ...vazio, ok: false, pendentes: escolhidos.length,
    erros: [faltaMigracao(e) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `não consegui ler os registros: ${e.message}`] });

  // O que o Lone OS já conhece: os pendentes dele, os assinados recentes sem aviso e os da lista.
  const pend = await supabaseAdmin.from(TABELA).select("document_uuid, status").eq("status", "pendente");
  if (pend.error) return erroDoBanco(pend.error);
  const desde = new Date(agora.getTime() - JANELA_AVISO_DIAS * DIA).toISOString();
  const semAviso = await supabaseAdmin.from(TABELA).select("document_uuid").eq("status", "assinado")
    .is("aviso_reservado_em", null).gte("assinado_em", desde);
  if (semAviso.error) return erroDoBanco(semAviso.error);
  const conhecidos = new Set<string>();
  for (let i = 0; i < escolhidos.length; i += 100) {
    const r = await supabaseAdmin.from(TABELA).select("document_uuid").in("document_uuid", escolhidos.slice(i, i + 100).map((d) => d.uuid));
    if (r.error) return erroDoBanco(r.error);
    for (const l of (r.data as LinhaDocumento[] | null) ?? []) conhecidos.add(l.document_uuid);
  }

  const fila: { uuid: string; prioridade: number }[] = [];
  const naFila = new Set<string>();
  const entra = (uuid: string, prioridade: number) => { if (!naFila.has(uuid)) { naFila.add(uuid); fila.push({ uuid, prioridade }); } };
  if (lista.dados.completa) {
    for (const l of (pend.data as LinhaDocumento[] | null) ?? []) if (!naConta.has(l.document_uuid)) entra(l.document_uuid, 0);
  }
  for (const l of (semAviso.data as LinhaDocumento[] | null) ?? []) entra(l.document_uuid, 0);
  for (const d of escolhidos) if (!conhecidos.has(d.uuid)) entra(d.uuid, 1);
  fila.sort((a, b) => a.prioridade - b.prioridade);
  const limite = opts.limite ?? LEITURAS_POR_CONSULTA;

  const resultados: ResultadoDocumento[] = [];
  let lidos = 0;
  let parouNaCota = false;
  for (const t of fila) {
    if (lidos >= limite) break;
    lidos++;
    const r = await processarDocumento(t.uuid, { origem: "consulta", dry, agora, cfg });
    resultados.push(r);
    if (!r.ok && ehLimite(r.motivo)) { parouNaCota = true; break; }
  }
  const erros = resultados.filter((r) => !r.ok && !ehLimite(r.motivo)).map((r) => `${r.nome ?? r.uuid}: ${r.motivo ?? "erro"}`);
  return {
    ok: erros.length === 0, dry, pendentes: escolhidos.length, lidos: lidos - (parouNaCota ? 1 : 0),
    sobraram: fila.length - lidos + (parouNaCota ? 1 : 0), resultados, erros,
  };
}

// ── "Ainda não assinaram" — dia útil de manhã ────────────────────────────────────────────────────

export interface ResultadoPendentes {
  ok: boolean;
  dry: boolean;
  enviado: boolean;
  texto: string;
  itens: ItemPendente[];
  /** Pendentes relidos na D4Sign antes de escrever (para "quem falta" estar em dia). */
  relidos: number;
  motivo: string | null;
  erros: string[];
}

/**
 * UMA mensagem no grupo de cadastro, só se houver contrato enviado há DIAS_SEM_ASSINATURA dias ou mais sem
 * todas as assinaturas: cada um com quem falta e há quantos dias. Antes de escrever, relê na D4Sign os mais
 * antigos (o que couber na cota) — quem assinou de madrugada não aparece como faltando. Uma por dia (idem).
 * O portão de dia útil fica na rota (feriado não manda).
 */
export async function avisarPendentes(opts: { dry?: boolean; agora?: Date; dia: string; cfg?: ConfigD4Sign | null }): Promise<ResultadoPendentes> {
  const dry = !!opts.dry;
  const agora = opts.agora ?? new Date();
  const base = { dry, enviado: false, texto: "", itens: [] as ItemPendente[], relidos: 0, erros: [] as string[] };
  const ler = async () => supabaseAdmin.from(TABELA).select("document_uuid, nome, client_id, enviado_em, visto_em, signatarios").eq("status", "pendente");
  const diasDe = (l: LinhaDocumento) => Math.floor((agora.getTime() - new Date(l.enviado_em ?? l.visto_em ?? agora.toISOString()).getTime()) / DIA);

  let r = await ler();
  if (r.error) return { ...base, ok: false, motivo: faltaMigracao(r.error) ? "falta aplicar a migration 20261026150000_contrato_assinado_d4sign" : `não consegui ler os pendentes: ${r.error.message}` };
  let vencidos = ((r.data as LinhaDocumento[] | null) ?? []).filter((l) => diasDe(l) >= DIAS_SEM_ASSINATURA);
  if (!vencidos.length) return { ...base, ok: true, motivo: `nenhum contrato esperando assinatura há ${DIAS_SEM_ASSINATURA} dias ou mais` };

  // Relê os mais antigos (o que couber na cota). Ensaio não relê: mostra o que já se sabe.
  let relidos = 0;
  const erros: string[] = [];
  if (!dry) {
    const cfg = opts.cfg === undefined ? await carregarConfigD4Sign() : opts.cfg;
    if (cfg) {
      for (const l of [...vencidos].sort((a, b) => diasDe(b) - diasDe(a)).slice(0, LEITURAS_POR_CONSULTA)) {
        const p = await processarDocumento(l.document_uuid, { origem: "manha", agora, cfg, avisarParcial: false });
        if (!p.ok && ehLimite(p.motivo)) break;
        relidos++;
        if (!p.ok) erros.push(`${p.nome ?? p.uuid}: ${p.motivo ?? "erro"}`);
      }
      if (relidos) {
        r = await ler();
        if (r.error) return { ...base, ok: false, relidos, erros, motivo: `não consegui reler os pendentes: ${r.error.message}` };
        vencidos = ((r.data as LinhaDocumento[] | null) ?? []).filter((l) => diasDe(l) >= DIAS_SEM_ASSINATURA);
      }
    }
  }
  if (!vencidos.length) return { ...base, ok: erros.length === 0, relidos, erros, motivo: "os pendentes assinaram na releitura" };

  const ids = [...new Set(vencidos.map((l) => l.client_id).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const c = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", ids);
    if (c.error) return { ...base, ok: false, relidos, erros, motivo: `não consegui ler os clientes: ${c.error.message}` };
    for (const x of (c.data as ClienteCadastro[] | null) ?? []) nomes.set(x.id, nomeDoCliente(x));
  }
  const itens: ItemPendente[] = vencidos.map((l) => ({
    uuid: l.document_uuid,
    nome: (l.client_id && nomes.get(l.client_id)) || nomeDoDocumento(l.nome ?? ""),
    faltam: lerSignatariosGravados(l.signatarios).filter((s) => !s.assinou),
    dias: diasDe(l),
  }));
  const texto = mensagemPendentes(itens);
  const pronto = { ...base, relidos, erros, itens, texto };
  if (dry) return { ...pronto, ok: true, motivo: null };

  const idem = idemDosPendentes(opts.dia);
  const ja = await supabaseAdmin.from("cs_outbound").select("id").eq("idem_key", idem).eq("enviado", true).limit(1);
  if (ja.error) return { ...pronto, ok: false, motivo: `não consegui conferir se já mandei hoje: ${ja.error.message}` };
  if (ja.data?.length) return { ...pronto, ok: true, motivo: "o grupo de cadastro já recebeu o aviso de hoje" };

  const grupo = await grupoDeCadastro();
  if ("erro" in grupo) return { ...pronto, ok: false, motivo: grupo.erro };
  const env = await csSendGroupText(grupo.jid, texto, undefined, { origem: "contratos-pendentes", destino: "interno", idem });
  if (!env.ok) return { ...pronto, ok: false, motivo: `o aviso não saiu: ${env.error ?? "erro no WhatsApp"}` };
  return { ...pronto, ok: erros.length === 0, enviado: true, motivo: null };
}
