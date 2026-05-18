export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  canRestore,
  resolveMemberId,
  fetchBriefingVersion,
  fetchCurrentBriefing,
} from "../../_lib";

// ── POST /api/clients/[id]/briefing/restore/[versionId] ───────
// Roles: admin apenas (canRestore)
// Cria nova versão copiando todos os campos de uma versão antiga.
// A versão restaurada recebe o próximo número de versão disponível.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
) {
  const { id: clientId, versionId } = params;

  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!canRestore(user)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  Sentry.setContext("briefing_restore", { client_id: clientId, version_id: versionId, user_email: user.email });

  try {
    // ── 1. Busca versão alvo ──────────────────────────────────────
    const target = await fetchBriefingVersion(versionId, clientId);
    if (!target) {
      return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
    }

    const memberId = await resolveMemberId(user.email);

    // ── 2. Calcula próxima versão ─────────────────────────────────
    const { data: maxRow } = await supabaseAdmin
      .from("client_briefings")
      .select("version")
      .eq("client_id", clientId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxRow?.version ?? 0) + 1;

    // ── 3. Desativa versão atual ──────────────────────────────────
    await supabaseAdmin
      .from("client_briefings")
      .update({ is_current: false })
      .eq("client_id", clientId)
      .eq("is_current", true);

    // ── 4. Insere cópia como nova versão atual ────────────────────
    const { error: insertError } = await supabaseAdmin
      .from("client_briefings")
      .insert({
        client_id:                     clientId,
        version:                       nextVersion,
        is_current:                    true,
        created_by:                    memberId,

        // Copia todos os campos de conteúdo da versão alvo
        resumo_estrategico:            target.resumo_estrategico,
        produtos:                      target.produtos,
        publico_alvo:                  target.publico_alvo,
        posicionamento:                target.posicionamento,
        dores:                         target.dores,
        ganchos:                       target.ganchos,
        ctas:                          target.ctas,
        observacoes_estrategicas:      target.observacoes_estrategicas,

        paleta_cores:                  target.paleta_cores,
        tipografia:                    target.tipografia,
        logo_url:                      target.logo_url,
        referencias_visuais:           target.referencias_visuais,
        elementos_evitar:              target.elementos_evitar,

        tom_voz:                       target.tom_voz,
        pessoa_verbal:                 target.pessoa_verbal,
        usa_emoji:                     target.usa_emoji,
        usa_giria:                     target.usa_giria,
        palavras_proibidas:            target.palavras_proibidas,
        hashtags_padrao:               target.hashtags_padrao,

        horarios_preferidos:           target.horarios_preferidos,
        produtos_destaque_atual:       target.produtos_destaque_atual,
        concorrentes_evitar_mencionar: target.concorrentes_evitar_mencionar,

        observacoes_internas:          target.observacoes_internas,
      });

    if (insertError) {
      Sentry.captureException(insertError, {
        extra: { client_id: clientId, version_id: versionId, user_email: user.email },
      });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── 5. Retorna objeto canônico da view ────────────────────────
    const { briefing, total_versions } = await fetchCurrentBriefing(clientId);
    return NextResponse.json({
      briefing,
      total_versions,
      restored_from_version: target.version,
    }, { status: 201 });

  } catch (err) {
    Sentry.captureException(err, {
      extra: { client_id: clientId, version_id: versionId, user_email: user.email },
    });
    return NextResponse.json({ error: "Erro interno ao restaurar versão" }, { status: 500 });
  }
}
