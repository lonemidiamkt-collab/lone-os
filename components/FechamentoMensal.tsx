"use client";

// FECHAMENTO MENSAL — os números da operação, com nome.
//
// PRA QUE (Roberto, 02/09): "o social media tem que entregar não sei quantas artes por mês, então
// tem que mostrar se teve um cliente que não recebeu artes… quantos clientes teve arte, quantos
// não teve, quanto foi tempo de atraso. O designer é a mesma coisa."
//
// O bloco anterior ("Produção dos Colaboradores") mostrava um score de 0 a 100 cujo rodapé
// admitia: "Social/Tráfego: score = saúde média da carteira". Nota de pessoa feita da satisfação
// dos clientes dela — que dependem de tráfego, aprovação do cliente e do produto do cliente.
//
// Aqui não há nota. Há contagem: quem publicou, quem não publicou (nomeado), quantas artes, quantos
// dias de atraso. É o que dá para agir hoje de manhã.

import { useEffect, useState } from "react";
import { Users, AlertTriangle, Clock, Image as ImageIcon, EyeOff } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface Social {
  pessoa: string; clientes: number; comPost: number; semPost: number;
  clientesSemPost: string[];
  clientesAbaixoDaMeta: { cliente: string; publicados: number; meta: number }[];
  publicados: number; metaTotal: number; atingimento: number;
  artesRegistradas: number; ilegiveis: number;
}
interface Designer {
  pessoa: string; artesEntregues: number; noPrazo: number; atrasadas: number;
  pontualidade: number; diasMediosDeAtraso: number | null;
  piorAtraso: { cliente: string; titulo: string; dias: number } | null;
  clientesAtendidos: number;
}
interface Resposta {
  rotulo: string; mes: string;
  social: Social[]; designer: Designer[];
  clientes: { cliente: string; social: string | null; publicados: number; meta: number; artesRegistradas: number; semNenhumPost: boolean; ilegivel: boolean }[];
  totais: {
    clientes: number; publicados: number; artes_registradas: number; diferenca_registro: number;
    clientes_sem_post: number; clientes_ilegiveis: number;
  };
}

/** Últimos 6 meses, do mais recente para o mais antigo. O padrão é o mês fechado. */
function ultimosMeses(qtd = 6): { valor: string; rotulo: string }[] {
  const hoje = new Date();
  return Array.from({ length: qtd }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1 - i, 15);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { valor, rotulo: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) };
  });
}

export default function FechamentoMensal() {
  const meses = ultimosMeses();
  const [mes, setMes] = useState(meses[0].valor);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    authedFetch(`/api/scores/mensal?mes=${mes}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (vivo) setDados(j); })
      .catch((e) => { if (vivo) setErro(String(e.message ?? e)); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [mes]);

  if (carregando && !dados) {
    return <div className="card p-4"><p className="text-xs text-muted-foreground">Carregando fechamento…</p></div>;
  }
  if (erro) {
    return (
      <div className="card p-4">
        <p className="text-xs text-destructive">Não consegui carregar o fechamento: {erro}</p>
      </div>
    );
  }
  if (!dados) return null;

  const t = dados.totais;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users size={14} className="text-primary" /> Fechamento do mês
          <span className="text-[10px] text-muted-foreground font-normal capitalize">· {dados.rotulo}</span>
        </h3>
        <div className="flex gap-1">
          {meses.map((m) => (
            <button
              key={m.valor}
              onClick={() => setMes(m.valor)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                mes === m.valor ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Linha de totais — o retrato do mês em cinco números */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Tile rotulo="Clientes" valor={String(t.clientes)} />
        <Tile rotulo="Posts publicados" valor={String(t.publicados)} sub="lido do Instagram" />
        <Tile
          rotulo="Sem nenhum post"
          valor={String(t.clientes_sem_post)}
          tom={t.clientes_sem_post > 0 ? "danger" : "success"}
        />
        <Tile
          rotulo="Artes no sistema"
          valor={String(t.artes_registradas)}
          sub={t.diferenca_registro > 0 ? `${t.diferenca_registro} publicados sem registro` : undefined}
          tom={t.diferenca_registro > 20 ? "warning" : undefined}
        />
      </div>

      {/* SOCIAL */}
      <div className="space-y-2 mb-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Social</p>
        {dados.social.map((s) => (
          <div key={s.pessoa} className="p-3 rounded-xl bg-surface border border-border">
            <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{s.pessoa}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {s.clientes} clientes · <span className="text-foreground font-medium">{s.publicados}</span> de {s.metaTotal} posts
                <span className={s.atingimento >= 90 ? " text-lone-success" : s.atingimento >= 70 ? " text-lone-warning" : " text-destructive"}>
                  {" "}({s.atingimento}%)
                </span>
              </p>
            </div>

            <div className="h-1.5 rounded-full bg-card overflow-hidden mb-2.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  s.atingimento >= 90 ? "bg-lone-success" : s.atingimento >= 70 ? "bg-lone-warning" : "bg-destructive"
                }`}
                style={{ width: `${Math.min(100, s.atingimento)}%` }}
              />
            </div>

            {s.clientesSemPost.length > 0 && (
              <p className="text-[11px] text-destructive flex items-start gap-1.5 mb-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span><b>{s.clientesSemPost.length} sem nenhum post:</b> {s.clientesSemPost.join(", ")}</span>
              </p>
            )}

            {s.clientesAbaixoDaMeta.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                <span className="text-lone-warning font-medium">Abaixo da meta:</span>{" "}
                {s.clientesAbaixoDaMeta.slice(0, 6).map((c) => `${c.cliente} (${c.publicados}/${c.meta})`).join(" · ")}
                {s.clientesAbaixoDaMeta.length > 6 && ` … e mais ${s.clientesAbaixoDaMeta.length - 6}`}
              </p>
            )}

            {s.ilegiveis > 0 && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1.5">
                <EyeOff size={11} />
                {s.ilegiveis} cliente{s.ilegiveis > 1 ? "s" : ""} sem acesso para eu ler o Instagram — não conta contra o social
              </p>
            )}
          </div>
        ))}
      </div>

      {/* DESIGNER */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Designer</p>
        {dados.designer.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Nenhuma arte com entrega registrada neste mês.</p>
        )}
        {dados.designer.map((g) => (
          <div key={g.pessoa} className="p-3 rounded-xl bg-surface border border-border">
            <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{g.pessoa}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
                <ImageIcon size={11} /> {g.artesEntregues} artes · {g.clientesAtendidos} clientes
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              <span className="text-lone-success tabular-nums">{g.noPrazo} no prazo</span>
              <span className={`tabular-nums ${g.atrasadas > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {g.atrasadas} atrasada{g.atrasadas === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground">
                pontualidade <b className="text-foreground tabular-nums">{g.pontualidade}%</b>
              </span>
              {g.diasMediosDeAtraso !== null && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock size={11} /> atraso médio <b className="text-foreground tabular-nums">{g.diasMediosDeAtraso}d</b>
                </span>
              )}
            </div>
            {g.piorAtraso && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Pior caso: <span className="text-foreground">{g.piorAtraso.titulo}</span> ({g.piorAtraso.cliente}) —{" "}
                <span className="text-destructive tabular-nums">{g.piorAtraso.dias} dias</span>
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        <b>Posts publicados</b> vêm do Instagram do cliente; <b>artes no sistema</b> vêm dos cards marcados como
        entregues. A diferença entre os dois é registro que não voltou ao board — não é trabalho que não foi feito.
        Cliente sem acesso de leitura sai da conta e aparece à parte.
      </p>
    </div>
  );
}

function Tile({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: "success" | "warning" | "danger" }) {
  const cor = tom === "success" ? "text-lone-success" : tom === "warning" ? "text-lone-warning" : tom === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="p-3 rounded-xl bg-surface border border-border">
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{rotulo}</p>
      {sub && <p className="text-[9px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}
