// lib/clients/documentos-novo-cliente.ts — Contrato Social e RG/CNH no modal "Novo cliente". Puro.
//
// O PROBLEMA (25/10/2026, onda 5 da auditoria de erro recuperável). O modal mandava o arquivo na hora
// de escolher, com clientId `manual-<data>` — o cliente ainda não existe — e a rota de upload (que exige
// o id de um cliente de verdade, para não gravar documento na pasta de qualquer um) respondia
// "clientId inválido." para o Contrato Social. O RG/CNH ia com docType "rg_ou_cnh", que a rota nem
// conhece. Os dois falhavam sempre.
//
// Agora a tela GUARDA os arquivos escolhidos (com Remover/Trocar), confere formato e tamanho na hora, e
// os envia logo depois que o cadastro devolve o id — um por vez, porque a rota acrescenta cada arquivo
// à lista da ficha (ler-e-gravar) e dois ao mesmo tempo podiam se atropelar. O resultado aparece por
// arquivo ("2 de 2 documentos enviados", ou qual falhou com "Tentar de novo").
//
// Testado em tests/cadastro-cliente-novo-documentos.test.tsx.

import { limiteDoDocumento, MB } from "@/lib/onboarding/etapas";

export type DocNovoCliente = "contrato_social" | "identidade";

/** docType que a rota de upload conhece (BUCKET_BY_DOC_TYPE) + o nome que a pessoa lê. */
export const DOCS_NOVO_CLIENTE: readonly { docType: DocNovoCliente; rotulo: string }[] = [
  { docType: "contrato_social", rotulo: "Contrato Social" },
  { docType: "identidade", rotulo: "RG ou CNH" },
] as const;

export function rotuloDoDoc(docType: DocNovoCliente): string {
  return DOCS_NOVO_CLIENTE.find((d) => d.docType === docType)?.rotulo ?? docType;
}

/** Os mesmos formatos que a rota de upload aceita (app/api/onboarding/upload). */
export const EXTENSOES_ACEITAS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"] as const;
export const ACEITA_DOC = ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*,application/pdf";

/**
 * Páginas por documento. A ficha guarda a lista numa coluna de até 1024 caracteres
 * (lib/clients/documentos-legais.ts); 5 cabem com folga e cobrem RG frente e verso e contrato social.
 */
export const MAX_ARQUIVOS_POR_DOC = 5;

export function tamanhoLegivel(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** O limite dito ANTES de escolher: "JPG, PNG, HEIC ou PDF · até 30 MB cada". */
export function dicaDoDoc(docType: DocNovoCliente): string {
  return `JPG, PNG, HEIC ou PDF · até ${limiteDoDocumento(docType) / MB} MB cada · até ${MAX_ARQUIVOS_POR_DOC} arquivos`;
}

/**
 * Confere o arquivo na hora de escolher. null = pode guardar. A rota confere de novo (é ela quem manda);
 * aqui é para o erro aparecer no campo, não depois do cadastro.
 */
export function problemaDoArquivo(arquivo: { name: string; size: number }, docType: DocNovoCliente, jaEscolhidos: number): string | null {
  const ext = (arquivo.name.includes(".") ? arquivo.name.split(".").pop() ?? "" : "").toLowerCase();
  if (!(EXTENSOES_ACEITAS as readonly string[]).includes(ext)) {
    return `"${arquivo.name}" não é um formato aceito. Use JPG, PNG, WEBP, HEIC ou PDF.`;
  }
  const limite = limiteDoDocumento(docType);
  if (arquivo.size > limite) {
    return `"${arquivo.name}" tem ${tamanhoLegivel(arquivo.size)} — o limite é ${limite / MB} MB. Mande um PDF mais leve ou foto das páginas.`;
  }
  if (arquivo.size === 0) return `"${arquivo.name}" está vazio. Escolha o arquivo de novo.`;
  if (jaEscolhidos >= MAX_ARQUIVOS_POR_DOC) {
    return `${rotuloDoDoc(docType)}: no máximo ${MAX_ARQUIVOS_POR_DOC} arquivos. Junte as páginas num PDF só, ou remova um antes.`;
  }
  return null;
}

// ─── Depois do cadastro ─────────────────────────────────────────────────────

export type EstadoEnvio = "na_fila" | "enviando" | "enviado" | "falhou";

export interface EnvioDoc {
  id: string;
  docType: DocNovoCliente;
  nome: string;
  estado: EstadoEnvio;
  /** Motivo, quando falhou — já em frase para a tela. */
  erro?: string | null;
}

export interface ResumoEnvio {
  enviados: number;
  total: number;
  /** Ainda tem arquivo na fila ou subindo. */
  emAndamento: boolean;
  falhas: EnvioDoc[];
  /** "2 de 2 documentos enviados." / "Enviando documentos: 1 de 2…" / "1 de 2 documentos enviados — 1 não subiu." */
  frase: string;
}

export function resumoDoEnvio(envios: EnvioDoc[]): ResumoEnvio {
  const total = envios.length;
  const enviados = envios.filter((e) => e.estado === "enviado").length;
  const falhas = envios.filter((e) => e.estado === "falhou");
  const emAndamento = envios.some((e) => e.estado === "na_fila" || e.estado === "enviando");
  const doc = (n: number) => (n === 1 ? "documento" : "documentos");
  let frase: string;
  if (emAndamento) frase = `Enviando ${doc(total)}: ${enviados} de ${total}…`;
  else if (!falhas.length) frase = `${enviados} de ${total} ${doc(total)} ${total === 1 ? "enviado" : "enviados"}.`;
  else frase = `${enviados} de ${total} ${doc(total)} ${total === 1 ? "enviado" : "enviados"} — ${falhas.length} não ${falhas.length === 1 ? "subiu" : "subiram"}.`;
  return { enviados, total, emAndamento, falhas, frase };
}
