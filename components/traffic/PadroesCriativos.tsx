"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// O que os vencedores têm em comum — cliente · segmento · Lone. Correlação, vira hipótese de teste.
interface Nivel { amostra: { vencedores: number; outros: number }; insuficiente?: boolean; nicho?: string;
  precoVisivel?: { vencedores: number | null; outros: number | null }; pessoa?: { vencedores: number | null; outros: number | null };
  formatos?: { vencedores: { valor: string; n: number }[]; outros: { valor: string; n: number }[] }; cores?: { vencedores: { valor: string; n: number }[] };
  tags?: { tag: string; vencedores: number; pctVencedores: number; pctOutros: number; lift: number | null }[] }
interface Dados { dia: string | null; atributosLidos: number; niveis: { cliente?: Nivel; segmento?: Nivel; lone?: Nivel }; error?: string }

const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

function Bloco({ titulo, n }: { titulo: string; n: Nivel | undefined }) {
  if (!n) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-[11px]">
      <p className="font-medium text-foreground">{titulo} <span className="text-muted-foreground">· {n.amostra.vencedores} vencedores × {n.amostra.outros} outros</span></p>
      {n.insuficiente ? <p className="mt-1 text-muted-foreground">Amostra pequena ainda — precisa de mais vencedores com atributos lidos.</p> : (
        <div className="mt-1 space-y-1">
          <p className="text-muted-foreground">Preço visível: <span className="text-foreground">{pct(n.precoVisivel?.vencedores)}</span> × {pct(n.precoVisivel?.outros)} · Pessoa na imagem: <span className="text-foreground">{pct(n.pessoa?.vencedores)}</span> × {pct(n.pessoa?.outros)}</p>
          {n.formatos?.vencedores.length ? <p className="text-muted-foreground">Formato dos vencedores: {n.formatos.vencedores.map((f) => `${f.valor} ${f.n}`).join(" · ")}</p> : null}
          {n.cores?.vencedores.length ? <p className="text-muted-foreground">Cor: {n.cores.vencedores.map((f) => `${f.valor} ${f.n}`).join(" · ")}</p> : null}
          {n.tags?.length ? <div className="flex flex-wrap gap-1 pt-0.5">{n.tags.map((t) => <span key={t.tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary" title={`${t.pctVencedores}% dos vencedores × ${t.pctOutros}% dos outros`}>{t.tag}{t.lift ? ` ×${t.lift}` : ""}</span>)}</div> : null}
        </div>
      )}
    </div>
  );
}

export default function PadroesCriativos({ clientId }: { clientId?: string }) {
  const [d, setD] = useState<Dados | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  useEffect(() => {
    setD(null); setFalhou(null);
    authedFetch(`/api/traffic/criativos/padroes${clientId ? `?clientId=${clientId}` : ""}`)
      .then(async (r) => { const j = (await r.json().catch(() => null)) as Dados | null; if (r.ok && j) setD(j); else setFalhou(j?.error ?? `HTTP ${r.status}`); })
      .catch(() => setFalhou("Não consegui carregar os padrões."));
  }, [clientId]);
  // Antes voltava null e a caixa ficava vazia sem explicação (print do Roberto, 14/09).
  if (!d) return <div><h4 className="text-sm font-semibold text-foreground">🔍 Padrão dos vencedores — três níveis</h4><p className="mt-1 text-xs text-muted-foreground">{falhou ?? "Carregando…"}</p></div>;
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-foreground">🔍 Padrão dos vencedores — três níveis</h4>
        <p className="text-[11px] text-muted-foreground">{d.atributosLidos} anúncios com atributos lidos. O que os vencedores têm em comum contra os demais; "×2" = o dobro da frequência. É correlação — vira hipótese de teste, não regra. Segmento e Lone mostram só contagens, nunca o dado de outro cliente.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {clientId && <Bloco titulo="Este cliente" n={d.niveis.cliente} />}
        {d.niveis.segmento && <Bloco titulo={`Segmento: ${d.niveis.segmento.nicho}`} n={d.niveis.segmento} />}
        <Bloco titulo="Lone (todos os clientes)" n={d.niveis.lone} />
      </div>
    </section>
  );
}
