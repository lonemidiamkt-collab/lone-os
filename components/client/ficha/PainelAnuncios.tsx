"use client";

// components/client/ficha/PainelAnuncios.tsx — o resultado dos anúncios do cliente, período × anterior,
// no mesmo painel comparativo do portal e do Crescimento (components/ui/painel-comparativo).
// Os números saem do snapshot do portal (GET /api/clients/[id]/anuncios): nunca "zero" quando a Meta
// falha — aí a tela diz que está indisponível.

import { useEffect, useState } from "react";
import { PainelComparativo, type KpiComparativo } from "@/components/ui/painel-comparativo";
import { tomDaVariacao } from "@/components/ui/painel-comparativo-utils";
import { chamar } from "@/lib/api/chamar";
import { fraseDelta, periodoAnterior, resumoConversas, type MetricType } from "@/lib/portal/formatDelta";
import { formatarBRL, formatarNumero, rotuloDia } from "@/lib/portal/formatos";
import type { PeriodKind, SnapshotData } from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import { Vazio } from "./Secao";
import { dataHoraCurta } from "./rotulos";

const PERIODOS: { valor: PeriodKind; rotulo: string }[] = [
  { valor: "last_week", rotulo: "7 dias" },
  { valor: "last_2_weeks", rotulo: "14 dias" },
  { valor: "this_month", rotulo: "Este mês" },
  { valor: "last_month", rotulo: "Mês passado" },
];

export default function PainelAnuncios({ clientId }: { clientId: string }) {
  const [periodo, setPeriodo] = useState<PeriodKind>("last_week");
  const [dados, setDados] = useState<SnapshotData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro(null);
    chamar<SnapshotData>(`/api/clients/${clientId}/anuncios?periodo=${periodo}`).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar os anúncios."); setDados(null); return; }
      setDados(r.data);
    });
    return () => { vivo = false; };
  }, [clientId, periodo, tentativa]);

  const status = dados?.ads_status ?? "ok";
  const k = dados?.kpis;
  const chart = dados?.chart;
  const dias = chart?.days ?? [];
  const serie = dias.map((d, i) => ({ rotulo: rotuloDia(d), atual: chart?.series.messages[i] ?? 0, anterior: chart?.previous_messages?.[i] ?? null }));
  const itens: { key: MetricType; rotulo: string; v: SnapshotData["kpis"]["messages"] | undefined; f: (n: number) => string }[] = [
    { key: "messages", rotulo: "Conversas", v: k?.messages, f: formatarNumero },
    { key: "spend", rotulo: "Investido (do cliente)", v: k?.spend, f: formatarBRL },
    { key: "cpa", rotulo: "Custo por conversa", v: k?.cpa, f: formatarBRL },
    { key: "reach", rotulo: "Pessoas alcançadas", v: k?.reach, f: formatarNumero },
  ];
  const kpis: KpiComparativo[] = itens.map(({ key, rotulo, v, f }) => ({
    rotulo,
    valor: v?.value != null ? f(v.value) : "—",
    variacaoPct: v?.delta_pct ?? null,
    natureza: key === "cpa" ? "inversa" : key === "spend" ? "neutra" : "direta",
    dica: fraseDelta(key, v?.delta_pct ?? null, periodo) ?? undefined,
  }));
  const resumo = k ? resumoConversas(k.messages.value, k.messages.delta_pct, periodo) : null;
  const per = dados?.period;

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Período" className="flex flex-wrap gap-1.5">
        {PERIODOS.map((p) => (
          <button key={p.valor} role="radio" aria-checked={periodo === p.valor} onClick={() => setPeriodo(p.valor)}
            className={cn("h-8 rounded-lg border px-3 text-xs transition-colors",
              periodo === p.valor ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
            {p.rotulo}
          </button>
        ))}
      </div>

      {status === "sem_conta" && !carregando ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <Vazio>Sem conta de anúncio vinculada a este cliente. Vincule em Admin → Cadastro (Conta Meta Ads).</Vazio>
        </div>
      ) : status === "indisponivel" && !carregando ? (
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4 text-lone-body text-lone-warning">
          A Meta não respondeu agora. Os números aparecem assim que ela voltar — nada aqui é zero de verdade.
        </div>
      ) : (
        <PainelComparativo
          carregando={carregando}
          erro={erro}
          onTentarDeNovo={() => setTentativa((t) => t + 1)}
          titulo="Conversas por dia"
          subtitulo={per ? `${per.label}, comparado com ${periodoAnterior(periodo)}` : undefined}
          rotuloAtual="Este período"
          rotuloAnterior="Período anterior"
          serie={serie}
          formatarValor={(v) => v.toLocaleString("pt-BR")}
          destaque={resumo ? { texto: resumo, tom: tomDaVariacao(k?.messages.delta_pct, "direta", 5), detalhe: per ? `${rotuloDia(per.start)} a ${rotuloDia(per.end)}` : undefined } : null}
          kpis={kpis}
          limiarNeutroPct={5}
          vazio="Nenhuma conversa neste período."
        />
      )}
      {dados?.stale_since && (
        <p className="text-lone-caption text-muted-foreground">Mostrando o último dado bom, de {dataHoraCurta(dados.stale_since)} — a Meta não respondeu agora.</p>
      )}
    </div>
  );
}
