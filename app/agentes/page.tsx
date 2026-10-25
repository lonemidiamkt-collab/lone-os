"use client";

// Central de Agentes — os agentes de IA do Lone OS, um por linha, com o estado real.
// O catálogo é lib/agentes/catalogo.ts; o uso vem de llm_calls e agent_runs (GET /api/system/agentes).
// Ao lado da Central de Automações: lá ficam as rotinas agendadas (com ou sem IA), aqui o que usa IA.
// Custo em dinheiro não aparece: é número da agência e fica fora do Lone OS.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import Header from "@/components/Header";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InterruptorLoninho from "@/components/agentes/InterruptorLoninho";
import LinhaAgente, { ESTADO_UI, textoGatilho } from "@/components/agentes/LinhaAgente";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { AREAS, ALCANCES, ROTULO_ALCANCE, type Alcance, type Area } from "@/lib/agentes/catalogo";
import { ESTADOS, type Estado } from "@/lib/agentes/estado";
import type { CentralDeAgentes } from "@/lib/agentes/central-server";
import { dataHora, haQuanto } from "@/lib/automacoes/formato";

const ORDEM_ESTADO: Record<Estado, number> = { falhando: 0, parado: 1, funcionando: 2, "sem-registro": 3, desligado: 4 };

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function AgentesPage() {
  const { role, hydrated } = useRole();
  const gestao = role === "admin" || role === "manager";

  const [central, setCentral] = useState<CentralDeAgentes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState<number>(Date.now());

  const [busca, setBusca] = useState("");
  const [area, setArea] = useState<Area | "">("");
  const [alcance, setAlcance] = useState<Alcance | "">("");
  const [estado, setEstado] = useState<Estado | "">("");
  const [soLoninho, setSoLoninho] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<CentralDeAgentes>("/api/system/agentes");
    setCarregando(false);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar a Central de Agentes."); return; }
    setErro(null);
    setCentral(r.data);
    setAgora(Date.now());
  }, []);

  useEffect(() => { if (gestao) void carregar(); }, [gestao, carregar]);

  // Atualiza sozinho a cada 2 minutos com a aba visível.
  useEffect(() => {
    if (!gestao) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") void carregar(); }, 120_000);
    return () => clearInterval(id);
  }, [gestao, carregar]);

  const linhas = central?.agentes ?? null;

  const contagem = useMemo(() => {
    const c: Record<Estado, number> = { funcionando: 0, falhando: 0, parado: 0, desligado: 0, "sem-registro": 0 };
    for (const l of linhas ?? []) c[l.estado]++;
    return c;
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    return (linhas ?? []).filter((l) => {
      const a = l.agente;
      if (area && a.area !== area) return false;
      if (alcance && a.alcance !== alcance) return false;
      if (estado && l.estado !== estado) return false;
      if (soLoninho && !a.noLoninho) return false;
      if (!q) return true;
      const alvo = semAcento([a.nome, a.faz, a.dono, a.modelo, ...a.origens, ...a.gatilhos.map((g) => textoGatilho(g, l.rotinas))].join(" "));
      return alvo.includes(q);
    });
  }, [linhas, busca, area, alcance, estado, soLoninho]);

  const grupos = useMemo(() => AREAS
    .map((ar) => ({
      area: ar,
      itens: filtradas
        .filter((l) => l.agente.area === ar)
        .sort((x, y) => ORDEM_ESTADO[x.estado] - ORDEM_ESTADO[y.estado] || x.agente.nome.localeCompare(y.agente.nome, "pt-BR")),
    }))
    .filter((g) => g.itens.length > 0), [filtradas]);

  const temFiltro = !!(busca || area || alcance || estado || soLoninho);
  const limpar = () => { setBusca(""); setArea(""); setAlcance(""); setEstado(""); setSoLoninho(false); };

  if (!hydrated) return null;
  if (!gestao) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Central de Agentes" />
        <div className="p-6"><p className="text-lone-body text-muted-foreground">Esta área é só da gestão.</p></div>
      </div>
    );
  }

  const tiles: { chave: Estado | ""; rotulo: string; valor: number; cor: string }[] = [
    { chave: "", rotulo: "Agentes de IA", valor: linhas?.length ?? 0, cor: "text-foreground" },
    { chave: "funcionando", rotulo: ESTADO_UI.funcionando.rotulo, valor: contagem.funcionando, cor: ESTADO_UI.funcionando.texto },
    { chave: "falhando", rotulo: ESTADO_UI.falhando.rotulo, valor: contagem.falhando, cor: contagem.falhando ? ESTADO_UI.falhando.texto : "text-foreground" },
    { chave: "parado", rotulo: "Parados", valor: contagem.parado, cor: contagem.parado ? ESTADO_UI.parado.texto : "text-foreground" },
    { chave: "desligado", rotulo: "Desligados", valor: contagem.desligado, cor: "text-foreground" },
  ];

  const fora = central?.iaFora ?? null;

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Central de Agentes" />
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 animate-fade-in sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-lone-body text-muted-foreground">
            Cada agente de IA do Lone OS: o que faz, quem responde por ele, até onde chega, o que o põe para rodar,
            o que o desliga e se está funcionando. Existe um agente com nome, o Loninho; os outros são capacidades dele
            ou rotinas em volta. As rotinas agendadas ficam na{" "}
            <Link href="/automations" className="text-foreground underline underline-offset-2 hover:text-primary">Central de Automações</Link>.
          </p>
          <div className="flex items-center gap-3">
            {central && <span className="text-lone-caption text-muted-foreground">atualizado {haQuanto(central.geradoEm, agora)}</span>}
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={cn(carregando && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* A IA inteira fora: todos param juntos */}
        {fora && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-lone-danger" />
            <div className="min-w-0 text-sm text-foreground">
              <p className="font-semibold">{fora.causa.titulo} desde {dataHora(fora.desde)}: {fora.falhas} chamadas falharam.</p>
              <p className="mt-0.5 text-xs">{fora.causa.explicacao} {fora.causa.acao}</p>
              {fora.porFrente.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Parou: {fora.porFrente.slice(0, 6).map((f) => f.rotulo).join(", ")}.</p>
              )}
            </div>
          </div>
        )}

        {central && <InterruptorLoninho estado={central.loninho} onMudou={() => void carregar()} />}

        {central && central.avisos.length > 0 && (
          <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-3 text-xs text-foreground">
            <p className="font-medium">Parte da Central não carregou — o resto está atualizado:</p>
            <ul className="mt-1 list-disc pl-5">{central.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}

        {/* Resumo — cada número filtra a lista */}
        {linhas === null && carregando ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
        ) : linhas && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tiles.map((t) => {
              const ativo = t.chave !== "" && estado === t.chave;
              return (
                <button
                  key={t.rotulo} type="button"
                  onClick={() => setEstado(t.chave === "" || ativo ? "" : t.chave)}
                  aria-pressed={ativo}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40",
                    ativo ? "border-primary" : "border-border",
                  )}
                >
                  <p className="text-lone-eyebrow uppercase text-muted-foreground">{t.rotulo}</p>
                  <p className={cn("mt-1 text-lone-hero tabular-nums", t.cor)}>{t.valor}</p>
                  {t.chave === "" && contagem["sem-registro"] > 0 && (
                    <p className="text-lone-caption text-muted-foreground">{contagem["sem-registro"]} sem registro</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar agente…" className="pl-8" aria-label="Buscar agente" />
          </div>
          <select className={selectCls} value={area} onChange={(e) => setArea(e.target.value as Area | "")} aria-label="Área">
            <option value="">Todas as áreas</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className={selectCls} value={alcance} onChange={(e) => setAlcance(e.target.value as Alcance | "")} aria-label="Alcance">
            <option value="">Qualquer alcance</option>
            {ALCANCES.map((a) => <option key={a} value={a}>{ROTULO_ALCANCE[a]}</option>)}
          </select>
          <select className={selectCls} value={estado} onChange={(e) => setEstado(e.target.value as Estado | "")} aria-label="Estado">
            <option value="">Qualquer estado</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_UI[s].rotulo}</option>)}
          </select>
          <button
            type="button" aria-pressed={soLoninho} onClick={() => setSoLoninho((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
              soLoninho ? "border-lone-info-border bg-lone-info-bg text-lone-info" : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            Só dentro do Loninho
          </button>
          {temFiltro && <Button variant="ghost" size="sm" onClick={limpar}><X />Limpar</Button>}
        </div>

        {/* Lista */}
        {erro && !linhas ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg p-5 sm:flex-row sm:items-center">
            <AlertTriangle size={18} className="shrink-0 text-lone-danger" />
            <p className="flex-1 text-sm text-foreground">{erro}</p>
            <Button variant="outline" size="sm" onClick={() => void carregar()}>Tentar de novo</Button>
          </div>
        ) : linhas === null ? (
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : grupos.length === 0 ? (
          <EmptyState
            tone="muted" icon={<Search size={20} />} title="Nenhum agente com esses filtros"
            subtitle="Tente outra busca ou limpe os filtros."
            action={<Button variant="outline" size="sm" onClick={limpar}>Limpar filtros</Button>}
          />
        ) : (
          <div className="space-y-6">
            {erro && <p className="text-lone-caption text-lone-danger">Não consegui atualizar agora ({erro}). Mostrando a última leitura.</p>}
            {central?.parcial && (
              <p className="text-lone-caption text-lone-warning">A semana teve mais chamadas do que a Central lê de uma vez: os números de 7 dias são um mínimo.</p>
            )}
            {grupos.map((g) => {
              const problemas = g.itens.filter((l) => l.estado === "falhando" || l.estado === "parado").length;
              return (
                <section key={g.area} aria-labelledby={`area-${g.area}`}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h2 id={`area-${g.area}`} className="text-lone-h2 tracking-tight text-foreground">{g.area}</h2>
                    <span className="text-lone-caption text-muted-foreground">{g.itens.length}</span>
                    {problemas > 0 && <span className="text-lone-caption text-lone-danger">· {problemas} com problema</span>}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="hidden border-b border-border px-4 py-2 text-lone-eyebrow uppercase text-muted-foreground xl:grid xl:grid-cols-[minmax(0,1fr)_8.5rem_14rem_9.5rem_7rem_2rem] xl:gap-x-4">
                      <span>Agente</span>
                      <span>Alcance</span>
                      <span>Quando roda</span>
                      <span>Última execução</span>
                      <span>7 dias</span>
                      <span />
                    </div>
                    <div className="divide-y divide-border">
                      {g.itens.map((l) => (
                        <LinhaAgente
                          key={l.agente.id}
                          linha={l}
                          agora={agora}
                          aberta={aberta === l.agente.id}
                          onAbrir={() => setAberta((x) => (x === l.agente.id ? null : l.agente.id))}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}

            {/* Chamadas sem dono no catálogo e o que saiu na faxina */}
            {central && (
              <section aria-labelledby="sem-etiqueta" className="space-y-3 rounded-xl border border-border bg-card p-4">
                <h2 id="sem-etiqueta" className="text-lone-h2 tracking-tight text-foreground">Chamadas sem etiqueta</h2>
                {central.semEtiqueta.total === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma nos últimos 7 dias: toda chamada de IA chegou com o nome do agente.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {central.semEtiqueta.total} chamada{central.semEtiqueta.total > 1 ? "s" : ""} de IA nos últimos 7 dias sem o nome do agente.
                      São de antes da etiqueta obrigatória (25/10/2026) e somem desta lista em uma semana; chamada nova sem etiqueta não passa nos testes.
                    </p>
                    <ul className="space-y-1 text-xs">
                      {central.semEtiqueta.porOrigem.map((o) => (
                        <li key={o.origem} className="flex gap-2">
                          <span className="tabular-nums text-foreground">{o.chamadas}</span>
                          <span className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">{o.origem}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  O inventário de 25/10/2026 contou {central.inventario.contados} capacidades com IA.{" "}
                  {central.inventario.removidos.map((r) => `${r.nome} saiu na faxina: ${r.motivo}`).join(" ")}{" "}
                  Ficam {linhas.length}.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
