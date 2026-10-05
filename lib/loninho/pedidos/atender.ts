// lib/loninho/pedidos/atender.ts — executa o pedido do time e responde no MESMO grupo. Server-only.
//
// Responde na hora ("Roberto, boa tarde! Montando…") e monta o PDF em segundo plano — o processo do
// painel é persistente, como no calendário do inbound. Falha no PDF cai pro texto; falha nos dados
// vira uma frase honesta, nunca silêncio. Só roda em grupo interno (o inbound confere antes).

import { csSendGroupDocument, csSendGroupText } from "@/lib/cs/notify";
import type { Papel } from "@/lib/api/require-role";
import { saudacao } from "@/lib/avisos/fala";
import { relogioSP } from "@/lib/avisos/regras";
import { PEDIDOS_PDF, manualTexto } from "./catalogo";
import type { PedidoLido } from "./detectar";

interface Contexto { groupJid: string; autor: { nome: string; papel: string }; agora?: Date }
interface Pronto { arquivo: string; legenda: string; html: string; textoReserva: string }

const META = { origem: "pedido-loninho", destino: "interno" as const };

function quando(agora: Date): string {
  const r = relogioSP(agora);
  const dia = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" });
  return `${dia} · ${String(r.hora).padStart(2, "0")}h${String(r.minuto).padStart(2, "0")}`;
}

/** Monta sem enviar — usado também pelo ensaio em /api/system/pedido-loninho. */
export async function montar(p: PedidoLido, ctx: Contexto, agora: Date): Promise<Pronto | { texto: string }> {
  const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
  const { avisoPdfHtml } = await import("@/lib/reports/avisoPdf");
  const logo = await loadLoneLogo().catch(() => "");
  const primeiro = ctx.autor.nome.split(" ")[0];
  const dia = relogioSP(agora).dia;

  if (p.id === "atencao_hoje") {
    const { carregarAtencao } = await import("./atencao-dados");
    const { textoAtencao, vazio } = await import("./atencao");
    const gestao = ctx.autor.papel === "admin" || ctx.autor.papel === "manager";
    // Sócio não é dono de carteira: a atenção dele é a da agência inteira (05/10: o "minha atenção"
    // do Roberto voltava vazio).
    const equipe = (p.escopo === "equipe" && gestao) || ctx.autor.papel === "admin";
    const d = await carregarAtencao({ nome: ctx.autor.nome, papel: ctx.autor.papel as Papel }, equipe, agora);
    if (vazio(d) && !d.falhas.length) return { texto: `${primeiro}, nada pedindo ${equipe ? "atenção na equipe" : "a sua atenção"} agora. 🙌 Se aparecer, eu aviso.` };
    const texto = textoAtencao(d, { nome: ctx.autor.nome, equipe, quando: quando(agora) });
    return {
      arquivo: `Atencao de hoje - ${equipe ? "equipe" : primeiro} - ${dia}.pdf`,
      legenda: `📋 *Atenção de hoje — ${equipe ? "equipe" : primeiro}*\n${d.prioridades.length} pra resolver · ${d.clientes.length} cliente(s) pedindo atenção${d.trafego.length ? ` · ${d.trafego.length} no tráfego agora` : ""}`
        + (p.escopo === "equipe" && !gestao ? "\n_A visão da equipe é de sócio e gestão; mandei a sua._" : ""),
      html: avisoPdfHtml(`Atenção de hoje — ${equipe ? "equipe" : primeiro}`, texto, logo, quando(agora)),
      textoReserva: texto,
    };
  }

  if (p.id === "resultados_semana") {
    const { carregarDestaques } = await import("@/lib/traffic/destaques-dados");
    const { destaquesSemanaHtml, legendaDestaques } = await import("@/lib/reports/destaquesSemanaPdf");
    const o = await carregarDestaques(dia);
    if (!o) return { texto: `${primeiro}, não achei cliente de tráfego ativo pra comparar a semana.` };
    const foco = p.foco === "bons" ? "\nQuem foi bem está em *Melhoraram nas duas pontas*."
      : p.foco === "ruins" ? "\nQuem foi mal está em *Pioraram nas duas pontas* e *Pararam de gastar*." : "";
    const legenda = legendaDestaques(o) + foco;
    return { arquivo: `Resultados da semana ${o.atual.de} a ${o.atual.ate}.pdf`, legenda, html: destaquesSemanaHtml(o), textoReserva: legenda };
  }

  if (p.id === "diagnostico_trafego") {
    const { montarDiagnostico } = await import("@/lib/traffic/diagnostico");
    const { carregarVistos } = await import("@/lib/traffic/hoje/vistos");
    const { filtrarDiagnosticoVisto } = await import("@/lib/traffic/hoje/visto");
    const { diagnosticoPdfHtml, legendaDiagnostico } = await import("@/lib/reports/diagnosticoPdf");
    const { mapa } = await carregarVistos();
    const d = filtrarDiagnosticoVisto(await montarDiagnostico(agora), mapa, agora);
    const legenda = legendaDiagnostico(d);
    return { arquivo: `Diagnostico do trafego - ${dia}.pdf`, legenda, html: diagnosticoPdfHtml(d, logo), textoReserva: legenda };
  }

  // manual
  const texto = manualTexto();
  return {
    arquivo: "Manual do Loninho.pdf",
    legenda: "📘 *Manual do Loninho* — o que eu sei fazer e as frases que funcionam (por mensagem ou áudio).",
    html: avisoPdfHtml("Manual do Loninho", texto, logo, quando(agora)),
    textoReserva: texto,
  };
}

/** Responde na hora e manda o resultado em seguida. Nunca lança. */
export async function atenderPedido(p: PedidoLido, ctx: Contexto): Promise<void> {
  const agora = ctx.agora ?? new Date();
  const primeiro = ctx.autor.nome.split(" ")[0];
  const titulo = PEDIDOS_PDF.find((x) => x.id === p.id)?.titulo ?? "relatório";
  const ack = p.id === "manual"
    ? `${primeiro}, ${saudacao(agora)}! Te mando o manual em PDF já já.`
    : `${primeiro}, ${saudacao(agora)}! Montando o PDF de *${titulo.toLowerCase()}* — chega em instantes.`;
  await csSendGroupText(ctx.groupJid, ack, undefined, META).catch(() => null);

  void (async () => {
    try {
      const r = await montar(p, ctx, agora);
      if ("texto" in r) { await csSendGroupText(ctx.groupJid, r.texto, undefined, META); return; }
      const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
      const pdf = await htmlToPdf(r.html);
      if (pdf.ok && pdf.buffer) {
        const env = await csSendGroupDocument(ctx.groupJid, pdf.buffer.toString("base64"), r.arquivo, r.legenda);
        if (env.ok) return;
      }
      // PDF falhou: o conteúdo ainda chega, em texto.
      await csSendGroupText(ctx.groupJid, `${r.textoReserva}\n\n_(O PDF falhou agora; mandei em texto.)_`, undefined, META);
    } catch (e) {
      console.error("[loninho/pedido]", p.id, e instanceof Error ? e.message : e);
      await csSendGroupText(ctx.groupJid, `${primeiro}, não consegui montar o relatório agora (${e instanceof Error ? e.message.slice(0, 80) : "erro"}). Tenta de novo em alguns minutos?`, undefined, META).catch(() => null);
    }
  })();
}
