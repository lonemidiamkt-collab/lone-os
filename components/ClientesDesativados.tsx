"use client";

// AS ABAS "EM ENCERRAMENTO" E "DESATIVADOS".
//
// Roberto (09/09): "quero conseguir abrir um cliente que saiu há 2 anos e entender imediatamente
// quando entrou, quanto tempo ficou, por que saiu, quem encerrou, se existia dívida."
//
// E, no §18: indicadores visuais que deixem o gestor "detectar erros administrativos" de relance —
// termo pendente, sem confirmação, pendência financeira. São os erros que só aparecem meses
// depois, quando já não dá para resolver.

import { useEffect, useState } from "react";
import { Archive, AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface Linha {
  clientId: string; nome: string; responsavel: string | null; lifecycle: string;
  entrada: string | null; saida: string | null; tempo: string | null; ciclos: number;
  motivo: string | null; motivoDetalhe: string | null; iniciativa: string | null;
  offboardingId: string | null; estado: string | null;
  temTermo: boolean; enviado: boolean; confirmado: boolean;
  financeiroOk: boolean | null; completo: boolean | null;
  alertas: string[]; diasParaEncerrar: number | null;
}

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

const INICIATIVA: Record<string, string> = {
  cliente: "o cliente", lone: "a Lone", acordo: "acordo",
};

export default function ClientesDesativados({ aba }: { aba: "encerrando" | "desativados" }) {
  const [dados, setDados] = useState<{ encerrando: Linha[]; desativados: Linha[]; resumo: Record<string, number> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reativando, setReativando] = useState<string | null>(null);

  const carregar = () => {
    authedFetch("/api/clients/offboarding/lista")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); return j; })
      .then((j) => { setDados(j); setErro(null); })
      .catch((e: Error) => setErro(e.message));
  };
  useEffect(carregar, []);

  const reativar = async (l: Linha) => {
    if (!l.offboardingId) {
      setErro(`${l.nome} saiu antes do processo formal existir — reative pelo cadastro.`);
      return;
    }
    if (!confirm(`Reativar ${l.nome}?\n\nO cadastro é o mesmo: um novo ciclo começa hoje e todo o histórico anterior continua.`)) return;
    setReativando(l.clientId);
    try {
      const r = await authedFetch("/api/clients/offboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reativar", id: l.offboardingId }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j?.error ?? "não consegui reativar"); return; }
      carregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setReativando(null); }
  };

  if (erro && !dados) {
    return (
      <div className="card p-4 flex items-start gap-2 text-[12px] text-lone-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{erro}</span>
      </div>
    );
  }
  if (!dados) {
    return <p className="text-[12px] text-muted-foreground flex items-center gap-2">
      <Loader2 size={13} className="animate-spin" /> Carregando…</p>;
  }

  const linhas = aba === "encerrando" ? dados.encerrando : dados.desativados;

  if (!linhas.length) {
    return (
      <div className="card p-6 text-center">
        <Archive size={20} className="text-muted-foreground mx-auto mb-2" />
        <p className="text-[12.5px] text-muted-foreground">
          {aba === "encerrando" ? "Nenhum encerramento em andamento." : "Nenhum cliente desativado."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {aba === "desativados" && dados.resumo.semProcesso > 0 && (
        <div className="p-3 rounded-xl bg-lone-warning-bg border border-lone-warning-border">
          <p className="text-[11.5px] text-lone-warning">
            <strong>{dados.resumo.semProcesso}</strong> cliente(s) saíram antes do processo formal
            existir — sem motivo, sem termo, sem data de saída registrada. É o passivo a regularizar.
          </p>
        </div>
      )}

      {erro && <p className="text-[11.5px] text-lone-danger">{erro}</p>}

      {linhas.map((l) => (
        <div key={l.clientId} className="card p-3.5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-foreground">
                {l.nome}
                {l.ciclos > 1 && (
                  <span className="ml-1.5 text-[10px] text-primary">{l.ciclos}º ciclo</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {dataBR(l.entrada)} → {dataBR(l.saida)}
                {l.tempo && ` · ${l.tempo}`}
                {l.responsavel && ` · ${l.responsavel}`}
              </p>
              {l.motivo && (
                <p className="text-[11.5px] text-foreground mt-1">
                  {l.motivo}
                  {l.iniciativa && <span className="text-muted-foreground"> · pedido por {INICIATIVA[l.iniciativa] ?? l.iniciativa}</span>}
                </p>
              )}
              {l.motivoDetalhe && (
                <p className="text-[11px] text-muted-foreground italic mt-0.5">“{l.motivoDetalhe}”</p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {/* Os indicadores do §18: o que um gestor precisa ver sem abrir nada. */}
              <div className="flex flex-wrap gap-1 justify-end">
                {!l.offboardingId ? (
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded border bg-lone-warning-bg text-lone-warning border-lone-warning-border">
                    sem processo
                  </span>
                ) : (
                  <>
                    <span className={`text-[9.5px] px-1.5 py-0.5 rounded border ${l.temTermo
                      ? "bg-lone-success-bg text-lone-success border-lone-success-border"
                      : "bg-lone-warning-bg text-lone-warning border-lone-warning-border"}`}>
                      {l.temTermo ? "✅ termo" : "⚠️ sem termo"}
                    </span>
                    {l.enviado && (
                      <span className={`text-[9.5px] px-1.5 py-0.5 rounded border ${l.confirmado
                        ? "bg-lone-success-bg text-lone-success border-lone-success-border"
                        : "bg-lone-warning-bg text-lone-warning border-lone-warning-border"}`}>
                        {l.confirmado ? "✅ confirmado" : "⚠️ sem confirmação"}
                      </span>
                    )}
                    {l.financeiroOk === false && (
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded border bg-lone-danger-bg text-lone-danger border-lone-danger-border">
                        🔴 pendência financeira
                      </span>
                    )}
                    {l.financeiroOk === true && (
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded border bg-lone-success-bg text-lone-success border-lone-success-border">
                        ✅ sem pendências
                      </span>
                    )}
                  </>
                )}
                {aba === "encerrando" && l.diasParaEncerrar != null && (
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30">
                    {l.diasParaEncerrar > 1 ? `faltam ${l.diasParaEncerrar}d`
                      : l.diasParaEncerrar === 1 ? "encerra amanhã"
                      : l.diasParaEncerrar === 0 ? "encerra hoje"
                      : `venceu há ${Math.abs(l.diasParaEncerrar)}d`}
                  </span>
                )}
              </div>

              {aba === "desativados" && l.offboardingId && (
                <button onClick={() => reativar(l)} disabled={reativando === l.clientId}
                  className="text-[10px] px-2 py-1 rounded-md bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-primary flex items-center gap-1 disabled:opacity-50">
                  {reativando === l.clientId ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                  Reativar
                </button>
              )}
            </div>
          </div>

          {l.alertas.map((a) => (
            <p key={a} className="text-[11px] text-lone-warning mt-1.5 flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {a}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
