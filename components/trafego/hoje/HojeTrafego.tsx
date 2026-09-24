"use client";

// components/trafego/hoje/HojeTrafego.tsx — a aba "Hoje" do Tráfego: o cockpit do gestor.
//
// Substitui a "Rotina Diária" (Leva 4, 24/09/2026). Uma lista, uma linha por cliente que comprou
// tráfego, o pior problema primeiro — saldo, conta, entrega e o diagnóstico diário, tudo do que o
// servidor já calcula (/api/trafego/hoje, uma chamada). Marcar "visto" cala o alerta por 24h em
// todos os canais (WhatsApp, PDF, Início), a menos que piore. Embaixo, o checklist da semana.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Loader2, RefreshCw, Sun, UserCheck } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { comVisto, compararLinhas, contarLinhas } from "@/lib/traffic/hoje/ordem";
import type { AlertaRef, LinhaHoje, RespostaHoje } from "@/lib/traffic/hoje/tipos";
import type { Client, TrafficRoutineCheck } from "@/lib/types";
import LinhaCliente from "./LinhaCliente";
import RotinaSemana, { type RegistroMensagem } from "./RotinaSemana";
import { COR, ddmm, haQuanto } from "./formato";

interface Props {
  /** Carteira da tela (já com o filtro de workspace) — base do checklist da semana. */
  clientes: Client[];
  routineChecks: TrafficRoutineCheck[];
  onCheck: React.ComponentProps<typeof RotinaSemana>["onCheck"];
  currentUser: string;
  messageLog: RegistroMensagem[];
  /** Abre o pedido de arte ao Designer (o mesmo modal do botão "Solicitar Arte") com o cliente escolhido. */
  onPedirCriativo: (clientId: string, briefing?: string) => void;
}

function Contador({ n, rotulo, ponto }: { n: number; rotulo: string; ponto: string }) {
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-lone-caption text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", ponto)} aria-hidden />
      <span className="font-medium tabular-nums text-foreground">{n}</span> {rotulo}
    </span>
  );
}

export function HojeSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando as contas de hoje">
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
    </div>
  );
}

/** Briefing sugerido quando o problema é de criativo — o modal abre já escrito, dá pra editar. */
function briefingDe(l: LinhaHoje): string | undefined {
  const p = l.problemas.find((x) => x.tipo === "fadiga" || x.tipo === "desperdicio" || x.tipo === "acima_meta");
  return p ? `${p.titulo}: ${p.detalhe}${p.acao ? ` ${p.acao}` : ""}` : undefined;
}

export default function HojeTrafego({ clientes, routineChecks, onCheck, currentUser, messageLog, onPedirCriativo }: Props) {
  const { role } = useRole();
  const [dados, setDados] = useState<RespostaHoje | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  // "Só os meus" começa ligado para o gestor de tráfego; a gestão abre vendo o time todo.
  const [soMeus, setSoMeus] = useState(role === "traffic");
  const [mexeuNoFiltro, setMexeuNoFiltro] = useState(false);
  useEffect(() => { if (!mexeuNoFiltro) setSoMeus(role === "traffic"); }, [role, mexeuNoFiltro]);
  const [verEmDia, setVerEmDia] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    const r = await chamar<RespostaHoje>("/api/trafego/hoje");
    if (r.ok && r.data) { setDados(r.data); setErro(null); }
    else setErro(r.erro ?? "Não consegui carregar o Hoje.");
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const linhas = useMemo(
    () => (dados?.linhas ?? []).filter((l) => !soMeus || l.meu),
    [dados, soMeus],
  );
  const atencao = linhas.filter((l) => l.estado !== "em_dia");
  const emDia = linhas.filter((l) => l.estado === "em_dia");
  const conta = contarLinhas(linhas);
  const urgentes = conta.critical + conta.warning;
  const temMeus = (dados?.linhas ?? []).some((l) => l.meu);

  const marcarVisto = useCallback(async (l: LinhaHoje, marcar: boolean) => {
    const alvo = marcar ? l.problemas.filter((p) => !p.visto) : l.problemas.filter((p) => p.visto);
    if (!alvo.length) return;
    setSalvando(l.clientId);
    const alertas: AlertaRef[] = alvo.map((p) => ({ clientId: l.clientId, tipo: p.tipo, nivel: p.nivel }));
    const r = await chamar("/api/trafego/alertas/visto", { acao: marcar ? "marcar" : "desmarcar", alertas });
    setSalvando(null);
    if (!r.ok) {
      if (r.status === 503) setDados((d) => (d ? { ...d, vistoDisponivel: false } : d));
      toast.error(r.erro ?? "Não consegui gravar o visto.");
      return;
    }
    const agora = new Date();
    const info = marcar
      ? { por: dados?.eu ?? currentUser, em: agora.toISOString(), ate: new Date(agora.getTime() + 24 * 3_600_000).toISOString(), nivel: "info" as const }
      : null;
    setDados((d) => d && {
      ...d,
      linhas: d.linhas.map((x) => (x.clientId === l.clientId ? comVisto(x, info) : x)).sort(compararLinhas),
    });
    toast.success(marcar ? `${l.nome}: visto por 24h. Volta antes se piorar.` : `${l.nome}: alerta de volta.`);
  }, [dados?.eu, currentUser]);

  const acoes = {
    vistoDisponivel: !!dados?.vistoDisponivel,
    mostrarGestor: !soMeus,
    onVisto: marcarVisto,
    onPedirCriativo: (l: LinhaHoje) => onPedirCriativo(l.clientId, briefingDe(l)),
  };

  const sincronizado = haQuanto(dados?.sincronizadoEm);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Cabeçalho: o que é, de quando são os números, e o filtro */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lone-h2 tracking-tight text-foreground">
            <Sun size={15} className="text-primary" aria-hidden /> Hoje
          </h2>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">
            Pior problema primeiro{dados ? ` · números de ontem (${ddmm(dados.ontem)})` : ""}
            {sincronizado ? ` · saldo lido ${sincronizado}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={soMeus}
            onClick={() => { setMexeuNoFiltro(true); setSoMeus((v) => !v); }}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30"
          >
            <span className={cn("relative h-4 w-7 rounded-full transition-colors", soMeus ? "bg-primary" : "bg-muted")} aria-hidden>
              <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-background shadow-sm transition-all", soMeus ? "left-3.5" : "left-0.5")} />
            </span>
            <UserCheck size={13} className="text-muted-foreground" aria-hidden /> Só os meus
          </button>
          <button
            type="button"
            onClick={() => carregar()}
            disabled={carregando}
            aria-label="Atualizar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            {carregando && dados ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => carregar()} className="font-medium underline hover:no-underline">Tentar de novo</button>
        </div>
      )}
      {dados && dados.falhas.length > 0 && (
        <p className="rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-2.5 text-xs text-lone-warning">
          Não consegui ler {dados.falhas.join(", ")} — o que aparece abaixo pode estar incompleto.
        </p>
      )}

      {carregando && !dados ? (
        <HojeSkeleton />
      ) : dados ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Contador n={conta.critical} rotulo={conta.critical === 1 ? "crítico" : "críticos"} ponto={COR.critical.barra} />
            <Contador n={conta.warning} rotulo="em atenção" ponto={COR.warning.barra} />
            <Contador n={conta.info} rotulo="para acompanhar" ponto={COR.info.barra} />
            <Contador n={conta.visto} rotulo={conta.visto === 1 ? "visto" : "vistos"} ponto="bg-muted-foreground/40" />
            <Contador n={conta.em_dia} rotulo="em dia" ponto="bg-lone-success" />
          </div>

          {!dados.vistoDisponivel && atencao.length > 0 && (
            <p className="text-lone-caption text-muted-foreground">
              O botão “Marcar visto” aparece quando a tabela de vistos for criada no banco.
            </p>
          )}

          {soMeus && !temMeus ? (
            <EmptyState
              icon={<UserCheck size={20} />}
              title="Nenhum cliente de tráfego no seu nome"
              subtitle="Desligue o “Só os meus” para ver as contas do time."
              action={<button type="button" onClick={() => { setMexeuNoFiltro(true); setSoMeus(false); }} className="text-xs font-medium text-primary hover:underline">Ver todas as contas</button>}
            />
          ) : (
            <>
              {urgentes === 0 && (
                <EmptyState
                  icon={<CheckCircle2 size={20} />}
                  title="Tudo em dia"
                  subtitle={atencao.length > 0
                    ? "Nenhum alerta crítico ou de atenção em aberto. Abaixo, o que é só para acompanhar e o que já foi visto."
                    : "Nenhum alerta nas contas. Os números de cada cliente estão logo abaixo."}
                  className="py-7"
                />
              )}

              {atencao.length > 0 && (
                <ul className="space-y-2">
                  {atencao.map((l) => (
                    <LinhaCliente key={l.clientId} l={l} acoes={{ ...acoes, salvando: salvando === l.clientId }} />
                  ))}
                </ul>
              )}

              {emDia.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setVerEmDia((v) => !v)}
                    aria-expanded={verEmDia}
                    className="mb-2 flex w-full items-center gap-2 rounded-lg py-1 text-left"
                  >
                    <CheckCircle2 size={15} className="text-lone-success" aria-hidden />
                    <h3 className="text-lone-h2 tracking-tight text-foreground">Em dia</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-lone-caption tabular-nums text-muted-foreground">{emDia.length}</span>
                    <span className="hidden text-lone-caption text-muted-foreground sm:inline">sem alerta — os números de ontem de cada um</span>
                    <ChevronDown size={15} className={cn("ml-auto text-muted-foreground transition-transform", !verEmDia && "-rotate-90")} aria-hidden />
                  </button>
                  {verEmDia && (
                    <ul className="space-y-2">
                      {emDia.map((l) => (
                        <LinhaCliente key={l.clientId} l={l} acoes={{ ...acoes, salvando: false }} />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </>
      ) : null}

      <RotinaSemana
        clientes={soMeus ? clientes.filter((c) => c.assignedTraffic === currentUser) : clientes}
        checks={routineChecks}
        onCheck={onCheck}
        currentUser={currentUser}
        messageLog={messageLog}
      />
    </div>
  );
}
