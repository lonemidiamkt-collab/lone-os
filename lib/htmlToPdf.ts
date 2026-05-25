import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// A4 at 860px render width → page height in CSS pixels
const PDF_PX_W = 860;
const PDF_PAGE_H_PX = Math.round(PDF_PX_W * 297 / 210); // ≈ 1217

/** Walk the offsetParent chain to get element top relative to `root`. */
function docTop(el: HTMLElement, root: HTMLElement): number {
  let top = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    top += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return top;
}

/**
 * Inserts invisible spacer <div>s before any [data-pb] element that would be
 * sliced by an A4 page boundary.  Restarts after each insertion so positions
 * are always fresh (max 40 passes to prevent infinite loops).
 * Only called in multiPage mode.
 */
function avoidPageBreaks(body: HTMLElement): void {
  for (let pass = 0; pass < 40; pass++) {
    const els = Array.from(body.querySelectorAll<HTMLElement>("[data-pb]"));
    let didInsert = false;

    for (const el of els) {
      const h = el.offsetHeight;
      if (h < 10) continue;                          // skip collapsed elements
      const top = docTop(el, body);
      const bottom = top + h;
      const pageNum = Math.floor(top / PDF_PAGE_H_PX);
      const breakAt = (pageNum + 1) * PDF_PAGE_H_PX; // next page boundary

      if (bottom > breakAt && top < breakAt) {
        // Element straddles a page break — push it to the next page
        const gap = breakAt - top;
        const sp = body.ownerDocument!.createElement("div");
        sp.style.cssText = `display:block;height:${gap}px;min-height:${gap}px;width:100%;flex-shrink:0;`;
        el.parentNode!.insertBefore(sp, el);
        didInsert = true;
        break; // restart so positions reflect the new spacer
      }
    }

    if (!didInsert) break;
  }
}

/**
 * Converts an HTML string to a PDF Blob using html2canvas + jsPDF.
 *
 * @param options.multiPage - `true`: renders as standard A4 pages (210×297 mm) with automatic
 *   pagination and page-break avoidance. Use for reports that span multiple pages or need to
 *   be printed (e.g. internal traffic reports via `exportTrafficReportPdf`).
 *
 *   `false` (default): renders as a single page whose height matches the content exactly.
 *   Eliminates the white-border artifact that occurs when content is shorter than 297 mm.
 *   Use for client-facing custom reports (e.g. `exportClientReportPdf`).
 */
export async function htmlToPdfBlob(html: string, options?: { multiPage?: boolean }): Promise<Blob> {
  const multiPage = options?.multiPage ?? false;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:860px;height:1px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      iframe.addEventListener("load", () => { URL.revokeObjectURL(url); resolve(); }, { once: true });
      iframe.addEventListener("error", reject, { once: true });
      iframe.src = url;
    });

    // Allow fonts + images to load
    await new Promise((r) => setTimeout(r, 900));

    const body = iframe.contentDocument!.body;

    // Simulate @media print: hide toolbar / action bar
    body.querySelectorAll<HTMLElement>(".no-print").forEach((el) => {
      el.style.display = "none";
    });

    // Initial layout pass
    let scrollH = Math.max(body.scrollHeight, body.offsetHeight, 200);
    iframe.style.height = `${scrollH}px`;
    await new Promise((r) => requestAnimationFrame(r));

    if (multiPage) {
      // Insert spacers to prevent elements from being sliced at page boundaries
      avoidPageBreaks(body);
      // Re-measure after spacers
      scrollH = Math.max(body.scrollHeight, body.offsetHeight, 200);
      iframe.style.height = `${scrollH}px`;
      await new Promise((r) => requestAnimationFrame(r));
    }

    const canvas = await html2canvas(body, {
      backgroundColor: "#060814",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: PDF_PX_W,
      height: scrollH,
      windowWidth: PDF_PX_W,
    });

    const imgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (multiPage) {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297 mm

      let yOffset = 0;
      let page = 0;
      while (yOffset < imgHeight) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgDataUrl, "JPEG", 0, -yOffset, pageW, imgHeight);
        yOffset += pageH;
        page++;
      }

      return pdf.output("blob");
    }

    // Dynamic height: page matches content exactly — no white border
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [imgWidth, imgHeight] });
    pdf.addImage(imgDataUrl, "JPEG", 0, 0, imgWidth, imgHeight);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(iframe);
  }
}

export async function downloadAsPdf(html: string, filename: string, options?: { multiPage?: boolean }): Promise<void> {
  const blob = await htmlToPdfBlob(html, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
