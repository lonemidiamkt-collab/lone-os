export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { planejarImportacao, mesmoTelefone, normalizarNome } from "@/lib/crm/importar";
import { diaDaVisita, ehRotaDeTeste, lojasVisitadas, type VisitaRota } from "@/lib/crm/rota";
import { buscarCatalogo } from "@/lib/crm/rota-catalogo";
import { gravarPlano } from "@/lib/crm/gravar-plano";
import { textoRotaGrupo } from "@/lib/crm/grupo-vendas";
import { mandarNoGrupoVendas } from "@/lib/crm/grupo-vendas-envio";
import { hojeSP } from "@/lib/crm/meta";
import { CHAVE_AVISO_ROTA, juntarAvisos, lerPendentes } from "@/lib/crm/rota-aviso-pendente";

// POST /api/system/crm-rota — as VISITAS da Rota de Prospecção entram sozinhas no funil.
// Lê quem foi visitado (rota_visitas, gravado pelo app rota-lagos.vercel.app) e os dados das lojas
// (a própria página da rota, ROTA_PAGINA_URL), e passa pelo MESMO planejador da importação
// (lib/crm/importar.ts): loja nova vira lead em "Contato feito" com a régua contando do dia da visita;
// loja que já está no funil ganha a visita no histórico (uma por dia); cliente fica de fora.
// Lojas novas vão numa mensagem só para o grupo de vendas, com o WhatsApp de cada uma.
// Cron: a cada 30 min, 8h–20h30 BRT (`*/30 11-23 * * *`). ?dry=1 mostra o plano sem gravar.
//
// 25/10/2026 (auditoria de erro recuperável): 14.4 — erro ao ler as visitas já registradas era ignorado e
// cada rodada regravava "Visita presencial" de todos os leads (histórico duplicado); agora a rodada para
// antes de gravar. 14.5 — o aviso ao grupo que falhava era esquecido (na rodada seguinte as lojas já não
// eram novas); agora fica guardado, sai na próxima, e `ok` só é true quando o aviso saiu.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const { data: marcadas, error: errVisitas } = await supabaseAdmin.from("rota_visitas")
    .select("rota, loja, visitada, por, visitada_em").eq("visitada", true).limit(2000);
  if (errVisitas) {
    console.error("[crm-rota] rota_visitas:", errVisitas.message);
    return NextResponse.json({ ok: false, error: errVisitas.message }, { status: 500 });
  }
  const visitas: VisitaRota[] = (marcadas ?? [])
    .map((v) => ({ rota: v.rota as string, loja: Number(v.loja), visitada: !!v.visitada, por: (v.por as string) ?? null, visitadaEm: (v.visitada_em as string) ?? null }))
    .filter((v) => !ehRotaDeTeste(v.rota));
  if (!visitas.length) return NextResponse.json({ ok: true, dry, visitas: 0 });

  let catalogo;
  try { catalogo = await buscarCatalogo({ fresco: true }); } catch (e) {
    console.error("[crm-rota] não li a lista de lojas da rota:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "não consegui ler a lista de lojas da rota" }, { status: 502 });
  }

  const { lojas, semCadastro } = lojasVisitadas(catalogo, visitas);
  const [existentes, clientesQ] = await Promise.all([
    db.fetchCrmLeads().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    supabaseAdmin.from("clients").select("name, phone, contact_phone, company_phone, whatsapp_team_phone").limit(3000),
  ]);
  // 24/10/2026 (auditoria 4.10): sem o funil ou sem os clientes, toda loja visitada pareceria nova — a rodada
  // criaria de novo quem já está no funil (ou quem já é cliente). Para aqui e a Central mostra a falha.
  if (existentes instanceof Error) return NextResponse.json({ ok: false, error: existentes.message }, { status: 503 });
  if (clientesQ.error) return NextResponse.json({ ok: false, error: `não consegui ler os clientes: ${clientesQ.error.message}` }, { status: 503 });
  const plano = planejarImportacao({
    dados: { lojas_rota: lojas },
    existentes: existentes.map((l) => ({ id: l.id, empresa: l.empresa, contatoNome: l.contatoNome, telefone: l.telefone, rotaLojaId: l.rotaLojaId, externoId: l.externoId })),
    clientes: (clientesQ.data ?? []).map((c) => ({ nome: c.name as string, telefones: [c.phone, c.contact_phone, c.company_phone, c.whatsapp_team_phone] as (string | null)[] })),
    hoje: hojeSP(),
  });
  const novas = plano.linhas.filter((l) => l.acao === "criar");

  // Revisita: loja que já está no funil ganha a visita no histórico (uma por dia) e o número da rota.
  const porLoja = new Map(lojas.map((l) => [l.rota_loja_id, l]));
  const jaNoFunil = plano.linhas.filter((l) => l.acao === "ignorar" && l.leadId && !/cliente/i.test(l.motivo));
  const idsExistentes = jaNoFunil.map((l) => l.leadId!);
  const { data: visitasRegistradas, error: errRegistradas } = idsExistentes.length
    ? await supabaseAdmin.from("crm_lead_activities").select("lead_id, created_at").eq("tipo", "visita").in("lead_id", idsExistentes)
    : { data: [] as { lead_id: string; created_at: string }[], error: null };
  // Sem saber quais visitas já estão no histórico, toda visita pareceria nova e seria gravada de novo.
  if (errRegistradas) {
    return NextResponse.json({ ok: false, error: `não consegui ler as visitas já registradas: ${errRegistradas.message}` }, { status: 503 });
  }
  const diasPorLead = new Map<string, Set<string>>();
  for (const a of visitasRegistradas ?? []) {
    const s = diasPorLead.get(a.lead_id as string) ?? new Set<string>();
    s.add(diaDaVisita(a.created_at as string));
    diasPorLead.set(a.lead_id as string, s);
  }
  const revisitas: { leadId: string; rotaLojaId: number; quando: string; por: string | null; semNumero: boolean }[] = [];
  for (const linha of jaNoFunil) {
    const id = Number(linha.chave.replace("rota:", ""));
    const lead = existentes.find((l) => l.id === linha.leadId);
    for (const v of visitas.filter((x) => x.loja === id && x.visitadaEm)) {
      const dia = diaDaVisita(v.visitadaEm!);
      if (diasPorLead.get(linha.leadId!)?.has(dia)) continue;
      // Cuidado com número de loja repetido em outra rota: só junta se a loja é a mesma (telefone ou nome).
      const loja = porLoja.get(id);
      if (lead && loja && lead.rotaLojaId !== id && !mesmoTelefone(lead.telefone, loja.telefone) && normalizarNome(lead.empresa) !== normalizarNome(loja.empresa)) continue;
      revisitas.push({ leadId: linha.leadId!, rotaLojaId: id, quando: v.visitadaEm!, por: v.por, semNumero: !!lead && lead.rotaLojaId == null });
      const dias = diasPorLead.get(linha.leadId!) ?? new Set<string>();
      dias.add(dia);
      diasPorLead.set(linha.leadId!, dias);
    }
  }

  if (dry) return NextResponse.json({ ok: true, dry, visitas: visitas.length, catalogo: catalogo.length, novas: novas.map((l) => l.titulo), revisitas: revisitas.length, semCadastro });

  const gravado = await gravarPlano(novas);
  const errosRevisita: string[] = [];
  for (const r of revisitas) {
    const { error: eAt } = await supabaseAdmin.from("crm_lead_activities").insert({ lead_id: r.leadId, tipo: "visita", texto: `Visita presencial (Rota Lagos)${r.por ? ` — ${r.por}` : ""}.`, autor: r.por, created_at: r.quando });
    if (eAt) { errosRevisita.push(`visita do lead ${r.leadId}: ${eAt.message}`); continue; }
    if (r.semNumero) await supabaseAdmin.from("crm_leads").update({ rota_loja_id: r.rotaLojaId }).eq("id", r.leadId);
  }

  // O aviso ao grupo de vendas: as lojas desta rodada + as que não chegaram na anterior.
  const { data: pend, error: errPend } = await supabaseAdmin.from("agency_settings").select("value").eq("key", CHAVE_AVISO_ROTA).maybeSingle();
  if (errPend) console.error("[crm-rota] não li o aviso pendente:", errPend.message);
  const lojasAviso = juntarAvisos(lerPendentes(pend?.value as string | null | undefined), gravado.criadas.map(({ linha }) => ({
    empresa: linha.titulo, contatoNome: (linha.campos.contatoNome as string) ?? null, telefone: (linha.campos.telefone as string) ?? null,
    cidade: (linha.campos.cidade as string) ?? null, segmento: (linha.campos.segmento as string) ?? null, por: (linha.campos.responsavel as string) ?? null,
  })));
  const texto = textoRotaGrupo(lojasAviso);
  let grupo: boolean | null = null; // null = não havia o que avisar
  let erroAviso: string | null = null;
  if (texto) {
    const env = await mandarNoGrupoVendas(texto, "crm-rota");
    grupo = env.ok;
    if (env.ok) {
      if (pend) await supabaseAdmin.from("agency_settings").delete().eq("key", CHAVE_AVISO_ROTA);
    } else {
      erroAviso = env.error ?? "aviso não saiu";
      const { error: eGuarda } = await supabaseAdmin.from("agency_settings").upsert({ key: CHAVE_AVISO_ROTA, value: JSON.stringify(lojasAviso) }, { onConflict: "key" });
      if (eGuarda) erroAviso += ` (e não consegui guardar para a próxima rodada: ${eGuarda.message})`;
    }
  }
  if (semCadastro.length) console.warn(`[crm-rota] lojas marcadas que sumiram da página: ${semCadastro.join(", ")}`);
  console.log(`[crm-rota] visitas=${visitas.length} criados=${gravado.criados} revisitas=${revisitas.length} erros=${gravado.erros.length + errosRevisita.length} grupo=${grupo}`);
  const erros = [...gravado.erros, ...errosRevisita];
  return NextResponse.json({
    ok: erros.length === 0 && grupo !== false,
    criados: gravado.criados, revisitas: revisitas.length - errosRevisita.length, erros, semCadastro, grupo,
    ...(erroAviso ? { error: `aviso ao grupo de vendas não saiu (${lojasAviso.length} loja(s) guardadas para a próxima rodada): ${erroAviso}` } : {}),
  });
}
