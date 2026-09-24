"use client";

// Central de Automações — os ~70 jobs que o servidor roda sozinho, com o que aconteceu em cada um.
// Os dados vêm de automation_runs (cada execução, gravada pelo scripts/cron-call.sh) e
// automation_settings (liga/desliga). O mapa dos jobs é lib/automacoes/registro.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, MessageCircle, X, AlertTriangle } from "lucide-react";
import Header from "@/components/Header";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LinhaAutomacao, { SAUDE_UI } from "@/components/automacoes/LinhaAutomacao";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { FAMILIAS, type Familia } from "@/lib/automacoes/registro";
import type { LinhaPainel, Saude } from "@/lib/automacoes/saude";
import { haQuanto } from "@/lib/automacoes/formato";

const ORDEM_SAUDE: Record<Saude, number> = { falhou: 0, parado: 1, ok: 2, desligado: 3, "sem-registro": 4 };

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function AutomationsPage() {
  const { role, hydrated } = useRole();
  const gestao = role === "admin" || role === "manager";

  const [linhas, setLinhas] = useState<LinhaPainel[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregadoEm, setCarregadoEm] = useState<number>(Date.now());
  const [agora, setAgora] = useState<number>(Date.now());

  const [busca, setBusca] = useState("");
  const [familia, setFamilia] = useState<Familia | "">("");
  const [saude, setSaude] = useState<Saude | "">("");
  const [soCliente, setSoCliente] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<{ automacoes: LinhaPainel[] }>("/api/system/automacoes");
    setCarregando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setErro(null);
    setLinhas(r.data?.automacoes ?? []);
    setCarregadoEm(Date.now());
    setAgora(Date.now());
  }, []);

  useEffect(() => { if (gestao) void carregar(); }, [gestao, carregar]);

  // Atualiza sozinho a cada minuto com a aba visível — o "há 3 min" e a saúde não envelhecem.
  useEffect(() => {
    if (!gestao) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 60_000);
    return () => clearInterval(id);
  }, [gestao, carregar]);

  const contagem = useMemo(() => {
    const c: Record<Saude, number> = { ok: 0, falhou: 0, parado: 0, desligado: 0, "sem-registro": 0 };
    for (const l of linhas ?? []) c[l.saude]++;
    return c;
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (linhas ?? []).filter((l) => {
      if (familia && l.familia !== familia) return false;
      if (saude && l.saude !== saude) return false;
      if (soCliente && !l.enviaParaCliente) return false;
      if (!q) return true;
      const alvo = `${l.nome} ${l.descricao} ${l.id} ${l.agendaBRT}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return alvo.includes(q);
    });
  }, [linhas, busca, familia, saude, soCliente]);

  const grupos = useMemo(() => FAMILIAS
    .map((f) => ({
      familia: f,
      itens: filtradas
        .filter((l) => l.familia === f)
        .sort((a, b) => ORDEM_SAUDE[a.saude] - ORDEM_SAUDE[b.saude] || a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .filter((g) => g.itens.length > 0), [filtradas]);

  const temFiltro = !!(busca || familia || saude || soCliente);
  const limpar = () => { setBusca(""); setFamilia(""); setSaude(""); setSoCliente(false); };

  if (!hydrated) return null;
  if (!gestao) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Central de Automações" />
        <div className="p-6"><p className="text-lone-body text-muted-foreground">Esta área é só da gestão.</p></div>
      </div>
    );
  }

  const tiles: { chave: Saude | ""; rotulo: string; valor: number; cor: string }[] = [
    { chave: "", rotulo: "Automações", valor: linhas?.length ?? 0, cor: "text-foreground" },
    { chave: "ok", rotulo: SAUDE_UI.ok.rotulo, valor: contagem.ok, cor: SAUDE_UI.ok.texto },
    { chave: "falhou", rotulo: SAUDE_UI.falhou.rotulo, valor: contagem.falhou, cor: contagem.falhou ? SAUDE_UI.falhou.texto : "text-foreground" },
    { chave: "parado", rotulo: "Parados", valor: contagem.parado, cor: contagem.parado ? SAUDE_UI.parado.texto : "text-foreground" },
    { chave: "desligado", rotulo: "Desligados", valor: contagem.desligado, cor: "text-foreground" },
  ];

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Central de Automações" />
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 animate-fade-in sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-lone-body text-muted-foreground">
            Tudo que o servidor roda sozinho: quando roda, para onde manda e como foi a última vez.
            Um job que falhar ou parar é avisado no grupo administrativo.
          </p>
          <div className="flex items-center gap-3">
            {linhas && <span className="text-lone-caption text-muted-foreground">atualizado {haQuanto(new Date(carregadoEm).toISOString(), agora)}</span>}
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={cn(carregando && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Resumo — cada número filtra a lista */}
        {linhas === null && carregando ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
        ) : linhas && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tiles.map((t) => {
              const ativo = t.chave !== "" && saude === t.chave;
              return (
                <button
                  key={t.rotulo} type="button"
                  onClick={() => setSaude(t.chave === "" || ativo ? "" : t.chave)}
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
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar automação…" className="pl-8" aria-label="Buscar automação" />
          </div>
          <select className={selectCls} value={familia} onChange={(e) => setFamilia(e.target.value as Familia | "")} aria-label="Família">
            <option value="">Todas as famílias</option>
            {FAMILIAS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className={selectCls} value={saude} onChange={(e) => setSaude(e.target.value as Saude | "")} aria-label="Saúde">
            <option value="">Qualquer saúde</option>
            {(Object.keys(SAUDE_UI) as Saude[]).map((s) => <option key={s} value={s}>{SAUDE_UI[s].rotulo}</option>)}
          </select>
          <button
            type="button" aria-pressed={soCliente} onClick={() => setSoCliente((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
              soCliente ? "border-lone-info-border bg-lone-info-bg text-lone-info" : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageCircle size={14} />
            Envia para cliente
          </button>
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={limpar}><X />Limpar</Button>
          )}
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
            tone="muted" icon={<Search size={20} />} title="Nenhuma automação com esses filtros"
            subtitle="Tente outra busca ou limpe os filtros."
            action={<Button variant="outline" size="sm" onClick={limpar}>Limpar filtros</Button>}
          />
        ) : (
          <div className="space-y-6">
            {erro && (
              <p className="text-lone-caption text-lone-danger">Não consegui atualizar agora ({erro}). Mostrando a última leitura.</p>
            )}
            {grupos.map((g) => {
              const problemas = g.itens.filter((l) => l.saude === "falhou" || l.saude === "parado").length;
              return (
                <section key={g.familia} aria-labelledby={`fam-${g.familia}`}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h2 id={`fam-${g.familia}`} className="text-lone-h2 tracking-tight text-foreground">{g.familia}</h2>
                    <span className="text-lone-caption text-muted-foreground">{g.itens.length}</span>
                    {problemas > 0 && (
                      <span className="text-lone-caption text-lone-danger">· {problemas} com problema</span>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="hidden border-b border-border px-4 py-2 text-lone-eyebrow uppercase text-muted-foreground xl:grid xl:grid-cols-[minmax(0,1fr)_10rem_9.5rem_6rem_18rem] xl:gap-x-4">
                      <span>Automação</span>
                      <span>Agenda</span>
                      <span>Última execução</span>
                      <span>7 dias</span>
                      <span>Ligada · ações</span>
                    </div>
                    <div className="divide-y divide-border">
                      {g.itens.map((l) => (
                        <LinhaAutomacao
                          key={l.id}
                          linha={l}
                          agora={agora}
                          aberta={aberta === l.id}
                          onAbrir={(abrir) => setAberta((a) => (abrir || a !== l.id ? l.id : null))}
                          onMudou={() => void carregar()}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
