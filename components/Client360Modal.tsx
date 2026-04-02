"use client";

import { useState } from "react";
import {
  Instagram, Link as LinkIcon, Smile,
  MessageCircle, Sparkles, Megaphone,
  ChevronRight, Key, Palette,
} from "lucide-react";
import Link from "next/link";
import { useAppState } from "@/lib/context/AppStateContext";
import type { Client } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const HEALTH_CONFIG: Record<string, { label: string; icon: string; variant: "success" | "warning" | "danger" | "secondary" }> = {
  good:       { label: "On Fire",    icon: "🟢", variant: "success" },
  average:    { label: "Atenção",    icon: "🟡", variant: "warning" },
  at_risk:    { label: "Crítico",    icon: "🔴", variant: "danger" },
  onboarding: { label: "Onboarding", icon: "🆕", variant: "secondary" },
};

const MOOD_CONFIG = {
  happy:   { emoji: "😄", label: "Satisfeito", color: "text-[#0a34f5]" },
  neutral: { emoji: "😐", label: "Neutro",     color: "text-[#3b6ff5]" },
  angry:   { emoji: "😠", label: "Irritado",   color: "text-red-400" },
};

const TONE_LABELS: Record<string, string> = {
  formal: "Formal", funny: "Engraçado", authoritative: "Autoritário", casual: "Casual",
};

interface Props {
  client: Client;
  onClose: () => void;
  onOpenIdeas: () => void;
  onOpenCampaign: () => void;
  onOpenMood: () => void;
}

export default function Client360Modal({ client, onClose, onOpenIdeas, onOpenCampaign, onOpenMood }: Props) {
  const { clientChats, moodHistory, onboarding, timeline, clientAccess, designRequests } = useAppState();
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const health = HEALTH_CONFIG[client.status] ?? HEALTH_CONFIG.good;

  const recentChats = (clientChats[client.id] ?? []).slice(-3);
  const moods = moodHistory[client.id] ?? [];
  const lastMood = moods[0];

  const postsNow = client.postsThisMonth ?? 0;
  const postsGoal = client.postsGoal ?? 12;
  const postsPct = Math.min(100, Math.round((postsNow / postsGoal) * 100));
  const postsColor = postsPct >= 80 ? "bg-[#0a34f5]" : postsPct >= 50 ? "bg-[#3b6ff5]" : "bg-red-400";
  const postsRemaining = postsGoal - postsNow;

  const obItems = onboarding[client.id] ?? [];
  const obDone = obItems.filter((i) => i.completed).length;
  const obPct = obItems.length > 0 ? Math.round((obDone / obItems.length) * 100) : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 px-6 py-4 border-b border-border shrink-0 space-y-0">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {client.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <DialogTitle>{client.name}</DialogTitle>
              <Badge variant={health.variant}>
                {health.icon} {health.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>{client.industry}</span>
              {client.instagramUser && <span className="text-[#0a34f5]">{client.instagramUser}</span>}
              {client.toneOfVoice && <span>Tom: {TONE_LABELS[client.toneOfVoice]}</span>}
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {(["overview", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "overview" ? "Visão Geral" : `Histórico (${(timeline[client.id] ?? []).length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab === "history" && (
            <div className="p-6 space-y-3">
              {(timeline[client.id] ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum histórico registrado.</p>
              ) : (
                (timeline[client.id] ?? []).map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="w-1.5 shrink-0 mt-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                    <div className="flex-1 pb-3 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-foreground">{entry.actor}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {activeTab === "overview" && (
          <div className="p-6 grid grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              {/* Dossier */}
              <Card className="p-4 bg-primary/10 border-primary/20">
                <p className="text-xs font-medium text-primary mb-3">📋 Dossiê da Marca</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Nicho</span>
                    <span className="text-foreground font-medium">{client.industry}</span>
                  </div>
                  {client.toneOfVoice && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tom de Voz</span>
                      <span className="text-foreground font-medium">{TONE_LABELS[client.toneOfVoice]}</span>
                    </div>
                  )}
                  {client.instagramUser && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Instagram</span>
                      <span className="text-[#3b6ff5] font-medium">{client.instagramUser}</span>
                    </div>
                  )}
                  {client.assignedSocial && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Social Media</span>
                      <span className="text-foreground font-medium">{client.assignedSocial}</span>
                    </div>
                  )}
                  {client.driveLink && (
                    <a href={client.driveLink} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#3b6ff5] hover:text-[#3b6ff5] mt-1">
                      <LinkIcon size={11} />
                      Drive / Canva
                    </a>
                  )}
                </div>
              </Card>

              {/* Client access quick view */}
              {(() => {
                const access = clientAccess[client.id];
                if (!access) return null;
                const fields = [
                  { key: "instagramLogin", label: "Instagram", icon: "📸" },
                  { key: "facebookLogin", label: "Facebook", icon: "👥" },
                  { key: "tiktokLogin", label: "TikTok", icon: "🎵" },
                  { key: "mlabsLogin", label: "mLabs", icon: "📊" },
                ].filter((f) => (access as unknown as Record<string, string | undefined>)[f.key]);
                if (fields.length === 0) return null;
                return (
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Key size={11} />
                      Acessos Cadastrados
                    </p>
                    <div className="space-y-1.5">
                      {fields.map((f) => (
                        <div key={f.key} className="flex items-center gap-2 text-xs">
                          <span>{f.icon}</span>
                          <span className="text-muted-foreground">{f.label}</span>
                          <span className="text-foreground font-medium">{(access as unknown as Record<string, string>)[f.key]}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })()}

              {/* Designer requests for this client */}
              {(() => {
                const clientDRs = designRequests.filter((dr) => dr.clientId === client.id);
                if (clientDRs.length === 0) return null;
                return (
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Palette size={11} />
                      Artes no Designer ({clientDRs.length})
                    </p>
                    <div className="space-y-1.5">
                      {clientDRs.map((dr) => {
                        const statusCfg = dr.status === "done"
                          ? { label: "Pronta", color: "text-primary" }
                          : dr.status === "in_progress"
                          ? { label: "Produzindo", color: "text-zinc-400" }
                          : { label: "Na fila", color: "text-zinc-500" };
                        return (
                          <div key={dr.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full ${dr.status === "done" ? "bg-primary" : dr.status === "in_progress" ? "bg-zinc-400" : "bg-zinc-600"}`} />
                            <span className="text-foreground flex-1 truncate">{dr.title}</span>
                            <span className={statusCfg.color}>{statusCfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })()}

              {/* Onboarding progress (only if onboarding) */}
              {client.status === "onboarding" && obItems.length > 0 && (
                <Card className="p-4 bg-[#0a34f5]/10 border-[#0a34f5]/20">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-[#0a34f5]">Onboarding</p>
                    <span className="text-xs font-bold text-[#0a34f5]">{obPct}%</span>
                  </div>
                  <div className="h-2 bg-blue-500/20 rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${obPct}%` }} />
                  </div>
                  <p className="text-xs text-[#0a34f5]/70">{obDone}/{obItems.length} etapas</p>
                </Card>
              )}

              {/* Recent chat */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <MessageCircle size={12} />
                  Chat Recente
                </p>
                {recentChats.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem mensagens ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {recentChats.map((msg) => (
                      <Card key={msg.id} className="px-3 py-2">
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">{msg.user}</p>
                        <p className="text-xs text-foreground leading-relaxed">{msg.text}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Posts counter */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground">Posts do Mês</p>
                  <span className={`text-lg font-bold ${postsPct >= 80 ? "text-[#0a34f5]" : postsPct >= 50 ? "text-[#3b6ff5]" : "text-red-400"}`}>
                    {postsNow}/{postsGoal}
                  </span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${postsColor}`} style={{ width: `${postsPct}%` }} />
                </div>
                {postsRemaining > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Faltam <span className="text-foreground font-medium">{postsRemaining} post{postsRemaining > 1 ? "s" : ""}</span> para completar o mês
                  </p>
                ) : (
                  <p className="text-xs text-[#0a34f5] font-medium">✓ Meta do mês atingida!</p>
                )}
              </Card>

              {/* Mood history */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Termômetro de Humor</p>
                {moods.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem check-ins ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {moods.slice(0, 4).map((entry) => {
                      const cfg = MOOD_CONFIG[entry.mood];
                      return (
                        <div key={entry.id} className="flex items-center gap-2">
                          <span>{cfg.emoji}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-1">
                              <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                              <span className="text-xs text-muted-foreground">· {entry.date}</span>
                            </div>
                            {entry.note && <p className="text-xs text-muted-foreground leading-tight">{entry.note}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Campaign briefing preview */}
              {client.campaignBriefing && (
                <Card className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Megaphone size={11} />
                    Campanha do Mês
                  </p>
                  <p className="text-xs text-foreground leading-relaxed line-clamp-3">{client.campaignBriefing}</p>
                </Card>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onOpenIdeas} className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary" />
            Pautas IA
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenCampaign} className="flex items-center gap-1.5">
            <Megaphone size={13} className="text-[#3b6ff5]" />
            Campanha IA
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenMood} className="flex items-center gap-1.5">
            <Smile size={13} />
            Check-in
          </Button>
          <div className="ml-auto">
            <Button size="sm" asChild>
              <Link href={`/clients/${client.id}`} onClick={onClose} className="flex items-center gap-1.5">
                Perfil Completo
                <ChevronRight size={13} />
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
