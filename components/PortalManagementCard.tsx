"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2, Copy, Check, RotateCcw, X, ExternalLink,
  Phone, MessageSquare, Eye, Clock,
} from "lucide-react";
import type { Client } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import QRCode from "qrcode";

const PORTAL_DOMAIN =
  process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "https://resultados.lonemidia.com";

interface Props {
  client: Client;
  onUpdate: (patch: Partial<Client>) => void;
}

type UIState = "idle" | "loading" | "confirm_revoke" | "confirm_rotate";

interface PortalStats {
  total_accesses: number;
  last_accessed_at: string | null;
}

export default function PortalManagementCard({ client, onUpdate }: Props) {
  const [uiState, setUiState]           = useState<UIState>("idle");
  const [copied, setCopied]             = useState(false);
  const [copiedWa, setCopiedWa]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [qrSvg, setQrSvg]               = useState<string | null>(null);
  const [stats, setStats]               = useState<PortalStats | null>(null);
  const [whatsapp, setWhatsapp]         = useState(client.whatsappTeamPhone ?? "");
  const [welcomeMsg, setWelcomeMsg]     = useState(client.portalWelcomeMessage ?? "");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved]   = useState(false);

  const token   = client.publicReportToken;
  const revoked = !!client.publicReportTokenRevokedAt;
  const active  = !!token && !revoked;

  const portalUrl = token ? `${PORTAL_DOMAIN}/portal/${token}` : null;

  const createdAt = client.publicReportTokenCreatedAt
    ? new Date(client.publicReportTokenCreatedAt).toLocaleDateString("pt-BR")
    : null;
  const revokedAt = client.publicReportTokenRevokedAt
    ? new Date(client.publicReportTokenRevokedAt).toLocaleDateString("pt-BR")
    : null;
  const lastAccess = stats?.last_accessed_at
    ? new Date(stats.last_accessed_at).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  // QR code — gerado client-side via qrcode lib
  useEffect(() => {
    if (!portalUrl) { setQrSvg(null); return; }
    QRCode.toString(portalUrl, { type: "svg", margin: 1, width: 120 })
      .then(setQrSvg)
      .catch(() => setQrSvg(null));
  }, [portalUrl]);

  // Mini-stats de acesso ao portal
  const fetchStats = useCallback(async () => {
    if (!active) return;
    try {
      const res = await authedFetch(`/api/clients/${client.id}/portal/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [active, client.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Sincroniza campos de configuração quando client muda externamente
  useEffect(() => {
    setWhatsapp(client.whatsappTeamPhone ?? "");
    setWelcomeMsg(client.portalWelcomeMessage ?? "");
  }, [client.whatsappTeamPhone, client.portalWelcomeMessage]);

  async function callAction(endpoint: string) {
    setUiState("loading");
    setError(null);
    try {
      const res = await authedFetch(`/api/clients/${client.id}/portal/${endpoint}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      if (json.token) {
        onUpdate({
          publicReportToken: json.token,
          publicReportTokenCreatedAt: new Date().toISOString(),
          publicReportTokenRevokedAt: undefined,
          publicReportEnabled: true,
        });
        setStats(null);
      } else {
        onUpdate({
          publicReportTokenRevokedAt: new Date().toISOString(),
          publicReportEnabled: false,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao executar ação");
    } finally {
      setUiState("idle");
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/clients/${client.id}/portal/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_team_phone: whatsapp,
          portal_welcome_message: welcomeMsg,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Erro ao salvar");
      }
      onUpdate({ whatsappTeamPhone: whatsapp, portalWelcomeMessage: welcomeMsg });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar configurações");
    } finally {
      setSavingSettings(false);
    }
  }

  async function copyUrl() {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyWhatsAppMessage() {
    if (!portalUrl) return;
    const phone = whatsapp || client.whatsappTeamPhone || "5522981530700";
    const teamLine = `\n\nDúvidas? Fale com a equipe: wa.me/${phone}`;
    const welcome = welcomeMsg || client.portalWelcomeMessage || "";
    const text =
      (welcome ? `${welcome}\n\n` : `Olá! Preparamos seu painel de resultados da Lone Mídia.\n\n`) +
      `Acesse a qualquer momento pelo link exclusivo:\n${portalUrl}` +
      teamLine;
    await navigator.clipboard.writeText(text);
    setCopiedWa(true);
    setTimeout(() => setCopiedWa(false), 2000);
  }

  const settingsDirty =
    whatsapp !== (client.whatsappTeamPhone ?? "") ||
    welcomeMsg !== (client.portalWelcomeMessage ?? "");

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ExternalLink size={14} className="text-[#0d4af5]" />
        <h3 className="font-semibold text-sm text-foreground">Portal do Cliente</h3>
        {active && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Ativo desde {createdAt}
          </span>
        )}
      </div>

      {/* ── Sem token ─────────────────────────────────────────────────────── */}
      {!token && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Gere um link exclusivo para que o cliente acesse seus resultados de anúncios em
            tempo real — sem login, sem senhas.
          </p>
          <button
            onClick={() => callAction("generate-token")}
            disabled={uiState === "loading"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] text-white text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <Link2 size={13} />
            {uiState === "loading" ? "Gerando…" : "Ativar portal do cliente"}
          </button>
        </div>
      )}

      {/* ── Token ativo ───────────────────────────────────────────────────── */}
      {active && (
        <div className="space-y-4">

          {/* URL + QR code */}
          <div className="flex gap-4 items-start">
            <div className="flex-1 space-y-2 min-w-0">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                Link exclusivo
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={portalUrl ?? ""}
                  className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-mono truncate focus:outline-none"
                />
                <button
                  onClick={copyUrl}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-zinc-400 text-[11px] hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {copied
                    ? <Check size={12} className="text-emerald-400" />
                    : <Copy size={12} />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>

            {/* QR code SVG */}
            {qrSvg && (
              <div
                className="shrink-0 p-1.5 bg-white rounded-lg overflow-hidden"
                style={{ width: 72, height: 72 }}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
          </div>

          {/* Mini-stats */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Eye size={11} className="text-zinc-600" />
              <strong className="text-zinc-300">{stats?.total_accesses ?? "—"}</strong>
              {" "}acesso{stats?.total_accesses !== 1 ? "s" : ""}
            </span>
            {lastAccess ? (
              <span className="flex items-center gap-1.5">
                <Clock size={11} className="text-zinc-600" />
                Último: {lastAccess}
              </span>
            ) : stats !== null ? (
              <span className="text-zinc-600">Nenhum acesso ainda</span>
            ) : null}
          </div>

          {/* Configurações */}
          <div className="space-y-3 pt-3 border-t border-border">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
              Configurações do portal
            </p>

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <Phone size={11} /> Telefone WhatsApp da equipe
              </label>
              <input
                type="tel"
                placeholder="5521999999999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50"
              />
              <p className="text-[10px] text-zinc-600">
                Formato internacional sem + (ex: 5521999999999)
              </p>
            </div>

            <div className="space-y-1">
              <label className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <MessageSquare size={11} /> Mensagem de boas-vindas
                </span>
                <span className={welcomeMsg.length > 250 ? "text-red-400" : "text-zinc-600"}>
                  {welcomeMsg.length}/280
                </span>
              </label>
              <textarea
                placeholder="Ex: Olá! Aqui você acompanha seus resultados em tempo real. Qualquer dúvida, fale comigo!"
                value={welcomeMsg}
                maxLength={280}
                rows={3}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>

            {settingsDirty && (
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5] text-white text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {savingSettings ? "Salvando…" : settingsSaved
                  ? <><Check size={12} /> Salvo!</>
                  : "Salvar configurações"}
              </button>
            )}
          </div>

          {/* Ações */}
          <div className="pt-3 border-t border-border space-y-2.5">
            <button
              onClick={copyWhatsAppMessage}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
            >
              {copiedWa
                ? <><Check size={12} /> Copiado!</>
                : <><MessageSquare size={12} /> Copiar mensagem WhatsApp para o cliente</>}
            </button>

            {uiState === "confirm_rotate" ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-yellow-400">
                  O link atual vai parar de funcionar. Confirmar?
                </span>
                <button
                  onClick={() => callAction("rotate")}
                  className="px-2.5 py-1 rounded-md bg-yellow-500/20 text-yellow-400 text-[11px] font-semibold hover:bg-yellow-500/30 transition-colors"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setUiState("idle")}
                  className="px-2.5 py-1 rounded-md bg-surface text-zinc-400 text-[11px] hover:bg-muted/20 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : uiState === "confirm_revoke" ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-red-400">
                  Isso desativa o portal. Tem certeza?
                </span>
                <button
                  onClick={() => callAction("revoke")}
                  className="px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 text-[11px] font-semibold hover:bg-red-500/30 transition-colors"
                >
                  Sim, revogar
                </button>
                <button
                  onClick={() => setUiState("idle")}
                  className="px-2.5 py-1 rounded-md bg-surface text-zinc-400 text-[11px] hover:bg-muted/20 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setUiState("confirm_rotate")}
                  disabled={uiState === "loading"}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-zinc-400 text-[11px] hover:bg-muted/20 border border-border transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={11} /> Rotacionar token
                </button>
                <button
                  onClick={() => setUiState("confirm_revoke")}
                  disabled={uiState === "loading"}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-red-400 text-[11px] hover:bg-red-500/10 border border-border transition-colors disabled:opacity-50"
                >
                  <X size={11} /> Revogar acesso
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Revogado ──────────────────────────────────────────────────────── */}
      {revoked && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Portal desativado em {revokedAt}. O link anterior não funciona mais.
          </p>
          <button
            onClick={() => callAction("generate-token")}
            disabled={uiState === "loading"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] text-white text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <Link2 size={13} />
            {uiState === "loading" ? "Gerando…" : "Reativar com novo link"}
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
