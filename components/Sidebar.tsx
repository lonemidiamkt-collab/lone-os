"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Instagram,
  Palette,
  Users,
  Lock,
  MessageCircle,
  Calendar,
  Settings,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/context/RoleContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { useState } from "react";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "manager", "traffic", "social", "designer"] },
  { href: "/traffic", icon: TrendingUp, label: "Tráfego Pago", roles: ["admin", "manager", "traffic"] },
  { href: "/social", icon: Instagram, label: "Social Media", roles: ["admin", "manager", "social", "designer"] },
  { href: "/design", icon: Palette, label: "Designer", roles: ["admin", "manager", "designer", "social"] },
  { href: "/clients", icon: Users, label: "Clientes", roles: ["admin", "manager"] },
  { href: "/calendar", icon: Calendar, label: "Calendário", roles: ["admin", "manager", "traffic", "social", "designer"] },
  { href: "/communications", icon: MessageCircle, label: "Comunicação", roles: ["admin", "manager", "traffic", "social", "designer"] },
  { href: "/ceo", icon: Lock, label: "Área CEO", roles: ["admin"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { role, currentProfile, roleLabel, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center justify-between py-4 transition-all duration-300 bg-black border-r border-[#0a34f5]/20",
        "w-[72px]"
      )}
    >
      {/* Subtle blue glow on right edge */}
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#0a34f5]/30 to-transparent" />

      {/* Logo — top */}
      <div className="flex flex-col items-center gap-2">
        <Link href="/" className="group">
          <div className="w-11 h-11 rounded-2xl bg-black flex items-center justify-center shadow-[0_0_20px_rgba(10,52,245,0.4),0_4px_12px_rgba(10,52,245,0.25)] group-hover:shadow-[0_0_30px_rgba(10,52,245,0.6)] group-hover:scale-105 transition-all duration-200 overflow-hidden">
            <img src="/logo.png" alt="Lone" width={28} height={28} className="object-contain" />
          </div>
        </Link>
      </div>

      {/* Navigation — centered in a dark pill */}
      <nav className="relative flex flex-col items-center">
        <div className="bg-[#060609] border border-[#1a1a1a] rounded-2xl p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(10,52,245,0.04)_inset] flex flex-col gap-1.5">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <div
                key={item.href}
                className="relative"
                onMouseEnter={() => setShowTooltip(item.href)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <Link
                  href={item.href}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                    active
                      ? "bg-[#0a34f5] text-white shadow-[0_0_25px_rgba(10,52,245,0.5),0_4px_14px_rgba(10,52,245,0.3)] ring-1 ring-[#3b6ff5]/30"
                      : "text-zinc-500 hover:text-[#3b6ff5] hover:bg-[#0a34f5]/8 hover:shadow-[0_0_12px_rgba(10,52,245,0.08)]"
                  )}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                </Link>
                {/* Tooltip */}
                {showTooltip === item.href && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-[#121212] border border-[#2a2a2a] rounded-xl px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)] whitespace-nowrap z-50 pointer-events-none animate-fade-in">
                    <span className="text-xs font-medium text-foreground">{item.label}</span>
                    <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-[#2a2a2a]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Bottom — user avatar + theme + logout */}
      <div className="flex flex-col items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:text-[#0a34f5] hover:bg-[#0a34f5]/5 transition-all duration-200"
          title={theme === "dark" ? "Modo Claro" : "Modo Escuro"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
          title="Sair" aria-label="Sair da conta"
        >
          <LogOut size={16} />
        </button>

        {/* User avatar */}
        <div
          className="relative group"
          onMouseEnter={() => setShowTooltip("user")}
          onMouseLeave={() => setShowTooltip(null)}
        >
          <div className="w-10 h-10 rounded-xl bg-[#0a34f5]/15 flex items-center justify-center ring-2 ring-[#0a34f5]/20 cursor-pointer hover:ring-[#0a34f5]/50 hover:shadow-[0_0_15px_rgba(10,52,245,0.2)] transition-all">
            <span className="text-[11px] font-bold text-[#0a34f5]">{currentProfile.initials}</span>
          </div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#0a34f5] border-2 border-black" />
          {showTooltip === "user" && (
            <div className="absolute left-full ml-3 bottom-0 bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)] whitespace-nowrap z-50 pointer-events-none animate-fade-in">
              <p className="text-xs font-semibold text-foreground">{currentProfile.name}</p>
              <p className="text-[10px] text-[#0a34f5] uppercase tracking-wider">{roleLabel}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
