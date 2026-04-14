"use client";

import { useState, useRef } from "react";
import {
  Upload, Calendar, FileText, User, Tag,
  Save, ImageIcon, Hash, AlignLeft, Globe,
  Send, MessageSquare, CheckCircle, XCircle, ExternalLink, Palette,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import type { ContentCard, SocialPlatform } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string; emoji: string }[] = [
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "tiktok",    label: "TikTok",    emoji: "🎵" },
  { value: "linkedin",  label: "LinkedIn",  emoji: "💼" },
  { value: "youtube",   label: "YouTube",   emoji: "▶️" },
  { value: "facebook",  label: "Facebook",  emoji: "👥" },
];

const STATUS_OPTIONS: { value: ContentCard["status"]; label: string; color: string }[] = [
  { value: "ideas", label: "Ideias", color: "bg-zinc-500" },
  { value: "script", label: "Roteiro", color: "bg-zinc-500" },
  { value: "in_production", label: "Em Produção", color: "bg-primary" },
  { value: "approval", label: "Aprovação", color: "bg-zinc-500" },
  { value: "client_approval", label: "Aprovação Cliente", color: "bg-zinc-500" },
  { value: "scheduled", label: "Agendado", color: "bg-zinc-500" },
  { value: "published", label: "Publicado", color: "bg-primary" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "text-[#0d4af5]",
  manager: "text-[#0d4af5]",
  traffic: "text-[#0d4af5]",
  social: "text-[#0d4af5]",
  designer: "text-[#3b6ff5]",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface Props {
  card: ContentCard;
  onClose: () => void;
}

export default function ContentCardModal({ card, onClose }: Props) {
  const { updateContentCard, addCardComment, approveContent, rejectContent, addDesignRequest, pushNotification } = useAppState();
  const { role, currentUser } = useRole();
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [observations, setObservations] = useState(card.observations ?? "");
  const [caption, setCaption] = useState(card.caption ?? "");
  const [hashtags, setHashtags] = useState(card.hashtags ?? "");
  const [platform, setPlatform] = useState<SocialPlatform | "">(card.platform ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [status, setStatus] = useState(card.status);
  const [imageUrl, setImageUrl] = useState(card.imageUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [commentText, setCommentText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const comments = card.comments ?? [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imageUrl && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
  };

  const handleSave = () => {
    updateContentCard(card.id, {
      observations,
      caption: caption || undefined,
      hashtags: hashtags || undefined,
      platform: (platform as SocialPlatform) || undefined,
      dueDate: dueDate || undefined,
      status,
      imageUrl: imageUrl || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    addCardComment(card.id, currentUser, role, commentText.trim());
    setCommentText("");
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-start px-6 py-5 border-b border-border shrink-0 space-y-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`w-2 h-2 rounded-full ${currentStatus?.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{currentStatus?.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{card.format}</span>
              <span className="text-muted-foreground">·</span>
              <Badge className={`border text-xs ${getPriorityColor(card.priority)}`}>
                {getPriorityLabel(card.priority)}
              </Badge>
            </div>
            <DialogTitle className="text-lg leading-tight">{card.title}</DialogTitle>
            <p className="text-sm text-primary mt-0.5">{card.clientName}</p>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Art preview */}
          <div className="w-72 border-r border-border flex flex-col shrink-0">
            <div className="flex-1 relative bg-muted overflow-hidden">
              {imageUrl ? (
                imageUrl.startsWith("blob:") ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 px-4">
                    <ImageIcon size={32} />
                    <p className="text-[10px] text-center">Preview removido para otimizar o sistema.</p>
                    {(() => {
                      const { clients: cls } = useAppState();
                      const cl = cls.find((c) => c.id === card.clientId);
                      return cl?.driveLink ? (
                        <a href={cl.driveLink} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-[#0d4af5] hover:underline flex items-center gap-1">
                          <ExternalLink size={9} /> Acesse via Google Drive
                        </a>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <img
                    src={imageUrl}
                    alt="Arte do conteudo"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 px-4"><p style="font-size:10px;text-align:center">Preview indisponivel. Acesse via Google Drive.</p></div>';
                    }}
                  />
                )
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <ImageIcon size={40} />
                  <p className="text-xs text-center px-4">Nenhuma arte anexada ainda</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-border">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2"
              >
                <Upload size={13} />
                {imageUrl ? "Trocar arquivo" : "Anexar arte / arquivo"}
              </Button>
            </div>
          </div>

          {/* Right: Details */}
          <div className="flex-1 overflow-auto p-6 space-y-5">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User size={12} />
                <span>{card.socialMedia}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Tag size={12} />
                <span>{card.format}</span>
              </div>
            </div>

            {/* Platform */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Globe size={12} />
                Rede Social
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPlatform(platform === opt.value ? "" : opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      platform === opt.value
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status selector */}
            <div>
              <Label className="block mb-2">Status</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatus(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      status === opt.value
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.color}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Posting date */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Calendar size={12} />
                Data de Postagem
              </Label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Briefing */}
            {card.briefing && (
              <div>
                <Label className="flex items-center gap-1.5 mb-2">
                  <FileText size={12} />
                  Briefing
                </Label>
                <div className="bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground leading-relaxed">
                  {card.briefing}
                </div>
              </div>
            )}

            {/* Caption */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <AlignLeft size={12} />
                Legenda / Caption
              </Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="Digite a legenda que será publicada..."
              />
            </div>

            {/* Hashtags */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Hash size={12} />
                Hashtags
              </Label>
              <Textarea
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                rows={2}
                placeholder="#marketing #socialmedia #agencia..."
              />
            </div>

            {/* Observations */}
            <div>
              <Label className="block mb-2">Observações / Notas</Label>
              <Textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={3}
                placeholder="Adicione observações, feedbacks, ajustes necessários..."
              />
            </div>

            {/* Comments Thread */}
            <div className="pt-4 border-t border-border">
              <Label className="flex items-center gap-1.5 mb-3">
                <MessageSquare size={12} />
                Discussão ({comments.length})
              </Label>

              {comments.length === 0 && (
                <p className="text-xs text-zinc-600 mb-3">Nenhum comentário ainda. Inicie a discussão sobre este conteúdo.</p>
              )}

              {comments.length > 0 && (
                <div className="space-y-2.5 mb-3 max-h-48 overflow-auto">
                  {comments.map((cmt) => (
                    <div key={cmt.id} className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className={`text-[9px] font-bold ${ROLE_COLORS[cmt.role] ?? "text-primary"}`}>
                          {cmt.author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">{cmt.author}</span>
                          <span className="text-[10px] text-zinc-600">{timeAgo(cmt.createdAt)}</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{cmt.text}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={commentsEndRef} />
                </div>
              )}

              {/* Comment input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleComment()}
                  placeholder="Escreva um comentário..."
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleComment}
                  disabled={!commentText.trim()}
                  className="shrink-0 px-3"
                >
                  <Send size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Approval Actions — visible when card is in approval or client_approval */}
        {(card.status === "approval" || card.status === "client_approval") && (
          <div className="px-6 py-4 border-t border-border space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-foreground">Ação de Aprovação</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                {card.status === "approval" ? "Aprovação Interna" : "Aprovação Cliente"}
              </span>
            </div>

            {/* Drive link if available */}
            {card.imageUrl && card.imageUrl.includes("drive.google.com") && (
              <a
                href={card.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d4af5]/[0.04] border border-[#0d4af5]/20 hover:border-[#0d4af5]/40 transition-all text-xs text-[#0d4af5]"
              >
                <ExternalLink size={12} /> Abrir arte no Drive
              </a>
            )}

            {!showRejectInput ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { approveContent(card.id, currentUser); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all shadow-[0_0_15px_rgba(10,52,245,0.3)] hover:shadow-[0_0_25px_rgba(10,52,245,0.5)]"
                >
                  <CheckCircle size={14} /> Aprovar Arte
                </button>
                <button
                  onClick={() => setShowRejectInput(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-all"
                >
                  <XCircle size={14} /> Solicitar Alteração
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && rejectReason.trim()) {
                      rejectContent(card.id, currentUser, rejectReason.trim());
                      onClose();
                    }
                  }}
                  placeholder="Descreva o motivo da alteração..."
                  className="w-full bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-600 focus:border-red-500/40 outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                    className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-foreground transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { if (rejectReason.trim()) { rejectContent(card.id, currentUser, rejectReason.trim()); onClose(); } }}
                    disabled={!rejectReason.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-30"
                  >
                    <XCircle size={12} /> Enviar Rejeição
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Drive link — prominent button */}
        {(() => {
          const { clients } = useAppState();
          const cl = clients.find((c) => c.id === card.clientId);
          return cl?.driveLink ? (
            <div className="px-6 py-3 border-t border-border">
              <a href={cl.driveLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-[#0d4af5]/[0.06] border border-[#0d4af5]/[0.15] hover:bg-[#0d4af5]/[0.12] hover:border-[#0d4af5]/[0.3] transition-all group">
                <div className="w-9 h-9 rounded-lg bg-[#0d4af5]/15 flex items-center justify-center shrink-0 group-hover:bg-[#0d4af5]/25 transition-all">
                  <ExternalLink size={16} className="text-[#0d4af5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0d4af5]">Abrir Drive — {cl.name}</p>
                  <p className="text-[10px] text-zinc-500">Acesse logos, fotos e arquivos em alta resolucao</p>
                </div>
              </a>
            </div>
          ) : null;
        })()}

        <DialogFooter className="px-6 py-4 border-t border-border">
          {/* Solicitar Design — only for social/traffic/admin, NOT for designer */}
          {role !== "designer" && !card.designRequestId && !card.designerDeliveredAt && (
            <Button
              variant="outline"
              className="mr-auto flex items-center gap-2 text-[#8b5cf6] border-[#8b5cf6]/30 hover:bg-[#8b5cf6]/10"
              onClick={() => {
                const req = addDesignRequest({
                  title: `Arte: ${card.title}`,
                  clientId: card.clientId,
                  clientName: card.clientName,
                  requestedBy: currentUser,
                  priority: card.priority || "medium",
                  status: "queued",
                  format: card.format || "Post Feed",
                  briefing: card.briefing || card.observations || `Criar arte para: ${card.title}`,
                });
                updateContentCard(card.id, { designRequestId: req.id });
                pushNotification("content", "Design solicitado", `Pedido de arte para "${card.title}" enviado ao designer.`, card.clientId);
              }}
            >
              <Palette size={14} />
              Solicitar Design
            </Button>
          )}
          {/* Designer sees "Enviar Arte" instead */}
          {role === "designer" && !card.designerDeliveredAt && (
            <span className="mr-auto text-xs text-[#0d4af5] flex items-center gap-1.5">
              <Upload size={12} /> Use o botao "Enviar Arte" no kanban
            </span>
          )}
          {role !== "designer" && card.designRequestId && !card.designerDeliveredAt && (
            <span className="mr-auto text-xs text-amber-400 flex items-center gap-1.5">
              <Palette size={12} /> Aguardando design...
            </span>
          )}
          {card.designerDeliveredAt && !card.socialConfirmedAt && role !== "designer" && (
            <Button
              variant="outline"
              className="mr-auto flex items-center gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
              onClick={() => {
                updateContentCard(card.id, { socialConfirmedAt: new Date().toISOString(), socialConfirmedBy: currentUser });
              }}
            >
              <CheckCircle size={14} />
              Confirmar Arte
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={handleSave}
            className={`flex items-center gap-2 ${saved ? "bg-[#0d4af5] hover:bg-[#0d4af5]" : ""}`}
          >
            <Save size={14} />
            {saved ? "Salvo!" : "Salvar alteracoes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
