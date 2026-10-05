// lib/loninho/pedidos/atencao-dados.ts — os dados do "quem precisa da minha atenção hoje". Server-only.
// Texto em ./atencao.ts. Cada fonte falha sozinha e vira um nome em `falhas`, nunca um zero calado.

import { supabaseAdmin } from "@/lib/supabase/server";
import { feed } from "@/lib/priority/repo";
import { carregarCarteira } from "@/lib/saude/carregar";
import type { Papel } from "@/lib/api/require-role";
import { inicioDoDiaSP, relogioSP } from "@/lib/avisos/regras";
import type { DadosAtencao, ClienteAtencao } from "./atencao";

const mesmo = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export async function carregarAtencao(quem: { nome: string; papel: Papel }, equipe: boolean, agora: Date = new Date()): Promise<DadosAtencao> {
  const falhas: string[] = [];
  const gestao = quem.papel === "admin" || quem.papel === "manager";
  const todos = equipe && gestao;

  // 1. Prioridades (o mesmo feed do /agente)
  let prioridades: DadosAtencao["prioridades"] = [];
  let maisPrioridades = 0;
  try {
    const recs = await feed({ papel: quem.papel, nome: quem.nome, admin: quem.papel === "admin", escopo: todos ? "todos" : "meu", limite: 12 });
    prioridades = recs.map((r) => ({
      cliente: String(r.cliente ?? "—"), titulo: String(r.titulo ?? ""), fato: (r.fato ?? [])[0] ?? null,
      faca: String(r.recomendacao ?? ""), exposicaoRs: r.exposicao_rs != null ? Number(r.exposicao_rs) : null,
    }));
    maisPrioridades = Math.max(0, (recs.total ?? recs.length) - recs.length);
  } catch { falhas.push("prioridades"); }

  // 2. Saúde da carteira: quem pede atenção, só os da pessoa (ou todos, pra gestão que pediu equipe)
  let clientes: ClienteAtencao[] = [];
  try {
    const s = await carregarCarteira({ nome: quem.nome, papel: quem.papel }, { agora });
    if (s.falhas.length) falhas.push(...s.falhas.map((f) => `saúde (${f})`));
    clientes = s.linhas
      .filter((l) => l.pedeAtencao && !l.pausado)
      .filter((l) => todos || [l.dono, l.social, l.trafego, l.designer].some((x) => mesmo(x, quem.nome)))
      .sort((a, b) => (a.severidade === "critical" ? 0 : 1) - (b.severidade === "critical" ? 0 : 1) || (a.score ?? 100) - (b.score ?? 100))
      .slice(0, 15)
      .map((l) => ({
        cliente: l.nome, critico: l.severidade === "critical", motivos: l.motivos,
        proximaAcao: l.proximaAcao?.texto ?? null, responsavel: l.proximaAcao?.responsavel ?? null, prazo: l.proximaAcao?.prazo ?? null,
      }));
  } catch { falhas.push("saúde da carteira"); }

  // 3. Tráfego agora: conta parada / saldo zerado de hoje sem solução (lib/avisos)
  let trafego: DadosAtencao["trafego"] = [];
  if (gestao || quem.papel === "traffic") {
    try {
      const { data, error } = await supabaseAdmin.from("avisos_trafego")
        .select("tipo, detectado_em, clients(name, nome_fantasia, assigned_traffic)")
        .gte("detectado_em", inicioDoDiaSP(agora)).is("resolvido_em", null).order("detectado_em");
      if (error) throw new Error(error.message);
      type Linha = { tipo: "conta_parada" | "saldo_zerado"; detectado_em: string; clients: { name: string | null; nome_fantasia: string | null; assigned_traffic: string | null } | null };
      trafego = ((data ?? []) as unknown as Linha[])
        .filter((e) => todos || gestao || mesmo(e.clients?.assigned_traffic, quem.nome))
        .map((e) => {
          const r = relogioSP(new Date(e.detectado_em));
          return { cliente: (e.clients?.nome_fantasia || e.clients?.name || "Cliente").trim(), tipo: e.tipo, desde: `${String(r.hora).padStart(2, "0")}h${String(r.minuto).padStart(2, "0")}` };
        });
    } catch { falhas.push("tráfego de hoje"); }
  }

  return { prioridades, clientes, trafego, maisPrioridades, falhas };
}
