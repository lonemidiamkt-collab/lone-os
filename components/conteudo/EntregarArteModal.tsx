"use client";

// components/conteudo/EntregarArteModal.tsx — "Entregar arte". Saiu da tela do Designer (Leva 5b)
// para servir ao quadro de produção inteiro: o designer entrega pelo card, de qualquer vista.
//
// A entrega é UMA operação no servidor (/api/ops/entregar-arte → entregar_arte + a transição
// "entregue"): anexos viram entrega, a versão é registrada, o pedido de arte fecha e o card vai pra
// "Revisão interna". O estado final vem do servidor; o store só reflete.

import { useEffect, useRef, useState } from "react";
import { CheckCircle, ExternalLink, FileText, FolderOpen, Clock, Upload, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import SignedImage from "@/components/shared/SignedImage";
import CardArtAttachments from "@/components/kanban/CardArtAttachments";
import { markdownPlainText } from "@/components/Markdown";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore, marcarMutacao } from "@/stores/useContentStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { chamar } from "@/lib/api/chamar";
import { trilha } from "@/lib/obs/trilha";
import { entregarArte, novoOperationId } from "@/lib/ops/entregar-arte";
import { aplicarEntregaNoStore, depoisDaEntrega } from "@/components/conteudo/entrega";
import { infoEtapa, statusNaEtapa } from "@/lib/conteudo/etapas";
import type { CardAttachment, ContentCard } from "@/lib/types";

export default function EntregarArteModal({ card, onClose }: { card: ContentCard; onClose: () => void }) {
  const clients = useClientsStore((s) => s.clients);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const pushNotification = useNotificationsStore((s) => s.push);
  const [artLink, setArtLink] = useState(card.imageUrl && card.imageUrl.includes("drive.google.com") ? card.imageUrl : "");
  const [attachments, setAttachments] = useState<CardAttachment[] | null>(null); // null = carregando
  const [erroAnexos, setErroAnexos] = useState<string | null>(null);
  const [tentativaAnexos, setTentativaAnexos] = useState(0);
  const [initialRefs, setInitialRefs] = useState<CardAttachment[]>([]); // o que já estava no card = referência do social
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Um id por clique em "Entregar": repetição (rede caiu, clique duplo) reaproveita o mesmo id → mesma entrega.
  const operationIdRef = useRef<string | null>(null);
  const [error, setError] = useState("");

  const clientDriveLink = clients.find((c) => c.id === card.clientId)?.driveLink;
  const isImageUrl = (url: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);

  useEffect(() => {
    let alive = true;
    setErroAnexos(null);
    chamar<{ attachments?: CardAttachment[] }>(`/api/cards/${card.id}/attachments`).then((r) => {
      if (!alive) return;
      // Falha NÃO é "sem arte": mostrar a grade vazia fazia o designer reenviar o que já estava lá.
      if (!r.ok) { setErroAnexos(r.erro); return; }
      const list = r.data?.attachments ?? [];
      setAttachments(list);
      setInitialRefs((prev) => (prev.length ? prev : list.filter((a) => a.id !== "legacy" && a.tipo !== "entrega")));
    });
    return () => { alive = false; };
  }, [card.id, tentativaAnexos]);

  // A capa do card no quadro acompanha o que o designer anexa — só troca para uma ENTREGA.
  const handleAttachmentsChange = (next: CardAttachment[]) => {
    setAttachments(next);
    const real = next.filter((a) => a.id !== "legacy");
    const cover = real.find((a) => a.tipo === "entrega")?.url;
    marcarMutacao();
    useContentStore.setState((s) => ({
      contentCards: s.contentCards.map((c) =>
        c.id === card.id ? { ...c, cardAttachments: real, imageUrl: next.length === 0 ? undefined : (cover ?? c.imageUrl) } : c,
      ),
    }));
    if (next.length === 0 && card.imageUrl) {
      updateContentCard(card.id, { imageUrl: "" }).catch(() => {}); // o store já avisa a falha
    }
  };

  const handleDeliver = async () => {
    setError("");
    const link = artLink.trim();
    const real = (attachments ?? []).filter((a) => a.id !== "legacy");
    trilha("entregar:clique", { card: card.id, artes: real.length, link: !!link, dr: card.designRequestId ?? null });
    if (real.length === 0 && !link) { setError("Anexe pelo menos uma arte ou cole o link da arte."); return; }
    if (real.length === 0 && link) {
      try {
        const url = new URL(link);
        if (!url.protocol.startsWith("http")) { setError("Link inválido — tem que começar com https://"); return; }
      } catch {
        setError("Link inválido — confira o endereço."); return;
      }
    }

    setSaving(true);
    try {
      if (!operationIdRef.current) operationIdRef.current = novoOperationId();
      const r = await entregarArte({
        cardId: card.id, designRequestId: card.designRequestId ?? null,
        attachmentIds: real.map((a) => a.id), urlsExternas: real.length === 0 && link ? [link] : [],
        operationId: operationIdRef.current,
      });
      if (!r.ok || !r.data?.card) throw new Error(r.erro ?? r.data?.error ?? "não entregou");
      const estado = r.data;
      operationIdRef.current = null;
      aplicarEntregaNoStore(card, estado);
      trilha("entregar:ok", { card: card.id, artes: estado.delivery.urls.length });
      pushNotification("content", "Arte entregue pelo Designer", `"${card.title}" (${card.clientName}) — arte pronta para conferir.`, card.clientId, card.id);
      // Revisão automática por IA contra o briefing (preço, texto, regras) e o som. Best-effort.
      depoisDaEntrega(card);
      toast.success(statusNaEtapa(estado.card.status, "revisao") && !statusNaEtapa(card.status, "revisao")
        ? `Arte entregue — "${card.title}" foi pra ${infoEtapa("revisao").rotulo}.`
        : `Arte entregue em "${card.title}".`);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 700);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      trilha("entregar:erro", { card: card.id, msg });
      setError(`Não foi possível entregar: ${msg}`);
      setSaving(false);
    }
  };

  const podeEntregar = (attachments ?? []).filter((a) => a.id !== "legacy").length > 0 || !!artLink.trim();

  // Dialog do Radix: abre por cima do card aberto (camadas empilhadas) sem perder foco nem clique.
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !saving) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <div className="p-5 pr-12 border-b border-border">
          <DialogTitle className="text-lone-h2 text-foreground flex items-center gap-2">
            <Upload size={15} className="text-primary" aria-hidden="true" /> Entregar arte
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 truncate">{card.title} · {card.clientName}</DialogDescription>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {clientDriveLink && (
            <a href={clientDriveLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20 hover:border-primary/40 transition-colors">
              <FolderOpen size={14} className="text-primary" />
              <span className="flex-1 text-xs text-foreground font-medium">Pasta do cliente no Drive</span>
              <ExternalLink size={12} className="text-primary" />
            </a>
          )}

          <div className="space-y-1.5">
            <p className="text-lone-eyebrow uppercase text-muted-foreground">Artes (até 10 · PNG, JPG, WebP, GIF · 10 MB)</p>
            {erroAnexos ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                <span>Não consegui carregar as artes do card: {erroAnexos}</span>
                <button type="button" onClick={() => setTentativaAnexos((n) => n + 1)} className="shrink-0 underline">Tentar de novo</button>
              </div>
            ) : attachments === null ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground"><Upload size={16} className="animate-pulse" /></div>
            ) : (
              <CardArtAttachments
                cardId={card.id}
                existingAttachments={attachments.filter((a) => a.id !== "legacy")}
                legacyImageUrl={card.imageUrl}
                onAttachmentsChange={handleAttachmentsChange}
                tipo="entrega"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-lone-eyebrow uppercase text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="link-arte" className="text-lone-eyebrow uppercase text-muted-foreground">Link da arte (Google Drive)</label>
            <input
              id="link-arte"
              value={artLink}
              onChange={(e) => { setArtLink(e.target.value); setError(""); }}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full bg-background border border-input rounded-lg px-3 h-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 outline-none"
            />
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>

          {artLink && artLink.includes("http") && (
            isImageUrl(artLink) ? (
              <div className="rounded-lg overflow-hidden border border-border bg-muted">
                <SignedImage src={artLink} alt="Prévia da arte" className="w-full max-h-48 object-contain" />
              </div>
            ) : (
              <a href={artLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
                <ExternalLink size={11} /> Conferir o arquivo antes de entregar
              </a>
            )
          )}

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2"><User size={11} className="text-muted-foreground" /><span className="text-muted-foreground">Social:</span><span className="text-foreground">{card.socialMedia || "—"}</span></div>
            <div className="flex items-center gap-2"><FileText size={11} className="text-muted-foreground" /><span className="text-muted-foreground">Formato:</span><span className="text-foreground">{card.format || "—"}</span></div>
            {card.dueDate && (
              <div className="flex items-center gap-2"><Clock size={11} className="text-muted-foreground" /><span className="text-muted-foreground">Data de postagem:</span><span className="text-foreground font-medium">{card.dueDate.slice(0, 10).split("-").reverse().join("/")}</span></div>
            )}
            {card.alteracaoMotivo && (
              <p className="pt-1.5 border-t border-border text-destructive leading-relaxed">Alteração pedida: {card.alteracaoMotivo}</p>
            )}
            {card.briefing && (
              <p className="pt-1.5 border-t border-border text-muted-foreground leading-relaxed line-clamp-3">{markdownPlainText(card.briefing)}</p>
            )}
            {initialRefs.length > 0 && (
              <div className="pt-1.5 border-t border-border space-y-1.5">
                <p className="text-lone-eyebrow uppercase text-muted-foreground">Referência do social ({initialRefs.length})</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {initialRefs.map((ref, i) => (
                    <a key={ref.id} href={ref.url} target="_blank" rel="noopener noreferrer" title="Abrir referência"
                      className="block rounded-md overflow-hidden border border-border hover:border-primary/40 transition-colors">
                      <SignedImage src={ref.url} alt={`Referência ${i + 1}`} className="w-full h-16 object-cover bg-muted" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancelar</button>
          <button
            type="button"
            onClick={handleDeliver}
            disabled={saved || saving || !podeEntregar}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saved ? <><CheckCircle size={14} /> Entregue</> : saving ? <><Upload size={14} className="animate-pulse" /> Entregando…</> : <><Upload size={14} /> Entregar arte</>}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
