// lib/avisos/trafego-server.ts — o aviso de tráfego que o painel FALA (v2; regras em ./regras.ts).
//
// Cada ocorrência vira UM evento em `avisos_trafego` (único por tipo + conta + dia) e uma notificação
// por pessoa que ouve, com `falar` dizendo se a voz toca. É do evento que sai a medição: quando foi
// detectado, se a voz tocou de fato (o painel confirma em /api/avisos/ouvido) e quando a conta voltou
// a gastar / o saldo foi recarregado.
//
// O WhatsApp do grupo de tráfego continua saindo igual — isto é a voz no computador de quem age.
// Desligar "Avisos falados" na Central de Automações deixa tudo calado (o aviso ainda entra no sino).
// Nunca lança: aviso falado é extra e não pode derrubar a rotina que o chama.

import { supabaseAdmin } from "@/lib/supabase/server";
import { podeRodarJob } from "@/lib/automacoes/painel";
import { buscarInsightHoje } from "@/lib/defense/insights-hoje";
import { gastouHoje } from "@/lib/defense/vigia-entrega";
import { carregarVistos } from "@/lib/traffic/hoje/vistos";
import { estaVisto } from "@/lib/traffic/hoje/visto";
import {
  FRASE_TETO, bracoDoTeste, decidirFala, dentroDoHorario, inicioDoDiaSP, quemOuve, relogioSP,
  saldoResolvido, saldoZerado, textoSaldoZerado, type SaldoLido, type TipoAviso,
} from "./regras";

export const JOB_AVISOS_FALADOS = "avisos-falados";

export interface NovoAviso {
  tipo: TipoAviso;
  clientId: string | null;
  metaAccountId: string;
  titulo: string;
  corpo: string;
  /** Quem cuida da conta (clients.assigned_traffic). Sem ele, busca no cadastro. */
  gestor?: string | null;
}

async function ligadoNaCentral(): Promise<boolean> {
  try { return (await podeRodarJob(JOB_AVISOS_FALADOS)).rodar !== false; } catch { return true; }
}

async function gestorDoCliente(clientId: string | null): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await supabaseAdmin.from("clients").select("assigned_traffic").eq("id", clientId).maybeSingle();
  return ((data as { assigned_traffic?: string | null } | null)?.assigned_traffic ?? "").trim() || null;
}

/** Gestor (se não desligou) + sócios que ligaram a voz. Falha ao ler o time: só o gestor. */
async function ouvintes(gestor: string | null): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("team_members")
    .select("name, role, ouvir_avisos").eq("is_active", true).is("deleted_at", null);
  if (error) {
    console.error("[avisos/trafego] time:", error.message);
    return gestor ? [gestor] : [];
  }
  const membros = (data ?? []) as { name: string; role: string; ouvir_avisos: boolean | null }[];
  return quemOuve({
    gestor,
    prefs: new Map(membros.map((m) => [m.name, m.ouvir_avisos])),
    admins: membros.filter((m) => m.role === "admin").map((m) => m.name),
  });
}

async function faladosHoje(pessoa: string, desde: string): Promise<number> {
  const { count } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true })
    .eq("target_user", pessoa).eq("type", "trafego").eq("falar", true).gte("created_at", desde);
  return count ?? 0;
}

/** Registra a ocorrência e avisa quem ouve. Segunda chamada no mesmo dia (mesma conta e tipo) não repete. */
export async function registrarAviso(a: NovoAviso, agora: Date = new Date()): Promise<{ novo: boolean; falou: string[] }> {
  try {
    const { dia } = relogioSP(agora);
    const braco = bracoDoTeste(a.metaAccountId, dia);
    const { data: ev, error } = await supabaseAdmin.from("avisos_trafego").insert({
      tipo: a.tipo, client_id: a.clientId, meta_account_id: a.metaAccountId, dia, titulo: a.titulo,
      braco, detectado_em: agora.toISOString(),
    }).select("id").maybeSingle();
    if (error) {
      if (error.code !== "23505") console.error("[avisos/trafego] evento:", error.message); // 23505 = já avisado hoje
      return { novo: false, falou: [] };
    }

    const para = await ouvintes(a.gestor?.trim() || await gestorDoCliente(a.clientId));
    const ligado = await ligadoNaCentral();
    const noHorario = dentroDoHorario(agora);
    const desde = inicioDoDiaSP(agora);
    const linhas: Record<string, unknown>[] = [];
    const falou: string[] = [];
    for (const p of para) {
      const d = decidirFala({ ligadoNaCentral: ligado, noHorario, braco, jaFaladosHoje: await faladosHoje(p, desde) });
      if (d === "avisar_teto") {
        linhas.push({ type: "trafego", title: "Limite de avisos falados de hoje", body: FRASE_TETO, target_user: p, read: false, falar: true });
      }
      linhas.push({
        type: "trafego", title: a.titulo, body: a.corpo, client_id: a.clientId, target_user: p, read: false,
        falar: d === "falar", aviso_id: ev?.id ?? null,
      });
      if (d === "falar") falou.push(p);
    }
    if (linhas.length) {
      const { error: eIns } = await supabaseAdmin.from("notifications").insert(linhas);
      if (eIns) console.error("[avisos/trafego] notificações:", eIns.message);
    }
    if (ev?.id) await supabaseAdmin.from("avisos_trafego").update({ destinatarios: para, falado_para: falou }).eq("id", ev.id);
    return { novo: true, falou };
  } catch (e) {
    console.error("[avisos/trafego]", e instanceof Error ? e.message : e);
    return { novo: false, falou: [] };
  }
}

// ── Saldo (chamado pelo sync-saldos, de 2 em 2h) ──────────────────────────────

export interface SnapshotSaldo extends SaldoLido {
  clientName: string;
  clientId?: string;
  metaAccountId: string;
}

/** Saldo zerado de verdade vira aviso falado — independente do WhatsApp já ter avisado "crítico" hoje. */
export async function avisarSaldosZerados(snaps: SnapshotSaldo[], agora: Date = new Date()): Promise<number> {
  const zerados = snaps.filter(saldoZerado);
  if (!zerados.length) return 0;
  let n = 0;
  try {
    const { mapa } = await carregarVistos();
    for (const s of zerados) {
      if (estaVisto(mapa, s.clientId, "saldo", "critical", agora)) continue; // alguém já está cuidando
      const t = textoSaldoZerado(s.clientName, s.available, s.daysRemaining);
      const r = await registrarAviso({ tipo: "saldo_zerado", clientId: s.clientId ?? null, metaAccountId: s.metaAccountId, ...t }, agora);
      if (r.novo) n++;
    }
  } catch (e) {
    console.error("[avisos/saldo]", e instanceof Error ? e.message : e);
  }
  return n;
}

/** Fecha os eventos de saldo cuja conta foi recarregada (a medição do "quanto tempo levou"). */
export async function fecharSaldosResolvidos(snaps: SnapshotSaldo[], agora: Date = new Date()): Promise<number> {
  try {
    const { data } = await supabaseAdmin.from("avisos_trafego").select("id, meta_account_id")
      .eq("tipo", "saldo_zerado").is("resolvido_em", null).gte("dia", diasAtras(agora, 3));
    const porConta = new Map(snaps.map((s) => [s.metaAccountId, s]));
    const ids = (data ?? []).filter((e) => {
      const s = porConta.get(e.meta_account_id as string);
      return s ? saldoResolvido(s) : false;
    }).map((e) => e.id as string);
    if (ids.length) await supabaseAdmin.from("avisos_trafego").update({ resolvido_em: agora.toISOString() }).in("id", ids);
    return ids.length;
  } catch (e) {
    console.error("[avisos/saldo] fechar:", e instanceof Error ? e.message : e);
    return 0;
  }
}

// ── Conta parada (chamado de 15 em 15 min pelo /api/system/avisos-falados) ────

/** Relê o gasto de hoje das contas paradas ainda abertas; a que voltou a gastar fecha o evento. */
export async function fecharContasQueVoltaram(token: string, agora: Date = new Date()): Promise<{ abertas: number; voltaram: number; falhas: number }> {
  const { data } = await supabaseAdmin.from("avisos_trafego").select("id, meta_account_id")
    .eq("tipo", "conta_parada").is("resolvido_em", null).gte("dia", diasAtras(agora, 3));
  const abertas = data ?? [];
  const hoje = relogioSP(agora).dia;
  let voltaram = 0, falhas = 0;
  for (const e of abertas) {
    try {
      const gasto = gastouHoje(await buscarInsightHoje(e.meta_account_id as string, token, hoje));
      if (gasto > 0) {
        await supabaseAdmin.from("avisos_trafego").update({ resolvido_em: agora.toISOString() }).eq("id", e.id as string);
        voltaram++;
      }
    } catch {
      falhas++; // leitura falhou: tenta de novo na próxima volta, nunca "resolve" por engano
    }
  }
  return { abertas: abertas.length, voltaram, falhas };
}

function diasAtras(agora: Date, n: number): string {
  return relogioSP(new Date(agora.getTime() - n * 86400000)).dia;
}
