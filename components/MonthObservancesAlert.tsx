"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Sparkles, Heart } from "lucide-react";

type HolidayCategory = "national" | "estadual" | "municipal" | "comercial" | "cultural" | "awareness_month" | "profissao";

interface ObservanceFromApi {
  date: string;
  name: string;
  category: HolidayCategory;
  nichos?: string[];
  monthLong?: boolean;
  uf?: string;
  cities?: string[];
}

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const CATEGORY_VISUAL: Record<HolidayCategory, { color: string; bg: string; border: string; label: string; Icon: typeof Flag }> = {
  national:        { color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Feriado nacional", Icon: Flag },
  estadual:        { color: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "Feriado estadual", Icon: Flag },
  municipal:       { color: "text-lime-300", bg: "bg-lime-500/10", border: "border-lime-500/20", label: "Feriado municipal", Icon: Flag },
  comercial:       { color: "text-pink-300", bg: "bg-pink-500/10", border: "border-pink-500/20", label: "Comercial", Icon: Heart },
  cultural:        { color: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/20", label: "Cultural", Icon: Sparkles },
  awareness_month: { color: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/20", label: "Awareness", Icon: Heart },
  profissao:       { color: "text-cyan-300", bg: "bg-cyan-500/10", border: "border-cyan-500/20", label: "Profissão", Icon: Sparkles },
};

interface Props {
  /** Mês a exibir. Default: mês atual. */
  year?: number;
  month?: number; // 1-12
  /** Filtra profissões pelos nichos dos clientes (ex.: ["Odontologia", "Saúde / Clínicas"]). Não filtra outras categorias. */
  nichos?: string[];
  /** Filtra estaduais e municipais pra esse estado. Sem isso, estaduais não aparecem. */
  uf?: string;
  /** Filtra municipais pra essa cidade. Sem isso, municipais não aparecem. */
  city?: string;
  /** Mostrar apenas categorias específicas. Se omitido, mostra todas. */
  only?: HolidayCategory[];
  /** Compactar como linha única (pra dashboards mais densos). Default: false. */
  compact?: boolean;
  /** Título customizado. Default: "Datas do mês — {mês}". */
  title?: string;
}

function normalizeKey(s: string | undefined): string {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ");
}

export default function MonthObservancesAlert({ year, month, nichos = [], uf, city, only, compact = false, title }: Props) {
  const today = useMemo(() => new Date(), []);
  const targetYear = year ?? today.getFullYear();
  const targetMonth = month ?? today.getMonth() + 1;

  const [observances, setObservances] = useState<ObservanceFromApi[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Pega tudo na API; filtragem por uf/city é feita client-side pra performance
    // (1 fetch/ano cacheado pra todas as variações)
    fetch(`/api/holidays/${targetYear}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data?.holidays) { setObservances(data.holidays); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [targetYear]);

  const filtered = useMemo(() => {
    const prefix = `${targetYear}-${String(targetMonth).padStart(2, "0")}-`;
    let list = observances.filter((o) => o.date.startsWith(prefix));

    // Filtro de localização:
    //   - Sem uf/city explícito → mostra TODAS estaduais e municipais (visão agency)
    //   - Com uf passado → estaduais filtradas pelo UF
    //   - Com city passado → municipais filtradas pela cidade
    const cityKey = normalizeKey(city);
    const ufUp = uf?.toUpperCase();
    const hasLocationFilter = ufUp || cityKey;
    if (hasLocationFilter) {
      list = list.filter((o) => {
        if (o.category === "estadual") {
          return ufUp ? o.uf?.toUpperCase() === ufUp : false;
        }
        if (o.category === "municipal") {
          return cityKey ? (o.cities ?? []).some((c) => normalizeKey(c) === cityKey) : false;
        }
        return true;
      });
    }

    if (only && only.length > 0) {
      list = list.filter((o) => only.includes(o.category));
    }
    if (nichos.length > 0) {
      list = list.filter((o) => {
        if (o.category !== "profissao") return true;
        if (!o.nichos || o.nichos.length === 0) return true;
        return o.nichos.some((n) => nichos.includes(n));
      });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [observances, targetYear, targetMonth, only, nichos, uf, city]);

  if (!loaded || filtered.length === 0) return null;

  const monthLabel = MONTHS_PT[targetMonth - 1];
  const headerTitle = title ?? `Datas de ${monthLabel}`;

  // Separa awareness months pra exibir no topo
  const awarenessMonths = filtered.filter((o) => o.monthLong);
  const dailyDates = filtered.filter((o) => !o.monthLong);

  if (compact) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{headerTitle}</span>
          {awarenessMonths.map((o) => {
            const v = CATEGORY_VISUAL[o.category];
            return (
              <span key={o.name} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${v.bg} ${v.color} border ${v.border}`}>
                <v.Icon size={10} />
                <span className="font-medium">{o.name}</span>
              </span>
            );
          })}
          {dailyDates.map((o) => {
            const v = CATEGORY_VISUAL[o.category];
            const day = parseInt(o.date.slice(8, 10), 10);
            return (
              <span key={`${o.date}-${o.name}`} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${v.bg} ${v.color} border ${v.border}`}>
                <strong className="font-bold">{String(day).padStart(2, "0")}</strong>
                <span>{o.name}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-[#0d4af5]" />
        <h3 className="text-sm font-semibold text-foreground">{headerTitle}</h3>
        <span className="text-[10px] text-muted-foreground">({filtered.length} {filtered.length === 1 ? "data" : "datas"})</span>
      </div>

      {awarenessMonths.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {awarenessMonths.map((o) => {
            const v = CATEGORY_VISUAL[o.category];
            return (
              <span key={o.name} className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md ${v.bg} ${v.color} border ${v.border}`}>
                <v.Icon size={11} />
                <span className="font-semibold">{o.name}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-70">o mês todo</span>
              </span>
            );
          })}
        </div>
      )}

      {dailyDates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {dailyDates.map((o) => {
            const v = CATEGORY_VISUAL[o.category];
            const day = parseInt(o.date.slice(8, 10), 10);
            return (
              <div key={`${o.date}-${o.name}`} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md ${v.bg} border ${v.border}`}>
                <span className={`${v.color} text-base font-bold w-6 text-center shrink-0`}>{String(day).padStart(2, "0")}</span>
                <v.Icon size={11} className={`${v.color} shrink-0`} />
                <span className={`text-xs ${v.color} truncate`}>{o.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
