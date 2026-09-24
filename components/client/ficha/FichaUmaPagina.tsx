"use client";

// components/client/ficha/FichaUmaPagina.tsx — A FICHA DE UMA PÁGINA (Leva 7C, N23), no topo da aba
// Marca & Briefing: o resumo que alguém precisa para criar para o cliente, e o PDF para mandar a quem
// não tem acesso ao painel. Fonte: GET /api/clients/[id]/ficha-uma-pagina.

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import type { FichaMontada } from "@/lib/clientes/ficha-uma-pagina";
import { Vazio } from "./Secao";

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-lone-eyebrow uppercase text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

function Chips({ itens, tom = "neutro" }: { itens: string[]; tom?: "neutro" | "perigo" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((x) => (
        <span key={x} className={tom === "perigo"
          ? "rounded-full border border-lone-danger-border bg-lone-danger-bg px-2 py-0.5 text-[11px] text-lone-danger"
          : "rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground"}>{x}</span>
      ))}
    </div>
  );
}

export default function FichaUmaPagina({ clientId, nomeArquivo }: { clientId: string; nomeArquivo: string }) {
  const [ficha, setFicha] = useState<FichaMontada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    let vivo = true;
    chamar<{ ficha: FichaMontada }>(`/api/clients/${clientId}/ficha-uma-pagina`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) setErro(r.erro ?? "Não consegui montar a ficha.");
      else setFicha(r.data.ficha);
    });
    return () => { vivo = false; };
  }, [clientId]);

  const baixar = async () => {
    setBaixando(true);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/ficha-uma-pagina?formato=pdf`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string; faltando?: string[] };
        throw new Error(j.faltando?.length ? `${j.error} Falta: ${j.faltando.join(", ")}.` : j.error || `erro ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `ficha-${nomeArquivo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui gerar o PDF.");
    } finally { setBaixando(false); }
  };

  if (erro) return <Vazio>{erro}</Vazio>;
  if (!ficha) return <div className="h-32 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {ficha.logo ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-1">
              <img src={ficha.logo} alt={`Logo ${ficha.cliente}`} className="max-h-full max-w-full object-contain" />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-lone-h2 text-foreground">{ficha.cliente}</p>
            <p className="text-lone-caption text-muted-foreground">{[ficha.nicho, ficha.instagram ? `@${ficha.instagram.replace(/^@/, "")}` : null].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
        <button onClick={baixar} disabled={baixando || !ficha.suficiente}
          title={ficha.suficiente ? undefined : "Preencha o posicionamento ou o tom de voz no briefing"}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {baixando ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />} Baixar PDF
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {ficha.posicionamento && <Campo titulo="Posicionamento"><p className="text-lone-body text-foreground">{ficha.posicionamento}</p></Campo>}
          {ficha.tom && <Campo titulo="Tom de voz"><p className="text-lone-body text-foreground">{ficha.tom}</p></Campo>}
          {(ficha.palavrasProibidas.length > 0 || ficha.concorrentesEvitar.length > 0) && (
            <Campo titulo="Nunca usar">
              {ficha.palavrasProibidas.length > 0 && <Chips itens={ficha.palavrasProibidas} tom="perigo" />}
              {ficha.concorrentesEvitar.length > 0 && <p className="text-lone-caption text-muted-foreground">Não citar: {ficha.concorrentesEvitar.join(", ")}</p>}
            </Campo>
          )}
          {ficha.regras.length > 0 && (
            <Campo titulo="Regras do cliente">
              <ul className="list-disc space-y-0.5 pl-4 text-lone-body text-foreground">{ficha.regras.map((r) => <li key={r.texto}>{r.texto}</li>)}</ul>
            </Campo>
          )}
        </div>
        <div className="space-y-4">
          {ficha.produtos.length > 0 && <Campo titulo="Produtos e serviços"><Chips itens={ficha.produtos} /></Campo>}
          {ficha.destaques.length > 0 && <Campo titulo="Em destaque agora"><p className="text-lone-body text-foreground">{ficha.destaques.join(" · ")}</p></Campo>}
          {ficha.paleta.length > 0 && (
            <Campo titulo="Paleta">
              <div className="flex flex-wrap gap-2">
                {ficha.paleta.map((c) => (
                  <span key={c.hex + c.papel} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {/* Cor que é DADO do cliente (a paleta dele) — exceção permitida do design system. */}
                    <span className="h-4 w-4 rounded border border-border" style={{ background: c.hex }} aria-hidden="true" />
                    {c.hex.toUpperCase()} · {c.papel}
                  </span>
                ))}
              </div>
            </Campo>
          )}
        </div>
      </div>

      {ficha.faltando.length > 0 && (
        <p className="text-lone-caption text-lone-warning">Falta para a ficha ficar completa: {ficha.faltando.join(", ")}.</p>
      )}
    </div>
  );
}
