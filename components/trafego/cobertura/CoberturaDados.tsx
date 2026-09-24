"use client";

// components/trafego/cobertura/CoberturaDados.tsx — aba "Cobertura de dados" do Tráfego (Leva 7A, N7).
//
// Um quadradinho por cliente por dia: onde a leitura da Meta gravou (conta e por anúncio) e onde há
// buraco — com o motivo provável. Buraco aqui vira buraco no relatório do cliente, no "Resultado de
// ontem" e no ranking de criativos. Regras em lib/trafego/cobertura.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseZap, RefreshCw, UserCheck } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { cn } from "@/lib/utils";
import type { EstadoDia, LinhaCobertura, RespostaCobertura } from "@/lib/trafego/cobertura";

const ESTADO: Record<EstadoDia, { rotulo: string; cls: string }> = {
  completo:   { rotulo: "conta e anúncios gravados",           cls: "bg-lone-success" },
  so_conta:   { rotulo: "só a conta (falta a coleta por anúncio)", cls: "bg-lone-warning" },
  so_anuncio: { rotulo: "só por anúncio (falta a conta)",       cls: "bg-lone-info" },
  vazio:      { rotulo: "sem dado (sem entrega ou leitura falhou)", cls: "bg-muted ring-1 ring-inset ring-border" },
};

const GRAVIDADE: Record<LinhaCobertura["gravidade"], string> = {
  critico: "text-lone-danger",
  atencao: "text-lone-warning",
  ok: "text-muted-foreground",
};

const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const inicialSemana = (ymd: string) => ["D", "S", "T", "Q", "Q", "S", "S"][new Date(`${ymd}T12:00:00Z`).getUTCDay()];

export default function CoberturaDados({ clientIds, currentUser }: { clientIds?: string[]; currentUser: string }) {
  const { role } = useRole();
  const [n, setN] = useState<14 | 30>(14);
  const [dados, setDados] = useState<RespostaCobertura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [soProblema, setSoProblema] = useState(true);
  const [soMeus, setSoMeus] = useState(role === "traffic");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<RespostaCobertura>(`/api/trafego/cobertura?dias=${n}`);
    if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui carregar.");
    setCarregando(false);
  }, [n]);
  useEffect(() => { carregar(); }, [carregar]);

  const todas = useMemo(() => {
    const ids = clientIds?.length ? new Set(clientIds) : null;
    const primeiro = (s: string | null) => (s ?? "").split(" ")[0].toLowerCase();
    return (dados?.linhas ?? []).filter((l) => (!ids || ids.has(l.clientId)) && (!soMeus || primeiro(l.gestor) === primeiro(currentUser)));
  }, [dados, clientIds, soMeus, currentUser]);
  const linhas = soProblema ? todas.filter((l) => l.gravidade !== "ok") : todas;
  const completos = todas.filter((l) => l.gravidade === "ok").length;
  const criticos = todas.filter((l) => l.gravidade === "critico").length;

  return (
    <section className="space-y-4" aria-labelledby="titulo-cobertura">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-cobertura" className="flex items-center gap-2 text-lone-h2 text-foreground">
            <DatabaseZap size={16} className="text-muted-foreground" aria-hidden="true" /> Cobertura de dados da Meta
          </h2>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">
            Dia a dia, o que o servidor gravou de cada cliente. Dia sem dado vira buraco no relatório, no "Resultado de ontem" e no ranking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={soProblema} onClick={() => setSoProblema((v) => !v)}
            className={cn("h-8 rounded-lg border px-2.5 text-xs font-medium", soProblema ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            Só com falha
          </button>
          <button type="button" aria-pressed={soMeus} onClick={() => setSoMeus((v) => !v)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium", soMeus ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            <UserCheck size={14} aria-hidden="true" /> Só os meus
          </button>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Janela">
            {([14, 30] as const).map((d) => (
              <button key={d} type="button" onClick={() => setN(d)} aria-pressed={n === d}
                className={cn("h-7 rounded-md px-2.5 text-xs font-medium tabular-nums", n === d ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {d} dias
              </button>
            ))}
          </div>
          <button type="button" onClick={carregar} disabled={carregando} aria-label="Recarregar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {erro && <p role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erro}</p>}

      {dados && (
        <p className="text-lone-caption text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{completos}</span> de {todas.length} clientes com todos os dias gravados
          {criticos > 0 && <> · <span className="font-medium tabular-nums text-lone-danger">{criticos}</span> com falha grave</>}
        </p>
      )}

      {carregando && !dados ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : dados && linhas.length === 0 ? (
        <EmptyState tone="muted" icon={<DatabaseZap size={20} />} title="Tudo gravado"
          subtitle={`Nenhum cliente com dia faltando nos últimos ${n} dias.`} />
      ) : dados ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Dias com dado da Meta por cliente</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2.5 text-lone-eyebrow uppercase text-muted-foreground">Cliente</th>
                <th scope="col" className="px-2 py-2.5">
                  <div className="flex gap-1" aria-hidden="true">
                    {dados.janela.map((d) => (
                      <span key={d} className="w-3.5 text-center text-[9px] leading-tight text-muted-foreground" title={ddmm(d)}>
                        {inicialSemana(d)}<br />{d.slice(8, 10)}
                      </span>
                    ))}
                  </div>
                  <span className="sr-only">Dias</span>
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-lone-eyebrow uppercase text-muted-foreground">Dias</th>
                <th scope="col" className="px-4 py-2.5 text-lone-eyebrow uppercase text-muted-foreground">Motivo provável</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.clientId} className="border-b border-border last:border-b-0">
                  <th scope="row" className="max-w-[220px] px-4 py-2.5 font-normal">
                    <p className="truncate text-sm font-medium text-foreground">{l.nome}</p>
                    {l.gestor && <p className="truncate text-[11px] text-muted-foreground">{l.gestor}</p>}
                  </th>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      {l.dias.map((e, i) => (
                        <span key={dados.janela[i]} className={cn("h-3.5 w-3.5 rounded-[3px]", ESTADO[e].cls)}
                          title={`${ddmm(dados.janela[i])}: ${ESTADO[e].rotulo}`} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {l.diasComConta}/{dados.janela.length}
                    {l.ultimoDia && <p className="text-[11px] text-muted-foreground">último {ddmm(l.ultimoDia)}</p>}
                  </td>
                  <td className={cn("max-w-[320px] px-4 py-2.5 text-xs", GRAVIDADE[l.gravidade])}>{l.motivo ?? "Tudo gravado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground" aria-label="Legenda">
        {(Object.keys(ESTADO) as EstadoDia[]).map((e) => (
          <li key={e} className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded-[3px]", ESTADO[e].cls)} aria-hidden="true" />{ESTADO[e].rotulo}</li>
        ))}
      </ul>
    </section>
  );
}
