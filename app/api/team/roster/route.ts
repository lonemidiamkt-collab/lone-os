// app/api/team/roster/route.ts — quem está na equipe, pra tela de login montar a lista.
//
// PÚBLICA POR NECESSIDADE: a tela de login precisa da lista ANTES de alguém entrar. Não é
// exposição nova — hoje essa mesma lista (nome, papel, e-mail) já vai chumbada no pacote que o
// navegador baixa. A diferença é que aqui ela está CERTA.
//
// POR QUE EXISTE (10/08). O Pedro Henrique saiu e o Thiago assumiu. O banco foi atualizado, mas o
// nome estava chumbado em cinco arquivos — incluindo o mapa de login. Se eu não tivesse caçado
// todos, o Thiago entraria e o sistema não saberia quem ele é: sem papel, sem carteira. Equipe em
// arquivo, em paralelo com a tabela, garante que uma hora as duas discordam.
//
// SÓ ATIVOS: quem foi desativado some da tela de login, que é o efeito esperado de desativar.
// Nada aqui é segredo — nenhum dado sensível, nenhuma senha, nenhuma informação de cliente.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Cor por papel — o banco guarda quem a pessoa é, a aparência é decisão da interface. */
const COR: Record<string, string> = {
  admin: "text-[#0d4af5]",
  manager: "text-[#0d4af5]",
  comercial: "text-[#0d4af5]",
  social: "text-[#3b6ff5]",
  designer: "text-[#3b6ff5]",
  traffic: "text-[#3b6ff5]",
};

/** id estável e legível a partir do e-mail (`thiago@lonemidia.com` → `thiago`). */
const idDoEmail = (email: string) => email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select("id, name, email, role, initials")
    .eq("is_active", true)
    .order("role")
    .order("name");

  if (error) {
    // Devolve vazio em vez de 500: o cliente cai na lista de reserva e a tela de login continua
    // funcionando. Ninguém fica de fora do sistema porque uma consulta falhou.
    console.error("[team/roster] falhou:", error.message);
    return NextResponse.json({ profiles: [], erro: true });
  }

  return NextResponse.json({
    profiles: (data ?? []).map((m) => ({
      id: idDoEmail(m.email as string),
      name: m.name as string,
      role: m.role as string,
      initials: (m.initials as string) || (m.name as string).slice(0, 2).toUpperCase(),
      color: COR[m.role as string] ?? "text-[#3b6ff5]",
      email: m.email as string,
      teamMemberId: m.id as string,
    })),
  });
}
