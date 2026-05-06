import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export async function htmlToPdfBlob(html: string): Promise<Blob> {
  // Render HTML in an off-screen iframe (avoids popup blockers)
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:860px;height:1px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    // Load HTML via blob URL
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
    const scrollH = Math.max(body.scrollHeight, body.offsetHeight, 200);
    iframe.style.height = `${scrollH}px`;

    // Wait one more tick after resize so layout recalculates
    await new Promise((r) => requestAnimationFrame(r));

    const canvas = await html2canvas(body, {
      backgroundColor: "#09090b",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 860,
      height: scrollH,
      windowWidth: 860,
    });

    // Build multi-page PDF (A4)
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();   // 210mm
    const pageH = pdf.internal.pageSize.getHeight();  // 297mm

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
