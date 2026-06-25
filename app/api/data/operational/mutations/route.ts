export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptVault } from "@/lib/crypto/vault";
import * as db from "@/lib/supabase/queries";
import type { Role, ClientAccess } from "@/lib/types";

// Mantém o cadastro do admin (tabela `clients`) em sincronia com o Cofre do social
// (tabela `client_access`). Assim, quando o social atualiza uma senha que o cliente
// trocou, o admin vê a mesma coisa. Login fica plano; senha é criptografada (vault).
async function syncAccessToClients(clientId: string, access: Partial<ClientAccess>) {
  const patch: Record<string, unknown> = {};
  if (access.instagramLogin !== undefined) patch.instagram_login = access.instagramLogin || null;
  if (access.facebookLogin !== undefined) patch.facebook_login = access.facebookLogin || null;

  // A senha é criptografada no vault antes de ir pra coluna que o Cofre admin
  // decripta. Se VAULT_KEY faltar/falhar, encryptVault LANÇA — sem este try/catch
  // o erro derrubava todo o POST (o save do social já tinha gravado em client_access,
  // deixando as tabelas dessincronizadas). Em falha: PULAMOS a senha (gravar plaintext
  // na coluna vault quebraria o decrypt do Cofre), logamos, e seguimos com o login.
  try {
    if (access.instagramPassword !== undefined)
      patch.instagram_password = access.instagramPassword ? encryptVault(access.instagramPassword) : null;
    if (access.facebookPassword !== undefined)
      patch.facebook_password = access.facebookPassword ? encryptVault(access.facebookPassword) : null;
  } catch (err) {
    delete patch.instagram_password;
    delete patch.facebook_password;
    console.error("[syncAccessToClients] encryptVault falhou — senha NÃO sincronizada p/ clients:", err);
  }

  if (Object.keys(patch).length === 0) return;
  const { error } = await supabaseAdmin.from("clients").update(patch).eq("id", clientId);
  if (error) console.error("[syncAccessToClients] falhou:", error.message);
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  switch (action) {
    case "insertTimeline": {
      await db.insertTimelineEntry(body.entry);
      const timeline = await db.fetchTimeline();
      return NextResponse.json({ timeline });
    }
    case "updateOnboarding": {
      await db.updateOnboardingItemDb(body.itemId, body.completed, body.actor);
      return NextResponse.json({ ok: true });
    }
    case "insertGlobalChat": {
      await db.insertGlobalChatMessage(body.user, body.role as Role, body.text);
      return NextResponse.json({ ok: true });
    }
    case "insertMood": {
      await db.insertMoodEntry(body.clientId, body.mood, body.note, body.actor);
      return NextResponse.json({ ok: true });
    }
    case "upsertClientAccess": {
      await db.upsertClientAccess(body.clientId, body.access, body.actor);
      await syncAccessToClients(body.clientId, body.access);
      return NextResponse.json({ ok: true });
    }
    case "insertCreativeAsset": {
      await db.insertCreativeAsset(body.asset);
      const creativeAssets = await db.fetchCreativeAssets();
      return NextResponse.json({ creativeAssets });
    }
    case "insertSocialProof": {
      await db.insertSocialProof(body.entry);
      const socialProofs = await db.fetchSocialProofs();
      return NextResponse.json({ socialProofs });
    }
    case "insertCrisisNote": {
      await db.insertCrisisNote(body.clientId, body.note, body.actor);
      const crisisNotes = await db.fetchCrisisNotes();
      return NextResponse.json({ crisisNotes });
    }
    case "insertQuinzReport": {
      await db.insertQuinzReport(body.report);
      const quinzReports = await db.fetchQuinzReports();
      return NextResponse.json({ quinzReports });
    }
    case "insertNotice": {
      await db.insertNotice(body.data);
      const notices = await db.fetchNotices();
      return NextResponse.json({ notices });
    }
    case "deleteNotice": {
      await db.deleteNoticeDb(body.id);
      const notices = await db.fetchNotices();
      return NextResponse.json({ notices });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
