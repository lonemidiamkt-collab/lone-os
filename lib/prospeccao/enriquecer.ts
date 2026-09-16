// lib/prospeccao/enriquecer.ts — "essa empresa vale o tempo da Lone?" (§8).
//
// Pipeline por prospect: CNPJ (BrasilAPI) → endereço → distância → Instagram (Business Discovery)
// → WhatsApp (verifica sem mandar) → busca web complementar → decisor → diagnóstico (IA, só com
// fatos) → score → estágio. Cada campo lembra de onde veio (`fontes`); o que não confirmou
// fica null — "NÃO CONFIRMADO" é uma resposta válida (§31).

import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { metaProvider } from "@/lib/radar/provider";
import type { Diagnostico, PresencaDigital, ProspectRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { calcularScore, segmentoAderente } from "./score";
import { consolidarDecisor } from "./decisor";
import { verificarWhatsapp } from "./envio";
import { pesquisarEmpresa, notaGoogle, numeroBr, cidadeLimpa } from "./providers/web-search";
import { cnpjLimpo, distanciaKm, instagramHandle, siteNormalizado, telefoneDigitos, nomeProprio } from "./normalizar";
import { transicionar, registrarEvento } from "./maquina";
import { atualizarProspect, ehClienteAtual } from "./db";

const UA = "LoneOS-SDR/1.0 (lonemidiamkt@gmail.com)";
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── CNPJ ───────────────────────────────────────────────────────────────────

export interface DadosCnpj {
  razao_social?: string; nome_fantasia?: string; cnae_fiscal?: number | string; cnae_fiscal_descricao?: string;
  porte?: string; capital_social?: number; data_inicio_atividade?: string; descricao_situacao_cadastral?: string;
  logradouro?: string; numero?: string; complemento?: string; bairro?: string; municipio?: string; uf?: string; cep?: string;
  ddd_telefone_1?: string; ddd_telefone_2?: string; email?: string;
  qsa?: { nome_socio?: string; qualificacao_socio?: string }[];
}

export async function consultarCnpj(cnpj: string): Promise<{ ok: boolean; data?: DadosCnpj; error?: string }> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return { ok: false, error: "CNPJ não encontrado" };
    if (!res.ok) return { ok: false, error: `BrasilAPI ${res.status}` };
    return { ok: true, data: (await res.json()) as DadosCnpj };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}

// ─── Geocodificação ─────────────────────────────────────────────────────────

const cacheGeo = new Map<string, { lat: number; lng: number } | null>();

export async function geocodificar(consulta: string): Promise<{ lat: number; lng: number } | null> {
  const k = consulta.toLowerCase().trim();
  if (cacheGeo.has(k)) return cacheGeo.get(k)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(consulta)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(12_000) });
    const j = (await res.json().catch(() => [])) as { lat?: string; lon?: string }[];
    const hit = j[0];
    const out = hit?.lat && hit?.lon ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
    cacheGeo.set(k, out);
    await dormir(1100); // política do Nominatim: 1 req/s
    return out;
  } catch { cacheGeo.set(k, null); return null; }
}

// ─── Instagram ──────────────────────────────────────────────────────────────

async function lerInstagram(handle: string): Promise<{ ok: boolean; presenca?: Partial<PresencaDigital>; error?: string }> {
  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").maybeSingle();
  const token = cfg?.value as string | undefined;
  if (!token) return { ok: false, error: "meta_token ausente" };
  const { data: contaBase } = await supabaseAdmin.from("clients").select("ig_business_account_id")
    .not("ig_business_account_id", "is", null).neq("ig_business_account_id", "").limit(1).maybeSingle();
  const igBase = contaBase?.ig_business_account_id as string | undefined;
  if (!igBase) return { ok: false, error: "nenhuma conta IG base" };
  try {
    const r = await metaProvider(token, igBase).lerPerfil(handle, 25);
    if (!r) return { ok: false, error: "perfil não é comercial ou não existe" };
    const midias = r.midias.filter((m) => m.postedAt);
    const datas = midias.map((m) => new Date(m.postedAt!).getTime()).sort((a, b) => a - b);
    const spanDias = datas.length >= 2 ? Math.max(1, (datas[datas.length - 1] - datas[0]) / 86_400_000) : null;
    const postsSemana = spanDias ? Math.round((midias.length / spanDias) * 7 * 10) / 10 : null;
    const reels = r.midias.filter((m) => m.mediaType === "VIDEO").length;
    const eng = r.midias.length && r.perfil.followers
      ? Math.round((r.midias.reduce((s, m) => s + m.likes + m.comments, 0) / r.midias.length / r.perfil.followers) * 10000) / 100
      : null;
    return { ok: true, presenca: {
      instagram_followers: r.perfil.followers, instagram_posts: r.perfil.mediaCount, posts_por_semana: postsSemana,
      pct_reels: r.midias.length ? Math.round((reels / r.midias.length) * 100) : null, engajamento_medio: eng,
      ultimo_post_em: datas.length ? new Date(datas[datas.length - 1]).toISOString() : null, lido_em: new Date().toISOString(),
    } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falhou" };
  }
}

// ─── Diagnóstico (IA, só com fatos) ─────────────────────────────────────────

const SISTEMA_DIAG = `Você é o analista comercial da Lone Mídia, agência de marketing de Araruama/RJ especializada em empresas da construção civil (lojas de material de construção, pisos, tintas, telhas, madeireiras etc.). A Lone faz conteúdo para redes sociais, anúncios na Meta e geração de demanda pelo WhatsApp.

Receberá os FATOS pesquisados sobre uma empresa. Produza um mini diagnóstico comercial usando SOMENTE esses fatos. Regras:
- Não invente nada. Se um dado não está nos fatos, não o mencione. Nada de "provavelmente", "deve ter".
- "oportunidades": 2 a 5 frases curtas, cada uma ancorada em um fato (ex.: "1.240 avaliações no Google e Instagram com 3 posts/semana, mas sem Reels").
- "por_que_prospectar": 1 parágrafo (até 300 caracteres) explicando por que vale o tempo da Lone.
- "abordagem_recomendada": 1 frase com o ângulo da conversa (ex.: "transformar as ofertas estáticas em fluxo constante de WhatsApp").
- "gancho": UMA frase curta, em tom de conversa, que o vendedor pode dizer ao decisor citando um fato verificado ("Vi que vocês têm duas lojas e mais de 600 avaliações no Google"). Se não houver fato bom o bastante, null.
- Nunca mencione faturamento, nem estimativas de faturamento.`;

async function gerarDiagnostico(p: ProspectRow, fatos: string[]): Promise<Diagnostico | null> {
  if (!isOpenAIConfigured()) return null;
  const r = await chatJson<Diagnostico>({
    model: "gpt-4o", system: SISTEMA_DIAG, schemaName: "diagnostico_prospect",
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        oportunidades: { type: "array", items: { type: "string" } },
        por_que_prospectar: { type: "string" },
        abordagem_recomendada: { type: "string" },
        gancho: { type: ["string", "null"] },
      },
      required: ["oportunidades", "por_que_prospectar", "abordagem_recomendada", "gancho"],
    },
    user: `EMPRESA: ${p.nome}\nSEGMENTO: ${p.segmento ?? "—"}\nCIDADE: ${p.cidade ?? "—"}/${p.uf ?? "—"}\n\nFATOS PESQUISADOS:\n${fatos.map((f) => `- ${f}`).join("\n") || "- (poucos fatos)"}`,
    maxTokens: 600, temperature: 0.3, origem: "prospeccao:diagnostico",
  });
  if (!r.ok || !r.data) return null;
  const d = r.data;
  if (/fatura/i.test(`${d.por_que_prospectar} ${d.gancho ?? ""} ${d.oportunidades.join(" ")}`)) {
    d.gancho = null;
    d.por_que_prospectar = d.por_que_prospectar.replace(/[^.]*fatura[^.]*\./gi, "").trim();
  }
  return { oportunidades: d.oportunidades.slice(0, 5), por_que_prospectar: d.por_que_prospectar, abordagem_recomendada: d.abordagem_recomendada, gancho: d.gancho };
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export interface ResumoEnriquecimento { ok: boolean; etapas: string[]; erros: string[]; prospect: ProspectRow }

export async function enriquecerProspect(pIn: ProspectRow, cfg: ProspectConfig, o: { comWeb?: boolean; comInstagram?: boolean; comWhatsapp?: boolean } = {}): Promise<ResumoEnriquecimento> {
  const etapas: string[] = [], erros: string[] = [];
  const patch: Record<string, unknown> = {};
  const fontes: Record<string, string> = { ...(pIn.fontes ?? {}) };
  const fatos: string[] = [...((pIn.presenca as { sinais_descoberta?: string[] } | null)?.sinais_descoberta ?? [])];
  let p = pIn;
  // Cliente da Lone (tabela clients ou lista de exclusão) não gasta pesquisa nem IA: sai já.
  const cli = await ehClienteAtual({ nome: p.nome, instagram: p.instagram, telefone: p.telefone, cidade: p.cidade });
  if (cli.sim) {
    if (p.estagio !== "fora_icp") p = await transicionar(p, { para: "fora_icp", motivo: `Não abordar: ${cli.texto}`, patch: { motivo_perda: cli.texto } });
    return { ok: true, etapas: [cli.motivo ?? "excluido"], erros: [], prospect: p };
  }
  let qsa: { nome: string; qualificacao?: string | null }[] = [];
  let webNome: string | null = null, webCargo: string | null = null, webFonte: string | null = null;

  // 1) Busca web complementar (pode revelar o CNPJ antes da BrasilAPI).
  if (o.comWeb !== false && isOpenAIConfigured()) {
    const w = await pesquisarEmpresa({ nome: p.nome, cidade: p.cidade, uf: p.uf, instagram: p.instagram, site: p.site }, process.env.OPENAI_API_KEY as string);
    if (w) {
      etapas.push("web");
      const marca = (k: string, v: unknown) => { if (v !== null && v !== undefined && v !== "" && (p as unknown as Record<string, unknown>)[k] == null) { patch[k] = v; fontes[k] = "web"; } };
      const nota = notaGoogle(w.google_nota), aval = numeroBr(w.google_avaliacoes);
      if (nota !== null) { patch.google_nota = nota; fontes.google_nota = "web (Google)"; }
      if (aval !== null) { patch.google_avaliacoes = Math.round(aval); fontes.google_avaliacoes = "web (Google)"; }
      marca("google_maps_url", w.google_maps_url);
      if (typeof w.unidades === "number" && w.unidades >= 1) { patch.unidades = Math.round(w.unidades); fontes.unidades = "web"; }
      marca("instagram", instagramHandle(w.instagram));
      marca("site", siteNormalizado(w.site));
      // Celular achado na web vence o fixo que veio da descoberta (o gate exige WhatsApp).
      const cel = telefoneDigitos(w.whatsapp);
      if (cel && cel.length === 13 && cel[4] === "9") { patch.telefone = cel; patch.whatsapp_jid = `${cel}@s.whatsapp.net`; patch.whatsapp_verificado = null; fontes.telefone = "web (WhatsApp)"; }
      else marca("telefone", telefoneDigitos(w.telefone));
      marca("endereco", w.endereco);
      if (!p.cnpj && cnpjLimpo(w.cnpj)) { patch.cnpj = cnpjLimpo(w.cnpj); fontes.cnpj = "web"; }
      if (w.proprietario) { webNome = w.proprietario; webCargo = w.proprietario_cargo ?? null; webFonte = w.proprietario_fonte ?? null; }
      if (Array.isArray(w.fatos)) fatos.push(...w.fatos.map(String).slice(0, 5));
      patch.presenca = { ...(p.presenca ?? {}), anuncia: typeof w.anuncia === "boolean" ? w.anuncia : (p.presenca?.anuncia ?? null), anuncia_fonte: w.anuncia_fonte ?? p.presenca?.anuncia_fonte ?? null, fatos: fatos.slice(0, 10) };
      if (typeof w.anuncia === "boolean") fontes.anuncia = w.anuncia_fonte ?? "web";
      if (Array.isArray(w.fontes)) fontes._urls = w.fontes.slice(0, 6).join(" ");
    } else erros.push("web: sem resultado");
  }
  const cnpj = (patch.cnpj as string | undefined) ?? p.cnpj;
  const telefoneAtual = (patch.telefone as string | undefined) ?? p.telefone;
  const instagramAtual = (patch.instagram as string | undefined) ?? p.instagram;

  // 2) CNPJ
  if (cnpj) {
    const r = await consultarCnpj(cnpj);
    if (r.ok && r.data) {
      const d = r.data;
      etapas.push("cnpj");
      patch.dados_cnpj = d;
      if (d.razao_social) { patch.razao_social = d.razao_social; fontes.razao_social = "BrasilAPI"; }
      if (d.cnae_fiscal) { patch.cnae = String(d.cnae_fiscal).replace(/\D/g, ""); patch.cnae_descricao = d.cnae_fiscal_descricao ?? null; fontes.cnae = "BrasilAPI"; }
      if (d.porte) { patch.porte = d.porte; fontes.porte = "BrasilAPI"; }
      if (typeof d.capital_social === "number") { patch.capital_social = d.capital_social; fontes.capital_social = "BrasilAPI"; }
      if (d.data_inicio_atividade) { patch.abertura = d.data_inicio_atividade; fontes.abertura = "BrasilAPI"; }
      if (d.email && !p.email) { patch.email = d.email.toLowerCase(); fontes.email = "BrasilAPI"; }
      const end = [d.logradouro, d.numero, d.bairro].filter(Boolean).join(", ");
      if (end && !p.endereco) { patch.endereco = `${end}${d.municipio ? ` — ${nomeProprio(d.municipio)}` : ""}${d.uf ? `/${d.uf}` : ""}`; fontes.endereco = "BrasilAPI"; }
      if (d.cep) patch.cep = d.cep.replace(/\D/g, "");
      if (d.municipio && (!p.cidade || /[\/,-]\s*[A-Z]{2}\s*$/i.test(p.cidade))) { patch.cidade = nomeProprio(d.municipio); fontes.cidade = "BrasilAPI"; }
      else if (p.cidade) patch.cidade = cidadeLimpa(p.cidade, p.cidade);
      if (d.uf) { patch.uf = d.uf; fontes.uf = "BrasilAPI"; }
      if (!telefoneAtual && d.ddd_telefone_1) { const t = telefoneDigitos(d.ddd_telefone_1); if (t) { patch.telefone = t; fontes.telefone = "BrasilAPI"; } }
      qsa = (d.qsa ?? []).filter((s) => s.nome_socio).map((s) => ({ nome: s.nome_socio!, qualificacao: s.qualificacao_socio ?? null }));
      if (d.descricao_situacao_cadastral && !/ATIVA/i.test(d.descricao_situacao_cadastral)) fatos.push(`situação cadastral: ${d.descricao_situacao_cadastral}`);
      if (d.porte) fatos.push(`porte ${d.porte}`);
      if (d.data_inicio_atividade) fatos.push(`abertura em ${d.data_inicio_atividade}`);
      if (qsa.length) fatos.push(`sócios: ${qsa.map((s) => nomeProprio(s.nome)).join(", ")}`);
    } else erros.push(`cnpj: ${r.error}`);
  }

  // 3) Geocodificação + distância
  const endereco = (patch.endereco as string | undefined) ?? p.endereco;
  const cidade = (patch.cidade as string | undefined) ?? p.cidade;
  const uf = (patch.uf as string | undefined) ?? p.uf ?? cfg.base.uf;
  if (p.lat === null || p.lng === null || patch.endereco) {
    const geo = (endereco ? await geocodificar(`${endereco}, ${cidade ?? ""}, ${uf}, Brasil`) : null) ?? (cidade ? await geocodificar(`${cidade}, ${uf}, Brasil`) : null);
    if (geo) {
      patch.lat = geo.lat; patch.lng = geo.lng; fontes.lat = endereco ? "OpenStreetMap (endereço)" : "OpenStreetMap (centro da cidade)";
      etapas.push("geo");
    } else erros.push("geo: não localizou");
  }
  const lat = (patch.lat as number | undefined) ?? p.lat, lng = (patch.lng as number | undefined) ?? p.lng;
  if (typeof lat === "number" && typeof lng === "number") {
    const km = distanciaKm(cfg.base.lat, cfg.base.lng, lat, lng);
    patch.distancia_km = km;
    patch.modalidade_preferida = km <= cfg.raio_visita_km ? "visita" : "online";
  }

  // 4) Instagram
  if (o.comInstagram !== false && instagramAtual) {
    const ig = await lerInstagram(instagramAtual);
    if (ig.ok && ig.presenca) {
      etapas.push("instagram");
      patch.presenca = { ...((patch.presenca as PresencaDigital | undefined) ?? p.presenca ?? {}), ...ig.presenca };
      fontes.instagram_followers = "Meta Business Discovery";
      fatos.push(`Instagram @${instagramAtual}: ${ig.presenca.instagram_followers} seguidores, ${ig.presenca.posts_por_semana ?? "?"} posts/semana, ${ig.presenca.pct_reels ?? "?"}% Reels`);
    } else erros.push(`instagram: ${ig.error}`);
  }

  // 5) WhatsApp (verifica, não manda)
  if (o.comWhatsapp !== false && telefoneAtual) {
    const v = await verificarWhatsapp([telefoneAtual]);
    if (v.length) {
      etapas.push("whatsapp");
      patch.whatsapp_verificado = v[0].existe;
      patch.whatsapp_jid = v[0].jid ?? (v[0].existe ? `${telefoneAtual}@s.whatsapp.net` : null);
      fontes.whatsapp_verificado = "Evolution";
    }
  }

  // 6) Decisor
  const dec = consolidarDecisor({ qsa, webNome, webCargo, webFonte });
  if (dec.nome && (!p.decisor_nome || !p.decisor_fontes?.includes("conversa"))) {
    patch.decisor_nome = dec.nome; patch.decisor_cargo = dec.cargo; patch.decisor_confianca = dec.confianca; patch.decisor_fontes = dec.fontes;
    fontes.decisor = dec.fontes.join(" + ");
    etapas.push("decisor");
  }
  if (dec.alternativas.length) patch.dados_cnpj = { ...((patch.dados_cnpj as object | undefined) ?? p.dados_cnpj ?? {}), decisor_alternativas: dec.alternativas };

  // 7) Diagnóstico
  const pParcial = { ...p, ...patch } as ProspectRow;
  if (pParcial.google_avaliacoes) fatos.push(`Google: ${pParcial.google_nota ?? "?"} estrelas, ${pParcial.google_avaliacoes} avaliações`);
  if ((pParcial.unidades ?? 0) >= 2) fatos.push(`${pParcial.unidades} unidades`);
  if (pParcial.distancia_km !== null && pParcial.distancia_km !== undefined) fatos.push(`${pParcial.distancia_km} km de Araruama`);
  if (pParcial.site) fatos.push(`site: ${pParcial.site}`);
  if (pParcial.presenca?.anuncia === true) fatos.push(`anuncia (${pParcial.presenca.anuncia_fonte ?? "fonte web"})`);
  const diag = await gerarDiagnostico(pParcial, Array.from(new Set(fatos)));
  if (diag) { patch.diagnostico = diag; etapas.push("diagnostico"); } else if (isOpenAIConfigured()) erros.push("diagnóstico: IA não respondeu");

  // 8) Score
  const pComTudo = { ...p, ...patch } as ProspectRow;
  const sc = calcularScore(pComTudo, cfg);
  patch.score = sc.score; patch.classe = sc.classe; patch.score_detalhe = sc.detalhe; patch.faturamento_sinal = sc.faturamento;
  patch.fontes = fontes;

  try {
    p = await atualizarProspect(p.id, patch);
  } catch (err) {
    // CNPJ já existe em outra linha = a mesma empresa descoberta duas vezes com nomes diferentes.
    if (err instanceof Error && /uq_prospects_cnpj|duplicate key/.test(err.message)) {
      p = await transicionar(p, { para: "fora_icp", motivo: `Duplicado: o CNPJ ${patch.cnpj ?? p.cnpj} já está em outro prospect`, patch: { motivo_perda: "duplicado (mesmo CNPJ)" } });
      return { ok: true, etapas: ["duplicado"], erros: [], prospect: p };
    }
    throw err;
  }
  await registrarEvento(p.id, { tipo: "enriquecido", motivo: `etapas: ${etapas.join(", ") || "nenhuma"}${erros.length ? ` · falhas: ${erros.join("; ")}` : ""}`, responsavel: "SDR_AI", detalhe: { score: sc.score, classe: sc.classe } });

  // 9) Estágio
  if (p.estagio === "descoberto" || p.estagio === "enriquecido" || p.estagio === "fora_icp" || p.estagio === "icp_aprovado") {
    const seg = segmentoAderente(p, cfg.segmentos);
    const ufOk = !!p.uf && cfg.uf_permitidas.map((u) => u.toUpperCase()).includes(p.uf.toUpperCase());
    if (p.estagio === "descoberto") p = await transicionar(p, { para: "enriquecido", motivo: "Pesquisa concluída" });
    if (!seg || !ufOk || sc.classe === "NP") {
      const motivo = !seg ? "segmento fora do ICP" : !ufOk ? `fora de ${cfg.uf_permitidas.join("/")}` : `score ${sc.score} (não prioritário)`;
      if (p.estagio !== "fora_icp") p = await transicionar(p, { para: "fora_icp", motivo, patch: { motivo_perda: motivo } });
    } else if (sc.score >= cfg.score.minimo) {
      if (p.estagio !== "icp_aprovado") p = await transicionar(p, { para: p.estagio === "fora_icp" ? "enriquecido" : "icp_aprovado", motivo: `Lead ${sc.classe} (${sc.score})` });
      if (p.estagio === "enriquecido") p = await transicionar(p, { para: "icp_aprovado", motivo: `Lead ${sc.classe} (${sc.score})` });
    } else {
      // Lead C: não entra na fila automática; fica visível para o Roberto promover.
      if (p.estagio === "fora_icp") p = await transicionar(p, { para: "enriquecido", motivo: `reprocessado: lead ${sc.classe} (${sc.score})` });
      p = await atualizarProspect(p.id, { next_action_type: "AGUARDAR_REVISAO", next_action_at: new Date().toISOString(), next_action_owner: "ROBERTO", next_action_reason: `Lead ${sc.classe} (${sc.score}): abaixo do mínimo ${cfg.score.minimo} — promover à mão se fizer sentido` });
    }
  }
  return { ok: erros.length === 0, etapas, erros, prospect: p };
}
