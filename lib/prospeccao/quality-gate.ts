// lib/prospeccao/quality-gate.ts — os 14 itens que precisam estar verdes antes de QUALQUER
// primeira mensagem (V2 §21). Puro: recebe o prospect e o contexto, devolve a lista com o
// motivo de cada item — a página mostra exatamente por que um lead não saiu.
//
// Dois momentos: no RANKING (08:35) a janela e o teto ainda não valem — o que importa é se o
// lead está pronto; no ENVIO tudo vale.

import type { ProspectRow, QualityGateResultado } from "./tipos";
import type { ProspectConfig } from "./config";
import type { CampanhaRow } from "./tipos";
import { telefoneDigitos, ehCelular } from "./normalizar";
import { segmentoAderente } from "./score";
import { podeAbordarAgora } from "./limites";
import { pilotoRodando } from "./piloto";

export interface ContextoGate {
  cfg: ProspectConfig;
  campanha: CampanhaRow | null;
  agora?: Date;
  momento: "ranking" | "envio";
  ehClienteAtual: boolean;
  /** Texto da abordagem já montado (no envio) — validado aqui. */
  mensagem?: string | null;
  abordagensHoje?: number;
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const PALAVRAS_PROIBIDAS = /\b(desconto|promo[cç][aã]o|R\$\s?\d|por apenas|garanti(a|mos)|ROI|retorno garantido|faturamento (estimado|de)|fatura)\b/i;

export function mensagemValida(texto: string | null | undefined): { ok: boolean; motivo?: string } {
  if (!texto || texto.trim().length < 40) return { ok: false, motivo: "mensagem vazia ou curta demais" };
  if (texto.length > 700) return { ok: false, motivo: "mensagem longa demais (>700 caracteres)" };
  if (/\{\w+\}/.test(texto)) return { ok: false, motivo: "placeholder não preenchido" };
  if (EMOJI.test(texto)) return { ok: false, motivo: "emoji na abordagem" };
  if (PALAVRAS_PROIBIDAS.test(texto)) return { ok: false, motivo: "cita preço/desconto/garantia/faturamento" };
  return { ok: true };
}

export function avaliarQualityGate(p: ProspectRow, ctx: ContextoGate): QualityGateResultado {
  const agora = ctx.agora ?? new Date();
  const itens: QualityGateResultado["itens"] = [];
  const item = (chave: string, ok: boolean, detalhe?: string) => itens.push({ chave, ok, detalhe });

  item("empresa_valida", !!p.nome && p.nome.trim().length >= 3, p.nome ? undefined : "sem nome");
  const seg = segmentoAderente(p, ctx.cfg.segmentos);
  item("segmento_valido", !!seg, seg ? seg.nome : `"${p.segmento ?? "—"}" não está no ICP`);

  const tel = telefoneDigitos(p.decisor_telefone) ?? telefoneDigitos(p.telefone);
  const telOk = !!tel && (p.whatsapp_verificado !== false);
  item("telefone_valido", telOk, !tel ? "sem telefone" : p.whatsapp_verificado === false ? "número sem WhatsApp" : ehCelular(tel) ? undefined : "telefone fixo (pode não ter WhatsApp)");
  item("nao_e_cliente", !ctx.ehClienteAtual, ctx.ehClienteAtual ? "já é cliente da Lone" : undefined);
  item("nao_opt_out", p.estagio !== "nao_perturbe", p.estagio === "nao_perturbe" ? "pediu para não ser contatado" : undefined);
  item("nao_abordado_antes", !p.primeira_abordagem_em, p.primeira_abordagem_em ? `já abordado em ${p.primeira_abordagem_em.slice(0, 10)}` : undefined);
  const ufOk = !!p.uf && ctx.cfg.uf_permitidas.map((u) => u.toUpperCase()).includes(p.uf.toUpperCase());
  item("dentro_da_regiao", ufOk, ufOk ? undefined : `UF ${p.uf ?? "não confirmada"}`);
  item("icp_aprovado", ["icp_aprovado", "fila_prospeccao"].includes(p.estagio), `estágio ${p.estagio}`);
  const enriquecido = !!p.dados_cnpj || !!p.presenca || !!p.diagnostico;
  item("pesquisa_concluida", enriquecido && !!p.diagnostico, !p.diagnostico ? "sem diagnóstico" : undefined);
  item("score_minimo", (p.score ?? 0) >= ctx.cfg.score.minimo, `${p.score ?? 0} (mínimo ${ctx.cfg.score.minimo})`);
  const temDecisor = !!p.decisor_nome && (p.decisor_confianca ?? 0) >= 0.5;
  item("decisor_ou_generica", true, temDecisor ? `decisor: ${p.decisor_nome}` : "abordagem genérica (proprietário/responsável)");

  if (ctx.momento === "envio") {
    const mv = mensagemValida(ctx.mensagem);
    item("mensagem_validada", mv.ok, mv.motivo);
    const dec = podeAbordarAgora({ cfg: ctx.cfg, campanha: ctx.campanha, abordagensHoje: ctx.abordagensHoje ?? 0, agora });
    item("janela_e_teto", dec.ok, dec.motivo);
  } else {
    item("mensagem_validada", true, "verificada no envio");
    item("janela_e_teto", true, "verificado no envio");
  }
  item("piloto_rodando", pilotoRodando(ctx.campanha, agora), pilotoRodando(ctx.campanha, agora) ? undefined : "piloto não está rodando");

  return { passed: itens.every((i) => i.ok), itens, verificado_em: agora.toISOString() };
}
