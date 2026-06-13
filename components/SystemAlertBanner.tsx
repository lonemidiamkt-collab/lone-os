"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, X, ChevronRight } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

export default function SystemAlertBanner() {
  const [critical, setCritical] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authedFetch("/api/system/meta-token-status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCritical(data.critical === true);
      } catch { /* silent */ }
    }
    load();
    // Re-check every 10 minutes — flag muda no máximo 1x/dia
    const t = setInterval(load, 10 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!critical || dismissed) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl">
      <KeyRound size={15} className="text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-400">Token Meta Ads expirando</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          As sincronizações de saldo e relatórios de tráfego vão parar.
        </p>
      </div>
      <Link
        href="/integrations"
        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium shrink-0 transition-colors"
      >
        Renovar token
        <ChevronRight size={13} />
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground transition-colors ml-1"
        title="Dispensar"
      >
        <X size={14} />
      </button>
    </div>
  );
}
