"use client";

// Tráfego › Grupos dos Clientes (/settings/grupos) — grupo do WhatsApp, limite de saldo e alertas por cliente.
//
// 25/10/2026 (auditoria de erro recuperável, 9.1–9.4). Antes, a sugestão de grupo de confiança "média"
// (duas palavras em comum) já vinha escolhida, e o "Salvar" mandava a tabela inteira: quem entrava para
// mudar uma verba gravava junto grupos que ninguém conferiu — relatório, suporte e calendário iam para o
// grupo de outro cliente. Agora:
//   · a sugestão é um botão "Usar sugestão", nunca escolhida de antemão;
//   · o Salvar grava só as linhas que mudaram, depois de mostrar o resumo ("vincular X → grupo Y");
//   · grupo que já é de outro cliente pede confirmação de compartilhamento (Veneza e Bazar Ribeiro
//     dividem grupo de propósito — mesmo dono); a rota recusa sem ela;
//   · a verba entende "1.500,00" e "1.500" (antes "1.500" virava R$ 1,50);
//   · a coluna Destino saiu: nenhum envio lia "Cliente" — o alerta de saldo vai sempre ao grupo interno.

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Save, RefreshCw, CheckCircle, AlertTriangle, Undo2, Lightbulb, X } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { mascararReais } from "@/lib/trafego/vendas";
import {
  mudancasDaTela, conflitosDeGrupo, resumoDaMudanca, lerVerbaMinima, ROTULO_ALERTA,
  type AlertasCliente, type EstadoLinha, type DonoGrupo, type ConflitoGrupo, type MudancaCliente,
} from "@/lib/whatsapp/vinculo-grupo";
import { cn } from "@/lib/utils";

interface GroupOption { id: string; subject: string }
interface Suggestion { groupId: string | null; groupName: string | null; score: number; confidence: "high" | "medium" | "low" | "none" }
interface Row {
  clientId: string;
  clientName: string;
  metaAccountId: string;
  currentJid: string | null;
  currentName: string | null;
  suggestion: Suggestion;
  monthlyBudget: number | null;
  verbaMinima: number | null;
  alerts: AlertasCliente;
}
interface RespostaGet {
  groups?: GroupOption[];
  groupsError?: string | null;
  clients?: Row[];
  donosGrupos?: DonoGrupo[];
  verbasErro?: string | null;
  warningPct?: number;
  criticalPct?: number;
}
interface RespostaPost {
  ok: boolean;
  updated?: number;
  salvos?: string[];
  falhas?: { clientId: string; nome: string; erro: string }[];
  error?: string;
}

const CHAVES_ALERTA = Object.keys(ROTULO_ALERTA) as (keyof AlertasCliente)[];
const CONF_LABEL: Record<Suggestion["confidence"], string> = { high: "alta", medium: "média", low: "baixa", none: "" };

const estadoDoBanco = (r: Row): EstadoLinha => ({
  jid: r.currentJid ?? "",
  verba: r.verbaMinima != null ? mascararReais(String(r.verbaMinima)) : "",
  alertas: { ...r.alerts },
});

export default function GruposPage() {
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [donos, setDonos] = useState<DonoGrupo[]>([]);
  // Como veio do banco (base) e como está na tela (edit). Salvar manda só a diferença.
  const [base, setBase] = useState<Record<string, EstadoLinha>>({});
  const [edit, setEdit] = useState<Record<string, EstadoLinha>>({});
  const [warnPct, setWarnPct] = useState(18);
  const [critPct, setCritPct] = useState(10);
  // Resumo antes de salvar + compartilhamentos confirmados (clientId → outros donos confirmados).
  const [revisando, setRevisando] = useState(false);
  const [compartilhar, setCompartilhar] = useState<Record<string, string[]>>({});
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await chamar<RespostaGet>("/api/clients/group-mapping");
      // Erro não vira tabela vazia nem padrão: sem a leitura, não há o que editar.
      if (!r.ok || !r.data) { setErroCarga(r.erro ?? "Não consegui carregar os grupos."); return; }
      setErroCarga(null);
      const data = r.data;
      const lista = data.clients ?? [];
      setGroups(data.groups ?? []);
      setRows(lista);
      setDonos(data.donosGrupos ?? []);
      if (typeof data.warningPct === "number") setWarnPct(data.warningPct);
      if (typeof data.criticalPct === "number") setCritPct(data.criticalPct);
      if (data.groupsError) {
        toast.warning("Lista de grupos da Evolution indisponível agora — os clientes aparecem, mas o seletor de grupo pode estar limitado. Tente Recarregar.");
      }
      if (data.verbasErro) toast.warning("Não consegui ler a verba mensal das contas — a dica de \"sincronizado\" pode faltar.");
      const b: Record<string, EstadoLinha> = {};
      for (const row of lista) b[row.clientId] = estadoDoBanco(row);
      setBase(b);
      setEdit(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ...v, alertas: { ...v.alertas } }])));
      setCompartilhar({});
      setRevisando(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const nomeDoGrupo = useCallback((jid: string): string | null => {
    return groups.find((g) => g.id === jid)?.subject
      ?? rows.find((r) => r.currentJid === jid)?.currentName
      ?? null;
  }, [groups, rows]);

  const { mudancas, erros } = useMemo(() => mudancasDaTela(
    rows.filter((r) => base[r.clientId] && edit[r.clientId])
      .map((r) => ({ clientId: r.clientId, nome: r.clientName, base: base[r.clientId], atual: edit[r.clientId] })),
    nomeDoGrupo,
  ), [rows, base, edit, nomeDoGrupo]);
  const mudouPorCliente = useMemo(() => new Set(mudancas.map((m) => m.clientId)), [mudancas]);
  const erroPorCliente = useMemo(() => new Map(erros.map((e) => [e.clientId, e.frase])), [erros]);

  // Conflitos contra o dono de cada grupo entre TODOS os clientes (inclusive ex-cliente e só-social,
  // que não aparecem nesta tabela). A rota confere de novo na hora de gravar.
  const conflitos = useMemo<ConflitoGrupo[]>(
    () => conflitosDeGrupo(donos, mudancas.filter((m) => m.grupo).map((m) => ({ clientId: m.clientId, nome: m.nome, jid: m.grupo!.jid }))),
    [donos, mudancas],
  );
  const faltaConfirmar = conflitos.filter((c) => c.outros.some((o) => !(compartilhar[c.clientId] ?? []).includes(o.clientId)));

  // Grupos com mais de um cliente na tela — risco de um ver o relatório do outro. Não bloqueia
  // (Veneza e Bazar Ribeiro dividem de propósito); só destaca.
  const groupCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const g = edit[r.clientId]?.jid;
    if (g) acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});
  const dupGroupJids = Object.entries(groupCounts).filter(([, n]) => n > 1).map(([jid]) => jid);
  const mappedCount = rows.filter((r) => edit[r.clientId]?.jid).length;

  const mudar = (clientId: string, patch: Partial<EstadoLinha>) => {
    setEdit((s) => ({ ...s, [clientId]: { ...s[clientId], ...patch } }));
  };
  const desfazerLinha = (clientId: string) => {
    const b = base[clientId];
    if (!b) return;
    setEdit((s) => ({ ...s, [clientId]: { ...b, alertas: { ...b.alertas } } }));
    setCompartilhar((s) => { const n = { ...s }; delete n[clientId]; return n; });
  };

  const linhasDoResumo = (m: MudancaCliente): string[] => {
    const b = base[m.clientId];
    return resumoDaMudanca(m, {
      jid: b?.jid || null,
      nomeGrupo: b?.jid ? nomeDoGrupo(b.jid) : null,
      verba: b ? lerVerbaMinima(b.verba) ?? null : null,
      alertas: b?.alertas ?? (m.alertas as AlertasCliente),
    });
  };

  async function salvar() {
    if (!mudancas.length || erros.length || faltaConfirmar.length) return;
    setSaving(true);
    try {
      const mappings = mudancas.map((m) => ({
        clientId: m.clientId,
        ...(m.grupo ? { groupJid: m.grupo.jid, groupName: m.grupo.nome, compartilharCom: compartilhar[m.clientId] ?? [] } : {}),
        ...(m.verbaMinima !== undefined ? { verbaMinima: m.verbaMinima } : {}),
        ...(m.alertas ? { alerts: m.alertas } : {}),
      }));
      const res = await chamar<RespostaPost>("/api/clients/group-mapping", { mappings });
      if (!res.ok) {
        // 409: outro cliente pegou o grupo depois que a tela abriu. Relê os donos: o conflito novo
        // aparece no resumo (que continua aberto) para confirmar ou trocar o grupo.
        if (res.status === 409) {
          const r2 = await chamar<RespostaGet>("/api/clients/group-mapping");
          if (r2.ok && r2.data?.donosGrupos) setDonos(r2.data.donosGrupos);
        }
        toast.error(res.erro ?? "Não consegui salvar. Nada foi gravado.");
        return;
      }
      const corpo: RespostaPost = res.data ?? { ok: true };
      const salvos = new Set(corpo.salvos ?? mudancas.map((m) => m.clientId));
      if (corpo.ok) {
        toast.success(salvos.size === 1 ? "1 cliente salvo." : `${salvos.size} clientes salvos.`);
        await load();
        return;
      }
      // Parte salvou, parte não: a base anda só para quem salvou; o resto continua pendente na tela.
      setBase((s) => {
        const n = { ...s };
        for (const id of salvos) if (edit[id]) n[id] = { ...edit[id], alertas: { ...edit[id].alertas } };
        return n;
      });
      setRevisando(false);
      toast.error(corpo.error ?? "Alguns clientes não foram salvos — confira e salve de novo.", { duration: 12000 });
    } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (erroCarga) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        <div className="rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-lone-danger shrink-0" />
          <p className="flex-1 text-xs text-lone-danger">{erroCarga}</p>
          <button onClick={load} className="text-xs font-medium text-lone-danger underline">Tentar de novo</button>
        </div>
      </div>
    );
  }

  const pendentes = mudancas.length;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Grupos dos Clientes (WhatsApp)</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Vincule cada cliente ao seu grupo — relatório, suporte e calendário vão para o grupo escolhido aqui.
            A sugestão pelo nome só entra se você clicar em <b className="text-foreground">Usar sugestão</b>. {mappedCount}/{rows.length} vinculados.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            A coluna <b className="text-foreground">Verba mín</b> vem <b className="text-foreground">sincronizada</b> da verba mensal de Tráfego › Contas &amp; Verba. Alerta em 2 níveis: <b className="text-foreground">{warnPct}%</b> (baixa) e <b className="text-foreground">{critPct}%</b> (crítica) da verba mensal. Só preencha pra exceções.
            Os alertas de saldo vão sempre para o grupo interno do tráfego — o cliente não é avisado por aqui.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => (pendentes ? setConfirmarDescarte(true) : load())}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs hover:border-primary"
          >
            <RefreshCw size={12} /> Recarregar
          </button>
          <button
            onClick={() => setRevisando(true)}
            disabled={saving || !pendentes || erros.length > 0}
            title={erros.length ? "Corrija o valor marcado em vermelho antes de salvar." : !pendentes ? "Nada mudou." : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar{pendentes ? ` (${pendentes})` : ""}
          </button>
        </div>
      </div>

      {confirmarDescarte && (
        <div role="alert" className="rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle size={14} className="text-lone-warning shrink-0" />
          <p className="flex-1 text-xs text-foreground">Recarregar descarta {pendentes} alteração(ões) que ainda não foram salvas.</p>
          <button onClick={() => setConfirmarDescarte(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-surface">Continuar editando</button>
          <button onClick={() => { setConfirmarDescarte(false); load(); }} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">Descartar e recarregar</button>
        </div>
      )}

      {revisando && pendentes > 0 && (
        <div className="rounded-xl border border-lone-info-border bg-lone-info-bg px-4 py-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium text-foreground">Confira antes de salvar — só isto vai ser gravado:</p>
            <button onClick={() => setRevisando(false)} aria-label="Fechar resumo" className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          <ul className="space-y-1">
            {mudancas.flatMap((m) => linhasDoResumo(m).map((t, i) => (
              <li key={`${m.clientId}-${i}`} className="text-[11px] text-foreground">• {t}</li>
            )))}
          </ul>
          {conflitos.length > 0 && (
            <div className="space-y-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3">
              <p className="text-[11px] font-medium text-lone-warning flex items-center gap-1.5">
                <AlertTriangle size={12} /> Grupo que já é de outro cliente — só salva se for de propósito (mesmo dono):
              </p>
              {conflitos.map((c) => {
                const marcado = c.outros.every((o) => (compartilhar[c.clientId] ?? []).includes(o.clientId));
                const outros = c.outros.map((o) => (o.ativo ? o.nome : `${o.nome} (inativo)`)).join(", ");
                return (
                  <label key={c.clientId} className="flex items-start gap-2 text-[11px] text-foreground cursor-pointer">
                    <input
                      type="checkbox" className="mt-0.5" checked={marcado}
                      onChange={(e) => setCompartilhar((s) => ({ ...s, [c.clientId]: e.target.checked ? c.outros.map((o) => o.clientId) : [] }))}
                    />
                    <span>
                      <b>{c.nome}</b> vai para o grupo <b>&quot;{nomeDoGrupo(c.jid) ?? c.jid}&quot;</b>, que já é de <b>{outros}</b>.
                      {" "}Os dois passam a receber relatório e suporte no mesmo grupo. É o mesmo dono — compartilhar.
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => setRevisando(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-surface">Voltar e editar</button>
            <button
              onClick={salvar}
              disabled={saving || faltaConfirmar.length > 0}
              title={faltaConfirmar.length ? "Confirme o compartilhamento ou troque o grupo." : undefined}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Confirmar e salvar
            </button>
          </div>
        </div>
      )}

      {dupGroupJids.length > 0 && (
        <div className="rounded-xl bg-lone-warning-bg border border-lone-warning-border px-4 py-3">
          <p className="text-xs text-lone-warning font-medium flex items-center gap-1.5">
            <AlertTriangle size={13} /> {dupGroupJids.length} grupo(s) com mais de um cliente — confira (pode ser proposital, ex.: mesmo dono; senão um vê o relatório do outro):
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {dupGroupJids.map((jid) => {
              const inGroup = rows.filter((r) => edit[r.clientId]?.jid === jid).map((r) => r.clientName);
              return <li key={jid} className="text-[11px] text-muted-foreground">• <b className="text-foreground">{nomeDoGrupo(jid) ?? jid}</b>: {inGroup.join(" + ")}</li>;
            })}
          </ul>
        </div>
      )}

      {/* Tabela larga: no celular rola de lado em vez de espremer as colunas. */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <div className="min-w-[860px]">
        <div className="grid grid-cols-[1.1fr_1.5fr_120px_210px_96px] gap-3 px-4 py-2.5 bg-card border-b border-border">
          {["Cliente", "Grupo WhatsApp", "Verba mín (R$)", "Alertas", "Situação"].map((h) => (
            <p key={h} className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{h}</p>
          ))}
        </div>
        {rows.map((r) => {
          const e = edit[r.clientId];
          if (!e) return null;
          const mudou = mudouPorCliente.has(r.clientId);
          const erroVerba = erroPorCliente.get(r.clientId);
          const isDup = !!e.jid && groupCounts[e.jid] > 1;
          const sug = r.suggestion;
          const mostraSugestao = !e.jid && !!sug.groupId && sug.confidence !== "none";
          return (
            <div
              key={r.clientId}
              className={cn(
                "grid grid-cols-[1.1fr_1.5fr_120px_210px_96px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-start border-l-2",
                mudou ? "border-l-primary bg-lone-brand-bg-soft" : isDup ? "border-l-lone-danger" : !e.jid ? "border-l-lone-warning" : "border-l-transparent",
              )}
            >
              <p className="text-sm text-foreground truncate pt-1" title={r.metaAccountId}>
                {r.clientName}
                {isDup && <span title="Grupo repetido — confira" className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] text-lone-danger font-medium whitespace-nowrap"><AlertTriangle size={9} aria-hidden="true" /> repetido</span>}
              </p>
              <div className="space-y-1 min-w-0">
                <select
                  value={e.jid}
                  onChange={(ev) => mudar(r.clientId, { jid: ev.target.value })}
                  aria-label={`Grupo de ${r.clientName}`}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">— sem grupo —</option>
                  {e.jid && !groups.some((g) => g.id === e.jid) && (
                    <option value={e.jid}>{nomeDoGrupo(e.jid) ?? e.jid}</option>
                  )}
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.subject}</option>)}
                </select>
                {mostraSugestao && (
                  <button
                    type="button"
                    onClick={() => mudar(r.clientId, { jid: sug.groupId! })}
                    title={`Sugestão pelo nome (confiança ${CONF_LABEL[sug.confidence]}). Confira se o grupo é mesmo deste cliente.`}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline text-left"
                  >
                    <Lightbulb size={10} aria-hidden="true" /> Usar sugestão: {sug.groupName} <span className="text-muted-foreground">({CONF_LABEL[sug.confidence]})</span>
                  </button>
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="text" inputMode="decimal"
                  placeholder={r.monthlyBudget != null ? `sync R$ ${Math.round((r.monthlyBudget * warnPct) / 100)}` : `${warnPct}% global`}
                  value={e.verba}
                  onChange={(ev) => mudar(r.clientId, { verba: ev.target.value })}
                  onBlur={(ev) => mudar(r.clientId, { verba: mascararReais(ev.target.value) })}
                  aria-invalid={!!erroVerba}
                  title={r.monthlyBudget != null
                    ? `Sincronizado (verba R$ ${r.monthlyBudget}): baixa ${warnPct}% = R$ ${Math.round((r.monthlyBudget * warnPct) / 100)} · crítica ${critPct}% = R$ ${Math.round((r.monthlyBudget * critPct) / 100)}. Preencha só pra um limite diferente deste cliente.`
                    : `Verba mínima (R$). Vazio = ${warnPct}% (baixa) / ${critPct}% (crítica) da verba mensal (Tráfego › Contas & Verba).`}
                  className={cn(
                    "w-full bg-surface border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary",
                    erroVerba ? "border-lone-danger" : "border-border",
                  )}
                />
                {erroVerba && <p className="text-[10px] text-lone-danger">{erroVerba}</p>}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {CHAVES_ALERTA.map((key) => {
                  const on = e.alertas[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      title={`${ROTULO_ALERTA[key]} — clique pra ligar/desligar`}
                      onClick={() => mudar(r.clientId, { alertas: { ...e.alertas, [key]: !on } })}
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                        on ? "bg-lone-success-bg text-lone-success border-lone-success-border" : "bg-surface text-muted-foreground border-border",
                      )}
                    >
                      {ROTULO_ALERTA[key]}
                    </button>
                  );
                })}
              </div>
              <div className="pt-1">
                {mudou ? (
                  <button
                    type="button" onClick={() => desfazerLinha(r.clientId)}
                    title="Volta esta linha para o que está salvo"
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <Undo2 size={10} aria-hidden="true" /> Desfazer
                  </button>
                ) : e.jid ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-lone-success"><CheckCircle size={10} aria-hidden="true" /> vinculado</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-lone-warning"><AlertTriangle size={10} aria-hidden="true" /> sem grupo</span>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
