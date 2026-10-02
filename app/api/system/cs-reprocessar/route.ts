export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/system/cs-reprocessar?de=ISO&ate=ISO[&aplicar=1][&limite=120][&depois=ISO]
//
// REPROCESSAMENTO EM SILÊNCIO. De 25/09 7h30 a 30/09 11h49 a OpenAI ficou sem crédito e o Loninho
// não entendeu nenhuma mensagem dos grupos de cliente. Roberto (02/10): reprocessar "pra termos
// dados". Esta rota roda SÓ a classificação (lib/cs/classifier.ts, a mesma do inbound) e grava o que
// for pedido como DADO HISTÓRICO:
//   • status "historico" — nenhuma rotina cobra, conta como "sem resposta", nem entra na acurácia
//     do agente; com "expirada", o score do cliente e o PDF de desempenho do time contariam o
//     apagão do sistema como falha de gente;
//   • created_at = a hora da mensagem, não a de hoje;
//   • nada é enviado a grupo nenhum, nenhuma pendência é aberta, nenhuma regra é proposta.
// Só os grupos da allowlist do piloto (CS_PILOT_GROUP_JIDS): fora dela o Loninho não teria lido
// de qualquer jeito. Sem `aplicar=1` é ensaio: classifica e devolve, sem gravar.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { classifyBlock, type ClassifierContext } from "@/lib/cs/classifier";
import { spNow } from "@/lib/cs/vigilancia";

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MOTIVO = "Registrado depois: a IA estava sem crédito (25 a 30/09) e a mensagem não foi lida na hora. Não gerou aviso nem cobrança.";
const lista = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function dataHora(iso: string): string {
  const d = spNow(new Date(iso));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DIAS_SEMANA[d.getDay()]}, ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())} (horário de Brasília)`;
}

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  const de = q.get("de"), ate = q.get("ate");
  if (!de || !ate || Number.isNaN(Date.parse(de)) || Number.isNaN(Date.parse(ate))) {
    return NextResponse.json({ error: "de e ate (ISO) são obrigatórios" }, { status: 400 });
  }
  const aplicar = q.get("aplicar") === "1";
  const limite = Math.min(300, Math.max(1, Number(q.get("limite") ?? 120) || 120));
  const depois = q.get("depois"); // continuação: só mensagens depois deste instante

  const grupos = lista(process.env.CS_PILOT_GROUP_JIDS);
  if (!grupos.length) return NextResponse.json({ error: "CS_PILOT_GROUP_JIDS vazia" }, { status: 500 });

  const [{ data: clientes }, { data: equipe }, { data: msgs, error: eMsgs }, { data: jaTem }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, nicho, fixed_briefing, whatsapp_group_jid").in("whatsapp_group_jid", grupos),
    supabaseAdmin.from("team_members").select("name").or("is_active.is.null,is_active.eq.true"),
    supabaseAdmin.from("cs_message_corpus").select("group_jid, author_name, text, created_at")
      .in("group_jid", grupos).eq("is_team", false)
      .gt("created_at", depois && !Number.isNaN(Date.parse(depois)) ? depois : de).lte("created_at", ate)
      .order("created_at", { ascending: true }).limit(limite),
    supabaseAdmin.from("cs_demandas").select("group_jid, message_text").gte("created_at", de).lte("created_at", ate),
  ]);
  if (eMsgs) return NextResponse.json({ error: eMsgs.message }, { status: 500 });

  const nomeDe = (c: { nome_fantasia?: unknown; name?: unknown }) => ((c.nome_fantasia as string) || (c.name as string) || "Cliente");
  const porGrupo = new Map<string, NonNullable<typeof clientes>>();
  for (const c of clientes ?? []) porGrupo.set(c.whatsapp_group_jid as string, [...(porGrupo.get(c.whatsapp_group_jid as string) ?? []), c]);
  const nomesEquipe = (equipe ?? []).map((m) => String(m.name ?? "").trim()).filter(Boolean);
  // Reprocessar duas vezes não duplica: mensagem que já virou pedido (agora ou numa rodada anterior) passa.
  const vistas = new Set((jaTem ?? []).map((d) => `${d.group_jid}|${String(d.message_text ?? "").trim()}`));

  const registrados: { cliente: string; quando: string; tipo: string; resumo: string }[] = [];
  let lidas = 0, puladas = 0, falhas = 0;
  let ultima: string | null = null;
  for (const m of msgs ?? []) {
    ultima = m.created_at as string;
    const texto = String(m.text ?? "").trim();
    const doGrupo = porGrupo.get(m.group_jid as string) ?? [];
    if (texto.length < 4 || !doGrupo.length || vistas.has(`${m.group_jid}|${texto}`)) { puladas++; continue; }
    const c = doGrupo[0];
    const ctx: ClassifierContext = {
      clienteNome: nomeDe(c),
      clienteNicho: (c.nicho as string) || undefined,
      briefing: ((c.fixed_briefing as string) || "").slice(0, 1500) || undefined,
      nomesEquipeLone: nomesEquipe,
      clientesDoGrupo: doGrupo.map(nomeDe),
      dataHoraAtual: dataHora(m.created_at as string),
    };
    const r = await classifyBlock([{ author: (m.author_name as string) || "Cliente", text: texto }], ctx);
    lidas++;
    if (!r.ok || !r.data) { falhas++; continue; }
    for (const it of r.data.itens.filter((i) => i.is_demanda)) {
      const cli = (it.cliente && doGrupo.find((x) => nomeDe(x).toLowerCase() === it.cliente!.toLowerCase())) || c;
      registrados.push({ cliente: nomeDe(cli), quando: m.created_at as string, tipo: it.tipo, resumo: it.resumo });
      if (!aplicar) continue;
      const { error } = await supabaseAdmin.from("cs_demandas").insert({
        codigo: randomBytes(2).toString("hex"), group_jid: m.group_jid, client_id: cli.id, cliente_nome: nomeDe(cli),
        author: (m.author_name as string) || null, message_text: texto, tipo: it.tipo, urgencia: it.urgencia,
        confianca: it.confianca, resumo: it.resumo, status: "historico", motivo_descarte: MOTIVO,
        created_at: m.created_at,
      });
      if (error) { falhas++; console.error("[cs-reprocessar]", error.message); }
    }
    vistas.add(`${m.group_jid}|${texto}`);
  }

  const acabou = (msgs?.length ?? 0) < limite;
  console.log(`[cs-reprocessar] ${aplicar ? "gravou" : "ensaio"} lidas=${lidas} puladas=${puladas} pedidos=${registrados.length} falhas=${falhas} acabou=${acabou}`);
  return NextResponse.json({
    ok: true, aplicar, lidas, puladas, falhas, pedidos: registrados.length,
    proximo: acabou ? null : ultima, registrados,
  });
}
