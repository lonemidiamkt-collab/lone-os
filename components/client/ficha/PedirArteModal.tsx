"use client";

// components/client/ficha/PedirArteModal.tsx — "Pedir arte" a partir da ficha. Sem card de origem:
// o servidor cria o card já em "Com o designer" (app/api/design-requests/create, Leva 5b).
// Era o "Solicitar Design" que só existia dentro da Creative Wallet (e só o admin via).

import { useState } from "react";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { MarkdownEditor } from "@/components/Markdown";
import { useContentStore } from "@/stores/useContentStore";
import type { Client } from "@/lib/types";

type Prioridade = "low" | "medium" | "high" | "critical";
const VAZIO = { title: "", format: "Post Feed", briefing: "", priority: "medium" as Prioridade, deadline: "" };

export default function PedirArteModal({ client, currentUser, aoFechar }: { client: Client; currentUser: string; aoFechar: () => void }) {
  const addDesignRequest = useContentStore((s) => s.addDesignRequest);
  const [f, setF] = useState(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const pronto = !!f.title.trim() && !!f.briefing.trim();

  const enviar = async () => {
    if (!pronto || enviando) return;
    setEnviando(true);
    try {
      await addDesignRequest({
        title: f.title.trim(), clientId: client.id, clientName: client.name, requestedBy: currentUser,
        priority: f.priority, status: "queued", format: f.format, briefing: f.briefing.trim(),
        deadline: f.deadline || undefined,
      });
      toast.success(`"${f.title.trim()}" foi pro designer.`);
      aoFechar();
    } catch (err) {
      toast.error(`Não consegui criar o pedido${err instanceof Error && err.message ? ` (${err.message})` : ""}. Tenta de novo.`);
    } finally {
      setEnviando(false);
    }
  };

  const campo = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="pedir-arte-titulo"
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border p-5">
          <h3 id="pedir-arte-titulo" className="text-lone-h2 text-foreground">Pedir arte</h3>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">{client.nomeFantasia || client.name} — o card nasce em “Com o designer”.</p>
        </div>
        <div className="space-y-3 p-5">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Título"
            placeholder="Título (ex.: Banner da promoção de verão)" className={campo} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} aria-label="Formato" className={campo}>
              {["Post Feed", "Story", "Reels", "Carrossel", "Banner", "Thumbnail"].map((o) => <option key={o}>{o}</option>)}
            </select>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Prioridade })} aria-label="Prioridade" className={campo}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="critical">Urgente</option>
            </select>
          </div>
          <label className="block space-y-1">
            <span className="text-lone-caption text-muted-foreground">Prazo (opcional)</span>
            <input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} className={campo} />
          </label>
          <MarkdownEditor value={f.briefing} onChange={(v) => setF({ ...f, briefing: v })}
            placeholder="Briefing para o designer (markdown — **negrito**, listas, links)..." minHeight={120} className="bg-background" />
        </div>
        <div className="flex gap-2 border-t border-border p-5">
          <button onClick={aoFechar} className="h-9 flex-1 rounded-lg border border-border text-sm text-foreground transition-colors hover:bg-accent">Cancelar</button>
          <button onClick={enviar} disabled={!pronto || enviando}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            <Palette size={14} aria-hidden="true" /> {enviando ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
