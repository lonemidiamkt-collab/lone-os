"use client";

// /processos/[slug] — o processo aberto, em duas leituras diferentes:
//
//   EXECUTAR  → os passos, na ordem, com responsável e prova. É o que a pessoa abre no meio do
//               trabalho; por isso é a aba padrão e vem primeiro.
//   ENTENDER  → objetivo, problema que resolve, escopo, prazo, qualidade, riscos. É o que se lê
//               uma vez, na chegada.
//
// A separação existe porque quem já sabe o processo não quer reler a teoria pra achar o passo 4.
//
// DESIGN: classes lone-* do tailwind.config (a primeira versão usava var(--lone-*) inventados e
// saía sem borda). Os passos têm TRILHA ligando os números — sem ela a lista lê como itens soltos,
// e a ordem é justamente a informação principal aqui.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { PillBadge } from "@/components/lone-ui";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertCircle, Camera, Clock, User, Monitor } from "lucide-react";

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
const ROTULO_TIPO: Record<string, string> = {
  sop: "Passo a passo", checklist: "Checklist", processo: "Processo",
  playbook: "Playbook", politica: "Política", template: "Modelo",
};
/** Só o que foge do normal ganha selo — processo no ar é o esperado. */
const SELO: Record<string, { rotulo: string; tone: "warning" | "info" | "default" }> = {
  draft: { rotulo: "Rascunho", tone: "warning" },
  in_review: { rotulo: "Em revisão", tone: "info" },
  deprecated: { rotulo: "Descontinuado", tone: "default" },
  archived: { rotulo: "Arquivado", tone: "default" },
};

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor?.trim()) return null;
  return (
    <div>
      <dt className="text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary mb-1.5">
        {rotulo}
      </dt>
      <dd className="text-lone-body font-inter text-lone-text-primary leading-relaxed whitespace-pre-line">
        {valor}
      </dd>
    </div>
  );
}

/** Metadado do passo: quieto, mas legível. Ícone sem texto vira adivinhação. */
function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-lone-caption font-inter text-lone-text-tertiary">
      <span className="shrink-0" aria-hidden>{icon}</span>{children}
    </span>
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
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
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

  const voltar = (
    <Link href="/processos"
      className="inline-flex items-center gap-1 text-lone-caption font-inter text-lone-text-secondary hover:text-lone-text-primary transition-colors mb-5">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Processos
    </Link>
  );

  if (carregando) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {voltar}
        <div className="flex items-center gap-2 py-16 justify-center text-lone-body font-inter text-lone-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Carregando…
        </div>
      </div>
    );
  }
  if (erro || !d) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {voltar}
        <div role="alert" className="flex items-start gap-3 rounded-[10px] border border-lone-danger-border bg-lone-danger-bg p-[14px]">
          <AlertCircle className="w-5 h-5 shrink-0 text-lone-danger mt-0.5" aria-hidden />
          <p className="text-lone-body font-inter text-lone-danger">{erro}</p>
        </div>
      </div>
    );
  }

  const { processo: p, versao: v, passos, permissoes } = d;
  const selo = SELO[p.status];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {voltar}

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-mono text-lone-eyebrow tracking-[1px] text-lone-text-tertiary">{p.code}</span>
            <span className="text-lone-text-disabled" aria-hidden>·</span>
            <span className="text-lone-eyebrow font-inter uppercase tracking-[1.5px] text-lone-text-tertiary">
              {ROTULO_AREA[p.area] ?? p.area} · {ROTULO_TIPO[p.doc_type] ?? p.doc_type}
            </span>
            {selo && <PillBadge tone={selo.tone}>{selo.rotulo}</PillBadge>}
          </div>
          <h1 className="text-lone-hero font-brand text-lone-text-primary">{p.title}</h1>
          {p.summary && (
            <p className="text-lone-body font-inter text-lone-text-secondary mt-1.5 max-w-2xl">{p.summary}</p>
          )}
        </div>
        {permissoes.publicar && p.status !== "active" && (
          <Button onClick={publicar} disabled={publicando} className="gap-2 shrink-0">
            {publicando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Publicar
          </Button>
        )}
      </header>

      {p.status === "draft" && (
        <p className="mt-4 rounded-[10px] border border-lone-warning-border bg-lone-warning-bg px-[14px] py-2.5 text-lone-caption font-inter text-lone-warning">
          Este é um rascunho — ainda não é o processo oficial. Só a gestão publica.
        </p>
      )}

      {/* ── Abas ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-lone-border mt-7 mb-6" role="tablist">
        {([["executar", `Executar (${passos.length})`], ["entender", "Entender"]] as const).map(([k, rotulo]) => (
          <button key={k} onClick={() => setAba(k)} role="tab" aria-selected={aba === k}
            className={`px-4 py-2.5 text-lone-body font-inter font-medium -mb-px border-b-2 transition-colors ${
              aba === k
                ? "border-lone-brand text-lone-text-primary"
                : "border-transparent text-lone-text-secondary hover:text-lone-text-primary"
            }`}>
            {rotulo}
          </button>
        ))}
      </div>

      {/* ── Executar ──────────────────────────────────────────────────────── */}
      {aba === "executar" && (
        passos.length === 0 ? (
          <p className="py-16 text-center text-lone-body font-inter text-lone-text-secondary">
            Este processo ainda não tem passos escritos.
          </p>
        ) : (
          <ol className="relative">
            {passos.map((s, i) => {
              const ultimo = i === passos.length - 1;
              return (
                <li key={s.id} className="relative flex gap-4 pb-3 last:pb-0">
                  {/* Trilha: o número e a linha que liga ao próximo. É a ordem virando desenho. */}
                  <div className="relative flex flex-col items-center shrink-0">
                    <span className="z-10 w-7 h-7 rounded-full bg-lone-brand-bg-soft text-lone-brand-soft text-lone-caption font-inter font-semibold flex items-center justify-center tabular-nums">
                      {s.seq}
                    </span>
                    {!ultimo && <span className="w-px flex-1 bg-lone-border mt-1" aria-hidden />}
                  </div>

                  <div className="min-w-0 flex-1 rounded-[10px] border border-lone-border bg-lone-bg-card p-[14px]">
                    <h3 className="text-lone-h2 font-inter text-lone-text-primary">
                      {s.title}
                      {s.optional && (
                        <span className="ml-2 text-lone-caption font-normal text-lone-text-tertiary">(opcional)</span>
                      )}
                    </h3>
                    <p className="text-lone-body font-inter text-lone-text-secondary leading-relaxed mt-1.5 whitespace-pre-line">
                      {s.instruction}
                    </p>

                    {(s.role || s.system_ref || s.evidence_type || s.sla_minutes != null) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-lone-border">
                        {s.role && <Meta icon={<User className="w-3.5 h-3.5" />}>{s.role}</Meta>}
                        {s.system_ref && <Meta icon={<Monitor className="w-3.5 h-3.5" />}>{s.system_ref}</Meta>}
                        {/* A prova é o que separa processo de intenção — por isso fica no passo. */}
                        {s.evidence_type && <Meta icon={<Camera className="w-3.5 h-3.5" />}>prova: {s.evidence_type}</Meta>}
                        {s.sla_minutes != null && <Meta icon={<Clock className="w-3.5 h-3.5" />}>{s.sla_minutes} min</Meta>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )
      )}

      {/* ── Entender ──────────────────────────────────────────────────────── */}
      {aba === "entender" && v && (
        <div className="space-y-8">
          <dl className="grid gap-6 sm:grid-cols-2">
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
              <h2 className="text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary mb-3">
                Como medimos
              </h2>
              <div className="space-y-2">
                {v.kpis.map((k, i) => (
                  <div key={i} className="rounded-[10px] border border-lone-border bg-lone-bg-card p-[14px]">
                    <p className="text-lone-h2 font-inter text-lone-text-primary">
                      {k.nome} <span className="text-lone-text-tertiary font-normal">— meta: {k.meta}</span>
                    </p>
                    <p className="text-lone-body font-inter text-lone-text-secondary mt-1.5">
                      {k.definicao} <span className="text-lone-text-tertiary">· fonte: {k.fonte}</span>
                    </p>
                    {k.acaoAbaixo && (
                      <p className="text-lone-caption font-inter text-lone-warning mt-2">
                        Abaixo da meta: {k.acaoAbaixo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!v.exceptions?.length && (
            <section>
              <h2 className="text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary mb-3">
                Quando foge do normal
              </h2>
              <div className="space-y-2">
                {v.exceptions.map((e, i) => (
                  <div key={i} className="rounded-[10px] border border-lone-border bg-lone-bg-card p-[14px]">
                    <p className="text-lone-h2 font-inter text-lone-text-primary">{e.situacao}</p>
                    <p className="text-lone-body font-inter text-lone-text-secondary mt-1.5">{e.tratamento}</p>
                    {e.escalonarPara && (
                      <p className="text-lone-caption font-inter text-lone-text-tertiary mt-2">
                        Escalar para: {e.escalonarPara}
                      </p>
                    )}
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
