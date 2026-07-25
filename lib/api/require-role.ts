// lib/api/require-role.ts — gate de PAPEL nas rotas de API.
//
// Por que existe: várias rotas só exigiam "estar logado", e devolviam dado sensível de cliente pra
// qualquer pessoa do time. Casos reais encontrados:
//   · /api/cs/jornada  → client_journey.notas contém a NOTA DE HANDOFF do comercial, com valor
//     negociado, telefone e e-mail do lead. Qualquer logado (designer, SDR) lia.
//   · /api/cs/dashboard → reclamações de clientes (cs_demandas.resumo) e regras aprendidas.
//   · /api/crm/leads    → o funil comercial inteiro, visível pro designer.
// Esconder o item no menu (Sidebar) NÃO é proteção: basta chamar a rota.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser, type ServerUser } from "@/lib/supabase/auth-server";

export type Papel = "admin" | "manager" | "traffic" | "social" | "designer" | "comercial";

export const GESTAO: Papel[] = ["admin", "manager"];

export interface Autorizado { user: ServerUser; papel: Papel | null }

/** Papel do usuário (team_members por e-mail). isAdmin do JWT tem precedência. */
export async function papelDoUsuario(user: ServerUser): Promise<Papel | null> {
  if (user.isAdmin) return "admin";
  const email = (user.email || "").toLowerCase();
  if (!email) return null;
  const { data } = await supabaseAdmin.from("team_members").select("role").eq("email", email).maybeSingle();
  return ((data?.role as Papel) || null);
}

/**
 * Exige login E um dos papéis. Devolve `NextResponse` (401/403) quando barra, ou o usuário+papel.
 * Uso: `const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate;`
 */
export async function requireRole(req: NextRequest, papeis: Papel[]): Promise<Autorizado | NextResponse> {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!papel || !papeis.includes(papel)) {
    return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });
  }
  return { user, papel };
}
