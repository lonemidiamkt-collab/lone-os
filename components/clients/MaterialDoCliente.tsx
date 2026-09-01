"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// O material que o CLIENTE mandou pelo painel, na ficha dele.
//
// Sem esta lista o arquivo ficaria no bucket sem ninguém abrir — exatamente o que acontecia com os
// alertas de queda, detectados por meses e nunca comunicados. Fica no briefing porque é aqui que
// designer e social olham ANTES de começar a peça, que é quando o material serve pra alguma coisa.
//
// O botão "já usei" separa o que chegou do que foi aproveitado: material sem baixa é material que
// provavelmente ninguém viu — e o cliente acha que já mandou.

interface Item {
  id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
  observacao: string | null; enviado_por: string | null; created_at: string;
  visto_em: string | null; visto_por: string | null; url: string | null;
}

const kb = (n: number | null) => (n ? `${Math.round(n / 1024)} KB` : "");
const quando = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function MaterialDoCliente({ clientId }: { clientId: string }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/clients/${clientId}/uploads`);
      if (!res.ok) { setItens([]); return; }
      const d = await res.json();
      setItens(d?.itens ?? []);
    } catch { setItens([]); }
  }, [clientId]);

  useEffect(() => { carregar(); }, [carregar]);

  const marcarVisto = useCallback(async (id: string) => {
    setMarcando(id);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/uploads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: id }),
      });
      if (res.ok) await carregar();
    } finally { setMarcando(null); }
  }, [clientId, carregar]);

  if (itens === null || !itens.length) return null;  // sem material, não ocupa espaço na tela

  const pendentes = itens.filter((i) => !i.visto_em).length;

  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        Material enviado pelo cliente
        {pendentes > 0 && (
          <span className="ml-2 text-amber-500 normal-case tracking-normal">
            {pendentes} novo{pendentes > 1 ? "s" : ""}
          </span>
        )}
      </h3>

      <div className="space-y-2">
        {itens.map((it) => (
          <div
            key={it.id}
            className={`rounded-lg border p-3 ${it.visto_em ? "border-border bg-card/50" : "border-amber-500/40 bg-card"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{it.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {quando(it.created_at)}
                  {it.enviado_por ? ` · ${it.enviado_por}` : ""}
                  {it.size_bytes ? ` · ${kb(it.size_bytes)}` : ""}
                </p>
                {it.observacao && (
                  <p className="text-xs text-foreground/80 mt-1 italic">&ldquo;{it.observacao}&rdquo;</p>
                )}
                {it.visto_em && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    já usado por {it.visto_por ?? "equipe"}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                {it.url && (
                  <a href={it.url} target="_blank" rel="noopener noreferrer"
                     className="btn-secondary text-xs px-3 py-1.5 text-center">Abrir</a>
                )}
                {!it.visto_em && (
                  <button
                    onClick={() => marcarVisto(it.id)}
                    disabled={marcando === it.id}
                    className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50"
                  >
                    {marcando === it.id ? "…" : "Já usei"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
