"use client";

// /jornada — Painel de Jornada do CS. Responde as 8 perguntas por cliente (saudável/atenção/risco/
// pendências/atrasados/info do cliente/percepção de valor/próxima ação) + edição da ficha de
// relacionamento. SEM financeiro. Reaproveita health + sentimento + esfriando + cards atrasados.

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Pend { item: string; desde?: string; impacto?: string }
interface Ficha {
  clientId: string; nome: string; estado: string; healthLevel: string | null; healthScore: number | null;
  risco: { nivel: string; motivos: string[] }; cardsAtrasados: number; pendenciasCliente: Pend[];
  proximaAcao: string | null; responsavel: string | null; prazo: string | null; temProximaAcao: boolean;
  percebeValor: boolean; proximaReuniao: string | null; ultimaReuniao: string | null; notas: string | null;
  diasSemFalar: number | null;
}

const RISCO_COR: Record<string, string> = {
  saudavel: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  atencao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  risco: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  critico: "bg-red-500/15 text-red-600 dark:text-red-400",
};
const RISCO_LABEL: Record<string, string> = { saudavel: "Saudável", atencao: "Atenção", risco: "Risco", critico: "Crítico" };
type Filtro = "todos" | "risco" | "atencao" | "pendencias" | "sem_acao" | "sem_valor" | "atrasados";

export default function JornadaPage() {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const carregar = () => {
    setLoading(true);
    authedFetch("/api/cs/jornada").then((r) => r.json()).then((d) => setFichas(d.fichas ?? [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { carregar(); }, []);

  const insights = useMemo(() => ({
    risco: fichas.filter((f) => f.risco.nivel === "risco" || f.risco.nivel === "critico").length,
    atencao: fichas.filter((f) => f.risco.nivel === "atencao").length,
    semAcao: fichas.filter((f) => !f.temProximaAcao).length,
    pendCliente: fichas.filter((f) => f.pendenciasCliente.length > 0).length,
    atrasados: fichas.filter((f) => f.cardsAtrasados > 0).length,
    semValor: fichas.filter((f) => !f.percebeValor).length,
  }), [fichas]);

  const lista = useMemo(() => {
    const f = fichas;
    switch (filtro) {
      case "risco": return f.filter((x) => x.risco.nivel === "risco" || x.risco.nivel === "critico");
      case "atencao": return f.filter((x) => x.risco.nivel === "atencao");
      case "pendencias": return f.filter((x) => x.cardsAtrasados > 0 || x.pendenciasCliente.length > 0);
      case "sem_acao": return f.filter((x) => !x.temProximaAcao);
      case "sem_valor": return f.filter((x) => !x.percebeValor);
      case "atrasados": return f.filter((x) => x.cardsAtrasados > 0);
      default: return f;
    }
  }, [fichas, filtro]);

  const abrirEdicao = (f: Ficha) => {
    setEditId(f.clientId);
    setForm({
      proximaAcao: f.proximaAcao ?? "", responsavel: f.responsavel ?? "", prazo: f.prazo ?? "",
      estado: f.estado ?? "", notas: f.notas ?? "",
      pendencias: f.pendenciasCliente.map((p) => p.item).join("\n"),
      proximaReuniao: f.proximaReuniao ?? "", ultimaReuniao: f.ultimaReuniao ?? "",
    });
  };
  const salvar = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/cs/jornada", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: editId, proximaAcao: form.proximaAcao, responsavel: form.responsavel, prazo: form.prazo || null,
          estado: form.estado || null, notas: form.notas,
          pendenciasCliente: form.pendencias.split("\n").map((s) => s.trim()).filter(Boolean).map((item) => ({ item })),
          proximaReuniao: form.proximaReuniao || null, ultimaReuniao: form.ultimaReuniao || null,
        }),
      });
      setEditId("");
      carregar();
    } finally { setSaving(false); }
  };

  const chips: [Filtro, string, number | null][] = [
    ["todos", "Todos", fichas.length], ["risco", "Em risco", insights.risco], ["atencao", "Atenção", insights.atencao],
    ["sem_acao", "Sem próxima ação", insights.semAcao], ["pendencias", "Com pendências", insights.pendCliente + insights.atrasados > 0 ? insights.pendCliente : null],
    ["atrasados", "Entregas atrasadas", insights.atrasados], ["sem_valor", "Não percebe valor", insights.semValor],
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Jornada do cliente (CS)</h1>
        <p className="text-sm text-muted-foreground">Saúde, risco, pendências e a próxima ação de cada cliente — num lugar só.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {chips.map(([f, label, n]) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filtro === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
            {label}{n != null ? ` · ${n}` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {lista.length === 0 && <p className="text-sm text-muted-foreground p-4">Nenhum cliente neste filtro.</p>}
          {lista.map((f) => (
            <div key={f.clientId} className="p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{f.nome}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${RISCO_COR[f.risco.nivel] || "bg-muted"}`}>{RISCO_LABEL[f.risco.nivel] || f.risco.nivel}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{f.estado}</span>
                    {f.cardsAtrasados > 0 && <span className="text-[11px] text-orange-500">⏳ {f.cardsAtrasados} atrasado(s)</span>}
                    {f.pendenciasCliente.length > 0 && <span className="text-[11px] text-amber-500">📋 {f.pendenciasCliente.length} do cliente</span>}
                    {!f.percebeValor && <span className="text-[11px] text-muted-foreground">⚠️ valor</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {f.temProximaAcao ? <>➡️ <span className="text-foreground">{f.proximaAcao}</span>{f.responsavel ? ` · ${f.responsavel}` : ""}{f.prazo ? ` · até ${f.prazo}` : ""}</> : <span className="text-orange-500">Sem próxima ação definida</span>}
                  </p>
                  {f.risco.motivos.length > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{f.risco.motivos.join(" · ")}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => (editId === f.clientId ? setEditId("") : abrirEdicao(f))}>{editId === f.clientId ? "Fechar" : "Editar"}</Button>
              </div>

              {editId === f.clientId && (
                <div className="mt-3 space-y-3 rounded-md bg-muted/30 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2"><Label>Próxima ação</Label><Input value={form.proximaAcao} onChange={(e) => setForm({ ...form, proximaAcao: e.target.value })} placeholder="Ex.: cobrar aprovação dos 3 criativos · agendar reunião de resultados" /></div>
                    <div className="space-y-1"><Label>Responsável</Label><Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Prazo</Label><Input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Estado (override)</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                        <option value="">(derivado automático)</option>
                        {["onboarding", "ativo", "acompanhamento", "atenção", "risco", "renovação"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><Label>Última reunião</Label><Input type="date" value={form.ultimaReuniao} onChange={(e) => setForm({ ...form, ultimaReuniao: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Próxima reunião</Label><Input type="date" value={form.proximaReuniao} onChange={(e) => setForm({ ...form, proximaReuniao: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Pendências do cliente <span className="text-muted-foreground">(o que ELE deve — 1 por linha)</span></Label><Textarea rows={2} value={form.pendencias} onChange={(e) => setForm({ ...form, pendencias: e.target.value })} placeholder="Ex.: senha do Instagram · logo em alta · aprovar arte da promoção" /></div>
                  <div className="space-y-1"><Label>Notas do relacionamento</Label><Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
                  <div className="flex justify-end"><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar ficha"}</Button></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
