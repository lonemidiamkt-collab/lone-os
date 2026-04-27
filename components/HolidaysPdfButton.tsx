"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface ObservanceLite {
  date: string;
  name: string;
  category: "national" | "comercial" | "cultural" | "awareness_month" | "profissao";
  nichos?: string[];
  monthLong?: boolean;
}

interface Props {
  /** Mês 1-12 (default: mês atual) */
  month?: number;
  /** Ano (default: ano atual) */
  year?: number;
  /** Filtra observances pra esses nichos (opcional). Se omitido, mostra tudo. */
  nichos?: string[];
  /** Texto do subtítulo (ex.: "RIO DE JANEIRO" ou "BRASIL"). Default: "BRASIL". */
  region?: string;
  /** Nome do cliente — usado no nome do arquivo. */
  clientName?: string;
  /** Estilo do botão: "primary" (CTA) ou "ghost" (secundário). Default: "ghost". */
  variant?: "primary" | "ghost";
  /** Texto custom. Default: "Baixar PDF do mês". */
  label?: string;
}

const MONTH_NAMES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function HolidaysPdfButton({ month, year, nichos, region = "BRASIL", clientName, variant = "ghost", label = "Baixar PDF do mês" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const targetMonth = month ?? today.getMonth() + 1;
  const targetYear = year ?? today.getFullYear();

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      // 1. Buscar observances do ano
      const res = await fetch(`/api/holidays/${targetYear}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      let observances: ObservanceLite[] = data.holidays ?? [];

      // 2. Filtrar pelo mês
      const prefix = `${targetYear}-${String(targetMonth).padStart(2, "0")}-`;
      observances = observances.filter((o) => o.date.startsWith(prefix));

      // 3. Filtrar por nichos (se aplicável)
      if (nichos && nichos.length > 0) {
        observances = observances.filter((o) => {
          if (o.category !== "profissao") return true;
          if (!o.nichos || o.nichos.length === 0) return true;
          return o.nichos.some((n) => nichos.includes(n));
        });
      }

      if (observances.length === 0) {
        setError("Nenhum feriado/data nesse mês.");
        return;
      }

      // 4. Gerar PDF (import dinâmico — react-pdf é pesado, só carrega ao clicar)
      const { pdf } = await import("@react-pdf/renderer");
      const { HolidaysMonthPdf } = await import("@/lib/holidays/pdf");
      const logoUrl = `${window.location.origin}/logo.png`;
      const blob = await pdf(<HolidaysMonthPdf year={targetYear} month={targetMonth} observances={observances} region={region} logoUrl={logoUrl} />).toBlob();

      // 5. Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filenamePieces = ["feriados", MONTH_NAMES[targetMonth - 1], String(targetYear)];
      if (clientName) filenamePieces.push(clientName.toLowerCase().replace(/\s+/g, "-"));
      a.download = `${filenamePieces.join("-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setLoading(false);
    }
  }

  const baseClass = "inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md transition-all";
  const variantClass = variant === "primary"
    ? "bg-[#0d4af5] text-white hover:bg-[#0d4af5]/90"
    : "bg-white/5 text-foreground border border-white/10 hover:bg-white/10";

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className={`${baseClass} ${variantClass} ${loading ? "opacity-60 cursor-wait" : ""}`}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {loading ? "Gerando PDF..." : label}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}
