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
import { agruparPorSemelhanca, candidatas, avaliarForca, assinatura, type ItemParaAgrupar } from "@/lib/radar/tendencia";
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
    .select("id, nicho, media_type, permalink, caption, likes, comments, followers_na_coleta, outlier_ratio, trend_score, posted_at, profile_id, analisado_em, media_url, thumbnail_url")
    .is("analisado_em", null)
    .not("outlier_ratio", "is", null)
    .gte("posted_at", new Date(Date.now() - 45 * 864e5).toISOString());
  if (soNicho) q = q.eq("nicho", soNicho);
  const { data: brutosRaw, error } = await q.order("trend_score", { ascending: false }).limit(400);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const brutos = brutosRaw ?? [];

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

  // Sem conteúdo NOVO para analisar o fluxo continua: o valor está em transformar o acumulado em
  // pauta, não em analisar coisa nova toda semana. A versão anterior retornava aqui e nunca chegava
  // ao agrupamento — com 19 análises no banco, o relatório saía vazio dizendo que estava tudo bem.

  // ── 2. Entender cada conteúdo ──────────────────────────────────────────────
  const analisados: { midia: typeof selecionados[0]; a: SaidaAnalise; perfil: string; followers: number }[] = [];
  const erros: string[] = [];

  for (const m of selecionados) {
    const p = porPerfil.get(m.profile_id as string);

    // Julgar um antes/depois pela legenda é adivinhar. A Meta entrega o arquivo de IMAGE/CAROUSEL
    // de terceiros e a MINIATURA de vídeo — o probe confirmou os dois. Usar isso é a diferença
    // entre ver e supor. O que continua fora é o vídeo em si, e o nível registrado diz exatamente
    // isso, pra ninguém achar que houve leitura de vídeo que não houve.
    const tipo = String(m.media_type ?? "").toUpperCase();
    let nivel: NivelAnalise = "texto";
    const imagens: string[] = [];
    // Para VIDEO, `media_url` é o MP4 — mandar isso como imagem faz a OpenAI recusar o formato.
    // O que se manda de um Reel é a MINIATURA. O arquivo do vídeo serve para outra coisa (frames e
    // transcrição, com ffmpeg), que é etapa própria.
    const urlVisual = tipo === "VIDEO"
      ? ((m.thumbnail_url as string) || "")
      : ((m.media_url as string) || (m.thumbnail_url as string) || "");
    if (urlVisual) {
      try {
        const resp = await fetch(urlVisual, { signal: AbortSignal.timeout(20_000) });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length > 0 && buf.length < 8 * 1024 * 1024) {
            imagens.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
            nivel = tipo === "VIDEO" ? "video" : "imagem";
          }
        }
      } catch { /* sem a imagem cai pro nível texto — que é honesto, e fica registrado */ }
    }
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
      maxTokens: 700, temperature: 0.2, system, user,
      imagens: imagens.length ? imagens : undefined,
    });
    if (!r.ok || !r.data) { erros.push(`análise ${m.id}: ${r.error ?? "sem retorno"}`); continue; }

    analisados.push({ midia: m, a: r.data, perfil: String(p?.username ?? "?"), followers: Number(m.followers_na_coleta) || 0 });

    if (!dry) {
      await supabaseAdmin.from("radar_analysis").insert({
        media_id: m.id, tema: r.data.tema, hook: r.data.hook, hook_tipo: r.data.hookTipo,
        formato: r.data.formato, cta: r.data.cta,
        // O detalhe do mecanismo entra junto da estrutura pra não perder a descrição rica: o
        // agrupamento usa o mecanismo canônico, a pauta usa as palavras daquele conteúdo.
        estrutura: [r.data.estrutura, r.data.mecanismoDetalhe].filter(Boolean).join(" · "),
        motivo_performance: r.data.motivoPerformance, replicavel: r.data.replicavel,
        tags: r.data.tags, modelo: `${MODELO_ANALISE} (nível: ${nivel})`,
        mecanismo: r.data.mecanismo, angulo: r.data.angulo, confianca: r.data.confianca,
      });
      await supabaseAdmin.from("radar_media")
        .update({ analisado_em: new Date().toISOString(), analysis_level: nivel }).eq("id", m.id);
    }
  }

  // ── 3. Tendência: mesmo MECANISMO em perfis diferentes ─────────────────────
  //
  // Agrupa por mecanismo, não por formato: "institucional" e "carrossel" são recipientes, e quatro
  // conteúdos que só têm isso em comum não são movimento de mercado. Olha os últimos 45 dias, não
  // só esta execução — conteúdo analisado não volta, e sem memória o sinal nunca acumulava.
  const { data: historico } = await supabaseAdmin
    .from("radar_analysis")
    .select("media_id, mecanismo, tema, formato, hook_tipo, estrutura, motivo_performance, created_at")
    .gte("created_at", new Date(Date.now() - 45 * 864e5).toISOString());

  const idsHist = (historico ?? []).map((h) => h.media_id as string);
  const { data: midiasHist } = idsHist.length
    ? await supabaseAdmin.from("radar_media")
        .select("id, nicho, permalink, outlier_ratio, profile_id, posted_at").in("id", idsHist)
    : { data: [] as Record<string, unknown>[] };
  const porMidia = new Map((midiasHist ?? []).map((m) => [m.id as string, m]));

  const universo: ItemParaAgrupar[] = [];
  const detalhePorMedia = new Map<string, { estrutura: string; motivo: string }>();
  for (const h of historico ?? []) {
    const m = porMidia.get(h.media_id as string);
    if (!m) continue;
    const mec = String(h.mecanismo ?? "").trim();
    // Análise antiga (antes do campo existir) não entra: sem mecanismo não há o que agrupar, e
    // cair no formato de volta seria repetir o erro que esta mudança veio corrigir.
    if (!mec) continue;
    const p = porPerfil.get(m.profile_id as string);
    universo.push({
      mediaId: m.id as string,
      perfil: String(p?.username ?? m.profile_id),
      nicho: String(m.nicho ?? ""),
      mecanismo: mec, tema: String(h.tema ?? ""),
      formato: String(h.formato ?? "outro"), hookTipo: String(h.hook_tipo ?? "indefinido"),
      outlier: Number(m.outlier_ratio) || 0,
      permalink: m.permalink as string | undefined,
      quando: String(m.posted_at ?? h.created_at ?? ""),
    });
    detalhePorMedia.set(m.id as string, {
      estrutura: String(h.estrutura ?? ""), motivo: String(h.motivo_performance ?? ""),
    });
  }

  const tendencias = candidatas(agruparPorSemelhanca(universo))
    .map((c) => ({ ...c, ...avaliarForca(c) }))
    .filter((c) => c.perfisDistintos >= 2 && c.status !== "dead")
    .sort((a, b) => b.forca - a.forca);

  // Persiste, para acompanhar evolução e não recomeçar do zero toda semana.
  const idsTendencia = new Map<string, string>();
  if (!dry) {
    for (const t of tendencias) {
      const mec = t.itens[0].mecanismo;
      const sig = assinatura(mec);
      const { data: gravada } = await supabaseAdmin.from("radar_trends").upsert({
        nicho: t.nicho, assinatura: sig, nome: mec.slice(0, 90), mecanismo: mec,
        formatos: [...new Set(t.itens.map((i) => i.formato))],
        aberturas: [...new Set(t.itens.map((i) => i.hookTipo).filter((h) => h !== "indefinido"))],
        perfis_count: t.perfisDistintos, midias_count: t.itens.length,
        outlier_mediano: t.outlierMediano, forca: t.forca, status: t.status,
        ultima_vez: new Date().toISOString(),
      }, { onConflict: "nicho,assinatura" }).select("id").single();
      if (gravada?.id) {
        idsTendencia.set(sig, gravada.id as string);
        await supabaseAdmin.from("radar_trend_media")
          .upsert(t.itens.map((i) => ({ trend_id: gravada.id, media_id: i.mediaId })), { onConflict: "trend_id,media_id" });
      }
    }
  }

  // ── 4. Tendência vira pauta — só para quem faz sentido ─────────────────────
  const pautas: Record<string, unknown>[] = [];
  for (const t of tendencias.slice(0, 4)) {
    const sig = assinatura(t.itens[0].mecanismo);
    const trendId = idsTendencia.get(sig);

    // Sem limite arbitrário de clientes: o corte é por PERTINÊNCIA, não pelos três primeiros que o
    // banco devolveu. Construção tem 20 clientes e a tendência pode servir a poucos ou a muitos.
    const { data: clientes, error: erroClientes } = await supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, nicho, endereco_cidade")
      .eq("nicho", t.nicho).or("active.is.null,active.eq.true").is("draft_status", null);
    if (erroClientes) { erros.push(`clientes do nicho ${t.nicho}: ${erroClientes.message}`); continue; }
    if (!clientes?.length) { erros.push(`nenhum cliente ativo no nicho "${t.nicho}"`); continue; }

    for (const c of clientes) {
      const nome = (c.nome_fantasia as string) || (c.name as string);

      // Já recebeu pauta desta tendência e ainda não decidiu? Não manda de novo. Repetir a mesma
      // ideia toda semana é o jeito mais rápido de o time parar de ler o radar.
      if (trendId) {
        const { count } = await supabaseAdmin.from("radar_pautas")
          .select("id", { count: "exact", head: true })
          .eq("client_id", c.id as string).eq("trend_id", trendId).eq("status", "nova");
        if ((count ?? 0) > 0) continue;
      }

      const briefing = await loadBriefingCombinado(c.id as string).catch(() => "");
      const regras = await fetchClientCsRules(c.id as string).catch(() => [] as string[]);

      // O que o cliente já publicou, pra não repetir tema.
      const { data: recentes } = await supabaseAdmin.from("content_cards")
        .select("title").eq("client_id", c.id as string)
        .order("created_at", { ascending: false }).limit(10);
      const jaPublicou = (recentes ?? []).map((r) => String(r.title ?? "")).filter(Boolean);

      const primeiro = detalhePorMedia.get(t.itens[0].mediaId);
      const { system, user } = promptPauta({
        cliente: nome, nicho: t.nicho,
        briefing: typeof briefing === "string" ? briefing : undefined,
        regras: Array.isArray(regras) ? regras.slice(0, 8).map(String) : undefined,
        cidade: (c.endereco_cidade as string) || undefined,
        jaPublicou,
        tendencia: {
          nome: t.itens[0].mecanismo,
          formato: [...new Set(t.itens.map((i) => i.formato))].join(" ou "),
          hookTipo: t.itens[0].hookTipo,
          estrutura: primeiro?.estrutura ?? "",
          porqueFunciona: primeiro?.motivo ?? "",
          quantosPerfis: t.perfisDistintos,
          exemplos: t.itens.slice(0, 3).map((i) => ({ permalink: i.permalink, outlier: i.outlier })),
        },
      });

      const r = await chatJson<Record<string, unknown>>({
        model: MODELO_PAUTA, schemaName: "radar_pauta", schema: SCHEMA_PAUTA,
        maxTokens: 900, temperature: 0.6, system, user,
      });
      if (!r.ok || !r.data) { erros.push(`pauta ${nome}: ${r.error ?? "sem retorno"}`); continue; }

      const d = r.data as Record<string, unknown>;
      const fit = Number(d.fitScore);
      // A própria IA diz se a tendência serve àquele cliente. Abaixo do corte, não vira pauta:
      // 5 tendências x 20 clientes daria 100 pautas, e a maioria seria ruído com nome de ideia.
      if (Number.isFinite(fit) && fit < 70) continue;

      const refs = t.itens.slice(0, 3).map((i) => i.permalink).filter(Boolean) as string[];
      pautas.push({
        cliente: nome, nicho: t.nicho, forca: t.forca, fit: Number.isFinite(fit) ? fit : null,
        tendencia: t.itens[0].mecanismo, ...d, referencias: refs,
      });

      if (!dry) {
        await supabaseAdmin.from("radar_pautas").insert({
          client_id: c.id, cliente_nome: nome, nicho: t.nicho, trend_id: trendId ?? null,
          tendencia: t.itens[0].mecanismo.slice(0, 200), perfis_na_tendencia: t.perfisDistintos,
          fit_score: Number.isFinite(fit) ? fit : null,
          ideia: String(d.ideia ?? ""), hook: String(d.hook ?? ""), formato: String(d.formato ?? ""),
          roteiro: Array.isArray(d.roteiro) ? d.roteiro.map(String) : null,
          cta: String(d.cta ?? ""), porque_funciona: String(d.porqueVaiFuncionar ?? ""),
          referencias: refs.length ? refs : null,
        });
      }
    }
  }

  return NextResponse.json({
    ok: erros.length === 0, dry,
    avaliados: brutos.length, descartados_pelo_filtro: descartados,
    analisados: analisados.length,
    tendencias: tendencias.map((t) => ({
      nicho: t.nicho, mecanismo: t.itens[0].mecanismo, forca: t.forca, status: t.status,
      perfis: t.perfisDistintos, conteudos: t.itens.length,
      outlier_mediano: Math.round(t.outlierMediano * 10) / 10,
      exemplos: t.itens.slice(0, 3).map((i) => `@${i.perfil} ${i.outlier.toFixed(1)}x`),
    })),
    pautas,
    erros: erros.slice(0, 5),
    duracao_ms: Date.now() - inicio,
  });
}
