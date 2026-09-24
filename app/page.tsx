"use client";

// app/page.tsx — o INÍCIO. Cada papel abre no que é dele, e o que pede atenção aparece UMA vez.
//
// Antes (até 23/09/2026) esta tela era um dashboard único de 674 linhas que repetia "urgentes" 3×,
// "em risco" 4× e "onboarding" 3× — por getDashboardData (stores no navegador), pelos insights do
// servidor, por SmartAlerts e pelo Radar de Saúde — e duas dessas fontes discordavam sobre o mesmo
// card. Agora tudo vem de uma rota só (/api/inicio/atencao), calculado no servidor, já filtrado pelo
// papel e pela carteira de quem abriu. Regras em lib/inicio/.

import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { AlertTriangle, RotateCw } from "lucide-react";
import Header from "@/components/Header";
import PlatformUpdatesWidget from "@/components/PlatformUpdatesWidget";
import FeedAtencao, { FeedAtencaoSkeleton } from "@/components/inicio/FeedAtencao";
import HojeDoCs from "@/components/inicio/HojeDoCs";
import {
  Carteira, FilaDesigner, ResumoContas, ResumoFunil, ResumoSkeleton, SeuDiaSocial,
} from "@/components/inicio/Resumos";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { cn } from "@/lib/utils";
import type { RespostaInicio } from "@/lib/inicio/tipos";
import type { Role } from "@/lib/types";

const GESTAO: Role[] = ["admin", "manager"];

function saudacao(): string {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })) % 24;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function hojeExtenso(): string {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
}

const VAZIO: Record<Role, { titulo: string; subtitulo: string }> = {
  admin: { titulo: "Nada pedindo atenção", subtitulo: "Nenhum cliente em risco, atraso ou alerta de conta agora." },
  manager: { titulo: "Nada pedindo atenção", subtitulo: "Nenhum cliente em risco, atraso ou alerta de conta agora." },
  traffic: { titulo: "Suas contas estão em dia", subtitulo: "Nenhum alerta de saldo, conta ou resultado nos seus clientes." },
  social: { titulo: "Sua carteira está em dia", subtitulo: "Nenhum atraso, aprovação parada ou cliente calado." },
  designer: { titulo: "Nada fora da fila", subtitulo: "Nenhum post atrasado esperando arte sua." },
  comercial: { titulo: "Follow-ups em dia", subtitulo: "Nenhum lead esperando retorno." },
};

function ResumoDoPapel({ r }: { r: RespostaInicio["resumo"] }) {
  switch (r.tipo) {
    case "traffic": return <ResumoContas t={r.trafego} />;
    case "social": return <SeuDiaSocial s={r.social} />;
    case "designer": return <FilaDesigner d={r.designer} />;
    case "comercial": return <ResumoFunil c={r.comercial} />;
    default: return null;
  }
}

export default function InicioPage() {
  const { role, currentUser } = useRole();
  const [dados, setDados] = useState<RespostaInicio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<RespostaInicio>("/api/inicio/atencao");
    if (r.ok && r.data) { setDados(r.data); setErro(null); }
    else setErro(r.erro ?? "Não consegui carregar o Início.");
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // O papel vem do servidor quando chega (é ele que filtrou o feed); até lá, o do login desenha o esqueleto.
  const papel = (dados?.papel ?? role) as Role;
  const gestao = GESTAO.includes(papel);
  const primeiroNome = (dados?.nome ?? currentUser ?? "").split(" ")[0];
  const itens = dados?.itens ?? [];

  const atencao = (
    <section aria-labelledby="titulo-atencao">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-lone-eyebrow uppercase text-muted-foreground">Atenção</p>
          <h2 id="titulo-atencao" className="text-lone-h2 tracking-tight text-foreground">
            {gestao ? "O que precisa de atenção na carteira" : "O que precisa de atenção nos seus clientes"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          aria-label="Atualizar"
          title="Atualizar"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RotateCw size={14} className={cn(carregando && "animate-spin")} aria-hidden />
        </button>
      </div>
      {dados ? <FeedAtencao itens={itens} vazio={VAZIO[papel]} /> : !erro && <FeedAtencaoSkeleton />}
    </section>
  );

  // Designer: a fila já é o feed dele — o bloco de atenção só aparece quando há algo fora dela.
  const mostrarAtencao = papel !== "designer" || !dados || itens.length > 0;

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <Header title="Início" subtitle={`${saudacao()}${primeiroNome ? `, ${primeiroNome}` : ""} · ${hojeExtenso()}`} />

      <MotionConfig reducedMotion="user">
        <div className="animate-fade-in space-y-6 p-4 sm:p-6">
          <PlatformUpdatesWidget />

          {erro && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3">
              <AlertTriangle size={15} className="shrink-0 text-lone-danger" aria-hidden />
              <p className="flex-1 text-lone-body text-lone-danger">{erro}</p>
              <button type="button" onClick={() => void carregar()} className="text-xs font-medium text-lone-danger underline-offset-4 hover:underline">
                Tentar de novo
              </button>
            </div>
          )}

          {dados && dados.falhas.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-lone-caption text-lone-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              Não consegui ler {dados.falhas.join(", ")}. O que aparece abaixo pode estar incompleto.
            </p>
          )}

          {gestao ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="min-w-0 xl:col-span-2">{atencao}</div>
              <aside aria-label="Estado da carteira" className="min-w-0 space-y-4">
                {/* Leva 6A: o CS começa o dia no feed de prioridades do agente — daqui, um clique. */}
                <HojeDoCs />
                {dados?.resumo.tipo === "gestao"
                  ? <Carteira c={dados.resumo.carteira} />
                  : !erro && <div className="space-y-4"><ResumoSkeleton /><ResumoSkeleton altura="h-24" /><ResumoSkeleton altura="h-32" /></div>}
              </aside>
            </div>
          ) : (
            <>
              {dados ? <ResumoDoPapel r={dados.resumo} /> : !erro && <ResumoSkeleton />}
              {mostrarAtencao && atencao}
            </>
          )}
        </div>
      </MotionConfig>
    </div>
  );
}
