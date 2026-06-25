export const runtime = "nodejs"; // crypto nativo precisa Node

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { encryptVault, decryptVault } from "@/lib/crypto/vault";

// Campos sensíveis persistidos em `clients`. Qualquer outro campo que entre na allowlist
// abaixo fica fora do fluxo de RLS aberta e passa por este endpoint (admin-only).
const ALLOWED_CLIENT_FIELDS = new Set([
  "facebook_password",
  "instagram_password",
  "google_ads_password",
]);

const ALLOWED_SUBMISSION_FIELDS = new Set([
  "meta_password",
  "instagram_password",
  "google_password",
]);

type VaultTable = "clients" | "client_onboarding_submissions";

function validateField(table: VaultTable, field: string): boolean {
  if (table === "clients") return ALLOWED_CLIENT_FIELDS.has(field);
  if (table === "client_onboarding_submissions") return ALLOWED_SUBMISSION_FIELDS.has(field);
  return false;
}

async function logAccess(params: {
  user: { id: string; email: string };
  clientId?: string;
  field: string;
  action: "reveal" | "update";
  req: NextRequest;
}) {
  // Reaproveita a tabela vault_access_log criada em migration 018.
  // Fire-and-forget — log failure não bloqueia operação legítima.
  supabaseAdmin.from("vault_access_log").insert({
    user_id: params.user.id,
    user_email: params.user.email,
    client_id: params.clientId ?? null,
    resource_type: `credential:${params.field}`,
    resource_path: null,
    action: params.action,
    ip: params.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? params.req.headers.get("x-real-ip") ?? null,
    user_agent: params.req.headers.get("user-agent") ?? null,
  }).then(({ error }) => {
    if (error) console.warn("[client-vault] log insert failed:", error.message);
  });
}

// GET /api/client-vault?clientId=...&table=clients&field=facebook_password
// Retorna { value: string | null } (plaintext descriptografado).
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const table = (url.searchParams.get("table") ?? "clients") as VaultTable;
  const field = url.searchParams.get("field");

  if (!clientId || !field) {
    return NextResponse.json({ error: "clientId e field são obrigatórios" }, { status: 400 });
  }
  if (!validateField(table, field)) {
    return NextResponse.json({ error: `Campo '${field}' não autorizado pra ${table}` }, { status: 400 });
  }

  // Autorização: admin tem acesso total. O social ATRIBUÍDO pode revelar APENAS a
  // senha do Instagram (clients.instagram_password) dos clientes da própria carteira.
  if (!user.isAdmin) {
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("name, role")
      .eq("auth_id", user.id)
      .maybeSingle();
    const socialPodeVer = tm?.role === "social" && table === "clients" && field === "instagram_password";
    if (!socialPodeVer) {
      return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
    }
    const { data: c } = await supabaseAdmin
      .from("clients")
      .select("assigned_social")
      .eq("id", clientId)
      .maybeSingle();
    if (!c || (c as { assigned_social?: string | null }).assigned_social !== tm?.name) {
      return NextResponse.json({ error: "Cliente fora da sua carteira" }, { status: 403 });
    }
  }

  const idColumn = table === "clients" ? "id" : "client_id";
  const { data, error } = await supabaseAdmin.from(table).select(field).eq(idColumn, clientId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ value: null });

  const raw = (data as unknown as Record<string, unknown>)[field] as string | null | undefined;
  let plain: string | null;
  try {
    plain = decryptVault(raw);
  } catch (err) {
    console.error("[client-vault] decrypt failed:", err);
    return NextResponse.json({ error: "Falha ao descriptografar (ciphertext inválido)" }, { status: 500 });
  }

  await logAccess({ user, clientId, field, action: "reveal", req });
  return NextResponse.json({ value: plain });
}

// POST /api/client-vault { clientId, table, field, value }
// Criptografa o valor e persiste. `value=""` ou null apaga o campo.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { clientId, table = "clients", field, value } = body as {
    clientId?: string; table?: VaultTable; field?: string; value?: string | null;
  };

  if (!clientId || !field) {
    return NextResponse.json({ error: "clientId e field são obrigatórios" }, { status: 400 });
  }
  if (!validateField(table, field)) {
    return NextResponse.json({ error: `Campo '${field}' não autorizado pra ${table}` }, { status: 400 });
  }

  const encrypted = value ? encryptVault(value) : null;
  const idColumn = table === "clients" ? "id" : "client_id";
  const { error } = await supabaseAdmin.from(table).update({ [field]: encrypted }).eq(idColumn, clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Espelha a senha (plaintext) no Cofre do social (client_access) — mantém os dois lados
  // em sincronia: admin altera no cadastro → social vê a mesma senha.
  if (table === "clients" && (field === "instagram_password" || field === "facebook_password")) {
    const { error: mirrorErr } = await supabaseAdmin.from("client_access").upsert(
      { client_id: clientId, [field]: value || null, updated_by: user.email, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    if (mirrorErr) console.error("[client-vault] espelho p/ client_access falhou:", mirrorErr.message);
  }

  await logAccess({ user, clientId, field, action: "update", req });
  return NextResponse.json({ ok: true });
}
