"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight, GitBranch } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { authedFetch } from "@/lib/supabase/authed-fetch";

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
// Lidos guardados NO DISPOSITIVO (fallback) — garante que "marcar como lido" faça a novidade
// sumir mesmo se o round-trip pro servidor falhar. O servidor continua sendo a fonte cross-device,
// mas o localStorage evita o bug de "marquei e voltou".
const LS_KEY = "lone_read_updates";
function localReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); } catch { return new Set(); }
}
function addLocalRead(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    const cur = localReadIds();
    ids.forEach((id) => cur.add(id));
    localStorage.setItem(LS_KEY, JSON.stringify([...cur]));
  } catch { /* ignore */ }
}

export default function PlatformUpdatesWidget() {
  const { currentProfile } = useRole();
  const userEmail = (currentProfile?.email || "").toLowerCase();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    // GET usa session do Authorization header pra derivar user_email
    authedFetch("/api/platform-updates")
      .then((r) => r.json())
      .then((data) => {
        // Read = servidor OU já marcado localmente neste dispositivo (fallback anti "voltou").
        const local = localReadIds();
        setUpdates((data.updates ?? []).map((u: Update) => ({ ...u, read: u.read || local.has(u.id) })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userEmail]);

  const unread = updates.filter((u) => !u.read);

  const markAllRead = async () => {
    if (unread.length === 0) return;
    const ids = unread.map((u) => u.id);
    // 1) grava local NA HORA (garante que suma) 2) some da tela 3) tenta persistir no servidor
    addLocalRead(ids);
    setUpdates((prev) => prev.map((u) => ({ ...u, read: true })));
    setDismissed(true);
    authedFetch("/api/platform-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", update_ids: ids }),
    }).catch(() => { /* já está marcado local; servidor é best-effort */ });
  };

  if (loading || dismissed || unread.length === 0) return null;

  // Faixa FINA: uma linha só (não rouba a primeira tela da operação). Detalhe completo em /sobre.
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-2.5 animate-fade-in">
      <Sparkles size={15} className="text-primary shrink-0" />
      <p className="min-w-0 flex-1 truncate text-xs text-foreground">
        <span className="font-semibold">{unread.length} {unread.length === 1 ? "novidade" : "novidades"}</span>
        <span className="text-muted-foreground"> no Lone OS · </span>
        <span className="text-muted-foreground">{unread[0]?.title}</span>
      </p>
      <Link
        href="/sobre#changelog"
        className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
      >
        <GitBranch size={10} /> Ver todas <ArrowRight size={10} />
      </Link>
      <button
        onClick={markAllRead}
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Marcar tudo como lido"
      >
        <X size={13} />
      </button>
    </div>
  );
}
