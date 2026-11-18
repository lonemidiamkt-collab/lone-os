// lib/crm-externo/eventos.ts — O CONTRATO DA API ABERTA DE CRM. Módulo PURO (validação), usado pela rota
// POST /api/crm-externo/eventos e documentado em docs/CRM_INTEGRACOES.md.
//
// Qualquer CRM (ou um n8n/Make no meio) manda o que aconteceu, um evento por linha:
//   lead       — chegou um contato novo                         (negocio opcional, mas o ciclo precisa dele)
//   resposta   — o lead recebeu a primeira resposta              (segundos obrigatório)
//   orcamento  — um orçamento foi enviado/criado                 (valor opcional)
//   venda      — fechou                                          (valor opcional)
//   perda      — perdeu
//   etapa      — o negócio mudou de etapa do funil               (negocio e etapa obrigatórios)
// `id` é o id do evento no sistema de lá: reenviar o mesmo id ATUALIZA, não duplica.
//
// SEM DADO PESSOAL: `negocio` é o id do negócio no CRM de lá. Telefone, e-mail ou nome não são aceitos — a rota
// recusa o lote inteiro com a linha que veio errada, para quem integra corrigir na origem.

import { z } from "zod";
import { TIPOS_EVENTO } from "./metricas";

export const MAX_EVENTOS_POR_LOTE = 500;

/**
 * Parece telefone, e-mail ou WhatsApp? "@" (e-mail, jid do WhatsApp), telefone com DDI 55 (12–13 dígitos
 * seguidos), telefone escrito com separador ("(11) 99999-9999", "11 99999 9999") ou só dígitos com 8+.
 * Não pega id com carimbo de tempo ("evt-1731940000") — é o id comum de quem integra por n8n/Make.
 */
export function pareceDadoPessoal(s: string): boolean {
  const t = s.trim();
  if (t.includes("@")) return true;
  if (/(^|\D)55\d{10,11}(\D|$)/.test(t)) return true;
  if (/(^|\D)\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]\d{4}(\D|$)/.test(t)) return true;
  return (t.match(/\d/g)?.length ?? 0) >= 8 && /^[\d\s()+.\-/]+$/.test(t);
}

/** Id opaco: letras, números e _-:. — sem espaço (nome de pessoa não passa). */
const ID_OPACO = /^[A-Za-z0-9_\-:.]+$/;

const texto = (max: number) => z.string().trim().min(1).max(max);

const Evento = z.object({
  id: texto(200),
  tipo: z.enum(TIPOS_EVENTO),
  quando: z.iso.datetime({ offset: true }),
  negocio: texto(120).optional(),
  /** em reais (1250.5 = R$ 1.250,50) */
  valor: z.number().finite().nonnegative().max(1e10).optional(),
  segundos: z.number().int().nonnegative().max(90 * 86_400).optional(),
  etapa: texto(80).optional(),
}).strict();

const Corpo = z.object({ eventos: z.array(z.unknown()).min(1).max(MAX_EVENTOS_POR_LOTE) }).strict();

export interface LinhaEvento {
  id_externo: string;
  tipo: (typeof TIPOS_EVENTO)[number];
  ocorreu_em: string;
  negocio_ref: string | null;
  valor_centavos: number | null;
  segundos: number | null;
  etapa: string | null;
}

export type Validacao = { ok: true; linhas: LinhaEvento[] } | { ok: false; erros: string[] };

export function validarLote(corpo: unknown, agora = Date.now()): Validacao {
  const c = Corpo.safeParse(corpo);
  if (!c.success) return { ok: false, erros: [`O corpo precisa ser {"eventos": [...]} com 1 a ${MAX_EVENTOS_POR_LOTE} eventos.`] };
  const erros: string[] = [];
  const linhas: LinhaEvento[] = [];
  const vistos = new Set<string>();
  c.data.eventos.forEach((cru, i) => {
    const r = Evento.safeParse(cru);
    if (!r.success) {
      const q = r.error.issues[0];
      erros.push(`eventos[${i}]: ${q.path.join(".") || "evento"} — ${q.message}`);
      return;
    }
    const e = r.data;
    const quando = Date.parse(e.quando);
    if (quando > agora + 86_400_000) return void erros.push(`eventos[${i}]: quando está no futuro.`);
    if (quando < agora - 2 * 365 * 86_400_000) return void erros.push(`eventos[${i}]: quando tem mais de 2 anos.`);
    if (e.tipo === "resposta" && e.segundos == null) return void erros.push(`eventos[${i}]: resposta precisa de segundos.`);
    if (e.tipo === "etapa" && (!e.negocio || !e.etapa)) return void erros.push(`eventos[${i}]: etapa precisa de negocio e etapa.`);
    if (pareceDadoPessoal(e.id)) return void erros.push(`eventos[${i}]: id parece telefone ou e-mail — use o id do evento no seu CRM.`);
    if (e.negocio && (pareceDadoPessoal(e.negocio) || !ID_OPACO.test(e.negocio))) return void erros.push(`eventos[${i}]: negocio deve ser o id do negócio no seu CRM (letras, números, _ - : .), não telefone, e-mail ou nome.`);
    if (e.etapa && pareceDadoPessoal(e.etapa)) return void erros.push(`eventos[${i}]: etapa deve ser o nome da etapa do funil.`);
    if (vistos.has(e.id)) return void erros.push(`eventos[${i}]: id repetido no mesmo lote.`);
    vistos.add(e.id);
    linhas.push({
      id_externo: e.id, tipo: e.tipo, ocorreu_em: new Date(quando).toISOString(), negocio_ref: e.negocio ?? null,
      valor_centavos: e.valor == null ? null : Math.round(e.valor * 100), segundos: e.segundos ?? null, etapa: e.etapa ?? null,
    });
  });
  return erros.length ? { ok: false, erros: erros.slice(0, 20) } : { ok: true, linhas };
}
