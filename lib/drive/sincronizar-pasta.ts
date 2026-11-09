// lib/drive/sincronizar-pasta.ts — cria (ou põe em dia) a pasta do cliente no Drive da Lone. Só servidor.
//
// Uma função só para todos os caminhos: o cliente terminou o cadastro pelo link, foi aprovado, foi
// cadastrado à mão, o time clicou "Criar pasta" na ficha, trocou um documento ou o social/designer.
// O desenho e as regras puras estão em lib/drive/pasta-cliente.ts.
//
// Regras que não se negociam:
//   · NUNCA DUAS PASTAS. Trava por cliente (clients.drive_trava_em) e, antes de criar, procura pelo crachá
//     (appProperties) — id perdido ou pasta renomeada à mão é achada de novo, não recriada.
//   · FALHA APARECE. O que impediu a pasta vai para clients.drive_erro (a ficha mostra com "Tentar de novo");
//     o que saiu pela metade (um arquivo, uma pessoa sem e-mail) vai para drive_avisos. No cadastro, o grupo
//     de cadastro recebe a falha também — nunca "✅" com a pasta faltando.
//   · SÓ MEXE NO QUE É DELA. Arquivo posto à mão em Documentos fica; acesso dado à mão fica. Arquivo que
//     saiu da ficha vai para a LIXEIRA do Drive (30 dias para voltar), nunca apagado de vez.
//   · NUNCA LANÇA: devolve { ok, erro, avisos }.

import { supabaseAdmin } from "@/lib/supabase/server";
import { estadoGoogle } from "@/lib/prospeccao/google";
import { lerSetting, gravarSetting } from "@/lib/prospeccao/config";
import { resolveRef } from "@/lib/storage/ref";
import { csSendGroupText } from "@/lib/cs/notify";
import { jidDoGrupoCadastro, ehGrupoDeCliente } from "@/lib/portal/link-automatico";
import * as D from "./google-drive";
import {
  NOME_RAIZ, SUBPASTA, PROP, MIME_PASTA, linkDaPasta, nomeDaPasta, arquivosDoCadastro, planoDeDocumentos,
  extensaoDe, mimePorExtensao, acessoDasFotos, acessoDaRaiz, planoDeAcessos, concedidosDepois,
  fraseDoErroDoGoogle, mensagemPastaCriada, mensagemPastaFalhou,
  type ErroGoogle, type MembroEquipe, type PapelSubpasta,
} from "./pasta-cliente";

export type OrigemPasta = "cadastro" | "aprovacao" | "cadastro_manual" | "ficha" | "documento" | "equipe" | "backfill";

/** Origens em que o cliente acabou de entrar: o grupo de cadastro fica sabendo (pasta criada ou falha). */
const AVISA_GRUPO: OrigemPasta[] = ["cadastro", "aprovacao", "cadastro_manual"];

export interface ResultadoPasta {
  ok: boolean;
  /** A pasta do cliente nasceu nesta chamada. */
  criada: boolean;
  /** O que impediu a pasta (frase pronta). */
  erro?: string;
  /** Outra sincronia deste cliente estava rodando (a pasta não foi tocada agora). */
  ocupada?: boolean;
  /** O que ficou pela metade. */
  avisos: string[];
  links?: { pasta: string; documentos: string; fotos: string };
  documentos?: { naPasta: number; enviados: number; removidos: number };
  /** Quem edita Fotos e Vídeos (nomes da equipe). */
  editamFotos?: string[];
}

const COLS = "id, name, nome_fantasia, assigned_social, assigned_designer, doc_contrato_social, doc_identidade, doc_logo, drive_link, drive_pasta_id, drive_documentos_id, drive_fotos_id, drive_acessos";

interface LinhaCliente {
  id: string; name: string | null; nome_fantasia: string | null;
  assigned_social: string | null; assigned_designer: string | null;
  doc_contrato_social: string | null; doc_identidade: string | null; doc_logo: string | null;
  drive_link: string | null; drive_pasta_id: string | null; drive_documentos_id: string | null; drive_fotos_id: string | null;
  drive_acessos: unknown;
}

type Etapa = { ok: true; id: string; criada: boolean } | { ok: false; erro: ErroGoogle };

const TRAVA_MIN = 10;

function baseDoPainel(): string {
  return process.env.NEXT_PUBLIC_PORTAL_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "https://painel.lonemidia.com";
}

// ── Pastas ──────────────────────────────────────────────────────────────────────────────────────────

/** A pasta guardada, ou a achada pelo crachá, ou uma nova. Renomeia só quando `renomear` (pasta do cliente). */
async function garantirPasta(p: { idSalvo: string | null; nome: string; pai: string | null; props: Record<string, string>; renomear?: boolean }): Promise<Etapa> {
  const ajustarNome = async (f: D.ArquivoDrive) => {
    if (p.renomear && f.name !== p.nome) await D.renomear(f.id, p.nome); // nome errado não derruba a pasta
  };
  if (p.idSalvo) {
    const r = await D.lerArquivo(p.idSalvo);
    if (r.ok && r.data && !r.data.trashed) { await ajustarNome(r.data); return { ok: true, id: r.data.id, criada: false }; }
    // 404 = apagada de vez (ou fora do alcance do drive.file); lixeira = alguém jogou fora. Os dois: procura/recria.
    if (!r.ok && r.status !== 404) return { ok: false, erro: r };
  }
  const filtro = Object.entries(p.props)
    .map(([k, v]) => `appProperties has { key=${D.literal(k)} and value=${D.literal(v)} }`)
    .join(" and ");
  const achadas = await D.procurar(`${filtro} and mimeType = ${D.literal(MIME_PASTA)} and trashed = false`);
  if (!achadas.ok) return { ok: false, erro: achadas };
  const f = achadas.data?.[0];
  if (f) { await ajustarNome(f); return { ok: true, id: f.id, criada: false }; }
  const nova = await D.criarPasta(p.nome, p.pai, p.props);
  if (!nova.ok || !nova.data?.id) return { ok: false, erro: nova.ok ? { mensagem: "o Google não devolveu a pasta criada" } : nova };
  return { ok: true, id: nova.data.id, criada: true };
}

/** Uma raiz só, mesmo com dois cadastros terminando juntos (o servidor é um processo só). */
let raizEmAndamento: Promise<Etapa> | null = null;
function garantirRaiz(): Promise<Etapa> {
  if (!raizEmAndamento) {
    raizEmAndamento = (async () => {
      const r = await garantirPasta({ idSalvo: await lerSetting("drive_raiz_id"), nome: NOME_RAIZ, pai: null, props: { [PROP.raiz]: "1" } });
      if (r.ok) await gravarSetting("drive_raiz_id", r.id).catch((e) => console.error("[drive] id da raiz não gravado:", e));
      return r;
    })().finally(() => { raizEmAndamento = null; });
  }
  return raizEmAndamento;
}

// ── Acessos ─────────────────────────────────────────────────────────────────────────────────────────

/** Aplica o plano de acessos numa pasta. Devolve o que ficou registrado como dado pelo Lone OS. */
async function sincronizarAcessos(pastaId: string, desejados: string[], concedidosAntes: string[], notificar: boolean, avisos: string[], rotulo: string): Promise<{ concedidos: string[]; adicionados: string[]; removidos: string[] } | null> {
  const atuais = await D.listarPermissoes(pastaId);
  if (!atuais.ok || !atuais.data) {
    avisos.push(`Não consegui ler quem tem acesso a ${rotulo}: ${fraseDoErroDoGoogle(atuais)}`);
    return null;
  }
  const plano = planoDeAcessos(desejados, concedidosAntes, atuais.data);
  const adicionados: string[] = [];
  const removidos: string[] = [];
  for (const email of plano.adicionar) {
    const r = await D.compartilhar(pastaId, email, "writer", notificar);
    if (r.ok) adicionados.push(email);
    else avisos.push(`Não consegui dar acesso a ${email} em ${rotulo}: ${fraseDoErroDoGoogle(r)}`);
  }
  for (const p of plano.remover) {
    const r = await D.tirarPermissao(pastaId, p.id);
    if (r.ok) removidos.push(p.email);
    else avisos.push(`Não consegui tirar o acesso de ${p.email} em ${rotulo}: ${fraseDoErroDoGoogle(r)}`);
  }
  return { concedidos: concedidosDepois(concedidosAntes, atuais.data, adicionados, removidos), adicionados, removidos };
}

function lerLista(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") { try { return lerLista(JSON.parse(v)); } catch { return []; } }
  return [];
}

// ── Documentos ──────────────────────────────────────────────────────────────────────────────────────

async function baixar(ref: string): Promise<{ ok: true; corpo: Blob } | { ok: false; erro: string }> {
  const externo = /^https?:\/\//i.test(ref) && !/storage\/v1\/object\//.test(ref);
  try {
    if (externo) {
      const r = await fetch(ref, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) return { ok: false, erro: `o endereço do arquivo respondeu ${r.status}` };
      return { ok: true, corpo: await r.blob() };
    }
    const { bucket, path } = resolveRef(ref);
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error || !data) return { ok: false, erro: error?.message || "o arquivo não está mais no Lone OS" };
    return { ok: true, corpo: data };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "não consegui baixar" };
  }
}

async function sincronizarDocumentos(c: LinhaCliente, pastaDocs: string, avisos: string[]): Promise<{ naPasta: number; enviados: number; removidos: number }> {
  const desejados = arquivosDoCadastro(c);
  const lista = await D.procurar(`${D.literal(pastaDocs)} in parents and trashed = false`);
  if (!lista.ok || !lista.data) {
    avisos.push(`Não consegui ler a pasta Documentos: ${fraseDoErroDoGoogle(lista)}`);
    return { naPasta: 0, enviados: 0, removidos: 0 };
  }
  const naPasta = lista.data.map((f) => ({ id: f.id, chave: f.appProperties?.[PROP.arquivo] ?? null }));
  const plano = planoDeDocumentos(desejados, naPasta);
  let enviados = 0, removidos = 0;
  for (const a of plano.enviar) {
    const b = await baixar(a.ref);
    if (!b.ok) { avisos.push(`Não copiei "${a.nome}" para Documentos: ${b.erro}.`); continue; }
    const mime = b.corpo.type && b.corpo.type !== "application/octet-stream" ? b.corpo.type : mimePorExtensao(extensaoDe(a.ref));
    const r = await D.enviarArquivo({ pai: pastaDocs, nome: a.nome, mime, corpo: b.corpo, props: { [PROP.arquivo]: a.chave, [PROP.cliente]: c.id } });
    if (r.ok) enviados++;
    else avisos.push(`Não copiei "${a.nome}" para Documentos: ${fraseDoErroDoGoogle(r)}`);
  }
  for (const id of plano.remover) {
    const r = await D.mandarParaLixeira(id);
    if (r.ok) removidos++;
    else avisos.push(`Um documento que saiu da ficha continua na pasta: ${fraseDoErroDoGoogle(r)}`);
  }
  const ficaram = naPasta.filter((f) => f.chave).length - removidos + enviados;
  return { naPasta: Math.max(0, ficaram), enviados, removidos };
}

// ── Aviso no grupo de cadastro ──────────────────────────────────────────────────────────────────────

async function avisarGrupo(clientId: string, nome: string, texto: string, falha: boolean): Promise<void> {
  const jid = jidDoGrupoCadastro();
  const sino = async (motivo: string) => {
    await supabaseAdmin.from("notifications").insert({
      type: "system",
      title: falha ? "Pasta do Drive não criada" : "Pasta do Drive criada sem aviso no grupo",
      body: falha ? `${nome}: ${motivo}` : `A pasta de ${nome} foi criada, mas o aviso não chegou ao grupo de cadastro (${motivo}).`,
      client_id: clientId,
    });
  };
  // Falha sempre vira sino também: o grupo pode não ser lido na hora.
  if (falha) await sino(texto.split("\n")[1] ?? texto).catch(() => null);
  if (!jid) { if (!falha) await sino("grupo de cadastro não configurado").catch(() => null); return; }
  if (await ehGrupoDeCliente(jid)) { console.error("[drive] grupo de cadastro configurado é de cliente — aviso não enviado"); return; }
  const env = await csSendGroupText(jid, texto, undefined, { origem: "drive-pasta-cliente", destino: "interno", clientId }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "erro", incerto: false }));
  if (!env.ok && !env.incerto && !falha) await sino(env.error ?? "o WhatsApp recusou").catch(() => null);
}

// ── A função ────────────────────────────────────────────────────────────────────────────────────────

async function registrarFalha(clientId: string, erro: string, soltarTrava: boolean): Promise<void> {
  const patch: Record<string, unknown> = { drive_erro: erro };
  if (soltarTrava) patch.drive_trava_em = null;
  const { error } = await supabaseAdmin.from("clients").update(patch).eq("id", clientId);
  if (error) console.error("[drive] falha não registrada na ficha:", error.message);
}

export async function garantirPastaDoCliente(
  clientId: string,
  opcoes: { origem: OrigemPasta; notificarEquipe?: boolean },
): Promise<ResultadoPasta> {
  const avisos: string[] = [];
  const avisa = AVISA_GRUPO.includes(opcoes.origem);
  const notificar = opcoes.notificarEquipe ?? opcoes.origem !== "backfill";

  // 1. Google pronto? (sem trava ainda: não há o que soltar)
  const g = await estadoGoogle();
  const semGoogle = !g.conectado ? fraseDoErroDoGoogle({ motivo: "sem_token" })
    : g.drive === false ? fraseDoErroDoGoogle({ motivo: "sem_escopo_drive" }) : null;

  // 2. Trava por cliente.
  const limite = new Date(Date.now() - TRAVA_MIN * 60_000).toISOString();
  const { data: travado, error: eTrava } = await supabaseAdmin.from("clients")
    .update({ drive_trava_em: new Date().toISOString() })
    .eq("id", clientId)
    .or(`drive_trava_em.is.null,drive_trava_em.lt."${limite}"`)
    .select(COLS)
    .maybeSingle();
  if (eTrava) return { ok: false, criada: false, erro: `Não consegui abrir o cadastro do cliente: ${eTrava.message}`, avisos };
  if (!travado) {
    const { data: existe } = await supabaseAdmin.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (!existe) return { ok: false, criada: false, erro: "Cliente não encontrado.", avisos };
    return { ok: false, criada: false, ocupada: true, erro: "A pasta deste cliente já está sendo criada ou atualizada agora. Veja de novo em um minuto.", avisos };
  }
  const c = travado as unknown as LinhaCliente;
  const nomeCliente = nomeDaPasta(c);
  const linkFicha = `${baseDoPainel()}/clients/${clientId}?tab=marca`;

  const falhar = async (erro: string): Promise<ResultadoPasta> => {
    await registrarFalha(clientId, erro, true);
    if (avisa) await avisarGrupo(clientId, nomeCliente, mensagemPastaFalhou({ cliente: nomeCliente, motivo: erro, linkFicha }), true);
    return { ok: false, criada: false, erro, avisos };
  };

  try {
    if (semGoogle) return await falhar(semGoogle);

    // 3. Pastas: raiz → cliente → Documentos e Fotos e Vídeos.
    const raiz = await garantirRaiz();
    if (!raiz.ok) return await falhar(fraseDoErroDoGoogle(raiz.erro));
    const pasta = await garantirPasta({ idSalvo: c.drive_pasta_id, nome: nomeCliente, pai: raiz.id, props: { [PROP.cliente]: clientId, [PROP.papel]: "cliente" }, renomear: true });
    if (!pasta.ok) return await falhar(fraseDoErroDoGoogle(pasta.erro));
    const sub = async (papel: PapelSubpasta, idSalvo: string | null) =>
      garantirPasta({ idSalvo, nome: SUBPASTA[papel], pai: pasta.id, props: { [PROP.cliente]: clientId, [PROP.papel]: papel } });
    const docs = await sub("documentos", c.drive_documentos_id);
    if (!docs.ok) return await falhar(fraseDoErroDoGoogle(docs.erro));
    const fotos = await sub("fotos", c.drive_fotos_id);
    if (!fotos.ok) return await falhar(fraseDoErroDoGoogle(fotos.erro));

    // Os ids vão para a ficha JÁ: se algo abaixo falhar, a próxima tentativa não cria outra pasta.
    const { error: eIds } = await supabaseAdmin.from("clients")
      .update({ drive_pasta_id: pasta.id, drive_documentos_id: docs.id, drive_fotos_id: fotos.id }).eq("id", clientId);
    if (eIds) avisos.push(`A pasta existe no Drive, mas a ficha não guardou o endereço (${eIds.message}). Clique em "Atualizar pasta".`);

    // 4. Documentos do cadastro.
    const documentos = await sincronizarDocumentos(c, docs.id, avisos);

    // 5. Quem acessa. Equipe lida uma vez; a conta dona do Drive fica de fora (já é dona).
    const { data: eq, error: eEq } = await supabaseAdmin.from("team_members").select("name, email, role, is_active, deleted_at");
    const equipe = (eq ?? []) as MembroEquipe[];
    const dono = (g.email || "").toLowerCase() || null;
    let concedidosFotos = lerLista(c.drive_acessos);
    let editamFotos: string[] = [];
    if (eEq) {
      avisos.push(`Não consegui ler a equipe (${eEq.message}): os acessos não foram conferidos.`);
    } else {
      // Raiz: os admins veem tudo (inclusive Documentos). Registro na própria configuração.
      const antesRaiz = lerLista(await lerSetting("drive_raiz_acessos"));
      const rr = await sincronizarAcessos(raiz.id, acessoDaRaiz(equipe, dono), antesRaiz, notificar, avisos, `"${NOME_RAIZ}"`);
      if (rr && JSON.stringify(rr.concedidos) !== JSON.stringify([...antesRaiz].sort())) {
        await gravarSetting("drive_raiz_acessos", JSON.stringify(rr.concedidos)).catch(() => avisos.push("A lista de acessos da pasta de clientes não foi guardada."));
      }
      // Fotos e Vídeos: social e designer do cliente.
      const af = acessoDasFotos(c, equipe, dono);
      editamFotos = af.pessoas.map((p) => p.nome);
      for (const nome of af.semEmail) avisos.push(`${nome} não está ativo na equipe com e-mail — ficou sem acesso a Fotos e Vídeos.`);
      const rf = await sincronizarAcessos(fotos.id, af.emails, concedidosFotos, notificar, avisos, "Fotos e Vídeos");
      if (rf) concedidosFotos = rf.concedidos;
    }

    // 6. Ficha: ids, acessos, avisos e o link que o pedido de arte já mostra (se ainda não havia outro).
    const linkFotos = linkDaPasta(fotos.id) as string;
    const atual = (c.drive_link || "").trim();
    const patch: Record<string, unknown> = {
      drive_pasta_id: pasta.id, drive_documentos_id: docs.id, drive_fotos_id: fotos.id,
      drive_acessos: concedidosFotos, drive_sincronizado_em: new Date().toISOString(),
      drive_erro: null, drive_avisos: avisos, drive_trava_em: null,
    };
    if (!atual || atual === linkDaPasta(c.drive_fotos_id) || atual.includes(fotos.id)) patch.drive_link = linkFotos;
    const { error: eFim } = await supabaseAdmin.from("clients").update(patch).eq("id", clientId);
    if (eFim) {
      avisos.push(`A pasta está pronta, mas a ficha não foi atualizada (${eFim.message}).`);
      await supabaseAdmin.from("clients").update({ drive_trava_em: null }).eq("id", clientId);
    }

    const links = { pasta: linkDaPasta(pasta.id) as string, documentos: linkDaPasta(docs.id) as string, fotos: linkFotos };
    if (avisa && pasta.criada) {
      await avisarGrupo(clientId, nomeCliente, mensagemPastaCriada({
        cliente: nomeCliente, fotos: links.fotos, documentos: links.documentos, quemEdita: editamFotos,
        documentosCopiados: documentos.naPasta, avisos,
      }), false);
    }
    return { ok: true, criada: pasta.criada, avisos, links, documentos, editamFotos };
  } catch (e) {
    // Rede caída no meio, resposta estranha: a trava solta e a falha fica na ficha.
    const erro = `A pasta do Drive não terminou: ${e instanceof Error ? e.message : "erro inesperado"}. Tente de novo.`;
    return await falhar(erro);
  }
}

/** Para os ganchos (cadastro, aprovação, cadastro manual): roda depois de responder, nunca lança. */
export function dispararPastaDoCliente(clientId: string, origem: OrigemPasta): void {
  void garantirPastaDoCliente(clientId, { origem })
    .then((r) => { if (!r.ok) console.error(`[drive] pasta de ${clientId} (${origem}): ${r.erro}`); })
    .catch((e) => console.error(`[drive] pasta de ${clientId} (${origem}) falhou:`, e));
}

/**
 * Documento trocado ou social/designer trocado: põe a pasta em dia SE o cliente já tem pasta (cliente sem
 * pasta é assunto do cadastro, não daqui). Se outra sincronia estiver rodando, tenta de novo uma vez.
 */
export function dispararSincroniaSeTemPasta(clientId: string, origem: "documento" | "equipe"): void {
  const rodar = async (tentativa: number): Promise<void> => {
    const { data } = await supabaseAdmin.from("clients").select("drive_pasta_id").eq("id", clientId).maybeSingle();
    if (!data?.drive_pasta_id) return;
    const r = await garantirPastaDoCliente(clientId, { origem });
    if (r.ocupada && tentativa === 0) { setTimeout(() => { void rodar(1).catch(() => null); }, 60_000); return; }
    if (!r.ok) console.error(`[drive] sincronia de ${clientId} (${origem}): ${r.erro}`);
  };
  void rodar(0).catch((e) => console.error(`[drive] sincronia de ${clientId} (${origem}) falhou:`, e));
}
