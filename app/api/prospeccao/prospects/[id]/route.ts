export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { buscarProspect, mensagensDoProspect, eventosDoProspect, atualizarProspect, ehClienteAtual } from "@/lib/prospeccao/db";
import { transicionar, registrarEvento, podeIr, ESTAGIOS, proximaAcaoPadrao } from "@/lib/prospeccao/maquina";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { avaliarQualityGate } from "@/lib/prospeccao/quality-gate";
import { abordagemInicial } from "@/lib/prospeccao/mensagens";
import { registrarResultadoReuniao, marcarReuniao } from "@/lib/prospeccao/agenda";
import { calcularScore } from "@/lib/prospeccao/score";
import { cnpjLimpo, instagramHandle, siteNormalizado, telefoneDigitos } from "@/lib/prospeccao/normalizar";
import type { Estagio } from "@/lib/prospeccao/tipos";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/prospeccao/prospects/:id — a ficha: prospect + mensagens + eventos + prévia da abordagem + quality gate.
export async function GET(req: NextRequest, ctx: Ctx) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const p = await buscarProspect(id);
  if (!p) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  const [mensagens, eventos, cfg, campanha] = await Promise.all([mensagensDoProspect(id), eventosDoProspect(id), carregarConfig(), campanhaAtual()]);
  const cli = await ehClienteAtual({ nome: p.nome, instagram: p.instagram, telefone: p.telefone, cidade: p.cidade });
  const rascunho = await abordagemInicial({ p, cfg, historico: [], forcarModo: "fixo" });
  const qg = avaliarQualityGate(p, { cfg, campanha, momento: "envio", ehClienteAtual: cli.sim, motivoExclusao: cli.texto, mensagem: rascunho, abordagensHoje: 0 });
  return NextResponse.json({ ok: true, prospect: p, mensagens, eventos, rascunho, quality_gate: qg, transicoes: ESTAGIOS.filter((e) => e !== p.estagio && podeIr(p.estagio, e)) });
}

const EDITAVEIS = ["nome", "razao_social", "cnpj", "segmento", "cidade", "uf", "endereco", "site", "instagram", "telefone", "email", "decisor_nome", "decisor_cargo", "decisor_telefone", "decisor_instagram", "unidades", "gift_reserved", "gift_type", "gift_status"] as const;

// PATCH /api/prospeccao/prospects/:id — ações do Roberto na ficha.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const quem = gate.user.email;
  const { id } = await ctx.params;
  const p = await buscarProspect(id);
  if (!p) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.acao) return NextResponse.json({ error: "acao obrigatória" }, { status: 400 });
  const cfg = await carregarConfig();

  try {
    switch (body.acao) {
      case "editar": {
        const campos = (body.campos ?? {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        const fontes = { ...(p.fontes ?? {}) };
        for (const k of EDITAVEIS) {
          if (!(k in campos)) continue;
          let v = campos[k];
          if (k === "cnpj") v = v ? cnpjLimpo(String(v)) : null;
          if (k === "instagram") v = v ? instagramHandle(String(v)) : null;
          if (k === "site") v = v ? siteNormalizado(String(v)) : null;
          if (k === "telefone" || k === "decisor_telefone") v = v ? telefoneDigitos(String(v)) : null;
          if (k === "unidades") v = v === "" || v === null ? null : Number(v);
          if (k === "gift_reserved") v = !!v;
          if (v === "") v = null;
          patch[k] = v;
          if (v !== null && v !== undefined && !["gift_reserved", "gift_type", "gift_status"].includes(k)) fontes[k] = `manual (${quem})`;
        }
        if ("decisor_nome" in patch && patch.decisor_nome) { patch.decisor_confianca = 0.95; patch.decisor_fontes = ["manual"]; }
        if ("telefone" in patch) { patch.whatsapp_jid = patch.telefone ? `${patch.telefone}@s.whatsapp.net` : null; patch.whatsapp_verificado = null; }
        patch.fontes = fontes;
        const atualizado = await atualizarProspect(id, patch);
        const sc = calcularScore(atualizado, cfg);
        const final = await atualizarProspect(id, { score: sc.score, classe: sc.classe, score_detalhe: sc.detalhe, faturamento_sinal: sc.faturamento });
        await registrarEvento(id, { tipo: "editado", motivo: `campos: ${Object.keys(patch).filter((k) => k !== "fontes").join(", ")}`, responsavel: quem });
        return NextResponse.json({ ok: true, prospect: final });
      }
      case "pausar": {
        const r = await atualizarProspect(id, { modo_agente: "pausado", pausado_ate: null });
        await registrarEvento(id, { tipo: "pausado", motivo: "agente pausado neste prospect", responsavel: quem });
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "assumir": {
        const r = await atualizarProspect(id, { modo_agente: "pausado", pausado_ate: null, precisa_humano: false, motivo_humano: null });
        await registrarEvento(id, { tipo: "humano_assumiu", motivo: "assumido pela página", responsavel: quem });
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "retomar": {
        const r = await atualizarProspect(id, { modo_agente: p.owner === "ROBERTO" ? "observacao" : "ativo", pausado_ate: null, precisa_humano: false, motivo_humano: null });
        await registrarEvento(id, { tipo: "retomado", motivo: "agente retomado", responsavel: quem });
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "resolver_humano": {
        const r = await atualizarProspect(id, { precisa_humano: false, motivo_humano: null });
        await registrarEvento(id, { tipo: "humano_resolvido", motivo: String(body.nota ?? "resolvido"), responsavel: quem });
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "mover": {
        const para = String(body.para ?? "") as Estagio;
        if (!ESTAGIOS.includes(para)) return NextResponse.json({ error: "estágio inválido" }, { status: 400 });
        const motivo = String(body.motivo ?? "").trim();
        if (!motivo) return NextResponse.json({ error: "motivo obrigatório (§26: nunca mudar etapa sem registrar o porquê)" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (["perdido", "nao_perturbe", "fora_icp"].includes(para)) patch.motivo_perda = motivo;
        if (para === "cliente") patch.resultado_reuniao = p.resultado_reuniao ?? "fechou";
        const r = await transicionar(p, { para, motivo, responsavel: quem, patch });
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "aprovar_fila": {
        // Promove à mão: lead C (enriquecido) → icp_aprovado; icp_aprovado → fila do dia.
        let r = p;
        // Lead C promovido à mão: gera o diagnóstico (gancho) que o gate exige antes da abordagem.
        if (!r.diagnostico) {
          const { enriquecerProspect } = await import("@/lib/prospeccao/enriquecer");
          try { r = (await enriquecerProspect(r, cfg, { comWeb: false, comInstagram: false, comWhatsapp: false, comDiagnostico: true })).prospect; } catch { /* segue sem diagnóstico; o gate avisa */ }
        }
        if (r.estagio === "enriquecido" || r.estagio === "fora_icp") r = await transicionar(r, { para: "icp_aprovado", motivo: String(body.motivo ?? "aprovado à mão pelo Roberto"), responsavel: quem });
        if (r.estagio === "icp_aprovado") {
          const campanha = await campanhaAtual();
          const { ymdSP } = await import("@/lib/prospeccao/tempo");
          r = await transicionar(r, { para: "fila_prospeccao", motivo: "colocado na fila do dia à mão", responsavel: quem, patch: { ranking_dia: ymdSP(), ranking_pos: 0 }, ctx: { janelaAbordagem: campanha?.janela_abordagem } });
        }
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "resultado_reuniao": {
        const resultado = String(body.resultado ?? "") as "realizada" | "no_show" | "cancelada";
        if (!["realizada", "no_show", "cancelada"].includes(resultado)) return NextResponse.json({ error: "resultado inválido" }, { status: 400 });
        const r = await registrarResultadoReuniao(p, resultado, quem, body.nota ? String(body.nota) : undefined);
        return NextResponse.json({ ok: true, prospect: r });
      }
      case "marcar_reuniao": {
        const inicioIso = String(body.inicioIso ?? "");
        const tipo = body.tipo === "visita" ? "visita" : "online";
        if (!inicioIso || Number.isNaN(new Date(inicioIso).getTime())) return NextResponse.json({ error: "data inválida" }, { status: 400 });
        const r = await marcarReuniao(p, cfg, { inicioIso: new Date(inicioIso).toISOString(), tipo, por: quem, resumo: body.resumo ? String(body.resumo) : null });
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
        if (body.handoff !== false && r.prospect) {
          const { fazerHandoff } = await import("@/lib/prospeccao/handoff");
          const h = await fazerHandoff(r.prospect, cfg);
          return NextResponse.json({ ok: true, prospect: h.prospect, meet_url: r.meet_url, sem_link: r.sem_link, handoff_erros: h.erros });
        }
        return NextResponse.json({ ok: true, prospect: r.prospect, meet_url: r.meet_url, sem_link: r.sem_link });
      }
      case "proxima_acao": {
        const at = body.at ? new Date(String(body.at)) : null;
        const acao = body.type ? { type: String(body.type), at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null, owner: (body.owner === "ROBERTO" ? "ROBERTO" : "SDR_AI") as "ROBERTO" | "SDR_AI", reason: String(body.reason ?? "definida à mão") } : proximaAcaoPadrao(p.estagio, { followups: p.followups });
        const { definirProximaAcao } = await import("@/lib/prospeccao/maquina");
        await definirProximaAcao(id, acao, `próxima ação definida por ${quem}`);
        return NextResponse.json({ ok: true, prospect: await buscarProspect(id) });
      }
      default:
        return NextResponse.json({ error: `ação desconhecida: ${String(body.acao)}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erro" }, { status: 400 });
  }
}
