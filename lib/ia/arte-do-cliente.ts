// lib/ia/arte-do-cliente.ts — ARTE COM A IDENTIDADE DO CLIENTE.
// A primeira versão mandava uma miniatura e uma frase; a IA inventou bandeira, "entre em contato" e
// cores verdes (Armazém do Ferro, 14/09). Agora ela recebe o que a Lone já tem no banco:
//   1. a referência (anúncio vencedor ou anexo do pedido) — estrutura a manter
//   2. a LOGO oficial (imagem) — para não redesenhar
//   3. até 3 artes recentes que a Lone entregou — o estilo real, não descrito
//   4. paleta/tipografia/composição lidas das artes + instruções fixas da equipe
//   5. os TEXTOS EXATOS (transcritos da referência pela visão, ou do briefing)
// gpt-image-1 não tem fine-tuning: "treinar" = dar o contexto certo toda vez + medir se serviu.

import { chatJson } from "@/lib/ai/openai";
import { registrarChamadaLlm } from "@/lib/obs/llm";
import { supabaseAdmin } from "@/lib/supabase/server";
import { escolherArtes } from "@/lib/traffic/estilo-automatico";
import { candidatasDoCliente } from "@/lib/traffic/estilo-ler";
import { estiloVisualDoCliente, type EstiloVisual } from "@/lib/traffic/estilo-visual";

export interface KitDoCliente {
  clientId: string;
  nome: string;
  logoUrl: string | null;
  estilo: EstiloVisual | null;
  artesRecentes: string[];
  instrucoes: string | null;
  contato: string | null;
}

export interface PedidoArte {
  kit: KitDoCliente;
  referenciaUrl: string | null;
  /** textos que DEVEM aparecer (exatos); vazio = transcrever da referência */
  textos: string[];
  mantem: string;
  muda: string;
  /** para pedido sem referência: o que a peça é (título + briefing resumido) */
  pedido?: string | null;
  n?: number;
  qualidade?: "medium" | "high";
  origem: string;
}

const ehImagem = (u: string | null | undefined): u is string => !!u && /\.(png|jpe?g|webp)(\?|$)/i.test(u);

export async function kitDoCliente(clientId: string): Promise<KitDoCliente> {
  const [{ data: cli }, estilo, { cands }] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia, doc_logo, ia_instrucoes, company_phone, contact_phone, phone, endereco_cidade").eq("id", clientId).maybeSingle(),
    estiloVisualDoCliente(clientId),
    candidatasDoCliente(clientId),
  ]);
  let logo = ehImagem(cli?.doc_logo as string) ? (cli?.doc_logo as string) : null;
  if (!logo) {
    const { data: b } = await supabaseAdmin.from("client_brand_assets").select("url, mime").eq("client_id", clientId).eq("tipo", "logo").order("created_at", { ascending: false }).limit(3);
    logo = ((b ?? []).find((x) => (x.mime as string)?.startsWith("image/") && !(x.mime as string).includes("svg"))?.url as string) ?? null;
  }
  const tel = (cli?.company_phone as string) || (cli?.contact_phone as string) || (cli?.phone as string) || null;
  return {
    clientId, nome: (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente", logoUrl: logo, estilo,
    artesRecentes: escolherArtes(cands, 3), instrucoes: (cli?.ia_instrucoes as string)?.trim() || null,
    contato: [tel, cli?.endereco_cidade as string].filter(Boolean).join(" · ") || null,
  };
}

/** Transcreve os textos que estão NA IMAGEM (preço, produto, chamada) — para a variação não inventar. */
export async function textosDaImagem(url: string, origem: string): Promise<string[]> {
  const r = await chatJson<{ textos: string[] }>({
    model: "gpt-4o-mini", schemaName: "textos_imagem", maxTokens: 400, temperature: 0,
    schema: { type: "object", additionalProperties: false, properties: { textos: { type: "array", maxItems: 20, items: { type: "string" } } }, required: ["textos"] },
    system: "Transcreva EXATAMENTE os textos visíveis nesta peça publicitária, um item por bloco de texto (título, preço, medidas, chamada, rodapé). Não corrija, não traduza, não invente. Ignore a logo.",
    user: "Transcreva os textos da imagem anexada.", imagens: [url], origem,
  });
  return r.ok && r.data ? r.data.textos.map((t) => t.trim()).filter(Boolean) : [];
}

/** Prompt puro — testável. As imagens são numeradas na ordem em que serão anexadas. */
export function montarPromptArte(p: { kit: KitDoCliente; temReferencia: boolean; temLogo: boolean; nEstilos: number; textos: string[]; mantem: string; muda: string; pedido?: string | null }): string {
  const e = p.kit.estilo;
  let i = 0;
  const imagens: string[] = [];
  if (p.temReferencia) imagens.push(`Imagem ${++i} = REFERÊNCIA (a peça que funciona): manter estrutura, hierarquia e enquadramento.`);
  if (p.temLogo) imagens.push(`Imagem ${++i} = LOGO OFICIAL de ${p.kit.nome}: usar exatamente esta logo, sem redesenhar, sem trocar por símbolo, sem bandeira.`);
  if (p.nEstilos) imagens.push(`Imagens ${i + 1}–${i + p.nEstilos} = artes recentes que a agência entregou para ${p.kit.nome}: copiar o estilo (cores, fontes, selos, posição da logo, densidade).`);
  const identidade = e ? [
    e.paleta.length ? `Paleta: ${e.paleta.slice(0, 5).map((c) => `${c.hex} (${c.papel})`).join(", ")}.` : "",
    e.tipografia ? `Tipografia: ${e.tipografia}.` : "",
    e.composicao ? `Composição: ${e.composicao}.` : "",
    e.elementos_recorrentes.length ? `Elementos recorrentes: ${e.elementos_recorrentes.slice(0, 5).join("; ")}.` : "",
    e.o_que_evitar.length ? `Evitar: ${e.o_que_evitar.slice(0, 4).join("; ")}.` : "",
  ].filter(Boolean).join(" ") : "Sem leitura de estilo — siga as artes anexadas.";
  return [
    `Você é o designer da agência que atende ${p.kit.nome} (comércio local, Brasil). ${p.temReferencia ? "Crie UMA VARIAÇÃO da peça de referência para teste A/B." : "Crie a peça de anúncio pedida abaixo."}`,
    imagens.join("\n"),
    `IDENTIDADE DA MARCA: ${identidade}`,
    p.kit.instrucoes ? `INSTRUÇÕES FIXAS DA EQUIPE PARA ESTE CLIENTE: ${p.kit.instrucoes}` : "",
    p.pedido ? `O PEDIDO: ${p.pedido}` : "",
    p.textos.length ? `TEXTOS EXATOS que devem aparecer (em português, sem alterar, sem traduzir, sem acrescentar): ${p.textos.map((t) => `"${t}"`).join(" · ")}` : "Não escreva nenhum texto que não esteja na referência ou no pedido.",
    p.kit.contato ? `Contato do cliente (só se a referência/pedido tiver espaço para contato): ${p.kit.contato}. O canal é WhatsApp — nunca ícone de e-mail.` : "",
    p.mantem ? `MANTER EXATAMENTE: ${p.mantem}.` : "",
    p.muda ? `ALTERAR APENAS: ${p.muda}.` : "",
    `PROIBIDO: bandeiras, logos genéricas ou inventadas, texto em inglês, preço ou promessa que não esteja nos textos exatos, trocar o produto, remover a logo, mudar as cores da marca.`,
    `Formato vertical de anúncio (1024×1536), texto grande e legível, acabamento de peça publicitária profissional.`,
  ].filter(Boolean).join("\n\n");
}

async function baixar(url: string): Promise<{ buf: Buffer; tipo: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") ?? "image/png").split(";")[0];
    if (!tipo.startsWith("image/")) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), tipo };
  } catch { return null; }
}

export async function gerarArteDoCliente(p: PedidoArte): Promise<{ ok: true; imagens: Buffer[]; prompt: string; entradas: Record<string, unknown> } | { ok: false; erro: string; prompt?: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, erro: "OPENAI_API_KEY ausente" };
  const [ref, logo, ...estilos] = await Promise.all([
    p.referenciaUrl ? baixar(p.referenciaUrl) : Promise.resolve(null),
    p.kit.logoUrl ? baixar(p.kit.logoUrl) : Promise.resolve(null),
    ...p.kit.artesRecentes.filter((u) => u !== p.referenciaUrl).slice(0, 3).map(baixar),
  ]);
  const estilosOk = estilos.filter((x): x is { buf: Buffer; tipo: string } => !!x);
  if (!ref && !estilosOk.length) return { ok: false, erro: "Sem referência nem artes do cliente para a IA se basear." };
  let textos = p.textos;
  if (!textos.length && p.referenciaUrl) textos = await textosDaImagem(p.referenciaUrl, p.origem);
  const prompt = montarPromptArte({ kit: p.kit, temReferencia: !!ref, temLogo: !!logo, nEstilos: estilosOk.length, textos, mantem: p.mantem, muda: p.muda, pedido: p.pedido });
  const entradas = { referencia: !!ref, logo: !!logo, estilos: estilosOk.length, textos, estiloLido: !!p.kit.estilo, instrucoes: !!p.kit.instrucoes };

  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  const anexar = (x: { buf: Buffer; tipo: string }, nome: string) => fd.append("image[]", new Blob([new Uint8Array(x.buf)], { type: x.tipo }), nome);
  if (ref) anexar(ref, "referencia.png");
  if (logo) anexar(logo, "logo.png");
  estilosOk.forEach((x, k) => anexar(x, `estilo-${k + 1}.png`));
  fd.append("prompt", prompt);
  fd.append("n", String(Math.min(3, Math.max(1, p.n ?? 2))));
  fd.append("size", "1024x1536");
  fd.append("quality", p.qualidade ?? "medium");
  fd.append("input_fidelity", "high"); // preserva logo e detalhes das imagens de entrada
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(170_000) });
    const json = await r.json().catch(() => null) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null;
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: Date.now() - t0, ok: r.ok, erro: r.ok ? null : json?.error?.message ?? `HTTP ${r.status}`, origem: p.origem, tipo: "image" });
    if (!r.ok || !json?.data?.length) return { ok: false, erro: `OpenAI: ${json?.error?.message ?? `HTTP ${r.status}`}`, prompt };
    return { ok: true, imagens: json.data.filter((d) => d.b64_json).map((d) => Buffer.from(d.b64_json as string, "base64")), prompt, entradas };
  } catch (err) {
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: Date.now() - t0, ok: false, erro: err instanceof Error ? err.message : "erro", origem: p.origem, tipo: "image" });
    return { ok: false, erro: err instanceof Error ? err.message : "erro de conexão", prompt };
  }
}

const PUB = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://painel.lonemidia.com/supabase").replace(/\/$/, "")}/storage/v1/object/public/brand-assets`;

/** Guarda as imagens no storage e a geração em ia_geracoes. Devolve urls + id da geração. */
export async function guardarGeracao(p: { clientId: string; imagens: Buffer[]; prompt: string; entradas: Record<string, unknown>; designRequestId?: string | null; adId?: string | null; origem: string; qualidade: string; ms: number; por: string }): Promise<{ urls: string[]; geracaoId: string | null }> {
  const urls: string[] = [];
  const stamp = Date.now().toString(36);
  for (const [i, img] of p.imagens.entries()) {
    const path = `${p.clientId}/ia/${p.designRequestId ?? p.adId ?? "livre"}-${stamp}-${i + 1}.png`;
    const { error } = await supabaseAdmin.storage.from("brand-assets").upload(path, img, { contentType: "image/png", upsert: true });
    if (!error) urls.push(`${PUB()}/${path}`);
  }
  const { data } = await supabaseAdmin.from("ia_geracoes").insert({ client_id: p.clientId, design_request_id: p.designRequestId ?? null, ad_id: p.adId ?? null, origem: p.origem, prompt: p.prompt, entradas: p.entradas, urls, qualidade: p.qualidade, ms: p.ms, created_by: p.por }).select("id").single();
  return { urls, geracaoId: (data?.id as string) ?? null };
}
