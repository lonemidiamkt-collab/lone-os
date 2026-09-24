"use client";

// components/trafego/hoje/LinhaCliente.tsx — uma linha do Hoje: o cliente, o pior problema, os outros
// em chips, os números do dia e as três ações (visto, abrir conta, pedir criativo).

import Link from "next/link";
import {
  AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, ExternalLink, Eye, Info, Loader2, Palette,
  Sparkles, Undo2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { estiloDasIniciais, iniciais } from "@/lib/notificacoes/visual";
import type { LinhaHoje, NivelAlerta, ProblemaHoje } from "@/lib/traffic/hoje/tipos";
import { COR, duracao, pct, quando, reais, variacao } from "./formato";
import { ROTULO_RESULTADO } from "@/lib/meta/resultado";
import { compararComNicho } from "@/lib/traffic/referencia-nicho";

const ICONE: Record<NivelAlerta, typeof Info> = { critical: AlertOctagon, warning: AlertTriangle, info: Info };

function Rosto({ nome, logo }: { nome: string; logo: string | null }) {
  return (
    <Avatar className="h-9 w-9 rounded-lg bg-card ring-1 ring-border" title={nome}>
      {logo && <AvatarImage src={logo} alt="" className="object-contain p-0.5" />}
      <AvatarFallback delayMs={logo ? 500 : undefined} className="rounded-[inherit] text-[11px] font-semibold" style={estiloDasIniciais(nome)}>
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

function Chip({ p }: { p: ProblemaHoje }) {
  const Icone = p.visto ? Eye : ICONE[p.nivel];
  return (
    <span
      title={`${p.detalhe}${p.visto ? ` — visto${p.visto.por ? ` por ${p.visto.por}` : ""}` : ""}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        COR[p.nivel].chip, p.visto && "opacity-60",
      )}
    >
      <Icone size={11} className="shrink-0" aria-hidden />
      <span className="truncate">{p.titulo}</span>
    </span>
  );
}

/** Um número com rótulo e uma linha de apoio. */
function Numero({ rotulo, valor, apoio, extra, tom }: { rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode; extra?: React.ReactNode; tom?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-lone-caption text-muted-foreground">{rotulo}</dt>
      <dd className={cn("truncate text-lone-body font-medium tabular-nums text-foreground", tom)}>{valor}</dd>
      {apoio && <dd className="truncate text-lone-caption tabular-nums text-muted-foreground">{apoio}</dd>}
      {extra && <dd className="truncate text-lone-caption tabular-nums text-muted-foreground">{extra}</dd>}
    </div>
  );
}

/** Leva 7A (N6): a mediana anônima do nicho ao lado do custo do cliente (30 dias). */
function ReferenciaDoNicho({ n, um }: { n: LinhaHoje["numeros"]; um: string }) {
  const ref = n.referenciaNicho;
  if (!ref || ref.custo == null) return null;
  const meu = n.proprio30d?.custo ?? null;
  const comp = compararComNicho(meu, ref.custo);
  const pctFmt = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
  const titulo = `Mediana de ${ref.clientes} clientes de ${ref.nicho}, últimos 30 dias (anônima).\n` +
    `Custo por ${um}: nicho ${reais(ref.custo, 2)} · este cliente ${reais(meu, 2)}\n` +
    `CTR: nicho ${pctFmt(ref.ctr)} · este cliente ${pctFmt(n.proprio30d?.ctr)}\n` +
    `CPM: nicho ${reais(ref.cpm, 2)} · este cliente ${reais(n.proprio30d?.cpm ?? null, 2)}`;
  return (
    <span title={titulo} className={cn("cursor-help", comp === "acima" ? "text-lone-warning" : comp === "abaixo" ? "text-lone-success" : undefined)}>
      nicho {reais(ref.custo, 2)}{comp === "acima" ? " · acima" : comp === "abaixo" ? " · abaixo" : ""}
    </span>
  );
}

function Variacao({ v, subirEhBom }: { v: number | null; subirEhBom: boolean }) {
  if (v === null || Math.abs(v) < 0.2) return null; // abaixo de 20% é ruído de um dia
  const bom = subirEhBom ? v > 0 : v < 0;
  const Seta = v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("ml-1 inline-flex items-center text-lone-caption font-medium", bom ? "text-lone-success" : "text-lone-danger")}>
      <Seta size={11} aria-hidden />{pct(v)}
    </span>
  );
}

function Numeros({ l }: { l: LinhaHoje }) {
  const n = l.numeros;
  // Leva 7A (N4): o resultado segue o objetivo — conta de formulário mostra leads; de venda, compras.
  const rotuloResultado = ROTULO_RESULTADO[n.tipoResultado ?? "mensagens"].varios;
  const alertaConta = l.problemas.find((p) => p.tipo === "conta");
  const leituraFalhou = !!alertaConta && alertaConta.titulo === "Leitura da Meta falhou";
  const saldo = n.statusConta
    ? <Numero rotulo="Conta" valor={n.statusConta} tom={alertaConta ? COR[alertaConta.nivel].texto : undefined}
        apoio={leituraFalhou ? "saldo desatualizado" : "anúncios parados ou em risco"} />
    : n.cartao
      ? <Numero rotulo="Saldo" valor="Cartão" apoio={n.saldo !== null ? `resta ${reais(n.saldo)} da verba` : "sem saldo que acabe"} />
      : <Numero rotulo="Saldo" valor={reais(n.saldo)} apoio={duracao(n.diasRestantes) ?? (n.saldo === null ? "sem leitura" : undefined)}
          tom={n.diasRestantes !== null && n.diasRestantes <= 1 ? COR.critical.texto : undefined} />;
  return (
    <dl className="grid grid-cols-3 gap-3 xl:w-[23rem] xl:shrink-0">
      {saldo}
      <Numero
        rotulo="Gasto ontem"
        valor={reais(n.gastoOntem)}
        apoio={n.gastoMedio3d !== null ? `média 3d ${reais(n.gastoMedio3d)}` : undefined}
      />
      <Numero
        rotulo={`${rotuloResultado.charAt(0).toUpperCase()}${rotuloResultado.slice(1)} ontem`}
        valor={n.conversasOntem === null ? "—" : <>{n.conversasOntem}<Variacao v={variacao(n.conversasOntem, n.conversasMedia7d)} subirEhBom /></>}
        apoio={n.custoOntem !== null || n.custoMedio7d !== null
          ? <>{reais(n.custoOntem, 2)} cada<Variacao v={variacao(n.custoOntem, n.custoMedio7d)} subirEhBom={false} /></>
          : n.conversasMedia7d !== null ? `média 7d ${n.conversasMedia7d.toFixed(1).replace(".", ",")}/dia` : undefined}
        extra={n.referenciaNicho?.custo != null ? <ReferenciaDoNicho n={n} um={ROTULO_RESULTADO[n.tipoResultado ?? "mensagens"].um} /> : undefined}
      />
    </dl>
  );
}

export interface AcoesLinha {
  vistoDisponivel: boolean;
  salvando: boolean;
  mostrarGestor: boolean;
  onVisto: (l: LinhaHoje, marcar: boolean) => void;
  onPedirCriativo: (l: LinhaHoje) => void;
}

const BOTAO = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-50";

export default function LinhaCliente({ l, acoes }: { l: LinhaHoje; acoes: AcoesLinha }) {
  const abertos = l.problemas.filter((p) => !p.visto);
  const topo = l.problemas[0] ?? null;
  const resto = l.problemas.slice(1);
  const vistoDaLinha = l.estado === "visto" ? l.problemas.find((p) => p.visto)?.visto ?? null : null;
  const barra = l.estado === "aberto" && topo ? COR[topo.nivel].barra : "bg-muted-foreground/30";
  const IconeTopo = topo ? (topo.visto ? Eye : ICONE[topo.nivel]) : null;

  return (
    <li className="relative rounded-xl border border-border bg-card py-3 pl-4 pr-3">
      {l.estado !== "em_dia" && <span className={cn("absolute bottom-3 left-0 top-3 w-[3px] rounded-full", barra)} aria-hidden />}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className={cn("flex min-w-0 flex-1 items-start gap-3", l.estado === "visto" && "opacity-60")}>
          <Rosto nome={l.nome} logo={l.logo} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lone-caption text-muted-foreground">
              <Link href={l.linkCliente} className="font-medium text-foreground/80 hover:text-primary">{l.nome}</Link>
              {acoes.mostrarGestor && l.gestor && <><span aria-hidden> · </span>{l.gestor}</>}
            </p>
            {topo && IconeTopo ? (
              <>
                <p className="flex items-center gap-1.5 text-lone-body font-medium leading-snug text-foreground">
                  <IconeTopo size={14} className={cn("shrink-0", topo.visto ? "text-muted-foreground" : COR[topo.nivel].texto)} aria-hidden />
                  <span className="min-w-0">{topo.titulo}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-lone-caption text-muted-foreground">
                  {topo.detalhe}{topo.acao ? ` — ${topo.acao}` : ""}
                </p>
              </>
            ) : (
              <p className="text-lone-body text-muted-foreground">Sem alerta</p>
            )}
            {(resto.length > 0 || l.dicas.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {resto.map((p) => <Chip key={p.tipo} p={p} />)}
                {l.dicas.slice(0, 1).map((d) => (
                  <span key={d} title={d} className="inline-flex max-w-full items-center gap-1 rounded-md border border-lone-success-border bg-lone-success-bg px-1.5 py-0.5 text-[11px] font-medium text-lone-success">
                    <Sparkles size={11} className="shrink-0" aria-hidden />
                    <span className="truncate">Pode escalar</span>
                  </span>
                ))}
              </div>
            )}
            {vistoDaLinha && (
              <p className="mt-1 flex items-center gap-1 text-lone-caption text-muted-foreground">
                <Eye size={11} aria-hidden />
                Visto{vistoDaLinha.por ? ` por ${vistoDaLinha.por}` : ""} {quando(vistoDaLinha.em)} · volta {quando(vistoDaLinha.ate)} ou se piorar
              </p>
            )}
          </div>
        </div>

        <Numeros l={l} />

        <div className="flex flex-wrap items-center gap-1.5 xl:shrink-0 xl:flex-nowrap">
          {acoes.vistoDisponivel && l.estado !== "em_dia" && (
            abertos.length > 0 ? (
              <button type="button" className={BOTAO} disabled={acoes.salvando} onClick={() => acoes.onVisto(l, true)}
                title="Some dos avisos por 24h (WhatsApp, PDF e Início). Volta antes se piorar.">
                {acoes.salvando ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Eye size={13} aria-hidden />}
                Marcar visto
              </button>
            ) : (
              <button type="button" className={BOTAO} disabled={acoes.salvando} onClick={() => acoes.onVisto(l, false)}>
                {acoes.salvando ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Undo2 size={13} aria-hidden />}
                Desfazer visto
              </button>
            )
          )}
          {l.linkContaExterno ? (
            <a href={l.linkConta} target="_blank" rel="noopener noreferrer" className={BOTAO}
              title="Abrir no Gerenciador de Anúncios" aria-label="Abrir conta no Gerenciador de Anúncios">
              <ExternalLink size={13} aria-hidden /><span className="xl:hidden">Abrir conta</span>
            </a>
          ) : (
            <Link href={l.linkConta} className={BOTAO} title="Resultados do cliente no painel" aria-label="Abrir resultados do cliente">
              <ExternalLink size={13} aria-hidden /><span className="xl:hidden">Abrir conta</span>
            </Link>
          )}
          <button type="button" className={BOTAO} onClick={() => acoes.onPedirCriativo(l)}
            title="Pedir criativo ao Designer" aria-label="Pedir criativo ao Designer">
            <Palette size={13} aria-hidden /><span className="xl:hidden">Pedir criativo</span>
          </button>
        </div>
      </div>
    </li>
  );
}
