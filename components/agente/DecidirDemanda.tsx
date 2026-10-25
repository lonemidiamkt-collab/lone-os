"use client";

// components/agente/DecidirDemanda.tsx — DECIDIR a sugestão do Agente sem sair do feed (Leva 7C, N25).
// Mostra o que o cliente escreveu, o que o agente entendeu e o briefing do card; aceita um ajuste
// antes de criar. Um item do feed pode trazer vários pedidos do mesmo cliente (agregados): decide um
// por um, e quando não sobra nenhum pendente o item sai do feed.
//
// 25/10/2026 (auditoria 11.4): "Descartar pedido" tem DESFAZER por alguns segundos (o pedido descartado
// fica na lista com o botão; o item só sai do feed depois). A rota recusa designer e comercial e grava
// quem descartou.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { dataHoraCurta } from "@/components/client/ficha/rotulos";
import { DESFAZER_DESCARTE_S } from "@/lib/cs/decidir-demanda";

interface Demanda {
  codigo: string; cliente: string; tipo: string; resumo: string; mensagem: string; briefing: string;
  autor: string | null; urgencia: string | null; criadaEm: string;
}

export function codigosDaAcao(acao: Record<string, unknown> | null): string[] {
  if (!acao) return [];
  const lista = Array.isArray(acao.codigos) ? (acao.codigos as unknown[]).filter((c): c is string => typeof c === "string") : [];
  if (lista.length) return lista;
  return typeof acao.codigo === "string" ? [acao.codigo] : [];
}

export default function DecidirDemanda({ codigos, aoTerminar, aoFechar }: {
  codigos: string[];
  /** Nenhum pendente sobrou: o item do feed pode sair. */
  aoTerminar: () => void;
  aoFechar: () => void;
}) {
  const [demandas, setDemandas] = useState<Demanda[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Descartados há pouco: ficam com "Desfazer" por alguns segundos (codigo → id do pedido).
  const [descartados, setDescartados] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    let vivo = true;
    chamar<{ demandas: Demanda[] }>(`/api/cs/decide?codigos=${encodeURIComponent(codigos.join(","))}`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui abrir as sugestões."); return; }
      setDemandas(r.data.demandas);
      if (r.data.demandas.length === 0) aoTerminar();
    });
    return () => { vivo = false; };
  }, [codigos.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const decidir = async (d: Demanda, acao: "confirmar" | "descartar") => {
    setOcupado(d.codigo);
    const r = await chamar<{ jaDecidida?: string; ok?: boolean; id?: string }>("/api/cs/decide", { codigo: d.codigo, acao, ajuste: ajuste[d.codigo]?.trim() || undefined });
    setOcupado(null);
    if (!r.ok) { toast.error(`Não consegui ${acao === "confirmar" ? "criar o card" : "descartar"}: ${r.erro}`); return; }
    if (acao === "descartar" && !r.data?.jaDecidida && r.data?.id) {
      // Fica na lista, riscado, com "Desfazer". Passado o tempo, sai de vez.
      const id = r.data.id;
      setDescartados((x) => ({ ...x, [d.codigo]: id }));
      timers.current[d.codigo] = setTimeout(() => sair(d.codigo), DESFAZER_DESCARTE_S * 1000);
      return;
    }
    toast.success(r.data?.jaDecidida ? `Já estava decidida (${r.data.jaDecidida}).` : "Card criado.");
    sair(d.codigo);
  };

  // Tira da lista; quando não sobra nenhum (nem descartado esperando o Desfazer), o item sai do feed.
  const sair = (codigo: string) => {
    clearTimeout(timers.current[codigo]);
    delete timers.current[codigo];
    setDescartados((x) => { const { [codigo]: _, ...resto } = x; void _; return resto; });
    setDemandas((lista) => {
      const resto = (lista ?? []).filter((x) => x.codigo !== codigo);
      if (resto.length === 0) setTimeout(aoTerminar, 0);
      return resto;
    });
  };

  const desfazer = async (codigo: string) => {
    const id = descartados[codigo];
    if (!id) return;
    clearTimeout(timers.current[codigo]);
    setOcupado(codigo);
    const r = await chamar<{ ok?: boolean }>("/api/cs/decide", { id, acao: "reabrir" });
    setOcupado(null);
    if (!r.ok) {
      toast.error(`Não consegui desfazer: ${r.erro}`);
      timers.current[codigo] = setTimeout(() => sair(codigo), DESFAZER_DESCARTE_S * 1000);
      return;
    }
    setDescartados((x) => { const { [codigo]: _, ...resto } = x; void _; return resto; });
    toast.success("Pedido de volta para pendente.");
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3" role="region" aria-label="Decidir o pedido">
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {!demandas && !erro && <div className="h-16 animate-pulse rounded-md bg-muted" />}
      {demandas?.map((d) => descartados[d.codigo] ? (
        <div key={d.codigo} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0" role="status">
          <p className="text-xs text-muted-foreground"><span className="line-through">{d.resumo || d.tipo}</span> — pedido descartado.</p>
          <button onClick={() => void desfazer(d.codigo)} disabled={ocupado === d.codigo}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50">Desfazer</button>
        </div>
      ) : (
        <div key={d.codigo} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{d.resumo || d.tipo}</p>
            <span className="font-mono text-[11px] text-muted-foreground">{d.codigo} · {d.tipo} · {dataHoraCurta(d.criadaEm)}</span>
          </div>
          {d.mensagem && (
            <blockquote className="border-l-2 border-border pl-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {d.autor && <span className="font-medium text-foreground">{d.autor}: </span>}{d.mensagem}
            </blockquote>
          )}
          {d.briefing && d.briefing !== d.mensagem && (
            <p className="whitespace-pre-wrap text-xs text-foreground [overflow-wrap:anywhere]"><span className="text-muted-foreground">Vai para o card: </span>{d.briefing}</p>
          )}
          <input value={ajuste[d.codigo] ?? ""} onChange={(e) => setAjuste((a) => ({ ...a, [d.codigo]: e.target.value }))}
            placeholder="Ajuste para o card (opcional)" aria-label={`Ajuste para o card ${d.codigo}`}
            className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring" />
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => decidir(d, "confirmar")} disabled={ocupado === d.codigo}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">Criar card</button>
            <button onClick={() => decidir(d, "descartar")} disabled={ocupado === d.codigo}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50">Descartar pedido</button>
          </div>
        </div>
      ))}
      <button onClick={aoFechar} className="text-[11px] text-muted-foreground hover:text-foreground">Fechar</button>
    </div>
  );
}
