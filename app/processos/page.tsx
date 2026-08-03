"use client";

// /processos — a biblioteca de COMO A LONE TRABALHA.
//
// Diferença pra /sobre, que confunde à primeira vista: /sobre explica o SOFTWARE (o que cada tela
// faz); aqui está a OPERAÇÃO (como se faz o trabalho, quem faz, com que prazo e como se prova que
// ficou pronto). Um social media novo entra aqui, lê e consegue trabalhar sem perguntar.
//
// Todo papel com login VÊ tudo — processo escondido é processo não seguido. Escrever é do setor
// da área; publicar é só da gestão (lib/processos/permissoes.ts).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { PillBadge } from "@/components/lone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Plus, Loader2, AlertCircle } from "lucide-react";
import NovoProcessoDialog from "@/components/processos/NovoProcessoDialog";

interface Processo {
  id: string; code: string; slug: string; title: string;
  area: string; doc_type: string; status: string;
  summary: string | null; tags: string[] | null;
}

const AREAS: { chave: string; rotulo: string }[] = [
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

const TOM_STATUS: Record<string, "success" | "warning" | "default" | "info"> = {
  active: "success", draft: "warning", in_review: "info", deprecated: "default", archived: "default",
};
const ROTULO_STATUS: Record<string, string> = {
  active: "No ar", draft: "Rascunho", in_review: "Em revisão", deprecated: "Descontinuado", archived: "Arquivado",
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
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
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
    return [...m.entries()];
  }, [filtrados]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[var(--lone-brand-soft)]" />
          <h1 className="text-2xl font-brand font-semibold text-[var(--lone-text-primary)]">Processos</h1>
        </div>
        {papel && (
          <Button onClick={() => setNovoAberto(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo processo
          </Button>
        )}
      </div>
      <p className="text-sm text-[var(--lone-text-secondary)] mb-6">
        Como a Lone trabalha: quem faz, em que ordem, com que prazo e como se prova que ficou pronto.
        {" "}Para entender o <em>sistema</em> (o que cada tela faz), veja{" "}
        <Link href="/sobre" className="text-[var(--lone-brand-soft)] hover:underline">Sobre o Sistema</Link>.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lone-text-muted)]" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, código ou assunto…" className="pl-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {AREAS.map((a) => (
            <button key={a.chave} onClick={() => setArea(a.chave)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                area === a.chave
                  ? "bg-[var(--lone-brand-bg-soft)] text-[var(--lone-brand-soft)]"
                  : "text-[var(--lone-text-secondary)] hover:bg-[var(--lone-bg-elevated)]"
              }`}>
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 text-sm text-[var(--lone-text-secondary)] py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}

      {erro && !carregando && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--lone-danger-bg)] text-[var(--lone-danger)]">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não consegui carregar os processos.</p>
            <p className="text-sm opacity-80">{erro}</p>
          </div>
        </div>
      )}

      {/* Vazio GUIADO: explica o que é a aba e oferece o caminho, em vez de deixar a tela muda. */}
      {!carregando && !erro && processos.length === 0 && (
        <div className="text-center py-16 px-6 rounded-xl border border-dashed border-[var(--lone-border)]">
          <BookOpen className="w-10 h-10 mx-auto mb-4 text-[var(--lone-text-muted)]" />
          <h2 className="text-lg font-medium text-[var(--lone-text-primary)] mb-2">Nenhum processo aqui ainda</h2>
          <p className="text-sm text-[var(--lone-text-secondary)] max-w-md mx-auto mb-6">
            Esta aba guarda o jeito da Lone trabalhar, para que quem chega consiga executar sem
            depender de alguém explicar. Já existem cinco processos escritos a partir do playbook
            e do fluxo real do sistema.
          </p>
          {gestao ? (
            <Button onClick={semearIniciais} disabled={semeando} className="gap-2">
              {semeando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Trazer os processos já escritos
            </Button>
          ) : (
            <p className="text-xs text-[var(--lone-text-muted)]">Peça à gestão para publicar os primeiros.</p>
          )}
        </div>
      )}

      {!carregando && !erro && processos.length > 0 && filtrados.length === 0 && (
        <p className="text-sm text-[var(--lone-text-secondary)] py-12 text-center">
          Nenhum processo bate com esse filtro.
        </p>
      )}

      <div className="space-y-8">
        {porArea.map(([chave, lista]) => (
          <section key={chave}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--lone-text-muted)] mb-3">
              {ROTULO_AREA[chave] ?? chave}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {lista.map((p) => (
                <Link key={p.id} href={`/processos/${p.slug}`}
                  className="block p-4 rounded-xl border border-[var(--lone-border)] bg-[var(--lone-bg-surface)] hover:border-[var(--lone-brand-soft)] transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-mono text-[var(--lone-text-muted)]">{p.code}</span>
                    <PillBadge tone={TOM_STATUS[p.status] ?? "default"}>
                      {ROTULO_STATUS[p.status] ?? p.status}
                    </PillBadge>
                  </div>
                  <h3 className="font-medium text-[var(--lone-text-primary)] mb-1">{p.title}</h3>
                  {p.summary && (
                    <p className="text-sm text-[var(--lone-text-secondary)] line-clamp-2">{p.summary}</p>
                  )}
                </Link>
              ))}
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
