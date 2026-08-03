export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";
import { avaliarSaude, formatSaudeDigest, type SinaisSaude } from "@/lib/cs/saude";
import { clientesSemPostar, clientesSemInstagram, textoCobranca as cobrancaSemPostar, textoEscalada as escaladaSemPostar } from "@/lib/cs/sem-postar";

// POST /api/system/cs-saude — 3ª função: scan de saúde/risco de churn. Avalia sinais por cliente
// (reclamação 14d, status, retração, dias sem postagem) e posta o digest dos em risco no grupo.
// Cron sugerido: segunda 11h BRT (`0 14 * * 1`). ?dry=1 não posta.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const d14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Clientes ativos (em operação), sem o cliente-teste. Filtro de `active` obrigatório: cliente
  // arquivado/churnado mantém o status antigo e aparecia toda segunda como risco 🔴.
  const { data: clientsData } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, status, active")
    .in("status", ["good", "average", "at_risk"])
    .or("active.is.null,active.eq.true")
    .not("name", "ilike", "%(teste)%");
  const clientes = clientsData ?? [];

  // Sinais em batch.
  const [recl, retr, posts] = await Promise.all([
    supabaseAdmin.from("cs_demandas").select("client_id").eq("tipo", "reclamacao").gte("created_at", d14),
    supabaseAdmin.from("cs_demandas").select("client_id").eq("tipo", "retracao").gte("created_at", d14),
    supabaseAdmin.from("content_cards").select("client_id, status_changed_at").eq("status", "published").order("status_changed_at", { ascending: false }),
  ]);
  const reclamou = new Set((recl.data ?? []).map((r) => r.client_id as string));
  const retraiu = new Set((retr.data ?? []).map((r) => r.client_id as string));
  const ultimoPost = new Map<string, string>();
  for (const p of posts.data ?? []) {
    const cid = p.client_id as string;
    if (cid && !ultimoPost.has(cid) && p.status_changed_at) ultimoPost.set(cid, p.status_changed_at as string);
  }

  const avaliacoes = clientes.map((c) => {
    const last = ultimoPost.get(c.id as string);
    const diasSemPost = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : null;
    const sinais: SinaisSaude = {
      status: (c.status as string) || "good",
      reclamacaoRecente: reclamou.has(c.id as string),
      retracaoRecente: retraiu.has(c.id as string),
      diasSemPost,
    };
    return avaliarSaude((c.nome_fantasia as string) || (c.name as string) || "Cliente", sinais);
  });

  const now = spNow();
  const label = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const texto = formatSaudeDigest(avaliacoes, label);
  const emRisco = avaliacoes.filter((a) => a.risco !== "baixo").length;

  // CLIENTE SEM POSTAR — pelos posts REAIS do Instagram, não pelo status do quadro. O medidor
  // antigo dependia do time mover card pra "publicado" (ninguém move) e ignorava quem não tinha
  // NENHUM post — foi assim que o Bazar Ribeiro passou 35 dias invisível.
  const parados = await clientesSemPostar();
  // Cliente de social SEM Instagram vinculado: o sistema é cego pra ele. É problema de cadastro,
  // não de postagem — vai num aviso curto e à parte, pra não acusar o social de algo que não é
  // dele e queimar a credibilidade da cobrança de verdade.
  const semIg = await clientesSemInstagram();
  const txtParados = [
    cobrancaSemPostar(parados),
    semIg.length ? `👁️ _Sem Instagram vinculado (não consigo conferir postagem): ${semIg.slice(0, 6).join(", ")}${semIg.length > 6 ? ` e mais ${semIg.length - 6}` : ""}._` : "",
  ].filter(Boolean).join("\n\n");
  const txtEscalada = escaladaSemPostar(parados);

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let enviado = false;
  if (!dry && internalJid && (emRisco > 0 || txtParados)) {
    const corpo = [emRisco > 0 ? texto : "", txtParados].filter(Boolean).join("\n\n———\n\n");
    const r = await csSendGroupText(internalJid, corpo, undefined, { origem: "cs-saude", destino: "interno" });
    enviado = r.ok;
  }

  // O GRAVE VAI SEPARADO PRO DONO. Misturado no digest do time, "35 dias sem postar" tem o mesmo
  // peso de "responder ok/não" — e foi exatamente assim que passou despercebido.
  const jidDono = process.env.CS_OWNER_JID || null;
  let escalado = false;
  if (!dry && jidDono && txtEscalada) {
    const r = await csSendGroupText(jidDono, txtEscalada, undefined, { origem: "cs-saude-escalada", destino: "interno" });
    escalado = r.ok;
  }

  console.log(`[cs-saude] clientes=${clientes.length} emRisco=${emRisco} semPostar=${parados.length} escalado=${escalado} dry=${dry}`);
  return NextResponse.json({
    ok: true, dry, enviado, escalado, clientes: clientes.length, emRisco,
    semPostar: parados.length, semInstagram: semIg.length, texto, textoSemPostar: txtParados, textoEscalada: txtEscalada,
  });
}
