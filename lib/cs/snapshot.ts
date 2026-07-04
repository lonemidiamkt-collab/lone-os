// lib/cs/snapshot.ts — RETRATO do estado atual do CS num só lugar. Alimenta duas coisas:
//  (1) a Lone respondendo com DADOS na conversa ("quantas demandas pendentes?", "quem tá esfriando?")
//  (2) o "bom dia" diário no grupo interno.
// Determinístico (sem IA): junta cs_demandas + content_cards + clients num resumo compacto.

import { supabaseAdmin } from "@/lib/supabase/server";

const DIAS_QUIETO = 7; // igual ao cs-esfriando: cliente que falava e sumiu há >= N dias

export interface SnapshotCS {
  pendentes: { codigo: string; cliente: string; tipo: string; resumo: string; dias: number }[];
  emProducao: number;
  aguardandoAprovacao: number;
  atrasados: { cliente: string; titulo: string; dias: number }[]; // card com prazo vencido e não publicado
  esfriando: { cliente: string; dias: number }[];
  novosHoje: number;         // cards criados hoje
  texto: string;             // resumo factual compacto (p/ a IA ler e o bom-dia montar)
}

const diasDesde = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

export async function montarSnapshotCS(): Promise<SnapshotCS> {
  const hoje = new Date();
  const hojeISO = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
  const hojeData = hojeISO.slice(0, 10); // YYYY-MM-DD p/ comparar com due_date
  const limiteFrio = new Date(Date.now() - DIAS_QUIETO * 86400000).toISOString();

  const [clientsRes, demRes, cardsRes] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, last_client_msg_at, agente_ativo")
      .or("active.is.null,active.eq.true"),
    supabaseAdmin.from("cs_demandas")
      .select("codigo, cliente_nome, tipo, resumo, created_at")
      .eq("status", "pendente").order("created_at", { ascending: true }),
    supabaseAdmin.from("content_cards")
      .select("client_id, status, title, due_date, created_at")
      .is("archived_at", null),
  ]);

  const clients = clientsRes.data ?? [];
  const nomeDe = new Map<string, string>();
  for (const c of clients) nomeDe.set(c.id as string, (c.nome_fantasia as string) || (c.name as string) || "Cliente");

  const pendentes = (demRes.data ?? []).map((d) => ({
    codigo: (d.codigo as string) || "—",
    cliente: (d.cliente_nome as string) || "Cliente",
    tipo: (d.tipo as string) || "demanda",
    resumo: ((d.resumo as string) || "").slice(0, 80),
    dias: diasDesde(d.created_at as string),
  }));

  const cards = cardsRes.data ?? [];
  const emProducao = cards.filter((k) => k.status === "in_production").length;
  const aguardandoAprovacao = cards.filter((k) => ["approval", "client_approval"].includes(k.status as string)).length;
  const novosHoje = cards.filter((k) => (k.created_at as string) >= hojeISO).length;
  const atrasados = cards
    .filter((k) => k.due_date && (k.due_date as string) < hojeData && !["published", "done"].includes(k.status as string))
    .map((k) => ({
      cliente: nomeDe.get(k.client_id as string) || "Cliente",
      titulo: ((k.title as string) || "sem título").slice(0, 60),
      dias: diasDesde(`${k.due_date}T00:00:00Z`),
    }))
    .sort((a, b) => b.dias - a.dias);

  const esfriando = clients
    .filter((c) => c.agente_ativo !== false && c.last_client_msg_at && (c.last_client_msg_at as string) < limiteFrio)
    .map((c) => ({
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      dias: diasDesde(c.last_client_msg_at as string),
    }))
    .sort((a, b) => b.dias - a.dias);

  // Resumo factual compacto — a IA lê ISTO pra responder com números reais (não inventa).
  const linhas = [
    `Demandas pendentes (esperando ok/não): ${pendentes.length}` +
      (pendentes.length ? ` — ${pendentes.slice(0, 8).map((p) => `${p.cliente} (${p.tipo}, há ${p.dias}d)`).join("; ")}` : ""),
    `Em produção: ${emProducao} · Aguardando aprovação: ${aguardandoAprovacao} · Novos cards hoje: ${novosHoje}`,
    atrasados.length
      ? `Atrasados (prazo vencido): ${atrasados.length} — ${atrasados.slice(0, 6).map((a) => `${a.cliente}: ${a.titulo} (${a.dias}d)`).join("; ")}`
      : `Atrasados: nenhum`,
    esfriando.length
      ? `Esfriando (cliente sumiu do grupo): ${esfriando.length} — ${esfriando.slice(0, 6).map((e) => `${e.cliente} (${e.dias}d)`).join("; ")}`
      : `Esfriando: nenhum`,
  ];

  return { pendentes, emProducao, aguardandoAprovacao, atrasados, esfriando, novosHoje, texto: linhas.join("\n") };
}
