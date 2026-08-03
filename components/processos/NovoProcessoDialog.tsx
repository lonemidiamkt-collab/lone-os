"use client";

// components/processos/NovoProcessoDialog.tsx — escrever processo sem ter que saber escrever processo.
//
// A pessoa conta como faz, em texto corrido, do jeito que explicaria pra um colega. A IA organiza
// no padrão (passo com verbo, responsável e prova) e devolve pra revisão — ela LÊ antes de salvar,
// e o que a IA não conseguiu preencher aparece como pendência em vez de sair inventado.
//
// Nasce RASCUNHO sempre. Virar oficial é ação da gestão, na tela do processo.

import { useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X, AlertTriangle } from "lucide-react";

const AREAS = [
  { chave: "social", rotulo: "Social" },
  { chave: "traffic", rotulo: "Tráfego" },
  { chave: "cs", rotulo: "CS" },
  { chave: "comercial", rotulo: "Comercial" },
  { chave: "geral", rotulo: "Geral" },
];
const TIPOS = [
  { chave: "sop", rotulo: "Passo a passo" },
  { chave: "checklist", rotulo: "Checklist" },
  { chave: "processo", rotulo: "Processo" },
  { chave: "playbook", rotulo: "Playbook" },
  { chave: "politica", rotulo: "Política" },
  { chave: "template", rotulo: "Modelo" },
];

interface Rascunho {
  titulo: string; objetivo: string;
  passos: { seq: number; titulo: string; instrucao: string; papel: string; evidencia?: string }[];
}

export default function NovoProcessoDialog({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [texto, setTexto] = useState("");
  const [area, setArea] = useState("social");
  const [tipo, setTipo] = useState("sop");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [pendencias, setPendencias] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const redigir = async () => {
    setOcupado(true); setErro(null);
    try {
      const r = await authedFetch("/api/processos?revisar=1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, area, tipo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j?.error || "não consegui redigir agora"); return; }
      setRascunho(j.rascunho as Rascunho);
      setPendencias((j.pendencias as string[]) ?? []);
    } finally { setOcupado(false); }
  };

  const salvar = async () => {
    setOcupado(true); setErro(null);
    try {
      const r = await authedFetch("/api/processos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rascunho, area, tipo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j?.error || "não consegui salvar"); return; }
      onCriado();
    } finally { setOcupado(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-lone-bg-card rounded-2xl border border-lone-border w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-lone-border sticky top-0 bg-lone-bg-card">
          <h2 className="font-brand font-semibold text-lg text-lone-text-primary">Novo processo</h2>
          <button onClick={onClose} className="text-lone-text-tertiary hover:text-lone-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!rascunho && (
            <>
              <div className="flex gap-3">
                <label className="flex-1 text-sm">
                  <span className="block text-xs font-medium text-lone-text-secondary mb-1">Área</span>
                  <select value={area} onChange={(e) => setArea(e.target.value)}
                    className="w-full rounded-lg border border-lone-border bg-lone-bg-primary px-3 py-2 text-sm text-lone-text-primary">
                    {AREAS.map((a) => <option key={a.chave} value={a.chave}>{a.rotulo}</option>)}
                  </select>
                </label>
                <label className="flex-1 text-sm">
                  <span className="block text-xs font-medium text-lone-text-secondary mb-1">Tipo</span>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                    className="w-full rounded-lg border border-lone-border bg-lone-bg-primary px-3 py-2 text-sm text-lone-text-primary">
                    {TIPOS.map((t) => <option key={t.chave} value={t.chave}>{t.rotulo}</option>)}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="block text-xs font-medium text-lone-text-secondary mb-1">
                  Conte como se faz hoje — do jeito que você explicaria pra um colega novo
                </span>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8}
                  placeholder="Ex.: quando o cliente pede uma arte no grupo, eu confiro se tem preço e produto definidos, abro o card no board do designer com a data da postagem…"
                  className="w-full rounded-lg border border-lone-border bg-lone-bg-primary px-3 py-2 text-sm text-lone-text-primary leading-relaxed" />
              </label>

              <Button onClick={redigir} disabled={ocupado || texto.trim().length < 40} className="gap-2 w-full">
                {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Organizar no padrão
              </Button>
              <p className="text-xs text-lone-text-tertiary">
                Você lê e corrige antes de salvar. Nada vira processo oficial sem a gestão publicar.
              </p>
            </>
          )}

          {rascunho && (
            <>
              <div>
                <h3 className="font-medium text-lone-text-primary">{rascunho.titulo}</h3>
                <p className="text-sm text-lone-text-secondary mt-1">{rascunho.objetivo}</p>
              </div>

              {/* O que a IA NÃO soube — aparece como pergunta pra pessoa, não como texto inventado. */}
              {pendencias.length > 0 && (
                <div className="p-3 rounded-lg bg-lone-warning-bg text-lone-warning">
                  <p className="text-sm font-medium flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Faltou informação
                  </p>
                  <ul className="text-xs space-y-0.5 list-disc list-inside">
                    {pendencias.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              <ol className="space-y-2">
                {rascunho.passos?.map((s, i) => (
                  <li key={i} className="p-3 rounded-lg border border-lone-border">
                    <p className="text-sm font-medium text-lone-text-primary">{s.seq}. {s.titulo}</p>
                    <p className="text-xs text-lone-text-secondary mt-1">{s.instrucao}</p>
                    <p className="text-xs text-lone-text-tertiary mt-1">
                      {s.papel}{s.evidencia ? ` · prova: ${s.evidencia}` : ""}
                    </p>
                  </li>
                ))}
              </ol>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setRascunho(null); setPendencias([]); }} className="flex-1">
                  Reescrever
                </Button>
                <Button onClick={salvar} disabled={ocupado} className="flex-1 gap-2">
                  {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Salvar rascunho
                </Button>
              </div>
            </>
          )}

          {erro && <p className="text-sm text-lone-danger">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
