"use client";

import { useState } from "react";
import {
  Plug, CheckCircle, XCircle, AlertTriangle, ExternalLink,
  Facebook, RefreshCw, Clock,
} from "lucide-react";
import { useMetaConnection } from "@/lib/meta/useMetaAds";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: "connected" | "disconnected" | "expired" | "coming_soon";
  lastSync?: string;
}

export default function IntegrationsPage() {
  const meta = useMetaConnection();

  const integrations: Integration[] = [
    {
      id: "meta",
      name: "Meta Ads (Facebook/Instagram)",
      description: "Campanhas, métricas e insights em tempo real",
      icon: "📘",
      status: meta.connected ? (meta.tokenExpired ? "expired" : "connected") : "disconnected",
      lastSync: meta.connected ? "Conectado" : undefined,
    },
    { id: "google-ads", name: "Google Ads", description: "Campanhas de Search, Display e YouTube", icon: "🔍", status: "coming_soon" },
    { id: "google-analytics", name: "Google Analytics", description: "Tráfego do site e conversões", icon: "📊", status: "coming_soon" },
    { id: "instagram-api", name: "Instagram Graph API", description: "Métricas de perfil e posts orgânicos", icon: "📸", status: "coming_soon" },
    { id: "tiktok", name: "TikTok Ads", description: "Campanhas e métricas TikTok", icon: "🎵", status: "coming_soon" },
    { id: "slack", name: "Slack / Discord", description: "Notificações em canais de equipe", icon: "💬", status: "coming_soon" },
    { id: "zapier", name: "Zapier / Webhooks", description: "Automações e integrações customizadas", icon: "⚡", status: "coming_soon" },
  ];

  const STATUS_CONFIG = {
    connected:   { label: "Conectado",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
    disconnected: { label: "Desconectado", color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20", icon: XCircle },
    expired:     { label: "Expirado",   color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
    coming_soon: { label: "Em breve",   color: "text-zinc-700 bg-zinc-800/50 border-zinc-800", icon: Clock },
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Plug size={24} className="text-[#0a34f5]" />
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie conexões com plataformas externas
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle size={12} className="text-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">{integrations.filter((i) => i.status === "connected").length} ativa(s)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 border border-zinc-500/20">
          <Clock size={12} className="text-zinc-500" />
          <span className="text-xs text-zinc-500 font-medium">{integrations.filter((i) => i.status === "coming_soon").length} em breve</span>
        </div>
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => {
          const config = STATUS_CONFIG[integration.status];
          const StatusIcon = config.icon;
          const isMeta = integration.id === "meta";

          return (
            <div
              key={integration.id}
              className={`card border transition-all ${
                integration.status === "coming_soon"
                  ? "opacity-50 border-zinc-800"
                  : integration.status === "connected"
                  ? "border-[#0a34f5]/20 hover:border-[#0a34f5]/40 hover:shadow-[0_0_20px_rgba(10,52,245,0.08)]"
                  : "border-border hover:border-zinc-600"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                  {integration.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-foreground">{integration.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${config.color}`}>
                      <StatusIcon size={9} /> {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>

                  {/* Meta-specific actions */}
                  {isMeta && (
                    <div className="flex items-center gap-2 mt-3">
                      {!meta.connected ? (
                        <button
                          onClick={meta.connect}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1877F2] text-white text-xs font-medium hover:bg-[#1877F2]/80 transition-all"
                        >
                          <Facebook size={12} /> Conectar ao Facebook
                        </button>
                      ) : meta.tokenExpired ? (
                        <button
                          onClick={meta.connect}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                        >
                          <RefreshCw size={12} /> Reconectar
                        </button>
                      ) : (
                        <button
                          onClick={meta.disconnect}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all"
                        >
                          <XCircle size={12} /> Desconectar
                        </button>
                      )}
                    </div>
                  )}

                  {integration.status === "coming_soon" && (
                    <p className="text-[10px] text-zinc-700 mt-2">Esta integração estará disponível em breve.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
