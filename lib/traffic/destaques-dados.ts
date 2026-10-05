// lib/traffic/destaques-dados.ts — os DADOS dos destaques do tráfego (quem melhorou/piorou na semana).
// Server-only. Saiu de dentro da rota /api/system/destaques-trafego (05/10/2026) pra o Loninho montar o
// mesmo relatório quando alguém pede ("Loninho, quem foi bem essa semana?") — uma consulta, dois usos.
// Regra pura em ./destaques-semana.ts; PDF em lib/reports/destaquesSemanaPdf.ts.

import { supabaseAdmin } from "@/lib/supabase/server";
import { temTrafego } from "@/lib/clients/servico";
import { estaPausado } from "@/lib/clients/pausa";
import { spNow } from "@/lib/cs/vigilancia";
import { destaquesDaSemana, semanasFechadas, type SemanaCliente } from "./destaques-semana";
import type { OpcoesDestaques } from "@/lib/reports/destaquesSemanaPdf";

/** null = nenhum cliente de tráfego ativo. Erro de banco sobe (quem chama decide o que dizer). */
export async function carregarDestaques(hoje: string): Promise<OpcoesDestaques | null> {
  const { atual, anterior } = semanasFechadas(hoje);

  const { data: clientes, error: eCli } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, service_type, active, churned_at, paused_at, paused_until")
    .or("active.is.null,active.eq.true").is("churned_at", null);
  if (eCli) throw new Error(eCli.message);
  const alvo = (clientes ?? []).filter((c) =>
    temTrafego({ service_type: c.service_type as string | null })
    && !estaPausado(c as { paused_at: string | null; paused_until: string | null })
    && !/🧪|\(teste\)/i.test(String(c.name ?? "")));
  const ids = alvo.map((c) => c.id as string);
  if (!ids.length) return null;

  // metric_snapshots já teve dezenas de capturas por dia: vale a ÚLTIMA de cada cliente×dia.
  const { data: met, error: eMet } = await supabaseAdmin.from("metric_snapshots")
    .select("client_id, metric_date, spend, conversions, captured_at")
    .in("client_id", ids).gte("metric_date", anterior.de).lte("metric_date", atual.ate)
    .order("captured_at", { ascending: false }).limit(20000);
  if (eMet) throw new Error(eMet.message);
  const visto = new Set<string>();
  const porCliente = new Map<string, SemanaCliente>();
  const nome = new Map(alvo.map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string) || "Cliente").trim()]));
  for (const id of ids) porCliente.set(id, { cliente: nome.get(id)!, gastoAtual: 0, conversasAtual: 0, gastoAnterior: 0, conversasAnterior: 0 });
  for (const m of met ?? []) {
    const chave = `${m.client_id}|${m.metric_date}`;
    if (visto.has(chave)) continue;
    visto.add(chave);
    const l = porCliente.get(m.client_id as string);
    if (!l) continue;
    const dia = String(m.metric_date);
    const s = Number(m.spend) || 0, c = Number(m.conversions) || 0;
    if (dia >= atual.de && dia <= atual.ate) { l.gastoAtual += s; l.conversasAtual += c; }
    else if (dia >= anterior.de && dia <= anterior.ate) { l.gastoAnterior += s; l.conversasAnterior += c; }
  }

  return { dados: destaquesDaSemana([...porCliente.values()]), atual, anterior, geradoEm: spNow().toLocaleDateString("pt-BR") };
}
