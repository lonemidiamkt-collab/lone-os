"use client";

import { useState } from "react";
import {
  Plug, CheckCircle, XCircle, AlertTriangle, Facebook, RefreshCw, Clock, Loader2, Trash2,
} from "lucide-react";
import { useMetaConnection } from "@/lib/meta/useMetaAds";

// Só a conexão que existe de verdade: a Meta. Os outros 10 cartões, o log de webhook e as URLs eram
// simulados no navegador (localStorage + Math.random) e davam a impressão de integrações que não há.

function formatExpira(ms: number): string {
  const d = new Date(ms);
  const dias = Math.ceil((ms - Date.now()) / 86_400_000);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
  return dias <= 0 ? `hoje (${data})` : `${data} · em ${dias} dia${dias === 1 ? "" : "s"}`;
}

export default function IntegrationsPage() {
  const meta = useMetaConnection();
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);

  const status = meta.loading ? "loading" : meta.tokenExpired ? "expired" : meta.connected ? "connected" : "disconnected";
  const STATUS = {
    loading:      { label: "Verificando…", color: "text-muted-foreground bg-muted border-border", icon: Loader2 },
    connected:    { label: "Conectado",    color: "text-lone-success bg-lone-success-bg border-lone-success-border", icon: CheckCircle },
    disconnected: { label: "Desconectado", color: "text-muted-foreground bg-muted border-border", icon: XCircle },
    expired:      { label: "Token expirado", color: "text-lone-warning bg-lone-warning-bg border-lone-warning-border", icon: AlertTriangle },
  }[status];
  const StatusIcon = STATUS.icon;
  // Aviso antes de vencer: sem token, todo sync/alerta de verba para em silêncio.
  const venceEmBreve = meta.connected && meta.tokenExpiresAt != null && meta.tokenExpiresAt - Date.now() < 7 * 86_400_000;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Plug size={24} className="text-primary" />
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conexão do painel com a Meta. O sistema só lê dados de anúncios; nada é alterado nas campanhas.
        </p>
      </div>

      <div className={`card border max-w-2xl ${status === "connected" ? "border-primary/20" : "border-border"}`}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Facebook size={22} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">Meta Ads (Facebook/Instagram)</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${STATUS.color}`}>
                <StatusIcon size={9} className={status === "loading" ? "animate-spin" : ""} /> {STATUS.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Campanhas, métricas, saldos e criativos das contas de anúncio.</p>

            {meta.connected && (
              <p className={`text-[11px] mt-2 flex items-center gap-1 ${venceEmBreve ? "text-lone-warning" : "text-muted-foreground"}`}>
                <Clock size={10} />
                {meta.tokenExpiresAt != null
                  ? <>Token vence {formatExpira(meta.tokenExpiresAt)}{venceEmBreve ? " — reconecte para não parar o sync" : ""}</>
                  : "Token sem data de vencimento informada"}
              </p>
            )}
            {status === "expired" && (
              <p className="text-[11px] mt-2 text-lone-warning">
                O token venceu: saldos, alertas de verba e relatórios param de atualizar até reconectar.
              </p>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {(status === "disconnected" || status === "expired") && (
                <button
                  onClick={() => meta.connect()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all"
                >
                  {status === "expired" ? <RefreshCw size={12} /> : <Facebook size={12} />}
                  {status === "expired" ? "Reconectar" : "Conectar ao Facebook"}
                </button>
              )}
              {status === "connected" && (
                <>
                  <button
                    onClick={() => meta.connect()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-hover transition-all"
                  >
                    <RefreshCw size={12} /> Reconectar
                  </button>
                  <button
                    onClick={() => setConfirmarDesconexao(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lone-danger-bg text-lone-danger text-xs font-medium border border-lone-danger-border hover:opacity-80 transition-all"
                  >
                    <XCircle size={12} /> Desconectar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmarDesconexao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl animate-slide-up p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-lone-danger-bg flex items-center justify-center">
                <AlertTriangle size={20} className="text-lone-danger" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Desconectar a Meta?</h3>
                <p className="text-[10px] text-muted-foreground">Meta Ads (Facebook/Instagram)</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Saldos, alertas de verba, Defesa Ativa e relatórios param de atualizar até alguém reconectar.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmarDesconexao(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-hover transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => { meta.disconnect(); setConfirmarDesconexao(false); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-lone-danger-bg text-lone-danger text-xs font-medium border border-lone-danger-border hover:opacity-80 transition-all"
              >
                <Trash2 size={12} /> Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
