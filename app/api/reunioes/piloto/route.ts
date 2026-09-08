export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { lerAbordagem, descrever, CHAVE, type ModoAbordagem } from "@/lib/cs/piloto";

// GET  /api/reunioes/piloto — em que modo a abordagem está e quem pode entrar no piloto.
// POST /api/reunioes/piloto — muda o modo e a lista.  { modo, clientes: [id…] }
//
// Roberto (08/09): "Eu não colocaria nos 40 grupos de uma vez. Faria lançamento progressivo:
// 5 → 10 → 20 → todos."
//
// A lista vive em `agency_settings` para poder mudar sem deploy: no meio de uma janela de
// agendamento, esperar um build para tirar um cliente do piloto é tempo demais.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const abordagem = await lerAbordagem();
  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, assigned_social, whatsapp_group_jid, status, active")
    .or("active.is.null,active.eq.true").neq("status", "onboarding")
    .order("name");

  // Elegível para o ciclo é quem tem social responsável E grupo de WhatsApp: sem grupo o agente
  // não tem onde falar, e mostrar essa pessoa na lista do piloto seria oferecer algo que não
  // funciona.
  const elegiveis = (clientes ?? [])
    .filter((c) => !!c.assigned_social && !!c.whatsapp_group_jid)
    .filter((c) => !/\(teste\)/i.test((c.name as string) || ""))
    .map((c) => ({
      id: c.id as string,
      nome: (c.nome_fantasia as string) || (c.name as string),
      social: c.assigned_social as string,
      noPiloto: abordagem.clientes.includes(c.id as string),
    }));

  return NextResponse.json({
    ok: true,
    modo: abordagem.modo,
    situacao: descrever(abordagem),
    no_piloto: elegiveis.filter((c) => c.noPiloto).map((c) => c.nome),
    elegiveis,
    total_elegiveis: elegiveis.length,
    como_mudar: "POST aqui com { modo: 'piloto'|'todos'|'off', clientes: [ids] }",
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Liberar o agente para escrever em grupo de cliente é decisão de dono, não de operação.
  if (!user.isAdmin) return NextResponse.json({ error: "Só administrador muda a abordagem" }, { status: 403 });

  const b = (await req.json().catch(() => null)) as { modo?: string; clientes?: string[] } | null;
  const modo = b?.modo;
  if (modo !== "off" && modo !== "piloto" && modo !== "todos") {
    return NextResponse.json({ error: "modo tem que ser off, piloto ou todos" }, { status: 400 });
  }
  const clientes = Array.isArray(b?.clientes) ? b.clientes.filter((x) => typeof x === "string") : [];

  const valor = JSON.stringify({ modo: modo as ModoAbordagem, clientes });
  const { error } = await supabaseAdmin.from("agency_settings")
    .upsert({ key: CHAVE, value: valor, updated_by: user.email, updated_at: new Date().toISOString() },
      { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const abordagem = await lerAbordagem();
  console.log(`[reuniao/piloto] ${user.email} → ${descrever(abordagem)}`);
  return NextResponse.json({ ok: true, modo, situacao: descrever(abordagem), clientes: clientes.length });
}
