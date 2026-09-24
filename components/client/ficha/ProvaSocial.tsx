"use client";

// components/client/ficha/ProvaSocial.tsx — "Extrair resultado": três métricas rápidas para mandar ao
// cliente como prova de valor. Estava no fim da Visão Geral; agora mora em Resultados.

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { Vazio } from "./Secao";

const VAZIO = { m1l: "Novos Seguidores", m1v: "", m2l: "Leads no Direct", m2v: "", m3l: "Engajamento", m3v: "", period: "" };

export default function ProvaSocial({ clientId, currentUser }: { clientId: string; currentUser: string }) {
  const provas = useOperationalStore((s) => s.socialProofs[clientId]) ?? [];
  const addSocialProof = useOperationalStore((s) => s.addSocialProof);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!f.m1v && !f.m2v && !f.m3v) return;
    setSalvando(true);
    try {
      await addSocialProof({
        clientId, metric1Label: f.m1l, metric1Value: f.m1v, metric2Label: f.m2l, metric2Value: f.m2v,
        metric3Label: f.m3l, metric3Value: f.m3v, period: f.period || "—", createdBy: currentUser,
      });
      setF(VAZIO); setAberto(false);
      toast.success("Resultado registrado.");
    } catch (e) {
      toast.error(`Resultado não salvo: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setSalvando(false);
    }
  };

  const campo = "w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lone-caption text-muted-foreground">Métricas rápidas para mandar ao cliente como prova de valor.</p>
        <button onClick={() => setAberto((v) => !v)} className="inline-flex shrink-0 items-center gap-1 text-lone-caption text-primary hover:underline">
          <Plus size={12} aria-hidden="true" /> Extrair resultado
        </button>
      </div>

      {aberto && (
        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["1", "2", "3"] as const).map((n) => (
              <div key={n} className="space-y-1">
                <input value={f[`m${n}l`]} onChange={(e) => setF({ ...f, [`m${n}l`]: e.target.value })} placeholder="Métrica" aria-label={`Métrica ${n}`} className={campo} />
                <input value={f[`m${n}v`]} onChange={(e) => setF({ ...f, [`m${n}v`]: e.target.value })} placeholder="Valor (ex.: +500)" aria-label={`Valor ${n}`} className={`${campo} font-medium`} />
              </div>
            ))}
          </div>
          <input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="Período (ex.: Setembro 2026)" aria-label="Período" className={campo} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAberto(false)} className="h-8 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            <button onClick={salvar} disabled={salvando || (!f.m1v && !f.m2v && !f.m3v)}
              className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar resultado"}
            </button>
          </div>
        </div>
      )}

      {provas.length === 0 && !aberto && <Vazio>Nenhum resultado registrado ainda.</Vazio>}
      <div className="space-y-3">
        {provas.map((sp) => (
          <div key={sp.id} className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-lone-caption font-medium text-primary">{sp.period}</span>
              <span className="text-lone-caption text-muted-foreground">por {sp.createdBy} · {sp.createdAt}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { l: sp.metric1Label, v: sp.metric1Value },
                { l: sp.metric2Label, v: sp.metric2Value },
                { l: sp.metric3Label, v: sp.metric3Value },
              ].filter((m) => m.v).map((m) => (
                <div key={m.l} className="rounded-lg border border-border bg-card p-3">
                  <p className="text-lone-h2 text-foreground">{m.v}</p>
                  <p className="mt-0.5 text-lone-caption text-muted-foreground">{m.l}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
