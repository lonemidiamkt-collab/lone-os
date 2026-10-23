export const runtime = "nodejs"; // crypto nativo precisa Node

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { encryptVault, decryptVault } from "@/lib/crypto/vault";
import { espelharNoCofre } from "@/lib/cofre/espelhar";
import { planejarTroca, valorParaGuardar, campoEspelhado, avisoDoEspelho, type ResultadoEspelho } from "@/lib/cofre/versoes";

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

// POST /api/client-vault
//   { clientId, table, field, value }                       → grava (value "" ou null apaga)
//   { acao: "restaurar", clientId, table, field, versaoId } → volta a senha guardada antes de uma troca
//
// 21/10/2026 (auditoria de erro recuperável, 3.5): a senha que estava lá vai para
// `cofre_senhas_anteriores` (cifrada, com quem trocou e quando) ANTES de gravar a nova — se não der
// para guardar, nada é trocado. O espelho para o cofre do social passa por `espelharNoCofre` (cifra e
// não esbarra na FK de `updated_by`), e quando falha a resposta DIZ — antes falhava calado.
// Nunca devolve nem loga senha: só campo, motivo e o id da versão guardada.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { clientId, table = "clients", field, value, acao, versaoId } = body as {
    clientId?: string; table?: VaultTable; field?: string; value?: string | null;
    acao?: "salvar" | "restaurar"; versaoId?: string;
  };

  if (!clientId || !field) {
    return NextResponse.json({ error: "clientId e field são obrigatórios" }, { status: 400 });
  }
  if (!validateField(table, field)) {
    return NextResponse.json({ error: `Campo '${field}' não autorizado pra ${table}` }, { status: 400 });
  }
  const idColumn = table === "clients" ? "id" : "client_id";

  // ── Qual senha vai ficar ─────────────────────────────────────────────────────
  let novoClaro: string | null = typeof value === "string" ? value : null;
  const restaurando = acao === "restaurar";
  if (restaurando) {
    if (!versaoId) return NextResponse.json({ error: "Qual versão restaurar? (versaoId)" }, { status: 400 });
    const { data: versao, error: eVer } = await supabaseAdmin.from("cofre_senhas_anteriores")
      .select("valor_cifrado").eq("id", versaoId).eq("client_id", clientId).eq("tabela", table).eq("campo", field)
      .maybeSingle();
    if (eVer) return NextResponse.json({ error: "Não consegui ler a senha anterior agora. Tente de novo." }, { status: 503 });
    if (!versao) return NextResponse.json({ error: "Essa versão da senha não existe mais." }, { status: 404 });
    try {
      novoClaro = decryptVault(versao.valor_cifrado as string);
    } catch {
      return NextResponse.json({ error: "Não consegui abrir a senha guardada (cifra inválida). Nada foi trocado." }, { status: 500 });
    }
  }

  // ── A senha que está lá agora (é ela que não pode se perder) ─────────────────
  const { data: atual, error: eAtual } = await supabaseAdmin.from(table).select(field).eq(idColumn, clientId).maybeSingle();
  if (eAtual) return NextResponse.json({ error: "Não consegui ler a senha atual. Nada foi trocado — tente de novo." }, { status: 503 });
  if (!atual) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const anteriorBruto = ((atual as unknown as Record<string, unknown>)[field] as string | null) ?? null;
  let anteriorClaro: string | null | undefined;
  try { anteriorClaro = decryptVault(anteriorBruto); } catch { anteriorClaro = undefined; }

  const plano = planejarTroca({ anteriorBruto, anteriorClaro, novoClaro, restaurando });
  const novoFinal = (novoClaro ?? "").trim() ? novoClaro : null;

  let cifrado: string | null;
  try {
    cifrado = novoFinal ? encryptVault(novoFinal) : null;
  } catch {
    return NextResponse.json({ error: "O cofre está sem a chave de cifra no servidor. Nada foi trocado — avise o Roberto." }, { status: 500 });
  }

  let historicoId: string | null = null;
  if (plano.mudou) {
    if (plano.guardarAnterior && anteriorBruto) {
      let guardar: string | null;
      try { guardar = valorParaGuardar(anteriorBruto, (c) => encryptVault(c)); } catch { guardar = null; }
      if (!guardar) {
        return NextResponse.json({ error: "Não consegui cifrar a senha anterior para guardar. Nada foi trocado." }, { status: 500 });
      }
      const { data: v, error: eHist } = await supabaseAdmin.from("cofre_senhas_anteriores").insert({
        client_id: clientId, tabela: table, campo: field, valor_cifrado: guardar, motivo: plano.motivo,
        trocado_por_id: user.id, trocado_por_email: user.email,
      }).select("id").single();
      if (eHist || !v) {
        console.error("[client-vault] não guardou a versão anterior:", field, eHist?.message);
        return NextResponse.json({ error: "Não consegui guardar a senha anterior antes de trocar. Nada foi trocado — tente de novo." }, { status: 500 });
      }
      historicoId = v.id as string;
    }

    const { error } = await supabaseAdmin.from(table).update({ [field]: cifrado }).eq(idColumn, clientId);
    if (error) {
      // A versão guardada repetiria a senha que continua valendo: tira para não confundir o "Desfazer".
      if (historicoId) await supabaseAdmin.from("cofre_senhas_anteriores").delete().eq("id", historicoId);
      return NextResponse.json({ error: `Não consegui salvar a senha: ${error.message}` }, { status: 500 });
    }
  }

  // ── Espelho no cofre do social (mesma função da ativação e da reconciliação) ──
  // Roda mesmo sem mudança: salvar de novo a mesma senha é o jeito de consertar um espelho que falhou.
  const espelhado = campoEspelhado(table, field);
  let espelho: ResultadoEspelho = { aplicavel: false, ok: true };
  if (espelhado) {
    const r = novoFinal
      ? await espelharNoCofre(clientId, { [espelhado]: novoFinal })
      : await espelharNoCofre(clientId, {}, { limpar: [espelhado] });
    espelho = { aplicavel: true, ok: r.ok, erro: r.erro };
    if (!r.ok) console.error("[client-vault] espelho p/ client_access falhou:", field, r.erro);
  }

  await logAccess({ user, clientId, field, action: "update", req });
  return NextResponse.json({
    ok: true,
    semMudanca: !plano.mudou,
    historicoId,
    espelho,
    aviso: avisoDoEspelho(field, espelho),
  });
}
