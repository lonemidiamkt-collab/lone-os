export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { completude, type LinhaCliente } from "@/lib/clients/completude";

// GET /api/clients/cadastro-incompleto
//
// Quem está com a ficha pela metade, e o que falta em cada um. A resposta é a fila de trabalho:
// ordena pelo pior, e diz se já existe link aberto — para ninguém gerar um segundo link para
// quem já recebeu o primeiro.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: clientes, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, razao_social, cnpj, nicho, contact_name, phone, company_phone, contact_phone, email, instagram_user, endereco_rua, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, doc_logo, doc_contrato_social, assigned_social")
    .or("active.is.null,active.eq.true")
    .is("draft_status", null)
    .neq("status", "onboarding");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const elegiveis = (clientes ?? []).filter((c) => !/\(teste\)/i.test((c.name as string) || ""));

  // Links já abertos, para não gerar dois para a mesma pessoa.
  const { data: pendentes } = await supabaseAdmin
    .from("client_onboarding_submissions")
    .select("client_id, token, created_at")
    .eq("status", "pending")
    .in("client_id", elegiveis.map((c) => c.id as string));
  const linkAberto = new Map((pendentes ?? []).map((p) => [p.client_id as string, p]));

  const linhas = elegiveis.map((c) => {
    const comp = completude(c as unknown as LinhaCliente);
    const aberto = linkAberto.get(c.id as string);
    return {
      clientId: c.id as string,
      nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      responsavel: (c.assigned_social as string) || null,
      percentual: comp.percentual,
      completo: comp.completo,
      faltando: comp.faltando.map((f) => f.rotulo),
      faltandoEssencial: comp.faltandoEssencial.map((f) => f.rotulo),
      linkAberto: aberto ? { token: aberto.token as string, desde: aberto.created_at as string } : null,
    };
  });

  const incompletos = linhas.filter((l) => !l.completo).sort((a, b) => a.percentual - b.percentual);

  return NextResponse.json({
    ok: true,
    total: linhas.length,
    completos: linhas.length - incompletos.length,
    incompletos,
    // O campo que mais falta na base. É por onde começa qualquer conversa sobre cadastro.
    maisFaltante: (() => {
      const cont = new Map<string, number>();
      for (const l of incompletos) for (const f of l.faltandoEssencial) cont.set(f, (cont.get(f) ?? 0) + 1);
      return [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([campo, clientes]) => ({ campo, clientes }));
    })(),
  }, { headers: { "cache-control": "no-store" } });
}
