"use client";

// components/trafego/hoje/RotinaSemana.tsx — o checklist que era a aba "Rotina Diária", compacto.
//
// A aba virou o Hoje (Leva 4), mas as marcações continuam valendo: traffic_routine_checks alimenta o
// PDF semanal da produção do time (lib/reports/teamWeekly.ts, "rotina registrada"). Então os quatro
// itens ficam, um por linha, fechados; abre o que tem pendência:
//   · contato nos grupos (seg/qua/sex, a automação envia e marca; só as falhas pedem mão);
//   · relatório semanal (segunda), check-in (quarta) e feedback (sexta) — os três só para quem
//     comprou tráfego, que é quem recebe relatório de anúncio.
// Saiu: o "Briefing Diário da AI" (dependia de abrir a aba Anúncios antes e chamava a Meta pelo
// navegador — o Hoje traz o diagnóstico do servidor) e os avisos de tarefa (moram no Meu Trabalho).

import { useState } from "react";
import { BarChart2, Check, ChevronDown, ClipboardCheck, FileText, MessageCircle, Star } from "lucide-react";
import { cn, todaySP } from "@/lib/utils";
import { emOperacao } from "@/lib/clients/operacao";
import { temTrafego } from "@/lib/clients/servico";
import type { Client, TrafficRoutineCheck } from "@/lib/types";

type TipoCheck = "support" | "report" | "feedback" | "analysis";

export interface RegistroMensagem { clientId: string; dateKey: string; kind: "report" | "support"; status: string }

interface Props {
  clientes: Client[];
  checks: TrafficRoutineCheck[];
  onCheck: (check: { clientId: string; clientName: string; date: string; type: TipoCheck; completedBy: string; note?: string }) => void | Promise<void>;
  currentUser: string;
  messageLog: RegistroMensagem[];
}

function Item({
  icone: Icone, titulo, quando, hoje, feitos, total, resumo, children,
}: {
  icone: typeof Star; titulo: string; quando: string; hoje: boolean; feitos: number; total: number;
  resumo?: React.ReactNode; children?: React.ReactNode;
}) {
  const pendentes = Math.max(0, total - feitos);
  const [aberto, setAberto] = useState(false);
  const podeAbrir = !!children;
  return (
    <li>
      <button
        type="button"
        onClick={() => podeAbrir && setAberto((v) => !v)}
        aria-expanded={podeAbrir ? aberto : undefined}
        className={cn("flex w-full items-center gap-3 px-4 py-3 text-left", podeAbrir && "hover:bg-accent/40")}
      >
        <Icone size={15} className={hoje ? "text-primary" : "text-muted-foreground"} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-lone-body font-medium text-foreground">
            {titulo}
            {hoje && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">Hoje</span>}
          </p>
          <p className="truncate text-lone-caption text-muted-foreground">{resumo ?? quando}</p>
        </div>
        {total > 0 && (
          <span className={cn("text-lone-caption tabular-nums", pendentes === 0 ? "text-lone-success" : "text-muted-foreground")}>
            {pendentes === 0 ? <Check size={14} className="inline" aria-label="Em dia" /> : `${feitos}/${total}`}
          </span>
        )}
        {podeAbrir && <ChevronDown size={15} className={cn("text-muted-foreground transition-transform", !aberto && "-rotate-90")} aria-hidden />}
      </button>
      {podeAbrir && aberto && <div className="space-y-1.5 px-4 pb-3">{children}</div>}
    </li>
  );
}

/** 0=dom … 6=sáb de "YYYY-MM-DD" (calendário, sem fuso). */
function diaDaSemana(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/** Segunda-feira da semana de "YYYY-MM-DD". Domingo pertence à semana que termina nele. */
function segundaDaSemana(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

const MARCA = "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary";

export default function RotinaSemana({ clientes, checks, onCheck, currentUser, messageLog }: Props) {
  const hoje = todaySP();
  const dia = diaDaSemana(hoje); // 0=dom … 5=sex, em São Paulo
  const segunda = segundaDaSemana(hoje);
  const ativos = clientes.filter(emOperacao);
  const deTrafego = ativos.filter((c) => temTrafego({ service_type: c.serviceType }));

  const [notas, setNotas] = useState<Record<string, string>>({});
  const nota = (k: string) => notas[k] ?? "";
  const marcar = (c: Client, type: TipoCheck, texto?: string) => {
    onCheck({ clientId: c.id, clientName: c.name, date: hoje, type, completedBy: currentUser, note: texto?.trim() || undefined });
    if (texto !== undefined) setNotas((n) => ({ ...n, [`${type}:${c.id}`]: "" }));
  };

  // Feito = marcado por qualquer pessoa do time (o cliente é que precisa do contato, não quem clicou).
  const feitosNa = (type: TipoCheck, desde: string) =>
    new Set(checks.filter((c) => c.type === type && c.date >= desde).map((c) => c.clientId));
  const logDe = (kind: "report" | "support", status: string, desde: string) =>
    new Set(messageLog.filter((l) => l.kind === kind && l.status === status && l.dateKey >= desde).map((l) => l.clientId));

  // Contato nos grupos: seg (relatório para tráfego, texto para só-social), qua e sex (suporte).
  const diaDeEnvio = dia === 1 || dia === 3 || dia === 5;
  const contatoFeito = new Set([...feitosNa("support", hoje), ...logDe("support", "sent", hoje), ...logDe("report", "sent", hoje)]);
  const contatoFalhou = ativos.filter((c) => !contatoFeito.has(c.id) && logDe("support", "failed", hoje).has(c.id));
  const contatoFeitos = ativos.filter((c) => contatoFeito.has(c.id)).length;

  const relatorioFeito = new Set([...feitosNa("report", segunda), ...logDe("report", "sent", segunda)]);
  const relatorioFalhou = logDe("report", "failed", segunda);
  const relatorioPend = deTrafego.filter((c) => !relatorioFeito.has(c.id));
  const checkinFeito = feitosNa("analysis", segunda);
  const checkinPend = deTrafego.filter((c) => !checkinFeito.has(c.id));
  const feedbackFeito = feitosNa("feedback", segunda);
  const feedbackPend = deTrafego.filter((c) => !feedbackFeito.has(c.id));

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="rotina-semana">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ClipboardCheck size={15} className="text-muted-foreground" aria-hidden />
        <h3 id="rotina-semana" className="text-lone-h2 tracking-tight text-foreground">Rotina da semana</h3>
        <span className="hidden text-lone-caption text-muted-foreground sm:inline">o que a automação não fecha sozinha</span>
      </header>
      <ul className="divide-y divide-border">
        <Item
          icone={MessageCircle} titulo="Contato nos grupos" quando="Seg, qua e sex às 8h · a automação envia e marca"
          hoje={diaDeEnvio} feitos={diaDeEnvio ? contatoFeitos : 0} total={diaDeEnvio ? ativos.length : 0}
          resumo={!diaDeEnvio ? "Sem envio hoje · seg, qua e sex às 8h a automação envia e marca"
            : contatoFalhou.length ? `${contatoFalhou.length} falharam na automação — envie à mão e marque`
            : `Automação: ${contatoFeitos}/${ativos.length} grupos atendidos hoje`}
        >
          {contatoFalhou.length > 0 ? contatoFalhou.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-lone-body text-foreground">{c.name}</span>
              <button type="button" className={MARCA} onClick={() => marcar(c, "support")}>
                <MessageCircle size={12} aria-hidden /> Marcar enviado
              </button>
            </div>
          )) : undefined}
        </Item>

        <Item
          icone={FileText} titulo="Relatório semanal" quando="Toda segunda · sai automático com o PDF de 7 dias"
          hoje={dia === 1} feitos={deTrafego.length - relatorioPend.length} total={deTrafego.length}
        >
          {relatorioPend.length > 0 ? relatorioPend.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-lone-body text-foreground">{c.name}</span>
              {relatorioFalhou.has(c.id) && <span className="text-lone-caption text-lone-danger">falhou no envio</span>}
              <button type="button" className={MARCA} onClick={() => marcar(c, "report")}>
                <Check size={12} aria-hidden /> Entregue
              </button>
            </div>
          )) : undefined}
        </Item>

        <Item
          icone={BarChart2} titulo="Check-in de meio de semana" quando="Toda quarta · como estão os anúncios, algum ajuste?"
          hoje={dia === 3} feitos={deTrafego.length - checkinPend.length} total={deTrafego.length}
        >
          {checkinPend.length > 0 ? checkinPend.map((c) => {
            const k = `analysis:${c.id}`;
            return (
              <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center">
                <span className="min-w-0 truncate text-lone-body text-foreground sm:w-40 sm:shrink-0">{c.name}</span>
                <input
                  value={nota(k)}
                  onChange={(e) => setNotas((n) => ({ ...n, [k]: e.target.value }))}
                  placeholder="Ex.: CPC subiu 10%, ajustei a segmentação…"
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
                <button type="button" className={MARCA} onClick={() => marcar(c, "analysis", nota(k))}>
                  <Check size={12} aria-hidden /> Registrar
                </button>
              </div>
            );
          }) : undefined}
        </Item>

        <Item
          icone={Star} titulo="Feedback semanal" quando="Toda sexta · resultados, problemas, ações e o plano da próxima"
          hoje={dia === 5} feitos={deTrafego.length - feedbackPend.length} total={deTrafego.length}
        >
          {feedbackPend.length > 0 ? feedbackPend.map((c) => {
            const k = `feedback:${c.id}`;
            return (
              <div key={c.id} className="space-y-2 rounded-lg border border-border px-3 py-2">
                <span className="block truncate text-lone-body text-foreground">{c.name}</span>
                <textarea
                  value={nota(k)}
                  onChange={(e) => setNotas((n) => ({ ...n, [k]: e.target.value }))}
                  rows={2}
                  placeholder="Resultados da semana, problemas, ações tomadas, plano para a próxima…"
                  className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
                <button type="button" className={MARCA} onClick={() => marcar(c, "feedback", nota(k))}>
                  <Check size={12} aria-hidden /> Registrar feedback
                </button>
              </div>
            );
          }) : undefined}
        </Item>
      </ul>
    </section>
  );
}
