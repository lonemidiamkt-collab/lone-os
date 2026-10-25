// app/api/clients/group-mapping/route.ts
// Mapeamento cliente ↔ grupo WhatsApp (admin). GET sugere; POST salva.
// A confirmação é SEMPRE humana — o match é só sugestão (risco de grupo errado).
//
// 25/10/2026 (auditoria de erro recuperável, 9.1 e 9.2). O POST recebia a tabela inteira e gravava o
// grupo de todas as linhas — inclusive a sugestão que a tela tinha escolhido sozinha. Agora:
//   · cada linha manda SÓ o que mudou: `groupJid` presente = trocar o grupo; `verbaMinima`/`alerts`
//     presentes = mexer na config. Campo ausente não é tocado;
//   · grupo que já é de outro cliente volta 409 e nada é gravado, a não ser que a linha traga
//     `compartilharCom` com todos os outros donos (o compartilhamento confirmado na tela);
//   · a resposta diz quem foi salvo e quem falhou: 200 tudo certo, 207 parte, 500 nada.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { listGroups } from "@/lib/whatsapp/evolution";
import { matchGroupForClient, type GroupOption } from "@/lib/whatsapp/group-match";
import { selectActiveMetaClients, clientDisplayName } from "@/lib/traffic/weekly-report";
import { getClientAlertConfigs, getAlertSettings } from "@/lib/traffic/sync-core";
import { DEFAULT_CLIENT_ALERT_CONFIG } from "@/lib/budgets/operational-alerts";
import {
  conflitosDeGrupo, conflitosSemConfirmacao, fraseDoConflito, type DonoGrupo,
} from "@/lib/whatsapp/vinculo-grupo";

type LinhaCliente = { id: string; name: string; nome_fantasia: string | null; active: boolean | null; churned_at: string | null; whatsapp_group_jid: string | null };
const dono = (c: LinhaCliente): DonoGrupo => ({
  clientId: c.id, nome: clientDisplayName(c), jid: c.whatsapp_group_jid as string,
  ativo: c.active !== false && !c.churned_at,
});

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  // Grupos são best-effort: se a Evolution estiver lenta/offline, a tela ainda
  // mostra os clientes (com o grupo já salvo) — só o dropdown fica limitado.
  const groupsRes = await listGroups();
  const groups: GroupOption[] = groupsRes.ok ? (groupsRes.data ?? []).map((g) => ({ id: g.id, subject: g.subject })) : [];
  const groupsError = groupsRes.ok ? null : groupsRes.error;

  let clients: Awaited<ReturnType<typeof selectActiveMetaClients>>;
  let configs: Awaited<ReturnType<typeof getClientAlertConfigs>>;
  try {
    clients = await selectActiveMetaClients();
    // Estrito: com a leitura falhando, a tela mostraria o padrão — e quem mexesse num alerta
    // gravaria o padrão por cima do que estava configurado.
    configs = await getClientAlertConfigs({ estrito: true });
  } catch (e) {
    return NextResponse.json({
      error: `Não consegui ler os clientes e os alertas (${e instanceof Error ? e.message : String(e)}). Recarregue em alguns segundos.`,
    }, { status: 503 });
  }
  const settings = await getAlertSettings();
  // Verba mensal por conta (Tráfego › Contas & Verba) — só a dica de "sincronizado" do campo.
  const { data: accts, error: acctsErr } = await supabaseAdmin.from("ad_accounts").select("meta_account_id, monthly_budget");
  const budgetByAccount = new Map(
    (accts ?? []).map((a: { meta_account_id: string; monthly_budget: number | null }) => [a.meta_account_id, a.monthly_budget] as const),
  );
  // De quem é cada grupo — TODOS os clientes, não só os da tela (ex-cliente e só-social também têm
  // grupo). É com isso que a tela pergunta "este grupo já é do Fulano — compartilhar?".
  const { data: comGrupo, error: donosErr } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, active, churned_at, whatsapp_group_jid")
    .not("whatsapp_group_jid", "is", null);
  if (donosErr) {
    return NextResponse.json({ error: `Não consegui ler de quem é cada grupo (${donosErr.message}). Recarregue.` }, { status: 503 });
  }

  const rows = clients.map((c) => {
    const name = clientDisplayName(c);
    const suggestion = matchGroupForClient(name, groups);
    const cfg = configs.get(c.id) ?? DEFAULT_CLIENT_ALERT_CONFIG;
    return {
      clientId: c.id,
      clientName: name,
      metaAccountId: c.meta_ad_account_id,
      currentJid: c.whatsapp_group_jid ?? null,
      currentName: c.whatsapp_group_name ?? null,
      suggestion,
      monthlyBudget: budgetByAccount.get(c.meta_ad_account_id ?? "") ?? null,
      // 0/negativo gravado no banco = "sem override" → exibe vazio (herda o % sincronizado).
      verbaMinima: cfg.verbaMinima != null && cfg.verbaMinima > 0 ? cfg.verbaMinima : null,
      alerts: {
        verbaBaixa: cfg.alertVerbaBaixa,
        verbaZerada: cfg.alertVerbaZerada,
        erroConta: cfg.alertErroConta,
        semGasto: cfg.alertSemGasto,
        campanhaParada: cfg.alertCampanhaParada,
        metaErro: cfg.alertMetaErro,
      },
    };
  });

  return NextResponse.json({
    groups: groups.sort((a, b) => a.subject.localeCompare(b.subject)),
    groupsError,
    clients: rows,
    donosGrupos: ((comGrupo ?? []) as LinhaCliente[]).map(dono),
    verbasErro: acctsErr ? acctsErr.message : null,
    warningPct: settings.warningPct,
    criticalPct: settings.criticalPct,
    mapped: rows.filter((r) => r.currentJid).length,
    total: rows.length,
  });
}

interface Mapeamento {
  clientId: string;
  /** Presente = trocar o grupo (null = desvincular). Ausente = não mexe no grupo. */
  groupJid?: string | null;
  groupName?: string | null;
  /** Os outros donos do grupo com quem a pessoa confirmou o compartilhamento na tela. */
  compartilharCom?: string[];
  verbaMinima?: number | null;
  alerts?: {
    verbaBaixa?: boolean; verbaZerada?: boolean; erroConta?: boolean;
    semGasto?: boolean; campanhaParada?: boolean; metaErro?: boolean;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  let body: { mappings?: Mapeamento[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const mappings = body.mappings ?? [];
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json({ error: "Nenhuma alteração enviada" }, { status: 400 });
  }
  for (const m of mappings) {
    if (!m || typeof m.clientId !== "string" || !UUID.test(m.clientId)) {
      return NextResponse.json({ error: "Cliente inválido na lista" }, { status: 400 });
    }
    if (m.verbaMinima != null && (typeof m.verbaMinima !== "number" || !Number.isFinite(m.verbaMinima) || m.verbaMinima < 0)) {
      return NextResponse.json({ error: "Verba mínima inválida" }, { status: 422 });
    }
  }

  // ── Quem são os clientes e de quem é cada grupo, ANTES de gravar qualquer coisa ──
  const trocas = mappings
    .filter((m) => "groupJid" in m)
    .map((m) => ({ ...m, jid: (typeof m.groupJid === "string" ? m.groupJid.trim() : "") || null }));
  const ids = [...new Set(mappings.map((m) => m.clientId))];
  const jids = [...new Set(trocas.map((t) => t.jid).filter((j): j is string => !!j))];
  const COLS = "id, name, nome_fantasia, active, churned_at, whatsapp_group_jid";
  const [porId, porJid] = await Promise.all([
    supabaseAdmin.from("clients").select(COLS).in("id", ids),
    jids.length ? supabaseAdmin.from("clients").select(COLS).in("whatsapp_group_jid", jids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (porId.error || porJid.error) {
    // "Não consegui ler de quem é" nunca pode virar "o grupo está livre".
    return NextResponse.json({ error: "Não consegui conferir os clientes e de quem são os grupos. Nada foi salvo — tente de novo." }, { status: 503 });
  }
  const linhas = new Map<string, LinhaCliente>();
  for (const c of [...(porId.data ?? []), ...(porJid.data ?? [])] as LinhaCliente[]) linhas.set(c.id, c);
  if (ids.some((id) => !linhas.has(id))) {
    return NextResponse.json({ error: "Cliente não encontrado — ele pode ter sido removido. Recarregue a tela." }, { status: 404 });
  }
  const nomePorCliente = new Map([...linhas.values()].map((c) => [c.id, clientDisplayName(c)] as const));
  const atualPorCliente = new Map(ids.map((id) => [id, linhas.get(id)?.whatsapp_group_jid ?? null] as const));

  if (trocas.length) {
    const donos = [...linhas.values()].filter((c) => !!c.whatsapp_group_jid).map(dono);
    const conflitos = conflitosDeGrupo(donos, trocas.map((t) => ({ clientId: t.clientId, nome: nomePorCliente.get(t.clientId), jid: t.jid })));
    const confirmados = new Map(trocas.map((t) => [t.clientId, Array.isArray(t.compartilharCom) ? t.compartilharCom.filter((x) => typeof x === "string") : []]));
    const pendentes = conflitosSemConfirmacao(conflitos, (id) => confirmados.get(id));
    if (pendentes.length) {
      const nomeGrupo = (jid: string) => trocas.find((t) => t.jid === jid)?.groupName ?? null;
      return NextResponse.json({
        error: `${fraseDoConflito(pendentes[0], nomeGrupo(pendentes[0].jid))} Nada foi salvo. Se for de propósito (mesmo dono), confirme o compartilhamento na tela de Grupos dos Clientes.`,
        codigo: "grupo_de_outro_cliente",
        conflitos: pendentes.map((c) => ({ ...c, nomeGrupo: nomeGrupo(c.jid) })),
      }, { status: 409 });
    }
  }

  // ── Gravação, cliente a cliente: só o que veio ──
  const salvos: string[] = [];
  const falhas: { clientId: string; nome: string; erro: string }[] = [];
  for (const m of mappings) {
    const nome = nomePorCliente.get(m.clientId) ?? m.clientId;
    const erros: string[] = [];
    if ("groupJid" in m) {
      const jid = (typeof m.groupJid === "string" ? m.groupJid.trim() : "") || null;
      // Mesmo grupo de antes: não regrava (nada a fazer, e não mexe no nome guardado).
      if (atualPorCliente.get(m.clientId) !== jid) {
        const { error } = await supabaseAdmin
          .from("clients")
          .update({ whatsapp_group_jid: jid, whatsapp_group_name: jid ? (m.groupName ?? null) : null })
          .eq("id", m.clientId);
        if (error) erros.push(`grupo: ${error.message}`);
      }
    }

    // Config de alerta: só as colunas que vieram. Upsert sem a coluna preserva o valor gravado.
    // Verba 0/negativa vira null (= herda o % da verba, evita o bug do "0"). O destino não é mais
    // gravado daqui: nenhum envio lia "cliente" (auditoria 9.3) e o alerta vai sempre ao interno.
    const cfg: Record<string, unknown> = {};
    if ("verbaMinima" in m) cfg.verba_minima = m.verbaMinima != null && m.verbaMinima > 0 ? m.verbaMinima : null;
    if (m.alerts) {
      const a = m.alerts;
      Object.assign(cfg, {
        alert_verba_baixa: a.verbaBaixa !== false,
        alert_verba_zerada: a.verbaZerada !== false,
        alert_erro_conta: a.erroConta !== false,
        alert_sem_gasto: a.semGasto !== false,
        alert_campanha_parada: a.campanhaParada === true,
        alert_meta_erro: a.metaErro !== false,
      });
    }
    if (Object.keys(cfg).length) {
      const { error: cErr } = await supabaseAdmin.from("client_alert_config").upsert({
        client_id: m.clientId, ...cfg, updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });
      if (cErr) erros.push(`alertas: ${cErr.message}`);
    }

    if (erros.length) falhas.push({ clientId: m.clientId, nome, erro: erros.join("; ") });
    else salvos.push(m.clientId);
  }

  if (!falhas.length) return NextResponse.json({ ok: true, updated: salvos.length, salvos, falhas: [] });
  const lista = falhas.slice(0, 4).map((f) => `${f.nome} (${f.erro})`).join("; ");
  if (!salvos.length) {
    return NextResponse.json({ ok: false, error: `Nada foi salvo: ${lista}`, updated: 0, salvos, falhas }, { status: 500 });
  }
  return NextResponse.json({
    ok: false, error: `${falhas.length} de ${mappings.length} não salvaram: ${lista}`, updated: salvos.length, salvos, falhas,
  }, { status: 207 });
}
