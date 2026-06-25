"use client";

import { useEffect, useState } from "react";
import { Archive, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useClientsStore } from "@/stores/useClientsStore";
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
export default function ArchivedDemandsModal({ workspace, onClose }: { workspace: string; onClose: () => void }) {
  const [cards, setCards] = useState<ContentCard[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    try {
      const r = await authedFetch("/api/content-cards/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, archivedAt: null }),
      });
      if (r.ok) setCards((cs) => (cs ?? []).filter((c) => c.id !== id));
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
                  <p className="text-[11px] text-muted-foreground truncate">{nameOf(c.clientId)}</p>
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
