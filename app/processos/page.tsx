"use client";

// /processos — a biblioteca de COMO A LONE TRABALHA.
//
// Diferença pra /sobre, que confunde à primeira vista: /sobre explica o SOFTWARE (o que cada tela
// faz); aqui está a OPERAÇÃO (como se faz o trabalho, quem faz, com que prazo e como se prova que
// ficou pronto). Um social media novo entra aqui, lê e consegue trabalhar sem perguntar.
//
// Todo papel com login VÊ tudo — processo escondido é processo não seguido. Escrever é do setor
// da área; publicar é só da gestão (lib/processos/permissoes.ts).
//
// DESIGN: idioma da casa (components/lone-ui). Card = rounded-[10px] border p-[14px] em
// bg-lone-bg-card; eyebrow em uppercase tracking-[1.5px]; classes lone-* do tailwind.config,
// nunca var(--lone-*) cru — a primeira versão desta tela inventou quatro tokens que não existem
// (--lone-bg-surface, --lone-border, --lone-text-muted, --lone-bg-base) e por isso saiu sem
// borda e sem hierarquia. Token que não existe não avisa: só resolve pra nada.
//
// COR TEM UM DONO SÓ: aqui ela significa "precisa de atenção" (rascunho, descontinuado). Processo
// no ar é o caso normal e fica sem selo nenhum — se tudo é destacado, nada é.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { PillBadge } from "@/components/lone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Plus, Loader2, AlertCircle, ListChecks } from "lucide-react";
import NovoProcessoDialog from "@/components/processos/NovoProcessoDialog";

interface Processo {
  id: string; code: string; slug: string; title: string;
  area: string; doc_type: string; status: string;
  summary: string | null; tags: string[] | null; passos: number;
}

const AREAS = [
  { chave: "", rotulo: "Todas" },
  { chave: "social", rotulo: "Social" },
  { chave: "traffic", rotulo: "Tráfego" },
  { chave: "cs", rotulo: "CS" },
  { chave: "comercial", rotulo: "Comercial" },
  { chave: "geral", rotulo: "Geral" },
];

const ROTULO_AREA: Record<string, string> = {
  social: "Social", traffic: "Tráfego", cs: "CS", comercial: "Comercial", geral: "Geral",
};
const ORDEM_AREA = ["social", "traffic", "cs", "comercial", "geral"];

const ROTULO_TIPO: Record<string, string> = {
  sop: "Passo a passo", checklist: "Checklist", processo: "Processo",
  playbook: "Playbook", politica: "Política", template: "Modelo",
};

/** Só o que FOGE do normal ganha cor. Processo no ar não precisa de selo — é o esperado. */
const SELO: Record<string, { rotulo: string; tone: "warning" | "info" | "default" }> = {
  draft: { rotulo: "Rascunho", tone: "warning" },
  in_review: { rotulo: "Em revisão", tone: "info" },
  deprecated: { rotulo: "Descontinuado", tone: "default" },
  archived: { rotulo: "Arquivado", tone: "default" },
};

export default function ProcessosPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [papel, setPapel] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [semeando, setSemeando] = useState(false);

  const carregar = () => {
    setCarregando(true);
    authedFetch("/api/processos")
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setProcessos(d.processos ?? []); setPapel(d.papel ?? null); setErro(null); })
      // Erro vira mensagem, não lista vazia: "não tem processo" e "não consegui carregar" são
      // coisas diferentes e o time precisa saber qual das duas está vendo.
      .catch((e) => setErro(e instanceof Error ? e.message : "não consegui carregar"))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  const gestao = papel === "admin" || papel === "manager";

  const semearIniciais = async () => {
    setSemeando(true);
    try {
      const r = await authedFetch("/api/processos/semear", { method: "POST" });
      if (r.ok) carregar();
    } finally { setSemeando(false); }
  };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return processos.filter((p) => {
      if (area && p.area !== area) return false;
      if (!t) return true;
      return p.title.toLowerCase().includes(t)
        || p.code.toLowerCase().includes(t)
        || (p.summary ?? "").toLowerCase().includes(t)
        || (p.tags ?? []).some((g) => g.toLowerCase().includes(t));
    });
  }, [processos, area, busca]);

  const porArea = useMemo(() => {
    const m = new Map<string, Processo[]>();
    for (const p of filtrados) {
      if (!m.has(p.area)) m.set(p.area, []);
      m.get(p.area)!.push(p);
    }
    return [...m.entries()].sort((a, b) => ORDEM_AREA.indexOf(a[0]) - ORDEM_AREA.indexOf(b[0]));
  }, [filtrados]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary mb-2">
              <BookOpen className="w-3.5 h-3.5" aria-hidden /> Operação
            </span>
            <h1 className="text-lone-hero font-brand text-lone-text-primary">Processos</h1>
            <p className="text-lone-body font-inter text-lone-text-secondary mt-1.5 max-w-2xl">
              Como a Lone trabalha: quem faz, em que ordem, com que prazo e como se prova que ficou
              pronto. Para entender o <em>sistema</em> — o que cada tela faz —, veja{" "}
              <Link href="/sobre" className="text-lone-brand-soft hover:underline">Sobre o Sistema</Link>.
            </p>
          </div>
          {papel && (
            <Button onClick={() => setNovoAberto(true)} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" aria-hidden /> Novo processo
            </Button>
          )}
        </div>
      </header>

      {/* ── Busca e filtro ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-7">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-lone-text-tertiary pointer-events-none" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar processo"
            placeholder="Buscar por título, código ou assunto…" className="pl-9" />
        </div>
        <div className="flex gap-1 flex-wrap" role="group" aria-label="Filtrar por área">
          {AREAS.map((a) => {
            const ativo = area === a.chave;
            return (
              <button key={a.chave} onClick={() => setArea(a.chave)} aria-pressed={ativo}
                className={`px-3 py-1.5 rounded-full text-lone-caption font-inter font-medium transition-colors ${
                  ativo
                    ? "bg-lone-brand-bg-soft text-lone-brand-soft"
                    : "text-lone-text-secondary hover:bg-lone-bg-elevated"
                }`}>
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-16 text-lone-body font-inter text-lone-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Carregando…
        </div>
      )}

      {erro && !carregando && (
        <div role="alert" className="flex items-start gap-3 rounded-[10px] border border-lone-danger-border bg-lone-danger-bg p-[14px]">
          <AlertCircle className="w-5 h-5 shrink-0 text-lone-danger mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-lone-h2 font-inter text-lone-danger">Não consegui carregar os processos.</p>
            {/* Sem /80: opacidade sobre token sólido não gera classe no build desta config. */}
            <p className="text-lone-caption font-inter text-lone-danger mt-1">{erro}</p>
          </div>
        </div>
      )}

      {/* Vazio GUIADO: explica o que é a aba e oferece o caminho, em vez de deixar a tela muda. */}
      {!carregando && !erro && processos.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-lone-border px-6 py-16 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-4 text-lone-text-tertiary" aria-hidden />
          <h2 className="text-lone-h1 font-brand text-lone-text-primary mb-2">Nenhum processo aqui ainda</h2>
          <p className="text-lone-body font-inter text-lone-text-secondary max-w-md mx-auto mb-6">
            Esta aba guarda o jeito da Lone trabalhar, para que quem chega consiga executar sem
            depender de alguém explicar.
          </p>
          {gestao ? (
            <Button onClick={semearIniciais} disabled={semeando} className="gap-2">
              {semeando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />}
              Trazer os processos já escritos
            </Button>
          ) : (
            <p className="text-lone-caption font-inter text-lone-text-tertiary">
              Peça à gestão para publicar os primeiros.
            </p>
          )}
        </div>
      )}

      {!carregando && !erro && processos.length > 0 && filtrados.length === 0 && (
        <p className="py-16 text-center text-lone-body font-inter text-lone-text-secondary">
          Nenhum processo bate com esse filtro.
        </p>
      )}

      {/* ── Lista ─────────────────────────────────────────────────────────── */}
      <div className="space-y-8">
        {porArea.map(([chave, lista]) => (
          <section key={chave}>
            <h2 className="flex items-baseline gap-2 text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary mb-3">
              {ROTULO_AREA[chave] ?? chave}
              <span className="text-lone-text-disabled normal-case tracking-normal">{lista.length}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {lista.map((p) => {
                const selo = SELO[p.status];
                return (
                  <Link key={p.id} href={`/processos/${p.slug}`}
                    className="group relative flex flex-col gap-2 rounded-[10px] border border-lone-border bg-lone-bg-card p-[14px] transition-colors duration-150 hover:border-lone-border-strong hover:bg-lone-bg-elevated">
                    {/* Faixa de atenção só no que não está no ar. */}
                    {selo && <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-[10px] bg-lone-warning" aria-hidden />}

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lone-eyebrow tracking-[1px] text-lone-text-tertiary">{p.code}</span>
                      <span className="text-lone-text-disabled" aria-hidden>·</span>
                      <span className="text-lone-eyebrow font-inter uppercase tracking-[1.5px] text-lone-text-tertiary">
                        {ROTULO_TIPO[p.doc_type] ?? p.doc_type}
                      </span>
                      {selo && <PillBadge tone={selo.tone} className="ml-auto">{selo.rotulo}</PillBadge>}
                    </div>

                    <h3 className="text-lone-h2 font-inter text-lone-text-primary group-hover:text-lone-brand-soft transition-colors">
                      {p.title}
                    </h3>

                    {p.summary && (
                      <p className="text-lone-body font-inter text-lone-text-secondary line-clamp-2">{p.summary}</p>
                    )}

                    {/* Quanto custa ler: a pessoa decide antes de abrir. */}
                    <span className="mt-auto pt-1 flex items-center gap-1.5 text-lone-caption font-inter text-lone-text-tertiary">
                      <ListChecks className="w-3.5 h-3.5" aria-hidden />
                      {p.passos} {p.passos === 1 ? "passo" : "passos"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {novoAberto && (
        <NovoProcessoDialog onClose={() => setNovoAberto(false)} onCriado={() => { setNovoAberto(false); carregar(); }} />
      )}
    </div>
  );
}
