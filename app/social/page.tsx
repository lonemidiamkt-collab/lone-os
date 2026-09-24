"use client";

import { toast } from "sonner";
import { trilha } from "@/lib/obs/trilha";
import Header from "@/components/Header";
import EmptyState from "@/components/ui/EmptyState";
import QuadroProducao from "@/components/conteudo/QuadroProducao";
import ContentCardModal from "@/components/ContentCardModal";
import CsAgentInbox from "@/components/cs/CsAgentInbox";
import DailyClosePanel from "@/components/social/DailyClosePanel";
import ResultadosTab from "@/components/social/ResultadosTab";
import ArchivedDemandsModal from "@/components/ArchivedDemandsModal";
import MateriaisResumo from "@/components/clients/MateriaisResumo";
import { MarkdownEditor } from "@/components/Markdown";
import KanbanErrorBoundary from "@/components/KanbanErrorBoundary";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { ETAPAS, ETAPAS_FINAIS, infoEtapa, statusDaEtapa, statusNaEtapa, type Etapa } from "@/lib/conteudo/etapas";
import { lerVista, type Vista } from "@/lib/conteudo/quadro";
import { slotsSegQuaSex, proximoSlot, chaveDaLinha } from "@/components/kanban/lote";
import type { ContentCard, Client, Priority } from "@/lib/types";
import { todaySP } from "@/lib/utils";
import {
  AlertTriangle, Calendar, Instagram, ImageIcon,
  UserPlus, X,
  Zap, BarChart2,
  Check, Plus, ChevronDown,
  Key, Eye, EyeOff, Save,
  Download, CheckCircle, ShieldCheck, AlertCircle, Layers, Trash2, Copy, Archive,
  Palette, Lock, UsersRound, Music, FolderOpen, FileText,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { imagensDoPaste, imagensDoDrop } from "@/lib/upload/imagens-coladas";
import CampoReferencias from "@/components/social/CampoReferencias";
import { useRole } from "@/lib/context/RoleContext";
// AppStateContext removed — all state from Zustand stores
import { useNav } from "@/lib/context/NavContext";
// SocialAuthModal removed — using global session auth only
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";

// ── Confetti ──────────────────────────────────────────────────────────────────

function Confetti() {
  const items = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: `${(i * 2.5) % 100}%`,
      top: `-${(i * 0.5) % 20}%`,
      color: ["var(--primary)", "var(--primary)", "var(--primary)", "var(--primary)", "var(--primary)", "var(--primary)"][i % 6],
      delay: `${(i * 0.05) % 2}s`,
      duration: `${1 + (i * 0.05) % 2}s`,
      rotate: `${(i * 9) % 360}deg`,
    })),
  []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {items.map((item, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-sm animate-bounce opacity-80"
          style={{
            left: item.left,
            top: item.top,
            backgroundColor: item.color,
            animationDelay: item.delay,
            animationDuration: item.duration,
            transform: `rotate(${item.rotate})`,
          }}
        />
      ))}
    </div>
  );
}

// ── Onboarding Complete Modal ─────────────────────────────────────────────────

interface OnboardingCompleteModalProps {
  client: Client;
  onMoveActive: () => void;
  /** Move para ativo e abre o Planejamento já no cliente (Radar + calendário estratégico). */
  onMoveActiveAndPlan: () => void;
  onClose: () => void;
}

function OnboardingCompleteModal({ client, onMoveActive, onMoveActiveAndPlan, onClose }: OnboardingCompleteModalProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 animate-fade-in">
        <div className="text-center mb-5">
          <CheckCircle size={32} className="mx-auto mb-3 text-primary" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Onboarding Concluído!</h3>
          <p className="text-sm text-muted-foreground">
            Deseja mover <span className="text-foreground font-semibold">{client.name}</span> para Ativo e já abrir o planejamento de conteúdo dele?
          </p>
        </div>
        <div className="space-y-2">
          <button
            onClick={onMoveActiveAndPlan}
            className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Mover para Ativo e planejar
          </button>
          <button
            onClick={onMoveActive}
            className="w-full px-4 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Apenas mover para Ativo
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-muted-foreground text-sm font-medium hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Content Card Modal ────────────────────────────────────────────────────

interface NewContentCardModalProps {
  defaultDate?: string;
  defaultClient?: Client;
  onClose: () => void;
}

function NewContentCardModal({ defaultDate, defaultClient, onClose }: NewContentCardModalProps) {
  const clients = useClientsStore((s) => s.clients);
  const addContentCard = useContentStore((s) => s.addContentCard);
  const { currentUser, role } = useRole();

  // Social media só vê seus clientes (carteira). Admin/manager/designer veem todos.
  // Mesma lógica do workspace selector da página /social.
  const visibleClients = useMemo(() => {
    if (role === "social") {
      return clients.filter((c) => c.assignedSocial === currentUser);
    }
    return clients;
  }, [clients, role, currentUser]);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(defaultClient?.id ?? "");
  const [format, setFormat] = useState("Post");
  const [priority, setPriority] = useState<ContentCard["priority"]>("medium");
  const [dueDate, setDueDate] = useState(defaultDate ?? "");
  const [dueTime, setDueTime] = useState("");
  const [briefing, setBriefing] = useState("");

  const selectedClient = visibleClients.find((c) => c.id === clientId);
  // Exige o cliente RESOLVIDO, não só o id preenchido: clientName é desnormalizado (aparece no
  // card e na busca do board), e id sem cliente na lista gravaria a demanda com o nome em branco.
  const canSubmit = title.trim() && clientId && selectedClient && dueDate && dueTime && priority;
  // O QUE FALTA, ONDE A PESSOA ESTÁ OLHANDO. O modal é longo: quem rola até o fim vê o botão
  // apagado e, logo acima, o aviso amarelo do Drive — e lê o aviso como se fosse o erro
  // ("erro para pedir arte", 14/09). O motivo real (sem horário) ficava lá em cima, fora da tela.
  const faltando = [
    !title.trim() && "título",
    !(clientId && selectedClient) && "cliente",
    !dueDate && "data de postagem",
    !dueTime && "horário",
  ].filter(Boolean) as string[];

  // REFERÊNCIA JÁ NA CRIAÇÃO (pedido do social, 03/08). Antes só dava pra anexar DEPOIS: criava a
  // demanda, reabria, e só então subia a imagem — três passos pra uma coisa só, e no meio disso o
  // designer já podia ter puxado o card sem a referência.
  // Sobe DEPOIS de criar porque o upload precisa do id do card; se o upload falhar, a demanda
  // continua criada (perder o card por causa de um anexo seria pior) e a pessoa é avisada.
  const [refs, setRefs] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [subindoRef, setSubindoRef] = useState(false);

  // Ctrl+V em qualquer ponto do modal. Só age quando veio imagem — colar texto no briefing segue
  // funcionando normal.
  const aoColar = (e: React.ClipboardEvent) => {
    const imgs = imagensDoPaste(e);
    if (!imgs.length) return;
    e.preventDefault();
    setRefs((r) => [...r, ...imgs]); setErroRef(null);
  };
  const [erroRef, setErroRef] = useState<string | null>(null);
  // Ler `erroRef` logo após o await devolveria o valor ANTIGO (state não muda no meio da função).
  const erroRefRef = useRef<string | null>(null);

  const anexarReferencias = async (cardId: string) => {
    if (!refs.length) return;
    setSubindoRef(true); setErroRef(null); erroRefRef.current = null;
    const { authedFetch } = await import("@/lib/supabase/authed-fetch");
    for (const f of refs) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("cardId", cardId);
      // O que o social anexa AQUI é referência pro designer, não arte pronta. Sem esta marca, a
      // publicação automática mandaria o print de referência pro Instagram do cliente.
      fd.append("tipo", "referencia");
      try {
        const r = await authedFetch("/api/upload-art", { method: "POST", body: fd });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch {
        const msg = `Demanda criada, mas a referência "${f.name}" não subiu. Abra o card e anexe de novo.`;
        erroRefRef.current = msg; setErroRef(msg);
      }
    }
    setSubindoRef(false);
  };

  const [criando, setCriando] = useState(false);
  const handleSubmit = async () => {
    trilha("novo-conteudo:submit", { canSubmit: !!canSubmit, subindoRef, criando, clientId: clientId || null, faltando });
    if (!canSubmit || subindoRef || criando) return;
    setCriando(true);
    try { await criarDeVerdade(); } finally { setCriando(false); }
  };
  const criarDeVerdade = async () => {
    // COM REFERÊNCIA, O MODAL ESPERA. Fechando na hora, o upload virava órfão: se falhasse,
    // ninguém via o aviso e a demanda ia pro designer sem a imagem — que é justamente o problema
    // que este campo veio resolver. Sem referência, fecha na hora como antes.
    const criado = await addContentCard({
      title: title.trim(),
      clientId,
      clientName: selectedClient?.name ?? "",
      socialMedia: role === "social" ? currentUser : (selectedClient?.assignedSocial ?? currentUser),
      status: statusDaEtapa("pauta"),
      priority,
      format,
      dueDate,
      dueTime,
      briefing: briefing.trim() || undefined,
    } as Omit<ContentCard, "id">, { criadoPor: currentUser }).catch((err: unknown) => {
      // Antes: .catch(() => null) e o modal fechava como se tivesse criado — a pessoa só descobria
      // quando o card não aparecia no quadro.
      toast.error(`Não consegui criar o card${err instanceof Error && err.message ? ` (${err.message})` : ""}. Nada foi salvo — tenta de novo.`);
      return null;
    });
    if (criado === null) return; // modal fica aberto com tudo preenchido
    trilha("novo-conteudo:criado", { id: criado?.id, refs: refs.length });
    if (criado?.id && refs.length) {
      await anexarReferencias(criado.id);
      trilha("novo-conteudo:refs", { id: criado.id, erro: erroRefRef.current });
      // Falhou algum anexo: mantém o modal aberto com o aviso — a demanda já existe, mas a pessoa
      // precisa saber que a referência não foi junto.
      if (erroRefRef.current) return;
    }
    setTitle("");
    setRefs([]);
    setClientId(defaultClient?.id ?? "");
    setFormat("Post");
    setPriority("medium");
    setDueDate(defaultDate ?? "");
    setDueTime("");
    setBriefing("");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onPaste={aoColar}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const i = imagensDoDrop(e); if (i.length) { setRefs((r) => [...r, ...i]); setErroRef(null); } }}
        className={`max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden ${arrastando ? "ring-2 ring-primary" : ""}`}
      >
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon size={16} className="text-primary" />
            Novo Conteúdo
          </DialogTitle>
          {defaultDate && (
            <p className="text-xs text-muted-foreground">Data: {defaultDate}</p>
          )}
        </DialogHeader>

        {/* TRÊS BLOCOS, NÃO DEZ CAMPOS IGUAIS. Antes tudo tinha o mesmo peso: o cliente (que
            decide a carteira e o briefing fixo) parecia tão secundário quanto o formato. Agora a
            pessoa lê "o quê / quando / como fazer" e sabe onde está. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-5 py-2">
          {/* Title */}
          <div>
            <Label className="mb-1.5 block">Título do Conteúdo *</Label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Post de segunda — dicas de verão"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          {/* Client */}
          <div>
            <Label className="mb-1.5 block">Cliente *</Label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione um cliente...</option>
              {visibleClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {role === "social" && visibleClients.length === 0 && (
              <p className="text-[10px] text-lone-warning mt-1">Você ainda não tem clientes na sua carteira. Fale com a gerência.</p>
            )}
          </div>

          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-1">Quando vai ao ar</p>

          {/* Format + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Formato</Label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {["Post", "Reels", "Story", "Carrossel", "BTS", "Destaque"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Urgência *</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ContentCard["priority"])}
                className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  priority === "critical" ? "border-destructive/50 bg-destructive/5" : priority === "high" ? "border-lone-warning-border bg-primary/5" : "border-input bg-background"
                }`}
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Urgente</option>
              </select>
            </div>
          </div>

          {/* Due date + time row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Data de Postagem *</Label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  !dueDate ? "border-destructive/30" : "border-input"
                }`}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Horário *</Label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  !dueTime ? "border-destructive/30" : "border-input"
                }`}
              />
            </div>
          </div>

          {(!dueDate || !dueTime) && (
            <p className="text-[10px] text-destructive -mt-3.5">
              Sem data e horário a demanda não segue pro designer.
            </p>
          )}

          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-1">Como fazer</p>

          {/* Briefing — Markdown editor (Trello-like) */}
          <div>
            <Label className="mb-1.5 block">Briefing / Descrição</Label>
            <MarkdownEditor
              value={briefing}
              onChange={setBriefing}
              placeholder={"Use markdown — **negrito**, *itálico*, listas, links\n\nDetalhes do conteúdo: produto, benefícios, CTA, tom de voz..."}
              minHeight={120}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Markdown puro. Designer vê formatado.</p>
          </div>

          {/* Referência JÁ aqui — antes só dava pra anexar reabrindo a demanda depois de criada. */}
          <CampoReferencias
            arquivos={refs}
            onChange={(f) => { setRefs(f); setErroRef(null); }}
            erro={erroRef}
            ocupado={subindoRef}
          />

          {/* Materiais do cliente (logo, versões, Drive/Figma) — no lugar do aviso "sem pasta Drive" que
              aparecia para todo cliente (drive_link vazio em 52/52) e mandava a pessoa para Clientes → Editar. */}
          {selectedClient && <MateriaisResumo clientId={selectedClient.id} clientName={selectedClient.name} />}

          {/* Client fixed briefing preview */}
          {selectedClient?.fixedBriefing && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-[10px] text-primary uppercase tracking-wider font-medium mb-1">Briefing Fixo — {selectedClient.name}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{selectedClient.fixedBriefing}</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 shrink-0 border-t border-border sm:justify-between">
          <p className="text-[11px] self-center text-muted-foreground" aria-live="polite">
            {faltando.length > 0 && <span className="text-destructive">Falta preencher: {faltando.join(", ")}.</span>}
            {faltando.length === 0 && subindoRef && "Subindo a referência…"}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || subindoRef || criando}>
              {criando ? "Criando…" : "Criar Conteúdo"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Batch Create Modal ───────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  title: string;
  format: string;
  dueDate: string;
  dueTime: string;
}

function BatchCreateModal({ clients, onClose }: { clients: Client[]; onClose: () => void }) {
  const addContentCard = useContentStore((s) => s.addContentCard);
  const { currentUser, role } = useRole();

  // Cliente em branco: pré-escolher o primeiro da lista criava o lote no cliente errado.
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState<ContentCard["priority"]>("medium");
  const loteId = useRef(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`).current;
  const [rows, setRows] = useState<BatchRow[]>(() =>
    // Postagem é seg/qua/sex — a próxima semana já vem nesses dias.
    slotsSegQuaSex(todaySP()).map((ds, i) => ({ id: `batch-${i}`, title: "", format: "Post", dueDate: ds, dueTime: "10:00" })),
  );
  const [criando, setCriando] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const filledRows = rows.filter((r) => r.title.trim());

  const addRow = () => {
    const ds = proximoSlot(rows[rows.length - 1]?.dueDate ?? todaySP());
    setRows([...rows, { id: `batch-${Date.now()}`, title: "", format: "Post", dueDate: ds, dueTime: "10:00" }]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof BatchRow, value: string) => {
    setRows(rows.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSubmit = async () => {
    if (!clientId || !selectedClient || filledRows.length === 0 || criando) return;
    setCriando(true);
    const resultados = await Promise.allSettled(filledRows.map((row) =>
      addContentCard({
        title: row.title.trim(),
        clientId,
        clientName: selectedClient.name,
        socialMedia: role === "social" ? currentUser : (selectedClient.assignedSocial ?? currentUser),
        status: statusDaEtapa("pauta"),
        priority,
        format: row.format,
        dueDate: row.dueDate,
        dueTime: row.dueTime,
      }, { chave: chaveDaLinha(loteId, row.id), criadoPor: currentUser }),
    ));
    setCriando(false);
    const falhas = filledRows.filter((_, i) => resultados[i].status === "rejected");
    if (falhas.length === 0) {
      toast.success(`${filledRows.length} card(s) criado(s) para ${selectedClient.name}.`);
      onClose();
      return;
    }
    // Só as linhas que falharam ficam no modal; reenviar usa a mesma chave e não duplica.
    const idsFalhos = new Set(falhas.map((r) => r.id));
    setRows((rs) => rs.filter((r) => idsFalhos.has(r.id)));
    toast.error(`${falhas.length} de ${filledRows.length} card(s) não foram criados: ${falhas.map((r) => `"${r.title.trim()}"`).join(", ")}. Ficaram no modal pra tentar de novo.`);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-lg animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent shrink-0" />

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Layers size={18} className="text-primary" />
                Criacao em Batch
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crie varios cards de conteudo de uma vez
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
              <X size={16} />
            </button>
          </div>

          {/* Client + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Cliente</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                className={`w-full bg-background border rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-primary/50 outline-none ${clientId ? "border-border" : "border-destructive/40"}`}>
                <option value="">Selecione um cliente...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade (todos)</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ContentCard["priority"])}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-primary/50 outline-none">
                <option value="low">Baixa</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Urgente</option>
              </select>
            </div>
          </div>

          {/* Materiais do cliente — mesmo bloco do pedido único */}
          {selectedClient && <MateriaisResumo clientId={selectedClient.id} clientName={selectedClient.name} />}

          {/* Rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_100px_120px_70px_32px] gap-2 text-[10px] text-muted-foreground uppercase tracking-wider px-1">
              <span>Título</span>
              <span>Formato</span>
              <span>Data</span>
              <span>Hora</span>
              <span />
            </div>
            {rows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[1fr_100px_120px_70px_32px] gap-2 items-center">
                <input
                  value={row.title}
                  onChange={(e) => updateRow(row.id, "title", e.target.value)}
                  placeholder={`Card ${i + 1}...`}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 outline-none"
                />
                <select
                  value={row.format}
                  onChange={(e) => updateRow(row.id, "format", e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-2 text-xs text-foreground focus:border-primary/50 outline-none"
                >
                  {["Post", "Reels", "Story", "Carrossel", "BTS"].map((f) => <option key={f}>{f}</option>)}
                </select>
                <input
                  type="date" value={row.dueDate}
                  onChange={(e) => updateRow(row.id, "dueDate", e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-2 text-xs text-foreground focus:border-primary/50 outline-none"
                />
                <input
                  type="time" value={row.dueTime}
                  onChange={(e) => updateRow(row.id, "dueTime", e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-2 text-xs text-foreground focus:border-primary/50 outline-none"
                />
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length <= 1}
                  title={rows.length <= 1 ? "Mínimo de 1 linha" : "Remover linha"}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:bg-transparent">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-all w-full justify-center border border-dashed border-border">
              <Plus size={12} /> Adicionar linha
            </button>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted border border-border">
            <span className="text-xs text-muted-foreground">
              {filledRows.length} card(s) preenchido(s) de {rows.length} total
            </span>
            {selectedClient && (
              <span className="text-xs text-primary">→ {selectedClient.name}</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={filledRows.length === 0 || !selectedClient || criando}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/80 transition-all disabled:opacity-30">
            <Layers size={12} /> {criando ? "Criando…" : `Criar ${filledRows.length} Card(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Task Bar ────────────────────────────────────────────────────────────

interface QuickTaskBarProps {
  clients: Client[];
}

function QuickTaskBar({ clients }: QuickTaskBarProps) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [format, setFormat] = useState("Post");
  const [column, setColumn] = useState<Etapa>("pauta");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addContentCard = useContentStore((s) => s.addContentCard);
  const transicaoDesign = useContentStore((s) => s.transicaoDesign);
  const { currentUser, role } = useRole();

  const [criando, setCriando] = useState(false);
  const canCreate = title.trim() && clientId && dueDate && dueTime && !criando;

  const handleCreate = async () => {
    if (!canCreate) return;
    const client = clients.find((c) => c.id === clientId);
    setCriando(true);
    try {
      // "Com o designer" não é um status solto: o card nasce na Pauta e o pedido de arte abre junto
      // (a mesma transição do quadro). As outras etapas nascem direto.
      const pedeArte = column === "com_designer";
      const criado = await addContentCard({
        title: title.trim(),
        clientId,
        clientName: client?.name ?? "",
        socialMedia: role === "social" ? currentUser : (client?.assignedSocial ?? currentUser),
        status: pedeArte ? statusDaEtapa("pauta") : statusDaEtapa(column),
        priority,
        format,
        dueDate,
        dueTime,
      }, { criadoPor: currentUser });
      if (pedeArte && criado?.id) {
        await transicaoDesign(criado.id, { tipo: "pedir_arte" }).catch((err: unknown) => {
          toast.error(`O card foi criado, mas não foi pro designer${err instanceof Error ? `: ${err.message}` : ""}. Use "Pedir arte" no card.`);
        });
      }
    } catch (err) {
      // "Criado!" só depois do servidor confirmar; em falha os campos ficam preenchidos.
      toast.error(`Não consegui criar o card${err instanceof Error && err.message ? `: ${err.message}` : ""}.`);
      return;
    } finally {
      setCriando(false);
    }
    setTitle("");
    setClientId("");
    setFormat("Post");
    setPriority("medium");
    setColumn("pauta");
    setDueDate("");
    setDueTime("");
    setSuccess(true);
    setTimeout(() => { setSuccess(false); inputRef.current?.focus(); }, 1200);
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border mb-4 transition-all flex-wrap ${
      success ? "border-primary/40 bg-primary/5" : "border-border bg-card"
    }`}>
      <Zap size={14} className="text-primary shrink-0" />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="Criar tarefa rápida..."
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[120px]"
      />
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer max-w-[130px]"
      >
        <option value="">Cliente *</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
      >
        {["Post", "Reels", "Story", "Carrossel", "BTS", "Destaque"].map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className={`bg-muted border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer ${!dueDate ? "border-destructive/40" : "border-border"}`}
        title="Data do post *"
      />
      <input
        type="time"
        value={dueTime}
        onChange={(e) => setDueTime(e.target.value)}
        className={`bg-muted border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer w-[90px] ${!dueTime ? "border-destructive/40" : "border-border"}`}
        title="Horário do post *"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
      >
        <option value="low">Baixa</option>
        <option value="medium">Média</option>
        <option value="high">Alta</option>
        <option value="critical">Urgente</option>
      </select>
      <select
        value={column}
        onChange={(e) => setColumn(e.target.value as Etapa)}
        aria-label="Etapa em que o card nasce"
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
      >
        {ETAPAS.map((col) => (
          <option key={col.id} value={col.id}>{col.rotulo}</option>
        ))}
      </select>
      <button
        onClick={handleCreate}
        disabled={!canCreate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {success ? <Check size={13} /> : <Plus size={13} />}
        {success ? "Criado!" : "Criar"}
      </button>
    </div>
  );
}

// ── Add Social Media member modal ─────────────────────────────────────────────

function AddMemberModal({ onAdd, onClose }: { onAdd: (name: string, password: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <UserPlus size={15} className="text-primary" /> Novo Social Media
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1 uppercase tracking-wider">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1 uppercase tracking-wider">Senha de Acesso</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && password.trim() && (onAdd(name.trim(), password.trim()), onClose())}
            />
          </div>
        </div>
        {(!name.trim() || !password.trim()) && (
          <p className="text-xs text-lone-warning mb-3">
            {!name.trim() && !password.trim() ? "Preencha o nome e a senha." : !name.trim() ? "Nome obrigatório." : "Senha obrigatória."}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost text-xs flex-1">Cancelar</button>
          <button
            onClick={() => { if (name.trim() && password.trim()) { onAdd(name.trim(), password.trim()); onClose(); }}}
            disabled={!name.trim() || !password.trim()}
            className="btn-primary text-xs flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Access Tab (Client Credentials) ──────────────────────────────────────────

interface AccessTabProps {
  clients: Client[];
  clientAccess: Record<string, import("@/lib/types").ClientAccess>;
  onSave: (clientId: string, access: Partial<import("@/lib/types").ClientAccess>) => void;
  isAdmin: boolean;
}

function AccessTab({ clients, clientAccess, onSave, isAdmin }: AccessTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState<string | null>(null);

  // Baixar a logo crua do cliente (server-side) — pro social usar na arte/postagem.
  const baixarLogo = async (client: { id: string; name: string; nomeFantasia?: string }) => {
    setLogoBusy(client.id);
    try {
      const res = await authedFetch(`/api/clients/${client.id}/logo`);
      if (!res.ok) return;
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logo-${(client.nomeFantasia || client.name || "cliente").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* silencioso */ } finally { setLogoBusy(null); }
  };

  const FIELDS = [
    { key: "instagramLogin", label: "Instagram Login", icon: Instagram },
    { key: "instagramPassword", label: "Instagram Senha", icon: Lock, isPassword: true },
    { key: "facebookLogin", label: "Facebook Login", icon: UsersRound },
    { key: "facebookPassword", label: "Facebook Senha", icon: Lock, isPassword: true },
    { key: "tiktokLogin", label: "TikTok Login", icon: Music },
    { key: "tiktokPassword", label: "TikTok Senha", icon: Lock, isPassword: true },
    { key: "mlabsLogin", label: "mLabs Login", icon: BarChart2 },
    { key: "mlabsPassword", label: "mLabs Senha", icon: Lock, isPassword: true },
    { key: "canvaLink", label: "Canva Link", icon: Palette },
    { key: "driveLink", label: "Drive Link", icon: FolderOpen },
    { key: "otherNotes", label: "Observações", icon: FileText },
  ];

  const startEdit = (clientId: string) => {
    const access = clientAccess[clientId] ?? {};
    const data: Record<string, string> = {};
    FIELDS.forEach((f) => {
      data[f.key] = (access as unknown as Record<string, string | undefined>)[f.key] ?? "";
    });
    setFormData(data);
    setEditingId(clientId);
  };

  const handleSave = (clientId: string) => {
    const updates: Record<string, string | undefined> = {};
    FIELDS.forEach((f) => {
      updates[f.key] = formData[f.key] || undefined;
    });
    onSave(clientId, updates);
    setEditingId(null);
    setSaved(clientId);
    setTimeout(() => setSaved(null), 1500);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Key size={15} className="text-primary" />
        <h3 className="font-semibold text-sm tracking-tight">Acessos dos Clientes</h3>
        <span className="text-xs text-muted-foreground ml-auto">Informações não financeiras · Editável pelo social media</span>
      </div>

      {clients.length === 0 && (
        <EmptyState icon={<Key size={20} />} title="Nenhum cliente ativo neste workspace" subtitle="Quando houver clientes ativos na sua carteira, os acessos aparecem aqui." />
      )}

      {clients.map((client) => {
        const access = clientAccess[client.id];
        const isEditing = editingId === client.id;
        const hasData = access && Object.values(access).some((v) => v && v !== client.id);

        return (
          <div key={client.id} className="card border border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                {client.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.assignedSocial}</p>
              </div>
              {saved === client.id && (
                <span className="text-xs text-primary font-medium animate-fade-in">Salvo!</span>
              )}
              {client.docLogo && !isEditing && (
                <button
                  onClick={() => baixarLogo(client)}
                  disabled={logoBusy === client.id}
                  title="Baixar logo do cliente pra usar na arte"
                  className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40"
                >
                  <Download size={11} /> {logoBusy === client.id ? "..." : "Logo"}
                </button>
              )}
              {!isEditing ? (
                <button
                  onClick={() => startEdit(client.id)}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  {hasData ? "Editar" : "Preencher"} Acessos
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Cancelar</button>
                  <button onClick={() => handleSave(client.id)} className="btn-primary text-xs flex items-center gap-1">
                    <Save size={11} /> Salvar
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                      <field.icon size={11} /> {field.label}
                    </label>
                    <div className="relative">
                      <input
                        type={field.isPassword && !showPasswords[field.key] ? "password" : "text"}
                        value={formData[field.key] ?? ""}
                        onChange={(e) => setFormData((p) => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.isPassword ? "••••" : `${field.label}...`}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary pr-8"
                      />
                      {field.isPassword && (
                        <button
                          type="button"
                          onClick={() => setShowPasswords((p) => ({ ...p, [field.key]: !p[field.key] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPasswords[field.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : hasData ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FIELDS.filter((f) => (access as unknown as Record<string, string | undefined>)[f.key]).map((field) => {
                  const val = (access as unknown as Record<string, string | undefined>)[field.key] ?? "";
                  return (
                    <div key={field.key} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                      <field.icon size={12} className="shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">{field.label}:</span>
                      <span className="text-foreground font-medium truncate">
                        {field.isPassword ? "••••••" : val}
                      </span>
                    </div>
                  );
                })}
                {access?.updatedBy && (
                  <p className="text-[10px] text-muted-foreground col-span-full mt-1">
                    Atualizado por {access.updatedBy} {access.updatedAt ? `· ${new Date(access.updatedAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                Nenhum acesso cadastrado ainda. Clique em "Preencher Acessos" para adicionar.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ErroDeCarga() {
  return (
    <div className="text-center py-12 px-4 rounded-xl border border-destructive/30 bg-destructive/10" role="alert">
      <AlertTriangle size={24} className="mx-auto mb-3 text-destructive" />
      <p className="text-sm font-medium text-destructive">Não consegui carregar os cards — tentando de novo</p>
      <p className="text-xs text-muted-foreground mt-1">O quadro recarrega sozinho assim que a conexão voltar.</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SocialPage() {
  // Leva 5a: a Carteira saiu (a lista de clientes é uma só, em /clients?resp=mine) e Métricas +
  // Entregas viraram "Resultados", contados no Instagram real. O Social abre no board.
  const [activeTab, setActiveTab] = useState<"kanban" | "onboarding" | "acessos" | "resultados" | "aprovacao">("kanban"); // SocialTab — kept inline for readability
  const [adminWorkspace, setAdminWorkspaceRaw] = useState("Todos");
  const setAdminWorkspace = (value: string) => {
    setAdminWorkspaceRaw(value);
    authedFetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "social_workspace", value }),
    }).catch(() => { /* silent — preference failure is non-critical */ });
  };
  const [selectedCard, setSelectedCard] = useState<ContentCard | null>(null);
  const [nonDeliveryCard, setNonDeliveryCard] = useState<ContentCard | null>(null);
  const [cardToDelete, setCardToDelete] = useState<ContentCard | null>(null);
  const [nonDeliveryReason, setNonDeliveryReason] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  // Quadro de produção (Leva 5b): a vista e o cliente em foco (vindo de ?client=).
  const [vista, setVista] = useState<Vista>("meus");
  const [clienteDoLink, setClienteDoLink] = useState<string | null>(null);
  const [onboardingCompleteClient, setOnboardingCompleteClient] = useState<Client | null>(null);
  const [newCardDate, setNewCardDate] = useState<string | null>(null);
  // Cliente já escolhido quando o "novo conteúdo" vem do "+" da coluna dele (visão unificada).
  const [newCardClient, setNewCardClient] = useState<Client | null>(null);
  const [verifyingCard, setVerifyingCard] = useState<ContentCard | null>(null);
  const [verifyChecks, setVerifyChecks] = useState({ postLive: false, copyCorrect: false });
  const [showBatchCreate, setShowBatchCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { role, currentUser, hydrated } = useRole();

  // ── Zustand stores (migrado de AppStateContext) ───────────────────────────
  const clients = useClientsStore((s) => s.clients);
  const updateClientStatus = useClientsStore((s) => s.updateClientStatus);
  const initClients = useClientsStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);

  const contentCards = useContentStore((s) => s.contentCards);
  const contentApprovals = useContentStore((s) => s.contentApprovals);
  const contentLoadError = useContentStore((s) => s.loadError);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const deleteContentCard = useContentStore((s) => s.deleteContentCard);
  const approveContent = useContentStore((s) => s.approveContent);
  const rejectContent = useContentStore((s) => s.rejectContent);
  const initContent = useContentStore((s) => s.init);
  const refreshContent = useContentStore((s) => s.refresh);
  // Card que o ?card= já tentou abrir. O efeito depende de contentCards e roda de novo a cada poll;
  // sem essa trava, a busca no servidor dispararia repetidamente pro mesmo id.
  const cardBuscadoRef = useRef<string | null>(null);
  const subContent = useContentStore((s) => s.subscribeRealtime);

  const onboarding = useOperationalStore((s) => s.onboarding);
  const clientAccess = useOperationalStore((s) => s.clientAccess);
  const toggleOnboardingItem = useOperationalStore((s) => s.toggleOnboardingItem);
  const updateClientAccess = useOperationalStore((s) => s.updateClientAccess);
  const initOps = useOperationalStore((s) => s.init);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);


  // ── Store init on mount ────────────────────────────────────────────────────
  const isAdmin = role === "admin" || role === "manager";

  useEffect(() => {
    initClients();
    initContent();
    initOps();
    const u1 = subClients();
    const u2 = subContent();
    const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling leve do board ──────────────────────────────────────────────────
  // Realtime está OFF no servidor (RAM), então o board não atualiza sozinho. Em vez de
  // ressuscitar o WebSocket, refetch silencioso a cada 45s — só com a aba visível — e
  // assim que a aba volta ao foco. Mantém artes/cards novos aparecendo sem F5, com custo
  // baixo no VPS (1 GET, sem flicker).
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refreshContent(); };
    const interval = setInterval(tick, 20000); // ~20s: status/imagem de outra pessoa aparecem "sozinhos" mais rápido
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick); // refetch ao voltar pra janela
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [refreshContent]);

  // ── NavContext: secondary sidebar tab navigation ──────────────
  const { pendingTab, setPendingTab, setCurrentTab, secondaryOpen } = useNav();
  const VALID_SOCIAL_TABS = ["kanban","onboarding","acessos","resultados","aprovacao"] as const;
  type SocialTab = typeof VALID_SOCIAL_TABS[number];
  // Links antigos: "relatorios" era a aba da fila de aprovação; chat/calendário saíram; a Carteira
  // virou a lista única de /clients (Leva 5a) e Métricas/Entregas viraram Resultados.
  const ABAS_ANTIGAS: Record<string, SocialTab> = {
    relatorios: "aprovacao", calendar: "kanban", chat: "kanban", carteira: "kanban",
    metricas: "resultados", entregas: "resultados",
  };

  useEffect(() => {
    if (!pendingTab) return;
    // Vista do quadro pedida pelo nome (⌘K, link antigo): cai no quadro de produção nessa vista.
    const v = pendingTab === "kanban" ? null : lerVista(pendingTab);
    if (v) { setVista(v); setActiveTab("kanban"); setPendingTab(""); return; }
    const alvo = ABAS_ANTIGAS[pendingTab] ?? pendingTab;
    // Só consome (e apaga) o pedido que é DESTA tela: apagar o de outra página fazia a busca ⌘K
    // abrir a tela certa na aba errada.
    if ((VALID_SOCIAL_TABS as readonly string[]).includes(alvo)) {
      setActiveTab(alvo as SocialTab);
      setPendingTab("");
    }
  }, [pendingTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega workspace preferido do usuário (persiste entre sessões).
  // Quem é social abre no PRÓPRIO quadro quando ainda não escolheu: com o padrão "Todos" ele passaria
  // a ver os cards de todo mundo de cara, que é o oposto do que o Roberto pediu.
  // Espera a hidratação: antes dela o contexto devolve o perfil padrão (Roberto/admin), e decidir
  // com esse valor daria o quadro errado justamente pra quem não é admin.
  const prefCarregadaRef = useRef(false);
  useEffect(() => {
    if (!hydrated || prefCarregadaRef.current) return;
    prefCarregadaRef.current = true;
    authedFetch("/api/preferences?keys=social_workspace")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.social_workspace && typeof data.social_workspace === "string") {
          setAdminWorkspaceRaw(data.social_workspace);
        } else if (role === "social" && currentUser) {
          setAdminWorkspaceRaw(currentUser);
        }
      })
      .catch(() => { if (role === "social" && currentUser) setAdminWorkspaceRaw(currentUser); });
  }, [hydrated, role, currentUser]);

  // Atalho de URL: ?action=new-content abre direto o modal "Novo Conteúdo"
  // Disparado pelo dropdown do header global e pelo command palette (GlobalSearch).
  // Após abrir, limpa o param da URL pra não reabrir em refresh.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (searchParams.get("action") === "new-content") {
      setNewCardDate(todaySP());
      router.replace(pathname, { scroll: false });
    }
    // Atalho ?arquivadas=1 (vindo do aviso "Demanda arquivada"): abre a lista de Arquivadas —
    // é lá que se desarquiva. Mandar pro cadastro do cliente era beco sem saída.
    if (searchParams.get("arquivadas")) {
      setShowArchived(true);
      router.replace(pathname, { scroll: false });
    }
    // Atalho ?card=<id> (vindo da notificação "Arte entregue" e do bloco "Artes prontas" da Home).
    // O board carrega só cards ATIVOS. 2.632 avisos no banco apontam pra card que depois foi
    // arquivado — e o código antigo, não achando na lista, não fazia NADA: nem abria, nem avisava,
    // nem limpava o ?card= da URL. Era o "clico na notificação e não abre a arte".
    const cardId = searchParams.get("card");
    if (cardId && cardId !== cardBuscadoRef.current) {
      cardBuscadoRef.current = cardId;
      const card = contentCards.find((c) => c.id === cardId);
      if (card) {
        setSelectedCard(card);
        router.replace(pathname, { scroll: false });
      } else if (contentCards.length) {
        // Só busca no servidor depois que o board carregou — senão pergunta à toa no primeiro render.
        (async () => {
          try {
            const r = await authedFetch(`/api/data/content/card?id=${encodeURIComponent(cardId)}`);
            const txt = await r.text();
            if (!r.ok) {
              toast.error(r.status === 404 ? "Essa arte não existe mais — o card foi excluído." : "Não consegui abrir a arte.");
              return;
            }
            const { card: achado, archived } = JSON.parse(txt) as { card: ContentCard; archived: boolean };
            setSelectedCard(achado);
            if (archived) toast.info("Esse card está arquivado. Ele abre aqui, mas não aparece no quadro.");
          } catch {
            toast.error("Não consegui abrir a arte.");
          } finally {
            router.replace(pathname, { scroll: false });
          }
        })();
      }
    }
    // Atalho ?client=<id> (vindo da ficha do cliente e do Início): o quadro abre filtrado nesse cliente.
    const clientId = searchParams.get("client");
    if (clientId) {
      const cl = clients.find((c) => c.id === clientId);
      if (cl) {
        setClienteDoLink(cl.id);
        setActiveTab("kanban");
        router.replace(pathname, { scroll: false });
      }
    }
    // ?vista=meus|cliente|designer (e os nomes antigos: kanban, unificada…).
    const v = lerVista(searchParams.get("vista"));
    if (v) { setVista(v); setActiveTab("kanban"); router.replace(pathname, { scroll: false }); }
  }, [searchParams, router, pathname, contentCards, clients]);

  // Auth: use global session (no secondary login needed)
  const isDesigner = role === "designer";
  // Roberto (10/09/2026): "assim como também deve ser no social midia para que quando um deles
  // precise de ajuda o outro possa ajudar." O social ficava trancado no próprio quadro — não dava
  // nem pra ver onde o colega estava afogado. Agora escolhe; o padrão continua sendo o dele.
  const canSelectWorkspace = isAdmin || isDesigner || role === "social";
  // O designer vê o quadro do social; o que ele pode mover a regra da produção decide (só a arte).
  const isReadOnly = isDesigner;

  const team = useTeamMembers();
  const socialMemberNames = team.social.map((m) => m.name);
  const workspaceOptions = socialMemberNames;

  const activeWorkspace = canSelectWorkspace ? adminWorkspace : currentUser;

  const filteredClients = clients.filter((c) => activeWorkspace === "Todos" || c.assignedSocial === activeWorkspace);

  const filteredCards = contentCards.filter((c) => {
    if (c.archivedAt) return false;
    if (activeWorkspace !== "Todos" && c.socialMedia !== activeWorkspace) return false;
    return true;
  });

  const onboardingClients = filteredClients.filter((c) => c.status === "onboarding");

  const handleOnboardingToggle = (clientId: string, itemId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    toggleOnboardingItem(clientId, itemId, currentUser);
    // Check if this toggle completes all items
    const items = onboarding[clientId] ?? [];
    const updatedItems = items.map((it) =>
      it.id === itemId ? { ...it, completed: !it.completed } : it
    );
    const allDone = updatedItems.every((it) => it.completed);
    if (allDone && client.status === "onboarding") {
      setOnboardingCompleteClient(client);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Social Media" subtitle="Produção, aprovação e resultados de conteúdo" />

      {/* Confetti overlay */}
      {onboardingCompleteClient && <Confetti />}

      {/* Onboarding Complete Modal */}
      {onboardingCompleteClient && (
        <OnboardingCompleteModal
          client={onboardingCompleteClient}
          onMoveActiveAndPlan={() => {
            updateClientStatus(onboardingCompleteClient.id, "good", currentUser);
            const id = onboardingCompleteClient.id;
            setOnboardingCompleteClient(null);
            router.push(`/planejamento?cliente=${id}`);
          }}
          onMoveActive={() => {
            updateClientStatus(onboardingCompleteClient.id, "good", currentUser);
            setOnboardingCompleteClient(null);
          }}
          onClose={() => setOnboardingCompleteClient(null)}
        />
      )}

      {/* Modals */}
      {selectedCard && <ContentCardModal card={selectedCard} onClose={() => setSelectedCard(null)} />}

      {/* Delete card confirmation */}
      {cardToDelete && (
        <DeleteConfirmModal
          title="Arquivar este card?"
          message="O card sai do quadro, mas nada se perde: briefing, comentários e artes ficam guardados em Arquivadas."
          itemLabel={`${cardToDelete.title} — ${cardToDelete.clientName}`}
          confirmLabel="Arquivar card"
          onConfirm={() => deleteContentCard(cardToDelete.id)}
          onClose={() => setCardToDelete(null)}
        />
      )}
      {/* Non-delivery report modal */}
      {nonDeliveryCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm" onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Reportar Não Entrega</h3>
              <p className="text-xs text-primary mt-0.5">{nonDeliveryCard.title} — {nonDeliveryCard.clientName}</p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Informe o motivo pelo qual este conteúdo não foi entregue no prazo:</p>
              <textarea
                value={nonDeliveryReason}
                onChange={(e) => setNonDeliveryReason(e.target.value)}
                rows={3}
                placeholder="Ex: Cliente não enviou as fotos, aguardando aprovação do briefing..."
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={async () => {
                  if (!nonDeliveryReason.trim()) return;
                  try {
                    await updateContentCard(nonDeliveryCard.id, {
                      nonDeliveryReason: nonDeliveryReason.trim(),
                      nonDeliveryReportedBy: currentUser,
                      nonDeliveryReportedAt: new Date().toISOString(),
                    });
                  } catch {
                    return; // modal fica aberto com o motivo; o store já avisou
                  }
                  setNonDeliveryCard(null);
                  setNonDeliveryReason("");
                }}
                disabled={!nonDeliveryReason.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                Reportar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── PUBLISH VERIFICATION MODAL ── */}
      {verifyingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm" onClick={() => setVerifyingCard(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Verificação de Publicação</h3>
              </div>
              <p className="text-xs text-primary mt-1">{verifyingCard.title} — {verifyingCard.clientName}</p>
              {verifyingCard.dueDate && <p className="text-[10px] text-muted-foreground mt-0.5">Agendado: {verifyingCard.dueDate} {verifyingCard.dueTime ?? ""}</p>}
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Confirme que o post foi publicado corretamente:</p>
              {[
                { key: "postLive" as const, label: "Post no Ar", desc: "Verificar se o post aparece no feed/stories da plataforma" },
                { key: "copyCorrect" as const, label: "Copy Correta", desc: "Verificar texto, hashtags, menções e legenda" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setVerifyChecks((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    verifyChecks[item.key]
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/30 hover:border-primary/15"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    verifyChecks[item.key]
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-transparent"
                  }`}>
                    {verifyChecks[item.key] && <Check size={12} />}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${verifyChecks[item.key] ? "text-primary" : "text-foreground"}`}>{item.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setVerifyingCard(null)} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={async () => {
                  if (!verifyChecks.postLive || !verifyChecks.copyCorrect) return;
                  const now = new Date().toISOString();
                  try {
                  await updateContentCard(verifyingCard.id, {
                    // publishVerifyChecks NÃO é coluna do banco — mandá-lo quebrava o update inteiro
                    // (coluna inexistente) → o card não saía da "Verificação de Publicação". Removido.
                    publishVerifiedAt: now,
                    publishVerifiedBy: currentUser,
                    status: statusDaEtapa("no_ar"),
                    statusChangedAt: now,
                    columnEnteredAt: {
                      ...(verifyingCard.columnEnteredAt ?? {}),
                      published: now,
                    },
                  });
                  } catch {
                    return;
                  }
                  setVerifyingCard(null);
                }}
                disabled={!verifyChecks.postLive || !verifyChecks.copyCorrect}
                className="btn-primary flex-1 text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <ShieldCheck size={14} />
                Confirmar e Publicar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* AddMemberModal removed — team managed via CEO area */}
      {newCardDate !== null && (
        <NewContentCardModal
          defaultDate={newCardDate}
          defaultClient={newCardClient ?? undefined}
          onClose={() => { setNewCardDate(null); setNewCardClient(null); }}
        />
      )}
      {showBatchCreate && (
        <BatchCreateModal
          clients={filteredClients}
          onClose={() => setShowBatchCreate(false)}
        />
      )}
      {showArchived && (
        <ArchivedDemandsModal
          workspace={activeWorkspace}
          onClose={() => setShowArchived(false)}
        />
      )}

      <div className="p-6 space-y-5 animate-fade-in">

        {/* O bloco "Datas e feriados deste mês" saiu (Leva 5a): repetia o calendário principal.
            Datas, feriados e posts moram na Agenda (Meu Trabalho › Agenda, filtro Conteúdo). */}
        {/* Workspace header */}
        <div className="flex items-center justify-between gap-3">
          {canSelectWorkspace ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {isDesigner ? "Visualizando quadro de:" : role === "social" ? "Quadro de:" : "Monitorando Workspace de:"}
              </span>
              <div className="relative">
                <select
                  value={adminWorkspace}
                  onChange={(e) => setAdminWorkspace(e.target.value)}
                  className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer pr-8"
                >
                  <option value="Todos">Visão Geral</option>
                  {workspaceOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {role === "social" && activeWorkspace !== currentUser && (
                <span className="text-[11px] text-lone-warning bg-lone-warning-bg border border-lone-warning-border px-2.5 py-1 rounded">
                  {activeWorkspace === "Todos"
                    ? "Visão geral — cards de todo mundo"
                    : `Quadro de ${activeWorkspace} — o que mexer aqui é dele`}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-primary/[0.08] text-primary px-3 py-1.5 rounded border border-primary/[0.12] font-medium">
                Logado como: {currentUser}
              </span>
            </div>
          )}

          {/* CTA: criar novo conteúdo (escondido pra designer em modo leitura) */}
          {!isReadOnly && (
            <button
              onClick={() => setNewCardDate(todaySP())}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground text-sm font-medium transition-all shrink-0"
            >
              <Plus size={14} /> Novo Conteúdo
            </button>
          )}
        </div>

        {/* Tabs */}
        {/* Designer no quadro do social: vê tudo, mexe só na arte (a regra da produção decide). */}
        {isDesigner && activeWorkspace !== "Todos" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-xs text-muted-foreground mb-2">
            <Eye size={12} className="text-muted-foreground shrink-0" />
            Quadro de <span className="text-foreground font-medium">{activeWorkspace}</span>
            <span className="text-muted-foreground ml-auto">Você move só a arte — o resto é do social</span>
          </div>
        )}

        {/* Abas: uma navegação por tela. Com o painel lateral aberto (computador), as abas moram lá
            com os mesmos nomes e a mesma ordem; no celular, ou com o painel fechado, aparecem aqui. */}
        <div className={`flex gap-1 border-b border-border overflow-x-auto ${secondaryOpen ? "lg:hidden" : ""}`}>
          {(["kanban", "aprovacao", "resultados", "onboarding", "acessos"] as const).map((tab) => {
            const LABELS: Record<typeof tab, string> = {
              kanban: "Produção", aprovacao: "Inbox de Aprovação",
              resultados: "Resultados",
              onboarding: "Onboarding", acessos: "Acessos & Senhas",
            };
            // Live badge counts per tab
            const pendingKanban = filteredCards.filter((c) => !statusNaEtapa(c.status, ...ETAPAS_FINAIS)).length;
            const approvalCount = filteredCards.filter((c) => statusNaEtapa(c.status, "com_cliente")).length; // alinhado com a fila da aba
            const badgeMap: Partial<Record<typeof tab, number>> = {
              kanban:     pendingKanban,
              onboarding: onboardingClients.length,
              aprovacao: approvalCount,
            };
            const badge = badgeMap[tab];
            const isApprovalTab = tab === "aprovacao" && approvalCount > 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {LABELS[tab]}
                {badge !== undefined && badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${
                    isApprovalTab
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── KANBAN TAB ────────────────────────────────────────────────────── */}
        {activeTab === "kanban" && (
          <div className="animate-fade-in">
            {/* ── POST VERIFICATION PANEL ── */}
            {(() => {
              const scheduledCards = filteredCards.filter((c) => statusNaEtapa(c.status, "agendado") && !c.publishVerifiedAt);
              if (scheduledCards.length === 0) return null;
              return (
                <div className="mb-4 rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4 animate-fade-in">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={16} className="text-lone-warning" />
                    <h3 className="text-sm font-semibold text-foreground">Verificação de Publicação</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-lone-warning-bg text-lone-warning border border-lone-warning-border font-semibold">
                      {scheduledCards.length} pendente{scheduledCards.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Cards em {infoEtapa("agendado").rotulo} que precisam da confirmação de que foram ao ar corretamente.</p>
                  <div className="space-y-2">
                    {scheduledCards.map((card) => {
                      return (
                        <div key={card.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card transition-all">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
                            <AlertCircle size={14} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground">{card.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{card.clientName}</span>
                              <span className="text-[10px] text-muted-foreground">· {card.format}</span>
                              {card.platform && <span className="text-[10px] text-muted-foreground">· {card.platform}</span>}
                              {card.dueDate && <span className="text-[10px] text-muted-foreground">· {card.dueDate}</span>}
                              {card.dueTime && <span className="text-[10px] text-muted-foreground">· {card.dueTime}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => { setVerifyingCard(card); setVerifyChecks({ postLive: false, copyCorrect: false }); }}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                          >
                            <ShieldCheck size={12} />
                            Verificar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-2">
              <QuickTaskBar clients={filteredClients} />
              <button
                onClick={() => setShowBatchCreate(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shrink-0"
              >
                <Layers size={13} /> Criar em lote
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shrink-0"
              >
                <Archive size={13} /> Arquivadas
              </button>
              {/* As datas de post moram na Agenda principal (filtro Conteúdo) — Leva 5a. */}
              <Link
                href="/my-work?view=agenda&tipo=conteudo"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shrink-0"
              >
                <Calendar size={13} /> Calendário
              </Link>
            </div>

            <DailyClosePanel cards={filteredCards} clientes={filteredClients.map((c) => ({ id: c.id, name: c.nomeFantasia || c.name }))} />

            <CsAgentInbox cards={filteredCards} onOpen={setSelectedCard} />

            <KanbanErrorBoundary context="Quadro de produção (Social)">
              <QuadroProducao
                pessoa={activeWorkspace}
                modo="social"
                vista={vista}
                onVista={setVista}
                onAbrirCard={setSelectedCard}
                clientes={filteredClients}
                clienteInicial={clienteDoLink}
                onNovoCard={(clientId) => {
                  const cl = clients.find((c) => c.id === clientId) ?? null;
                  setNewCardClient(cl);
                  setNewCardDate(todaySP());
                }}
              />
            </KanbanErrorBoundary>
          </div>
        )}

        {/* ── ONBOARDING TAB ────────────────────────────────────────────────── */}
        {activeTab === "onboarding" && (
          <div className="animate-fade-in space-y-4">
            {onboardingClients.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum cliente em onboarding neste workspace.</p>
            )}
            {onboardingClients.map((client) => {
              const items = onboarding[client.id] ?? [];
              const done = items.filter((i) => i.completed).length;
              const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
              return (
                <div key={client.id} className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary">
                      {client.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{client.name}</p>
                      <p className="text-xs text-muted-foreground">Social: {client.assignedSocial}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-semibold text-primary">{pct}%</span>
                      <p className="text-xs text-muted-foreground">{done}/{items.length} etapas</p>
                    </div>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>

                  {pct === 100 && (
                    <div className="mb-4 p-3 bg-card border border-primary/20 rounded-lg text-center">
                      <p className="text-sm font-semibold text-primary inline-flex items-center gap-1.5"><CheckCircle size={14} /> Onboarding concluído!</p>
                      <p className="text-xs text-primary/70 mt-0.5">Todas as etapas foram finalizadas.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {items.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => handleOnboardingToggle(client.id, item.id)}
                          className="w-4 h-4 rounded accent-primary mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm transition-colors ${item.completed ? "text-muted-foreground line-through" : "text-foreground group-hover:text-foreground"}`}>
                            {item.label}
                          </span>
                          {item.completed && item.completedBy && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                <span className="text-[8px] font-semibold text-primary">
                                  {item.completedBy.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">{item.completedBy}</span>
                              {item.completedAt && <span className="text-[10px] text-muted-foreground">· {item.completedAt}</span>}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ACESSOS TAB ──────────────────────────────────────────────────── */}
        {activeTab === "acessos" && (
          <AccessTab
            // Inclui clientes em onboarding: é justamente na entrada que se coletam as
            // credenciais, e a AccessTab é a ÚNICA tela que vê/edita acesso de cliente.
            // Excluir onboarding aqui deixava esses clientes (ex: Léo Carros, Complexo Vida)
            // invisíveis pro social atribuído, mesmo com login/senha já cadastrados.
            clients={filteredClients}
            clientAccess={clientAccess}
            onSave={(clientId, access) => updateClientAccess(clientId, access, currentUser)}
            isAdmin={isAdmin}
          />
        )}

        {/* ── RESULTADOS (Leva 5a) ─────────────────────────────────────────────
            Substitui Métricas e Entregas Mensais: conta posts reais do Instagram, no prazo ×
            atrasado contra o card que casou, e o mix de formatos — por cliente e por pessoa. */}
        {activeTab === "resultados" && <ResultadosTab workspace={activeWorkspace} />}

        {/* ── INBOX DE APROVAÇÃO ─────────────────────────────────────────── */}
        {activeTab === "aprovacao" && (
          contentLoadError ? <ErroDeCarga /> : (
            <ApprovalQueueTab
              contentCards={filteredCards}
              currentUser={currentUser}
              contentApprovals={contentApprovals}
              approveContent={approveContent}
              rejectContent={rejectContent}
            />
          )
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// INBOX DE APROVAÇÃO (fila do cliente)
// ══════════════════════════════════════════════════════════════

function ApprovalQueueTab({
  contentCards: cards,
  currentUser,
  contentApprovals,
  approveContent: doApprove,
  rejectContent: doReject,
}: {
  contentCards: ContentCard[];
  currentUser: string;
  contentApprovals: import("@/lib/types").ContentApproval[];
  approveContent: (cardId: string, reviewer: string) => void;
  rejectContent: (cardId: string, reviewer: string, reason: string) => void;
}) {
  const [rejectCardId, setRejectCardId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Approval queue
  const approvalCards = cards.filter((c) => statusNaEtapa(c.status, "com_cliente"));
  const getApproval = (cardId: string) => contentApprovals.find((a) => a.cardId === cardId);

  return (
    <div className="animate-fade-in space-y-6">

      {/* Approval Queue */}
      {approvalCards.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Check size={15} className="text-primary" />
            <h3 className="font-semibold text-sm">Aprovações Pendentes</h3>
            <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full">{approvalCards.length}</span>
          </div>
          <div className="space-y-2">
            {approvalCards.map((card) => {
              const approval = getApproval(card.id);
              return (
                <div key={card.id} className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                    <p className="text-xs text-muted-foreground">{card.clientName} · {card.format}</p>
                  </div>
                  {approval?.status === "approved" ? (
                    <span className="text-xs text-primary font-medium">Aprovado</span>
                  ) : approval?.status === "rejected" ? (
                    <span className="text-xs text-destructive font-medium">Recusado: {approval.reason}</span>
                  ) : rejectCardId === card.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Motivo da recusa..."
                        className="bg-muted rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none w-48"
                        autoFocus
                      />
                      <button
                        onClick={() => { if (rejectReason.trim()) { doReject(card.id, currentUser, rejectReason.trim()); setRejectCardId(null); setRejectReason(""); } }}
                        className="text-xs bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/30 transition-colors"
                      >
                        Confirmar
                      </button>
                      <button onClick={() => { setRejectCardId(null); setRejectReason(""); }} className="text-xs text-muted-foreground hover:text-foreground">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => doApprove(card.id, currentUser)}
                        className="text-xs bg-primary/15 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/30 transition-colors font-medium"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => setRejectCardId(card.id)}
                        className="text-xs bg-destructive/10 text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/20 transition-colors font-medium"
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {approvalCards.length === 0 && (
        <EmptyState icon={<Check size={20} />} title="Nada aguardando o cliente" subtitle={`Cards em ${infoEtapa("com_cliente").rotulo} aparecem aqui pra aprovar ou recusar.`} />
      )}
    </div>
  );
}
