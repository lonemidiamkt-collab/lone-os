"use client";

// Sistema › Conexão Meta — a única integração que existe de verdade (Leva 4; antes /integrations,
// que tinha mais 10 cartões simulados). O token é da AGÊNCIA: alimenta saldos, alertas de verba,
// Defesa Ativa, relatórios, portal e a aba Anúncios Meta.
//
// O estado mostrado vem do servidor (/api/trafego/conexao-meta) para todo papel do tráfego. Reconectar
// e desconectar gravam o token, e isso só o admin faz (/api/meta/token). O login da Meta volta para
// /traffic, que repassa para cá (components/trafego/RetornoConexaoMeta.tsx).

import { useCallback, useEffect, useState } from "react";
import {
  Plug, CheckCircle, XCircle, AlertTriangle, Facebook, RefreshCw, Clock, Loader2, Trash2, Lock,
} from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useMetaConnection } from "@/lib/meta/useMetaAds";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import type { EstadoConexao } from "@/lib/trafego/anuncios";

interface StatusServidor { estado: EstadoConexao; expiraEm: number | null; tipo: "short" | "long" | null }

function formatExpira(ms: number): string {
  const d = new Date(ms);
  const dias = Math.ceil((ms - Date.now()) / 86_400_000);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
  return dias <= 0 ? `hoje (${data})` : `${data} · em ${dias} dia${dias === 1 ? "" : "s"}`;
}

export default function ConexaoMetaPage() {
  const { role } = useRole();
  // Gravar o token é só do admin (/api/meta/token confere no servidor).
  const podeGravar = role === "admin";
  // O hook também processa o retorno do login (#access_token) e troca pelo token longo.
  const meta = useMetaConnection();
  const [status, setStatus] = useState<StatusServidor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar<StatusServidor>("/api/trafego/conexao-meta");
    if (!r.ok || !r.data) { setErro(r.erro); return; }
    setErro(null);
    setStatus(r.data);
  }, []);

  // Relê quando o hook termina (login novo, troca por token longo, desconexão).
  useEffect(() => { if (!meta.loading) carregar(); }, [meta.loading, meta.connected, meta.tokenType, carregar]);

  const estado = !status ? "loading" : status.estado === "ok" ? "connected" : status.estado === "expirada" ? "expired" : "disconnected";
  const STATUS = {
    loading:      { label: "Verificando…",   cls: "text-muted-foreground bg-muted border-border", icon: Loader2 },
    connected:    { label: "Conectada",      cls: "text-lone-success bg-lone-success-bg border-lone-success-border", icon: CheckCircle },
    disconnected: { label: "Desconectada",   cls: "text-muted-foreground bg-muted border-border", icon: XCircle },
    expired:      { label: "Token expirado", cls: "text-lone-warning bg-lone-warning-bg border-lone-warning-border", icon: AlertTriangle },
  }[estado];
  const StatusIcon = STATUS.icon;
  // Aviso antes de vencer: sem token, todo sync/alerta de verba para em silêncio.
  const venceEmBreve = estado === "connected" && status?.expiraEm != null && status.expiraEm - Date.now() < 7 * 86_400_000;

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <Header title="Conexão Meta" subtitle="Sistema" />
      <div className="animate-fade-in space-y-6 p-6">
        <div className="max-w-2xl">
          <h1 className="flex items-center gap-2 text-lone-h1 tracking-tight text-foreground">
            <Plug size={20} className="text-primary" /> Conexão Meta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O painel só lê dados de anúncios; nada é alterado nas campanhas. Esta conexão alimenta saldos, alertas de verba,
            Defesa Ativa, relatórios, o portal do cliente e a aba Anúncios Meta.
          </p>
        </div>

        {erro && (
          <div className="max-w-2xl rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">{erro}</div>
        )}

        <div className={`card max-w-2xl ${estado === "connected" ? "border-primary/20" : ""}`}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Facebook size={22} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <h3 className="text-lone-h2 text-foreground">Meta Ads (Facebook/Instagram)</h3>
                <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS.cls}`}>
                  <StatusIcon size={9} className={estado === "loading" ? "animate-spin" : ""} /> {STATUS.label}
                </span>
                {status?.tipo === "short" && estado === "connected" && (
                  <span className="rounded-full border border-lone-warning-border bg-lone-warning-bg px-2 py-0.5 text-[10px] font-medium text-lone-warning">token curto (~1h)</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Campanhas, métricas, saldos e criativos das contas de anúncio.</p>

              {estado === "connected" && (
                <p className={`mt-2 flex items-center gap-1 text-[11px] ${venceEmBreve ? "text-lone-warning" : "text-muted-foreground"}`}>
                  <Clock size={10} />
                  {status?.expiraEm != null
                    ? <>Token vence {formatExpira(status.expiraEm)}{venceEmBreve ? " — reconecte para não parar o sync" : ""}</>
                    : "Token sem data de vencimento informada"}
                </p>
              )}
              {estado === "expired" && (
                <p className="mt-2 text-[11px] text-lone-warning">
                  O token venceu: saldos, alertas de verba, anúncios e relatórios param de atualizar até reconectar.
                </p>
              )}
              {meta.exchangeFailed && (
                <p className="mt-2 text-[11px] text-destructive">
                  A troca pelo token longo falhou — o token atual dura cerca de 1h. Confira META_APP_SECRET e reconecte.
                </p>
              )}

              {podeGravar ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {estado !== "connected" && estado !== "loading" && (
                    <Button size="sm" onClick={() => meta.connect()}>
                      {estado === "expired" ? <RefreshCw /> : <Facebook />}
                      {estado === "expired" ? "Reconectar" : "Conectar ao Facebook"}
                    </Button>
                  )}
                  {estado === "connected" && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => meta.connect()} title="Refaz o login pedindo as permissões atuais (Instagram etc.)">
                        <RefreshCw /> Reconectar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setConfirmarDesconexao(true)}>
                        <XCircle /> Desconectar
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                estado !== "loading" && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock size={11} /> Só um admin conecta ou reconecta a Meta{estado !== "connected" ? " — avise a gestão" : ""}.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmarDesconexao && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm animate-slide-up space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lone-danger-bg">
                <AlertTriangle size={20} className="text-lone-danger" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Desconectar a Meta?</h3>
                <p className="text-[10px] text-muted-foreground">Meta Ads (Facebook/Instagram)</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Saldos, alertas de verba, Defesa Ativa, anúncios e relatórios param de atualizar até alguém reconectar.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmarDesconexao(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={async () => { await meta.disconnect(); setConfirmarDesconexao(false); carregar(); }}
              >
                <Trash2 /> Desconectar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
