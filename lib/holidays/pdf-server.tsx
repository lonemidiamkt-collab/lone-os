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
import { readFile } from "fs/promises";
import { join } from "path";
import { HolidaysMonthPdf } from "./pdf";
import { getAllObservances, observancesForLocation, type Holiday } from "./brasil-api";

// Cache do logo em memória — lido 1x do FS na primeira chamada
let _logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string | undefined> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const buf = await readFile(join(process.cwd(), "public", "logo.png"));
    _logoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    return _logoDataUrl;
  } catch (err) {
    console.warn("[pdf-server] Logo não encontrado em public/logo.png — PDF vai sem logo:", err);
    return undefined;
  }
}

// Timeout pro renderToStream (PDF complexo não deveria demorar > 10s)
const PDF_RENDER_TIMEOUT_MS = 10000;

interface BuildOptions {
  year: number;
  month: number;          // 1-12
  region?: string;        // texto exibido no subtítulo (ex.: "BRASIL", "SAQUAREMA · RJ")
  /** @deprecated Não usado mais — logo é lido do filesystem (public/logo.png). */
  logoUrl?: string;
  /** Filtra profissões pra esses nichos. Se vazio, mostra tudo. */
  nichos?: string[];
  /** Filtra estaduais pra esse UF (ex.: "RJ"). Sem isso, estaduais não aparecem. */
  uf?: string;
  /** Filtra municipais pra essa cidade. Sem isso, municipais não aparecem. */
  city?: string;
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

    // Filtro de localização (estaduais/municipais)
    if (opts.uf || opts.city) {
      inMonth = observancesForLocation(inMonth, { uf: opts.uf, city: opts.city });
    } else {
      // Sem filtro de localização → omite estaduais e municipais (PDF mais limpo
      // pra clientes sem cidade cadastrada)
      inMonth = inMonth.filter((o) => o.category !== "estadual" && o.category !== "municipal");
    }

    if (opts.nichos && opts.nichos.length > 0) {
      inMonth = filterByNichosLocal(inMonth, opts.nichos);
    }
    if (inMonth.length === 0) return null;

    const logoDataUrl = await getLogoDataUrl();

    // Timeout protection — PDF complexo não pode bloquear o request indefinidamente
    const renderPromise = (async () => {
      const stream = await renderToStream(
        <HolidaysMonthPdf
          year={opts.year}
          month={opts.month}
          observances={inMonth}
          region={opts.region ?? "BRASIL"}
          logoUrl={logoDataUrl}
        />,
      );
      return streamToBuffer(stream);
    })();

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn(`[pdf-server] PDF render timed out after ${PDF_RENDER_TIMEOUT_MS}ms`);
        resolve(null);
      }, PDF_RENDER_TIMEOUT_MS);
    });

    return await Promise.race([renderPromise, timeoutPromise]);
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
