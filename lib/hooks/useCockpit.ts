"use client";

// lib/hooks/useCockpit.ts — os números do cockpit vindos do SERVIDOR.
//
// Substitui o cálculo que rodava no navegador (useSnapshots), que comparava com um baseline
// ESCRITO NO CÓDIGO (5 clientes, 42 posts, health 62 — a Lone tem 46 clientes) e guardava o
// histórico em localStorage, então cada pessoa via um passado diferente.
//
// Aqui a comparação é com o mês anterior REALMENTE fechado (tabela `snapshots`). Sem mês
// anterior gravado, `variacaoPct` vem null e a tela não desenha seta — em vez de inventar
// evolução contra número que ninguém mediu.

import { useCallback, useEffect, useState } from "react";
import { chamar } from "@/lib/api/chamar";

export interface DeltaCockpit {
  chave: string;
  rotulo: string;
  atual: number | null;
  anterior: number | null;
  variacaoPct: number | null;
  menorEhMelhor: boolean;
  /** Quando existe, a métrica não tem como ser medida — a tela mostra o motivo, não um zero. */
  semFonte?: string;
}

export interface CockpitData {
  atual: {
    periodo: string;
    /** null = a carteira não foi lida (25/10/2026, 6.3). */
    clientes: number | null;
    ativos: number | null;
    emRisco: number | null;
    postsPublicados: { valor: number | null };
    postsMeta: number | null;
    cobertura: { health: number; interacao: number };
  };
  deltas: DeltaCockpit[];
  temComparacao: boolean;
  motivoSemComparacao: string | null;
  /** Fontes que não foram lidas — os cartões delas mostram "—" com o motivo (25/10/2026, 6.3). */
  falhas?: string[];
}

export function useCockpit() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    // `chamar` (25/10/2026, 6.3): o motivo do servidor chega à tela (antes "HTTP 500"), e há "Tentar de novo".
    chamar<CockpitData>("/api/ceo/cockpit").then((r) => {
      if (!vivo) return;
      setLoading(false);
      // Erro vira mensagem na tela, não tela vazia com número velho — foi assim que o painel
      // zerado passou despercebido por dias.
      if (!r.ok || !r.data) { setErro(r.status === 403 ? "Sem permissão para o cockpit." : r.erro ?? "não consegui carregar"); return; }
      setErro(null);
      setData(r.data);
    });
    return () => { vivo = false; };
  }, [tentativa]);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);
  return { data, loading, erro, recarregar };
}

/** Formata pra tela: null vira "—", nunca 0. */
export function valorOu(v: number | null, sufixo = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  // Arredonda de verdade: o health saía "68.15217391304348" na tela.
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n.toLocaleString("pt-BR")}${sufixo}`;
}

/** A variação foi boa? Respeita "menor é melhor" (tarefas vencidas, churn, dias sem falar). */
export function variacaoBoa(d: DeltaCockpit): boolean | null {
  if (d.variacaoPct === null || d.variacaoPct === 0) return null;
  return d.menorEhMelhor ? d.variacaoPct < 0 : d.variacaoPct > 0;
}
