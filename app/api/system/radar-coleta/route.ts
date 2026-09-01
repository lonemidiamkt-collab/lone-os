export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { metaProvider, PerfilInacessivel, type MidiaPublica } from "@/lib/radar/provider";
import { calcularScore, type MidiaParaScore } from "@/lib/radar/score";

// POST /api/system/radar-coleta — a rodada semanal do Trend Radar.
//
// Lê os perfis monitorados de cada nicho, guarda o conteúdo novo, calcula o quanto cada peça
// performou acima do normal DAQUELE perfil, e deixa pronto o que merece análise.
//
// A IA não entra aqui de propósito. Essa é a economia que sustenta o sistema: de milhares de posts,
// o cálculo estatístico separa algumas dezenas, e só essas custam token. Rodar IA em tudo seria
// pagar caro para descobrir que a maioria do conteúdo é rotina.
//
// ?dry=1 calcula sem gravar · ?nicho=<slug> roda um nicho só

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soNicho = req.nextUrl.searchParams.get("nicho") || "";
  const inicio = Date.now();

  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("key, value").eq("key", "meta_token");
  const token = cfg?.[0]?.value as string | undefined;
  if (!token) return NextResponse.json({ error: "meta_token ausente em agency_settings" }, { status: 500 });

  // A Business Discovery é sempre consultada A PARTIR de uma conta IG da casa. Qualquer uma serve;
  // ela é só o ponto de entrada da chamada, não influencia o dado lido.
  const { data: contaBase } = await supabaseAdmin.from("clients")
    .select("ig_business_account_id").not("ig_business_account_id", "is", null)
    .neq("ig_business_account_id", "").limit(1).single();
  const igBase = contaBase?.ig_business_account_id as string | undefined;
  if (!igBase) return NextResponse.json({ error: "nenhuma conta Instagram da agência mapeada" }, { status: 500 });

  const provider = metaProvider(token, igBase);

  let q = supabaseAdmin.from("radar_profiles").select("id, username, nicho, followers").eq("ativo", true);
  if (soNicho) q = q.eq("nicho", soNicho);
  const { data: perfis, error: erroPerfis } = await q;
  if (erroPerfis) return NextResponse.json({ error: erroPerfis.message }, { status: 500 });
  if (!perfis?.length) return NextResponse.json({ ok: true, aviso: "nenhum perfil monitorado", perfis: 0 });

  const erros: string[] = [];
  let midiasNovas = 0, perfisLidos = 0, desativados = 0;
  const destaques: { perfil: string; nicho: string; score: number; outlier: number | null; permalink?: string }[] = [];

  for (const p of perfis) {
    const username = p.username as string;
    try {
      const r = await provider.lerPerfil(username, 25);
      if (!r) {
        // Perfil sumiu, virou privado ou deixou de ser Business. Desativa em vez de tentar toda
        // semana pra sempre — e registra o motivo, senão vira mistério daqui a três meses.
        if (!dry) {
          await supabaseAdmin.from("radar_profiles")
            .update({ ativo: false, motivo_inativo: "não acessível pela API (privado, pessoal ou inexistente)" })
            .eq("id", p.id as string);
        }
        desativados++;
        continue;
      }
      perfisLidos++;
      const { perfil, midias } = r;

      if (!dry) {
        await supabaseAdmin.from("radar_profiles").update({
          followers: perfil.followers, media_count: perfil.mediaCount,
          ultima_coleta: new Date().toISOString(),
        }).eq("id", p.id as string);
      }

      // Histórico do próprio perfil é a régua. Vem da mesma leitura: as 25 últimas peças.
      const historico: MidiaParaScore[] = midias.map((m) => ({
        likes: m.likes, comments: m.comments, followers: perfil.followers,
      }));

      const { data: jaTem } = await supabaseAdmin.from("radar_media")
        .select("media_id").eq("profile_id", p.id as string);
      const conhecidos = new Set((jaTem ?? []).map((x) => x.media_id as string));

      for (const m of midias) {
        const score = calcularScore(
          { likes: m.likes, comments: m.comments, followers: perfil.followers, postedAt: m.postedAt },
          historico,
        );

        if (conhecidos.has(m.mediaId)) {
          // Já conhecido: só registra como o número evoluiu. É o que permite dizer depois se um
          // conteúdo está acelerando ou se já parou — e só o primeiro caso vira pauta urgente.
          if (!dry) {
            const { data: existente } = await supabaseAdmin.from("radar_media")
              .select("id").eq("profile_id", p.id as string).eq("media_id", m.mediaId).single();
            if (existente) {
              await supabaseAdmin.from("radar_media_snapshots").insert({
                media_id: existente.id, likes: m.likes, comments: m.comments,
              });
              await supabaseAdmin.from("radar_media").update({
                likes: m.likes, comments: m.comments,
                engagement_rate: score.taxaEngajamento, outlier_ratio: score.outlierRatio,
                trend_score: score.temBase ? score.valor : null,
              }).eq("id", existente.id);
            }
          }
          continue;
        }

        midiasNovas++;
        if (score.temBase && score.valor > 0) {
          destaques.push({
            perfil: perfil.username, nicho: p.nicho as string,
            score: score.valor, outlier: score.outlierRatio, permalink: m.permalink,
          });
        }
        if (!dry) {
          await supabaseAdmin.from("radar_media").insert({
            profile_id: p.id, media_id: m.mediaId, nicho: p.nicho,
            media_type: m.mediaType, permalink: m.permalink, caption: m.caption,
            posted_at: m.postedAt, likes: m.likes, comments: m.comments,
            followers_na_coleta: perfil.followers,
            engagement_rate: score.taxaEngajamento, outlier_ratio: score.outlierRatio,
            trend_score: score.temBase ? score.valor : null,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof PerfilInacessivel ? `@${username}: ${e.message}` : `@${username}: ${String(e)}`;
      erros.push(msg.slice(0, 160));
    }
  }

  destaques.sort((a, b) => b.score - a.score);
  const duracao = Date.now() - inicio;

  if (!dry) {
    await supabaseAdmin.from("radar_runs").insert({
      tipo: "coleta", nicho: soNicho || null,
      perfis_lidos: perfisLidos, midias_novas: midiasNovas,
      erros: erros.length ? erros : null, duracao_ms: duracao,
    });
  }

  return NextResponse.json({
    ok: erros.length === 0, dry,
    perfis_monitorados: perfis.length, perfis_lidos: perfisLidos, desativados,
    midias_novas: midiasNovas,
    // Só o topo: é isso que vai virar análise de IA na próxima etapa.
    destaques: destaques.slice(0, 15),
    erros, duracao_ms: duracao,
  });
}
