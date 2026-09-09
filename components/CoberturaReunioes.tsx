"use client";

// O PAINEL DE COBERTURA DE REUNIÕES.
//
// Roberto (09/09): "clientes ativos 41 · com reunião no mês 31 · sem reunião 10 · cobertura 75,6%
// […] métrica por responsável."
//
// Lê de /api/reunioes/cobertura — o mesmo cálculo da aba Clientes e da ficha. A regra que
// atravessa tudo: só reunião REALIZADA conta. Agendada é promessa, e promessa não é cobertura.

import { useEffect, useState } from "react";
import { CalendarClock, AlertTriangle, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface Resumo {
  clientesElegiveis: number; comReuniaoRealizada: number; comApenasAgendada: number;
  semReuniao: number; percentual: number; totalRealizadas: number; totalAgendadas: number;
  totalCanceladas: number; totalNaoCompareceu: number; comMetaAtingida: number;
}
interface Pessoa {
  responsavel: string; clientes: number; reunioesRealizadas: number;
  clientesCobertos: number; cobertura: number;
}

export default function CoberturaReunioes({ mes }: { mes?: string }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    authedFetch(`/api/reunioes/cobertura${mes ? `?mes=${mes}` : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "não consegui carregar");
        return j;
      })
      .then((j) => { if (vivo) { setResumo(j.resumo); setPessoas(j.porResponsavel ?? []); setErro(null); } })
      // Falha de carga vira aviso, nunca "cobertura 0%": um número inventado é pior que nenhum.
      .catch((e: Error) => { if (vivo) setErro(e.message); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [mes]);

  if (carregando) {
    return (
      <div className="card p-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 size={13} className="animate-spin" /> Calculando a cobertura…
      </div>
    );
  }
  if (erro || !resumo) {
    return (
      <div className="card p-4 flex items-start gap-2 text-[12px] text-lone-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>Não consegui calcular a cobertura de reuniões: {erro}</span>
      </div>
    );
  }

  // A cor da cobertura é julgamento, não decoração: abaixo de 60% alguém precisa agir hoje.
  const cor = resumo.percentual >= 90 ? "text-lone-success"
    : resumo.percentual >= 60 ? "text-lone-warning" : "text-lone-danger";

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <CalendarClock size={14} className="text-primary" /> Cobertura de reuniões
        <span className="text-[10px] text-muted-foreground font-normal">
          · só reunião realizada conta
        </span>
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-xl overflow-hidden mb-4">
        {[
          { r: "Cobertura", v: `${resumo.percentual}%`.replace(".", ","), s: `${resumo.comReuniaoRealizada} de ${resumo.clientesElegiveis}`, c: cor },
          { r: "Sem reunião", v: `${resumo.semReuniao}`, s: resumo.comApenasAgendada ? `+${resumo.comApenasAgendada} só agendada` : "ninguém agendado", c: resumo.semReuniao ? "text-lone-danger" : "text-foreground" },
          { r: "Realizadas", v: `${resumo.totalRealizadas}`, s: `${resumo.totalAgendadas} ainda agendada(s)`, c: "text-foreground" },
          { r: "Bateram a meta", v: `${resumo.comMetaAtingida}`, s: `${resumo.totalCanceladas} cancelada(s) · ${resumo.totalNaoCompareceu} não veio`, c: "text-foreground" },
        ].map((c) => (
          <div key={c.r} className="bg-card p-3">
            <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{c.r}</p>
            <p className={`text-lone-hero mt-0.5 tabular-nums ${c.c}`}>{c.v}</p>
            <p className="text-[10px] text-muted-foreground">{c.s}</p>
          </div>
        ))}
      </div>

      {pessoas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[420px]">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium pb-1.5">Responsável</th>
                <th className="text-right font-medium pb-1.5">Clientes</th>
                <th className="text-right font-medium pb-1.5">Reuniões</th>
                <th className="text-right font-medium pb-1.5">Cobertos</th>
                <th className="text-right font-medium pb-1.5">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.responsavel} className="border-t border-border">
                  <td className="py-1.5 text-foreground">{p.responsavel}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.clientes}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.reunioesRealizadas}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.clientesCobertos}</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${
                    p.cobertura >= 90 ? "text-lone-success" : p.cobertura >= 60 ? "text-lone-warning" : "text-lone-danger"
                  }`}>{`${p.cobertura}%`.replace(".", ",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-2">
            Conta pelo dono da carteira: uma reunião que outra pessoa fez no cliente dele cobre o
            cliente dele.
          </p>
        </div>
      )}
    </div>
  );
}
