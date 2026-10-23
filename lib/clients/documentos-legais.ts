// lib/clients/documentos-legais.ts — documentos da ficha, ARQUIVO A ARQUIVO. Módulo PURO.
//
// O PROBLEMA (auditoria de erro recuperável, 21/10/2026, item 3.4): o campo de documento guarda
// vários arquivos ("url\nurl", lib/onboarding/docs.ts — cartão CNPJ com várias páginas, RG frente e
// verso), mas a ficha tratava a lista inteira como UM arquivo: "Visualizar" mandava as duas urls
// juntas e quebrava, "Substituir" gravava só o arquivo novo e as outras páginas sumiam da ficha, e não
// havia como remover só a página errada.
//
// Aqui: trocar UMA página mantendo a posição, quanto cabe no campo, e como descrever cada arquivo
// (tipo e data de envio) para a pessoa saber qual é qual antes de trocar ou remover.

import { listaDocs, adicionarDoc, SEP_DOCS } from "@/lib/onboarding/docs";

/** A coluna aceita até 1024 caracteres (/api/clients/update) — passar disso recusa o salvamento inteiro. */
export const LIMITE_CAMPO_DOC = 1024;

/** Troca UM arquivo pelo novo, no mesmo lugar da lista. Se o antigo já não está lá, acrescenta. */
export function trocarDocNaLista(valorAtual: string | null | undefined, urlAntiga: string, urlNova: string): string {
  const lista = listaDocs(valorAtual);
  const i = lista.indexOf(urlAntiga);
  if (i < 0) return adicionarDoc(valorAtual, urlNova);
  lista[i] = urlNova;
  return lista.join(SEP_DOCS);
}

/**
 * Cabe mais um arquivo no campo? Confere ANTES de enviar: a rota de upload grava o arquivo novo na
 * coluna por conta própria, então descobrir depois que não cabia deixaria a ficha só com ele.
 * A url privada tem forma conhecida: legal://<clientId>/<docType>-<13 dígitos>.<ext até 4>.
 */
export function cabeMaisUmDoc(valorAtual: string | null | undefined, clientId: string, docType: string): boolean {
  const exemplo = `legal://${clientId}/${docType}-0000000000000.jpeg`;
  return adicionarDoc(valorAtual, exemplo).length <= LIMITE_CAMPO_DOC;
}

export type TipoDoc = "pdf" | "imagem" | "arquivo";

export interface DescricaoDoc {
  /** Nome do arquivo como está guardado (sem o caminho). */
  nome: string;
  tipo: TipoDoc;
  /** "PDF", "Imagem JPG"... */
  rotuloTipo: string;
  /** Quando foi enviado (sai do nome do arquivo); null em cadastro antigo sem data no nome. */
  enviadoEm: Date | null;
  /** Arquivo no bucket privado (abre por link assinado). */
  privado: boolean;
}

const IMAGEM = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"]);

export function descreverDoc(url: string): DescricaoDoc {
  const privado = url.startsWith("legal://");
  const semQuery = url.split(/[?#]/)[0];
  const cru = semQuery.split("/").pop() || semQuery;
  let nome = cru;
  try { nome = decodeURIComponent(cru); } catch { /* nome com % solto: mostra como está */ }
  const ext = (nome.includes(".") ? nome.split(".").pop() || "" : "").toLowerCase();
  const tipo: TipoDoc = ext === "pdf" ? "pdf" : IMAGEM.has(ext) ? "imagem" : "arquivo";
  const rotuloTipo = tipo === "pdf" ? "PDF" : tipo === "imagem" ? `Imagem ${ext.toUpperCase()}` : ext ? ext.toUpperCase() : "Arquivo";
  // Upload grava <docType>-<Date.now()>.<ext>: os 13 dígitos são o momento do envio.
  const m = nome.match(/-(\d{13})\.[a-z0-9]+$/i);
  const enviadoEm = m ? new Date(Number(m[1])) : null;
  return { nome, tipo, rotuloTipo, enviadoEm: enviadoEm && !Number.isNaN(enviadoEm.getTime()) ? enviadoEm : null, privado };
}

/** "Arquivo 2 de 3 · PDF · enviado em 21/10/2026" — o que a pessoa lê para saber qual é qual. */
export function rotuloDoc(url: string, indice: number, total: number): string {
  const d = descreverDoc(url);
  const partes = [total > 1 ? `Arquivo ${indice + 1} de ${total}` : "Arquivo", d.rotuloTipo];
  if (d.enviadoEm) {
    partes.push(`enviado em ${d.enviadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  }
  return partes.join(" · ");
}
