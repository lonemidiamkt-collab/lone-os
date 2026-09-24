"use client";

// components/saude/ProximaAcaoEditor.tsx — a próxima ação de UM cliente, com Confirmar / Editar / Feita.
//
// O sistema preenche (lib/clientes/proxima-acao.ts: a recomendação do feed de prioridades, ou o texto
// da saúde); a pessoa só confirma ou corrige. Usado na Saúde da carteira e pronto para a ficha do
// cliente: recebe a ProximaAcao de GET /api/clientes/proxima-acao ou de /api/saude/carteira.

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { ProximaAcao } from "@/lib/clientes/proxima-acao";

interface RespostaPost { ok?: boolean; proximaAcao: ProximaAcao | null; podeEditar?: boolean }

const ddmm = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
};
const primeiro = (nome: string | null) => (nome ?? "").trim().split(/\s+/)[0] || null;

export default function ProximaAcaoEditor({
  clientId, proximaAcao: pa, podeEditar, onAtualizar, className,
}: {
  clientId: string;
  proximaAcao: ProximaAcao;
  podeEditar: boolean;
  /** Recebe a próxima ação já recalculada pelo servidor depois de gravar. */
  onAtualizar?: (pa: ProximaAcao) => void;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [ocupado, setOcupado] = useState<null | "confirmar" | "editar" | "concluir">(null);

  const enviar = async (acao: "confirmar" | "editar" | "concluir", extra: Record<string, unknown> = {}) => {
    setOcupado(acao);
    const r = await chamar<RespostaPost>("/api/clientes/proxima-acao", { clientId, acao, ...extra });
    setOcupado(null);
    if (!r.ok || !r.data?.proximaAcao) {
      toast.error(r.erro ?? "Não consegui gravar a próxima ação.");
      return false;
    }
    onAtualizar?.(r.data.proximaAcao);
    toast.success(acao === "confirmar" ? "Próxima ação confirmada." : acao === "editar" ? "Próxima ação salva." : "Marcada como feita.");
    return true;
  };

  const abrirEdicao = () => {
    setTexto(pa.texto ?? "");
    setResponsavel(pa.responsavel ?? "");
    setPrazo(pa.prazo ?? "");
    setEditando(true);
  };

  const salvar = async () => {
    if (!texto.trim()) { toast.error("Escreva a próxima ação."); return; }
    if (await enviar("editar", { texto, responsavel: responsavel || null, prazo: prazo || null })) setEditando(false);
  };

  if (editando) {
    return (
      <div className={cn("space-y-2 rounded-lg border border-border bg-background p-3", className)}>
        <label className="block text-lone-caption text-muted-foreground" htmlFor={`pa-${clientId}`}>Próxima ação</label>
        <Input id={`pa-${clientId}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} autoFocus
          placeholder="Ex.: ligar para combinar a reunião do mês e levar o resultado de setembro" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-lone-caption text-muted-foreground" htmlFor={`pa-resp-${clientId}`}>Responsável</label>
            <Input id={`pa-resp-${clientId}`} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </div>
          <div>
            <label className="block text-lone-caption text-muted-foreground" htmlFor={`pa-prazo-${clientId}`}>Prazo</label>
            <Input id={`pa-prazo-${clientId}`} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setEditando(false)} disabled={!!ocupado}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
            <X size={13} aria-hidden /> Cancelar
          </button>
          <button type="button" onClick={() => void salvar()} disabled={!!ocupado}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {ocupado === "editar" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />} Salvar
          </button>
        </div>
      </div>
    );
  }

  // ── Leitura ────────────────────────────────────────────────────────────
  const sugerida = pa.estado === "sugerida";
  const nenhuma = pa.estado === "nenhuma";
  const quem = primeiro(pa.confirmadaPor);
  const legenda = sugerida
    ? `Sugerida pelo sistema${pa.fonte ? ` · ${pa.fonte}` : ""}`
    : pa.estado === "confirmada"
      ? [
          pa.origem === "sistema" ? "Confirmada" : "Escrita",
          quem ? `por ${quem}` : null,
          pa.confirmadaEm ? `em ${ddmm(pa.confirmadaEm)}` : null,
        ].filter(Boolean).join(" ")
      : null;

  const botao = "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className={cn("rounded-lg bg-muted/40 px-3 py-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-lone-eyebrow uppercase text-muted-foreground">
            {sugerida ? <Sparkles size={11} className="text-primary" aria-hidden /> : <ArrowRight size={11} aria-hidden />}
            Próxima ação
            {legenda && <span className="normal-case tracking-normal">· {legenda}</span>}
          </p>
          {nenhuma ? (
            <p className="mt-0.5 text-lone-caption text-muted-foreground">Nada pendente: cliente saudável e sem item aberto no feed.</p>
          ) : (
            <>
              <p className={cn("mt-0.5 text-lone-body leading-snug", sugerida ? "text-foreground/90" : "text-foreground")}>{pa.texto}</p>
              <p className="mt-0.5 text-lone-caption text-muted-foreground">
                {[
                  pa.porque ? `Por quê: ${pa.porque}` : null,
                  pa.responsavel ? `Com ${pa.responsavel}` : null,
                ].filter(Boolean).join(" · ")}
                {pa.prazo && (
                  <span className={cn(pa.vencida && "font-medium text-lone-warning")}>
                    {(pa.porque || pa.responsavel) ? " · " : ""}{pa.vencida ? "venceu " : "até "}{ddmm(pa.prazo)}
                  </span>
                )}
              </p>
            </>
          )}
        </div>

        {podeEditar && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {sugerida && (
              <button type="button" onClick={() => void enviar("confirmar", { fingerprint: pa.fingerprint })} disabled={!!ocupado}
                className={cn(botao, "bg-primary text-primary-foreground hover:opacity-90")}>
                {ocupado === "confirmar" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />} Confirmar
              </button>
            )}
            {pa.estado === "confirmada" && (
              <button type="button" onClick={() => void enviar("concluir")} disabled={!!ocupado}
                className={cn(botao, "border border-border text-foreground hover:border-lone-success-border hover:bg-lone-success-bg hover:text-lone-success")}
                title="Feita: limpa a próxima ação e o sistema sugere a seguinte">
                {ocupado === "concluir" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <CheckCircle2 size={12} aria-hidden />} Feita
              </button>
            )}
            <button type="button" onClick={abrirEdicao} disabled={!!ocupado}
              className={cn(botao, "border border-border text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Pencil size={12} aria-hidden /> {nenhuma ? "Escrever" : "Editar"}
            </button>
          </div>
        )}
      </div>

      {pa.estado === "confirmada" && pa.outraSugestao && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-lone-caption text-muted-foreground">
            <AlertTriangle size={11} className="-mt-px mr-1 inline text-lone-warning" aria-hidden />
            O sistema agora sugere: <span className="text-foreground">{pa.outraSugestao.texto}</span>
            {pa.outraSugestao.porque ? ` (${pa.outraSugestao.porque})` : ""}
          </p>
          {podeEditar && (
            <button type="button" onClick={() => void enviar("confirmar", { fingerprint: pa.outraSugestao?.fingerprint ?? null })} disabled={!!ocupado}
              className={cn(botao, "shrink-0 self-start border border-border text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary sm:self-center")}>
              Trocar por esta
            </button>
          )}
        </div>
      )}
    </div>
  );
}
