export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { datasNaJanela, tagsDoNicho, dataEncaixa, formatDataCurta, type DataResolvida } from "@/lib/cs/datas";

// POST /api/system/cs-datas — RADAR DE DATAS comemorativas: toda segunda, olha as datas dos
// próximos 2-8 dias, cruza com a carteira (nicho) e propõe 1 ideia de post por cliente que encaixa,
// no grupo interno. Suggest-only: o time decide e pede "Lone, cria uma demanda..." pra virar card.
// Cron sugerido: seg 11h30 UTC (= 8h30 BRT, depois do bom-dia). ?preview=1 monta sem postar.
const DATAS_LIVE = true;
const MAX_DATAS_POR_RUN = 3;    // datas por rodada (peso maior primeiro)
const MAX_CLIENTES_POR_DATA = 10; // ideias por data (nicho primeiro, depois gerais)

const IDEIAS_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["ideias"],
  properties: {
    ideias: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["cliente", "ideia"],
        properties: { cliente: { type: "string" }, ideia: { type: "string" } },
      },
    },
  },
};

const IDEIAS_SYSTEM = `Você é social media sênior de agência (Brasil). Recebe UMA data comemorativa
e uma lista de clientes (nome + nicho). Pra CADA cliente, proponha UMA ideia de post pra essa data:
CONCRETA e específica do nicho dele (não genérica), em 1 frase (máx ~20 palavras), em PT-BR.
NÃO invente preço, oferta ou condição. Datas sensíveis (Setembro Amarelo, Consciência Negra):
conteúdo de respeito/conscientização, NUNCA venda. Clientes de saúde/farmácia/estética: linguagem
responsável — sem promessa de cura, resultado ou "alívio garantido", e nada de oferta de medicamento.
Responda APENAS no JSON do schema, repetindo o nome do cliente EXATAMENTE como veio.`;

const normNomeIdeia = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const now = spNow();
  const janela = datasNaJanela(now, 2, 8); // 2-8 dias à frente = tempo de produzir a arte
  if (janela.length === 0) return NextResponse.json({ ok: true, skip: "sem datas na janela", janela: [] });

  const { data: clientsData } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, nicho, industry, assigned_social")
    .or("active.is.null,active.eq.true").not("assigned_social", "is", null).not("name", "ilike", "%(teste)%");
  const clientes = (clientsData ?? []).map((c) => ({
    nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
    nicho: (c.nicho as string) || (c.industry as string) || "",
    social: (c.assigned_social as string) || null,
    tags: tagsDoNicho((c.nicho as string) || (c.industry as string)),
  }));

  // Peso maior primeiro; empate → mais próxima primeiro.
  const datas = [...janela].sort((a, b) => b.peso - a.peso || a.data.getTime() - b.data.getTime()).slice(0, MAX_DATAS_POR_RUN);
  const blocos: string[] = [];
  const detalhe: Array<Record<string, unknown>> = [];

  for (const d of datas) {
    // Nicho específico primeiro (matching mais forte), depois os gerais completam o cap.
    const deNicho = clientes.filter((c) => !d.tags.includes("geral") ? dataEncaixa(d, c.tags) : d.tags.some((t) => t !== "geral" && c.tags.includes(t)));
    const gerais = d.tags.includes("geral") ? clientes.filter((c) => !deNicho.includes(c)) : [];
    const alvo = [...deNicho, ...gerais].slice(0, MAX_CLIENTES_POR_DATA);
    if (alvo.length === 0) { detalhe.push({ data: d.nome, clientes: 0 }); continue; }

    const r = await chatJson<{ ideias: { cliente: string; ideia: string }[] }>({
      model: "gpt-4o-mini", schemaName: "cs_datas_ideias", schema: IDEIAS_SCHEMA,
      maxTokens: 800, temperature: 0.7, system: IDEIAS_SYSTEM,
      user: [
        `Data: ${d.nome}${d.obs ? ` — dica: ${d.obs}` : ""}`,
        `Clientes:`,
        ...alvo.map((c) => `- ${c.nome}${c.nicho ? ` (${c.nicho})` : ""}`),
      ].join("\n"),
    });
    const ideias = r.ok && r.data ? r.data.ideias : [];
    const linhas = alvo.map((c) => {
      // Match tolerante a acento/pontuação: o modelo às vezes ecoa o nome com grafia diferente.
      const i = ideias.find((x) => normNomeIdeia(x.cliente) === normNomeIdeia(c.nome));
      return i ? `• *${c.nome}:* ${i.ideia}` : null;
    }).filter(Boolean) as string[];
    if (linhas.length === 0) { detalhe.push({ data: d.nome, clientes: alvo.length, ideias: 0, erro: r.error }); continue; }

    blocos.push([`🗓️ ${formatDataCurta(d)}${d.obs ? `\n_${d.obs}_` : ""}`, ...linhas].join("\n"));
    detalhe.push({ data: d.nome, clientes: alvo.length, ideias: linhas.length, cortados: Math.max(0, deNicho.length + gerais.length - MAX_CLIENTES_POR_DATA) });
  }

  // Datas GRANDES (peso 3) no horizonte de 9-21 dias: aviso antecipado SEM ideias (planejar já).
  const grandesNoHorizonte = datasNaJanela(now, 9, 21).filter((d) => d.peso === 3);
  const avisoGrandes = grandesNoHorizonte.length
    ? `\n\n⏳ *Planeja já:* ${grandesNoHorizonte.map((d) => formatDataCurta(d)).join(" · ")} — data grande, arte não se faz na véspera!`
    : "";

  const descartadas = janela.length - datas.length;
  const msg = blocos.length || grandesNoHorizonte.length
    ? [
        `📅 *Radar de datas — vem coisa boa aí!*`,
        ``,
        blocos.join("\n\n") + avisoGrandes,
        ``,
        `Curtiu alguma? Me fala "Lone, cria uma demanda na [cliente] sobre [tema]" que eu já abro o card. 😉${descartadas > 0 ? `\n_(+${descartadas} data${descartadas > 1 ? "s" : ""} menor${descartadas > 1 ? "es" : ""} na janela — "Lone, que datas vêm aí?" pra ver tudo)_` : ""}`,
      ].join("\n")
    : "";

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (DATAS_LIVE && internalJid && !previewOnly && msg) {
    const r = await csSendGroupText(internalJid, msg, undefined, { origem: "cs-datas", destino: "interno" });
    postada = r.ok;
    if (!r.ok) console.error("[cs-datas] post falhou:", r.error);
  }

  console.log(`[cs-datas] janela=${janela.length} datas=${datas.length} blocos=${blocos.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: DATAS_LIVE, janela: janela.map((d: DataResolvida) => d.nome), detalhe, postada, preview: msg || "(nada pra sugerir)" });
}
