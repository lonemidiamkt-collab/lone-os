// lib/prospeccao/providers/importacao.ts — CSV (exportação da Driva, planilha do Roberto, lista de
// evento). Reconhece as colunas pelo cabeçalho; o que não reconhecer fica de fora, sem erro.

import type { Candidato } from "../tipos";

const ALIAS: Record<string, string[]> = {
  nome: ["nome fantasia", "nome_fantasia", "fantasia", "nome", "empresa", "estabelecimento"],
  razao_social: ["razao social", "razão social", "razao_social", "razao"],
  cnpj: ["cnpj"],
  cnae: ["cnae", "cnae principal", "cnae_principal", "cnae fiscal", "atividade principal"],
  segmento: ["segmento", "categoria", "ramo", "setor"],
  cidade: ["cidade", "municipio", "município", "city"],
  uf: ["uf", "estado", "state"],
  endereco: ["endereco", "endereço", "logradouro", "address"],
  telefone: ["telefone", "telefone 1", "telefone1", "celular", "whatsapp", "fone", "phone"],
  instagram: ["instagram", "insta", "@"],
  site: ["site", "website", "url", "www"],
  email: ["email", "e-mail"],
  socio: ["socio", "sócio", "socios", "sócios", "proprietario", "proprietário", "responsavel", "responsável", "administrador"],
  capital_social: ["capital social", "capital_social", "capital"],
  porte: ["porte"],
  abertura: ["abertura", "data de abertura", "data_abertura", "inicio atividade", "início atividade"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9@ ]/g, " ").replace(/\s+/g, " ").trim();

export function detectarSeparador(linha: string): string {
  const c = { ";": (linha.match(/;/g) ?? []).length, ",": (linha.match(/,/g) ?? []).length, "\t": (linha.match(/\t/g) ?? []).length };
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

/** Parser CSV simples com aspas (o suficiente para exportações de planilha). */
export function lerCsv(texto: string): string[][] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (!linhas.length) return [];
  const sep = detectarSeparador(linhas[0]);
  return linhas.map((linha) => {
    const cols: string[] = [];
    let atual = "", aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { cols.push(atual); atual = ""; }
      else atual += ch;
    }
    cols.push(atual);
    return cols.map((c) => c.trim());
  });
}

export function mapearColunas(cabecalho: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  cabecalho.forEach((h, i) => {
    const n = norm(h);
    for (const [campo, aliases] of Object.entries(ALIAS)) {
      if (mapa[campo] !== undefined) continue;
      if (aliases.some((a) => n === norm(a) || n.startsWith(`${norm(a)} `))) { mapa[campo] = i; break; }
    }
  });
  return mapa;
}

export interface ImportacaoResultado { candidatos: Candidato[]; colunas: Record<string, number>; ignoradas: number; total: number }

export function importarCsv(texto: string, ufPadrao = "RJ", origem = "csv"): ImportacaoResultado {
  const linhas = lerCsv(texto);
  if (linhas.length < 2) return { candidatos: [], colunas: {}, ignoradas: 0, total: 0 };
  const colunas = mapearColunas(linhas[0]);
  const pega = (l: string[], campo: string) => (colunas[campo] !== undefined ? (l[colunas[campo]] ?? "").trim() || null : null);
  const candidatos: Candidato[] = [];
  let ignoradas = 0;
  for (const l of linhas.slice(1)) {
    const nome = pega(l, "nome") ?? pega(l, "razao_social");
    if (!nome) { ignoradas++; continue; }
    const socio = pega(l, "socio");
    candidatos.push({
      nome, cidade: pega(l, "cidade"), uf: (pega(l, "uf") ?? ufPadrao).toUpperCase().slice(0, 2), segmento: pega(l, "segmento"),
      cnpj: pega(l, "cnpj"), site: pega(l, "site"), instagram: pega(l, "instagram"), telefone: pega(l, "telefone"), endereco: pega(l, "endereco"),
      sinais: [
        pega(l, "razao_social") ? `razão social: ${pega(l, "razao_social")}` : null,
        pega(l, "cnae") ? `cnae: ${pega(l, "cnae")}` : null,
        socio ? `sócio: ${socio}` : null,
        pega(l, "porte") ? `porte: ${pega(l, "porte")}` : null,
        pega(l, "capital_social") ? `capital social: ${pega(l, "capital_social")}` : null,
        pega(l, "abertura") ? `abertura: ${pega(l, "abertura")}` : null,
        pega(l, "email") ? `email: ${pega(l, "email")}` : null,
      ].filter((x): x is string => !!x),
      fonte: origem, query: null,
    });
  }
  return { candidatos, colunas, ignoradas, total: linhas.length - 1 };
}
