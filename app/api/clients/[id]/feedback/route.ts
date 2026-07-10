export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";

// Feedback do cliente (ex: "as vendas caíram esse mês") → IA classifica o SENTIMENTO → grava e
// alimenta o RISCO DE CHURN / nível de atenção do cliente automaticamente:
//   - negativo → mood negativo (o churn conta como sinal) + attention_level=high
//   - positivo → mood positivo + attention_level=low
// Não precisou mexer no motor de churn: ele já lê mood_entries + attention_level.

const NEG_MOOD = "disappointed"; // está no NEGATIVE_MOODS do compute-health
const POS_MOOD = "happy";

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["sentimento", "resumo"],
  properties: {
    sentimento: { type: "string", enum: ["positivo", "neutro", "negativo"] },
    resumo: { type: "string" }, // 1 frase do porquê
  },
};

// GET → últimos feedbacks (mood_entries) do cliente
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const { data } = await supabaseAdmin
    .from("mood_entries").select("id, mood, note, recorded_by, created_at")
    .eq("client_id", id).order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ feedbacks: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  const { texto } = (await req.json().catch(() => ({}))) as { texto?: string };
  if (!texto?.trim()) return NextResponse.json({ error: "texto obrigatório" }, { status: 400 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const r = await chatJson<{ sentimento: "positivo" | "neutro" | "negativo"; resumo: string }>({
    model: "gpt-4o-mini",
    system: "Você classifica o SENTIMENTO de um feedback de cliente de uma agência de marketing sobre os RESULTADOS (vendas, leads, movimento). Responda só o JSON. 'vendas caíram/parou/tá fraco' = negativo; 'vendas aumentaram/tá bombando/muito bom' = positivo; sem sinal claro = neutro.",
    user: texto.trim(),
    schema: SCHEMA, schemaName: "feedback_sentimento", maxTokens: 200,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha na classificação" }, { status: 500 });

  const sentimento = r.data.sentimento;
  const dateSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const mood = sentimento === "negativo" ? NEG_MOOD : sentimento === "positivo" ? POS_MOOD : "neutral";

  await supabaseAdmin.from("mood_entries").insert({
    client_id: id, mood, note: texto.trim(), recorded_by: user.email, date: dateSP,
  });

  // Nível de atenção segue o sentimento (o churn pondera attention_level). Neutro não mexe.
  if (sentimento === "negativo") {
    await supabaseAdmin.from("clients").update({ attention_level: "high" }).eq("id", id);
  } else if (sentimento === "positivo") {
    await supabaseAdmin.from("clients").update({ attention_level: "low" }).eq("id", id);
  }

  return NextResponse.json({ sentimento, resumo: r.data.resumo, mood });
}
