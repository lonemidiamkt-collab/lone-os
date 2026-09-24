"use client";

// Mapa de postagem: cliente × semana (N32). Postado no Instagram contra o contratado (seg/qua/sex).
// Os números vêm prontos do servidor (/api/gestao/mapa-postagem); as regras, de
// lib/metrics/mapa-postagem.ts.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CameraOff, Pause, RefreshCcw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CelulaMapa, LinhaMapa, ResumoSocial, SemanaMapa, TomCelula } from "@/lib/metrics/mapa-postagem";

interface Resposta { hoje: string; semanas: SemanaMapa[]; linhas: LinhaMapa[]; porSocial: ResumoSocial[]; semInstagram: number }

const TODOS = "__todos__";
const OPCOES_SEMANAS = [4, 8, 12] as const;

const ESTILO_TOM: Record<TomCelula, string> = {
  ok: "border-lone-success-border bg-lone-success-bg text-lone-success",
  parcial: "border-lone-warning-border bg-lone-warning-bg text-lone-warning",
  zero: "border-lone-danger-border bg-lone-danger-bg text-lone-danger",
  andamento: "border-border bg-muted text-muted-foreground",
  fora: "border-transparent text-muted-foreground",
};

const ROTULO_TOM: Record<TomCelula, string> = {
  ok: "Bateu o contratado",
  parcial: "Abaixo do contratado",
  zero: "Nenhum post",
  andamento: "Semana em andamento",
  fora: "Ainda não era cliente",
};

function tomDoCumprimento(p: number | null): string {
  if (p == null) return "text-muted-foreground";
  if (p >= 100) return "text-lone-success";
  if (p >= 70) return "text-lone-warning";
  return "text-lone-danger";
}

function Celula({ c }: { c: CelulaMapa }) {
  const texto = c.tom === "fora" ? "—" : `${c.posts}/${c.contratado}`;
  const dica = `${ROTULO_TOM[c.tom]}${c.tom === "fora" ? "" : ` · ${c.leitura}`}`;
  return (
    <div title={dica} aria-label={dica}
      className={cn("flex h-10 min-w-[56px] flex-col items-center justify-center rounded-md border text-xs font-medium tabular-nums", ESTILO_TOM[c.tom])}>
      <span>{texto}</span>
      {c.tom !== "fora" && (
        <span className="mt-0.5 flex gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <span key={d} className={cn("h-1 w-1 rounded-full", c.diasComPost.includes(d) ? "bg-current" : "bg-current opacity-20")} />
          ))}
        </span>
      )}
    </div>
  );
}

export default function MapaPostagem() {
  const [semanas, setSemanas] = useState<(typeof OPCOES_SEMANAS)[number]>(8);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [social, setSocial] = useState<string>(TODOS);
  const [soAbaixo, setSoAbaixo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    chamar<Resposta>(`/api/gestao/mapa-postagem?semanas=${semanas}`).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok || !r.data) { setDados(null); setErro(r.erro ?? "Não consegui montar o mapa agora."); return; }
      setDados(r.data);
    });
    return () => { vivo = false; };
  }, [semanas, tentativa]);

  const linhas = useMemo(() => (dados?.linhas ?? []).filter((l) =>
    (social === TODOS || (l.social ?? "Sem social definido") === social)
    && (!soAbaixo || (l.temInstagram && (l.cumprimento ?? 100) < 100))), [dados, social, soAbaixo]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lone-h1 tracking-tight text-foreground">Postado × contratado, cliente por semana</h1>
          <p className="mt-1 max-w-prose text-lone-body text-muted-foreground">
            Posts no ar no Instagram (não o quadro) contra seg/qua/sex. A semana em andamento fica neutra até bater o contratado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Semanas" className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {OPCOES_SEMANAS.map((n) => (
              <button key={n} type="button" onClick={() => setSemanas(n)} aria-pressed={semanas === n} disabled={carregando}
                className={cn("h-8 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-60",
                  semanas === n ? "border border-border bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {n} semanas
              </button>
            ))}
          </div>
          <Select value={social} onValueChange={setSocial}>
            <SelectTrigger className="h-9 w-[190px] bg-card" aria-label="Filtrar por social">
              <SelectValue placeholder="Social" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os sociais</SelectItem>
              {(dados?.porSocial ?? []).map((s) => <SelectItem key={s.social} value={s.social}>{s.social}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-secondary-foreground">
            <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} className="accent-primary" />
            Só abaixo do contratado
          </label>
        </div>
      </div>

      {erro && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-sm text-lone-warning" role="alert">
          <span className="min-w-[200px] flex-1">{erro}</span>
          <button type="button" onClick={() => setTentativa((t) => t + 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent">
            <RefreshCcw size={13} aria-hidden /> Tentar de novo
          </button>
        </div>
      )}

      {/* Por social: o cumprimento das semanas fechadas */}
      {dados && dados.porSocial.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dados.porSocial.map((s) => (
            <button key={s.social} type="button" onClick={() => setSocial(social === s.social ? TODOS : s.social)}
              aria-pressed={social === s.social}
              className={cn("rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent",
                social === s.social ? "border-primary/40" : "border-border")}>
              <p className="truncate text-lone-caption text-muted-foreground">{s.social}</p>
              <p className={cn("mt-1 text-lone-hero tabular-nums", tomDoCumprimento(s.cumprimento))}>{s.cumprimento == null ? "—" : `${s.cumprimento}%`}</p>
              <p className="mt-0.5 text-lone-caption text-muted-foreground">
                {s.clientes} {s.clientes === 1 ? "cliente" : "clientes"} · {s.semanasZeradas} {s.semanasZeradas === 1 ? "semana zerada" : "semanas zeradas"}
              </p>
            </button>
          ))}
        </div>
      )}

      {carregando && !dados ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : dados && linhas.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={20} />} title={soAbaixo ? "Todo mundo bateu o contratado" : "Nenhum cliente de social"}
          subtitle={soAbaixo ? "Nas semanas fechadas, ninguém ficou abaixo." : "Nenhum cliente com social contratado neste filtro."} />
      ) : dados ? (
        <div className={cn("overflow-x-auto rounded-xl border border-border bg-card transition-opacity", carregando && "opacity-60")}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-[200px] border-b border-border bg-card px-4 py-2.5 text-left text-lone-caption font-medium text-muted-foreground">Cliente</th>
                {dados.semanas.map((s) => (
                  <th key={s.inicio} scope="col" className="border-b border-border px-1 py-2.5 text-center text-lone-caption font-medium text-muted-foreground">
                    {s.emAndamento ? "Esta semana" : s.rotulo}
                  </th>
                ))}
                <th scope="col" className="border-b border-border px-4 py-2.5 text-right text-lone-caption font-medium text-muted-foreground">Cumprimento</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.clientId} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-4 py-2 text-left font-normal group-hover:bg-accent">
                    <Link href={`/clients/${l.clientId}`} className="block truncate text-sm font-medium text-foreground hover:underline">{l.nome}</Link>
                    <span className="flex items-center gap-1.5 text-lone-caption text-muted-foreground">
                      {l.social ?? "Sem social"} · {l.contratadoSemana}/semana
                      {l.pausado && <span className="inline-flex items-center gap-0.5 text-lone-warning"><Pause size={10} aria-hidden /> pausado</span>}
                    </span>
                  </th>
                  {l.temInstagram ? l.celulas.map((c) => (
                    <td key={c.semana} className="border-b border-border px-1 py-2"><Celula c={c} /></td>
                  )) : (
                    <td colSpan={dados.semanas.length} className="border-b border-border px-2 py-2">
                      <span className="inline-flex items-center gap-1.5 text-lone-caption text-muted-foreground">
                        <CameraOff size={13} aria-hidden /> Sem Instagram vinculado — não dá pra medir. Vincule na ficha do cliente.
                      </span>
                    </td>
                  )}
                  <td className={cn("border-b border-border px-4 py-2 text-right text-sm font-medium tabular-nums", tomDoCumprimento(l.cumprimento))}>
                    {l.cumprimento == null ? "—" : `${l.cumprimento}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {dados && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-lone-caption text-muted-foreground">
          {(["ok", "parcial", "zero", "andamento"] as TomCelula[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-sm border", ESTILO_TOM[t])} aria-hidden /> {ROTULO_TOM[t]}
            </span>
          ))}
          <span>Os pontinhos são os dias da semana (seg a dom) com post. Passe o mouse na célula para ver o dia a dia.</span>
          {dados.semInstagram > 0 && <span>{dados.semInstagram} {dados.semInstagram === 1 ? "cliente sem" : "clientes sem"} Instagram vinculado fica{dados.semInstagram === 1 ? "" : "m"} fora da conta.</span>}
        </div>
      )}
    </div>
  );
}
