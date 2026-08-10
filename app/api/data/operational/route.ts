export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { decryptVault } from "@/lib/crypto/vault";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cofre (client_access — senhas em texto plano) só pra admin/manager/social. Tráfego, designer
  // e comercial/SDR NÃO recebem — antes qualquer logado puxava o cofre inteiro por aqui.
  const { data: tm } = await supabaseAdmin.from("team_members").select("role").eq("email", user.email).maybeSingle();
  const role = ((tm?.role as string) || "").toLowerCase();
  const canSeeCofre = user.isAdmin || ["admin", "manager", "social"].includes(role);

  const [
    timeline, onboardingItems, globalChat, tasks, notices,
    creativeAssets, socialProofs, crisisNotes, quinzReports,
    moodEntries, clientAccessCifrado,
  ] = await Promise.all([
    db.fetchTimeline(),
    db.fetchOnboardingItems(),
    db.fetchGlobalChat(),
    db.fetchTasks(),
    db.fetchNotices(),
    db.fetchCreativeAssets(),
    db.fetchSocialProofs(),
    db.fetchCrisisNotes(),
    db.fetchQuinzReports(),
    db.fetchMoodEntries(),
    canSeeCofre ? db.fetchClientAccess() : Promise.resolve({}),
  ]);

  // A SENHA SAI DO BANCO CIFRADA E É ABERTA AQUI. Esta rota roda no servidor, único lugar onde a
  // VAULT_KEY existe — decifrar em queries.ts arrastaria node:crypto pro pacote do navegador (o
  // build quebrou assim), e se passasse seria pior: a chave do cofre indo pro lado de fora.
  const CAMPOS_SENHA = ["instagramPassword", "facebookPassword", "tiktokPassword",
                        "linkedinPassword", "youtubePassword", "mlabsPassword"] as const;
  const clientAccess: Record<string, Record<string, unknown>> = {};
  for (const [id, acc] of Object.entries(clientAccessCifrado as Record<string, Record<string, unknown>>)) {
    const aberto: Record<string, unknown> = { ...acc };
    for (const campo of CAMPOS_SENHA) {
      const v = acc[campo];
      // decryptVault devolve o próprio valor quando não tem o prefixo v1: — linha antiga em texto
      // puro continua legível, então a migração não deixa ninguém sem acesso no meio do caminho.
      if (typeof v === "string" && v) aberto[campo] = decryptVault(v) ?? v;
    }
    clientAccess[id] = aberto;
  }

  return NextResponse.json({
    timeline, onboardingItems, globalChat, tasks, notices,
    creativeAssets, socialProofs, crisisNotes, quinzReports,
    moodEntries, clientAccess,
  });
}
