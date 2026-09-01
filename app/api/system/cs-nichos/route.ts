export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { normalizarNicho, ROTULO_NICHO, type Nicho } from "@/lib/cs/nicho";

// POST /api/system/cs-nichos — descobre o RAMO de cada cliente, para a pauta por nicho funcionar.
//
// O problema: `clients.nicho` estava preenchido em 14 de 50, e `industry` guardava o pacote que a
// Lone vende ("Lone Growth" em 24 clientes), não o ramo de ninguém. Pauta "por nicho" sem ramo é
// pauta genérica com cara de personalizada.
//
// Ordem deliberada, do mais confiável ao mais caro:
//   1. o que já está escrito em nicho/industry, normalizado;
//   2. o NOME do cliente — "Madeirão Madeira", "Óticas Raki", "Portuga P'Neus" dizem o ramo
//      sozinhos, sem custo e sem chute de modelo;
//   3. só o que sobrar vai pra IA, com briefing e histórico de posts.
//
// ?dry=1 mostra o que faria sem gravar.

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["nicho", "confianca"],
  properties: {
    nicho: { type: "string", enum: Object.keys(ROTULO_NICHO) },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
  },
};

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const { data: clientes, error } = await supabaseAdmin.from("clients")
    .select("id, name, nicho, industry, active, draft_status")
    .or("active.is.null,active.eq.true").is("draft_status", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const decidido: { nome: string; nicho: Nicho; via: string }[] = [];
  const paraIA: { id: string; nome: string }[] = [];
  const gravar: { id: string; nicho: Nicho }[] = [];

  for (const c of clientes ?? []) {
    const nome = (c.name as string) ?? "";
    // Já tem ramo reconhecível? Mantém o RAMO, mas reescreve o rótulo na forma canônica.
    //
    // Sem isso o banco acumula sinônimos do mesmo ramo — "Construção", "Construção Civil",
    // "Construção e materiais" e "Pisos e porcelanato" conviviam como quatro nichos diferentes. Pro
    // Trend Radar isso é pior que cosmético: ele pesquisaria o mesmo mercado quatro vezes, pagando
    // quatro coletas e diluindo as tendências entre rótulos que deveriam ser um só.
    const atual = normalizarNicho(c.nicho as string);
    if (atual && atual !== "outro") {
      decidido.push({ nome, nicho: atual, via: "cadastro" });
      if ((c.nicho as string) !== ROTULO_NICHO[atual]) gravar.push({ id: c.id as string, nicho: atual });
      continue;
    }

    // industry pode conter ramo de verdade em alguns (Ótica, Construção Civil) — o normalizador
    // devolve null pros que são pacote.
    const porIndustry = normalizarNicho(c.industry as string);
    if (porIndustry && porIndustry !== "outro") {
      decidido.push({ nome, nicho: porIndustry, via: "industry" });
      gravar.push({ id: c.id as string, nicho: porIndustry });
      continue;
    }

    // O nome costuma dizer o ramo. Barato, determinístico, e erra menos que modelo com pouco input.
    const porNome = normalizarNicho(nome);
    if (porNome && porNome !== "outro" && porNome !== "varejo") {
      decidido.push({ nome, nicho: porNome, via: "nome" });
      gravar.push({ id: c.id as string, nicho: porNome });
      continue;
    }
    paraIA.push({ id: c.id as string, nome });
  }

  // Só o resto vai pro modelo, com o material que existir.
  const viaIA: { nome: string; nicho: string; confianca: string }[] = [];
  if (paraIA.length && isOpenAIConfigured()) {
    const { data: briefings } = await supabaseAdmin.from("client_briefings")
      .select("client_id, briefing_text").in("client_id", paraIA.map((c) => c.id));
    const porCliente = new Map((briefings ?? []).map((b) => [b.client_id as string, b.briefing_text as string]));

    const { data: posts } = await supabaseAdmin.from("content_cards")
      .select("client_id, title").in("client_id", paraIA.map((c) => c.id)).limit(400);
    const titulos = new Map<string, string[]>();
    for (const p of posts ?? []) {
      const id = p.client_id as string;
      titulos.set(id, [...(titulos.get(id) ?? []), p.title as string].slice(0, 8));
    }

    for (const c of paraIA) {
      const material = [
        `Nome da empresa: ${c.nome}`,
        porCliente.get(c.id) ? `Briefing: ${porCliente.get(c.id)!.slice(0, 900)}` : "",
        titulos.get(c.id)?.length ? `Posts recentes: ${titulos.get(c.id)!.join(" · ")}` : "",
      ].filter(Boolean).join("\n");

      try {
        const resp = await chatJson<{ nicho: string; confianca: string }>({
          model: "gpt-4o-mini", schemaName: "nicho_cliente", schema: SCHEMA,
          maxTokens: 60, temperature: 0,
          system: "Você classifica o RAMO DE ATUAÇÃO de uma empresa a partir do material dado. " +
            "Responda só com a categoria. Se o material não deixar claro, use \"outro\" e confiança baixa — " +
            "chute com cara de certeza é pior que admitir que não sabe.",
          user: material,
        });
        const r = resp.ok ? resp.data : undefined;
        if (!r) continue;
        viaIA.push({ nome: c.nome, nicho: r.nicho, confianca: r.confianca });
        // Confiança baixa não grava: melhor sem nicho do que com nicho errado, porque a pauta passa
        // a falar de um ramo que não é o do cliente.
        if (r.confianca !== "baixa" && r.nicho !== "outro") {
          gravar.push({ id: c.id, nicho: r.nicho as Nicho });
        }
      } catch { /* um cliente que falha não derruba o lote */ }
    }
  }

  if (!dry && gravar.length) {
    for (const g of gravar) {
      await supabaseAdmin.from("clients").update({ nicho: ROTULO_NICHO[g.nicho] }).eq("id", g.id);
    }
  }

  const resumo: Record<string, number> = {};
  for (const d of [...decidido, ...gravar.map((g) => ({ nicho: g.nicho }))]) {
    resumo[d.nicho] = (resumo[d.nicho] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true, dry,
    total: clientes?.length ?? 0,
    ja_tinham: decidido.filter((d) => d.via === "cadastro").length,
    por_industry: decidido.filter((d) => d.via === "industry").length,
    por_nome: decidido.filter((d) => d.via === "nome").length,
    por_ia: viaIA.length,
    gravados: dry ? 0 : gravar.length,
    sem_nicho: (clientes?.length ?? 0) - decidido.length - gravar.filter((g) => !decidido.find((d) => d.nicho === g.nicho)).length,
    detalhe_ia: viaIA,
  });
}
