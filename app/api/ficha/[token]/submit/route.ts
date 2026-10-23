// app/api/ficha/[token]/submit/route.ts — envio PÚBLICO do diagnóstico da Ficha Viva.
// O cliente responde sem login; validamos o token server-side e gravamos via supabaseAdmin
// (service_role). A tabela client_diagnostics NÃO é acessível por anon — só passa por aqui.
// A análise da IA NÃO roda aqui (evita trigger público de custo): quem dispara é o time,
// pelo botão "Analisar com IA" na ficha do cliente.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decidirGravacao } from "@/lib/fichaViva/raiox";
import { checkAccessCode, ipTravado, pinTravado, registrarTentativaPin, mensagemTrava } from "@/lib/fichaViva/pin";
import { criarLimite, ipDe } from "@/lib/portal/limite";

const LIMITE = criarLimite(5, 60_000); // no máx. 5 envios/min por link (chave só depois de validada)

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

  // 21/10/2026 (auditoria 1.3): "atualizar" criava uma linha nova a cada envio, e a mais recente (a
  // única que o time lê) ficava só com o que o cliente lembrou de redigitar. Agora a decisão mora em
  // lib/fichaViva/raiox.ts: resposta ainda não analisada é ATUALIZADA; o vendedor (sem ver a anterior)
  // COMPLETA em vez de apagar; já analisada vira versão nova.
  const { data: ultima, error: eUlt } = await supabaseAdmin
    .from("client_diagnostics")
    .select("id, respostas, status")
    .eq("client_id", client.id)
    .order("answered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Sem saber o que já existe, gravar às cegas é justamente o que duplicava.
  if (eUlt) return NextResponse.json({ error: "Não consegui salvar agora. Suas respostas continuam aí — tente de novo em instantes." }, { status: 503 });

  const plano = decidirGravacao(
    ultima ? { id: ultima.id as string, respostas: ultima.respostas as Record<string, string> | null, status: ultima.status as string | null } : null,
    body?.respostas,
    scope,
  );
  if (plano.acao === "vazio") {
    return NextResponse.json({ error: "Responda pelo menos uma pergunta." }, { status: 422 });
  }
  const agora = new Date().toISOString();
  if (plano.acao === "igual") return NextResponse.json({ success: true, acao: "igual", respondidoEm: agora });

  const { error } = plano.acao === "atualizar"
    ? await supabaseAdmin.from("client_diagnostics").update({ respostas: plano.respostas, answered_at: agora }).eq("id", plano.id)
    : await supabaseAdmin.from("client_diagnostics").insert({ client_id: client.id, respostas: plano.respostas, status: "respondido", answered_at: agora });

  if (error) return NextResponse.json({ error: "Não foi possível salvar. Suas respostas continuam aí — tente de novo." }, { status: 500 });

  // Notifica o time comercial (não bloqueia o envio do cliente se falhar)
  try {
    const { data: members } = await supabaseAdmin.from("team_members").select("id, role").eq("is_active", true);
    const ROLES = new Set(["admin", "manager", "comercial"]);
    const recipients = (members ?? []).filter((m) => ROLES.has((m.role as string)?.toLowerCase()));
    const atualizou = !!ultima;
    if (recipients.length) {
      await supabaseAdmin.from("notifications").insert(recipients.map((r) => ({
        type: "system",
        title: atualizou ? "Diagnóstico comercial atualizado" : "Diagnóstico comercial respondido",
        body: atualizou
          ? `${nome} atualizou o Raio-X comercial. Abra a Ficha Viva 360 do cliente pra revisar.`
          : `${nome} respondeu o Raio-X comercial. Abra a Ficha Viva 360 do cliente pra revisar a estrutura gerada.`,
        user_id: r.id,
      })));
    }
  } catch { /* segue sem quebrar o envio */ }

  return NextResponse.json({ success: true, acao: plano.acao, respondidoEm: agora });
}
