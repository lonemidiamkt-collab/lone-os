export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson } from "@/lib/ai/openai";
import { avaliarCandidato, diversificar } from "@/lib/radar/score";
import { SCHEMA_ANALISE, promptAnalise, type SaidaAnalise, type NivelAnalise } from "@/lib/radar/analise";
import { SCHEMA_PAUTA, promptPauta } from "@/lib/radar/pauta";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";

// POST /api/system/radar-inteligencia — do conteúdo bruto à pauta na mão do social media.
//
//   1. seleciona os outliers que passam no filtro (matemática, sem IA);
//   2. entende cada um com IA barata;
//   3. agrupa o que se repete em mais de um perfil — isso é tendência, um post sozinho não é;
//   4. transforma cada tendência em pauta para os clientes DAQUELE nicho.
//
// A economia mora na ordem: a estatística escolhe onde olhar, e só aí a IA trabalha. Rodar IA em
// tudo seria pagar caro para descobrir que a maioria do conteúdo é rotina.
//
// ?dry=1 não grava · ?nicho= um só · ?limite=N teto de análises

const MODELO_ANALISE = "gpt-5.4-nano";   // classificação e extração: tarefa barata
const MODELO_PAUTA = "gpt-5.4-mini";     // escrita que vai pro time ler: vale o modelo melhor

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soNicho = req.nextUrl.searchParams.get("nicho") || "";
  const limite = Math.min(60, Math.max(5, Number(req.nextUrl.searchParams.get("limite")) || 25));
  const inicio = Date.now();

  // ── 1. Seleção: matemática decide onde vale gastar IA ──────────────────────
  let q = supabaseAdmin.from("radar_media")
    .select("id, nicho, media_type, permalink, caption, likes, comments, followers_na_coleta, outlier_ratio, trend_score, posted_at, profile_id, analisado_em")
    .is("analisado_em", null)
    .not("outlier_ratio", "is", null)
    .gte("posted_at", new Date(Date.now() - 45 * 864e5).toISOString());
  if (soNicho) q = q.eq("nicho", soNicho);
  const { data: brutos, error } = await q.order("trend_score", { ascending: false }).limit(400);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!brutos?.length) return NextResponse.json({ ok: true, aviso: "nada novo para analisar" });

  const { data: perfis } = await supabaseAdmin.from("radar_profiles")
    .select("id, username, followers, baseline_posts, faixa");
  const porPerfil = new Map((perfis ?? []).map((p) => [p.id as string, p]));

  const aprovados: typeof brutos = [];
  let descartados = 0;
  for (const m of brutos) {
    const p = porPerfil.get(m.profile_id as string);
    const v = avaliarCandidato({
      engajamento: (Number(m.likes) || 0) + 2 * (Number(m.comments) || 0),
      followers: Number(m.followers_na_coleta) || Number(p?.followers) || 0,
      outlierRatio: Number(m.outlier_ratio),
      postsNaBaseline: Number(p?.baseline_posts) || 25,
    });
    if (v.aceito) aprovados.push(m); else descartados++;
  }

  // Nenhum perfil ocupa a lista, e marca grande não monopoliza — o valor está na loja pequena
  // que acertou, não em saber o que a Leroy postou.
  const selecionados = diversificar(
    aprovados.map((m) => ({
      item: m,
      perfil: String(porPerfil.get(m.profile_id as string)?.username ?? m.profile_id),
      followers: Number(m.followers_na_coleta) || 0,
      score: Number(m.trend_score) || 0,
    })),
    { limite, porPerfil: 2, tetoGrandes: 0.2 },
  );

  if (!selecionados.length) {
    return NextResponse.json({ ok: true, avaliados: brutos.length, descartados, aviso: "nenhum candidato passou no filtro" });
  }

  // ── 2. Entender cada conteúdo ──────────────────────────────────────────────
  const analisados: { midia: typeof selecionados[0]; a: SaidaAnalise; perfil: string; followers: number }[] = [];
  const erros: string[] = [];

  for (const m of selecionados) {
    const p = porPerfil.get(m.profile_id as string);
    // O probe mostrou que vídeo de terceiro não entrega o arquivo — só legenda e miniatura. O nível
    // fica registrado pra ninguém achar que houve leitura de vídeo que não houve.
    const nivel: NivelAnalise = "texto";
    const { system, user } = promptAnalise({
      caption: m.caption as string | undefined,
      mediaType: String(m.media_type ?? "?"),
      permalink: m.permalink as string | undefined,
      followers: Number(m.followers_na_coleta) || 0,
      likes: Number(m.likes) || 0, comments: Number(m.comments) || 0,
      outlierRatio: Number(m.outlier_ratio) || 0,
    }, nivel);

    const r = await chatJson<SaidaAnalise>({
      model: MODELO_ANALISE, schemaName: "radar_analise", schema: SCHEMA_ANALISE,
      maxTokens: 500, temperature: 0.2, system, user,
    });
    if (!r.ok || !r.data) { erros.push(`análise ${m.id}: ${r.error ?? "sem retorno"}`); continue; }

    analisados.push({ midia: m, a: r.data, perfil: String(p?.username ?? "?"), followers: Number(m.followers_na_coleta) || 0 });

    if (!dry) {
      await supabaseAdmin.from("radar_analysis").insert({
        media_id: m.id, tema: r.data.tema, hook: r.data.hook, hook_tipo: r.data.hookTipo,
        formato: r.data.formato, estrutura: r.data.estrutura, cta: r.data.cta,
        motivo_performance: r.data.motivoPerformance, replicavel: r.data.replicavel,
        tags: r.data.tags, modelo: `${MODELO_ANALISE} (nível: ${nivel})`,
      });
      await supabaseAdmin.from("radar_media").update({ analisado_em: new Date().toISOString() }).eq("id", m.id);
    }
  }

  // ── 3. Tendência = padrão repetido em perfis DIFERENTES ────────────────────
  //
  // Um post sozinho é sinal, não tendência. Só vira tendência quando empresas diferentes chegam à
  // mesma fórmula por conta própria — aí é o mercado falando, não acaso.
  //
  // Agrupa por FORMATO, não por formato+abertura. Na primeira rodada real, "institucional"
  // apareceu em 5 conteúdos de 4 perfis (Casas Bahia nos 70 anos, Votorantim nos 90, Telhanorte,
  // Canadian Solar) — uma tendência clara de storytelling de legado. A chave antiga exigia também
  // o mesmo tipo de abertura, e como as aberturas variavam ("institucional", "erro/alerta",
  // "indefinido"), o padrão se partiu em quatro grupos de um e NENHUMA tendência foi detectada.
  // Formato é o que se repete de verdade; a abertura é variação em cima dele.
  const grupos = new Map<string, typeof analisados>();
  for (const x of analisados) {
    const chave = `${x.midia.nicho}|${x.a.formato}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), x]);
  }

  const tendencias = [...grupos.entries()]
    .map(([chave, itens]) => {
      const [nicho, formato] = chave.split("|");
      const perfisDistintos = new Set(itens.map((i) => i.perfil)).size;
      // As aberturas vistas dentro do formato: é o que dá textura à recomendação.
      const aberturas = [...new Set(itens.map((i) => i.a.hookTipo).filter((h) => h && h !== "indefinido"))];
      return { nicho, formato, hookTipo: aberturas[0] ?? "variada", aberturas, itens, perfisDistintos };
    })
    .filter((t) => t.perfisDistintos >= 2)          // dois perfis diferentes, no mínimo
    .sort((a, b) => b.perfisDistintos - a.perfisDistintos || b.itens.length - a.itens.length);

  // ── 4. Tendência vira pauta para os clientes daquele nicho ─────────────────
  const pautas: Record<string, unknown>[] = [];
  for (const t of tendencias.slice(0, 4)) {
    const { data: clientes } = await supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, nicho, cidade")
      .eq("nicho", t.nicho).or("active.is.null,active.eq.true").is("draft_status", null).limit(3);

    for (const c of clientes ?? []) {
      const nome = (c.nome_fantasia as string) || (c.name as string);
      const briefing = await loadBriefingCombinado(c.id as string).catch(() => "");
      const regras = await fetchClientCsRules(c.id as string).catch(() => [] as string[]);

      const { system, user } = promptPauta({
        cliente: nome, nicho: t.nicho,
        briefing: typeof briefing === "string" ? briefing : undefined,
        regras: Array.isArray(regras) ? regras.slice(0, 8).map(String) : undefined,
        cidade: (c.cidade as string) || undefined,
        tendencia: {
          nome: `${t.formato} com abertura de ${t.hookTipo}`,
          formato: t.formato, hookTipo: t.hookTipo,
          estrutura: t.itens[0]?.a.estrutura ?? "",
          porqueFunciona: t.itens[0]?.a.motivoPerformance ?? "",
          quantosPerfis: t.perfisDistintos,
          exemplos: t.itens.slice(0, 3).map((i) => ({
            permalink: i.midia.permalink as string | undefined,
            outlier: Number(i.midia.outlier_ratio) || 0,
          })),
        },
      });

      const r = await chatJson<Record<string, unknown>>({
        model: MODELO_PAUTA, schemaName: "radar_pauta", schema: SCHEMA_PAUTA,
        maxTokens: 700, temperature: 0.6, system, user,
      });
      if (!r.ok || !r.data) { erros.push(`pauta ${nome}: ${r.error ?? "sem retorno"}`); continue; }

      pautas.push({
        cliente: nome, nicho: t.nicho,
        tendencia: `${t.formato} · ${t.hookTipo} (${t.perfisDistintos} perfis)`,
        ...r.data,
        referencias: t.itens.slice(0, 3).map((i) => i.midia.permalink).filter(Boolean),
      });
    }
  }

  return NextResponse.json({
    ok: erros.length === 0, dry,
    avaliados: brutos.length, descartados_pelo_filtro: descartados,
    analisados: analisados.length,
    tendencias: tendencias.map((t) => ({
      nicho: t.nicho, formato: t.formato, aberturas: t.aberturas,
      perfis: t.perfisDistintos, conteudos: t.itens.length,
      exemplos: t.itens.slice(0, 3).map((i) => `@${i.perfil} ${Number(i.midia.outlier_ratio).toFixed(1)}x`),
    })),
    pautas,
    erros: erros.slice(0, 5),
    duracao_ms: Date.now() - inicio,
  });
}
