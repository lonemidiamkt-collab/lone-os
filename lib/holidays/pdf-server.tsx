/**
 * Server-side PDF rendering helper.
 *
 * @react-pdf/renderer suporta tanto browser (toBlob) quanto Node (toBuffer).
 * Aqui usamos a versão Node pra anexar PDFs em emails (broadcasts).
 *
 * Importa o componente JSX em runtime (require dinâmico) pra não acoplar
 * a página /broadcasts ao bundle do react-pdf no client.
 */

import { renderToStream } from "@react-pdf/renderer";
import { HolidaysMonthPdf } from "./pdf";
import { getAllObservances, type Holiday } from "./brasil-api";

interface BuildOptions {
  year: number;
  month: number;          // 1-12
  region?: string;        // "BRASIL" default
  logoUrl?: string;
  /** Filtra profissões pra esses nichos. Se vazio, mostra tudo. */
  nichos?: string[];
}

/**
 * Renderiza o PDF "Feriados do Mês" como Buffer (pronto pra anexar em email).
 *
 * Retorna null em caso de erro (caller decide como degradar — tipicamente
 * envia o email sem anexo).
 */
export async function renderMonthHolidaysPdfBuffer(opts: BuildOptions): Promise<Buffer | null> {
  try {
    const all = await getAllObservances(opts.year);
    const prefix = `${opts.year}-${String(opts.month).padStart(2, "0")}-`;
    let inMonth = all.filter((o) => o.date.startsWith(prefix));
    if (opts.nichos && opts.nichos.length > 0) {
      inMonth = filterByNichosLocal(inMonth, opts.nichos);
    }
    if (inMonth.length === 0) return null;

    const stream = await renderToStream(
      <HolidaysMonthPdf
        year={opts.year}
        month={opts.month}
        observances={inMonth}
        region={opts.region ?? "BRASIL"}
        logoUrl={opts.logoUrl}
      />,
    );
    return await streamToBuffer(stream);
  } catch (err) {
    console.error("[pdf-server] Failed to render holidays PDF:", err);
    return null;
  }
}

/**
 * Mesmo filtro de commemorative-dates, mas opera sobre Holiday[] (que herda
 * a forma após o merge em getAllObservances).
 */
function filterByNichosLocal(observances: Holiday[], nichos: string[]): Holiday[] {
  return observances.filter((o) => {
    if (o.category !== "profissao") return true;
    if (!o.nichos || o.nichos.length === 0) return true;
    return o.nichos.some((n) => nichos.includes(n));
  });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const MONTH_NAMES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function holidaysPdfFilename(year: number, month: number, suffix?: string): string {
  const base = `feriados-${MONTH_NAMES[month - 1]}-${year}`;
  return suffix ? `${base}-${suffix}.pdf` : `${base}.pdf`;
}
