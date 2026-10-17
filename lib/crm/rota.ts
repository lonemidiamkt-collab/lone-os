// lib/crm/rota.ts — as VISITAS da Rota de Prospecção (PWA rota-lagos.vercel.app) entram sozinhas no
// funil do comercial. Módulo PURO, testado; quem grava é o cron app/api/system/crm-rota.
//
// De onde vem cada coisa:
//   • quem foi visitado: tabelas rota_visitas/rota_eventos, no banco do Lone OS (o app grava lá);
//   • os dados da loja (nome, dono, telefone, endereço): a própria página da rota, na lista ETAPAS.
// A lista não é copiada para cá de propósito: a rota é editada fora deste repositório (que é
// público) e uma cópia aqui ficaria velha na primeira loja nova. A página é lida como DADO — um
// leitor de literal JavaScript pequeno, sem eval: se alguém mexer na página, o pior que acontece é
// a leitura falhar e o cron tentar de novo.

import type { LojaRota } from "@/lib/crm/importar";

// ─── Leitor de literal JS (objeto, lista, texto, número, true/false/null) ───────────────────────

class Leitor {
  i = 0;
  constructor(readonly s: string) {}
  erro(msg: string): never { throw new Error(`${msg} (posição ${this.i})`); }
  espacos() {
    for (;;) {
      const c = this.s[this.i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") this.i++;
      else if (c === "/" && this.s[this.i + 1] === "/") { const f = this.s.indexOf("\n", this.i); this.i = f < 0 ? this.s.length : f + 1; }
      else if (c === "/" && this.s[this.i + 1] === "*") { const f = this.s.indexOf("*/", this.i + 2); if (f < 0) this.erro("comentário aberto"); this.i = f + 2; }
      else return;
    }
  }
  texto(): string {
    const aspa = this.s[this.i++];
    let out = "";
    while (this.i < this.s.length) {
      const c = this.s[this.i++];
      if (c === aspa) return out;
      if (c === "\n") this.erro("texto quebrado");
      if (c !== "\\") { out += c; continue; }
      const e = this.s[this.i++];
      if (e === "n") out += "\n";
      else if (e === "t") out += "\t";
      else if (e === "u") { out += String.fromCharCode(parseInt(this.s.slice(this.i, this.i + 4), 16)); this.i += 4; }
      else out += e;
    }
    return this.erro("texto sem fim");
  }
  chave(): string {
    const c = this.s[this.i];
    if (c === '"' || c === "'") return this.texto();
    const m = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i, this.i + 64));
    if (!m) this.erro("chave inválida");
    this.i += m[0].length;
    return m[0];
  }
  valor(prof = 0): unknown {
    if (prof > 20) this.erro("fundo demais");
    this.espacos();
    const c = this.s[this.i];
    if (c === "[") {
      this.i++;
      const lista: unknown[] = [];
      for (;;) {
        this.espacos();
        if (this.s[this.i] === "]") { this.i++; return lista; }
        lista.push(this.valor(prof + 1));
        this.espacos();
        if (this.s[this.i] === ",") this.i++;
        else if (this.s[this.i] !== "]") this.erro("esperava , ou ]");
      }
    }
    if (c === "{") {
      this.i++;
      const obj: Record<string, unknown> = {};
      for (;;) {
        this.espacos();
        if (this.s[this.i] === "}") { this.i++; return obj; }
        const k = this.chave();
        this.espacos();
        if (this.s[this.i] !== ":") this.erro("esperava :");
        this.i++;
        obj[k] = this.valor(prof + 1);
        this.espacos();
        if (this.s[this.i] === ",") this.i++;
        else if (this.s[this.i] !== "}") this.erro("esperava , ou }");
      }
    }
    if (c === '"' || c === "'") return this.texto();
    const m = /^(-?\d+(?:\.\d+)?|true|false|null)/.exec(this.s.slice(this.i, this.i + 32));
    if (!m) this.erro("valor inválido");
    this.i += m[0].length;
    return m[0] === "true" ? true : m[0] === "false" ? false : m[0] === "null" ? null : Number(m[0]);
  }
}

/** Lê `const ETAPAS = [...]` de um HTML/JS. Lança erro se não achar ou não conseguir ler. */
export function lerEtapas(html: string): unknown[] {
  const m = /\b(?:const|let|var)\s+ETAPAS\s*=\s*\[/.exec(html);
  if (!m) throw new Error("lista ETAPAS não encontrada na página da rota");
  const L = new Leitor(html);
  L.i = m.index + m[0].length - 1;
  const v = L.valor();
  if (!Array.isArray(v)) throw new Error("ETAPAS não é uma lista");
  return v;
}

// ─── Catálogo de lojas ──────────────────────────────────────────────────────────────────────────

export interface LojaCatalogo {
  id: number;
  empresa: string;
  contato: string | null;
  tratamento: string | null;
  segmento: string | null;
  cidade: string | null;
  endereco: string | null;
  telefone: string | null; // 55 + DDD + número
  instagram: string | null;
  obs: string | null;
}

const txt = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

/** "22999238956" / "2226454001" / "+55 22 …" → "5522999238956". Sem DDD ou curto demais → null. */
export function telefoneDaRota(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  return null;
}

export function catalogoDaPagina(html: string): LojaCatalogo[] {
  const out = new Map<number, LojaCatalogo>();
  for (const et of lerEtapas(html)) {
    const e = et as Record<string, unknown>;
    const cidade = txt(e.cidade, 80);
    for (const x of Array.isArray(e.empresas) ? e.empresas : []) {
      const o = x as Record<string, unknown>;
      const id = typeof o.i === "number" && Number.isInteger(o.i) ? o.i : null;
      const empresa = txt(o.nome, 120);
      if (id == null || id < 1 || id > 999 || !empresa || out.has(id)) continue;
      out.set(id, {
        id, empresa, cidade,
        contato: txt(o.dono, 120), tratamento: txt(o.saud, 120), segmento: txt(o.seg, 80),
        endereco: txt(o.end, 240), telefone: telefoneDaRota(o.tel),
        instagram: txt(o.ig, 60)?.replace(/^@/, "") ?? null, obs: txt(o.obs, 200),
      });
    }
  }
  return [...out.values()].sort((a, b) => a.id - b.id);
}

// ─── Visitas → lojas para o funil ───────────────────────────────────────────────────────────────

export interface VisitaRota { rota: string; loja: number; visitada: boolean; por: string | null; visitadaEm: string | null }

/** Rota de teste (`?rota=teste` no app) nunca entra no funil. */
export const ehRotaDeTeste = (rota: string) => /^teste/i.test(rota);

/**
 * Visitas marcadas + catálogo → uma LojaRota por loja (a PRIMEIRA visita é o dia zero da régua),
 * no formato que o planejador de importação já entende (lib/crm/importar.ts). Loja marcada que
 * sumiu da página não tem como virar lead decente: volta em `semCadastro` para o log.
 */
export function lojasVisitadas(catalogo: LojaCatalogo[], visitas: VisitaRota[]): { lojas: LojaRota[]; semCadastro: number[] } {
  const porId = new Map(catalogo.map((l) => [l.id, l]));
  const primeira = new Map<number, VisitaRota>();
  for (const v of visitas) {
    if (!v.visitada || ehRotaDeTeste(v.rota)) continue;
    const atual = primeira.get(v.loja);
    if (!atual || (v.visitadaEm ?? "9999") < (atual.visitadaEm ?? "9999")) primeira.set(v.loja, v);
  }
  const lojas: LojaRota[] = [];
  const semCadastro: number[] = [];
  for (const [id, v] of [...primeira.entries()].sort((a, b) => a[0] - b[0])) {
    const c = porId.get(id);
    if (!c) { semCadastro.push(id); continue; }
    lojas.push({
      rota_loja_id: id, empresa: c.empresa, contato_nome: c.contato, tratamento: c.tratamento, segmento: c.segmento,
      cidade: c.cidade, endereco: c.endereco, telefone: c.telefone, instagram: c.instagram, horario: c.obs,
      visitada: true, visitada_por: v.por, visitada_em: v.visitadaEm,
    });
  }
  return { lojas, semCadastro };
}

/** Dia (São Paulo) de um ISO — para não registrar a mesma visita duas vezes. */
export const diaDaVisita = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
