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

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

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
    clientes: number;
    ativos: number;
    emRisco: number;
    postsPublicados: { valor: number | null };
    postsMeta: number | null;
    cobertura: { health: number; interacao: number };
  };
  deltas: DeltaCockpit[];
  temComparacao: boolean;
  motivoSemComparacao: string | null;
}

export function useCockpit() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    authedFetch("/api/ceo/cockpit")
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Sem permissão para o cockpit." : `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (vivo) setData(d as CockpitData); })
      // Erro vira mensagem na tela, não tela vazia com número velho — foi assim que o painel
      // zerado passou despercebido por dias.
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : "não consegui carregar"); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  return { data, loading, erro };
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
