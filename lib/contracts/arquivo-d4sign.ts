// lib/contracts/arquivo-d4sign.ts — o arquivo de contratos por mês.
//
// Roberto, 26/10/2026: "deveria ter uma área de arquivos para vermos contratos de cada mês, e podermos
// baixar eles também". A maior parte dos contratos assinados vive só na D4Sign; no Lone OS ficava o que
// alguém subiu à mão. Aqui o PDF assinado de cada documento FINALIZADO nos cofres de contrato é baixado
// da D4Sign uma vez e guardado no mesmo lugar do "Upload assinado" (legal-docs/contracts-signed/…).
//
// O LIMITE MANDA. A D4Sign responde a 10 chamadas por hora (lib/contracts/d4sign-cota.ts). Cada documento
// antigo custa até 2 (ler quem assinou e quando + baixar o PDF), então o arquivo se completa aos poucos:
// a rotina roda de madrugada, quando a consulta de 3 em 3 horas não roda, e respeita a reserva do webhook.
// O que ainda não baixou aparece no arquivo com "PDF a caminho" e um botão para baixar na hora.
//
// SILENCIOSO. Documento que entra pelo arquivo nunca vira "✅ assinou" no grupo — o aviso fica travado.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { baixarPdfAssinado, listarFinalizadosDaConta, type ConfigD4Sign } from "./d4sign";
import type { OrigemChamada } from "./d4sign-cota";
import { carregarConfigD4Sign } from "./d4sign-config";
import { processarDocumento, tipoDoDocumento, nomeDoDocumento, uuidValido } from "./assinatura";
import { mesDe } from "./arquivo-mes";
import { religarDocumentos } from "./religar-d4sign";

export { mesDe, nomeDoMes } from "./arquivo-mes";

export const PDF_TENTATIVAS = 5;
/** A listagem dos finalizados roda no máximo uma vez a cada 20 h (cada página é uma chamada). */
export const LISTAGEM_A_CADA_HORAS = 20;
/** Documentos por rodada — o limite da hora corta antes, isto é só um teto. */
export const DOCUMENTOS_POR_RODADA = 6;
const BUCKET = "legal-docs";
const TABELA = "d4sign_documentos";

// ── Puras ────────────────────────────────────────────────────────────────────────────────────────


export interface ItemArquivo {
  /** document_uuid da D4Sign, ou "contrato:<id>" para o PDF subido à mão sem documento da D4Sign. */
  id: string;
  origem: "d4sign" | "lone";
  clientId: string | null;
  cliente: string;
  /** Nome do arquivo na D4Sign, ou "Contrato V2" do Lone OS. */
  documento: string;
  tipo: "contrato" | "documento";
  assinadoEm: string;
  /** legal://… — null enquanto a D4Sign não entregou o PDF. */
  pdf: string | null;
  /** Por que o PDF ainda não está aqui (última falha). */
  pdfErro: string | null;
}

export interface DocArquivo {
  document_uuid: string;
  nome: string | null;
  tipo: "contrato" | "documento" | null;
  client_id: string | null;
  contract_id: string | null;
  assinado_em: string | null;
  pdf_path: string | null;
  pdf_erro: string | null;
}

export interface ContratoArquivo {
  id: string;
  client_id: string;
  version: number | null;
  signed_at: string | null;
  signed_pdf_path: string | null;
  d4sign_document_uuid: string | null;
}

/**
 * Junta as duas fontes num item por contrato assinado. Pura.
 *  · documento da D4Sign finalizado (com data) → um item; se o contrato ligado já tem PDF subido à mão e a
 *    D4Sign ainda não entregou, usa o do contrato;
 *  · contrato do Lone OS com PDF assinado que nenhum documento da D4Sign representa → item "lone".
 * Sem data de assinatura não entra (não dá para dizer o mês) — a rotina lê a data antes.
 */
export function juntarArquivo(docs: DocArquivo[], contratos: ContratoArquivo[], nomes: Map<string, string>): ItemArquivo[] {
  const itens: ItemArquivo[] = [];
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]));
  const representados = new Set<string>();
  for (const d of docs) {
    if (!d.assinado_em) continue;
    const ligado = d.contract_id ? contratoPorId.get(d.contract_id) : undefined;
    if (ligado) representados.add(ligado.id);
    itens.push({
      id: d.document_uuid,
      origem: "d4sign",
      clientId: d.client_id,
      cliente: (d.client_id && nomes.get(d.client_id)) || nomeDoDocumento(d.nome ?? ""),
      documento: d.nome ?? "documento",
      tipo: d.tipo ?? tipoDoDocumento(d.nome ?? ""),
      assinadoEm: d.assinado_em,
      pdf: d.pdf_path ?? ligado?.signed_pdf_path ?? null,
      pdfErro: d.pdf_path || ligado?.signed_pdf_path ? null : d.pdf_erro,
    });
  }
  const uuidsD4 = new Set(docs.map((d) => d.document_uuid));
  for (const c of contratos) {
    if (!c.signed_at || !c.signed_pdf_path || representados.has(c.id)) continue;
    if (c.d4sign_document_uuid && uuidsD4.has(c.d4sign_document_uuid)) continue;
    itens.push({
      id: `contrato:${c.id}`,
      origem: "lone",
      clientId: c.client_id,
      cliente: nomes.get(c.client_id) ?? "Cliente",
      documento: `Contrato V${c.version ?? 1}`,
      tipo: "contrato",
      assinadoEm: c.signed_at,
      pdf: c.signed_pdf_path,
      pdfErro: null,
    });
  }
  return itens.sort((a, b) => b.assinadoEm.localeCompare(a.assinadoEm));
}

/** Meses com quantos itens cada, do mais recente ao mais antigo. Pura. */
export function mesesDoArquivo(itens: ItemArquivo[]): { mes: string; total: number; comPdf: number }[] {
  const m = new Map<string, { total: number; comPdf: number }>();
  for (const i of itens) {
    const k = mesDe(i.assinadoEm);
    const v = m.get(k) ?? { total: 0, comPdf: 0 };
    v.total++;
    if (i.pdf) v.comPdf++;
    m.set(k, v);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, v]) => ({ mes, ...v }));
}

/** Nome do arquivo dentro do .zip do mês: "2026-10-15 - Cliente - documento.pdf", sem repetir. Pura. */
export function nomesNoZip(itens: Pick<ItemArquivo, "assinadoEm" | "cliente" | "documento">[]): string[] {
  const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const usados = new Map<string, number>();
  return itens.map((i) => {
    const dia = new Date(new Date(i.assinadoEm).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const doc = limpo(i.documento.replace(/\.(docx?|pdf)$/i, "")) || "documento";
    const base = `${dia} - ${limpo(i.cliente) || "Cliente"} - ${doc}`;
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    return `${base}${n > 1 ? ` (${n})` : ""}.pdf`;
  });
}

/** O próximo da fila de download: assinado, sem PDF, abaixo do teto de tentativas, mais recente primeiro. Pura. */
export function filaDeDownload<T extends { assinado_em: string | null; pdf_path: string | null; pdf_tentativas?: number | null }>(linhas: T[]): T[] {
  return linhas
    .filter((l) => !l.pdf_path && (l.pdf_tentativas ?? 0) < PDF_TENTATIVAS)
    .sort((a, b) => (a.assinado_em && b.assinado_em ? b.assinado_em.localeCompare(a.assinado_em) : a.assinado_em ? -1 : b.assinado_em ? 1 : 0));
}

// ── Guardar um PDF ───────────────────────────────────────────────────────────────────────────────

export interface ResultadoPdf { ok: boolean; guardado: boolean; limite?: boolean; motivo: string | null; pdf?: string }

/**
 * Baixa o PDF assinado e guarda (legal-docs/contracts-signed/{cliente}/…). Uma vez por documento: a vez é
 * reservada no banco (pdf_tentativas) e o caminho só é gravado se ainda estiver vazio. Contrato do Lone OS
 * ligado e ainda sem PDF ganha este (signed_pdf_path + signed_at) — nunca troca um que alguém subiu, e não
 * mexe no status do contrato. Nunca lança.
 */
export async function guardarPdfAssinado(uuid: string, cfg: ConfigD4Sign, origem: OrigemChamada): Promise<ResultadoPdf> {
  try {
    const ex = await supabaseAdmin.from(TABELA)
      .select("document_uuid, status, client_id, contract_id, assinado_em, pdf_path, pdf_tentativas")
      .eq("document_uuid", uuid).maybeSingle();
    if (ex.error) return { ok: false, guardado: false, motivo: `não consegui ler o registro: ${ex.error.message}` };
    const l = ex.data as { status: string; client_id: string | null; contract_id: string | null; assinado_em: string | null; pdf_path: string | null; pdf_tentativas: number | null } | null;
    if (!l) return { ok: false, guardado: false, motivo: "documento ainda não registrado no Lone OS" };
    if (l.pdf_path) return { ok: true, guardado: false, motivo: "o PDF já estava guardado", pdf: l.pdf_path };
    if (l.status !== "assinado") return { ok: false, guardado: false, motivo: "documento ainda não finalizado na D4Sign" };
    const t = l.pdf_tentativas ?? 0;

    // A vez: dois processos ao mesmo tempo não baixam o mesmo PDF duas vezes.
    const vez = await supabaseAdmin.from(TABELA).update({ pdf_tentativas: t + 1 })
      .eq("document_uuid", uuid).eq("pdf_tentativas", t).is("pdf_path", null).select("document_uuid");
    if (vez.error) return { ok: false, guardado: false, motivo: `não consegui reservar o download: ${vez.error.message}` };
    if (!vez.data?.length) return { ok: true, guardado: false, motivo: "outro processo já está baixando este PDF" };

    const baixado = await baixarPdfAssinado(cfg, uuid, origem);
    if (!baixado.ok) {
      // Limite da hora não é falha do documento: devolve a vez sem gastar tentativa.
      if (baixado.limite) {
        await supabaseAdmin.from(TABELA).update({ pdf_tentativas: t }).eq("document_uuid", uuid).eq("pdf_tentativas", t + 1);
        return { ok: true, guardado: false, limite: true, motivo: baixado.erro };
      }
      await supabaseAdmin.from(TABELA).update({ pdf_erro: baixado.erro.slice(0, 300) }).eq("document_uuid", uuid);
      return { ok: false, guardado: false, motivo: baixado.erro };
    }

    const { arquivo } = baixado.dados;
    const caminho = `contracts-signed/${l.client_id ?? "sem-cadastro"}/d4sign-${uuid}-assinado-${Date.now()}.pdf`;
    const up = await supabaseAdmin.storage.from(BUCKET).upload(caminho, arquivo, { contentType: "application/pdf", upsert: false });
    if (up.error) {
      await supabaseAdmin.from(TABELA).update({ pdf_erro: `não guardei o PDF: ${up.error.message}`.slice(0, 300) }).eq("document_uuid", uuid);
      return { ok: false, guardado: false, motivo: `não consegui guardar o PDF: ${up.error.message}` };
    }
    const ref = `legal://${caminho}`;
    const g = await supabaseAdmin.from(TABELA).update({
      pdf_path: ref, pdf_sha256: createHash("sha256").update(arquivo).digest("hex"), pdf_tamanho: arquivo.length,
      pdf_baixado_em: new Date().toISOString(), pdf_erro: null,
    }).eq("document_uuid", uuid).is("pdf_path", null).select("document_uuid");
    if (g.error || !g.data?.length) {
      await supabaseAdmin.storage.from(BUCKET).remove([caminho]).catch(() => undefined);
      return g.error
        ? { ok: false, guardado: false, motivo: `não registrei o PDF: ${g.error.message}` }
        : { ok: true, guardado: false, motivo: "outro processo guardou o PDF antes" };
    }

    // O contrato do Lone OS ligado, se ainda não tem PDF assinado (a mesma referência do "Upload assinado").
    if (l.contract_id) {
      const c = await supabaseAdmin.from("contracts").update({
        signed_pdf_path: ref, signed_at: l.assinado_em ?? new Date().toISOString(),
        signed_uploaded_by: "D4Sign (automático)", signature_method: "d4sign_auto",
      }).eq("id", l.contract_id).is("signed_pdf_path", null);
      if (c.error) console.warn(`[arquivo-d4sign] PDF guardado, mas o contrato ${l.contract_id} não recebeu: ${c.error.message}`);
    }
    return { ok: true, guardado: true, motivo: null, pdf: ref };
  } catch (e) {
    return { ok: false, guardado: false, motivo: e instanceof Error ? e.message : "erro" };
  }
}

// ── A rotina da madrugada ────────────────────────────────────────────────────────────────────────

export interface ResultadoArquivo {
  ok: boolean;
  dry: boolean;
  desligado?: string;
  /** Finalizados novos dos cofres de contrato que entraram no registro nesta rodada. */
  novos: number;
  /** A listagem dos finalizados rodou nesta rodada (no máximo uma vez a cada 20 h). */
  listou: boolean;
  /** PDFs guardados nesta rodada. */
  guardados: number;
  /** Documentos sem PDF que ficaram para a próxima rodada. */
  faltam: number;
  /** Parou porque a cota da hora chegou na reserva do webhook. */
  parouNaCota: boolean;
  erros: string[];
}

/** A listagem dos finalizados já rodou nas últimas 20 h? (a conta de chamadas é o registro). */
async function listouHaPouco(agora: Date): Promise<boolean> {
  const desde = new Date(agora.getTime() - LISTAGEM_A_CADA_HORAS * 3600_000).toISOString();
  const r = await supabaseAdmin.from("d4sign_chamadas").select("id").eq("caminho", "/documents/4/status").gte("em", desde).limit(1);
  return !r.error && (r.data?.length ?? 0) > 0;
}

/**
 * 1. Uma vez a cada 20 h, lista os finalizados da conta e registra os dos cofres de contrato que o Lone OS
 *    ainda não conhece — com o aviso já travado (antigo não vira "assinou" no grupo).
 * 2. Para cada assinado sem PDF (mais recente primeiro): sem data ou sem cliente, relê (quem assinou e quando,
 *    em silêncio); depois baixa e guarda o PDF. Para quando a cota da hora chega na reserva.
 */
export async function rodarArquivo(opts: { dry?: boolean; agora?: Date; cfg?: ConfigD4Sign | null } = {}): Promise<ResultadoArquivo> {
  const dry = !!opts.dry;
  const agora = opts.agora ?? new Date();
  const res: ResultadoArquivo = { ok: true, dry, novos: 0, listou: false, guardados: 0, faltam: 0, parouNaCota: false, erros: [] };
  const cfg = opts.cfg === undefined ? await carregarConfigD4Sign() : opts.cfg;
  if (!cfg) return { ...res, desligado: "D4Sign não configurada (chaves em Configurações › Jurídico, ou no servidor)" };
  if (!cfg.cofres.length) return { ...res, desligado: "nenhum cofre de contrato escolhido (Configurações › Jurídico › D4Sign)" };

  // 0. Documento sem dono (ou com dono inválido) ganha o cadastro certo, com o que já está gravado — sem chamada.
  if (!dry) {
    const rl = await religarDocumentos();
    if (!rl.ok) res.erros.push(...rl.erros.map((e) => `religar: ${e}`));
  }

  // 1. Finalizados novos. O ensaio não fala com a D4Sign (cada página é uma das 10 chamadas da hora).
  if (!dry && !(await listouHaPouco(agora))) {
    const conhecidos = new Set<string>();
    for (let pg = 1; pg <= 5; pg++) {
      const lista = await listarFinalizadosDaConta(cfg, pg, "arquivo");
      if (!lista.ok) {
        if (lista.limite) { res.parouNaCota = true; break; }
        res.erros.push(lista.erro);
        break;
      }
      res.listou = true;
      const dosCofres = lista.dados.docs.filter((d) => uuidValido(d.uuid) && d.cofre && cfg.cofres.includes(d.cofre));
      for (let i = 0; i < dosCofres.length; i += 100) {
        const r = await supabaseAdmin.from(TABELA).select("document_uuid").in("document_uuid", dosCofres.slice(i, i + 100).map((d) => d.uuid));
        if (r.error) { res.erros.push(`não consegui ler os registros: ${r.error.message}`); return { ...res, ok: false }; }
        for (const l of (r.data as { document_uuid: string }[] | null) ?? []) conhecidos.add(l.document_uuid);
      }
      const novos = dosCofres.filter((d) => !conhecidos.has(d.uuid));
      if (novos.length) {
        const agoraIso = agora.toISOString();
        const ins = await supabaseAdmin.from(TABELA).upsert(novos.map((d) => ({
          document_uuid: d.uuid, nome: d.nome, status: "assinado", status_id: d.statusId || "4", tipo: tipoDoDocumento(d.nome),
          origem: "consulta", visto_em: agoraIso, atualizado_em: agoraIso,
          aviso_reservado_em: agoraIso, aviso_motivo: "entrou pelo arquivo de contratos: sem aviso no grupo",
        })), { onConflict: "document_uuid", ignoreDuplicates: true });
        if (ins.error) { res.erros.push(`não registrei os finalizados: ${ins.error.message}`); return { ...res, ok: false }; }
      }
      res.novos += novos.length;
      novos.forEach((d) => conhecidos.add(d.uuid));
      if (!lista.dados.paginas || pg >= lista.dados.paginas || lista.dados.docs.length === 0) break;
    }
  }

  // 2. PDFs.
  const sem = await supabaseAdmin.from(TABELA)
    .select("document_uuid, client_id, assinado_em, pdf_path, pdf_tentativas, leitura_erro")
    .eq("status", "assinado").is("pdf_path", null).limit(500);
  if (sem.error) { res.erros.push(`não consegui ler os documentos sem PDF: ${sem.error.message}`); return { ...res, ok: false }; }
  type Linha = { document_uuid: string; client_id: string | null; assinado_em: string | null; pdf_path: string | null; pdf_tentativas: number | null };
  const fila = filaDeDownload((sem.data as Linha[] | null) ?? []);
  res.faltam = fila.length;
  if (dry) return { ...res, ok: res.erros.length === 0 };

  let feitos = 0;
  for (const l of fila) {
    if (feitos >= DOCUMENTOS_POR_RODADA || res.parouNaCota) break;
    feitos++;
    if (!l.assinado_em || !l.client_id) {
      // Quem assinou e quando (o mês do arquivo), e o cliente — em silêncio.
      const r = await processarDocumento(l.document_uuid, { origem: "consulta", origemChamada: "arquivo", silencioso: true, agora, cfg });
      if (!r.ok && /limite de chamadas/.test(r.motivo ?? "")) { res.parouNaCota = true; break; }
      if (!r.ok) { res.erros.push(`${r.nome ?? l.document_uuid}: ${r.motivo ?? "erro"}`); continue; }
    }
    const p = await guardarPdfAssinado(l.document_uuid, cfg, "arquivo");
    if (p.limite) { res.parouNaCota = true; break; }
    if (!p.ok) { res.erros.push(`${l.document_uuid}: ${p.motivo ?? "erro"}`); continue; }
    if (p.guardado) { res.guardados++; res.faltam--; }
  }
  return { ...res, ok: res.erros.length === 0 };
}
