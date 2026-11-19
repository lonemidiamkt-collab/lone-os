// lib/integracoes/verificar-server.ts — confere AGORA cada aplicativo que o Lone OS usa (Sistema › Integrações).
// Só servidor. Cada checagem roda em paralelo, com tempo limite, e nunca derruba as outras: quem falha vira
// cartão "erro" com o motivo — nunca "ok" por falta de resposta. A leitura do resultado é lib/integracoes/catalogo.ts.
// Nenhuma checagem mexe em nada: só leitura (estado da conexão, um GET de teste, o registro das chamadas).

import { supabaseAdmin } from "@/lib/supabase/server";
import { estadoGoogle } from "@/lib/prospeccao/google";
import { testarDrive } from "@/lib/drive/google-drive";
import { estadoMarketing } from "@/lib/google/marketing-auth";
import { testarAds } from "@/lib/google/ads-api";
import { testarPerfil } from "@/lib/google/perfil-api";
import { testarAnalytics } from "@/lib/google/analytics-api";
import { temColunasGoogle } from "@/lib/google/colunas";
import { lerConexao } from "@/lib/trafego/anuncios-server";
import { situacaoDaConfig } from "@/lib/contracts/d4sign-config";
import { academyConfigurada } from "@/lib/academy/cliente";
import { ancoraLigada, lerEstadosNoAncora } from "@/lib/integracoes/ancora-server";
import { temTabelasCrm } from "@/lib/crm-externo/servidor";
import { ROTULO_PROVEDOR, type ProvedorCrm } from "@/lib/crm-externo/metricas";
import { iaFora, type FalhaIa } from "@/lib/ia/saude-ia";
import {
  ordenar, estadoGoogleIntegracao, estadoGoogleMarketingIntegracao, estadoMetaIntegracao, estadoWhatsappIntegracao, estadoIaIntegracao,
  estadoD4signIntegracao, estadoServicoIntegracao, base as _base,
  type EstadoIntegracao, type IdIntegracao, type LinhaWhatsapp,
} from "./catalogo";

const DIA = 86_400_000;

/** Roda uma checagem; se ela lançar, o cartão sai como erro com o motivo (nunca some, nunca vira ok). */
async function seguro(id: IdIntegracao, f: () => Promise<EstadoIntegracao>): Promise<EstadoIntegracao> {
  try {
    return await f();
  } catch (e) {
    return { ..._base(id), situacao: "erro", detalhes: [], resumo: `Não consegui conferir agora: ${e instanceof Error ? e.message : "erro inesperado"}.` };
  }
}

async function alcancar(url: string, init: RequestInit = {}, ms = 8000): Promise<{ ok: boolean; status: number | null; erro: string | null; corpo: string }> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), cache: "no-store" });
    const corpo = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, erro: r.ok ? null : `respondeu ${r.status}`, corpo };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "não respondeu a tempo" : e.message) : "sem resposta";
    return { ok: false, status: null, erro: msg, corpo: "" };
  }
}

async function google(): Promise<EstadoIntegracao> {
  const g = await estadoGoogle();
  const testa = g.conectado && g.drive !== false;
  const api = testa ? await testarDrive() : null;
  return estadoGoogleIntegracao({ configurado: g.configurado, conectado: g.conectado, email: g.email ?? null, drive: g.drive, driveApi: api });
}

async function googleMarketing(): Promise<EstadoIntegracao> {
  const e = await estadoMarketing();
  const [ads, perfil, analytics] = await Promise.all([
    e.conectado && e.ads ? testarAds() : Promise.resolve(null),
    e.conectado && e.perfil ? testarPerfil() : Promise.resolve(null),
    e.conectado && e.analytics ? testarAnalytics() : Promise.resolve(null),
  ]);
  let vinculados = 0, comErro = 0, ultimaLeitura: string | null = null;
  if (await temColunasGoogle()) {
    const { count } = await supabaseAdmin.from("clients").select("id", { count: "exact", head: true })
      .neq("active", false).or("google_ads_customer_id.not.is.null,google_perfil_local.not.is.null");
    vinculados = count ?? 0;
    const { data } = await supabaseAdmin.from("google_sincronia").select("ads_erro, perfil_erro, ads_sincronizado_em, perfil_sincronizado_em");
    for (const l of (data ?? []) as { ads_erro: string | null; perfil_erro: string | null; ads_sincronizado_em: string | null; perfil_sincronizado_em: string | null }[]) {
      if ((l.ads_erro && !l.ads_erro.startsWith("Parcial")) || (l.perfil_erro && !l.perfil_erro.startsWith("Parcial"))) comErro++;
      for (const t of [l.ads_sincronizado_em, l.perfil_sincronizado_em]) if (t && (!ultimaLeitura || t > ultimaLeitura)) ultimaLeitura = t;
    }
  }
  const t = (r: Awaited<ReturnType<typeof testarAds>> | null) => (r ? (r.ok ? { ok: true, contas: r.dados } : { ok: false, erro: r.erro }) : null);
  return estadoGoogleMarketingIntegracao({
    configurado: e.configurado, conectado: e.conectado, email: e.email, ads: e.ads, perfil: e.perfil, analytics: e.analytics,
    testeAds: t(ads), testePerfil: t(perfil), testeAnalytics: t(analytics), vinculados, comErro, ultimaLeitura,
  });
}

async function meta(): Promise<EstadoIntegracao> {
  const c = await lerConexao();
  return estadoMetaIntegracao({ estado: c.estado, expiraEm: c.expiraEm, agora: Date.now() });
}

async function linhaEvolution(rotulo: string, instancia: string | undefined, chave: string | undefined, extra?: () => Promise<string | null>): Promise<LinhaWhatsapp> {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  if (!url || !instancia || !chave) return { rotulo, configurada: false, estado: null };
  const r = await alcancar(`${url}/instance/connectionState/${encodeURIComponent(instancia)}`, { headers: { apikey: chave } });
  if (!r.ok) return { rotulo, configurada: true, estado: null, erro: r.erro };
  let estado: string | null = null;
  try { estado = (JSON.parse(r.corpo) as { instance?: { state?: string } })?.instance?.state ?? null; } catch { /* corpo estranho */ }
  const linha: LinhaWhatsapp = { rotulo, configurada: true, estado };
  if (extra) linha.ultimaRecebida = await extra();
  return linha;
}

async function whatsapp(): Promise<EstadoIntegracao> {
  const ultimaMensagem = async () => {
    const { data } = await supabaseAdmin.from("cs_message_corpus").select("created_at").order("created_at", { ascending: false }).limit(1);
    return (data?.[0]?.created_at as string | undefined) ?? null;
  };
  const linhas = await Promise.all([
    linhaEvolution("Automação (relatórios, alertas e mensagens aos clientes)", process.env.EVOLUTION_INSTANCE, process.env.EVOLUTION_API_KEY),
    linhaEvolution("Loninho (lê os grupos e fala com o time)", process.env.EVOLUTION_INSTANCE_NEW, process.env.EVOLUTION_API_KEY_NEW, ultimaMensagem),
  ]);
  return estadoWhatsappIntegracao(linhas, Date.now());
}

async function ia(): Promise<EstadoIntegracao> {
  const configurada = !!process.env.OPENAI_API_KEY;
  const desde = new Date(Date.now() - 7 * DIA).toISOString();
  const { data: ok } = await supabaseAdmin.from("llm_calls").select("created_at").eq("ok", true).gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(1);
  const ultimoOk = (ok?.[0]?.created_at as string | undefined) ?? null;
  const { data: falhas } = await supabaseAdmin.from("llm_calls").select("origem, erro, created_at").eq("ok", false)
    .gte("created_at", ultimoOk ?? desde).order("created_at", { ascending: false }).limit(500);
  const fora = iaFora(((falhas ?? []) as FalhaIa[]).filter((f) => !ultimoOk || f.created_at > ultimoOk), new Date());
  return estadoIaIntegracao({ configurada, ultimoOk, fora });
}

async function d4sign(): Promise<EstadoIntegracao> {
  const r = await situacaoDaConfig();
  if (!r.ok) return estadoD4signIntegracao({ erro: r.erro, ligada: false, testeOk: null, testeResultado: null, segredoErrado: false, cofres: 0, cofresComAviso: 0 });
  const s = r.situacao;
  return estadoD4signIntegracao({
    ligada: s.ligada, testeOk: s.testeOk, testeResultado: s.testeResultado, segredoErrado: s.aviso.segredoErrado,
    cofres: s.cofres.length, cofresComAviso: s.cofresComAviso.length,
  });
}

async function pdf(): Promise<EstadoIntegracao> {
  const url = (process.env.BROWSERLESS_URL || "http://chromium:3000").replace(/\/$/, "");
  const token = process.env.BROWSERLESS_TOKEN ?? "";
  const r = await alcancar(`${url}/json/version?token=${encodeURIComponent(token)}`, {}, 6000);
  return estadoServicoIntegracao("pdf", {
    configurado: !!token, semConfig: "Sem o token do Browserless no servidor: nenhum PDF sai.",
    alcance: { ok: r.ok, erro: r.status === 401 || r.status === 403 ? "recusou o token" : r.erro }, okTexto: "Respondendo: os PDFs saem.",
  });
}

async function academy(): Promise<EstadoIntegracao> {
  const ligada = academyConfigurada();
  const r = ligada ? await alcancar(process.env.ACADEMY_URL as string, { method: "GET" }, 8000) : null;
  return estadoServicoIntegracao("academy", {
    configurado: ligada, semConfig: "Desligada: falta o endereço ou o segredo da Lone Academy no servidor.",
    alcance: r ? { ok: !!r.status && r.status < 500, erro: r.erro } : null, okTexto: "Ligada e no ar.",
  });
}

/** Âncora: o segredo compartilhado está aqui E o Âncora aceita a assinatura (lê o estado de uma referência que não
 *  existe — volta lista vazia quando a porta está certa). Nos detalhes, quantos clientes têm CRM em cada sistema. */
async function ancora(): Promise<EstadoIntegracao> {
  const ligada = ancoraLigada();
  const r = ligada ? await lerEstadosNoAncora(["verificacao-lone-os"]) : null;
  const detalhes: string[] = [];
  if (await temTabelasCrm()) {
    const { data, error } = await supabaseAdmin.from("crm_conexoes").select("provedor, ativa");
    if (error) detalhes.push("Não consegui contar as conexões de CRM.");
    else {
      const conta = new Map<ProvedorCrm, number>();
      for (const x of (data ?? []) as { provedor: ProvedorCrm; ativa: boolean }[]) if (x.ativa) conta.set(x.provedor, (conta.get(x.provedor) ?? 0) + 1);
      detalhes.push(conta.size ? `Clientes com CRM no relatório: ${[...conta].map(([p, n]) => `${ROTULO_PROVEDOR[p]} ${n}`).join(" · ")}` : "Nenhum cliente com CRM conectado ainda.");
    }
  } else detalhes.push("Falta aplicar a migração 20261118150000_crm_conexoes.sql: o CRM ainda não entra no relatório.");
  return estadoServicoIntegracao("ancora", {
    configurado: ligada, semConfig: "Âncora desligado: falta o ANCORA_PARCEIRO_SECRET no servidor (Kommo e API aberta funcionam sem ele).",
    alcance: r ? { ok: r.ok, erro: r.ok ? null : r.mensagem } : null, okTexto: "Ligado: link de cadastro e números do Âncora no relatório.", detalhes,
  });
}

export async function verificarIntegracoes(): Promise<EstadoIntegracao[]> {
  const lista = await Promise.all([
    seguro("google", google),
    seguro("google_marketing", googleMarketing),
    seguro("meta", meta),
    seguro("whatsapp", whatsapp),
    seguro("ia", ia),
    seguro("d4sign", d4sign),
    seguro("email", async () => estadoServicoIntegracao("email", {
      configurado: !!process.env.RESEND_API_KEY, semConfig: "Sem a chave do Resend no servidor: nenhum e-mail sai.",
      alcance: null, okTexto: "Ligado.", detalhes: process.env.EMAIL_FROM ? [`Remetente: ${process.env.EMAIL_FROM}`] : [],
    })),
    seguro("pdf", pdf),
    seguro("academy", academy),
    seguro("ancora", ancora),
    seguro("finance", async () => estadoServicoIntegracao("finance", {
      configurado: !!process.env.LONEOS_FINANCE_READ_SECRET, semConfig: "Porta de leitura desligada: o Lone Finance não lê os clientes.",
      alcance: null, okTexto: "Porta de leitura ligada (quem chama é o Lone Finance).",
    })),
    seguro("site", async () => estadoServicoIntegracao("site", {
      configurado: !!process.env.LONEOS_SITE_LEAD_SECRET, semConfig: "Desligado: o lead do site não entra sozinho no funil.",
      alcance: null, okTexto: "Ligado: o lead do site entra no funil do Comercial.",
    })),
  ]);
  return ordenar(lista);
}
