"use client";

// components/client/ficha/ObservacaoDoCadastro.tsx — "Observação do cliente no cadastro", na aba Admin.
//
// 25/10/2026 (onda 5 da auditoria de erro recuperável): o que o cliente escreveu no campo de observação
// do link de cadastro só aparecia na linha do tempo e em Pendentes. Aqui fica em destaque, com a data,
// SEPARADO das notas internas da equipe (`clients.notes`). Só leitura — é a palavra do cliente.
// Regras de qual observação e qual data em lib/onboarding/observacao-ficha.ts.

import { useCallback, useEffect, useState } from "react";
import { MessageSquareQuote, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { rotuloDaObservacao, type ObservacaoCadastro } from "@/lib/onboarding/observacao-ficha";

interface Resposta { observacao: ObservacaoCadastro | null; temCadastro: boolean }

/** `className` vai no invólucro — quando não há cadastro o bloco some inteiro (sem borda vazia). */
export default function ObservacaoDoCadastro({ clientId, className }: { clientId: string; className?: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const r = await chamar<Resposta>(`/api/clients/${clientId}/observacao-cadastro`);
    if (r.ok && r.data) setDados(r.data);
    else setErro(r.erro ?? "Não consegui ler o cadastro do cliente.");
    setCarregando(false);
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (carregando && !dados) {
    return <div className={className}><div className="h-12 animate-pulse rounded-lg bg-muted" aria-label="Carregando a observação do cadastro" /></div>;
  }

  // Falha de leitura NÃO é "o cliente não escreveu nada".
  if (erro) {
    return (
      <div className={className}>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2 text-xs text-lone-warning">
          <span>Não consegui ler a observação do cliente no cadastro. {erro}</span>
          <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-1 font-medium underline hover:opacity-80">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  // Cliente cadastrado à mão (sem link): não há o que mostrar.
  if (!dados?.temCadastro) return null;

  if (!dados.observacao) {
    return <div className={className}><p className="text-lone-caption text-muted-foreground">O cliente não deixou observação no link de cadastro.</p></div>;
  }

  const o = dados.observacao;
  return (
    <div className={className}>
      <section aria-labelledby={`obs-cadastro-${clientId}`} className="rounded-lg border border-lone-info-border bg-lone-info-bg p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id={`obs-cadastro-${clientId}`} className="flex items-center gap-1.5 text-lone-body font-medium text-lone-info">
            <MessageSquareQuote size={14} aria-hidden="true" /> Observação do cliente no cadastro
          </h3>
          <p className="text-lone-caption text-muted-foreground">{rotuloDaObservacao(o)}</p>
        </div>
        <blockquote className="mt-2 whitespace-pre-wrap rounded-md bg-card p-3 text-lone-body text-foreground [overflow-wrap:anywhere]">
          {o.texto}
        </blockquote>
        <p className="mt-1.5 text-lone-caption text-muted-foreground">
          Escrita pelo cliente no link de cadastro. As notas internas da equipe ficam à parte.
        </p>
      </section>
    </div>
  );
}
