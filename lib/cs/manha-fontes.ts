// lib/cs/manha-fontes.ts — a coleta de dados do bom-dia, da postagem e das pendências, num lugar só.
//
// Saiu de dentro das rotas (cs-bom-dia, cs-postagem, cs-pendencias) para que a manhã unificada
// (cs-manha) monte as MESMAS seções com a MESMA lógica. As rotas antigas continuam chamando daqui.

import { supabaseAdmin } from "@/lib/supabase/server";
import { montarSnapshotCS, type SnapshotCS } from "@/lib/cs/snapshot";
import { buildBomDiaDigest } from "@/lib/cs/bom-dia";
import { coletarItens, agruparPorDono, type BlocoDono } from "@/lib/cs/cobranca-nominal";
import { fatoEsfriando, fatoSemPauta } from "@/lib/cs/porta-voz";
import { ymd } from "@/lib/cs/vigilancia";
import { buildPostingReport, type PostingClient } from "@/lib/cs/postagem";
import { buildPendenciasDigest, textoArquivadas, type PendenciaItem } from "@/lib/cs/pendencias";
import type { PanoramaBomDia } from "@/lib/reports/bomDiaPdf";

// ── BOM-DIA ─────────────────────────────────────────────────────────────────

export interface FonteBomDia {
  snap: SnapshotCS;
  time: string[];
  blocos: BlocoDono[];
  panorama: PanoramaBomDia;
  /** O digest longo (buildBomDiaDigest) — o cs-bom-dia devolve como preview. */
  digest: string;
  fatos: string[];
}

export async function coletarBomDia(now: Date): Promise<FonteBomDia> {
  const snap = await montarSnapshotCS();
  // O time real, pra "Carlos" e "Carlos Augusto" não virarem dois blocos (o snapshot encurta
  // o dono do card e mantém o completo na pendência).
  const { data: membros } = await supabaseAdmin.from("team_members").select("name");
  const time = (membros ?? []).map((m) => m.name as string).filter(Boolean);
  const blocos = agruparPorDono(coletarItens(snap), time);
  const data = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return {
    snap, time, blocos,
    panorama: {
      data,
      esperandoOk: snap.pendentes.length,
      emProducao: snap.emProducao ?? 0,
      artesProntas: snap.prontasPraPostar?.length ?? 0,
      semPostPlanejado: snap.semPostsSemana.length,
      esfriando: snap.esfriando.length,
      encalhados: snap.encalhados ?? 0,
    },
    digest: buildBomDiaDigest(snap, now, time),
    // Declara os esfriando que a manchete JÁ cita — assim o cron de esfriando não repete os mesmos.
    fatos: snap.esfriando.map((e) => fatoEsfriando(e.cliente)),
  };
}

// ── POSTAGEM ────────────────────────────────────────────────────────────────

const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export interface FontePostagem {
  msg: string | null;
  lista: PostingClient[];
  videoQuarta?: string[];
  hoje: string;
  diaLabel: string;
  wd: number;
  firme: boolean;
  videoDay: boolean;
  comPostTotal: number;
  fatos: string[];
}

/** Só em dia de semana (quem chama confere). Erro de leitura dos clientes volta como `erro`. */
export async function coletarPostagem(now: Date): Promise<FontePostagem | { erro: string }> {
  const wd = now.getDay();              // 1=seg … 5=sex
  const firme = wd === 1 || wd === 5;   // seg/sex = todos esperados
  const videoDay = wd === 3;            // quarta = dia de Reels (só quem faz vídeo)
  const hoje = ymd(now);
  const diaLabel = `${WEEKDAYS_PT[wd]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Clientes ATIVOS com social + perfil de conteúdo.
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, active, perfil_conteudo")
    .or("active.is.null,active.eq.true");
  if (cErr) return { erro: cErr.message };
  const clientes = (clientsData ?? []).filter(
    (c) => (c.assigned_social as string)?.trim() && !(c.name as string)?.startsWith("🧪"),
  );
  const fazVideo = (c: (typeof clientes)[number]) => c.perfil_conteudo === "video" || c.perfil_conteudo === "completo";

  // Cards com due_date = hoje (pauta do dia) → quais clientes têm post.
  const { data: cardsData } = await supabaseAdmin
    .from("content_cards")
    .select("client_id")
    .eq("due_date", hoje)
    .is("archived_at", null);
  const comPost = new Set((cardsData ?? []).map((k) => k.client_id as string));

  const lista: PostingClient[] = clientes.map((c) => ({
    nome: (c.name as string) || "Cliente",
    temPost: comPost.has(c.id as string),
    // seg/sex: todos; quarta: só quem faz vídeo; ter/qui: ninguém (dia fora)
    esperado: firme ? true : (videoDay ? fazVideo(c) : false),
  }));

  // Segunda: lembrete pra adiantar os roteiros dos vídeos de quarta.
  const videoQuarta = wd === 1 ? clientes.filter(fazVideo).map((c) => (c.name as string) || "Cliente") : undefined;

  // Na segunda a mensagem carrega TAMBÉM o lembrete dos roteiros de quarta: com carona, não declara
  // fato nenhum — o portão só pode engolir mensagem cujo conteúdo inteiro já foi dito.
  const fatos = videoQuarta?.length
    ? []
    : lista.filter((c) => c.esperado && !c.temPost).map((c) => fatoSemPauta(c.nome, hoje));

  return {
    msg: buildPostingReport({ diaLabel, videoDay, clientes: lista, videoQuarta }),
    lista, videoQuarta, hoje, diaLabel, wd, firme, videoDay, comPostTotal: comPost.size, fatos,
  };
}

// ── PENDÊNCIAS ──────────────────────────────────────────────────────────────

// Só cutuca pendências RECENTES (não fica nagando sobre demanda de semanas atrás).
const JANELA_DIAS = 7;
// 14 dias sem ok nem não = pendência morta.
const DIAS_MORTA = 14;

export interface FontePendencias {
  msg: string;
  itens: PendenciaItem[];
  expiradas: number;
  erroExpirar: string | null;
  mortasHoje: { cliente: string; resumo: string }[];
  /** Aviso das que morreram hoje ("" se nenhuma). */
  arquivadas: string;
}

const semTeste = (d: { cliente_nome?: unknown }) => !/\(teste\)/i.test((d.cliente_nome as string) ?? "");

/**
 * `aplicar` expira de verdade as mortas; `simular` só LÊ quais morreriam (pro ?dry=1 mostrar o
 * texto exato sem tocar no banco). Sem nenhum dos dois, não olha as mortas.
 */
export async function coletarPendencias(opts: { aplicar: boolean; simular?: boolean }): Promise<FontePendencias | { erro: string }> {
  let expiradas = 0;
  let erroExpirar: string | null = null;
  let mortasHoje: { cliente: string; resumo: string }[] = [];
  const morta = new Date(Date.now() - DIAS_MORTA * 24 * 60 * 60 * 1000).toISOString();
  const paraAviso = (rows: { cliente_nome?: unknown; resumo?: unknown }[] | null) => (rows ?? [])
    .filter(semTeste)
    .map((d) => ({ cliente: (d.cliente_nome as string) || "Cliente", resumo: (d.resumo as string) || "demanda" }));

  if (opts.aplicar) {
    // O UPDATE precisa devolver o que fez. Sem `.select()` o PostgREST não conta linha nenhuma e o
    // erro ia pro lixo (37 pendências de +14 dias seguiam "pendente" com updated_at NULL).
    // Não conta como recusa ('expirada', não 'descartada') pra não sujar o falso-positivo.
    const { data: mortas, error } = await supabaseAdmin
      .from("cs_demandas")
      .update({ status: "expirada", updated_at: new Date().toISOString() })
      .eq("status", "pendente")
      .lt("created_at", morta)
      .select("codigo, cliente_nome, resumo");
    if (error) erroExpirar = error.message;
    else {
      expiradas = mortas?.length ?? 0;
      mortasHoje = paraAviso(mortas);
    }
    if (erroExpirar) console.error("[cs-pendencias] falha ao expirar pendencias:", erroExpirar);
  } else if (opts.simular) {
    const { data: mortas } = await supabaseAdmin
      .from("cs_demandas")
      .select("codigo, cliente_nome, resumo")
      .eq("status", "pendente")
      .lt("created_at", morta);
    expiradas = mortas?.length ?? 0;
    mortasHoje = paraAviso(mortas);
  }

  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("cs_demandas")
    .select("codigo, cliente_nome, resumo, responsavel, urgencia, message_text")
    .eq("status", "pendente")
    .not("msg_id_sugestao", "is", null) // só as que realmente foram sugeridas no grupo
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (error) return { erro: error.message };

  // Tira o cliente de teste do lembrete — foco no trabalho REAL (igual às métricas de acurácia).
  const itens: PendenciaItem[] = (data ?? [])
    .filter(semTeste)
    .map((d) => ({
      codigo: (d.codigo as string) || null,
      cliente: (d.cliente_nome as string) || "Cliente",
      resumo: (d.resumo as string) || (d.message_text as string) || "demanda",
      responsavel: (d.responsavel as string) || null,
      urgencia: (d.urgencia as string) || undefined,
    }));

  return {
    msg: buildPendenciasDigest(itens), itens, expiradas, erroExpirar, mortasHoje,
    arquivadas: textoArquivadas(mortasHoje),
  };
}
