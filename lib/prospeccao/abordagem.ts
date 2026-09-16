// lib/prospeccao/abordagem.ts — o que o agente faz por conta própria na janela 09–11:
// a primeira mensagem da fila do dia, os follow-ups vencidos (cadência 2/5/12) e as retomadas de
// nutrição. Cada envio passa pelo quality gate (primeira mensagem) ou pelos freios de janela e
// teto, e respeita o intervalo entre mensagens.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProspectRow, CampanhaRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { abordagensHoje, podeAbordarAgora, respeitaIntervalo, ultimoEnvioDoAgente, tetoDisponivel } from "./limites";
import { avaliarQualityGate } from "./quality-gate";
import { abordagemInicial, followup as textoFollowup } from "./mensagens";
import { enviarAoProspect } from "./envio";
import { transicionar, CADENCIA_DIAS, registrarEvento } from "./maquina";
import { ehClienteAtual, atualizarProspect, mensagensDoProspect } from "./db";
import { retomarContato, marcarPrecisaHumano } from "./conversa";

export interface ResumoOutbound {
  abordagens: { id: string; nome: string; ok: boolean; erro?: string; texto?: string }[];
  followups: { id: string; nome: string; n: number; ok: boolean; erro?: string }[];
  retomadas: { id: string; nome: string; ok: boolean; erro?: string }[];
  pulados: string[];
  teto: { usado: number; limite: number };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function rodarOutbound(cfg: ProspectConfig, campanha: CampanhaRow | null, o: { agora?: Date; dry?: boolean; semJitter?: boolean; forcarJanela?: boolean } = {}): Promise<ResumoOutbound> {
  const agora = o.agora ?? new Date();
  const out: ResumoOutbound = { abordagens: [], followups: [], retomadas: [], pulados: [], teto: { usado: 0, limite: campanha?.limite_dia ?? 10 } };
  let hoje = await abordagensHoje();
  out.teto.usado = hoje;

  const dec = podeAbordarAgora({ cfg, campanha, abordagensHoje: hoje, agora, forcarJanela: o.forcarJanela });
  if (!dec.ok) { out.pulados.push(dec.motivo ?? "bloqueado"); }

  const ultimo = await ultimoEnvioDoAgente();
  if (!respeitaIntervalo(ultimo, cfg, agora) && !o.dry) {
    out.pulados.push(`intervalo mínimo desde o último envio (${cfg.intervalo_min_s}s)`);
    return out;
  }

  // ── 1) Primeira abordagem: a fila do dia, em ordem de ranking ──────────────
  if (dec.ok) {
    const { data } = await supabaseAdmin.from("prospects").select("*").eq("estagio", "fila_prospeccao")
      .order("ranking_pos", { ascending: true, nullsFirst: false }).limit(Math.max(1, cfg.envios_por_tick));
    for (const p of (data ?? []) as ProspectRow[]) {
      if (tetoDisponivel(campanha, hoje) <= 0) { out.pulados.push("teto do dia atingido"); break; }
      const texto = await abordagemInicial({ p, cfg, historico: [], agora, origem: "prospeccao:abordagem" });
      const cli = await ehClienteAtual({ nome: p.nome, instagram: p.instagram, telefone: p.telefone, cidade: p.cidade });
      const gate = avaliarQualityGate(p, { cfg, campanha, agora, momento: "envio", ehClienteAtual: cli.sim, motivoExclusao: cli.texto, mensagem: texto, abordagensHoje: hoje, forcarJanela: o.forcarJanela });
      await atualizarProspect(p.id, { quality_gate: gate });
      if (!gate.passed) {
        const itens = gate.itens.filter((i) => !i.ok).map((i) => `${i.chave}${i.detalhe ? `: ${i.detalhe}` : ""}`).join("; ");
        out.abordagens.push({ id: p.id, nome: p.nome, ok: false, erro: `quality gate: ${itens}` });
        await registrarEvento(p.id, { tipo: "quality_gate_reprovado", motivo: itens, responsavel: "SDR_AI" });
        // Sai da fila para não travar os outros; volta ao ICP aprovado e o ranking de amanhã reavalia.
        if (!o.dry) await transicionar(p, { para: "icp_aprovado", motivo: `Quality gate reprovou no envio: ${itens}`, patch: { ranking_dia: null, ranking_pos: null }, ctx: { agora } });
        continue;
      }
      if (!o.dry && !o.semJitter) await dormir(Math.round(Math.random() * 45_000)); // não sair sempre no segundo zero do cron
      const r = await enviarAoProspect(p, texto, { autor: "agente", eh_primeira_abordagem: true, delayMs: 4000 + Math.round(Math.random() * 4000), estagio_antes: p.estagio, estagio_depois: "abordado", dry: o.dry });
      if (r.ok) {
        hoje++;
        out.abordagens.push({ id: p.id, nome: p.nome, ok: true, texto });
        if (!o.dry) {
          await transicionar(p, {
            para: "abordado", motivo: "Primeira abordagem enviada", mensagem: texto,
            patch: { primeira_abordagem_em: agora.toISOString(), variante_abordagem: p.decisor_nome && (p.decisor_confianca ?? 0) >= 0.5 ? "com_decisor" : "generica", followups: 0 },
            ctx: { agora, followups: 0 },
          });
        }
      } else {
        out.abordagens.push({ id: p.id, nome: p.nome, ok: false, erro: r.error });
        await registrarEvento(p.id, { tipo: "envio_falhou", motivo: r.error ?? "falhou", responsavel: "SDR_AI" });
        await marcarPrecisaHumano(p, `WhatsApp falhou ao enviar a abordagem: ${r.error ?? "erro"}`, o.dry);
      }
      break; // um envio por tick; o intervalo entre mensagens é o intervalo entre ticks
    }
  }
  out.teto.usado = hoje;

  // ── 2) Follow-ups vencidos (não contam no teto) ────────────────────────────
  if (dec.ok || (cfg.ligado && campanha?.status === "running")) {
    const { data } = await supabaseAdmin.from("prospects").select("*")
      .in("estagio", ["abordado", "aguardando_resposta", "followup", "atendente", "decisor_contatado"])
      .like("next_action_type", "FOLLOWUP_%").lte("next_action_at", agora.toISOString())
      .eq("modo_agente", "ativo").eq("cadencia_cancelada", false).eq("owner", "SDR_AI")
      .order("next_action_at", { ascending: true }).limit(3);
    for (const p of (data ?? []) as ProspectRow[]) {
      const n = p.followups + 1;
      if (n > CADENCIA_DIAS.length) {
        if (!o.dry) await transicionar(p, { para: "nutricao_30d", motivo: "Cadência esgotada sem resposta", patch: { contexto_comercial: { ...(p.contexto_comercial ?? {}), proxima_abordagem: "retomar com um dado novo da empresa; não repetir a abordagem" } }, ctx: { agora } });
        out.followups.push({ id: p.id, nome: p.nome, n, ok: true });
        continue;
      }
      // Follow-up 1 para o decisor (já falou com ele) tem tom diferente do follow-up para a recepção.
      const historico = (await mensagensDoProspect(p.id)).map((m) => ({ autor: m.autor, texto: m.texto }));
      const texto = await textoFollowup({ p, cfg, historico, agora, origem: `prospeccao:followup_${n}` }, n, p.estagio === "decisor_contatado");
      const r = await enviarAoProspect(p, texto, { autor: "agente", delayMs: 3000 + Math.round(Math.random() * 3000), estagio_antes: p.estagio, estagio_depois: "followup", dry: o.dry });
      out.followups.push({ id: p.id, nome: p.nome, n, ok: r.ok, erro: r.ok ? undefined : r.error });
      if (!r.ok) await marcarPrecisaHumano(p, `WhatsApp falhou no follow-up ${n}: ${r.error ?? "erro"}`, o.dry);
      if (r.ok && !o.dry) {
        await transicionar(p, { para: "followup", motivo: `Follow-up ${n} enviado`, mensagem: texto, patch: { followups: n }, ctx: { agora, followups: n } });
      }
      if (!o.dry) await dormir(20_000 + Math.round(Math.random() * 20_000));
    }
  }

  // ── 3) Retomadas de nutrição / momento ruim vencidas ───────────────────────
  if (dec.ok || (cfg.ligado && campanha?.status === "running")) {
    const { data } = await supabaseAdmin.from("prospects").select("*")
      .in("estagio", ["momento_ruim", "nutricao_30d", "nutricao_90d"])
      .eq("next_action_type", "RETOMAR").lte("next_action_at", agora.toISOString())
      .eq("modo_agente", "ativo").eq("owner", "SDR_AI")
      .order("next_action_at", { ascending: true }).limit(2);
    for (const p of (data ?? []) as ProspectRow[]) {
      const r = await retomarContato(p, cfg, o.dry);
      out.retomadas.push({ id: p.id, nome: p.nome, ok: r.ok, erro: r.ok ? undefined : r.motivo });
      if (!r.ok && r.motivo !== "sem texto") await marcarPrecisaHumano(p, `falha ao retomar contato: ${r.motivo}`, o.dry);
      if (!o.dry) await dormir(20_000 + Math.round(Math.random() * 20_000));
    }
  }

  return out;
}
