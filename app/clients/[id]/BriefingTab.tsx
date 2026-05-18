"use client";

import { useState, useEffect, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { useRole } from "@/lib/context/RoleContext";
import type { BriefingWithMeta } from "@/lib/types/briefing";

// ── helpers ──────────────────────────────────────────────────

function arr(v: string[] | undefined | null): string {
  return (v ?? []).join("\n");
}
function splitArr(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}

// ── sub-components ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-primary mb-1">{label}</p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-primary mb-1">{label}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground flex gap-2">
            <span className="text-muted-foreground shrink-0">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoolBadge({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mr-2 mb-1 ${
      value ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-400"
    }`}>
      {value ? "✓" : "✗"} {label}
    </span>
  );
}

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-3 mb-5 p-3 bg-muted/40 rounded-xl border border-border">
      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-foreground tabular-nums w-10 text-right">{pct}%</span>
      <span className="text-xs text-muted-foreground">completo</span>
    </div>
  );
}

// ── edit form ─────────────────────────────────────────────────

const TOM_OPTIONS = [
  { value: "", label: "Não definido" },
  { value: "formal", label: "Formal" },
  { value: "informal", label: "Informal" },
  { value: "divertido", label: "Divertido" },
  { value: "tecnico", label: "Técnico" },
  { value: "misto", label: "Misto" },
];
const PESSOA_OPTIONS = [
  { value: "", label: "Não definido" },
  { value: "voce", label: "Você" },
  { value: "voces", label: "Vocês" },
  { value: "tu", label: "Tu" },
  { value: "a_gente", label: "A gente" },
];

type FormState = {
  resumo_estrategico: string;
  produtos: string;
  publico_alvo: string;
  posicionamento: string;
  dores: string;
  ganchos: string;
  ctas: string;
  observacoes_estrategicas: string;
  tipografia: string;
  logo_url: string;
  referencias_visuais: string;
  elementos_evitar: string;
  tom_voz: string;
  pessoa_verbal: string;
  usa_emoji: string;
  usa_giria: string;
  palavras_proibidas: string;
  hashtags_padrao: string;
  horarios_preferidos: string;
  produtos_destaque_atual: string;
  concorrentes_evitar_mencionar: string;
  observacoes_internas: string;
};

function emptyForm(): FormState {
  return {
    resumo_estrategico: "", produtos: "", publico_alvo: "", posicionamento: "",
    dores: "", ganchos: "", ctas: "", observacoes_estrategicas: "",
    tipografia: "", logo_url: "", referencias_visuais: "", elementos_evitar: "",
    tom_voz: "", pessoa_verbal: "", usa_emoji: "", usa_giria: "",
    palavras_proibidas: "", hashtags_padrao: "", horarios_preferidos: "",
    produtos_destaque_atual: "", concorrentes_evitar_mencionar: "", observacoes_internas: "",
  };
}

function briefingToForm(b: BriefingWithMeta): FormState {
  return {
    resumo_estrategico: b.resumo_estrategico ?? "",
    produtos: arr(b.produtos),
    publico_alvo: arr(b.publico_alvo),
    posicionamento: b.posicionamento ?? "",
    dores: arr(b.dores),
    ganchos: arr(b.ganchos),
    ctas: arr(b.ctas),
    observacoes_estrategicas: b.observacoes_estrategicas ?? "",
    tipografia: b.tipografia ?? "",
    logo_url: b.logo_url ?? "",
    referencias_visuais: arr(b.referencias_visuais),
    elementos_evitar: arr(b.elementos_evitar),
    tom_voz: b.tom_voz ?? "",
    pessoa_verbal: b.pessoa_verbal ?? "",
    usa_emoji: b.usa_emoji === null ? "" : String(b.usa_emoji),
    usa_giria: b.usa_giria === null ? "" : String(b.usa_giria),
    palavras_proibidas: arr(b.palavras_proibidas),
    hashtags_padrao: arr(b.hashtags_padrao),
    horarios_preferidos: b.horarios_preferidos ?? "",
    produtos_destaque_atual: arr(b.produtos_destaque_atual),
    concorrentes_evitar_mencionar: arr(b.concorrentes_evitar_mencionar),
    observacoes_internas: b.observacoes_internas ?? "",
  };
}

function formToPayload(f: FormState) {
  const boolOrNull = (v: string) => v === "" ? null : v === "true";
  return {
    resumo_estrategico: f.resumo_estrategico || null,
    produtos: splitArr(f.produtos),
    publico_alvo: splitArr(f.publico_alvo),
    posicionamento: f.posicionamento || null,
    dores: splitArr(f.dores),
    ganchos: splitArr(f.ganchos),
    ctas: splitArr(f.ctas),
    observacoes_estrategicas: f.observacoes_estrategicas || null,
    tipografia: f.tipografia || null,
    logo_url: f.logo_url || null,
    referencias_visuais: splitArr(f.referencias_visuais),
    elementos_evitar: splitArr(f.elementos_evitar),
    tom_voz: f.tom_voz || null,
    pessoa_verbal: f.pessoa_verbal || null,
    usa_emoji: boolOrNull(f.usa_emoji),
    usa_giria: boolOrNull(f.usa_giria),
    palavras_proibidas: splitArr(f.palavras_proibidas),
    hashtags_padrao: splitArr(f.hashtags_padrao),
    horarios_preferidos: f.horarios_preferidos || null,
    produtos_destaque_atual: splitArr(f.produtos_destaque_atual),
    concorrentes_evitar_mencionar: splitArr(f.concorrentes_evitar_mencionar),
    observacoes_internas: f.observacoes_internas || null,
  };
}

// ── main component ────────────────────────────────────────────

export default function BriefingTab({ clientId }: { clientId: string }) {
  const { role } = useRole();
  const canEdit = role === "admin" || role === "manager";

  const [briefing, setBriefing] = useState<BriefingWithMeta | null>(null);
  const [totalVersions, setTotalVersions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/briefing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBriefing(data.briefing ?? null);
      setTotalVersions(data.total_versions ?? 0);
    } catch (err) {
      Sentry.captureException(err, { extra: { client_id: clientId, context: "BriefingTab.load" } });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = () => {
    setForm(briefing ? briefingToForm(briefing) : emptyForm());
    setSaveError(null);
    setEditing(true);
  };

  const handleCancel = () => { setEditing(false); setSaveError(null); };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBriefing(data.briefing);
      setTotalVersions(data.total_versions);
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      setSaveError(msg);
      Sentry.captureException(err, { extra: { client_id: clientId, context: "BriefingTab.save" } });
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-pulse space-y-3 py-6">
        {[200, 120, 160, 100].map((w, i) => (
          <div key={i} className="h-3 bg-muted rounded" style={{ width: w }} />
        ))}
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────
  if (editing) {
    const ta = (field: keyof FormState, rows = 3, placeholder = "") => (
      <textarea
        rows={rows}
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none"
      />
    );
    const inp = (field: keyof FormState, placeholder = "") => (
      <input
        type="text"
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
      />
    );
    const sel = (field: keyof FormState, options: { value: string; label: string }[]) => (
      <select
        value={form[field]}
        onChange={set(field)}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    const label = (text: string) => (
      <p className="text-xs font-medium text-muted-foreground mb-1">{text}</p>
    );
    const hint = (text: string) => (
      <p className="text-[11px] text-zinc-600 mt-0.5">{text}</p>
    );

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">
              {briefing ? `Editar Briefing — v${briefing.version + 1}` : "Novo Briefing"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Salvar cria uma nova versão. Versões anteriores são preservadas.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCancel} className="btn-ghost text-sm px-4 py-2">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar briefing"}
            </button>
          </div>
        </div>

        {saveError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {saveError}
          </div>
        )}

        {/* ── Estratégia ──────────────────────────────────── */}
        <div className="card space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Estratégia</h3>

          <div>{label("Resumo estratégico")}{ta("resumo_estrategico", 4, "Visão geral do cliente, mercado e postura de comunicação…")}</div>
          <div>{label("Posicionamento")}{ta("posicionamento", 3, "Como o cliente deve ser posicionado frente ao público…")}</div>

          <div className="grid grid-cols-2 gap-4">
            <div>{label("Produtos / serviços (um por linha)")}{ta("produtos", 4)}</div>
            <div>{label("Público-alvo / ICP (um por linha)")}{ta("publico_alvo", 4)}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>{label("Dores e objeções (uma por linha)")}{ta("dores", 4)}</div>
            <div>{label("Ganchos úteis (um por linha)")}{ta("ganchos", 4)}</div>
          </div>

          <div>{label("CTAs recomendadas (uma por linha)")}{ta("ctas", 3)}</div>
          <div>{label("Observações estratégicas")}{ta("observacoes_estrategicas", 3)}</div>
        </div>

        {/* ── Identidade Visual ────────────────────────────── */}
        <div className="card space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Identidade Visual</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>{label("Tipografia")}{inp("tipografia", "Ex: Inter, Montserrat…")}</div>
            <div>{label("URL do logo")}{inp("logo_url", "https://…")}</div>
          </div>
          <div>{label("Referências visuais (uma por linha)")}{ta("referencias_visuais", 3)}</div>
          <div>{label("Elementos a evitar (um por linha)")}{ta("elementos_evitar", 3)}</div>
        </div>

        {/* ── Voz e Tom ──────────────────────────────────────── */}
        <div className="card space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Voz e Tom</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>{label("Tom de voz")}{sel("tom_voz", TOM_OPTIONS)}</div>
            <div>{label("Pessoa verbal")}{sel("pessoa_verbal", PESSOA_OPTIONS)}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              {label("Usa emoji?")}
              {sel("usa_emoji", [{ value: "", label: "Não definido" }, { value: "true", label: "Sim" }, { value: "false", label: "Não" }])}
            </div>
            <div>
              {label("Usa gíria?")}
              {sel("usa_giria", [{ value: "", label: "Não definido" }, { value: "true", label: "Sim" }, { value: "false", label: "Não" }])}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>{label("Palavras proibidas (uma por linha)")}{ta("palavras_proibidas", 3)}</div>
            <div>{label("Hashtags padrão (uma por linha)")}{ta("hashtags_padrao", 3)}{hint("Sem #, só o texto")}</div>
          </div>
        </div>

        {/* ── Operação ──────────────────────────────────────── */}
        <div className="card space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Operação</h3>
          <div>{label("Horários preferidos de publicação")}{inp("horarios_preferidos", "Ex: Seg-Sex 18h, Sab 10h")}</div>
          <div>{label("Produtos em destaque agora (um por linha)")}{ta("produtos_destaque_atual", 3)}</div>
          <div>{label("Concorrentes a não mencionar (um por linha)")}{ta("concorrentes_evitar_mencionar", 2)}</div>
        </div>

        {/* ── Interno ────────────────────────────────────────── */}
        <div className="card space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Interno <span className="text-zinc-600 normal-case font-normal">(só staff, nunca exibido ao cliente)</span>
          </h3>
          <div>{label("Observações internas")}{ta("observacoes_internas", 3, "Contexto sensível, histórico de conflitos, acordos informais…")}</div>
        </div>
      </div>
    );
  }

  // ── Read mode ────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-foreground">Briefing Estratégico</h2>
          {briefing && (
            <p className="text-xs text-muted-foreground mt-0.5">
              v{briefing.version}
              {briefing.created_by_name && ` · por ${briefing.created_by_name}`}
              {briefing.created_at && ` · ${new Date(briefing.created_at).toLocaleDateString("pt-BR")}`}
              {totalVersions > 1 && ` · ${totalVersions} versões`}
            </p>
          )}
        </div>
        {canEdit && (
          <button onClick={handleEdit} className="btn-primary text-sm px-4 py-2 shrink-0">
            {briefing ? "Editar" : "+ Criar briefing"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {!briefing && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nenhum briefing cadastrado para este cliente.</p>
          {canEdit && (
            <p className="text-xs mt-1">Clique em "Criar briefing" para começar.</p>
          )}
          {!canEdit && (
            <p className="text-xs mt-1">Solicite ao gestor que cadastre o briefing.</p>
          )}
        </div>
      )}

      {/* Briefing content */}
      {briefing && (
        <>
          <CompletenessBar pct={briefing.completeness_percent} />

          {/* Estratégia */}
          <div className="card space-y-0">
            <Section title="Estratégia">
              <Field label="Resumo estratégico" value={briefing.resumo_estrategico} />
              <Field label="Posicionamento" value={briefing.posicionamento} />
              <ListField label="Produtos / serviços" items={briefing.produtos} />
              <ListField label="Público-alvo / ICP" items={briefing.publico_alvo} />
              <ListField label="Dores e objeções" items={briefing.dores} />
              <ListField label="Ganchos úteis" items={briefing.ganchos} />
              <ListField label="CTAs recomendadas" items={briefing.ctas} />
              <Field label="Observações estratégicas" value={briefing.observacoes_estrategicas} />
            </Section>
          </div>

          {/* Identidade Visual */}
          {(briefing.tipografia || briefing.logo_url || briefing.referencias_visuais.length > 0 || briefing.elementos_evitar.length > 0) && (
            <div className="card">
              <Section title="Identidade Visual">
                <Field label="Tipografia" value={briefing.tipografia} />
                <Field label="Logo URL" value={briefing.logo_url} />
                <ListField label="Referências visuais" items={briefing.referencias_visuais} />
                <ListField label="Elementos a evitar" items={briefing.elementos_evitar} />
              </Section>
            </div>
          )}

          {/* Voz e Tom */}
          {(briefing.tom_voz || briefing.pessoa_verbal || briefing.usa_emoji !== null || briefing.palavras_proibidas.length > 0) && (
            <div className="card">
              <Section title="Voz e Tom">
                <div className="flex flex-wrap mb-3">
                  {briefing.tom_voz && (
                    <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary mr-2 mb-1 capitalize">
                      Tom: {briefing.tom_voz}
                    </span>
                  )}
                  {briefing.pessoa_verbal && (
                    <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary mr-2 mb-1">
                      Pessoa: {briefing.pessoa_verbal.replace("_", " ")}
                    </span>
                  )}
                  <BoolBadge label="Emoji" value={briefing.usa_emoji} />
                  <BoolBadge label="Gíria" value={briefing.usa_giria} />
                </div>
                <ListField label="Palavras proibidas" items={briefing.palavras_proibidas} />
                <ListField label="Hashtags padrão" items={briefing.hashtags_padrao} />
              </Section>
            </div>
          )}

          {/* Operação */}
          {(briefing.horarios_preferidos || briefing.produtos_destaque_atual.length > 0 || briefing.concorrentes_evitar_mencionar.length > 0) && (
            <div className="card">
              <Section title="Operação">
                <Field label="Horários preferidos" value={briefing.horarios_preferidos} />
                <ListField label="Produtos em destaque" items={briefing.produtos_destaque_atual} />
                <ListField label="Concorrentes a não mencionar" items={briefing.concorrentes_evitar_mencionar} />
              </Section>
            </div>
          )}

          {/* Interno — só staff */}
          {briefing.observacoes_internas && (role === "admin" || role === "manager" || role === "traffic" || role === "social" || role === "designer") && (
            <div className="card border-amber-500/20">
              <Section title="Interno (apenas staff)">
                <Field label="" value={briefing.observacoes_internas} />
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
