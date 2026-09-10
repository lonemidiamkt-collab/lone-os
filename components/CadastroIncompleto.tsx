"use client";

// A FILA DE CADASTROS PELA METADE.
//
// Roberto (09/09): "resolver definitivamente o problema em que dados enviados pelo formulário não
// chegam à ficha do cliente."
//
// A auditoria mostrou que nada se perde no caminho — 39 dos 50 clientes ativos simplesmente nunca
// passaram pelo formulário. Este painel é o que fecha o buraco: mostra quem está incompleto, o
// que falta em cada um, e gera um link JÁ PREENCHIDO com o que a gente sabe, para o cliente
// completar só o resto.
//
// O link é gerado e copiado; NÃO é enviado sozinho. Escrever no grupo de um cliente é ação
// irreversível e a decisão de quando fazer isso é de quem cuida dele.

import { useEffect, useState } from "react";
import { ClipboardList, Copy, Check, Loader2, AlertTriangle, Link2 } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";

interface Linha {
  clientId: string; nome: string; responsavel: string | null;
  percentual: number; faltando: string[]; faltandoEssencial: string[];
  linkAberto: { token: string; desde: string } | null;
}

export default function CadastroIncompleto() {
  const [dados, setDados] = useState<{ total: number; completos: number; incompletos: Linha[]; maisFaltante: { campo: string; clientes: number }[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const carregar = () => {
    authedFetch("/api/clients/cadastro-incompleto")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); return j; })
      .then((j) => { setDados(j); setErro(null); })
      .catch((e: Error) => setErro(e.message));
  };
  useEffect(carregar, []);

  const gerar = async (l: Linha) => {
    setGerando(l.clientId);
    try {
      const r = await chamar<{ url: string }>("/api/onboarding", { action: "gerar_link_completar", clientId: l.clientId });
      if (!r.ok || !r.data) { setErro(r.erro ?? "não consegui gerar"); return; }
      setLinks((m) => ({ ...m, [l.clientId]: `${window.location.origin}${r.data!.url}` }));
    } finally { setGerando(null); }
  };

  const copiar = async (id: string, url: string) => {
    try { await navigator.clipboard.writeText(url); setCopiado(id); setTimeout(() => setCopiado(null), 2000); }
    // Sem permissão de área de transferência o link continua visível na tela para seleção manual.
    catch { setErro("Não consegui copiar — selecione o link e copie à mão."); }
  };

  if (erro && !dados) {
    return (
      <div className="card p-4 flex items-start gap-2 text-[12px] text-lone-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{erro}</span>
      </div>
    );
  }
  if (!dados) return null;
  if (!dados.incompletos.length) return null;

  return (
    <div className="card p-4">
      <button onClick={() => setAberto((v) => !v)} className="w-full text-left">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ClipboardList size={14} className="text-lone-warning" />
          Cadastros pela metade
          <span className="text-[10px] text-muted-foreground font-normal">
            · {dados.incompletos.length} de {dados.total} clientes
          </span>
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Não é dado perdido: essa gente nunca passou pelo formulário. O link já vai preenchido com
          o que a gente tem — o cliente completa só o que falta.
        </p>
      </button>

      {dados.maisFaltante.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {dados.maisFaltante.map((m) => (
            <span key={m.campo} className="text-[10px] px-2 py-0.5 rounded bg-lone-warning-bg text-lone-warning border border-lone-warning-border">
              {m.campo}: {m.clientes}
            </span>
          ))}
        </div>
      )}

      {!aberto ? (
        <button onClick={() => setAberto(true)}
                className="mt-3 text-[11px] px-2.5 py-1.5 rounded-lg bg-surface border border-border text-foreground hover:border-primary">
          Ver os {dados.incompletos.length} e gerar links
        </button>
      ) : (
        <div className="mt-3 space-y-1.5 max-h-[420px] overflow-y-auto">
          {dados.incompletos.map((l) => {
            const url = links[l.clientId]
              ?? (l.linkAberto ? `${window.location.origin}/onboarding/${l.linkAberto.token}` : null);
            return (
              <div key={l.clientId} className="p-2.5 rounded-lg bg-surface border border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground truncate">
                      {l.nome}
                      <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                        {l.percentual}% · {l.responsavel ?? "sem responsável"}
                      </span>
                    </p>
                    <p className="text-[10.5px] text-muted-foreground line-clamp-2">
                      falta: {(l.faltandoEssencial.length ? l.faltandoEssencial : l.faltando).join(", ")}
                    </p>
                  </div>
                  {!url ? (
                    <button onClick={() => gerar(l)} disabled={gerando === l.clientId}
                            className="shrink-0 text-[10px] px-2 py-1 rounded-md bg-card border border-border text-foreground hover:border-primary flex items-center gap-1 disabled:opacity-50">
                      {gerando === l.clientId ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
                      Gerar link
                    </button>
                  ) : (
                    <button onClick={() => copiar(l.clientId, url)}
                            className="shrink-0 text-[10px] px-2 py-1 rounded-md bg-card border border-border text-foreground hover:border-primary flex items-center gap-1">
                      {copiado === l.clientId ? <Check size={10} className="text-lone-success" /> : <Copy size={10} />}
                      {copiado === l.clientId ? "copiado" : "Copiar"}
                    </button>
                  )}
                </div>
                {url && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground break-all select-all">
                    {url}
                    {l.linkAberto && !links[l.clientId] && (
                      <span className="ml-1 text-lone-warning">· link já enviado antes</span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {erro && <p className="mt-2 text-[10.5px] text-lone-warning">{erro}</p>}
    </div>
  );
}
