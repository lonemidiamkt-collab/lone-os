// app/api/system/regras-propostas/route.ts — O RESUMO DAS REGRAS QUE ESPERAM OK (segunda, 10h).
//
// Desde 26/10/2026 nenhuma regra aprendida vale sozinha (lib/cs/regras.ts → proporRegrasAprendidas). As da
// correção no grupo pedem ok na hora; as das rotinas de domingo (regras da semana nas conversas e releitura do
// ciclo) ficam esperando este resumo: UMA mensagem no grupo interno, por cliente, com o código de cada uma.
// Um gestor responde "ok a1b2 c3d4", "não a1b2" ou "ok todas" citando o resumo (lib/cs/regras-propostas.ts).
//
// Antes do resumo, descarta as propostas com mais de 14 dias sem resposta — a fila não vira arquivo morto.
//
//   ?dry=1 → devolve o texto e quantas venceriam, sem gravar nem enviar.
//
// Cron: segunda `15 13 * * 1` (10h15 BRT), depois do aviso de risco das 9h30 e antes da postagem das 11h.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DIAS_VALIDADE_PROPOSTA, enviarResumoDePropostas, expirarPropostas } from "@/lib/cs/regras-propostas";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  try {
    let vencidas = 0;
    if (dry) {
      const limite = new Date(Date.now() - DIAS_VALIDADE_PROPOSTA * 86400000).toISOString();
      const { count, error } = await supabaseAdmin.from("cs_client_rules").select("id", { count: "exact", head: true })
        .eq("estado", "proposta").lt("created_at", limite);
      if (error) throw new Error(error.message);
      vencidas = count ?? 0;
    } else {
      vencidas = await expirarPropostas();
    }
    const r = await enviarResumoDePropostas({ dry });
    console.log(`[regras-propostas] vencidas=${vencidas} esperando=${r.total} listadas=${r.listadas} enviado=${r.enviado} dry=${dry}`);
    // Nada a anunciar não é falha. Falha é ter o que anunciar e não conseguir.
    const ok = dry || r.total === 0 || r.enviado;
    return NextResponse.json({ ok, dry, vencidas, esperando: r.total, listadas: r.listadas, enviado: r.enviado, ...(r.erro ? { erro: r.erro } : {}), texto: r.texto }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error("[regras-propostas] falhou:", String(e));
    return NextResponse.json({ ok: false, dry, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
