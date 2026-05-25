"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Star, Loader2 } from "lucide-react";

interface Props {
  clientId: string;
  currentUser: string;
}

export default function ClientNPS({ clientId, currentUser }: Props) {
  const [score, setScore] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    let mounted = true;
    supabase.from("client_nps")
      .select("score")
      .eq("client_id", clientId)
      .eq("month", month)
      .eq("rated_by", currentUser)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data) setScore(data.score as number);
      });
    return () => { mounted = false; };
  }, [clientId, month, currentUser]);

  const rate = async (value: number) => {
    setSaving(true);
    setScore(value);
    await supabase.from("client_nps").upsert({
      client_id: clientId,
      score: value,
      month,
      rated_by: currentUser,
    }, { onConflict: "client_id,month,rated_by" });

    await supabase.from("clients").update({ nps_score: value }).eq("id", clientId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500">Satisfacao:</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} onClick={() => rate(v)} onMouseEnter={() => setHover(v)} onMouseLeave={() => setHover(null)}
            disabled={saving}
            className="transition-transform hover:scale-110">
            <Star size={14} className={`transition-colors ${(hover ?? score ?? 0) >= v ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`} />
          </button>
        ))}
      </div>
      {saving && <Loader2 size={10} className="text-zinc-500 animate-spin" />}
      {saved && <span className="text-[10px] text-emerald-400">Salvo</span>}
    </div>
  );
}
