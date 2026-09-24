"use client";

import { useState, useEffect } from "react";
import {
  Upload, Calendar, FileText, User, Tag,
  Save, ImageIcon, Hash, AlignLeft,
  Send, MessageSquare, CheckCircle, XCircle, ExternalLink, Archive, Palette,
} from "lucide-react";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { marcarMutacao } from "@/stores/useContentStore";
import { trilha } from "@/lib/obs/trilha";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRole } from "@/lib/context/RoleContext";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import type { ContentCard, CardAttachment } from "@/lib/types";
import CardArtAttachments, { MAX_ARTES } from "@/components/kanban/CardArtAttachments";
import EtapaDesign from "@/components/conteudo/EtapaDesign";
import EntregarArteModal from "@/components/conteudo/EntregarArteModal";
import MotivoModal from "@/components/conteudo/MotivoModal";
import { useProducao, type Pendencia } from "@/components/conteudo/useProducao";
import PreviaInstagram from "@/components/conteudo/PreviaInstagram";
import ParaAgendar from "@/components/conteudo/ParaAgendar";
import KitDaMarca from "@/components/conteudo/KitDaMarca";
import CobrarCliente from "@/components/conteudo/CobrarCliente";
import ComentariosDoCard from "@/components/conteudo/ComentariosDoCard";
import CardDoDesigner from "@/components/design/CardDoDesigner";
import { artesParaAgendar, legendaCompleta } from "@/lib/conteudo/previa";
import { ETAPAS, ROTULO_BLOQUEADO, corDoStatus, estaBloqueado, etapaDoStatus, infoDoStatus, statusNaEtapa, type Etapa } from "@/lib/conteudo/etapas";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
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


// Campo apagado vai como null: `x || undefined` sumia com a chave e o valor antigo ficava no banco.
const ouNulo = (v: string) => (v.trim() ? v : null);

interface Props {
  card: ContentCard;
  onClose: () => void;
  /**
   * Como o card abre. "arte" = o card do designer (briefing, referências, kit da marca e a entrega
   * na frente; legenda e agendamento recolhidos). Sem isto: o designer abre no modo arte e o resto
   * do time no card completo — cada um troca pelo botão do topo.
   */
  modo?: "arte" | "completo";
}

export default function ContentCardModal({ modo, ...props }: Props) {
  const { role } = useRole();
  const [escolhido, setEscolhido] = useState<"arte" | "completo" | null>(modo ?? null);
  const atual = escolhido ?? (role === "designer" ? "arte" : "completo");
  const podeModoArte = role === "designer" || role === "admin" || role === "manager";
  if (atual === "arte") {
    return <CardDoDesigner card={props.card} onClose={props.onClose} onVerCompleto={() => setEscolhido("completo")} />;
  }
  return <CardCompleto {...props} onModoArte={podeModoArte ? () => setEscolhido("arte") : undefined} />;
}

function CardCompleto({ card: cardProp, onClose, onModoArte }: Omit<Props, "modo"> & { onModoArte?: () => void }) {
  // CARD VIVO (18/09): a prop era um retrato do momento do clique. Depois de "A fazer" ou de anexar,
  // o store mudava (designRequestId, anexos, entrega) mas o modal seguia mostrando o retrato — o
  // botão "Solicitar Design" continuava lá, a arte não aparecia, e a pessoa clicava de novo.
  const cardVivo = useContentStore((s) => s.contentCards.find((c) => c.id === cardProp.id));
  const card = cardVivo ?? cardProp;
  const clients = useClientsStore((s) => s.clients);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const approveContent = useContentStore((s) => s.approveContent);
  const rejectContent = useContentStore((s) => s.rejectContent);
  const { mover } = useProducao();
  const [pendencia, setPendencia] = useState<Pendencia>(null);
  const pushNotification = useNotificationsStore((s) => s.push);
  const { role, currentUser } = useRole();
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
  // A etapa é a do card vivo (o store): mudar etapa grava na hora, pela regra da produção.
  const status = card.status;
  const [movendo, setMovendo] = useState(false);
  const [attachments, setAttachments] = useState<CardAttachment[] | null>(null); // null = carregando
  const [erroAnexos, setErroAnexos] = useState<string | null>(null);
  // O que a prévia do Instagram mostra: começa nos anexos carregados e acompanha o upload/remoção
  // (a grade de artes guarda o próprio estado e só avisa pelo onAttachmentsChange).
  const [artesPrevia, setArtesPrevia] = useState<CardAttachment[] | null>(null);
  const [tentativaAnexos, setTentativaAnexos] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState(false);
  const [archiving, setArchiving] = useState(false);
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
        toast.success(`Enviei ${d.enviadas}/${d.total} arte(s) pro grupo de ${card.clientName} aprovar.`);
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

  // Comentários REATIVOS: lê do store (não da prop estática) — só para a contagem do cabeçalho; a
  // conversa em si mora em ComentariosDoCard.
  const liveComments = useContentStore((s) => s.contentCards.find((c) => c.id === card.id)?.comments);
  const comments = liveComments ?? card.comments ?? [];

  // Carrega as artes (multi-arte) ao abrir o card
  // Falha NÃO vira lista vazia: "Nenhuma arte ainda" levava a pessoa a pedir de novo uma arte que existia.
  useEffect(() => {
    let alive = true;
    setAttachments(null); setErroAnexos(null); setArtesPrevia(null);
    chamar<{ attachments?: CardAttachment[] }>(`/api/cards/${card.id}/attachments`).then((r) => {
      if (!alive) return;
      if (!r.ok) { trilha("modal:anexos:erro", { id: card.id, status: r.status }); setErroAnexos(r.erro); return; }
      const l = r.data?.attachments ?? [];
      setAttachments(l);
      trilha("modal:aberto", { id: card.id, anexos: l.length, temDr: !!card.designRequestId, entregue: !!card.designerDeliveredAt, img: !!card.imageUrl });
    });
    return () => { alive = false; };
  }, [card.id, tentativaAnexos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reflete a mudança de arte no board na hora (capa = 1ª arte; sem arte = sem capa).
  const handleAttachmentsChange = (next: CardAttachment[]) => {
    const real = next.filter((a) => a.id !== "legacy");
    setArtesPrevia(real);
    const cover = next[0]?.url; // 1ª arte visível (real ou capa legada)
    marcarMutacao();
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

  const handleSave = async () => {
    // A data de postagem NÃO bloqueia mais o save — travar tudo fazia o social PERDER a edição
    // (briefing, legenda etc.). Salva o que foi editado e, se faltar a data, apenas AVISA: sem ela o
    // card fica invisível pro acompanhamento de pauta do agente CS. (Pedido do Roberto: não travar.)
    if (salvando) return;
    const updates = {
      observations: ouNulo(observations),
      briefing: ouNulo(briefing),
      caption: ouNulo(caption),
      hashtags: ouNulo(hashtags),
      dueDate: dueDate || null,
    } as unknown as Partial<ContentCard>;
    setSalvando(true);
    try {
      await updateContentCard(card.id, updates);
    } catch {
      return; // o store já avisou e desfez
    } finally {
      setSalvando(false);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    if (!dueDate) {
      pushNotification("system", "Salvei — só falta a data de postagem", `Defina quando "${card.title}" vai ao ar pra ele entrar no acompanhamento da pauta.`, card.clientId);
    }
  };

  const handleSaveBriefing = async () => {
    try {
      await updateContentCard(card.id, { briefing: ouNulo(briefing) } as unknown as Partial<ContentCard>);
    } catch {
      return; // editor fica aberto com o texto
    }
    setEditingBriefing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const salvarTitulo = async () => {
    const t = title.trim();
    setEditingTitle(false);
    if (!t || t === card.title) { setTitle(card.title ?? ""); return; }
    await updateContentCard(card.id, { title: t }).catch(() => setTitle(card.title ?? ""));
  };

  // Arquiva a DEMANDA (soft-delete): some do quadro ativo mas fica no banco, recuperável em "Arquivadas".
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await updateContentCard(card.id, { archivedAt: new Date().toISOString() });
      pushNotification("content", "Demanda arquivada", `"${card.title}" saiu do quadro. Recupere em Arquivadas.`, card.clientId);
      onClose();
    } catch {
      setArchiving(false); // o store já avisou
    }
  };

  const etapaAtual = infoDoStatus(status);
  const moverPara = async (destino: Etapa) => {
    if (movendo) return;
    setMovendo(true);
    try {
      const p = await mover(card, destino);
      if (p) setPendencia(p);
    } finally { setMovendo(false); }
  };

  // Tem edição não salva? (os campos que só persistem no "Salvar alterações".) Se sim, confirmar
  // antes de fechar — senão fechar/ESC/clique-fora descartava legenda/briefing digitados em silêncio.
  const isDirty =
    observations !== (card.observations ?? "") ||
    briefing !== htmlToMarkdown(card.briefing ?? "") ||
    title !== (card.title ?? "") ||
    caption !== (card.caption ?? "") ||
    hashtags !== (card.hashtags ?? "") ||
    dueDate !== (card.dueDate ?? "");

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
              <span className={`w-2 h-2 rounded-full ${corDoStatus(status)}`} />
              <span className="text-xs text-muted-foreground font-medium">{etapaAtual.rotulo}{estaBloqueado(status) ? ` · ${ROTULO_BLOQUEADO}` : ""}</span>
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
                    if (e.key === "Enter") void salvarTitulo();
                    if (e.key === "Escape") { setTitle(card.title ?? ""); setEditingTitle(false); }
                  }}
                  className="flex-1 text-lg font-semibold bg-surface border border-primary/40 rounded-lg px-2 py-1 text-foreground outline-none"
                />
                <button type="button" onClick={() => void salvarTitulo()}
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
          {onModoArte && (
            <button type="button" onClick={() => { if (!isDirty || window.confirm("Você tem alterações não salvas neste card. Descartar e trocar de modo?")) onModoArte(); }}
              title="Briefing, referências, kit da marca e a entrega na frente"
              className="shrink-0 mr-8 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
              <Palette size={13} className="text-chart-4" aria-hidden="true" /> Modo arte
            </button>
          )}
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
              {erroAnexos ? (
                <div className="flex flex-col items-center gap-2 py-6 px-2 border border-destructive/30 bg-destructive/10 rounded-lg text-center">
                  <p className="text-xs text-destructive">Não consegui carregar as artes: {erroAnexos}</p>
                  <button type="button" onClick={() => setTentativaAnexos((n) => n + 1)} className="text-[11px] px-2.5 py-1 rounded-md bg-muted border border-border text-foreground hover:border-primary/30">
                    Tentar de novo
                  </button>
                </div>
              ) : attachments === null ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Upload size={16} className="animate-pulse" />
                </div>
              ) : (
                <CardArtAttachments
                  cardId={card.id}
                  existingAttachments={attachments}
                  legacyImageUrl={card.imageUrl}
                  onAttachmentsChange={handleAttachmentsChange}
                  tipo={role === "designer" ? "entrega" : "referencia"}
                />
              )}
              <p className="text-[9px] text-muted-foreground text-center">
                PNG, JPEG, WebP, GIF — até 10MB, máx {MAX_ARTES} artes
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
                  <Send size={13} /> {enviandoCliente ? "Enviando…" : "Enviar pro cliente"}
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

            {/* Etapa — as seis do quadro de produção. Grava na hora, pela mesma regra do quadro:
                entrar em "Com o designer" pede a arte, voltar pra lá pede alteração, sair exige a entrega. */}
            <div>
              <Label className="block mb-2">Etapa</Label>
              <div className="flex flex-wrap gap-1.5">
                {ETAPAS.map((opt) => {
                  const ativa = etapaDoStatus(status) === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={movendo}
                      aria-pressed={ativa}
                      onClick={() => { if (!ativa) void moverPara(opt.id); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
                        ativa ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${opt.cor}`} />
                      {opt.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* A arte do card: pedido, designer, prazo, entregas, alterações — e as ações. */}
            <EtapaDesign card={card} briefingIa={designBrief} />

            {/* Kit da marca ao lado da tarefa de arte (Leva 7B, N16): logo, paleta, tom, o que não usar
                e as últimas aprovadas — o designer não precisa sair do card. */}
            {(role === "designer" || role === "admin" || role === "manager") && (
              <KitDaMarca clientId={card.clientId} cardId={card.id} compacto={role !== "designer"} />
            )}

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
                    <MessageSquare size={11} /> {genLegenda ? "Gerando…" : "Gerar legenda (IA)"}
                  </button>
                )}
              </div>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                placeholder="Digite a legenda que será publicada… ou use o Gerar legenda (IA)"
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

            {/* Prévia no Instagram (N13) e o que o mLabs pede (N14): legenda completa e as artes em .zip. */}
            {(() => {
              const cl = clients.find((c) => c.id === card.clientId);
              const imagens = artesParaAgendar(artesPrevia ?? attachments ?? [], card.imageUrl).map((a) => a.url);
              const legendaAoVivo = legendaCompleta(caption, hashtags);
              const salva = legendaCompleta(card.caption, card.hashtags);
              return (
                <details className="rounded-xl border border-border bg-muted/20" open={statusNaEtapa(card.status, "revisao", "com_cliente", "agendado")}>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">Prévia no Instagram e agendamento</summary>
                  <div className="px-4 pb-4 flex flex-col sm:flex-row gap-4 items-start">
                    <PreviaInstagram imagens={imagens} legenda={legendaAoVivo} usuario={cl?.instagramUser} avatar={cl?.logo} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        A moldura é a do feed (4:5). O Instagram mostra só o começo da legenda — o gancho precisa estar antes do “mais”.
                      </p>
                      <ParaAgendar cardId={card.id} caption={caption} hashtags={hashtags} temArte={imagens.length > 0} />
                      {legendaAoVivo !== salva && (
                        <p className="text-[11px] text-lone-warning">A legenda mudou e não foi salva — o .zip leva a versão salva. Salve antes de baixar.</p>
                      )}
                    </div>
                  </div>
                </details>
              );
            })()}

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

            {/* A conversa (campo em cima, marcar, lista) — a mesma do card do designer. */}
            <ComentariosDoCard card={card} className="flex-1 px-5 py-3" />
          </div>
        </div>

        {/* Approval Actions — visible when card is in approval or client_approval */}
        {statusNaEtapa(card.status, "revisao", "com_cliente") && (
          <div className="px-6 py-4 border-t border-border space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-foreground">Ação de Aprovação</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-lone-warning-bg text-lone-warning border border-lone-warning-border font-medium">
                {etapaAtual.rotulo}
              </span>
            </div>

            {/* Com o cliente há 24h/48h: rascunho de cobrança para copiar (N11). Nunca é enviado daqui. */}
            {role !== "designer" && (
              <CobrarCliente card={card} contato={clients.find((c) => c.id === card.clientId)?.contactName} variante="card" />
            )}

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
                <div className={`rounded-lg border p-3 text-xs ${revisao.ok ? "border-lone-success-border bg-lone-success-bg text-lone-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
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
                <div className={`rounded-lg border p-3 text-xs ${revisaoPost.aprovado ? "border-lone-success-border bg-lone-success-bg text-lone-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
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
                      Aplicar legenda corrigida (revise e salve)
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
                  <p className="text-[10px] text-muted-foreground">Acesse logos, fotos e arquivos em alta resolução</p>
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
                <span className="text-xs font-semibold text-primary">Briefing da arte (IA) — revise antes de enviar</span>
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
          {/* "Pedir arte" mora na seção Arte (Leva 5b). Aqui fica só o briefing por IA, que vai junto no pedido. */}
          {role !== "designer" && !card.designRequestId && !card.designerDeliveredAt && statusNaEtapa(card.status, "pauta") && (
            <Button
              variant="outline"
              disabled={genBrief}
              className="mr-auto flex items-center gap-2 text-primary border-primary/30 hover:bg-primary/10"
              title="A Lone monta o briefing da arte (objetivo, texto na arte, elementos visuais, o que não pode) pro designer executar sem perguntar nada"
              onClick={gerarBriefingDesignIA}
            >
              {genBrief ? "Gerando…" : "Briefing pro designer (IA)"}
            </Button>
          )}
          {card.clientApprovedAt && role !== "designer" && (
            <span className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-lone-success px-2.5 py-1 rounded-lg bg-lone-success-bg border border-lone-success-border">
              <CheckCircle size={14} aria-hidden="true" /> Cliente aprovou — pode agendar/postar!
            </span>
          )}
          {card.designerDeliveredAt && !card.socialConfirmedAt && role !== "designer" && (
            <Button
              variant="outline"
              className="mr-auto flex items-center gap-2 text-lone-success border-lone-success-border hover:bg-lone-success-bg"
              onClick={async () => {
                // Confirmar = "conferi a arte". A entrega já leva o card pra Revisão interna; card
                // antigo, entregue e ainda antes dela, é levado junto.
                const now = new Date().toISOString();
                try {
                  await updateContentCard(card.id, { socialConfirmedAt: now, socialConfirmedBy: currentUser });
                } catch {
                  return;
                }
                if (statusNaEtapa(card.status, "pauta", "com_designer")) await moverPara("revisao");
                else toast.success("Arte confirmada.");
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
            disabled={salvando}
            className="flex items-center gap-2"
          >
            <Save size={14} />
            {salvando ? "Salvando…" : saved ? "Salvo!" : "Salvar alterações"}
          </Button>
        </DialogFooter>
        {pendencia?.tipo === "entregar" && <EntregarArteModal card={pendencia.card} onClose={() => setPendencia(null)} />}
        {pendencia?.tipo === "alteracao" && (
          <MotivoModal tipo="alteracao" tituloCard={pendencia.card.title} onClose={() => setPendencia(null)}
            onConfirmar={async (motivo) => {
              try { await useContentStore.getState().transicaoDesign(pendencia.card.id, { tipo: "pedir_alteracao", motivo }); toast.success("Voltou pro designer com o pedido de alteração."); return true; }
              catch (err) { toast.error(err instanceof Error ? err.message : "Não consegui pedir a alteração."); return false; }
            }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
