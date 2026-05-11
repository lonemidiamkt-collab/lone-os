"use client";

import { useState } from "react";
import { Link2, Copy, Check, RotateCcw, X, ExternalLink } from "lucide-react";
import type { Client } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";

const BASE_URL =
  process.env.NEXT_PUBLIC_REPORT_DOMAIN ?? "https://painel.lonemidia.com";

interface Props {
  client: Client;
  onUpdate: (patch: Partial<Client>) => void;
}

type UIState = "idle" | "loading" | "confirm_revoke" | "confirm_rotate";

export default function PublicReportCard({ client, onUpdate }: Props) {
  const [state, setState] = useState<UIState>("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token   = client.publicReportToken;
  const enabled = client.publicReportEnabled ?? false;
  const revoked = !!client.publicReportTokenRevokedAt;
  const active  = !!token && enabled && !revoked;
  const suspended = !!token && !enabled && !revoked;

  const reportUrl = token ? `${BASE_URL}/relatorio/${token}` : null;

  const createdAt = client.publicReportTokenCreatedAt
    ? new Date(client.publicReportTokenCreatedAt).toLocaleDateString("pt-BR")
    : null;

  const revokedAt = client.publicReportTokenRevokedAt
    ? new Date(client.publicReportTokenRevokedAt).toLocaleDateString("pt-BR")
    : null;

  async function call(endpoint: string) {
    setState("loading");
    setError(null);
    try {
      const res = await authedFetch(
        `/api/clients/${client.id}/public-report/${endpoint}`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      // Patch local state from response
      if (json.token) {
        onUpdate({
          publicReportToken: json.token,
          publicReportTokenCreatedAt: new Date().toISOString(),
          publicReportTokenRevokedAt: undefined,
          publicReportEnabled: true,
        });
      } else {
        // revoke
        onUpdate({
          publicReportTokenRevokedAt: new Date().toISOString(),
          publicReportEnabled: false,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao executar ação");
    } finally {
      setState("idle");
    }
  }

  async function copyUrl() {
    if (!reportUrl) return;
    await navigator.clipboard.writeText(reportUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const waMessage = encodeURIComponent(
    `Olá! Preparamos seu relatório semanal da Lone Mídia.\n` +
    `Você pode acessar a qualquer hora pelo link exclusivo:\n${reportUrl}\n\n` +
    `Atualizamos toda segunda-feira. Qualquer dúvida é só me chamar! 😊`
  );
  const waHref = client.whatsappTeamPhone
    ? `https://wa.me/${client.whatsappTeamPhone.replace(/\D/g, "")}?text=${waMessage}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 size={14} className="text-[#0d4af5]" />
        <span className="text-xs font-700 text-foreground">Portal Público de Resultados</span>
        {active && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-600 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Ativo
          </span>
        )}
        {suspended && (
          <span className="ml-auto text-[10px] font-600 text-yellow-400">Suspenso</span>
        )}
        {revoked && (
          <span className="ml-auto text-[10px] font-600 text-red-400">Revogado</span>
        )}
      </div>

      {/* Sem token ainda */}
      {!token && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">
            Nenhum link gerado. Gere um link único para este cliente acessar
            os resultados semanais sem login.
          </p>
          <button
            onClick={() => call("generate-token")}
            disabled={state === "loading"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5] text-white text-xs font-600 hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <Link2 size={11} />
            {state === "loading" ? "Gerando…" : "Gerar link público"}
          </button>
        </div>
      )}

      {/* Token ativo ou suspenso */}
      {token && !revoked && (
        <div className="space-y-2.5">
          {/* URL */}
          <div className="flex items-center gap-2 bg-raised rounded-lg px-3 py-2 border border-border">
            <span className="text-[11px] text-zinc-400 truncate flex-1 font-mono">{reportUrl}</span>
            <button onClick={copyUrl} title="Copiar URL"
              className="text-zinc-500 hover:text-[#0d4af5] transition-colors flex-shrink-0">
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
            {reportUrl && (
              <a href={reportUrl} target="_blank" rel="noopener noreferrer"
                title="Abrir portal" className="text-zinc-500 hover:text-[#0d4af5] transition-colors flex-shrink-0">
                <ExternalLink size={13} />
              </a>
            )}
          </div>

          {createdAt && (
            <p className="text-[10px] text-zinc-600">Link gerado em {createdAt}</p>
          )}

          {/* Ações */}
          {state === "confirm_revoke" ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-red-400">Confirmar revogação?</span>
              <button onClick={() => call("revoke")}
                className="px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 text-[11px] font-600 hover:bg-red-500/30 transition-colors">
                Sim, revogar
              </button>
              <button onClick={() => setState("idle")}
                className="px-2.5 py-1 rounded-md bg-surface text-zinc-400 text-[11px] hover:bg-muted/20 transition-colors">
                Cancelar
              </button>
            </div>
          ) : state === "confirm_rotate" ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-yellow-400">Gerar novo token? O link atual parará de funcionar.</span>
              <button onClick={() => call("rotate")}
                className="px-2.5 py-1 rounded-md bg-yellow-500/20 text-yellow-400 text-[11px] font-600 hover:bg-yellow-500/30 transition-colors">
                Confirmar
              </button>
              <button onClick={() => setState("idle")}
                className="px-2.5 py-1 rounded-md bg-surface text-zinc-400 text-[11px] hover:bg-muted/20 transition-colors">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-600 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Copiar mensagem WhatsApp
                </a>
              )}
              <button onClick={() => setState("confirm_rotate")} disabled={state === "loading"}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-zinc-400 text-[11px] hover:bg-muted/20 border border-border transition-colors disabled:opacity-50">
                <RotateCcw size={11} />
                Rotacionar token
              </button>
              <button onClick={() => setState("confirm_revoke")} disabled={state === "loading"}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-red-400 text-[11px] hover:bg-red-500/10 border border-border transition-colors disabled:opacity-50">
                <X size={11} />
                Revogar acesso
              </button>
            </div>
          )}
        </div>
      )}

      {/* Token revogado */}
      {revoked && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">
            Portal desativado em {revokedAt}. O link anterior não funciona mais.
          </p>
          <button onClick={() => call("generate-token")} disabled={state === "loading"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5] text-white text-xs font-600 hover:bg-blue-600 transition-colors disabled:opacity-50">
            <Link2 size={11} />
            {state === "loading" ? "Gerando…" : "Reativar com novo link"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-400">{error}</p>
      )}
    </div>
  );
}
