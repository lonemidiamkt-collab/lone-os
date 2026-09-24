"use client";

// components/client/RadarRenovacao.tsx — RADAR DE RENOVAÇÃO (Leva 7C, N22). Dois formatos:
//   <RadarRenovacao />                    → a lista (Saúde da carteira): quem vence em até 60/30 dias
//                                           sem renovação andando
//   <RadarRenovacao clientId="…" linha /> → uma linha na aba Admin do cliente
// Só gestão (a rota devolve 403 para os outros e o componente some). SÓ DATAS, nenhum valor.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { prazoRadar, type ItemRadar } from "@/lib/clientes/radar-renovacao";
import { dataCurta } from "@/components/client/ficha/rotulos";

interface Lista { itens: ItemRadar[]; emAndamento: number }
interface DoCliente { contrato: { fim: string; dias: number; renovacaoAndando: boolean } | null }

function LinhaDoCliente({ clientId }: { clientId: string }) {
  const [d, setD] = useState<DoCliente | null>(null);
  useEffect(() => {
    let vivo = true;
    chamar<DoCliente>(`/api/clients/radar-renovacao?clientId=${clientId}`).then((r) => { if (vivo && r.ok) setD(r.data); });
    return () => { vivo = false; };
  }, [clientId]);
  if (!d?.contrato) return null;
  const { fim, dias, renovacaoAndando } = d.contrato;
  const alerta = !renovacaoAndando && dias >= 0 && dias <= 60;
  return (
    <p className={cn("flex items-center gap-2 text-lone-body", alerta ? "text-lone-warning" : "text-muted-foreground")}>
      <CalendarClock size={15} aria-hidden="true" />
      {dias < 0 ? `Contrato ativo venceu em ${dataCurta(fim)}` : `Contrato ativo termina em ${dataCurta(fim)} (${prazoRadar(dias)})`}
      {" · "}{renovacaoAndando ? "renovação em andamento" : "renovação não iniciada"}
    </p>
  );
}

export default function RadarRenovacao({ clientId, linha }: { clientId?: string; linha?: boolean }) {
  const [dados, setDados] = useState<Lista | null>(null);
  const [negado, setNegado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (linha) return;
    let vivo = true;
    chamar<Lista>("/api/clients/radar-renovacao").then((r) => {
      if (!vivo) return;
      if (r.status === 401 || r.status === 403) { setNegado(true); return; }
      if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui ler os contratos."); return; }
      setDados(r.data);
    });
    return () => { vivo = false; };
  }, [linha]);

  if (linha && clientId) return <LinhaDoCliente clientId={clientId} />;
  if (negado) return null;

  return (
    <section aria-labelledby="titulo-radar" className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="titulo-radar" className="text-lone-h2 tracking-tight text-foreground">Radar de renovação</h2>
          <p className="text-lone-caption text-muted-foreground">Contratos a até 60 dias do fim sem renovação andando. Só as datas.</p>
        </div>
        {dados && dados.emAndamento > 0 && (
          <span className="text-lone-caption text-muted-foreground">{dados.emAndamento} com renovação já em andamento</span>
        )}
      </div>
      {erro && <p className="text-lone-body text-muted-foreground">{erro}</p>}
      {!dados && !erro && <div className="h-12 animate-pulse rounded-lg bg-muted" />}
      {dados && dados.itens.length === 0 && (
        <p className="text-lone-body text-muted-foreground">Nenhum contrato perto do fim sem renovação. Nada a fazer agora.</p>
      )}
      {dados && dados.itens.length > 0 && (
        <ul className="divide-y divide-border">
          {dados.itens.map((i) => (
            <li key={i.contratoId}>
              <Link href={`/clients/${i.clientId}?tab=contratos`}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent">
                <span className="min-w-0">
                  <span className="block truncate text-lone-body text-foreground">{i.cliente}</span>
                  <span className="block text-lone-caption text-muted-foreground">
                    termina em {dataCurta(i.fim)}{i.social ? ` · ${i.social}` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  i.faixa === "30" ? "border-lone-danger-border bg-lone-danger-bg text-lone-danger" : "border-lone-warning-border bg-lone-warning-bg text-lone-warning")}>
                  {prazoRadar(i.dias)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
