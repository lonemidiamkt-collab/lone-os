/**
 * PDF "Feriados do Mês" — entregável pra clientes.
 *
 * Página 1: grid do mês (cores indicam categoria)
 * Página 2: cards detalhados com descrição
 *
 * Usa @react-pdf/renderer rodando 100% client-side.
 */

import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { getDescriptionFor } from "./descriptions";

interface ObservanceLite {
  date: string;          // YYYY-MM-DD
  name: string;
  category: "national" | "estadual" | "municipal" | "comercial" | "cultural" | "awareness_month" | "profissao";
  nichos?: string[];
  monthLong?: boolean;
  uf?: string;
  cities?: string[];
}

interface Props {
  year: number;
  month: number;             // 1-12
  observances: ObservanceLite[];
  /** Nome do estado/região no subtítulo. Default: "BRASIL". */
  region?: string;
  /** Logo URL absoluta (window.location.origin + /logo.png). */
  logoUrl?: string;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTHS_SHORT_UPPER = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// Paleta dark consistente com o painel
const C = {
  bg: "#0a0a0f",
  surface: "#11141a",
  surfaceLight: "#1a1f2a",
  border: "#1f2937",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#64748b",
  brand: "#0d4af5",
  brandLight: "#3b6ff5",
  feriado: "#dc2626",        // nacional — vermelho
  feriadoBg: "#7f1d1d",
  estadual: "#ea580c",       // estadual — laranja
  estadualBg: "#7c2d12",
  municipal: "#65a30d",      // municipal — lima
  municipalBg: "#365314",
  comemorativa: "#0d4af5",   // datas comemorativas — azul
  comemorativaBg: "#1e3a8a",
};

type FeriadoStyleKey = "national" | "estadual" | "municipal" | "comemorativa";
function styleKeyFor(category: ObservanceLite["category"]): FeriadoStyleKey {
  if (category === "national") return "national";
  if (category === "estadual") return "estadual";
  if (category === "municipal") return "municipal";
  return "comemorativa";
}
function colorForStyleKey(key: FeriadoStyleKey): { fg: string; bg: string } {
  if (key === "national") return { fg: C.feriado, bg: C.feriadoBg };
  if (key === "estadual") return { fg: C.estadual, bg: C.estadualBg };
  if (key === "municipal") return { fg: C.municipal, bg: C.municipalBg };
  return { fg: C.comemorativa, bg: C.comemorativaBg };
}
function pillLabelFor(category: ObservanceLite["category"]): string {
  switch (category) {
    case "national": return "FERIADO NACIONAL";
    case "estadual": return "FERIADO ESTADUAL";
    case "municipal": return "FERIADO MUNICIPAL";
    case "awareness_month": return "MÊS DE CONSCIENTIZAÇÃO";
    case "comercial": return "DATA COMERCIAL";
    case "cultural": return "DATA CULTURAL";
    case "profissao": return "DIA PROFISSIONAL";
    default: return "DATA COMEMORATIVA";
  }
}

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    padding: 40,
    paddingBottom: 60,
    fontFamily: "Helvetica",
    color: C.textPrimary,
  },

  // ─── Header / brand ──────────────────────────────────────
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  brandText: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
    letterSpacing: 1,
  },
  brandRule: {
    height: 2,
    backgroundColor: C.brand,
    marginBottom: 28,
  },

  // ─── Title page 1 ────────────────────────────────────────
  pageTitle: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: C.textPrimary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: C.brand,
    letterSpacing: 2,
    marginBottom: 8,
  },
  pageDescription: {
    fontSize: 9,
    textAlign: "center",
    color: C.textSecondary,
    marginBottom: 24,
  },

  // ─── Calendar grid ───────────────────────────────────────
  weekHeader: {
    flexDirection: "row",
    backgroundColor: C.brand,
    paddingVertical: 8,
    marginBottom: 1,
  },
  weekHeaderCell: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: C.textPrimary,
    letterSpacing: 0.5,
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 1,
  },
  dayCell: {
    flex: 1,
    height: 60,
    marginHorizontal: 0.5,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  dayCellEmpty: {
    backgroundColor: "transparent",
  },
  dayCellNational: {
    backgroundColor: C.feriadoBg,
    borderWidth: 1,
    borderColor: C.feriado,
  },
  dayCellEstadual: {
    backgroundColor: C.estadualBg,
    borderWidth: 1,
    borderColor: C.estadual,
  },
  dayCellMunicipal: {
    backgroundColor: C.municipalBg,
    borderWidth: 1,
    borderColor: C.municipal,
  },
  dayCellComemorativa: {
    backgroundColor: C.comemorativaBg,
    borderWidth: 1,
    borderColor: C.comemorativa,
  },
  dayNumber: {
    fontSize: 11,
    color: C.textSecondary,
  },
  dayNumberNational: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.feriado,
  },
  dayNumberEstadual: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.estadual,
  },
  dayNumberMunicipal: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.municipal,
  },
  dayNumberComemorativa: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.brandLight,
  },

  // ─── Legend ──────────────────────────────────────────────
  legend: {
    flexDirection: "row",
    marginTop: 18,
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 24,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendDotFeriado: {
    backgroundColor: C.feriado,
  },
  legendDotEstadual: {
    backgroundColor: C.estadual,
  },
  legendDotMunicipal: {
    backgroundColor: C.municipal,
  },
  legendDotComemorativa: {
    backgroundColor: C.comemorativa,
  },
  legendText: {
    fontSize: 9,
    color: C.textSecondary,
  },

  // ─── Awareness month banner ──────────────────────────────
  awarenessRow: {
    flexDirection: "column",
    marginTop: 16,
  },
  awarenessItem: {
    backgroundColor: C.surfaceLight,
    borderLeftWidth: 3,
    borderLeftColor: "#ec4899",
    padding: 10,
    marginBottom: 6,
  },
  awarenessLabel: {
    fontSize: 8,
    color: "#ec4899",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    marginBottom: 2,
  },
  awarenessName: {
    fontSize: 10,
    color: C.textPrimary,
  },

  // ─── Page 2: section ─────────────────────────────────────
  page2Header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  page2HeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  page2Logo: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  page2Brand: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
  },
  page2Date: {
    fontSize: 9,
    color: C.textSecondary,
  },
  sectionTitle: {
    backgroundColor: C.brand,
    padding: 10,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
    marginBottom: 16,
  },

  // ─── Detail cards ────────────────────────────────────────
  card: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  cardFeriado: {
    borderLeftColor: C.feriado,
  },
  cardEstadual: {
    borderLeftColor: C.estadual,
  },
  cardMunicipal: {
    borderLeftColor: C.municipal,
  },
  cardComemorativa: {
    borderLeftColor: C.comemorativa,
  },
  dateBadge: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginRight: 12,
    borderRadius: 4,
  },
  dateBadgeFeriado: {
    backgroundColor: C.feriado,
  },
  dateBadgeEstadual: {
    backgroundColor: C.estadual,
  },
  dateBadgeMunicipal: {
    backgroundColor: C.municipal,
  },
  dateBadgeComemorativa: {
    backgroundColor: C.comemorativa,
  },
  dateBadgeDay: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
    lineHeight: 1,
  },
  dateBadgeMonth: {
    fontSize: 9,
    color: C.textPrimary,
    marginTop: 4,
    letterSpacing: 1,
  },
  cardBody: {
    flex: 1,
  },
  categoryPill: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    color: C.textPrimary,
    marginBottom: 4,
    alignSelf: "flex-start",
    letterSpacing: 1,
  },
  categoryPillFeriado: {
    backgroundColor: C.feriado,
  },
  categoryPillEstadual: {
    backgroundColor: C.estadual,
  },
  categoryPillMunicipal: {
    backgroundColor: C.municipal,
  },
  categoryPillComemorativa: {
    backgroundColor: C.comemorativa,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
    marginBottom: 2,
  },
  cardWeekday: {
    fontSize: 9,
    fontStyle: "italic",
    color: C.textSecondary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 9,
    color: C.textSecondary,
    lineHeight: 1.4,
  },

  // ─── Footer ──────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: C.brand,
  },
  footerBrand: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerLogo: {
    width: 18,
    height: 18,
    marginRight: 4,
  },
  footerBrandText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
  },
  footerCenter: {
    fontSize: 8,
    color: C.textSecondary,
  },
  footerRight: {
    fontSize: 8,
    color: C.textSecondary,
  },
});

function buildMonthCells(year: number, month1to12: number): Array<number | null> {
  const monthIdx0 = month1to12 - 1;
  const firstDayWeekday = new Date(Date.UTC(year, monthIdx0, 1)).getUTCDay();  // 0=Dom
  const daysInMonth = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDayWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function chunkBy7<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 7) out.push(arr.slice(i, i + 7));
  return out;
}

export function HolidaysMonthPdf({ year, month, observances, region = "BRASIL", logoUrl }: Props) {
  const monthLabel = MONTHS[month - 1];
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;

  const inMonth = observances.filter((o) => o.date.startsWith(prefix));
  const awareness = inMonth.filter((o) => o.monthLong);
  const dailyDates = inMonth.filter((o) => !o.monthLong).sort((a, b) => a.date.localeCompare(b.date));

  // Map dia → categoria predominante (prioridade nacional > estadual > municipal > comemorativa)
  const PRIO: Record<FeriadoStyleKey, number> = { national: 4, estadual: 3, municipal: 2, comemorativa: 1 };
  const dayCategory: Record<number, FeriadoStyleKey> = {};
  for (const o of dailyDates) {
    const day = parseInt(o.date.slice(8, 10), 10);
    if (!Number.isFinite(day)) continue;
    const key = styleKeyFor(o.category);
    if (!dayCategory[day] || PRIO[key] > PRIO[dayCategory[day]]) {
      dayCategory[day] = key;
    }
  }

  const cells = buildMonthCells(year, month);
  const weeks = chunkBy7(cells);

  return (
    <Document title={`Feriados ${monthLabel} ${year}`} author="Lone Mídia">
      {/* ─── PÁGINA 1: GRID DO MÊS ──────────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Brand header */}
        <View style={s.brandHeader}>
          {logoUrl && <Image src={logoUrl} style={s.logo} />}
          <Text style={s.brandText}>LONE MÍDIA</Text>
        </View>
        <View style={s.brandRule} />

        {/* Title */}
        <Text style={s.pageTitle}>FERIADOS</Text>
        <Text style={s.pageSubtitle}>{monthLabel.toUpperCase()} {year} · {region}</Text>
        <Text style={s.pageDescription}>Feriados nacionais e datas comemorativas</Text>

        {/* Weekday header */}
        <View style={s.weekHeader}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={s.weekHeaderCell}>{w}</Text>
          ))}
        </View>

        {/* Day cells */}
        {weeks.map((week, rowIdx) => (
          <View key={rowIdx} style={s.weekRow}>
            {week.map((day, colIdx) => {
              if (day === null) {
                return <View key={colIdx} style={[s.dayCell, s.dayCellEmpty]} />;
              }
              const cat = dayCategory[day];
              const dayCellExtraStyle =
                cat === "national" ? s.dayCellNational :
                cat === "estadual" ? s.dayCellEstadual :
                cat === "municipal" ? s.dayCellMunicipal :
                cat === "comemorativa" ? s.dayCellComemorativa : undefined;
              const numberStyle =
                cat === "national" ? s.dayNumberNational :
                cat === "estadual" ? s.dayNumberEstadual :
                cat === "municipal" ? s.dayNumberMunicipal :
                cat === "comemorativa" ? s.dayNumberComemorativa : s.dayNumber;
              return (
                <View key={colIdx} style={dayCellExtraStyle ? [s.dayCell, dayCellExtraStyle] : s.dayCell}>
                  <Text style={numberStyle}>{day}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {/* Legend (mostra só categorias presentes no mês pra reduzir ruído) */}
        <View style={s.legend}>
          {Object.values(dayCategory).includes("national") && (
            <View style={s.legendItem}>
              <View style={[s.legendDot, s.legendDotFeriado]} />
              <Text style={s.legendText}>Feriado nacional</Text>
            </View>
          )}
          {Object.values(dayCategory).includes("estadual") && (
            <View style={s.legendItem}>
              <View style={[s.legendDot, s.legendDotEstadual]} />
              <Text style={s.legendText}>Feriado estadual</Text>
            </View>
          )}
          {Object.values(dayCategory).includes("municipal") && (
            <View style={s.legendItem}>
              <View style={[s.legendDot, s.legendDotMunicipal]} />
              <Text style={s.legendText}>Feriado municipal</Text>
            </View>
          )}
          {Object.values(dayCategory).includes("comemorativa") && (
            <View style={s.legendItem}>
              <View style={[s.legendDot, s.legendDotComemorativa]} />
              <Text style={s.legendText}>Data comemorativa</Text>
            </View>
          )}
        </View>

        {/* Awareness month banners (se houver) */}
        {awareness.length > 0 && (
          <View style={s.awarenessRow}>
            {awareness.map((a) => (
              <View key={a.name} style={s.awarenessItem}>
                <Text style={s.awarenessLabel}>MÊS DE CONSCIENTIZAÇÃO</Text>
                <Text style={s.awarenessName}>{a.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footerBrand}>
            {logoUrl && <Image src={logoUrl} style={s.footerLogo} />}
            <Text style={s.footerBrandText}>LONE MÍDIA</Text>
          </View>
          <Text style={s.footerCenter}>Feriados — {monthLabel} {year} · {region}</Text>
          <Text style={s.footerRight} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ─── PÁGINA 2: CARDS DETALHADOS ─────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Compact header */}
        <View style={s.page2Header}>
          <View style={s.page2HeaderLeft}>
            {logoUrl && <Image src={logoUrl} style={s.page2Logo} />}
            <Text style={s.page2Brand}>LONE MÍDIA</Text>
          </View>
          <Text style={s.page2Date}>{monthLabel} {year} · {region}</Text>
        </View>
        <View style={[s.brandRule, { marginBottom: 16 }]} />

        {/* Section title */}
        <Text style={s.sectionTitle}>Feriados e Datas de {monthLabel} {year} — {region}</Text>

        {/* Cards */}
        {[...awareness, ...dailyDates].map((o, idx) => {
          const styleKey = styleKeyFor(o.category);
          const day = o.monthLong ? null : parseInt(o.date.slice(8, 10), 10);
          const monthAbbr = MONTHS_SHORT_UPPER[month - 1];
          const weekdayIdx = o.monthLong ? null : new Date(o.date + "T12:00:00Z").getUTCDay();
          const weekday = weekdayIdx !== null ? WEEKDAYS_FULL[weekdayIdx] : "Mês inteiro";
          const description = getDescriptionFor(o.name, o.category, o.nichos);
          const pillLabel = pillLabelFor(o.category);
          const cardStyle =
            styleKey === "national" ? s.cardFeriado :
            styleKey === "estadual" ? s.cardEstadual :
            styleKey === "municipal" ? s.cardMunicipal : s.cardComemorativa;
          const badgeStyle =
            styleKey === "national" ? s.dateBadgeFeriado :
            styleKey === "estadual" ? s.dateBadgeEstadual :
            styleKey === "municipal" ? s.dateBadgeMunicipal : s.dateBadgeComemorativa;
          const pillStyle =
            styleKey === "national" ? s.categoryPillFeriado :
            styleKey === "estadual" ? s.categoryPillEstadual :
            styleKey === "municipal" ? s.categoryPillMunicipal : s.categoryPillComemorativa;
          // Sufixo da localização pro municipal (mostra cidades) e estadual (mostra UF)
          const locationSuffix = o.category === "municipal" && o.cities && o.cities.length > 0
            ? ` · ${o.cities.join(", ")}`
            : o.category === "estadual" && o.uf
            ? ` · ${o.uf}`
            : "";

          return (
            <View key={`${o.date}-${idx}`} style={[s.card, cardStyle]} wrap={false}>
              <View style={[s.dateBadge, badgeStyle]}>
                {day !== null ? (
                  <View>
                    <Text style={s.dateBadgeDay}>{String(day).padStart(2, "0")}</Text>
                    <Text style={s.dateBadgeMonth}>{monthAbbr}</Text>
                  </View>
                ) : (
                  <Text style={[s.dateBadgeMonth, { fontSize: 10 }]}>{monthAbbr}</Text>
                )}
              </View>
              <View style={s.cardBody}>
                <Text style={[s.categoryPill, pillStyle]}>{pillLabel}</Text>
                <Text style={s.cardTitle}>{o.name}{locationSuffix}</Text>
                <Text style={s.cardWeekday}>{weekday}</Text>
                <Text style={s.cardDescription}>{description}</Text>
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footerBrand}>
            {logoUrl && <Image src={logoUrl} style={s.footerLogo} />}
            <Text style={s.footerBrandText}>LONE MÍDIA</Text>
          </View>
          <Text style={s.footerCenter}>Feriados — {monthLabel} {year} · {region}</Text>
          <Text style={s.footerRight} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
