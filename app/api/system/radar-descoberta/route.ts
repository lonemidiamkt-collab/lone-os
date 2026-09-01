export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { metaProvider } from "@/lib/radar/provider";
import { mediana, engajamento, faixaDePerfil, MIN_BASELINE } from "@/lib/radar/score";
import { escolherQueriesMistas, semearQueries, buscarAchados } from "@/lib/radar/discovery";

// POST /api/system/radar-descoberta — procura no mercado quem a gente ainda não conhece.
//
// PRA QUE: o social media gasta um tempo enorme caçando referência antes de propor pauta. Este é o
// trabalho que a máquina faz melhor: varrer o mercado, medir tudo contra a própria régua de cada
// perfil, e entregar só o que fugiu do normal.
//
// DIVISÃO DE PAPÉIS, que é o que mantém o dado honesto: a IA com busca web só descobre ENDEREÇOS
// (handles). Quem mede é sempre a API oficial da Meta. Modelo de linguagem não sabe quantos
// seguidores alguém tem hoje — perguntar isso a ele devolve número inventado com cara de dado.
//
// ?nicho= roda um só · ?queries=N quantas perguntas usar · ?dry=1 não grava

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soNicho = req.nextUrl.searchParams.get("nicho") || "";
  const quantasQueries = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get("queries")) || 4));
  const inicio = Date.now();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY ausente" }, { status: 500 });

  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").single();
  const token = cfg?.value as string | undefined;
  if (!token) return NextResponse.json({ error: "meta_token ausente" }, { status: 500 });

  const { data: contaBase } = await supabaseAdmin.from("clients")
    .select("ig_business_account_id").not("ig_business_account_id", "is", null)
    .neq("ig_business_account_id", "").limit(1).single();
  const igBase = contaBase?.ig_business_account_id as string | undefined;
  if (!igBase) return NextResponse.json({ error: "nenhuma conta Instagram da agência mapeada" }, { status: 500 });
  const provider = metaProvider(token, igBase);

  // Nichos que a agência realmente atende — não faz sentido varrer mercado sem cliente dentro.
  let nichos: string[];
  if (soNicho) nichos = [soNicho];
  else {
    const { data: cs } = await supabaseAdmin.from("clients")
      .select("nicho").or("active.is.null,active.eq.true").is("draft_status", null).not("nicho", "is", null);
    const contagem = new Map<string, number>();
    for (const c of cs ?? []) {
      const n = (c.nicho as string)?.trim(); if (!n) continue;
      contagem.set(n, (contagem.get(n) ?? 0) + 1);
    }
    // Do nicho com mais clientes para o com menos: uma descoberta em Construção serve 20 clientes.
    nichos = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }

  const resumo: Record<string, unknown>[] = [];

  for (const nicho of nichos) {
    const t0 = Date.now();
    const erros: string[] = [];
    await semearQueries(nicho);
    // Metade das perguntas é content-first ("que Reel está circulando"), metade é profile-first
    // ("quem são as empresas"). Só rodízio por data faria semanas inteiras caírem na segunda
    // família, que é a maioria das cadastradas, e o content-first nunca sairia do papel.
    const queries = await escolherQueriesMistas(nicho, quantasQueries);
    if (!queries.length) { resumo.push({ nicho, aviso: "sem queries" }); continue; }

    // 1) Descobrir — por conteúdo e por empresa
    const candidatos = new Map<string, { queryId: string; origem: string; permalink?: string }>();
    let viaConteudo = 0;
    for (const q of queries) {
      try {
        const achados = await buscarAchados(q.query as string, String(q.tipo ?? "keyword"), apiKey);
        for (const a of achados) {
          if (candidatos.has(a.username)) continue;
          candidatos.set(a.username, { queryId: q.id as string, origem: a.origem, permalink: a.permalink });
          if (a.origem === "conteudo") viaConteudo++;
        }
      } catch (e) {
        erros.push(`${q.query}: ${String(e).slice(0, 90)}`);
      }
      if (!dry) {
        await supabaseAdmin.from("radar_queries")
          .update({ ultima_vez: new Date().toISOString(), usos: (Number(q.usos) || 0) + 1 })
          .eq("id", q.id as string);
      }
    }

    // Quem já está no radar não precisa ser redescoberto.
    const { data: existentes } = await supabaseAdmin.from("radar_profiles").select("username");
    const conhecidos = new Set((existentes ?? []).map((p) => (p.username as string).toLowerCase()));

    // 2) Validar e medir na fonte oficial
    let validados = 0, novos = 0, semBase = 0, inacessiveis = 0;
    const aceitos: { username: string; followers: number; faixa: string; mediana: number; posts: number; queryId: string; origem: string }[] = [];

    for (const [username, meta] of candidatos) {
      const queryId = meta.queryId;
      if (conhecidos.has(username)) continue;
      try {
        const r = await provider.lerPerfil(username, 25);
        if (!r) { inacessiveis++; continue; }
        validados++;
        const engs = r.midias.map((m) => engajamento({ likes: m.likes, comments: m.comments }));
        if (engs.length < MIN_BASELINE) { semBase++; continue; }

        const med = mediana(engs);
        const faixa = faixaDePerfil(r.perfil.followers);
        aceitos.push({
          username: r.perfil.username, followers: r.perfil.followers, faixa,
          mediana: med, posts: engs.length, queryId, origem: meta.origem,
        });
        novos++;

        if (!dry) {
          await supabaseAdmin.from("radar_profiles").insert({
            username: r.perfil.username, nicho,
            followers: r.perfil.followers, media_count: r.perfil.mediaCount,
            faixa, descoberto_por: queryId, origem: meta.origem === "conteudo" ? "descoberto_conteudo" : "descoberto",
            mediana_engajamento: med, baseline_posts: engs.length,
          });
          // Pergunta que traz perfil útil ganha prioridade; a que não traz nada vai perdendo a vez.
          const { data: q } = await supabaseAdmin.from("radar_queries").select("achados_uteis").eq("id", queryId).single();
          await supabaseAdmin.from("radar_queries")
            .update({ achados_uteis: (Number(q?.achados_uteis) || 0) + 1 }).eq("id", queryId);
        }
      } catch (e) {
        erros.push(`@${username}: ${String(e).slice(0, 70)}`);
      }
    }

    const duracao = Date.now() - t0;
    if (!dry) {
      await supabaseAdmin.from("radar_discovery_runs").insert({
        nicho, queries_usadas: queries.map((q) => q.query as string),
        candidatos: candidatos.size, validados, novos, sem_base: semBase,
        erros: erros.length ? erros.slice(0, 10) : null, duracao_ms: duracao,
      });
    }

    resumo.push({
      nicho, queries: queries.length, candidatos: candidatos.size,
      // Quantos nasceram de uma busca por CONTEÚDO — é o indicador de que o radar não voltou a
      // ser um buscador de empresas.
      via_conteudo: viaConteudo,
      validados, novos, sem_base: semBase, inacessiveis,
      // Amostra do que entrou, pra dar pra conferir sem abrir o banco.
      exemplos: aceitos.slice(0, 6).map((a) => `@${a.username} (${a.followers} seg, ${a.faixa}, via ${a.origem})`),
      erros: erros.slice(0, 3),
      duracao_ms: duracao,
    });
  }

  return NextResponse.json({ ok: true, dry, nichos: resumo, duracao_total_ms: Date.now() - inicio });
}
