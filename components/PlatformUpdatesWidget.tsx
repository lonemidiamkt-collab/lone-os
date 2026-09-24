"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight, GitBranch } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";

interface Update {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  created_at: string;
  read: boolean;
}

// Novidades não lidas na home. O "lido" mora no servidor (user_read_updates), que vale em
// qualquer aparelho; se gravar falhar, a novidade volta e a pessoa é avisada.
export default function PlatformUpdatesWidget() {
  const { currentProfile } = useRole();
  const userEmail = (currentProfile?.email || "").toLowerCase();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    chamar<{ updates?: Update[] }>("/api/platform-updates").then((r) => {
      // Falha ao carregar só esconde o aviso (é um extra da home), mas não finge "nada novo" no log.
      if (r.ok) setUpdates(r.data?.updates ?? []);
      else console.warn("[novidades] não carregou:", r.erro);
      setLoading(false);
    });
  }, [userEmail]);

  const unread = updates.filter((u) => !u.read);

  const markAllRead = async () => {
    if (unread.length === 0) return;
    const ids = unread.map((u) => u.id);
    setDismissed(true);
    const r = await chamar("/api/platform-updates", { action: "mark_read", update_ids: ids });
    if (!r.ok) {
      setDismissed(false);
      toast.error(`Não consegui marcar como lido: ${r.erro}`);
      return;
    }
    setUpdates((prev) => prev.map((u) => (ids.includes(u.id) ? { ...u, read: true } : u)));
  };

  if (loading || dismissed || unread.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-transparent p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              Novidades do Lone OS
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 font-medium">
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
          <div key={u.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border">
            <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
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
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary font-medium transition-colors"
          >
            <GitBranch size={10} /> Ver todas <ArrowRight size={10} />
          </Link>
        </div>
      </div>
    </div>
  );
}
