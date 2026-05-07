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

export async function htmlToPdfBlob(html: string): Promise<Blob> {
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

    // Insert spacers to prevent elements from being sliced at page boundaries
    avoidPageBreaks(body);

    // Re-measure after spacers
    scrollH = Math.max(body.scrollHeight, body.offsetHeight, 200);
    iframe.style.height = `${scrollH}px`;
    await new Promise((r) => requestAnimationFrame(r));

    const canvas = await html2canvas(body, {
      backgroundColor: "#09090b",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: PDF_PX_W,
      height: scrollH,
      windowWidth: PDF_PX_W,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
    const pageH = pdf.internal.pageSize.getHeight();  // 297 mm

    const imgW = pageW;
    const imgH = (canvas.height / canvas.width) * imgW;
    const imgDataUrl = canvas.toDataURL("image/jpeg", 0.92);

    let yOffset = 0;
    let page = 0;
    while (yOffset < imgH) {
      if (page > 0) pdf.addPage();
      pdf.addImage(imgDataUrl, "JPEG", 0, -yOffset, imgW, imgH);
      yOffset += pageH;
      page++;
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(iframe);
  }
}

export async function downloadAsPdf(html: string, filename: string): Promise<void> {
  const blob = await htmlToPdfBlob(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
