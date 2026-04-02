"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/Header";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  MessageCircle, Globe, Search, Send, Activity,
  Users, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { getStatusColor, getStatusLabel } from "@/lib/utils";
import type { Role } from "@/lib/types";

const ROLE_COLORS: Record<Role, string> = {
  admin: "text-primary bg-primary/15",
  manager: "text-primary bg-primary/15",
  traffic: "text-primary bg-primary/15",
  social: "text-zinc-400 bg-[#111118]",
  designer: "text-zinc-400 bg-[#111118]",
};

const ROLE_LABELS: Record<Role, string> = {
  admin: "CEO",
  manager: "Gerente",
  traffic: "Tráfego",
  social: "Social Media",
  designer: "Designer",
};

type Mode = "global" | string; // "global" or a clientId

export default function CommunicationsPage() {
  const { role, currentUser } = useRole();
  const { clients, globalChat, clientChats, sendClientMessage, sendGlobalMessage } = useAppState();
  const [mode, setMode] = useState<Mode>("global");
  const [input, setInput] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((c) => c.id === mode) ?? null;

  const messages =
    mode === "global"
      ? globalChat
      : (clientChats[mode] ?? []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, mode]);

  const handleSend = () => {
    if (!input.trim()) return;
    if (mode === "global") {
      sendGlobalMessage(currentUser, role, input.trim());
    } else {
      sendClientMessage(mode, currentUser, input.trim());
    }
    setInput("");
  };

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Count unread (just show total messages as indicator)
  const totalGlobal = globalChat.length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header title="Central de Comunicação" subtitle="Chat global e chats por cliente" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar: channel list ─────────────────────────────────── */}
        <div className="hidden md:flex w-64 border-r border-border flex-col shrink-0 bg-card">
          {/* Global Chat */}
          <div className="p-3 border-b border-border">
            <button
              onClick={() => setMode("global")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                mode === "global"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                mode === "global" ? "bg-primary/30" : "bg-muted"
              }`}>
                <Globe size={15} className={mode === "global" ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div className="flex-1 text-left">
                <p className="leading-none">Chat Global</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-normal">Toda a agência</p>
              </div>
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                {totalGlobal}
              </span>
            </button>
          </div>

          {/* Per-client chats */}
          <div className="flex-1 overflow-auto">
            <div className="p-3 border-b border-border/50">
              <div className="flex items-center gap-2 bg-muted rounded-lg px-2.5 py-1.5">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
                />
              </div>
            </div>

            <div className="px-2 py-2 space-y-0.5">
              <p className="text-xs text-muted-foreground/50 px-2 pb-1 uppercase tracking-wider font-medium">
                Chats por Cliente
              </p>
              {filteredClients.map((client) => {
                const msgs = clientChats[client.id] ?? [];
                const lastMsg = msgs[msgs.length - 1];
                const isActive = mode === client.id;
                return (
                  <button
                    key={client.id}
                    onClick={() => setMode(client.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                      isActive
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isActive ? "bg-primary/40 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {client.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-none truncate">{client.name}</p>
                      {lastMsg && (
                        <p className="text-xs text-muted-foreground/50 mt-0.5 truncate">{lastMsg.text}</p>
                      )}
                    </div>
                    {msgs.length > 0 && (
                      <span className="text-xs text-muted-foreground/50 shrink-0">{msgs.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Main chat area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="h-14 border-b border-border px-5 flex items-center gap-3 shrink-0">
            {mode === "global" ? (
              <>
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Globe size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Chat Global</p>
                  <p className="text-xs text-muted-foreground">{clients.length + 1} membros da equipe</p>
                </div>
              </>
            ) : selectedClient ? (
              <>
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {selectedClient.name[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs badge border ${getStatusColor(selectedClient.status)}`}>
                      {getStatusLabel(selectedClient.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Tráfego: {selectedClient.assignedTraffic} · SM: {selectedClient.assignedSocial}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/clients/${selectedClient.id}`}
                  className="btn-ghost text-xs flex items-center gap-1.5"
                >
                  <Activity size={13} />
                  Ver Histórico
                </Link>
              </>
            ) : null}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-3">
                <MessageCircle size={32} />
                <p className="text-sm">
                  {mode === "global"
                    ? "Nenhuma mensagem no chat global ainda."
                    : "Nenhuma mensagem neste chat. Seja o primeiro!"}
                </p>
              </div>
            )}

            {mode === "global"
              ? globalChat.map((msg) => {
                  const isMe = msg.user === currentUser;
                  const roleStyle = ROLE_COLORS[msg.role] ?? "text-muted-foreground bg-zinc-600/20";
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${roleStyle}`}>
                          {msg.user[0]}
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">{msg.user}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${roleStyle}`}>
                          {ROLE_LABELS[msg.role]}
                        </span>
                        <span className="text-xs text-muted-foreground/50">{msg.timestamp}</span>
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[70%] ${
                        isMe
                          ? "bg-primary/30 text-primary rounded-tr-sm"
                          : "bg-card border border-border text-foreground rounded-tl-sm"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              : (clientChats[mode] ?? []).map((msg) => {
                  const isMe = msg.user === currentUser;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-medium">{msg.user}</span>
                        <span className="text-xs text-muted-foreground/50">{msg.timestamp}</span>
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[70%] ${
                        isMe
                          ? "bg-primary/30 text-primary rounded-tr-sm"
                          : "bg-card border border-border text-foreground rounded-tl-sm"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-3 items-center">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {currentUser[0]}
              </div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={
                  mode === "global"
                    ? "Mensagem para toda a equipe..."
                    : selectedClient
                    ? `Mensagem sobre ${selectedClient.name}... (salvo no histórico)`
                    : "Selecione um chat"
                }
                className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="btn-primary px-4 py-2.5 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={15} />
              </button>
            </div>
            {mode !== "global" && (
              <p className="text-xs text-muted-foreground/50 mt-2 ml-10">
                Cada mensagem é registrada automaticamente no histórico operacional deste cliente.
              </p>
            )}
          </div>
        </div>

        {/* ── Right: client info panel (when client selected) ───────────────── */}
        {selectedClient && (
          <div className="w-60 border-l border-border flex flex-col shrink-0">
            <div className="p-4 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Info do Cliente</p>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center font-bold text-primary text-sm">
                  {selectedClient.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.industry}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: "Tráfego", value: selectedClient.assignedTraffic },
                  { label: "Social", value: selectedClient.assignedSocial },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4">
              <Link
                href={`/clients/${selectedClient.id}`}
                className="w-full flex items-center justify-center gap-2 btn-primary text-xs py-2"
              >
                <Activity size={13} />
                Página Completa
                <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
