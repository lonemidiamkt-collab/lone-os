"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload, Calendar, FileText, User, Tag,
  Save, ImageIcon, Hash, AlignLeft,
  Send, MessageSquare, CheckCircle, XCircle, ExternalLink, Palette, Archive, AtSign,
} from "lucide-react";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRole } from "@/lib/context/RoleContext";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import type { ContentCard, CardAttachment } from "@/lib/types";
import CardArtAttachments from "@/components/kanban/CardArtAttachments";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { toast } from "sonner";
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
import { MarkdownEditor, MarkdownView, htmlToMarkdown } from "@/components/Markdown";


const STATUS_OPTIONS: { value: ContentCard["status"]; label: string; color: string }[] = [
  { value: "ideas", label: "Ideias", color: "bg-muted" },
  { value: "script", label: "Roteiro", color: "bg-muted" },
  { value: "in_production", label: "Em Produção", color: "bg-primary" },
  { value: "approval", label: "Aprovação Social Media", color: "bg-muted" },
  { value: "client_approval", label: "Aprovação Cliente", color: "bg-muted" },
  { value: "scheduled", label: "Agendado", color: "bg-muted" },
  { value: "published", label: "Publicado", color: "bg-primary" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "text-primary",
  manager: "text-primary",
  traffic: "text-primary",
  social: "text-primary",
  designer: "text-primary",
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
  const clients = useClientsStore((s) => s.clients);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const addCardComment = useContentStore((s) => s.addCardComment);
  const approveContent = useContentStore((s) => s.approveContent);
  const rejectContent = useContentStore((s) => s.rejectContent);
  const addDesignRequest = useContentStore((s) => s.addDesignRequest);
  const pushNotification = useNotificationsStore((s) => s.push);
  const { role, currentUser } = useRole();
  const team = useTeamMembers();
  // Quem pode ser marcado num comentário: designers e socials (quem mexe na arte).
  const mentionable = [...team.designer, ...team.social].filter((m) => m.name && m.name !== currentUser);
  const [mentions, setMentions] = useState<string[]>([]);
  const toggleMention = (name: string) => setMentions((m) => m.includes(name) ? m.filter((x) => x !== name) : [...m, name]);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [observations, setObservations] = useState(card.observations ?? "");
  // Briefing é salvo/editado como Markdown. Dados legacy (HTML do contentEditable
  // anterior) são convertidos no carregamento via htmlToMarkdown.
  const [briefing, setBriefing] = useState(htmlToMarkdown(card.briefing ?? ""));
  const [title, setTitle] = useState(card.title ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [caption, setCaption] = useState(card.caption ?? "");
  const [hashtags, setHashtags] = useState(card.hashtags ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [status, setStatus] = useState(card.status);
  const [attachments, setAttachments] = useState<CardAttachment[] | null>(null); // null = carregando
  const [saved, setSaved] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [editingBriefing, setEditingBriefing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [sendingDesign, setSendingDesign] = useState(false); // anti-duplo-clique no Solicitar Design
  const [genLegenda, setGenLegenda] = useState(false);       // gerando legenda por IA
  const [revisando, setRevisando] = useState(false);         // revisando a arte por IA
  const [revisao, setRevisao] = useState<{ ok: boolean; problemas: string[]; resumo: string } | null>(null);
  const [genBrief, setGenBrief] = useState(false);           // gerando briefing da arte pro designer
  const [designBrief, setDesignBrief] = useState<string | null>(null); // briefing gerado (EDITÁVEL antes de enviar)
  const [revisandoPost, setRevisandoPost] = useState(false); // revisão FINAL do post por IA
  const [revisaoPost, setRevisaoPost] = useState<{
    aprovado: boolean;
    problemas: { gravidade: string; area: string; detalhe: string; sugestao: string | null }[];
    resumo: string;
    legenda_corrigida: string | null;
  } | null>(null);
  const [enviandoCliente, setEnviandoCliente] = useState(false); // mandando as artes pro grupo do cliente aprovar
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // 📤 Envia as artes ENTREGUES pro grupo do cliente aprovar (mensagem padronizada, pelo CS).
  // Disparo humano — o social/gestor clica. Confirma antes (é mensagem pra fora).
  async function enviarProCliente() {
    if (!window.confirm(`Enviar as artes de "${card.title}" pro grupo do WhatsApp de ${card.clientName} pedir aprovação?`)) return;
    setEnviandoCliente(true);
    try {
      const r = await authedFetch("/api/cs/enviar-aprovacao", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        toast.success(`Enviei ${d.enviadas}/${d.total} arte(s) pro grupo de ${card.clientName} aprovar. 🎉`);
      } else {
        toast.error(d.error || d.falhas?.join("; ") || "Não deu pra enviar pro cliente.");
      }
    } catch { toast.error("Falha de conexão ao enviar pro cliente."); }
    finally { setEnviandoCliente(false); }
  }

  // ✍️ Legenda pronta por IA: usa o briefing do cliente pra escrever gancho+corpo+CTA+hashtags.
  async function gerarLegendaIA() {
    setGenLegenda(true);
    try {
      const r = await authedFetch("/api/cs/legenda", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.legenda) setCaption(d.legenda);
        if (d.hashtags) setHashtags(d.hashtags);
      } else {
        const e = await r.json().catch(() => ({}));
        pushNotification("system", "Não deu pra gerar a legenda", e.error || "Tente de novo.", card.clientId);
      }
    } catch { pushNotification("system", "Falha ao gerar a legenda", "Verifique a conexão.", card.clientId); }
    finally { setGenLegenda(false); }
  }

  // 🔍 Revisão de arte por IA: confere a arte entregue contra o briefing antes de ir ao cliente.
  async function revisarArteIA() {
    setRevisando(true); setRevisao(null);
    try {
      const r = await authedFetch("/api/cs/revisar-arte", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setRevisao(d);
      else setRevisao({ ok: false, problemas: [d.error || "Não consegui revisar."], resumo: "Revisão indisponível" });
    } catch { setRevisao({ ok: false, problemas: ["Falha de conexão."], resumo: "Revisão indisponível" }); }
    finally { setRevisando(false); }
  }

  // 🎨 Briefing da arte pro designer, por IA — gera e deixa EDITÁVEL; vai no pedido de design.
  async function gerarBriefingDesignIA() {
    setGenBrief(true);
    try {
      const r = await authedFetch("/api/cs/briefing-design", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.briefing) setDesignBrief(d.briefing);
      } else {
        const e = await r.json().catch(() => ({}));
        pushNotification("system", "Não deu pra gerar o briefing da arte", e.error || "Tente de novo.", card.clientId);
      }
    } catch { pushNotification("system", "Falha ao gerar o briefing", "Verifique a conexão.", card.clientId); }
    finally { setGenBrief(false); }
  }

  // ✅ Revisão FINAL do post (arte + legenda + hashtags) por IA — o pre-flight antes de ir ao cliente.
  async function revisarPostIA() {
    setRevisandoPost(true); setRevisaoPost(null);
    try {
      const r = await authedFetch("/api/cs/revisar-post", {
        // Manda a legenda/hashtags ATUAIS do editor (podem não estar salvas ainda) — senão a IA
        // revisaria a versão velha do banco e a "legenda corrigida" sobrescreveria a nova.
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, caption, hashtags }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setRevisaoPost(d);
      else setRevisaoPost({ aprovado: false, problemas: [{ gravidade: "alta", area: "legenda", detalhe: d.error || "Não consegui revisar.", sugestao: null }], resumo: "Revisão indisponível", legenda_corrigida: null });
    } catch { setRevisaoPost({ aprovado: false, problemas: [{ gravidade: "alta", area: "legenda", detalhe: "Falha de conexão.", sugestao: null }], resumo: "Revisão indisponível", legenda_corrigida: null }); }
    finally { setRevisandoPost(false); }
  }

  // Comentários REATIVOS: lê do store (não da prop estática) — assim o comentário recém-escrito
  // aparece na hora. Antes vinha de card.comments (prop congelada) e "não ficava" na tela.
  const liveComments = useContentStore((s) => s.contentCards.find((c) => c.id === card.id)?.comments);
  const comments = liveComments ?? card.comments ?? [];

  // Carrega as artes (multi-arte) ao abrir o card
  useEffect(() => {
    let alive = true;
    authedFetch(`/api/cards/${card.id}/attachments`)
      .then((r) => (r.ok ? r.json() : { attachments: [] }))
      .then((d) => { if (alive) setAttachments((d.attachments as CardAttachment[]) ?? []); })
      .catch(() => { if (alive) setAttachments([]); });
    return () => { alive = false; };
  }, [card.id]);

  // Reflete a mudança de arte no board na hora (capa = 1ª arte; sem arte = sem capa).
  const handleAttachmentsChange = (next: CardAttachment[]) => {
    const real = next.filter((a) => a.id !== "legacy");
    const cover = next[0]?.url; // 1ª arte visível (real ou capa legada)
    useContentStore.setState((s) => ({
      contentCards: s.contentCards.map((c) =>
        c.id === card.id ? { ...c, cardAttachments: real, imageUrl: cover } : c,
      ),
    }));
    // Removeu tudo (inclusive a capa legada) → persiste a limpeza do image_url legado.
    if (next.length === 0 && card.imageUrl) {
      updateContentCard(card.id, { imageUrl: "" }).catch(() => {});
    }
  };

  const handleSave = () => {
    // A data de postagem NÃO bloqueia mais o save — travar tudo fazia o social PERDER a edição
    // (briefing, legenda etc.). Salva o que foi editado e, se faltar a data, apenas AVISA: sem ela o
    // card fica invisível pro acompanhamento de pauta do agente CS. (Pedido do Roberto: não travar.)
    updateContentCard(card.id, {
      observations,
      briefing: briefing || undefined,
      caption: caption || undefined,
      hashtags: hashtags || undefined,
      dueDate: dueDate || undefined,
      status,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    if (!dueDate) {
      pushNotification("system", "Salvei — só falta a data de postagem", `Defina quando "${card.title}" vai ao ar pra ele entrar no acompanhamento da pauta.`, card.clientId);
    }
  };

  const handleSaveBriefing = () => {
    updateContentCard(card.id, { briefing: briefing || undefined });
    setEditingBriefing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    const body = commentText.trim();
    // Prefixa o comentário com @PrimeiroNome de quem foi marcado (fica visível no thread).
    const prefix = mentions.length ? mentions.map((m) => `@${m.split(" ")[0]}`).join(" ") + " " : "";
    addCardComment(card.id, currentUser, role, prefix + body);
    // Notifica cada pessoa marcada pra ela ver rápido (notificação global, mas endereçada).
    mentions.forEach((name) => {
      // Com o card: quem foi marcado abre o comentário, não a ficha do cliente.
      pushNotification("content", `📌 ${name}, você foi marcado`, `${currentUser} te marcou em "${card.title}" (${card.clientName}): "${body.slice(0, 80)}${body.length > 80 ? "..." : ""}"`, card.clientId, card.id);
    });
    setCommentText("");
    setMentions([]);
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Arquiva a DEMANDA (soft-delete): some do quadro ativo mas fica no banco, recuperável em "Arquivadas".
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await updateContentCard(card.id, { archivedAt: new Date().toISOString() });
      pushNotification("content", "Demanda arquivada", `"${card.title}" saiu do quadro. Recupere em Arquivadas.`, card.clientId);
      onClose();
    } catch {
      setArchiving(false);
    }
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status);

  // Tem edição não salva? (os campos que só persistem no "Salvar alterações".) Se sim, confirmar
  // antes de fechar — senão fechar/ESC/clique-fora descartava legenda/briefing digitados em silêncio.
  const isDirty =
    observations !== (card.observations ?? "") ||
    briefing !== htmlToMarkdown(card.briefing ?? "") ||
    title !== (card.title ?? "") ||
    caption !== (card.caption ?? "") ||
    hashtags !== (card.hashtags ?? "") ||
    dueDate !== (card.dueDate ?? "") ||
    status !== card.status;

  const requestClose = () => {
    if (isDirty && !window.confirm("Você tem alterações não salvas neste card. Descartar e fechar?")) return;
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden p-0">
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
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { const t = title.trim(); if (t && t !== card.title) updateContentCard(card.id, { title: t }); setEditingTitle(false); }
                    if (e.key === "Escape") { setTitle(card.title ?? ""); setEditingTitle(false); }
                  }}
                  className="flex-1 text-lg font-semibold bg-surface border border-primary/40 rounded-lg px-2 py-1 text-foreground outline-none"
                />
                <button type="button" onClick={() => { const t = title.trim(); if (t && t !== card.title) updateContentCard(card.id, { title: t }); setEditingTitle(false); }}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium">Salvar</button>
                <button type="button" onClick={() => { setTitle(card.title ?? ""); setEditingTitle(false); }}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">Cancelar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group/title">
                <DialogTitle className="text-lg leading-tight">{title || card.title}</DialogTitle>
                <button type="button" onClick={() => { setTitle(card.title ?? ""); setEditingTitle(true); }}
                  className="shrink-0 text-[11px] px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 opacity-0 group-hover/title:opacity-100 transition-all">Editar</button>
              </div>
            )}
            <p className="text-sm text-primary mt-0.5">{card.clientName}</p>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Artes (multi-arte). A GRADE de artes rola; o botão de enviar fica FIXO no rodapé
              da coluna (antes ficava no fim da lista → tinha que rolar todas as artes pra achar). */}
          <div className="w-72 border-r border-border flex flex-col shrink-0 overflow-hidden">
            {/* Área rolável das artes */}
            <div className="p-3 space-y-2 flex-1 overflow-auto">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <ImageIcon size={13} /> Artes do card
              </div>
              {attachments === null ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Upload size={16} className="animate-pulse" />
                </div>
              ) : (
                <CardArtAttachments
                  cardId={card.id}
                  existingAttachments={attachments}
                  legacyImageUrl={card.imageUrl}
                  onAttachmentsChange={handleAttachmentsChange}
                />
              )}
              <p className="text-[9px] text-muted-foreground text-center">
                PNG, JPEG, WebP, GIF — até 10MB, máx 20 artes
              </p>
            </div>

            {/* 📤 Rodapé FIXO da coluna: enviar as artes pro grupo do cliente aprovar (pelo CS).
                Sempre visível (não rola), em qualquer status, quando há arte e não pro designer. */}
            {(((attachments?.length ?? 0) > 0) || card.imageUrl) && role !== "designer" && (
              <div className="shrink-0 border-t border-border p-3">
                <button
                  type="button"
                  onClick={enviarProCliente}
                  disabled={enviandoCliente}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-lone-success-bg border border-lone-success-border hover:brightness-105 transition-all text-xs font-semibold text-lone-success disabled:opacity-50"
                  title="O CS manda as artes deste card no grupo do WhatsApp do cliente com uma mensagem pedindo aprovação"
                >
                  <Send size={13} /> {enviandoCliente ? "Enviando…" : "📤 Enviar pro cliente"}
                </button>
              </div>
            )}
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

            {/* Status selector */}
            <div>
              <Label className="block mb-2">Status</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (opt.value === status) return;
                      const prev = status;
                      setStatus(opt.value);
                      // Status salva automaticamente ao clicar — dispensa "Salvar alterações" (pedido
                      // do social). Se a gravação falhar, reverte o pill (store também faz rollback) e avisa,
                      // pra o pill não divergir do board nem reaplicar valor errado num "Salvar" depois.
                      updateContentCard(card.id, { status: opt.value, statusChangedAt: new Date().toISOString() })
                        .catch(() => {
                          setStatus(prev);
                          pushNotification("system", "Falha ao salvar status", `Não deu pra mudar o status de "${card.title}". Tente de novo.`, card.clientId);
                        });
                    }}
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

            {/* Posting date — OBRIGATÓRIA (o agente CS acompanha a pauta por ela) */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Calendar size={12} />
                Data de Postagem <span className="text-destructive">*</span>
              </Label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`bg-muted border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring ${dueDate ? "border-border" : "border-destructive/50"}`}
              />
              {!dueDate && (
                <p className="text-[10px] text-destructive mt-1">
                  Defina quando esse post vai ao ar — obrigatório pra equipe e pro agente acompanharem a pauta.
                </p>
              )}
            </div>

            {/* Briefing — editável estilo Trello (clique pra editar) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1.5">
                  <FileText size={12} />
                  Briefing / Descrição
                </Label>
                {!editingBriefing && briefing && (
                  <button
                    type="button"
                    onClick={() => setEditingBriefing(true)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    Editar
                  </button>
                )}
              </div>

              {editingBriefing ? (
                <div className="space-y-2">
                  <MarkdownEditor
                    value={briefing}
                    onChange={setBriefing}
                    placeholder={"Use markdown:\n**negrito**, *itálico*, # título\n- item de lista\n[link](https://...)\n\nDigite o briefing — produto, benefícios, CTA, tom de voz..."}
                    minHeight={140}
                    autoFocus
                    className="bg-muted"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveBriefing}
                      className="text-xs px-3 py-1.5 rounded-md bg-primary hover:bg-primary text-primary-foreground font-medium transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setBriefing(htmlToMarkdown(card.briefing ?? "")); setEditingBriefing(false); }}
                      className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : briefing ? (
                <div
                  onClick={() => setEditingBriefing(true)}
                  className="bg-muted border border-border rounded-lg px-4 py-3 cursor-text hover:border-primary/30 transition-colors"
                  title="Clique pra editar"
                >
                  <MarkdownView source={briefing} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingBriefing(true)}
                  className="w-full text-left bg-muted border border-dashed border-border rounded-lg px-4 py-3 text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
                >
                  + Adicionar briefing / descrição
                </button>
              )}
            </div>

            {/* Caption */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1.5">
                  <AlignLeft size={12} />
                  Legenda / Caption
                </Label>
                {role !== "designer" && (
                  <button
                    type="button"
                    onClick={gerarLegendaIA}
                    disabled={genLegenda}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
                    title="A IA escreve a legenda no tom do cliente, usando o briefing"
                  >
                    <MessageSquare size={11} /> {genLegenda ? "Gerando…" : "✍️ Gerar legenda (IA)"}
                  </button>
                )}
              </div>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                placeholder="Digite a legenda que será publicada… ou use o ✍️ Gerar legenda (IA)"
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

          </div>

          {/* Right: Comments / Activity sidebar (Trello-style) */}
          <div className="w-80 border-l border-border flex flex-col shrink-0 bg-background/40">
            <div className="px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MessageSquare size={14} className="text-primary" />
                Comentários e atividade
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {comments.length === 0 ? "Nenhum comentário ainda" : `${comments.length} ${comments.length === 1 ? "comentário" : "comentários"}`}
              </p>
            </div>

            {/* Comment input no topo (Trello-style) */}
            <div className="px-5 py-3 border-b border-border shrink-0">
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
              {mentionable.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-2">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><AtSign size={10} /> Marcar:</span>
                  {mentionable.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggleMention(m.name)}
                      title={`Marcar ${m.name} (${m.role})`}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                        mentions.includes(m.name)
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-muted text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {m.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Activity feed scrollável */}
            <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Inicie a discussão sobre este conteúdo. Comentários ficam vinculados ao card e aparecem na timeline do cliente.
                </p>
              ) : (
                comments.map((cmt) => (
                  <div key={cmt.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className={`text-[10px] font-bold ${ROLE_COLORS[cmt.role] ?? "text-primary"}`}>
                        {cmt.author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground">{cmt.author}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(cmt.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {cmt.text.split(/(@[^\s@]+)/g).map((part, i) =>
                          part.startsWith("@")
                            ? <span key={i} className="text-primary font-semibold">{part}</span>
                            : part
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>
          </div>
        </div>

        {/* Approval Actions — visible when card is in approval or client_approval */}
        {(card.status === "approval" || card.status === "client_approval") && (
          <div className="px-6 py-4 border-t border-border space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-foreground">Ação de Aprovação</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-lone-warning-bg text-lone-warning border border-lone-warning-border font-medium">
                {card.status === "approval" ? "Aprovação Social Media" : "Aprovação Cliente"}
              </span>
            </div>

            {/* Drive link if available */}
            {card.imageUrl && card.imageUrl.includes("drive.google.com") && (
              <a
                href={card.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/[0.04] border border-primary/20 hover:border-primary/40 transition-all text-xs text-primary"
              >
                <ExternalLink size={12} /> Abrir arte no Drive
              </a>
            )}

            {/* Ferramentas de conferência por IA — par compacto lado a lado (antes eram 3 barras
                full-width empilhadas, ficava pesado). Os resultados abrem full-width logo abaixo. */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Conferir com IA (opcional)</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={revisarArteIA}
                  disabled={revisando}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/[0.06] border border-primary/20 hover:border-primary/40 transition-all text-xs text-primary disabled:opacity-50"
                  title="A IA confere logo, preço legível, palavra proibida, erro de texto e aderência ao briefing"
                >
                  <ImageIcon size={13} /> {revisando ? "Revisando…" : "Revisar arte"}
                </button>
                <button
                  type="button"
                  onClick={revisarPostIA}
                  disabled={revisandoPost}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/[0.06] border border-primary/20 hover:border-primary/40 transition-all text-xs text-primary disabled:opacity-50"
                  title="A IA revisa o post COMPLETO: a legenda bate com a arte? preço/claim inventado? palavra proibida? português?"
                >
                  <CheckCircle size={13} /> {revisandoPost ? "Revisando…" : "Revisão final"}
                </button>
              </div>

              {/* Resultado — Revisar arte */}
              {revisao && (
                <div className={`rounded-lg border p-3 text-xs ${revisao.ok ? "border-lone-success-border/30 bg-lone-success-bg/10 text-lone-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                  <div className="font-semibold flex items-center gap-1.5">
                    {revisao.ok ? <CheckCircle size={13} /> : <XCircle size={13} />} {revisao.resumo}
                  </div>
                  {revisao.problemas.length > 0 && (
                    <ul className="mt-1.5 space-y-1 list-disc list-inside text-foreground/90">
                      {revisao.problemas.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  )}
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Sugestão da IA — a decisão é sua.</p>
                </div>
              )}

              {/* Resultado — Revisão final do post */}
              {revisaoPost && (
                <div className={`rounded-lg border p-3 text-xs ${revisaoPost.aprovado ? "border-lone-success-border/30 bg-lone-success-bg/10 text-lone-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                  <div className="font-semibold flex items-center gap-1.5">
                    {revisaoPost.aprovado ? <CheckCircle size={13} /> : <XCircle size={13} />} {revisaoPost.resumo}
                  </div>
                  {revisaoPost.problemas.length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-foreground/90">
                      {revisaoPost.problemas.map((p, i) => (
                        <li key={i}>
                          <span className={`font-semibold uppercase text-[10px] ${p.gravidade === "alta" ? "text-destructive" : "text-lone-warning"}`}>[{p.gravidade}]</span>{" "}
                          <span className="text-[10px] text-muted-foreground">({p.area})</span> {p.detalhe}
                          {p.sugestao && <span className="block pl-4 text-muted-foreground">→ {p.sugestao}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {revisaoPost.legenda_corrigida && (
                    <button
                      type="button"
                      onClick={() => { setCaption(revisaoPost.legenda_corrigida!); setRevisaoPost({ ...revisaoPost, legenda_corrigida: null }); }}
                      className="mt-2 w-full px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/80 transition-all"
                    >
                      ✍️ Aplicar legenda corrigida (revise e salve)
                    </button>
                  )}
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Sugestão da IA — a decisão é sua.</p>
                </div>
              )}
            </div>

            {!showRejectInput ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { approveContent(card.id, currentUser); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-all"
                >
                  <CheckCircle size={14} /> Aprovar Arte
                </button>
                <button
                  onClick={() => setShowRejectInput(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 hover:bg-destructive/20 hover:border-destructive/40 transition-all"
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
                  className="w-full bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive/40 outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { if (rejectReason.trim()) { rejectContent(card.id, currentUser, rejectReason.trim()); onClose(); } }}
                    disabled={!rejectReason.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 hover:bg-destructive/20 transition-all disabled:opacity-30"
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
          const cl = clients.find((c) => c.id === card.clientId);
          return cl?.driveLink ? (
            <div className="px-6 py-3 border-t border-border">
              <a href={cl.driveLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-primary/[0.06] border border-primary/[0.15] hover:bg-primary/[0.12] hover:border-primary/[0.3] transition-all group">
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-all">
                  <ExternalLink size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">Abrir Drive — {cl.name}</p>
                  <p className="text-[10px] text-muted-foreground">Acesse logos, fotos e arquivos em alta resolucao</p>
                </div>
              </a>
            </div>
          ) : null;
        })()}

        {/* 🎨 Briefing da arte gerado pela IA — EDITÁVEL; ao Solicitar Design, vai no pedido. */}
        {role !== "designer" && !card.designRequestId && !card.designerDeliveredAt && designBrief !== null && (
          <div className="px-6 pb-3">
            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-primary">🎨 Briefing da arte (IA) — revise antes de enviar</span>
                <button type="button" onClick={() => setDesignBrief(null)} className="text-[10px] text-muted-foreground hover:text-foreground">descartar</button>
              </div>
              <Textarea
                value={designBrief}
                onChange={(e) => setDesignBrief(e.target.value)}
                rows={8}
                className="text-xs font-mono"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Ao clicar em "Solicitar Design", ESTE texto vai como briefing pro designer.</p>
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t border-border">
          {/* Solicitar Design — only for social/traffic/admin, NOT for designer */}
          {role !== "designer" && !card.designRequestId && !card.designerDeliveredAt && (
            <div className="mr-auto flex items-center gap-2">
            <Button
              variant="outline"
              disabled={genBrief}
              className="flex items-center gap-2 text-primary border-primary/30 hover:bg-primary/10"
              title="A Lone monta o briefing da arte (objetivo, texto na arte, elementos visuais, o que não pode) pro designer executar sem perguntar nada"
              onClick={gerarBriefingDesignIA}
            >
              {genBrief ? "Gerando…" : "🎨 Briefing pro designer (IA)"}
            </Button>
            <Button
              variant="outline"
              disabled={sendingDesign}
              className="flex items-center gap-2 text-[var(--chart-4)] border-[var(--chart-4)]/30 hover:bg-[var(--chart-4)]/10"
              onClick={() => {
                if (sendingDesign) return;          // anti-duplo-clique: evita demanda duplicada
                // Não manda pro designer sem data de postagem — toda demanda precisa de pauta datada.
                if (!dueDate) {
                  pushNotification("system", "Falta a data de postagem", `Defina quando "${card.title}" vai ao ar antes de mandar pro designer.`, card.clientId);
                  return;
                }
                setSendingDesign(true);
                addDesignRequest({
                  title: `Arte: ${card.title}`,
                  clientId: card.clientId,
                  clientName: card.clientName,
                  requestedBy: currentUser,
                  priority: card.priority || "medium",
                  status: "queued",
                  format: card.format || "Post Feed",
                  // Briefing gerado pela Lone (revisado no textarea) tem prioridade; senão, o do card.
                  briefing: (designBrief && designBrief.trim()) || card.briefing || card.observations || `Criar arte para: ${card.title}`,
                  contentCardId: card.id, // vincula a demanda ao card já na criação (link à prova de falha)
                  deadline: dueDate,      // data de postagem do card = prazo da arte pro designer ver
                })
                  .then((req) => {
                    updateContentCard(card.id, { designRequestId: req.id });
                    pushNotification("content", "Design solicitado", `Pedido de arte para "${card.title}" enviado ao designer.`, card.clientId, card.id);
                  })
                  .catch(() => {
                    pushNotification("system", "Falha ao solicitar design", `Não deu pra enviar "${card.title}" pro designer. Tente de novo.`, card.clientId);
                  })
                  .finally(() => setSendingDesign(false));
              }}
            >
              <Palette size={14} />
              {sendingDesign ? "Enviando..." : "Solicitar Design"}
            </Button>
            </div>
          )}
          {/* Designer sees "Enviar Arte" instead */}
          {role === "designer" && !card.designerDeliveredAt && (
            <span className="mr-auto text-xs text-primary flex items-center gap-1.5">
              <Upload size={12} /> Use o botao "Enviar Arte" no kanban
            </span>
          )}
          {role !== "designer" && card.designRequestId && !card.designerDeliveredAt && (
            <span className="mr-auto text-xs text-lone-warning flex items-center gap-1.5">
              <Palette size={12} /> Aguardando design...
            </span>
          )}
          {card.clientApprovedAt && role !== "designer" && (
            <span className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-lone-success px-2.5 py-1 rounded-lg bg-lone-success-bg border border-lone-success-border">
              🎉 Cliente aprovou — pode agendar/postar!
            </span>
          )}
          {card.designerDeliveredAt && !card.socialConfirmedAt && role !== "designer" && (
            <Button
              variant="outline"
              className="mr-auto flex items-center gap-2 text-lone-success border-lone-success-border hover:bg-lone-success-bg"
              onClick={() => {
                // Confirmar a arte já AVANÇA o card pra Aprovação (Social Media) se ainda estiver em
                // produção — antes só marcava confirmado e o card ficava parado na mesma coluna.
                const advance = ["ideas", "script", "in_production", "blocked"].includes(status);
                updateContentCard(card.id, {
                  socialConfirmedAt: new Date().toISOString(),
                  socialConfirmedBy: currentUser,
                  ...(advance ? { status: "approval" } : {}),
                });
                if (advance) setStatus("approval");
                toast.success(advance ? "Arte confirmada — card movido para Aprovação Social Media." : "Arte confirmada.");
              }}
            >
              <CheckCircle size={14} />
              Confirmar Arte
            </Button>
          )}
          {card.socialConfirmedAt && role !== "designer" && (
            <span className="mr-auto flex items-center gap-1.5 text-sm font-medium text-lone-success px-2.5 py-1 rounded-lg bg-lone-success-bg border border-lone-success-border">
              <CheckCircle size={14} /> Arte confirmada{card.socialConfirmedBy ? ` por ${card.socialConfirmedBy}` : ""}
            </span>
          )}
          {/* Arquivar demanda — soft-delete (some do quadro, fica recuperável). Não pro designer. */}
          {role !== "designer" && (
            <Button
              variant="ghost"
              onClick={handleArchive}
              disabled={archiving}
              title="Arquivar: some do quadro mas fica salvo (recuperável em Arquivadas)"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Archive size={14} /> {archiving ? "Arquivando..." : "Arquivar"}
            </Button>
          )}
          <Button variant="ghost" onClick={requestClose}>
            Fechar
          </Button>
          <Button
            onClick={handleSave}
            className={`flex items-center gap-2 ${saved ? "bg-primary hover:bg-primary" : ""}`}
          >
            <Save size={14} />
            {saved ? "Salvo!" : "Salvar alteracoes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
