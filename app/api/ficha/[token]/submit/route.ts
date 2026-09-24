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
import { checkAccessCode, ipTravado, pinTravado, registrarTentativaPin, mensagemTrava } from "@/lib/fichaViva/pin";
import { criarLimite, ipDe } from "@/lib/portal/limite";

const LIMITE = criarLimite(5, 60_000); // no máx. 5 envios/min por link (chave só depois de validada)

const VALID_IDS = new Set(DIAG_QUESTIONS.map((q) => q.id));

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = ipDe(req.headers);
  const esperaIp = ipTravado(ip);
  if (esperaIp) return NextResponse.json({ error: mensagemTrava(esperaIp) }, { status: 429 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }

  // Valida token
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, ficha_viva_enabled, ficha_viva_token_revoked_at, ficha_viva_raiox_token")
    .or(`ficha_viva_token.eq.${token},ficha_viva_raiox_token.eq.${token}`)
    .single();

  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }
  if (LIMITE.estourou(token)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente em 1 minuto." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));

  // PIN só no link do DONO (full). Link do vendedor (raiox) grava sem código.
  const scope: "full" | "raiox" = client.ficha_viva_raiox_token === token ? "raiox" : "full";
  const nome = (client.nome_fantasia as string) || (client.name as string);
  if (scope === "full") {
    const espera = pinTravado(token, ip);
    if (espera) return NextResponse.json({ error: mensagemTrava(espera) }, { status: 429 });
    const certo = checkAccessCode(nome, String(body?.code ?? ""));
    registrarTentativaPin(token, ip, certo);
    if (!certo) return NextResponse.json({ error: "Código de acesso incorreto." }, { status: 401 });
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
