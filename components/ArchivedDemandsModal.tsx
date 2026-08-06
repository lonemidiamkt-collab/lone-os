"use client";

import { useEffect, useState } from "react";
import { Archive, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import type { ContentCard } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Tela de demandas ARQUIVADAS (soft-delete). Busca sob demanda (?archived=1),
 * permite Desarquivar (volta pro quadro) ou Excluir definitivamente (cascade).
 * Componente isolado pra não inflar app/social/page.tsx.
 */
/** "há 5 min", "hoje 14:32", "ontem", "12/07" — referência de tempo, não carimbo cru. */
function quando(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const d = new Date(t);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return `hoje ${hh}`;
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hh}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function ArchivedDemandsModal({ workspace, onClose }: { workspace: string; onClose: () => void }) {
  const [cards, setCards] = useState<ContentCard[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const clients = useClientsStore((s) => s.clients);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? "Cliente";

  useEffect(() => {
    let active = true;
    const params = workspace && workspace !== "Todos" ? `&socialMedia=${encodeURIComponent(workspace)}` : "";
    authedFetch(`/api/data/content?archived=1${params}`)
      .then((r) => (r.ok ? r.json() : { contentCards: [] }))
      .then((d) => { if (active) setCards(d.contentCards ?? []); })
      .catch(() => { if (active) setCards([]); });
    return () => { active = false; };
  }, [workspace]);

  const unarchive = async (id: string) => {
    setBusyId(id);
    setErro(null);
    try {
      const r = await authedFetch("/api/content-cards/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, archivedAt: null }),
      });
      if (!r.ok) {
        // Falhou e ninguém sabia: o card sumia da lista mesmo sem ter sido desarquivado.
        setErro("Não consegui desarquivar. Tente de novo.");
        return;
      }
      // DEVOLVE O CARD AO QUADRO NA HORA. Antes ele só sumia daqui — o board só saberia no
      // próximo carregamento da página. Quem arquivou sem querer clicava em "desarquivar",
      // via o item sumir da lista, ia pro quadro e não achava: parecia trabalho perdido.
      const alvo = (cards ?? []).find((c) => c.id === id);
      if (alvo) {
        useContentStore.setState((st) => ({
          contentCards: st.contentCards.some((c) => c.id === id)
            ? st.contentCards.map((c) => (c.id === id ? { ...c, archivedAt: undefined } : c))
            : [{ ...alvo, archivedAt: undefined }, ...st.contentCards],
        }));
      }
      setCards((cs) => (cs ?? []).filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const r = await authedFetch("/api/content-cards/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) setCards((cs) => (cs ?? []).filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Archive size={16} /> Demandas arquivadas
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {erro && <p className="text-xs text-destructive px-1 pb-1" role="alert">{erro}</p>}
          {cards === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : cards.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhuma demanda arquivada.</p>
          ) : (
            cards.map((c) => (
              <div key={c.id} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                  {/* QUANDO foi arquivado. Sem isso não dá pra distinguir "arquivei agora sem
                      querer" de algo de semanas atrás — e é o que a pessoa procura. */}
                  <p className="text-[11px] text-muted-foreground truncate">
                    {nameOf(c.clientId)}
                    {c.archivedAt && <span className="ml-1.5">· arquivado {quando(c.archivedAt)}</span>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === c.id}
                  className="flex items-center gap-1.5 text-primary hover:bg-primary/10 shrink-0"
                  onClick={() => unarchive(c.id)}
                >
                  <RotateCcw size={13} /> Desarquivar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === c.id}
                  className="text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => remove(c.id)}
                  title="Excluir definitivamente"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
