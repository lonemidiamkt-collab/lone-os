// lib/cs/snapshot.ts — RETRATO do estado atual do CS num só lugar. Alimenta duas coisas:
//  (1) a Lone respondendo com DADOS na conversa ("quantas demandas pendentes?", "quem tá esfriando?")
//  (2) o "bom dia" diário no grupo interno.
// Determinístico (sem IA): junta cs_demandas + content_cards + clients num resumo compacto.

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { clientesSemPostNaSemana, semanaAlvo } from "@/lib/cs/lacunas";
import { proximasDatas, formatDataCurta } from "@/lib/cs/datas";

const DIAS_QUIETO = 7; // igual ao cs-esfriando: cliente que falava e sumiu há >= N dias

const ATRASO_MAX = 30; // acima disso o card é "encalhado" (higiene), não atraso acionável do dia

export interface SnapshotCS {
  pendentes: { codigo: string; cliente: string; tipo: string; resumo: string; dias: number }[];
  emProducao: number;
  aguardandoAprovacao: number;
  aguardandoDesigner: number;          // cards comprometidos onde o DESIGNER ainda não entregou a arte
  entreguesAguardandoSocial: number;   // designer JÁ entregou; falta o SOCIAL confirmar/postar
  // resp = SOCIAL/gestor da conta (não é o designer). designerEntregou = a arte já foi produzida.
  atrasados: { cliente: string; titulo: string; dias: number; responsavel: string | null; designerEntregou: boolean }[];
  encalhados: number;        // cards vencidos há > 30d (parados no board → arquivar/fechar)
  esfriando: { cliente: string; dias: number }[];
  semPostsSemana: { nome: string; social?: string | null }[]; // clientes de social SEM post planejado na semana-alvo
  semPostsLabel: string;     // "essa semana" (seg-qua) ou "semana que vem" (qui-dom)
  novosHoje: number;         // cards criados hoje
  texto: string;             // resumo factual compacto (p/ a IA ler e o bom-dia montar)
}

const ehTeste = (nome?: string | null) => /\(teste\)/i.test(nome || "");

const diasDesde = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

export async function montarSnapshotCS(): Promise<SnapshotCS> {
  // TUDO em horário de SP (o servidor roda em UTC). Antes usava new Date() do servidor → das 21h
  // à meia-noite de SP o "dia" virava 3h cedo e a Lone reportava atraso/novos errados de madrugada.
  const agora = spNow();
  const hojeData = ymd(agora); // YYYY-MM-DD em SP, p/ comparar com due_date (também date SP)
  // Meia-noite de HOJE em SP como instante real (SP = UTC-3 fixo) p/ comparar com created_at (ISO UTC).
  const meiaNoiteSP = new Date(`${hojeData}T00:00:00-03:00`).toISOString();
  const limiteFrio = new Date(Date.now() - DIAS_QUIETO * 86400000).toISOString();

  const [clientsRes, demRes, cardsRes] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, last_client_msg_at, agente_ativo, assigned_social")
      .or("active.is.null,active.eq.true"),
    supabaseAdmin.from("cs_demandas")
      .select("codigo, cliente_nome, client_id, tipo, resumo, created_at")
      .eq("status", "pendente").order("created_at", { ascending: true }),
    supabaseAdmin.from("content_cards")
      .select("client_id, status, title, due_date, created_at, social_media, designer_delivered_at, social_confirmed_at")
      .is("archived_at", null),
  ]);
  const primeiroNome = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || null;

  const clients = clientsRes.data ?? [];
  const nomeDe = new Map<string, string>();
  const testeIds = new Set<string>(); // clientes de teste → fora do retrato
  for (const c of clients) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    nomeDe.set(c.id as string, nome);
    if (ehTeste(c.name as string) || ehTeste(c.nome_fantasia as string)) testeIds.add(c.id as string);
  }
  const cardDeTeste = (clientId?: string | null) => !!clientId && testeIds.has(clientId);

  const pendentes = (demRes.data ?? [])
    .filter((d) => !cardDeTeste(d.client_id as string) && !ehTeste(d.cliente_nome as string))
    .map((d) => ({
      codigo: (d.codigo as string) || "—",
      cliente: (d.cliente_nome as string) || "Cliente",
      tipo: (d.tipo as string) || "demanda",
      resumo: ((d.resumo as string) || "").slice(0, 80),
      dias: diasDesde(d.created_at as string),
    }));

  const cards = (cardsRes.data ?? []).filter((k) => !cardDeTeste(k.client_id as string));
  const emProducao = cards.filter((k) => k.status === "in_production").length;
  const aguardandoAprovacao = cards.filter((k) => ["approval", "client_approval"].includes(k.status as string)).length;
  const novosHoje = cards.filter((k) => (k.created_at as string) >= meiaNoiteSP).length;
  // Só conta como atraso o trabalho COMPROMETIDO (roteiro/produção/aprovação). Card em "ideas" é
  // backlog — prazo ali é aspiracional, não vira alarme; "scheduled"/"published" já saíram.
  const COMPROMETIDO = ["script", "in_production", "approval", "client_approval"];
  // Gargalo do pipeline: onde a peça está TRAVADA — no designer (arte não produzida) ou no social
  // (arte já entregue, falta confirmar/postar). designer_delivered_at é a fonte de verdade (o status
  // nem sempre acompanha). Fora do "ideas"/"published"/"scheduled".
  const aguardandoDesigner = cards.filter((k) => COMPROMETIDO.includes(k.status as string) && !k.designer_delivered_at).length;
  const entreguesAguardandoSocial = cards.filter((k) => k.designer_delivered_at && !k.social_confirmed_at && !["published", "scheduled", "ideas"].includes(k.status as string)).length;
  const vencidos = cards
    .filter((k) => k.due_date && (k.due_date as string) < hojeData && COMPROMETIDO.includes(k.status as string))
    .map((k) => ({
      cliente: nomeDe.get(k.client_id as string) || "Cliente",
      titulo: ((k.title as string) || "sem título").slice(0, 60),
      dias: diasDesde(`${k.due_date}T00:00:00Z`),
      responsavel: primeiroNome(k.social_media as string),
      designerEntregou: !!k.designer_delivered_at,
    }))
    .sort((a, b) => a.dias - b.dias); // prazo mais recente primeiro = ainda dá pra salvar
  const atrasados = vencidos.filter((v) => v.dias <= ATRASO_MAX);
  const encalhados = vencidos.filter((v) => v.dias > ATRASO_MAX).length;

  const esfriando = clients
    .filter((c) => c.agente_ativo !== false && !testeIds.has(c.id as string) && c.last_client_msg_at && (c.last_client_msg_at as string) < limiteFrio)
    .map((c) => ({
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      dias: diasDesde(c.last_client_msg_at as string),
    }))
    .sort((a, b) => b.dias - a.dias);

  // Lacuna semanal: cliente de social sem NENHUM card com due_date nesta semana (seg-dom) —
  // "ninguém fica pra trás". Semana em horário de SP (agora já é spNow(), definido no topo).
  const elegiveis = clients
    .filter((c) => c.assigned_social && !testeIds.has(c.id as string))
    .map((c) => ({ id: c.id as string, nome: nomeDe.get(c.id as string) || "Cliente", social: (c.assigned_social as string) || null }));
  const semana = semanaAlvo(agora); // seg-qua: essa semana · qui-dom: a que vem (mais acionável)
  const semPostsSemana = clientesSemPostNaSemana(
    elegiveis,
    cards.map((k) => ({ clientId: (k.client_id as string) || null, dueDate: (k.due_date as string) || null })),
    semana.segunda,
  );

  // Datas comemorativas chegando (14 dias, só as relevantes) — a Lone responde "que datas vêm aí?".
  const datasProx = proximasDatas(agora, 14).filter((d) => d.peso >= 2);

  // Resumo factual compacto — a IA lê ISTO pra responder com números reais (não inventa).
  const linhas = [
    `Demandas pendentes (esperando ok/não): ${pendentes.length}` +
      (pendentes.length ? ` — ${pendentes.slice(0, 8).map((p) => `${p.cliente} (${p.tipo}, há ${p.dias}d)`).join("; ")}` : ""),
    `Em produção: ${emProducao} · Aguardando aprovação: ${aguardandoAprovacao} · Novos cards hoje: ${novosHoje}`,
    `Pipeline de produção: ${aguardandoDesigner} aguardando o DESIGNER entregar a arte; ${entreguesAguardandoSocial} já entregues pelo designer, aguardando o SOCIAL confirmar/postar. (resp = social/gestor da conta, NÃO é o designer)`,
    atrasados.length
      ? `Atrasados (prazo vencido, acionável): ${atrasados.length} — ${atrasados.slice(0, 10).map((a) => `${a.cliente}: ${a.titulo} (${a.dias}d${a.responsavel ? `, resp: ${a.responsavel}` : ""}, designer: ${a.designerEntregou ? "entregue" : "pendente"})`).join("; ")}`
      : `Atrasados: nenhum`,
    encalhados ? `Encalhados (cards parados há +${ATRASO_MAX}d — arquivar/fechar): ${encalhados}` : "",
    esfriando.length
      ? `Esfriando (cliente sumiu do grupo): ${esfriando.length} — ${esfriando.slice(0, 6).map((e) => `${e.cliente} (${e.dias}d)`).join("; ")}`
      : `Esfriando: nenhum`,
    semPostsSemana.length
      ? `Sem NENHUM post planejado ${semana.label} (seg-dom): ${semPostsSemana.length} — ${semPostsSemana.slice(0, 8).map((c) => c.nome).join("; ")}`
      : `Todos os clientes de social têm post planejado ${semana.label}`,
    datasProx.length
      ? `Datas comemorativas próximas (14d): ${datasProx.slice(0, 4).map((d) => formatDataCurta(d).replace(/\*/g, "")).join("; ")}`
      : "",
  ].filter(Boolean);

  return { pendentes, emProducao, aguardandoAprovacao, aguardandoDesigner, entreguesAguardandoSocial, atrasados, encalhados, esfriando, semPostsSemana, semPostsLabel: semana.label, novosHoje, texto: linhas.join("\n") };
}
