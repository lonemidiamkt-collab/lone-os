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
import EnviarProClienteModal from "@/components/conteudo/EnviarProClienteModal";
import { podeEnviarAoCliente } from "@/lib/cs/envio-aprovacao";
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

/** Uma arte que a revisão por IA tentou ver. */
type ArteVista = { n: number; url: string; vista: boolean; motivo?: string | null };

/**
 * O QUE A IA VIU (24/10/2026, 2.10): a revisão dizia "sem erros" sem dizer sobre qual imagem — e
 * era a referência do social. Agora mostra as miniaturas das artes conferidas e marca as que não
 * conseguiu ver, com a nota do que ficou de fora.
 */
function ArtesVistas({ artes, nota }: { artes?: ArteVista[]; nota?: string | null }) {
  if (!artes?.length && !nota) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {!!artes?.length && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Artes que a IA conferiu">
          {artes.map((a) => (
            <li key={`${a.n}-${a.url}`} className="relative w-12 h-12 rounded-md overflow-hidden border border-border bg-muted" title={a.vista ? `Arte ${a.n}: conferida` : `Arte ${a.n}: NÃO conferida (${a.motivo ?? "erro"})`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura da arte conferida */}
              <img src={a.url} alt={`Arte ${a.n}`} className={`w-full h-full object-cover ${a.vista ? "" : "opacity-40"}`} />
              <span className={`absolute bottom-0 left-0 text-[9px] px-1 rounded-tr ${a.vista ? "bg-overlay text-overlay-foreground" : "bg-destructive text-destructive-foreground"}`}>
                {a.vista ? a.n : `${a.n} ✕`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {nota && <p className="text-[10px] text-muted-foreground leading-snug">{nota}</p>}
    </div>
  );
}

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
  // SUGESTÃO, NÃO SUBSTITUIÇÃO (24/10/2026, 2.11): "Gerar legenda" trocava a legenda digitada sem
  // perguntar e sem volta. Agora a sugestão aparece ao lado; "Usar" troca e oferece "Desfazer".
  const [sugestaoLegenda, setSugestaoLegenda] = useState<{ legenda: string; hashtags: string; nota: string | null } | null>(null);
  const [legendaAnterior, setLegendaAnterior] = useState<{ caption: string; hashtags: string; origem: string } | null>(null);
  const [erroLegenda, setErroLegenda] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);         // revisando a arte por IA
  const [revisao, setRevisao] = useState<{ ok: boolean; problemas: string[]; resumo: string; artes?: ArteVista[]; nota?: string | null } | null>(null);
  // Aprovar / pedir alteração (24/10/2026, 2.5): o card só fecha depois do sim do servidor.
  const [aprovando, setAprovando] = useState(false);
  const [enviandoAlteracao, setEnviandoAlteracao] = useState(false);
  const [erroAprovacao, setErroAprovacao] = useState<string | null>(null);
  const [genBrief, setGenBrief] = useState(false);           // gerando briefing da arte pro designer
  const [designBrief, setDesignBrief] = useState<string | null>(null); // briefing gerado (EDITÁVEL antes de enviar)
  const [revisandoPost, setRevisandoPost] = useState(false); // revisão FINAL do post por IA
  const [revisaoPost, setRevisaoPost] = useState<{
    aprovado: boolean;
    problemas: { gravidade: string; area: string; detalhe: string; sugestao: string | null }[];
    resumo: string;
    legenda_corrigida: string | null;
    artes?: ArteVista[];
    nota?: string | null;
  } | null>(null);
  // 📤 Enviar as artes ENTREGUES pro grupo do cliente aprovar (pelo CS). Disparo humano, com PRÉVIA
  // (21/10/2026): era um window.confirm só com o nome do cliente — sem ver artes, texto nem grupo,
  // e clicar de novo duplicava no grupo. Agora abre EnviarProClienteModal. Arte não entregue ou com
  // alteração pedida não vai (a versão reprovada ia ao cliente) — o botão diz o porquê.
  const [enviarAberto, setEnviarAberto] = useState(false);
  const permissaoEnvio = podeEnviarAoCliente({
    entregueEm: card.designerDeliveredAt, alteracaoPendenteEm: card.alteracaoPendenteEm, arquivadoEm: card.archivedAt,
  });

  // ✍️ Legenda pronta por IA: usa o briefing do cliente e AS ARTES DA ENTREGA (todas, na ordem —
  // antes só a capa) pra escrever gancho+corpo+CTA+hashtags. Vira SUGESTÃO ao lado do campo.
  async function gerarLegendaIA() {
    setGenLegenda(true); setErroLegenda(null);
    const r = await chamar<{ legenda?: string; hashtags?: string; nota?: string | null }>("/api/cs/legenda", { cardId: card.id });
    setGenLegenda(false);
    if (!r.ok || !r.data?.legenda) { setErroLegenda(`Não consegui gerar a legenda: ${r.erro ?? "a IA não devolveu texto"}. Tente de novo.`); return; }
    setSugestaoLegenda({ legenda: r.data.legenda, hashtags: r.data.hashtags ?? "", nota: r.data.nota ?? null });
  }

  /** Troca a legenda guardando a anterior — "Desfazer" volta exatamente ao que estava digitado. */
  function usarLegenda(nova: { legenda: string; hashtags?: string | null }, origem: string) {
    setLegendaAnterior({ caption, hashtags, origem });
    setCaption(nova.legenda);
    if (nova.hashtags) setHashtags(nova.hashtags);
  }
  function desfazerLegenda() {
    if (!legendaAnterior) return;
    setCaption(legendaAnterior.caption);
    setHashtags(legendaAnterior.hashtags);
    setLegendaAnterior(null);
  }

  // 🔍 Revisão de arte por IA: confere TODAS as artes entregues contra o briefing antes de ir ao
  // cliente (24/10/2026, 2.10: pegava a 1ª imagem — em geral a referência) e mostra quais viu.
  async function revisarArteIA() {
    setRevisando(true); setRevisao(null);
    const r = await chamar<{ ok: boolean; problemas: string[]; resumo: string; artes?: ArteVista[]; nota?: string | null }>("/api/cs/revisar-arte", { cardId: card.id });
    setRevisando(false);
    if (r.ok && r.data) setRevisao(r.data);
    else setRevisao({ ok: false, problemas: [r.erro ?? "Não consegui revisar."], resumo: "Revisão não rodou — confira à mão" });
  }

  // 🎨 Briefing da arte pro designer, por IA — gera e deixa EDITÁVEL; vai no pedido de design.
  async function gerarBriefingDesignIA() {
    setGenBrief(true);
    const r = await chamar<{ briefing?: string }>("/api/cs/briefing-design", { cardId: card.id });
    setGenBrief(false);
    if (r.ok && r.data?.briefing) setDesignBrief(r.data.briefing);
    else pushNotification("system", "Não deu pra gerar o briefing da arte", r.erro ?? "A IA não devolveu texto. Tente de novo.", card.clientId);
  }

  // ✅ Revisão FINAL do post (arte + legenda + hashtags) por IA — o pre-flight antes de ir ao cliente.
  async function revisarPostIA() {
    setRevisandoPost(true); setRevisaoPost(null);
    // Manda a legenda/hashtags ATUAIS do editor (podem não estar salvas ainda) — senão a IA
    // revisaria a versão velha do banco e a "legenda corrigida" sobrescreveria a nova.
    const r = await chamar<NonNullable<typeof revisaoPost>>("/api/cs/revisar-post", { cardId: card.id, caption, hashtags });
    setRevisandoPost(false);
    if (r.ok && r.data) setRevisaoPost(r.data);
    else setRevisaoPost({ aprovado: false, problemas: [{ gravidade: "alta", area: "legenda", detalhe: r.erro ?? "Não consegui revisar.", sugestao: null }], resumo: "Revisão não rodou — confira à mão", legenda_corrigida: null });
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
  // 24/10/2026 (2.5): fechava direto, sem o aviso de não salvo — a legenda digitada sumia junto.
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await updateContentCard(card.id, { archivedAt: new Date().toISOString() });
    } catch {
      setArchiving(false); // o store já avisou
      return;
    }
    setArchiving(false);
    pushNotification("content", "Demanda arquivada", `"${card.title}" saiu do quadro. Recupere em Arquivadas.`, card.clientId);
    requestClose("A demanda foi arquivada.");
  };

  // Aprovar / Solicitar alteração (24/10/2026, 2.5): fechavam o card no clique — sem o aviso de não
  // salvo, e se a gravação falhasse o motivo digitado já tinha sumido. Agora esperam o servidor:
  // deu certo → passa pelo aviso de não salvo; falhou → o card fica aberto com tudo preenchido.
  const aprovarArte = async () => {
    if (aprovando) return;
    setAprovando(true); setErroAprovacao(null);
    const ok = await approveContent(card.id, currentUser);
    setAprovando(false);
    if (!ok) { setErroAprovacao("Não consegui aprovar a arte — nada mudou. Confira a conexão e tente de novo."); return; }
    requestClose("A arte foi aprovada.");
  };
  const enviarAlteracao = async () => {
    const motivo = rejectReason.trim();
    if (!motivo || enviandoAlteracao) return;
    setEnviandoAlteracao(true); setErroAprovacao(null);
    const ok = await rejectContent(card.id, currentUser, motivo);
    setEnviandoAlteracao(false);
    if (!ok) { setErroAprovacao("Não consegui enviar o pedido de alteração — o motivo continua aqui. Tente de novo."); return; }
    setShowRejectInput(false); setRejectReason("");
    requestClose("O pedido de alteração foi para o designer.");
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

  // O que não foi salvo, em palavras — o aviso diz o que vai se perder.
  const naoSalvos = [
    title !== (card.title ?? "") && "título",
    dueDate !== (card.dueDate ?? "") && "data de postagem",
    briefing !== htmlToMarkdown(card.briefing ?? "") && "briefing",
    caption !== (card.caption ?? "") && "legenda",
    hashtags !== (card.hashtags ?? "") && "hashtags",
    observations !== (card.observations ?? "") && "observações",
  ].filter(Boolean) as string[];

  /** `feito` = o que acabou de acontecer (ex.: "A arte foi aprovada."), dito antes da pergunta. */
  const requestClose = (feito?: string) => {
    if (isDirty) {
      const pergunta = `Você tem alterações não salvas neste card (${naoSalvos.join(", ") || "campos editados"}). Descartar e fechar?`;
      if (!window.confirm(feito ? `${feito}\n\n${pergunta}\n\n(Cancelar = o card fica aberto para você salvar.)` : pergunta)) return;
    }
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
                Sempre visível (não rola) quando há arte e não pro designer. Só habilita com a arte
                ENTREGUE e sem alteração pedida — desabilitado, diz o porquê (21/10/2026). */}
            {(((attachments?.length ?? 0) > 0) || card.imageUrl) && role !== "designer" && (
              <div className="shrink-0 border-t border-border p-3 space-y-1.5">
                <button
                  type="button"
                  onClick={() => setEnviarAberto(true)}
                  disabled={!permissaoEnvio.ok}
                  aria-describedby={!permissaoEnvio.ok ? "motivo-envio-cliente" : undefined}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-lone-success-bg border border-lone-success-border hover:brightness-105 transition-all text-xs font-semibold text-lone-success disabled:opacity-50 disabled:hover:brightness-100"
                  title="Mostra a prévia (artes, texto e grupo) antes de o CS mandar no grupo do WhatsApp do cliente"
                >
                  <Send size={13} /> Enviar pro cliente
                </button>
                {!permissaoEnvio.ok && (
                  <p id="motivo-envio-cliente" className="text-[10px] leading-snug text-muted-foreground text-center">{permissaoEnvio.motivo}</p>
                )}
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
              {/* A coluna do meio do card é estreita (~370 px): a sugestão fica logo abaixo do campo, como
                  painel à parte — a legenda digitada continua intacta até "Usar". */}
              <div className="space-y-2">
                <Textarea
                  value={caption}
                  onChange={(e) => { setCaption(e.target.value); setLegendaAnterior(null); }}
                  rows={4}
                  placeholder="Digite a legenda que será publicada… ou use o Gerar legenda (IA)"
                  aria-label="Legenda"
                />
                {/* A sugestão da IA fica AO LADO — nada é trocado sem a pessoa clicar em "Usar". */}
                {sugestaoLegenda && (
                  <div className="rounded-lg border border-lone-info-border bg-lone-info-bg p-3 space-y-2" aria-label="Sugestão de legenda da IA">
                    <p className="text-[11px] font-medium text-primary">Sugestão da IA</p>
                    {sugestaoLegenda.nota && <p className="text-[10px] text-muted-foreground leading-snug">{sugestaoLegenda.nota}</p>}
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{sugestaoLegenda.legenda}</p>
                    {sugestaoLegenda.hashtags && <p className="text-[11px] text-muted-foreground break-words">{sugestaoLegenda.hashtags}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button type="button"
                        onClick={() => { usarLegenda(sugestaoLegenda, "sugestão da IA"); setSugestaoLegenda(null); }}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90">
                        {caption.trim() ? "Usar no lugar da atual" : "Usar esta legenda"}
                      </button>
                      <button type="button" onClick={() => setSugestaoLegenda(null)}
                        className="text-[11px] px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                        Descartar
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {legendaAnterior && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" role="status">
                  Legenda trocada ({legendaAnterior.origem}) — ainda não salva.
                  <button type="button" onClick={desfazerLegenda} className="px-2 py-0.5 rounded-md border border-border bg-card text-foreground hover:border-primary">
                    Desfazer
                  </button>
                </p>
              )}
              {erroLegenda && (
                <p className="mt-1.5 text-[11px] text-destructive" role="alert">{erroLegenda}</p>
              )}
            </div>

            {/* Hashtags */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Hash size={12} />
                Hashtags
              </Label>
              <Textarea
                value={hashtags}
                onChange={(e) => { setHashtags(e.target.value); setLegendaAnterior(null); }}
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
                  <ArtesVistas artes={revisao.artes} nota={revisao.nota} />
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
                  <ArtesVistas artes={revisaoPost.artes} nota={revisaoPost.nota} />
                  {revisaoPost.legenda_corrigida && (
                    <button
                      type="button"
                      // Com "Desfazer" (24/10/2026, 2.11): trocava a legenda sem volta.
                      onClick={() => { usarLegenda({ legenda: revisaoPost.legenda_corrigida! }, "legenda corrigida da revisão final"); setRevisaoPost({ ...revisaoPost, legenda_corrigida: null }); }}
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
                  type="button"
                  onClick={() => void aprovarArte()}
                  disabled={aprovando}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all disabled:opacity-60"
                >
                  <CheckCircle size={14} /> {aprovando ? "Aprovando…" : "Aprovar Arte"}
                </button>
                <button
                  type="button"
                  onClick={() => { setErroAprovacao(null); setShowRejectInput(true); }}
                  disabled={aprovando}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lone-danger-bg text-destructive text-xs font-medium border border-lone-danger-border hover:border-destructive transition-all disabled:opacity-60"
                >
                  <XCircle size={14} /> Solicitar Alteração
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void enviarAlteracao(); } }}
                  placeholder="Descreva o motivo da alteração..."
                  aria-label="Motivo da alteração"
                  disabled={enviandoAlteracao}
                  className="w-full bg-lone-danger-bg border border-lone-danger-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive outline-none disabled:opacity-60"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    // Cancelar com motivo escrito pergunta antes de apagar (o texto é trabalho da pessoa).
                    onClick={() => { if (rejectReason.trim() && !window.confirm("Descartar o motivo que você escreveu?")) return; setShowRejectInput(false); setRejectReason(""); setErroAprovacao(null); }}
                    disabled={enviandoAlteracao}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void enviarAlteracao()}
                    disabled={!rejectReason.trim() || enviandoAlteracao}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-lone-danger-bg text-destructive text-xs font-medium border border-lone-danger-border hover:border-destructive transition-all disabled:opacity-30"
                  >
                    <XCircle size={12} /> {enviandoAlteracao ? "Enviando…" : "Enviar Rejeição"}
                  </button>
                </div>
              </div>
            )}
            {erroAprovacao && (
              <p className="text-xs text-destructive" role="alert">{erroAprovacao}</p>
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
          <Button variant="ghost" onClick={() => requestClose()}>
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
        {enviarAberto && <EnviarProClienteModal card={card} onClose={() => setEnviarAberto(false)} />}
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
