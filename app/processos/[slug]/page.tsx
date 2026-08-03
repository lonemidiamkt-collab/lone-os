"use client";

// /processos/[slug] — o processo aberto, em duas leituras diferentes:
//
//   EXECUTAR  → os passos, na ordem, com responsável e prova. É o que a pessoa abre no meio do
//               trabalho; por isso é a aba padrão e vem primeiro.
//   ENTENDER  → objetivo, problema que resolve, escopo, prazo, qualidade, riscos. É o que se lê
//               uma vez, na chegada.
//
// A separação existe porque quem já sabe o processo não quer reler a teoria pra achar o passo 4.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { PillBadge } from "@/components/lone-ui";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Camera, Clock, User } from "lucide-react";

interface Passo {
  id: string; seq: number; title: string; instruction: string;
  role: string | null; system_ref: string | null;
  evidence_type: string | null; evidence_required: boolean; optional: boolean;
  sla_minutes: number | null;
}
interface Versao {
  version: string; status: string;
  objective: string | null; problem: string | null; scope: string | null; out_of_scope: string | null;
  trigger_event: string | null; frequency: string | null; inputs: string | null; outputs: string | null;
  completion_criteria: string | null; quality_criteria: string | null; sla: string | null;
  kpis: { nome: string; definicao: string; fonte: string; meta: string; acaoAbaixo: string }[] | null;
  exceptions: { situacao: string; tratamento: string; escalonarPara: string }[] | null;
}
interface Dados {
  processo: { code: string; title: string; area: string; doc_type: string; status: string; summary: string | null };
  versao: Versao | null;
  passos: Passo[];
  permissoes: { editar: boolean; publicar: boolean; descontinuar: boolean };
}

const ROTULO_AREA: Record<string, string> = {
  social: "Social", traffic: "Tráfego", cs: "CS", comercial: "Comercial", geral: "Geral",
};
const ROTULO_STATUS: Record<string, string> = {
  active: "No ar", draft: "Rascunho", in_review: "Em revisão", deprecated: "Descontinuado", archived: "Arquivado",
};
const TOM_STATUS: Record<string, "success" | "warning" | "default" | "info"> = {
  active: "success", draft: "warning", in_review: "info", deprecated: "default", archived: "default",
};

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor?.trim()) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--lone-text-muted)] mb-1">{rotulo}</dt>
      <dd className="text-sm text-[var(--lone-text-primary)] leading-relaxed whitespace-pre-line">{valor}</dd>
    </div>
  );
}

export default function ProcessoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [d, setD] = useState<Dados | null>(null);
  const [aba, setAba] = useState<"executar" | "entender">("executar");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  const carregar = () => {
    setCarregando(true);
    authedFetch(`/api/processos/${slug}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("Processo não encontrado.");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => { setD(j as Dados); setErro(null); })
      .catch((e) => setErro(e instanceof Error ? e.message : "não consegui carregar"))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, [slug]);

  const publicar = async () => {
    setPublicando(true);
    try {
      const r = await authedFetch(`/api/processos/${slug}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "publicar" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j?.error || "não consegui publicar"); return; }
      carregar();
    } finally { setPublicando(false); }
  };

  if (carregando) {
    return <div className="p-6 flex items-center gap-2 text-sm text-[var(--lone-text-secondary)]">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
    </div>;
  }
  if (erro || !d) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/processos" className="inline-flex items-center gap-1 text-sm text-[var(--lone-text-secondary)] hover:text-[var(--lone-text-primary)] mb-4">
          <ArrowLeft className="w-4 h-4" /> Processos
        </Link>
        <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--lone-danger-bg)] text-[var(--lone-danger)]">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{erro}</p>
        </div>
      </div>
    );
  }

  const { processo: p, versao: v, passos, permissoes } = d;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/processos" className="inline-flex items-center gap-1 text-sm text-[var(--lone-text-secondary)] hover:text-[var(--lone-text-primary)] mb-4">
        <ArrowLeft className="w-4 h-4" /> Processos
      </Link>

      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-mono text-[var(--lone-text-muted)]">{p.code}</span>
            <PillBadge tone={TOM_STATUS[p.status] ?? "default"}>{ROTULO_STATUS[p.status] ?? p.status}</PillBadge>
            <PillBadge>{ROTULO_AREA[p.area] ?? p.area}</PillBadge>
            {v && <span className="text-[11px] text-[var(--lone-text-muted)]">v{v.version}</span>}
          </div>
          <h1 className="text-2xl font-brand font-semibold text-[var(--lone-text-primary)]">{p.title}</h1>
          {p.summary && <p className="text-sm text-[var(--lone-text-secondary)] mt-1">{p.summary}</p>}
        </div>
        {permissoes.publicar && p.status !== "active" && (
          <Button onClick={publicar} disabled={publicando} className="gap-2 shrink-0">
            {publicando && <Loader2 className="w-4 h-4 animate-spin" />} Publicar
          </Button>
        )}
      </div>

      {p.status === "draft" && (
        <p className="text-xs text-[var(--lone-warning)] bg-[var(--lone-warning-bg)] rounded-lg px-3 py-2 mt-4">
          Este é um rascunho — ainda não é o processo oficial. Só a gestão publica.
        </p>
      )}

      <div className="flex gap-1 border-b border-[var(--lone-border)] mt-6 mb-6">
        {([["executar", `Executar (${passos.length})`], ["entender", "Entender"]] as const).map(([k, rotulo]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              aba === k
                ? "border-[var(--lone-brand-soft)] text-[var(--lone-text-primary)]"
                : "border-transparent text-[var(--lone-text-secondary)] hover:text-[var(--lone-text-primary)]"
            }`}>
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "executar" && (
        passos.length === 0 ? (
          <p className="text-sm text-[var(--lone-text-secondary)] py-8 text-center">
            Este processo ainda não tem passos escritos.
          </p>
        ) : (
          <ol className="space-y-3">
            {passos.map((s) => (
              <li key={s.id} className="flex gap-4 p-4 rounded-xl border border-[var(--lone-border)] bg-[var(--lone-bg-surface)]">
                <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--lone-brand-bg-soft)] text-[var(--lone-brand-soft)] text-xs font-semibold flex items-center justify-center">
                  {s.seq}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-[var(--lone-text-primary)]">
                    {s.title}
                    {s.optional && <span className="ml-2 text-xs font-normal text-[var(--lone-text-muted)]">(opcional)</span>}
                  </h3>
                  <p className="text-sm text-[var(--lone-text-secondary)] leading-relaxed mt-1 whitespace-pre-line">{s.instruction}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-[var(--lone-text-muted)]">
                    {s.role && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {s.role}</span>}
                    {s.system_ref && <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {s.system_ref}</span>}
                    {/* A prova é o que separa processo de intenção — por isso aparece no passo, não num anexo. */}
                    {s.evidence_type && (
                      <span className="inline-flex items-center gap-1">
                        <Camera className="w-3 h-3" /> prova: {s.evidence_type}
                      </span>
                    )}
                    {s.sla_minutes != null && (
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {s.sla_minutes} min</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )
      )}

      {aba === "entender" && v && (
        <div className="space-y-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Campo rotulo="Objetivo" valor={v.objective} />
            <Campo rotulo="Problema que resolve" valor={v.problem} />
            <Campo rotulo="Quando acontece" valor={v.trigger_event} />
            <Campo rotulo="Frequência" valor={v.frequency} />
            <Campo rotulo="Escopo" valor={v.scope} />
            <Campo rotulo="Fora do escopo" valor={v.out_of_scope} />
            <Campo rotulo="O que entra" valor={v.inputs} />
            <Campo rotulo="O que sai" valor={v.outputs} />
            <Campo rotulo="Está pronto quando" valor={v.completion_criteria} />
            <Campo rotulo="Qualidade" valor={v.quality_criteria} />
            <Campo rotulo="Prazo" valor={v.sla} />
          </dl>

          {!!v.kpis?.length && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--lone-text-muted)] mb-3">Como medimos</h2>
              <div className="space-y-2">
                {v.kpis.map((k, i) => (
                  <div key={i} className="p-3 rounded-lg border border-[var(--lone-border)] bg-[var(--lone-bg-surface)]">
                    <p className="text-sm font-medium text-[var(--lone-text-primary)]">{k.nome} — meta: {k.meta}</p>
                    <p className="text-xs text-[var(--lone-text-secondary)] mt-1">{k.definicao} <span className="text-[var(--lone-text-muted)]">· fonte: {k.fonte}</span></p>
                    {k.acaoAbaixo && <p className="text-xs text-[var(--lone-warning)] mt-1">Abaixo da meta: {k.acaoAbaixo}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!v.exceptions?.length && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--lone-text-muted)] mb-3">Quando foge do normal</h2>
              <div className="space-y-2">
                {v.exceptions.map((e, i) => (
                  <div key={i} className="p-3 rounded-lg border border-[var(--lone-border)] bg-[var(--lone-bg-surface)]">
                    <p className="text-sm font-medium text-[var(--lone-text-primary)]">{e.situacao}</p>
                    <p className="text-xs text-[var(--lone-text-secondary)] mt-1">{e.tratamento}</p>
                    {e.escalonarPara && <p className="text-xs text-[var(--lone-text-muted)] mt-1">Escalar para: {e.escalonarPara}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
