"use client";

// Próximos posts e calendário do mês no portal do cliente (N36).
//
// Só o que já é compromisso com o cliente: Agendado, No ar e o que ele aprovou. Pauta, arte com o
// designer e revisão interna não aparecem (é trabalho do time em andamento) — a regra mora em
// lib/portal/agenda.ts. Nos que ainda não foram ao ar, o cliente pode pedir alteração (N35).

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { rotuloDiaLongo } from "@/lib/portal/formatos";
import type { ItemAgenda, SituacaoAgenda } from "@/lib/portal/agenda";
import Skeleton from "@/components/ui/Skeleton";
import { Cartao, CabecalhoSecao, entrada } from "./ui";
import PedirAlteracao from "./PedirAlteracao";

interface RespostaAgenda { hoje: string; mes: string; proximos: ItemAgenda[]; doMes: ItemAgenda[] }

const ROTULO: Record<SituacaoAgenda, string> = { agendado: "Agendado", no_ar: "No ar", aprovado: "Aprovado" };
// Mesmas cores das etapas do quadro (lib/conteudo/etapas.ts): Agendado, No ar, Com o cliente.
const COR: Record<SituacaoAgenda, string> = { agendado: "bg-chart-2", no_ar: "bg-lone-success", aprovado: "bg-lone-info" };
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nomeDoMes(mes: string): string {
  return new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function Selo({ situacao }: { situacao: SituacaoAgenda }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-lone-caption text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", COR[situacao])} aria-hidden />
      {ROTULO[situacao]}
    </span>
  );
}

function LinhaPost({ item, token }: { item: ItemAgenda; token: string }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      {item.imagem
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.imagem} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-muted object-cover" loading="lazy" />
        : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><ImageOff size={16} aria-hidden /></span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lone-caption text-muted-foreground">
          <span className="capitalize">{rotuloDiaLongo(item.dia)}{item.hora ? ` · ${item.hora.replace(":00", "h").replace(":", "h")}` : ""}</span>
          {item.formato && <><span aria-hidden>·</span><span>{item.formato}</span></>}
          <span aria-hidden>·</span>
          <Selo situacao={item.situacao} />
        </p>
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-lone-caption font-medium text-primary hover:underline">
            Ver no Instagram <ExternalLink size={12} aria-hidden />
          </a>
        )}
        {item.podeAlterar && (
          <div className="mt-2 max-w-sm">
            <PedirAlteracao token={token} cardId={item.id} titulo={item.titulo} compacto />
          </div>
        )}
      </div>
    </li>
  );
}

export default function PortalAgenda({ token }: { token: string }) {
  const [mes, setMes] = useState<string | null>(null);
  const [dados, setDados] = useState<RespostaAgenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  // Primeira leitura sem nada no mês e nos próximos 7 dias → a seção não aparece (nada a mostrar).
  const [vazioNaAbertura, setVazioNaAbertura] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    chamar<RespostaAgenda>(`/api/portal/${token}/agenda${mes ? `?mes=${mes}` : ""}`).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      // Sem dado novo, o mês anterior NÃO fica na tela sob o nome do mês pedido.
      if (!r.ok || !r.data) { setDados(null); setErro("Não consegui carregar sua agenda agora."); return; }
      setDados(r.data);
      if (!mes) {
        setMes(r.data.mes);
        if (!r.data.proximos.length && !r.data.doMes.length) setVazioNaAbertura(true);
      }
      const hoje = r.data.hoje;
      setDiaAberto(hoje.startsWith(r.data.mes) ? hoje : r.data.doMes[0]?.dia ?? null);
    });
    return () => { vivo = false; };
  }, [token, mes, tentativa]);

  const porDia = useMemo(() => {
    const m = new Map<string, ItemAgenda[]>();
    for (const it of dados?.doMes ?? []) m.set(it.dia, [...(m.get(it.dia) ?? []), it]);
    return m;
  }, [dados]);

  if (vazioNaAbertura) return null;

  if (erro && !dados) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3.5 text-sm text-lone-warning" role="alert">
        <span className="min-w-[200px] flex-1">{erro}</span>
        <button onClick={() => setTentativa((t) => t + 1)}
          className="min-h-[44px] rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!dados) {
    return (
      <Cartao className="p-4 sm:p-5" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      </Cartao>
    );
  }

  // O rótulo e a grade seguem o mês que CHEGOU (não o pedido): enquanto o próximo carrega, nada de
  // dado de um mês com o nome de outro.
  const mesAtual = dados.mes;
  const mesPedido = mes ?? dados.mes;
  const [ano, mesNum] = mesAtual.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate();
  const brancos = (new Date(Date.UTC(ano, mesNum - 1, 1)).getUTCDay() + 6) % 7;
  const itensDoDia = diaAberto ? porDia.get(diaAberto) ?? [] : [];

  return (
    <div className="space-y-5">
      {/* Próximos 7 dias */}
      <motion.section variants={entrada} initial="oculto" animate="visivel" className="space-y-3">
        <CabecalhoSecao icone={CalendarDays} titulo="Próximos posts" descricao="O que está agendado para os próximos 7 dias" />
        <Cartao className="p-4">
          {dados.proximos.length ? (
            <ul className="divide-y divide-border">
              {dados.proximos.map((it) => <LinhaPost key={it.id} item={it} token={token} />)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum post agendado para os próximos 7 dias ainda. Assim que o time agendar, ele aparece aqui.</p>
          )}
        </Cartao>
      </motion.section>

      {/* Calendário do mês */}
      <motion.section variants={entrada} initial="oculto" animate="visivel" custom={1} className="space-y-3">
        <CabecalhoSecao
          titulo={<span className="capitalize">{nomeDoMes(mesAtual)}</span>}
          descricao={`${dados.doMes.length} ${dados.doMes.length === 1 ? "post" : "posts"} no calendário do mês`}
          acao={
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMes(somarMes(mesPedido, -1))} disabled={carregando} aria-label="Mês anterior"
                className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button type="button" onClick={() => setMes(somarMes(mesPedido, 1))} disabled={carregando} aria-label="Próximo mês"
                className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          }
        />
        <Cartao className={cn("p-3 sm:p-4 transition-opacity", carregando && "opacity-60")} aria-busy={carregando}>
          <div className="grid grid-cols-7 gap-1 text-center">
            {SEMANA.map((d) => <span key={d} className="pb-1 text-lone-caption text-muted-foreground">{d}</span>)}
            {Array.from({ length: brancos }).map((_, i) => <span key={`b${i}`} aria-hidden />)}
            {Array.from({ length: diasNoMes }).map((_, i) => {
              const dia = `${mesAtual}-${String(i + 1).padStart(2, "0")}`;
              const itens = porDia.get(dia) ?? [];
              const hoje = dia === dados.hoje;
              const aberto = dia === diaAberto;
              return (
                <button key={dia} type="button" onClick={() => setDiaAberto(dia)}
                  aria-pressed={aberto}
                  aria-label={`${rotuloDiaLongo(dia)}: ${itens.length ? `${itens.length} ${itens.length === 1 ? "post" : "posts"}` : "sem post"}`}
                  className={cn(
                    "flex min-h-[48px] flex-col items-center justify-start gap-1 rounded-lg border px-0.5 py-1.5 text-xs tabular-nums transition-colors sm:min-h-[64px]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    aberto ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-accent",
                  )}>
                  <span className={cn("grid h-6 w-6 place-items-center rounded-full", hoje ? "bg-primary font-medium text-primary-foreground" : itens.length ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {i + 1}
                  </span>
                  {itens.length > 0 && (
                    <span className="flex flex-wrap items-center justify-center gap-0.5" aria-hidden>
                      {itens.slice(0, 3).map((it) => <span key={it.id} className={cn("h-1.5 w-1.5 rounded-full", COR[it.situacao])} />)}
                      {itens.length > 3 && <span className="text-[9px] leading-none text-muted-foreground">+{itens.length - 3}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
            {(Object.keys(ROTULO) as SituacaoAgenda[]).map((s) => <Selo key={s} situacao={s} />)}
          </div>

          {diaAberto && diaAberto.startsWith(mesAtual) && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-lone-caption font-medium capitalize text-foreground">{rotuloDiaLongo(diaAberto)}</p>
              {itensDoDia.length ? (
                <ul className="divide-y divide-border">
                  {itensDoDia.map((it) => <LinhaPost key={it.id} item={it} token={token} />)}
                </ul>
              ) : (
                <p className="text-lone-caption text-muted-foreground">Nenhum post neste dia.</p>
              )}
            </div>
          )}
        </Cartao>
      </motion.section>
    </div>
  );
}
