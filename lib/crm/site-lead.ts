// lib/crm/site-lead.ts — o cadastro do formulário do site (lonemidia.com) vira lead. Módulo PURO.
//
// O site (repo lone-midia-site, src/app/api/lead/route.ts) monta um pacote por cadastro e o manda,
// assinado com HMAC, para planilha, WhatsApp da equipe e agora para o Lone OS. Aqui fica só a parte
// que dá para testar sem banco: validar o pacote, a assinatura, de onde veio (anúncio ou site) e o
// lead que nasce dele. A rota (app/api/integracoes/site/lead) cuida do banco e do aviso.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Veredito } from "@/lib/crm/filtro-lead";

export interface PacoteSite {
  id: string;
  submittedAt?: string;
  lead: {
    nomeCompleto: string;
    whatsappE164?: string;
    whatsappDisplay?: string;
    emailCorporativo?: string;
    empresa?: string;
    segmento?: string;
    faturamento?: string;
    faturamentoRotulo?: string;
    maiorDesafio?: string;
  };
  consent?: { aceito?: boolean; versao?: string; timestamp?: string };
  atribuicao?: Record<string, string | undefined>;
}

/** Janela do carimbo de hora: assinatura velha não vale (replay). */
export const JANELA_ASSINATURA_MS = 5 * 60 * 1000;

/** HMAC-SHA256 de `${timestamp}.${corpo}` — o mesmo esquema que o site já usa com o n8n. */
export function assinar(segredo: string, timestamp: string, corpo: string): string {
  return "sha256=" + createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex");
}

export function conferirAssinatura(p: { segredo: string; timestamp: string | null; assinatura: string | null; corpo: string; agora: number }): { ok: true } | { ok: false; motivo: string } {
  if (!p.timestamp || !p.assinatura) return { ok: false, motivo: "sem assinatura" };
  const ts = Number(p.timestamp);
  if (!Number.isFinite(ts) || Math.abs(p.agora - ts) > JANELA_ASSINATURA_MS) return { ok: false, motivo: "carimbo de hora fora da janela" };
  const esperado = Buffer.from(assinar(p.segredo, p.timestamp, p.corpo));
  const recebido = Buffer.from(p.assinatura);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: "assinatura não confere" };
  return { ok: true };
}

export function validarPacote(x: unknown): { ok: true; pacote: PacoteSite } | { ok: false; erro: string } {
  const o = x as PacoteSite | null;
  if (!o || typeof o !== "object") return { ok: false, erro: "corpo inválido" };
  if (typeof o.id !== "string" || o.id.length < 8 || o.id.length > 128) return { ok: false, erro: "id ausente" };
  if (!o.lead || typeof o.lead !== "object" || typeof o.lead.nomeCompleto !== "string" || !o.lead.nomeCompleto.trim()) return { ok: false, erro: "lead sem nome" };
  return { ok: true, pacote: o };
}

const MIDIA_PAGA = /^(cpc|ppc|paid|paid[_-]?social|ads?|cpm|display|meta[_-]?ads|facebook[_-]?ads)$/i;
const FONTE_PAGA = /^(facebook|fb|instagram|ig|meta|google|gads|tiktok)$/i;

/** "Anúncio → site" quando há clique de anúncio (fbclid/gclid) ou utm de mídia paga; senão "Site". */
export function origemDoPacote(a: PacoteSite["atribuicao"]): "Anúncio → site" | "Site" {
  if (!a) return "Site";
  if (a.fbclid || a.gclid) return "Anúncio → site";
  const meio = (a.utm_medium ?? "").trim();
  if (meio && MIDIA_PAGA.test(meio)) return "Anúncio → site";
  if (FONTE_PAGA.test((a.utm_source ?? "").trim()) && !/organic|bio|perfil|social$/i.test(meio)) return "Anúncio → site";
  return "Site";
}

const limpo = (s: string | undefined | null, max = 500) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** O lead que nasce do cadastro (campos do CRM, camelCase — ver CRM_FIELD_MAP). */
export function leadDoPacote(p: PacoteSite, v: Extract<Veredito, { ok: true }>, agoraIso: string): Record<string, unknown> {
  const l = p.lead;
  const a = p.atribuicao ?? {};
  const campanha = [a.utm_source, a.utm_medium, a.utm_campaign].filter(Boolean).join(" / ");
  const obs = [
    l.maiorDesafio ? `Desafio: ${limpo(l.maiorDesafio)}` : null,
    l.faturamentoRotulo || l.faturamento ? `Faturamento informado: ${limpo(l.faturamentoRotulo || l.faturamento, 60)}` : null,
    campanha ? `Campanha: ${limpo(campanha, 200)}` : null,
    a.landingPath ? `Página: ${limpo(a.landingPath, 120)}` : null,
    !v.telefone && v.telefoneDigitado ? `Telefone digitado no formulário: ${v.telefoneDigitado} — está errado, conferir pelo e-mail ou Instagram.` : null,
  ].filter(Boolean).join("\n");
  return {
    contatoNome: limpo(l.nomeCompleto, 120),
    empresa: limpo(l.empresa, 120) || null,
    telefone: v.telefone,
    email: limpo(l.emailCorporativo, 160) || null,
    segmento: limpo(l.segmento, 80) || null,
    origem: origemDoPacote(p.atribuicao),
    estagio: "novo",
    observacoes: obs || null,
    externoId: p.id,
    etapaDesde: agoraIso,
    cadenciaInicio: agoraIso.slice(0, 10),
  };
}

/** Texto da atividade que registra o cadastro e o consentimento (base legal do contato). */
export function atividadeDoCadastro(p: PacoteSite, quando: string): string {
  const c = p.consent;
  const consent = c?.aceito ? ` · consentimento ${c.versao ?? "?"} em ${new Date(c.timestamp ?? quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : " · sem registro de consentimento";
  return `Formulário do site${consent}`;
}
