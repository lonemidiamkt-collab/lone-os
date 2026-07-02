"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useRole } from "@/lib/context/RoleContext";
import KanbanBoard, { type KanbanColumn } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/button";
import { CRM_ESTAGIOS, type CrmEstagio, type CrmLead } from "@/lib/types";
import { Plus, X } from "lucide-react";

const ESTAGIO_META: Record<CrmEstagio, { title: string; color: string }> = {
  lead:      { title: "🆕 Novo lead", color: "bg-blue-500" },
  orcamento: { title: "💰 Orçamento",  color: "bg-amber-500" },
  proposta:  { title: "📄 Proposta",   color: "bg-violet-500" },
  reuniao:   { title: "📅 Reunião",    color: "bg-cyan-500" },
  ganho:     { title: "✅ Ganho",      color: "bg-emerald-500" },
  perdido:   { title: "❌ Perdido",    color: "bg-rose-500" },
};

const brl = (v: number | null) =>
  v == null ? null : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtData = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);

type Draft = Partial<CrmLead> & { estagio: CrmEstagio };

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

export default function CrmPage() {
  const { role, currentUser } = useRole();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null); // aberto = modal de add/editar
  const [saving, setSaving] = useState(false);

  const podeVer = role === "admin" || role === "manager" || role === "comercial";

  useEffect(() => {
    if (!podeVer) { setLoading(false); return; }
    authedFetch("/api/crm/leads")
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }, [podeVer]);

  const columns: KanbanColumn<CrmLead>[] = useMemo(
    () =>
      CRM_ESTAGIOS.map((e) => ({
        id: e,
        title: ESTAGIO_META[e].title,
        color: ESTAGIO_META[e].color,
        items: leads.filter((l) => l.estagio === e),
      })),
    [leads]
  );

  // Valor em jogo = soma dos orçamentos das etapas abertas (não ganho/perdido).
  const emJogo = leads
    .filter((l) => l.estagio !== "ganho" && l.estagio !== "perdido")
    .reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);
  const ganho = leads.filter((l) => l.estagio === "ganho").reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);

  async function moverEstagio(id: string, _from: string, to: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estagio: to as CrmEstagio } : l)));
    await authedFetch("/api/crm/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estagio: to }),
    }).catch(() => {});
  }

  async function excluir(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await authedFetch(`/api/crm/leads?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function salvar() {
    if (!draft?.contatoNome?.trim()) return;
    setSaving(true);
    const editando = !!draft.id;
    const payload = {
      ...(editando ? { id: draft.id } : {}),
      contatoNome: draft.contatoNome, empresa: draft.empresa ?? null, telefone: draft.telefone ?? null,
      email: draft.email ?? null, valorOrcamento: draft.valorOrcamento ?? null, estagio: draft.estagio,
      origem: draft.origem ?? null, responsavel: draft.responsavel ?? currentUser ?? null,
      reuniaoData: draft.reuniaoData ?? null, observacoes: draft.observacoes ?? null,
      motivoPerda: draft.motivoPerda ?? null,
    };
    const r = await authedFetch("/api/crm/leads", {
      method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const { lead } = await r.json();
      setLeads((prev) => (editando ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]));
      setDraft(null);
    }
    setSaving(false);
  }

  if (!podeVer) return <div className="p-8 text-sm text-destructive">Esta área é do time comercial.</div>;
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando o funil…</div>;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🤝 Comercial — Funil SDR</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} leads · <span className="text-foreground font-medium">{brl(emJogo)}</span> em jogo · {brl(ganho)} ganho
          </p>
        </div>
        <Button onClick={() => setDraft({ estagio: "lead", responsavel: currentUser ?? undefined })}>
          <Plus size={16} className="mr-1" /> Novo lead
        </Button>
      </header>

      <KanbanBoard<CrmLead>
        columns={columns}
        onMove={moverEstagio}
        onAdd={(colId) => setDraft({ estagio: colId as CrmEstagio, responsavel: currentUser ?? undefined })}
        onEdit={(lead) => setDraft({ ...lead })}
        onDelete={excluir}
        renderCard={(l) => (
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="font-medium text-foreground">{l.contatoNome}</div>
            {l.empresa && <div className="text-xs text-muted-foreground">{l.empresa}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {l.valorOrcamento != null && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">{brl(l.valorOrcamento)}</span>
              )}
              {l.reuniaoData && (
                <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-500">📅 {fmtData(l.reuniaoData)}</span>
              )}
              {l.origem && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{l.origem}</span>}
            </div>
            {l.responsavel && <div className="mt-1 text-[10px] text-muted-foreground">{l.responsavel}</div>}
          </div>
        )}
      />

      {/* Modal add/editar lead */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDraft(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{draft.id ? "Editar lead" : "Novo lead"}</h2>
              <button onClick={() => setDraft(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Contato *</label>
                <input className={inputCls} value={draft.contatoNome ?? ""} onChange={(e) => setDraft({ ...draft, contatoNome: e.target.value })} placeholder="Nome de quem você falou" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Empresa</label>
                  <input className={inputCls} value={draft.empresa ?? ""} onChange={(e) => setDraft({ ...draft, empresa: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Valor do orçamento (R$)</label>
                  <input type="number" className={inputCls} value={draft.valorOrcamento ?? ""} onChange={(e) => setDraft({ ...draft, valorOrcamento: e.target.value === "" ? null : Number(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Telefone</label>
                  <input className={inputCls} value={draft.telefone ?? ""} onChange={(e) => setDraft({ ...draft, telefone: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">E-mail</label>
                  <input className={inputCls} value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Etapa</label>
                  <select className={inputCls} value={draft.estagio} onChange={(e) => setDraft({ ...draft, estagio: e.target.value as CrmEstagio })}>
                    {CRM_ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_META[e].title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Origem</label>
                  <input className={inputCls} value={draft.origem ?? ""} onChange={(e) => setDraft({ ...draft, origem: e.target.value })} placeholder="indicação, tráfego…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Data da reunião</label>
                  <input type="date" className={inputCls} value={draft.reuniaoData ?? ""} onChange={(e) => setDraft({ ...draft, reuniaoData: e.target.value || null })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Responsável</label>
                  <input className={inputCls} value={draft.responsavel ?? ""} onChange={(e) => setDraft({ ...draft, responsavel: e.target.value })} />
                </div>
              </div>
              {draft.estagio === "perdido" && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Motivo da perda</label>
                  <input className={inputCls} value={draft.motivoPerda ?? ""} onChange={(e) => setDraft({ ...draft, motivoPerda: e.target.value })} />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Observações</label>
                <textarea className={inputCls} rows={3} value={draft.observacoes ?? ""} onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving || !draft.contatoNome?.trim()}>{saving ? "Salvando…" : draft.id ? "Salvar" : "Criar lead"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
