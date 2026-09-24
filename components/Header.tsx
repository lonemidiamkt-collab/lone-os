"use client";

import { ChevronDown, Plus, UserPlus, FileText, ChevronRight, LogIn } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import MedievalAvatar, { getUserAvatar } from "@/components/MedievalAvatars";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import Link from "next/link";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { currentProfile, roleLabel, logout } = useRole();
  const notifications = useNotificationsStore((s) => s.notifications);
  const [showMenu, setShowMenu] = useState(false);
  const [showQuick, setShowQuick] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const quickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setShowQuick(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="h-16 border-b border-border bg-background flex items-center px-4 pl-16 lg:pl-6 lg:px-6 gap-3 lg:gap-4 shrink-0 relative z-[100]">
      {/* Breadcrumb + Welcome */}
      <div className="flex-1 flex items-center gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground leading-none mb-1">Olá, {currentProfile.name}</p>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">{title}</h2>
            {subtitle && (
              <>
                <ChevronRight size={12} className="text-muted-foreground" />
                <p className="text-muted-foreground text-xs">{subtitle}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Busca: mora no GlobalSearch do AppShell (⌘K) — clientes, cards e tarefas num lugar só. */}

      {/* Quick Actions */}
      <div className="relative" ref={quickRef}>
        <button
          onClick={() => setShowQuick(!showQuick)}
          className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center hover:border-lone-border-strong transition-all group"
          title="Ações rápidas"
        >
          <Plus size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </button>

        {showQuick && (
          <>
          <div className="fixed inset-0 z-[199]" onClick={() => setShowQuick(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-lg z-[200] py-2 animate-fade-in">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] px-3 pb-2 mb-1 border-b border-border font-medium">
              Ações Rápidas
            </p>
            <Link href="/clients" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 transition-colors text-sm text-foreground">
              <UserPlus size={14} className="text-primary" />Novo Cliente
            </Link>
            <Link href="/social?action=new-content" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 transition-colors text-sm text-foreground">
              <FileText size={14} className="text-primary" />Novo Conteúdo
            </Link>
          </div>
          </>
        )}
      </div>

      {/* Notifications */}
      {/* Notification bell — badge only, opens NotificationCenter drawer via AppShell */}
      <div className="relative">
        <span className="text-[9px] text-muted-foreground tabular-nums">
          {unreadCount > 0 && `${unreadCount} novo(s)`}
        </span>
      </div>

      {/* Profile */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 bg-card border border-border rounded-xl px-2.5 py-1.5 hover:border-lone-border-strong transition-all"
        >
          <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={28} />
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-2xl shadow-lg z-[200] py-2 animate-fade-in">
              <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border mb-1">
                <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={32} glow />
                <div>
                  <p className="text-sm font-medium text-foreground leading-none">{currentProfile.name}</p>
                  <p className="text-[10px] text-primary mt-0.5 uppercase tracking-wider font-medium">{roleLabel}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Tem certeza que deseja sair da conta?")) {
                    logout();
                    setShowMenu(false);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogIn size={14} className="rotate-180" />
                Sair da conta
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
