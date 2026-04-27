"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";
import {
  Send, Loader2, Check, AlertCircle, Bold, Italic, List, Link as LinkIcon,
  Mail, Users, Megaphone, Plus, X, CheckCircle, XCircle,
} from "lucide-react";

interface Broadcast {
  id: string;
  subject: string;
  content_html: string;
  target_audience: string;
  status: "draft" | "sending" | "sent" | "failed";
  sent_by: string | null;
  sent_at: string | null;
  recipients_total: number;
  recipients_success: number;
  recipients_failed: number;
  created_at: string;
}

export default function BroadcastsPage() {
  const { role, currentProfile } = useRole();
  const { clients } = useAppState();
  const isAdmin = role === "admin" || role === "manager";
  const adminEmail = currentProfile?.email || "";

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  const loadBroadcasts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/broadcasts");
      const data = await res.json();
      if (res.ok) setBroadcasts(data.broadcasts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin && adminEmail) loadBroadcasts(); }, [isAdmin, adminEmail]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Comunicados" subtitle="Acesso restrito" />
        <div className="p-6">
          <div className="card text-center py-12">
            <AlertCircle size={32} className="mx-auto text-amber-400 mb-3" />
            <p className="text-sm text-muted-foreground">Apenas administradores podem acessar Comunicados.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Comunicados" subtitle="Envio em massa para clientes" />

      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Histórico de Envios</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{broadcasts.length} comunicado(s) enviado(s)</p>
          </div>
          <button
            onClick={() => setComposerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-sm font-medium transition-all"
          >
            <Plus size={14} /> Novo Comunicado
          </button>
        </div>

        {loading ? (
          <div className="card flex items-center justify-center py-12">
            <Loader2 size={20} className="text-primary animate-spin" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="card text-center py-16">
            <Megaphone size={32} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-foreground font-medium">Nenhum comunicado ainda</p>
            <p className="text-xs text-muted-foreground mt-1">Comece criando um novo comunicado para sua base.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => (
              <BroadcastRow key={b.id} broadcast={b} />
            ))}
          </div>
        )}
      </div>

      {composerOpen && (
        <ComposerModal
          onClose={() => setComposerOpen(false)}
          onSent={() => { setComposerOpen(false); loadBroadcasts(); }}
          clients={clients}
          adminEmail={adminEmail}
        />
      )}
    </div>
  );
}

function BroadcastRow({ broadcast: b }: { broadcast: Broadcast }) {
  const sentDate = b.sent_at ? new Date(b.sent_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const successRate = b.recipients_total > 0 ? Math.round((b.recipients_success / b.recipients_total) * 100) : 0;
  const statusColor = b.status === "sent" ? "text-emerald-400" : b.status === "sending" ? "text-amber-400" : b.status === "failed" ? "text-red-400" : "text-muted-foreground";
  const statusBg = b.status === "sent" ? "bg-emerald-500/10" : b.status === "sending" ? "bg-amber-500/10" : b.status === "failed" ? "bg-red-500/10" : "bg-muted";

  return (
    <div className="card flex items-center gap-4">
      <div className={`w-9 h-9 rounded-xl ${statusBg} flex items-center justify-center shrink-0`}>
        {b.status === "sent" ? <CheckCircle size={16} className={statusColor} /> :
         b.status === "sending" ? <Loader2 size={16} className={`${statusColor} animate-spin`} /> :
         b.status === "failed" ? <XCircle size={16} className={statusColor} /> :
         <Mail size={16} className={statusColor} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{b.subject}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {sentDate} · {b.sent_by ?? "—"} · Audiência: {b.target_audience}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-foreground">{b.recipients_success}/{b.recipients_total}</p>
        <p className={`text-[10px] ${successRate >= 95 ? "text-emerald-400" : successRate >= 80 ? "text-amber-400" : "text-red-400"}`}>{successRate}% sucesso</p>
        {b.recipients_failed > 0 && <p className="text-[10px] text-red-400">{b.recipients_failed} falha(s)</p>}
      </div>
    </div>
  );
}

interface Client { id: string; name: string; nomeFantasia?: string; industry?: string; nicho?: string; status?: string }

function ComposerModal({ onClose, onSent, clients, adminEmail }: { onClose: () => void; onSent: () => void; clients: Client[]; adminEmail: string }) {
  const [subject, setSubject] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const [audience, setAudience] = useState<"all_active" | string>("all_active");
  const [testTo, setTestTo] = useState(adminEmail);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  // Anexo do PDF de feriados/datas comemorativas do mês
  const today = new Date();
  const [attachPdf, setAttachPdf] = useState(false);
  const [pdfYear, setPdfYear] = useState(today.getFullYear());
  const [pdfMonth, setPdfMonth] = useState(today.getMonth() + 1); // 1-12

  // Setores únicos: une `industry` (legado) e `nicho` (novo) num único set
  // — usa prefixo "sector:" no audience pra match em qualquer um dos dois campos
  const sectors = useMemo(() => {
    const s = new Set<string>();
    clients.forEach((c) => {
      if (c.industry && c.industry !== "Outro") s.add(c.industry);
      if (c.nicho && c.nicho.trim()) s.add(c.nicho.trim());
    });
    return Array.from(s).sort();
  }, [clients]);

  const audienceCount = useMemo(() => {
    if (audience === "all_active") {
      return clients.filter((c) => c.status && ["good", "average", "onboarding"].includes(c.status)).length;
    }
    if (audience.startsWith("sector:")) {
      const sec = audience.slice("sector:".length);
      return clients.filter((c) => c.industry === sec || c.nicho === sec).length;
    }
    if (audience.startsWith("industry:")) {
      const ind = audience.slice("industry:".length);
      return clients.filter((c) => c.industry === ind).length;
    }
    if (audience.startsWith("nicho:")) {
      const nic = audience.slice("nicho:".length);
      return clients.filter((c) => c.nicho === nic).length;
    }
    return 0;
  }, [audience, clients]);

  const getContentHtml = () => editorRef.current?.innerHTML ?? "";

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  const insertLink = () => {
    const url = window.prompt("URL do link (começa com https://):");
    if (!url) return;
    exec("createLink", url);
  };

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const validate = () => {
    if (!subject.trim()) { showToast("error", "Informe um assunto."); return false; }
    const content = getContentHtml().trim();
    if (!content || content === "<br>" || content === "<div><br></div>") {
      showToast("error", "Escreva o conteudo do email."); return false;
    }
    return true;
  };

  const handleTest = async (e?: React.MouseEvent | React.FormEvent) => {
    console.log("[broadcasts] handleTest fired", { event: e?.type, target: (e?.target as HTMLElement)?.tagName });
    e?.preventDefault();
    e?.stopPropagation();
    try {
      if (!validate()) {
        console.log("[broadcasts] validation failed");
        return;
      }
      console.log("[broadcasts] starting test fetch...");
      setTesting(true);
      const payload = {
        action: "test",
        subject,
        content_html: getContentHtml(),
        test_to: testTo || adminEmail,
        attach_calendar_pdf: attachPdf,
        calendar_year: pdfYear,
        calendar_month: pdfMonth,
      };
      console.log("[broadcasts] payload:", { ...payload, content_html: `<${payload.content_html.length} chars>` });
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("[broadcasts] fetch returned, status:", res.status);
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.log("[broadcasts] response data:", data);
      if (res.ok && data.success) {
        showToast("success", `Teste enviado para ${data.sentTo}`);
      } else {
        const errMsg = data.error || `HTTP ${res.status}`;
        console.error("[broadcasts] test failed:", { status: res.status, data });
        showToast("error", `Erro ao enviar teste: ${errMsg}`);
      }
    } catch (err) {
      console.error("[broadcasts] handleTest exception:", err);
      const msg = err instanceof Error ? err.message : "Erro de conexão";
      showToast("error", `Erro: ${msg}`);
    } finally {
      console.log("[broadcasts] handleTest done");
      setTesting(false);
    }
  };

  const handleSend = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!validate()) return;
    const total = audienceCount;
    if (!window.confirm(`Enviar este comunicado para ${total} cliente(s)? Essa acao nao pode ser desfeita.`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          subject,
          content_html: getContentHtml(),
          target_audience: audience,
          attach_calendar_pdf: attachPdf,
          calendar_year: pdfYear,
          calendar_month: pdfMonth,
        }),
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.ok && data.success) {
        showToast("success", `Enviado: ${data.sent}/${data.total}${data.failed > 0 ? ` (${data.failed} falha(s))` : ""}`);
        setTimeout(onSent, 1200);
      } else {
        const errMsg = data.error || `HTTP ${res.status}`;
        console.error("[broadcasts] send failed:", { status: res.status, data });
        showToast("error", `Erro no envio: ${errMsg}`);
      }
    } catch (err) {
      console.error("[broadcasts] handleSend exception:", err);
      const msg = err instanceof Error ? err.message : "Erro de conexão";
      showToast("error", `Erro: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-card border border-border shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-foreground">Novo Comunicado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Email em massa para sua base</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Assunto</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Novidades da Lone Midia — IA chegando ao trafego"
              className="w-full bg-muted border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          {/* Editor toolbar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Conteudo</label>
              <span className="text-[10px] text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{"{{nome_cliente}}"}</code> para personalizar
              </span>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-1 bg-muted px-2 py-1.5 border-b border-border">
                <ToolbarButton icon={Bold} onClick={() => exec("bold")} title="Negrito" />
                <ToolbarButton icon={Italic} onClick={() => exec("italic")} title="Italico" />
                <ToolbarButton icon={List} onClick={() => exec("insertUnorderedList")} title="Lista" />
                <ToolbarButton icon={LinkIcon} onClick={insertLink} title="Link" />
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[160px] bg-background p-3 text-sm text-foreground outline-none prose prose-sm max-w-none prose-invert"
                style={{ wordBreak: "break-word" }}
              />
            </div>
          </div>

          {/* Audience */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Publico</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted cursor-pointer hover:border-primary/30 transition-colors">
                <input
                  type="radio"
                  checked={audience === "all_active"}
                  onChange={() => setAudience("all_active")}
                  className="accent-primary"
                />
                <Users size={14} className="text-primary" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">Todos os ativos</p>
                  <p className="text-[10px] text-muted-foreground">Clientes em operacao (exclui rascunhos e at risk)</p>
                </div>
              </label>
              {sectors.map((sec) => {
                const matchCount = clients.filter((c) => c.industry === sec || c.nicho === sec).length;
                return (
                  <label key={sec} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted cursor-pointer hover:border-primary/30 transition-colors">
                    <input
                      type="radio"
                      checked={audience === `sector:${sec}`}
                      onChange={() => setAudience(`sector:${sec}`)}
                      className="accent-primary"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-foreground">{sec}</p>
                      <p className="text-[10px] text-muted-foreground">Filtro por nicho · {matchCount} cliente{matchCount === 1 ? "" : "s"}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Publico atual: <span className="text-primary font-semibold">{audienceCount} destinatario(s)</span>
            </p>
          </div>

          {/* Anexar PDF de feriados/datas comemorativas */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted cursor-pointer hover:border-primary/30 transition-colors">
              <input
                type="checkbox"
                checked={attachPdf}
                onChange={(e) => setAttachPdf(e.target.checked)}
                className="accent-primary mt-0.5"
              />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  📅 Anexar PDF de feriados e datas comemorativas
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  PDF personalizado por nicho de cada cliente. Pra clientes sem nicho, vai a versão geral.
                </p>
              </div>
            </label>

            {attachPdf && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Mês</label>
                  <select
                    value={pdfMonth}
                    onChange={(e) => setPdfMonth(parseInt(e.target.value, 10))}
                    className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 transition-colors"
                  >
                    {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Ano</label>
                  <input
                    type="number"
                    min={2025}
                    max={2030}
                    value={pdfYear}
                    onChange={(e) => setPdfYear(parseInt(e.target.value, 10) || today.getFullYear())}
                    className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Test-email override */}
        <div className="px-6 pb-4">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Email de teste</label>
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={adminEmail || "seu@email.com"}
            className="mt-1 w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 transition-colors"
          />
          <p className="text-[10px] text-muted-foreground mt-1">O teste sera enviado pra esse email. Padrao: seu email de admin.</p>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || sending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted text-foreground border border-border hover:border-primary/30 transition-all disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {testing ? "Enviando..." : "Enviar Teste"}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={testing || sending || audienceCount === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? "Enviando..." : `Enviar para ${audienceCount}`}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg animate-fade-in z-[60] ${
          toast.type === "success"
            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
            : "bg-red-500/15 border-red-500/30 text-red-400"
        }`}>
          {toast.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          <span className="text-xs font-medium">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, onClick, title }: { icon: typeof Bold; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
    >
      <Icon size={13} />
    </button>
  );
}
