"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight, GitBranch } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";

interface Update {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  created_at: string;
  read: boolean;
}

/**
 * Shows unread platform updates on the home dashboard.
 * User can dismiss/mark as read, or go to /sobre for full changelog.
 */
export default function PlatformUpdatesWidget() {
  const { currentProfile } = useRole();
  const userEmail = (currentProfile?.email || "").toLowerCase();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    // GET usa session do cookie pra derivar user_email — não precisa passar query param
    fetch("/api/platform-updates")
      .then((r) => r.json())
      .then((data) => { setUpdates(data.updates ?? []); })
      .finally(() => setLoading(false));
  }, [userEmail]);

  const unread = updates.filter((u) => !u.read);

  const markAllRead = async () => {
    if (unread.length === 0) return;
    await fetch("/api/platform-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_read",
        update_ids: unread.map((u) => u.id),
      }),
    });
    setUpdates((prev) => prev.map((u) => ({ ...u, read: true })));
    setDismissed(true);
  };

  if (loading || dismissed || unread.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#0d4af5]/30 bg-gradient-to-br from-[#0d4af5]/[0.08] via-[#0d4af5]/[0.04] to-transparent p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0d4af5]/15 flex items-center justify-center">
            <Sparkles size={18} className="text-[#0d4af5]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              Novidades do Lone OS
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d4af5]/15 text-[#3b6ff5] border border-[#0d4af5]/20 font-medium">
                {unread.length} {unread.length === 1 ? "nova" : "novas"}
              </span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Atualizações desde seu último acesso</p>
          </div>
        </div>
        <button
          onClick={markAllRead}
          className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Marcar tudo como lido"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2">
        {unread.slice(0, 3).map((u) => (
          <div key={u.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border/50">
            <span className="text-lg shrink-0 leading-none mt-0.5">{u.icon || "📦"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{u.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{u.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
        {unread.length > 3 && (
          <p className="text-[10px] text-muted-foreground">+{unread.length - 3} outra{unread.length - 3 > 1 ? "s" : ""}</p>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={markAllRead}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Marcar como lido
          </button>
          <Link
            href="/sobre#changelog"
            className="flex items-center gap-1 text-[11px] text-[#0d4af5] hover:text-[#3b6ff5] font-medium transition-colors"
          >
            <GitBranch size={10} /> Ver todas <ArrowRight size={10} />
          </Link>
        </div>
      </div>
    </div>
  );
}
