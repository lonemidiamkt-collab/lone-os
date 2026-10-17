// lib/crm/importar.ts — IMPORTAÇÃO do comercial: lojas da rota, oportunidades e a planilha do site.
// Módulo PURO (planeja; quem grava é a rota app/api/crm/importar). Testado.
//
// Por que planejar antes de gravar: a importação mexe no funil de verdade. A tela mostra linha a
// linha o que vai acontecer (criar / atualizar / ignorar, com o motivo) e só grava no "confirmar".
// Idempotente: rodar de novo não duplica — casa pela loja da rota, pelo id do cadastro do site, pela
// empresa e pelo WhatsApp.
//
// Os VALORES (mensalidade) vêm só do arquivo que o Roberto envia pela tela. Nada disso mora no repo.

import { createHash } from "node:crypto";
import { avaliarLead, ROTULO_DESCARTE } from "@/lib/crm/filtro-lead";
import { normalizarEtapa } from "@/lib/crm/etapas";
import type { CrmEstagio } from "@/lib/types";

// ─── Formatos de entrada ───────────────────────────────────────────────

export interface LojaRota {
  rota_loja_id: number;
  empresa: string;
  contato_nome?: string | null;
  tratamento?: string | null;
  segmento?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  instagram?: string | null;
  horario?: string | null;
  visitada?: boolean;
  visitada_por?: string | null;
  visitada_em?: string | null;
}

export interface Oportunidade {
  empresa: string;
  contato_nome?: string | null;
  mensalidade?: number | null;
  situacao?: string | null;
  etapa_sugerida?: string | null;
  probabilidade?: number | null;
  retomar_em?: string | null;
  rota_loja_id?: number | null;
  obs?: string | null;
}

export interface DadosIniciais { lojas_rota?: LojaRota[]; oportunidades?: Oportunidade[] }

export interface LeadExistente {
  id: string;
  empresa: string | null;
  contatoNome: string;
  telefone: string | null;
  rotaLojaId: number | null;
  externoId: string | null;
}

export interface ClienteExistente { nome: string; telefones: (string | null)[] }

export interface AtividadePlanejada { tipo: string; texto: string; quando: string | null; autor: string | null }

export interface LinhaPlano {
  chave: string;
  fonte: "rota" | "oportunidade" | "planilha";
  acao: "criar" | "atualizar" | "ignorar";
  motivo: string;
  titulo: string;          // empresa ou nome, para a tabela
  leadId: string | null;   // quando atualiza
  campos: Record<string, unknown>; // camelCase (CRM_FIELD_MAP)
  atividades: AtividadePlanejada[];
}

export interface Plano {
  linhas: LinhaPlano[];
  totais: { criar: number; atualizar: number; ignorar: number; mensalidade: number };
}

// ─── Utilitários ───────────────────────────────────────────────────────

export const normalizarNome = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Mesmo WhatsApp? Compara os últimos 8 dígitos (sem DDI, sem o nono dígito) — tolerante a máscara. */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const d = (x: string | null | undefined) => String(x ?? "").replace(/\D/g, "");
  const da = d(a), db = d(b);
  return da.length >= 8 && db.length >= 8 && da.slice(-8) === db.slice(-8);
}

/** "2026-10-17 04:58:03" (horário de São Paulo, como a planilha grava) → ISO com fuso. */
export function isoDeSP(s: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(s.trim());
  if (!m) return null;
  return `${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}-03:00`;
}

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** CSV com aspas, vírgula e quebra de linha dentro de campo (a planilha tem desafios com várias linhas). */
export function lerCsv(texto: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { row.push(campo); campo = ""; }
    else if (c === "\n") { row.push(campo); rows.push(row); row = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || row.length) { row.push(campo); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// ─── Planejamento ──────────────────────────────────────────────────────

const ETAPA_DA_SITUACAO: Record<string, CrmEstagio> = {
  "quase fechado": "negociacao", "em negociacao": "negociacao", "negociacao": "negociacao",
  "enviar mensagem": "contato", "contatar em novembro": "contato",
};

export function planejarImportacao(p: {
  dados?: DadosIniciais | null;
  csvPlanilha?: string | null;
  existentes: LeadExistente[];
  clientes: ClienteExistente[];
  hoje: string; // YYYY-MM-DD (SP)
  diasPlanilha?: number; // cadastros do site mais antigos que isso ficam de fora (reativação)
}): Plano {
  const linhas: LinhaPlano[] = [];
  const porRota = new Map<number, LinhaPlano>();
  const diasPlanilha = p.diasPlanilha ?? 90;

  const casaExistente = (empresa: string | null | undefined, telefone: string | null | undefined, rotaLojaId?: number | null, externoId?: string | null) =>
    p.existentes.find((l) =>
      (rotaLojaId != null && l.rotaLojaId === rotaLojaId) ||
      (externoId && l.externoId === externoId) ||
      (telefone && mesmoTelefone(l.telefone, telefone)) ||
      (empresa && normalizarNome(l.empresa) && normalizarNome(l.empresa) === normalizarNome(empresa)));
  const casaCliente = (empresa: string | null | undefined, telefone: string | null | undefined) =>
    p.clientes.find((c) => (telefone && c.telefones.some((t) => mesmoTelefone(t, telefone))) ||
      (empresa && normalizarNome(c.nome) === normalizarNome(empresa)));

  // 1) Lojas da rota → Contato feito, dia zero = dia da visita.
  for (const loja of p.dados?.lojas_rota ?? []) {
    if (!loja?.empresa || !Number.isInteger(loja.rota_loja_id)) continue;
    const chave = `rota:${loja.rota_loja_id}`;
    const existente = casaExistente(loja.empresa, loja.telefone, loja.rota_loja_id);
    const cliente = casaCliente(loja.empresa, loja.telefone);
    const visitaIso = loja.visitada_em ?? null;
    const obs = [
      loja.tratamento ? `Tratamento: ${loja.tratamento}` : null,
      loja.horario ? `Horário: ${loja.horario}` : null,
      !loja.telefone ? "Sem telefone na rota: pegar pelo Instagram." : null,
    ].filter(Boolean).join("\n");
    const linha: LinhaPlano = {
      chave, fonte: "rota", titulo: loja.empresa, leadId: existente?.id ?? null,
      acao: cliente ? "ignorar" : existente ? "ignorar" : "criar",
      motivo: cliente ? `Já é cliente (${cliente.nome}).` : existente ? "Já está no funil." : visitaIso ? `Visitada em ${diaSP(visitaIso).split("-").reverse().join("/")}${loja.visitada_por ? ` por ${loja.visitada_por}` : ""}.` : "Loja da rota.",
      campos: {
        contatoNome: loja.contato_nome || loja.empresa, empresa: loja.empresa, telefone: loja.telefone ?? null,
        segmento: loja.segmento ?? null, cidade: loja.cidade ?? null, endereco: loja.endereco ?? null, instagram: loja.instagram ?? null,
        estagio: "contato", origem: "Visita — Rota Lagos", responsavel: loja.visitada_por ?? null, rotaLojaId: loja.rota_loja_id,
        cadenciaInicio: visitaIso ? diaSP(visitaIso) : null, etapaDesde: visitaIso, primeiroContatoEm: visitaIso,
        observacoes: obs || null,
      },
      atividades: visitaIso ? [{ tipo: "visita", texto: `Visita presencial (Rota Lagos)${loja.visitada_por ? ` — ${loja.visitada_por}` : ""}.`, quando: visitaIso, autor: loja.visitada_por ?? null }] : [],
    };
    linhas.push(linha);
    porRota.set(loja.rota_loja_id, linha);
  }

  // 2) Oportunidades → etapa e chance do arquivo; se é loja da rota, completa a linha da loja.
  for (const o of p.dados?.oportunidades ?? []) {
    if (!o?.empresa) continue;
    const etapa = o.etapa_sugerida ? normalizarEtapa(o.etapa_sugerida) : (ETAPA_DA_SITUACAO[normalizarNome(o.situacao)] ?? "contato");
    const valor = typeof o.mensalidade === "number" && o.mensalidade > 0 ? o.mensalidade : null;
    const prob = typeof o.probabilidade === "number" && o.probabilidade >= 0 && o.probabilidade <= 1 ? o.probabilidade : null;
    const notaSituacao = `Situação (pipeline ${p.hoje.split("-").reverse().join("/")}): ${o.situacao ?? "—"}${o.obs ? ` · ${o.obs}` : ""}`;
    const extras = { valorOrcamento: valor, estagio: etapa, probabilidade: prob, retomarEm: o.retomar_em ?? null };
    const daRota = o.rota_loja_id != null ? porRota.get(o.rota_loja_id) : undefined;
    if (daRota) {
      Object.assign(daRota.campos, extras, { etapaDesde: new Date(`${p.hoje}T12:00:00-03:00`).toISOString() });
      if (o.contato_nome) daRota.campos.observacoes = [daRota.campos.observacoes, `Contato na negociação: ${o.contato_nome}`].filter(Boolean).join("\n");
      daRota.atividades.push({ tipo: "nota", texto: notaSituacao, quando: null, autor: "Roberto Lino" });
      if (daRota.acao === "ignorar" && daRota.leadId) { daRota.acao = "atualizar"; daRota.motivo = "Já está no funil: entra a negociação."; }
      else if (daRota.acao === "criar") daRota.motivo += " Com negociação.";
      continue;
    }
    const existente = casaExistente(o.empresa, null);
    const cliente = casaCliente(o.empresa, null);
    linhas.push({
      chave: `oportunidade:${normalizarNome(o.empresa)}`, fonte: "oportunidade", titulo: o.empresa, leadId: existente?.id ?? null,
      acao: cliente ? "ignorar" : existente ? "atualizar" : "criar",
      motivo: cliente ? `Já é cliente (${cliente.nome}).` : existente ? "Já está no funil: entra a negociação." : "Oportunidade do pipeline.",
      campos: {
        contatoNome: o.contato_nome || o.empresa, empresa: o.empresa, origem: "Pipeline de outubro", responsavel: "Roberto Lino",
        etapaDesde: new Date(`${p.hoje}T12:00:00-03:00`).toISOString(), ...extras,
        observacoes: o.obs ?? null,
      },
      atividades: [{ tipo: "nota", texto: notaSituacao, quando: null, autor: "Roberto Lino" }],
    });
  }

  // 3) Planilha do site → Novo (últimos N dias), com o mesmo filtro de lixo do recebimento ao vivo.
  if (p.csvPlanilha?.trim()) {
    const [cab, ...rows] = lerCsv(p.csvPlanilha);
    const idx = (nome: string) => cab.findIndex((c) => normalizarNome(c).startsWith(normalizarNome(nome)));
    const iT = idx("Timestamp"), iN = idx("Nome completo"), iW = idx("WhatsApp"), iE = idx("Email"), iEmp = idx("Empresa"),
      iS = idx("Segmento"), iF = idx("Receita Mensal"), iD = idx("Maior desafio");
    const limite = somaDias(p.hoje, -diasPlanilha);
    const vistosNaPlanilha: string[] = [];
    // Mais novo primeiro: o duplicado que fica é o cadastro mais recente.
    const ordenadas = rows.map((r) => ({ r, iso: isoDeSP(r[iT] ?? "") })).sort((a, b) => (b.iso ?? "").localeCompare(a.iso ?? ""));
    for (const { r, iso } of ordenadas) {
      const nome = (r[iN] ?? "").trim();
      const empresa = (r[iEmp] ?? "").trim();
      const titulo = empresa || nome || "(sem nome)";
      const chave = `planilha:${createHash("sha1").update(`${r[iT]}|${r[iW]}|${nome}`).digest("hex").slice(0, 16)}`;
      const ignora = (motivo: string) => linhas.push({ chave, fonte: "planilha", acao: "ignorar", motivo, titulo, leadId: null, campos: {}, atividades: [] });
      if (!iso) { ignora("Data do cadastro ilegível."); continue; }
      const v = avaliarLead({ nome, empresa, email: r[iE], telefone: r[iW], desafio: r[iD] });
      if (!v.ok) { ignora(`Descartado: ${ROTULO_DESCARTE[v.motivo].toLowerCase()}.`); continue; }
      if (diaSP(iso) < limite) { ignora(`Cadastro de mais de ${diasPlanilha} dias: fica para a lista de reativação.`); continue; }
      const chaveTel = v.telefone ?? `email:${(r[iE] ?? "").toLowerCase()}`;
      if (vistosNaPlanilha.includes(chaveTel)) { ignora("Duplicado na planilha (ficou o cadastro mais recente)."); continue; }
      vistosNaPlanilha.push(chaveTel);
      const cliente = casaCliente(empresa, v.telefone);
      if (cliente) { ignora(`Já é cliente (${cliente.nome}).`); continue; }
      const existente = casaExistente(empresa || null, v.telefone, null, chave);
      if (existente) { ignora("Já está no funil."); continue; }
      const obs = [
        r[iD]?.trim() ? `Desafio: ${r[iD].replace(/\s+/g, " ").trim().slice(0, 500)}` : null,
        r[iF]?.trim() ? `Faturamento informado: ${r[iF].trim()}` : null,
        !v.telefone && v.telefoneDigitado ? `Telefone digitado no formulário: ${v.telefoneDigitado} — está errado, conferir pelo e-mail ou Instagram.` : null,
      ].filter(Boolean).join("\n");
      linhas.push({
        chave, fonte: "planilha", acao: "criar", titulo, leadId: null,
        motivo: `Cadastro no site em ${diaSP(iso).split("-").reverse().join("/")}${v.telefone ? "" : " · telefone a conferir"}.`,
        campos: {
          contatoNome: nome || empresa, empresa: empresa || null, telefone: v.telefone, email: (r[iE] ?? "").trim() || null,
          segmento: (r[iS] ?? "").trim() || null, origem: "Site", estagio: "novo", externoId: chave,
          cadenciaInicio: diaSP(iso), etapaDesde: iso, observacoes: obs || null,
        },
        atividades: [{ tipo: "nota", texto: "Formulário do site (importado da planilha).", quando: iso, autor: "Site" }],
      });
    }
  }

  const totais = {
    criar: linhas.filter((l) => l.acao === "criar").length,
    atualizar: linhas.filter((l) => l.acao === "atualizar").length,
    ignorar: linhas.filter((l) => l.acao === "ignorar").length,
    mensalidade: linhas.filter((l) => l.acao !== "ignorar").reduce((s, l) => s + (typeof l.campos.valorOrcamento === "number" ? (l.campos.valorOrcamento as number) : 0), 0),
  };
  return { linhas, totais };
}
