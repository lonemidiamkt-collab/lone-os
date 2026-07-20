"use client";

// Calendário estratégico (Fase 3). Roda o motor (diagnostica → objetivo → decide → executa) e
// mostra a semana pronta: cada peça com gancho/apoio/CTA/legenda/design + POR QUE AGORA. O time
// revisa e cria no board (cada card já com a decisão gravada). Human-gated.

import { useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Bloco { rotulo: string; titulo: string; subtitulo: string; topicos: string[]; imagem: string; texto: string }
interface Peca { data: string; formato: string; titulo: string; subtitulo: string; objetivo_label: string; duracao: string; blocos: Bloco[]; cta: string; legenda: string }
interface Decisao { data: string; formato: string; pilar: string; objetivo: string; posicaoFunil: string; tema: string; angulo: string; dorAlvo: string; objecaoAlvo?: string; porQueAgora: string }
interface Objetivo { objetivoPrincipal: string; narrativa: string; mixPilares: { autoridade: number; aproximacao: number; comercial: number } }
interface Plano { diagnostico: unknown; objetivo: Objetivo; decisoes: Decisao[] }

const PILAR_COR: Record<string, string> = {
  autoridade: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  aproximacao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  comercial: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export default function CalendarioEstrategico({ clientId }: { clientId: string }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [periodo, setPeriodo] = useState("");
  const [cliente, setCliente] = useState("");
  const [modo, setModo] = useState<"semana" | "mes">("semana");
  const [contexto, setContexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const gerar = async () => {
    setLoading(true); setMsg(modo === "mes" ? "Planejando o mês… (pode levar 1-2 min)" : "Pensando…"); setPlano(null); setPecas([]);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      const res = await authedFetch(`/api/cs/calendario`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, modo, contexto }),
      });
      const j = await res.json();
      if (!res.ok || !j.jobId) { setMsg(j.error || "Falhou ao iniciar"); setLoading(false); return; }
      // polling do job (até ~3 min)
      for (let i = 0; i < 60; i++) {
        await wait(3000);
        const r = await authedFetch(`/api/cs/calendario?jobId=${j.jobId}`);
        const s = await r.json();
        if (s.status === "done" && s.result) {
          setPlano(s.result.plano); setPecas(s.result.pecas || []); setPeriodo(s.result.periodo); setCliente(s.result.cliente || ""); setMsg(""); break;
        }
        if (s.status === "error") { setMsg(s.error || "Falhou ao gerar"); break; }
      }
    } catch { setMsg("Erro de conexão"); } finally { setLoading(false); }
  };

  const baixarPdf = async () => {
    if (!plano) return;
    setMsg("");
    try {
      const res = await authedFetch(`/api/cs/calendario/pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, periodo, modo, pecas }),
      });
      if (!res.ok) { setMsg("Falhou ao gerar o PDF"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `calendario-${cliente || "cliente"}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setMsg("Erro ao baixar"); }
  };

  const criar = async () => {
    if (!plano) return;
    setSaving(true); setMsg("");
    try {
      const res = await authedFetch(`/api/cs/calendario`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, criar: true, periodo, objetivo: plano.objetivo, decisoes: plano.decisoes, pecas, diagnostico: plano.diagnostico }),
      });
      const j = await res.json();
      setMsg(res.ok ? `${j.total} card(s) criados no board ✓` : (j.error || "Falhou ao criar"));
    } catch { setMsg("Erro de conexão"); } finally { setSaving(false); }
  };

  const decDe = (data: string) => plano?.decisoes.find((d) => d.data === data);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Calendário estratégico (IA)</h3>
          <p className="text-sm text-muted-foreground">Monta a semana pensando no funil (não posts soltos). Revise e crie no board.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button onClick={() => setModo("semana")} className={`px-3 py-1.5 ${modo === "semana" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}>Semana</button>
            <button onClick={() => setModo("mes")} className={`px-3 py-1.5 ${modo === "mes" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}>Mês</button>
          </div>
          <Button onClick={gerar} disabled={loading}>{loading ? "Pensando…" : plano ? "Gerar de novo" : "Gerar calendário"}</Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Contexto do período <span className="text-muted-foreground">(opcional — campanhas, promoções, datas do próximo mês)</span></Label>
        <Textarea value={contexto} onChange={(e) => setContexto(e.target.value)} rows={2}
          placeholder="Ex.: Em agosto a loja toda entra em promoção de aniversário; foco em porcelanato e tintas; frete grátis acima de X." />
      </div>

      {msg && <p className="text-sm font-medium">{msg}</p>}

      {plano && (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
            <p><span className="font-semibold">Objetivo da semana:</span> {plano.objetivo.objetivoPrincipal}</p>
            <p className="text-muted-foreground italic">“{plano.objetivo.narrativa}”</p>
            <p className="text-xs text-muted-foreground">Mix: {plano.objetivo.mixPilares.autoridade}/{plano.objetivo.mixPilares.aproximacao}/{plano.objetivo.mixPilares.comercial} (aut/apr/com)</p>
          </div>

          {pecas.map((p) => {
            const d = decDe(p.data);
            return (
              <div key={p.data} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-semibold">{p.data}</span>
                  <span className="rounded px-1.5 py-0.5 bg-muted">{p.formato}</span>
                  {d && <span className={`rounded px-1.5 py-0.5 ${PILAR_COR[d.pilar] || "bg-muted"}`}>{d.pilar}</span>}
                  {d && <span className="rounded px-1.5 py-0.5 bg-muted">{d.objetivo}</span>}
                  {d && <span className="rounded px-1.5 py-0.5 bg-muted">funil: {d.posicaoFunil}</span>}
                </div>
                <p className="font-medium">{p.titulo}{p.duracao ? ` · ${p.duracao}` : ""}</p>
                {p.subtitulo && <p className="text-sm text-muted-foreground">{p.subtitulo}</p>}
                <div className="space-y-2">
                  {p.blocos?.map((b, bi) => (
                    <div key={bi} className="rounded-md bg-muted/40 p-2 text-sm">
                      <div className="text-[11px] font-semibold text-primary tracking-wide">{b.rotulo}</div>
                      {b.titulo && <div className="font-medium">{b.titulo}</div>}
                      {b.subtitulo && <div className="text-muted-foreground">{b.subtitulo}</div>}
                      {b.topicos?.length > 0 && <ul className="list-disc list-inside text-muted-foreground">{b.topicos.map((t, ti) => <li key={ti}>{t}</li>)}</ul>}
                      {b.imagem && <div className="text-xs italic text-muted-foreground mt-1">🖼 {b.imagem}</div>}
                      {b.texto && <div className="text-xs mt-1">{b.texto}</div>}
                    </div>
                  ))}
                </div>
                <p className="text-sm"><span className="text-muted-foreground">CTA:</span> {p.cta}</p>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Legenda</summary>
                  <p className="mt-1 whitespace-pre-wrap">{p.legenda}</p>
                </details>
                {d && <p className="text-xs text-muted-foreground border-t border-border pt-2">💡 <span className="font-medium">Por que agora:</span> {d.porQueAgora}</p>}
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={baixarPdf}>Baixar PDF</Button>
            <Button onClick={criar} disabled={saving}>{saving ? "Criando…" : "Criar no board"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
