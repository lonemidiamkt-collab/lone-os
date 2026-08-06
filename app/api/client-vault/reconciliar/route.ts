// app/api/client-vault/reconciliar/route.ts — fecha o buraco entre os dois cofres.
//
// PRA QUE. O cofre vive em dois lugares: `clients.*_password` (criptografado, só admin) e
// `client_access.*_password` (texto puro, o que social e gestor abrem). Quem cadastra cliente
// novo preenchia só o primeiro — então a senha existia e não chegava em quem usa.
//
// A causa foi corrigida na origem (lib/cofre/espelhar.ts, chamado na ativação). Esta rota é pro
// que JÁ ficou pra trás — e pra rodar de novo no dia em que alguém criar um caminho novo e
// esquecer do espelho. Idempotente: rodar duas vezes não muda nada.
//
// ?dryRun=1 → diz quem está fora de sincronia, sem gravar. É o padrão de quem mexe com senha.
//
// NUNCA DEVOLVE SENHA no corpo da resposta — só nome do cliente e quais campos foram espelhados.
// Rota de manutenção que vaza credencial em log de deploy é pior que o problema que resolve.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { decryptVault } from "@/lib/crypto/vault";
import { espelharNoCofre } from "@/lib/cofre/espelhar";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const { data: clientes, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, instagram_login, instagram_password, facebook_login, facebook_password")
    .or("active.is.null,active.eq.true");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: cofre } = await supabaseAdmin
    .from("client_access")
    .select("client_id, instagram_password, facebook_password");
  const jaTem = new Map((cofre ?? []).map((c) => [c.client_id as string, c]));

  const corrigidos: { cliente: string; campos: string[] }[] = [];
  const falharam: { cliente: string; erro: string }[] = [];
  const semSenha: string[] = [];

  for (const c of clientes ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    const atual = jaTem.get(c.id as string);

    // Só mexe no que FALTA no cofre — nunca sobrescreve senha que o social já tem, porque ela
    // pode ter sido atualizada por lá e estar mais nova que a do cadastro.
    const faltando: Record<string, string | null> = {};
    const tentar = (campoOrigem: "instagram_password" | "facebook_password", login: "instagram_login" | "facebook_login") => {
      const cifrado = c[campoOrigem] as string | null;
      if (!cifrado) return;
      if (atual?.[campoOrigem]) return; // social já tem
      try {
        const claro = decryptVault(cifrado);
        if (claro) {
          faltando[campoOrigem] = claro;
          const l = c[login] as string | null;
          if (l) faltando[login] = l;
        }
      } catch {
        falharam.push({ cliente: nome, erro: `não consegui decifrar ${campoOrigem}` });
      }
    };
    tentar("instagram_password", "instagram_login");
    tentar("facebook_password", "facebook_login");

    const campos = Object.keys(faltando).filter((k) => k.endsWith("_password"));
    if (!campos.length) { if (!c.instagram_password && !c.facebook_password) semSenha.push(nome); continue; }

    if (dryRun) { corrigidos.push({ cliente: nome, campos }); continue; }

    const r = await espelharNoCofre(c.id as string, faltando);
    if (r.ok) corrigidos.push({ cliente: nome, campos });
    else falharam.push({ cliente: nome, erro: r.erro ?? "erro" });
  }

  return NextResponse.json({
    ok: falharam.length === 0,
    modo: dryRun ? "ensaio (não gravou)" : "aplicado",
    corrigidos,          // nome + quais campos — SEM a senha
    falharam,
    sem_senha_cadastrada: semSenha.length,
  });
}
