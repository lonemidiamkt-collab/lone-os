export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { simular, resumir, type MensagemCorpus } from "@/lib/cs/simular-reuniao";

// GET /api/reunioes/simular?dias=90[&cliente=nome]
//
// O QUE O AGENTE TERIA DITO — sem dizer nada a ninguém.
//
// Roberto (08/09): "não tem como testar em ninguém agora." Sem cliente para testar, o teste é o
// passado: as mensagens reais já guardadas em `cs_message_corpus`.
//
// SÓ LÊ. Não escreve no banco, não chama a Evolution, não manda mensagem. A resposta é o que
// SAIRIA, para alguém ler antes de existir.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Só administrador" }, { status: 403 });

  const dias = Math.min(Number(req.nextUrl.searchParams.get("dias") ?? 90) || 90, 365);
  const filtroCliente = (req.nextUrl.searchParams.get("cliente") ?? "").trim().toLowerCase();
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();

  // Só mensagem de CLIENTE: o portão da reunião nunca olhou grupo interno, e incluí-lo aqui
  // inflaria o resultado com conversa da equipe que o agente jamais leria por esse caminho.
  const { data, error } = await supabaseAdmin
    .from("cs_message_corpus")
    .select("id, client_id, author_name, text, created_at, clients(name, nome_fantasia)")
    .eq("is_team", false)
    .not("client_id", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const msgs: MensagemCorpus[] = (data ?? []).map((m) => {
    const c = m.clients as unknown as { name?: string; nome_fantasia?: string } | null;
    return {
      id: m.id as string,
      clientId: m.client_id as string,
      cliente: c?.nome_fantasia || c?.name || "Cliente",
      autor: (m.author_name as string) || null,
      texto: (m.text as string) || "",
      quando: m.created_at as string,
    };
  }).filter((m) => !filtroCliente || m.cliente.toLowerCase().includes(filtroCliente));

  const passos = simular(msgs);
  const resumo = resumir(msgs, passos);

  return NextResponse.json({
    ok: true,
    aviso: "SIMULAÇÃO — nada foi enviado. Isto é o que o agente teria dito.",
    periodo: { dias, desde },
    resumo,
    // A mensagem inteira vai junto: julgar se a reação faz sentido exige ler o que o cliente
    // escreveu, não um resumo dela.
    passos: passos.slice(0, 300),
    truncado: passos.length > 300 ? passos.length - 300 : 0,
  }, { headers: { "cache-control": "no-store" } });
}
