"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Sparkles, Heart } from "lucide-react";
import { todaySP } from "@/lib/utils";

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
  national:        { color: "text-lone-warning", bg: "bg-lone-warning-bg", border: "border-lone-warning-border", label: "Feriado nacional", Icon: Flag },
  estadual:        { color: "text-lone-warning", bg: "bg-lone-warning-bg", border: "border-lone-warning-border", label: "Feriado estadual", Icon: Flag },
  municipal:       { color: "text-chart-5", bg: "bg-[color-mix(in_srgb,var(--chart-5)_10%,transparent)]", border: "border-[color-mix(in_srgb,var(--chart-5)_20%,transparent)]", label: "Feriado municipal", Icon: Flag },
  comercial:       { color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20", label: "Comercial", Icon: Heart },
  cultural:        { color: "text-chart-4", bg: "bg-[color-mix(in_srgb,var(--chart-4)_10%,transparent)]", border: "border-[color-mix(in_srgb,var(--chart-4)_20%,transparent)]", label: "Cultural", Icon: Sparkles },
  awareness_month: { color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", label: "Awareness", Icon: Heart },
  profissao:       { color: "text-chart-3", bg: "bg-[color-mix(in_srgb,var(--chart-3)_10%,transparent)]", border: "border-[color-mix(in_srgb,var(--chart-3)_20%,transparent)]", label: "Profissão", Icon: Sparkles },
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
  /** Janela móvel a partir de hoje (ignora year/month): só datas de alcance nacional, numa linha. */
  proximosDias?: number;
  /** Cidades da carteira: no modo proximosDias, feriado municipal/estadual só entra se casar com uma delas. */
  cidades?: string[];
}

function normalizeKey(s: string | undefined): string {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ");
}

/** Soma dias a um "YYYY-MM-DD" sem passar por fuso (meio-dia UTC não vira o dia vizinho). */
function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function MonthObservancesAlert({ year, month, nichos = [], uf, city, only, compact = false, title, proximosDias, cidades }: Props) {
  // Dia de São Paulo: à noite o relógio UTC já está no dia seguinte (e às vezes no mês seguinte).
  const hoje = useMemo(() => todaySP(), []);
  const targetYear = year ?? Number(hoje.slice(0, 4));
  const targetMonth = month ?? Number(hoje.slice(5, 7));
  const fimJanela = proximosDias ? somarDias(hoje, proximosDias) : null;
  const anoFim = fimJanela ? Number(fimJanela.slice(0, 4)) : targetYear;

  const [observances, setObservances] = useState<ObservanceFromApi[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Pega tudo na API; filtragem por uf/city é feita client-side pra performance
    // (1 fetch/ano cacheado pra todas as variações). A janela móvel pode virar o ano.
    const anos = anoFim !== targetYear ? [targetYear, anoFim] : [targetYear];
    Promise.all(anos.map((a) => fetch(`/api/holidays/${a}`).then((r) => (r.ok ? r.json() : null))))
      .then((lista) => {
        if (cancelled) return;
        setObservances(lista.flatMap((d) => (d?.holidays as ObservanceFromApi[] | undefined) ?? []));
        setLoaded(true);
      })
      // Faixa informativa: sem a API ela só não aparece — não há dado sendo afirmado como vazio.
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [targetYear, anoFim]);

  const proximas = useMemo(() => {
    if (!proximosDias || !fimJanela) return [];
    const minhas = new Set((cidades ?? []).map(normalizeKey).filter(Boolean));
    return observances
      .filter((o) => !o.monthLong && o.date >= hoje && o.date <= fimJanela)
      .filter((o) => {
        if (o.category === "estadual" || o.category === "municipal") {
          return (o.cities ?? []).some((c) => minhas.has(normalizeKey(c)));
        }
        if (o.category === "profissao") {
          return nichos.length > 0 && (o.nichos ?? []).some((n) => nichos.includes(n));
        }
        return o.category !== "awareness_month";
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [observances, proximosDias, fimJanela, hoje, cidades, nichos]);

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

  if (proximosDias) {
    if (!loaded || proximas.length === 0) return null;
    return <LinhaDeDatas rotulo={title ?? "Próximas datas"} datas={proximas} />;
  }

  if (!loaded || filtered.length === 0) return null;

  const monthLabel = MONTHS_PT[targetMonth - 1];
  const headerTitle = title ?? `Datas de ${monthLabel}`;

  // Separa awareness months pra exibir no topo
  const awarenessMonths = filtered.filter((o) => o.monthLong);
  const dailyDates = filtered.filter((o) => !o.monthLong);

  if (compact) {
    return <LinhaDeDatas rotulo={headerTitle} datas={[...awarenessMonths, ...dailyDates]} />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-primary" />
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

/** Uma linha discreta: "Próximas datas: 07 Independência · 15 Dia do Cliente". */
function LinhaDeDatas({ rotulo, datas }: { rotulo: string; datas: ObservanceFromApi[] }) {
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      <span className="font-medium">{rotulo}:</span>{" "}
      {datas.map((o, i) => (
        <span key={`${o.date}-${o.name}`}>
          {i > 0 && " · "}
          {!o.monthLong && <span className="tabular-nums">{o.date.slice(8, 10)} </span>}
          {o.name}
        </span>
      ))}
    </p>
  );
}
