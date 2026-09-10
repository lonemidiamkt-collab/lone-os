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
  // "Salvo" só pode aparecer quando gravou mesmo. Até 10/09/2026 a tabela tinha RLS ligada e nenhuma
  // policy: TODA avaliação era rejeitada pelo banco e a estrela ficava acesa mostrando "Salvo".
  // A tabela estava com zero linhas. Erro não olhado vira dado que não existe.
  const [erro, setErro] = useState("");
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    let mounted = true;
    supabase.from("client_nps")
      .select("score")
      .eq("client_id", clientId)
      .eq("month", month)
      .eq("rated_by", currentUser)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) { setErro("não consegui ler"); return; }
        if (data) setScore(data.score as number);
      });
    return () => { mounted = false; };
  }, [clientId, month, currentUser]);

  const rate = async (value: number) => {
    setSaving(true); setErro("");
    const anterior = score;
    setScore(value);
    const { error } = await supabase.from("client_nps").upsert({
      client_id: clientId,
      score: value,
      month,
      rated_by: currentUser,
    }, { onConflict: "client_id,month,rated_by" });
    if (error) {
      setScore(anterior); setSaving(false);
      setErro("não salvou");
      return;
    }
    const { error: e2 } = await supabase.from("clients").update({ nps_score: value }).eq("id", clientId);
    setSaving(false);
    if (e2) { setErro("salvou a nota, mas não atualizou a ficha"); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground">Satisfacao:</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} onClick={() => rate(v)} onMouseEnter={() => setHover(v)} onMouseLeave={() => setHover(null)}
            disabled={saving}
            className="transition-transform hover:scale-110">
            <Star size={14} className={`transition-colors ${(hover ?? score ?? 0) >= v ? "text-lone-warning fill-lone-warning" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      {saving && <Loader2 size={10} className="text-muted-foreground animate-spin" />}
      {saved && <span className="text-[10px] text-lone-success">Salvo</span>}
      {erro && <span className="text-[10px] text-lone-danger" title={erro}>{erro}</span>}
    </div>
  );
}
