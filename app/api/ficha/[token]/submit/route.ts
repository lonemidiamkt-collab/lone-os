// app/api/ficha/[token]/submit/route.ts — envio PÚBLICO do diagnóstico da Ficha Viva.
// O cliente responde sem login; validamos o token server-side e gravamos via supabaseAdmin
// (service_role). A tabela client_diagnostics NÃO é acessível por anon — só passa por aqui.
// A análise da IA NÃO roda aqui (evita trigger público de custo): quem dispara é o time,
// pelo botão "Analisar com IA" na ficha do cliente.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";
import { checkAccessCode } from "@/lib/fichaViva/pin";

// Rate-limit simples em memória por token (mesmo padrão da rota de snapshot do portal)
const RATE_LIMIT = new Map<string, { count: number; reset: number }>();
function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(token);
  if (!entry || entry.reset < now) {
    RATE_LIMIT.set(token, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false; // no máx. 5 envios/min por token
  entry.count++;
  return true;
}

const VALID_IDS = new Set(DIAG_QUESTIONS.map((q) => q.id));

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!checkRateLimit(token)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente em 1 minuto." }, { status: 429 });
  }

  // Valida token
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, ficha_viva_enabled, ficha_viva_token_revoked_at")
    .eq("ficha_viva_token", token)
    .single();

  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  // Revalida o PIN (1ª palavra do nome) antes de gravar
  const nome = (client.nome_fantasia as string) || (client.name as string);
  if (!checkAccessCode(nome, String(body?.code ?? ""))) {
    return NextResponse.json({ error: "Código de acesso incorreto." }, { status: 401 });
  }

  // Sanitiza respostas: só ids conhecidos, string, com teto de tamanho
  const rawRespostas = (body?.respostas ?? {}) as Record<string, unknown>;
  const respostas: Record<string, string> = {};
  for (const [id, val] of Object.entries(rawRespostas)) {
    if (!VALID_IDS.has(id)) continue;
    if (typeof val !== "string") continue;
    const clean = val.trim().slice(0, 1500);
    if (clean) respostas[id] = clean;
  }

  if (Object.keys(respostas).length === 0) {
    return NextResponse.json({ error: "Responda pelo menos uma pergunta." }, { status: 422 });
  }

  const { error } = await supabaseAdmin.from("client_diagnostics").insert({
    client_id: client.id,
    respostas,
    status: "respondido",
  });

  if (error) return NextResponse.json({ error: "Não foi possível salvar. Tente de novo." }, { status: 500 });

  // Notifica o time comercial (não bloqueia o envio do cliente se falhar)
  try {
    const { data: members } = await supabaseAdmin.from("team_members").select("id, role").eq("is_active", true);
    const ROLES = new Set(["admin", "manager", "comercial"]);
    const recipients = (members ?? []).filter((m) => ROLES.has((m.role as string)?.toLowerCase()));
    if (recipients.length) {
      await supabaseAdmin.from("notifications").insert(recipients.map((r) => ({
        type: "system",
        title: "Diagnóstico comercial respondido",
        body: `${nome} respondeu o Raio-X comercial. Abra a Ficha Viva 360 do cliente pra revisar a estrutura gerada.`,
        user_id: r.id,
      })));
    }
  } catch { /* segue sem quebrar o envio */ }

  return NextResponse.json({ success: true });
}
