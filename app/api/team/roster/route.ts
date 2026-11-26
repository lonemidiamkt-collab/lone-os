// app/api/team/roster/route.ts — quem está na equipe, pra tela de login montar a lista.
//
// PÚBLICA POR NECESSIDADE: a tela de login precisa da lista ANTES de alguém entrar.
//
// SEM SESSÃO, SÓ O MÍNIMO (Fase 0, leva 0B, 25/11/2026). Até aqui saía, para qualquer um na internet,
// o e-mail de cada pessoa da equipe e o final do WhatsApp — e o id era o começo do e-mail. Agora, sem
// sessão: id da equipe, nome, iniciais e função (a tela de login só mostra isso). Com sessão válida
// (getServerUser): a lista completa, que o painel usa depois de entrar. A pessoa digita o e-mail no
// login uma vez por aparelho (lib/auth/email-do-aparelho.ts). Formato em lib/equipe/roster.ts.
//
// POR QUE EXISTE (10/08). O Pedro Henrique saiu e o Thiago assumiu. O banco foi atualizado, mas o
// nome estava chumbado em cinco arquivos — incluindo o mapa de login. Equipe em arquivo, em paralelo
// com a tabela, garante que uma hora as duas discordam.
//
// SÓ ATIVOS: quem foi desativado some da tela de login, que é o efeito esperado de desativar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { perfilCompleto, perfilPublico, type LinhaDaEquipe } from "@/lib/equipe/roster";

export async function GET(req: NextRequest) {
  // Sessão recusada ou erro ao conferir = sem sessão: devolve a forma pública, nunca a completa.
  const user = await getServerUser(req).catch(() => null);

  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select(user ? "id, name, email, role, initials, whatsapp_phone" : "id, name, role, initials")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("role")
    .order("name");

  if (error) {
    // Devolve vazio em vez de 500: o cliente cai na lista de reserva e a tela de login continua
    // funcionando. Ninguém fica de fora do sistema porque uma consulta falhou.
    console.error("[team/roster] falhou:", error.message);
    return NextResponse.json({ profiles: [], erro: true });
  }

  const linhas = (data ?? []) as unknown as LinhaDaEquipe[];
  return NextResponse.json(
    { profiles: linhas.map((m) => (user ? perfilCompleto(m) : perfilPublico(m))) },
    // A resposta muda com a sessão: nada de cache compartilhado servir a lista completa a quem não entrou.
    { headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } },
  );
}
