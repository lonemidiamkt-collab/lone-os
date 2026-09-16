// lib/prospeccao/tick.ts — o relógio do agente dentro do horário de resposta (09–18).
//
// A cada 15 min: respostas que ficaram pendentes por chegarem fora do horário, lembretes de
// reunião (24h e 1h antes, ao prospect e à Lone), encerramentos automáticos (sem interesse →
// perdido) e o espelho no Google Sheets. Abordagem, follow-up e nutrição NÃO moram aqui — são
// proativos e ficam na janela 09–11 (lib/prospeccao/abordagem.ts).

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProspectRow, CampanhaRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { podeResponderAgora } from "./limites";
import { pilotoRodando } from "./piloto";
import { decidirEResponder, marcarPrecisaHumano } from "./conversa";
import { enviarAoProspect } from "./envio";
import { lembrete24h, lembrete1h } from "./mensagens";
import { definirProximaAcao, transicionar, registrarEvento } from "./maquina";
import { isoSP, porExtensoSP, somarDias } from "./tempo";
import { sincronizarPlanilha } from "./sheets-sync";

export interface ResumoTick {
  respostas_pendentes: { id: string; nome: string; respondeu: boolean; motivo?: string }[];
  lembretes: { id: string; nome: string; tipo: "24h" | "1h"; ok: boolean; erro?: string }[];
  encerrados: number;
  planilha?: { ok: boolean; error?: string; linhas?: number };
  pulado?: string;
}

async function avisarLone(texto: string): Promise<void> {
  const adm = process.env.CS_ADM_GROUP_JID;
  if (!adm) return;
  try {
    const { csSendGroupText } = await import("@/lib/cs/notify");
    await csSendGroupText(adm, texto, undefined, { origem: "prospeccao", destino: "interno" });
  } catch { /* aviso é secundário */ }
}

export async function rodarTick(cfg: ProspectConfig, campanha: CampanhaRow | null, o: { agora?: Date; dry?: boolean; comPlanilha?: boolean } = {}): Promise<ResumoTick> {
  const agora = o.agora ?? new Date();
  const out: ResumoTick = { respostas_pendentes: [], lembretes: [], encerrados: 0 };
  const rodando = pilotoRodando(campanha, agora) && cfg.ligado;

  // ── 1) Respostas pendentes (chegaram fora do horário) ──────────────────────
  const pode = podeResponderAgora({ cfg, campanha, agora });
  if (pode.ok) {
    const { data } = await supabaseAdmin.from("prospects").select("*")
      .eq("next_action_type", "RESPONDER_PENDENTE").lte("next_action_at", agora.toISOString())
      .order("next_action_at", { ascending: true }).limit(10);
    for (const p of (data ?? []) as ProspectRow[]) {
      const { data: ultima } = await supabaseAdmin.from("prospect_messages").select("texto, message_id")
        .eq("prospect_id", p.id).eq("direcao", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!ultima) { await definirProximaAcao(p.id, null, "resposta pendente sem mensagem"); continue; }
      const r = await decidirEResponder(p, ultima.texto as string, { jaGravada: true, messageId: ultima.message_id as string | null, dry: o.dry, agora, cfg });
      out.respostas_pendentes.push({ id: p.id, nome: p.nome, respondeu: r.respondeu, motivo: r.motivo });
      // Se continuou pendente (mesma janela fechada de novo), a própria conversa reagenda.
    }
  } else out.pulado = pode.motivo;

  // ── 2) Lembretes de reunião ────────────────────────────────────────────────
  {
    const { data } = await supabaseAdmin.from("prospects").select("*")
      .in("estagio", ["reuniao_agendada", "handoff"]).in("next_action_type", ["LEMBRETE_24H", "LEMBRETE_1H", "HANDOFF"])
      .lte("next_action_at", agora.toISOString()).not("reuniao_em", "is", null).limit(10);
    for (const p of (data ?? []) as ProspectRow[]) {
      const reuniao = new Date(p.reuniao_em!);
      if (p.next_action_type === "HANDOFF") {
        // Handoff pendente (a conversa não chegou a fazer): faz agora.
        const { fazerHandoff } = await import("./handoff");
        await fazerHandoff(p, cfg, o.dry);
        continue;
      }
      const tipo: "24h" | "1h" = p.next_action_type === "LEMBRETE_1H" ? "1h" : "24h";
      if (reuniao.getTime() < agora.getTime()) {
        await definirProximaAcao(p.id, { type: "REGISTRAR_RESULTADO", at: isoSP(agora), owner: "ROBERTO", reason: "Reunião já aconteceu: registrar o resultado" }, "reunião passou sem lembrete");
        continue;
      }
      if (!rodando) {
        await avisarLone(`SDR — lembrete ${tipo} da reunião com ${p.nome} (${porExtensoSP(p.reuniao_em!)}) NÃO foi enviado: agente desligado/piloto encerrado. Avise o prospect você mesmo.`);
        await definirProximaAcao(p.id, tipo === "24h" ? { type: "LEMBRETE_1H", at: isoSP(new Date(reuniao.getTime() - 3600_000)), owner: "SDR_AI", reason: "Lembrete 1h antes" } : { type: "REGISTRAR_RESULTADO", at: isoSP(new Date(reuniao.getTime() + 2 * 3600_000)), owner: "ROBERTO", reason: "Registrar o resultado" });
        continue;
      }
      const ctxRed = { p, cfg, agora, origem: `prospeccao:lembrete_${tipo}` };
      const texto = tipo === "24h" ? await lembrete24h(ctxRed, p.reuniao_em!) : await lembrete1h(ctxRed, p.reuniao_em!);
      const r = await enviarAoProspect(p, texto, { autor: "agente", delayMs: 2000, estagio_antes: p.estagio, dry: o.dry });
      // O "sim" do prospect ao lembrete de véspera é respondido pela Rafaela (passo "lembrete").
      if (r.ok && tipo === "24h" && !o.dry) await supabaseAdmin.from("prospects").update({ contexto_comercial: { ...(p.contexto_comercial ?? {}), passo: "lembrete", lembrete_em: agora.toISOString() } }).eq("id", p.id);
      out.lembretes.push({ id: p.id, nome: p.nome, tipo, ok: r.ok, erro: r.ok ? undefined : r.error });
      await registrarEvento(p.id, { tipo: `lembrete_${tipo}`, mensagem: texto, responsavel: "SDR_AI", motivo: r.ok ? "enviado" : `falhou: ${r.error}` });
      if (!o.dry) await avisarLone(`SDR — lembrete ${tipo}: ${p.reuniao_tipo === "visita" ? "visita" : "reunião"} com ${p.nome} ${porExtensoSP(p.reuniao_em!)}${p.meet_url ? ` · ${p.meet_url}` : ""}`);
      if (tipo === "24h") await definirProximaAcao(p.id, { type: "LEMBRETE_1H", at: isoSP(new Date(reuniao.getTime() - 3600_000)), owner: "SDR_AI", reason: "Lembrete 1h antes" });
      else await definirProximaAcao(p.id, { type: "REGISTRAR_RESULTADO", at: isoSP(new Date(reuniao.getTime() + 2 * 3600_000)), owner: "ROBERTO", reason: "Reunião aconteceu? Registrar o resultado" });
    }
  }

  // ── 3) Encerramentos automáticos ───────────────────────────────────────────
  {
    const { data } = await supabaseAdmin.from("prospects").select("*").eq("estagio", "sem_interesse").eq("next_action_type", "ENCERRAR").limit(20);
    for (const p of (data ?? []) as ProspectRow[]) {
      if (o.dry) continue;
      await transicionar(p, { para: "perdido", motivo: "Sem interesse (encerrado)", patch: { motivo_perda: p.motivo_perda ?? "Sem interesse" } });
      out.encerrados++;
    }
    // Ação do agente vencida há mais de 1 dia = algo travou (cron parado, erro repetido). Avisa uma vez.
    const vencidaHa1d = somarDias(agora, -1).toISOString();
    const { data: atrasados } = await supabaseAdmin.from("prospects").select("*")
      .eq("owner", "SDR_AI").eq("modo_agente", "ativo").eq("precisa_humano", false)
      .not("next_action_type", "is", null).lt("next_action_at", vencidaHa1d)
      .not("estagio", "in", "(cliente,nao_perturbe,fora_icp,perdido,descoberto,enriquecido,icp_aprovado)").limit(10);
    for (const p of (atrasados ?? []) as ProspectRow[]) {
      await marcarPrecisaHumano(p, `ação do agente atrasada há mais de 1 dia (${p.next_action_type} em ${porExtensoSP(p.next_action_at!)}) — cron parado ou erro repetido`, o.dry);
    }
    // Reunião que passou há mais de 2 dias sem resultado: cobra o Roberto uma vez.
    const limite = somarDias(agora, -2).toISOString();
    const { data: semResultado } = await supabaseAdmin.from("prospects").select("*")
      .in("estagio", ["reuniao_agendada", "handoff"]).lt("reuniao_em", limite).eq("precisa_humano", false).limit(10);
    for (const p of (semResultado ?? []) as ProspectRow[]) {
      await marcarPrecisaHumano(p, `a ${p.reuniao_tipo === "visita" ? "visita" : "reunião"} de ${porExtensoSP(p.reuniao_em!)} está sem resultado registrado`, o.dry);
    }
  }

  // ── 4) Espelho no Google Sheets ────────────────────────────────────────────
  if (o.comPlanilha !== false && !o.dry) {
    out.planilha = await sincronizarPlanilha().catch((err) => ({ ok: false, error: err instanceof Error ? err.message : "falhou" }));
  }
  return out;
}
