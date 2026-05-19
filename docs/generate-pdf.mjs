import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const md = readFileSync(new URL("./lone-os-system-doc.md", import.meta.url), "utf8");

// Convert markdown to HTML with inline styling (no external deps needed)
function mdToHtml(md) {
  let html = md
    // Headings
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr>")
    // Tables - process separately below
    ;

  // Process tables
  html = processTable(html);

  // Lists
  html = html.replace(/^(\| .+)$/gm, (m) => m); // keep table rows
  html = processLists(html);

  // Paragraphs - wrap lines that aren't already wrapped
  const lines = html.split("\n");
  const result = [];
  let inPre = false;
  let inTable = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("<pre>")) inPre = true;
    if (line.includes("</pre>")) inPre = false;
    if (line.startsWith("<table")) inTable = true;
    if (line.includes("</table>")) inTable = false;
    if (line.startsWith("<ul>") || line.startsWith("<ol>")) inList = true;
    if (line.includes("</ul>") || line.includes("</ol>")) inList = false;

    if (!inPre && !inTable && !inList &&
        line.trim() && !line.match(/^<(h[1-6]|ul|ol|li|pre|table|hr|div|p)/)) {
      result.push(`<p>${line}</p>`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function processTable(html) {
  const lines = html.split("\n");
  const out = [];
  let inTable = false;
  let isHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\|.+\|$/)) {
      if (!inTable) {
        out.push("<table>");
        inTable = true;
        isHeader = true;
      }
      // Skip separator lines (|---|---|)
      if (line.match(/^\|[\s\-|:]+\|$/)) {
        isHeader = false;
        continue;
      }
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (isHeader) {
        out.push("<thead><tr>" + cells.map(c => `<th>${c}</th>`).join("") + "</tr></thead><tbody>");
      } else {
        out.push("<tr>" + cells.map(c => `<td>${c}</td>`).join("") + "</tr>");
      }
    } else {
      if (inTable) {
        out.push("</tbody></table>");
        inTable = false;
        isHeader = true;
      }
      out.push(line);
    }
  }
  if (inTable) out.push("</tbody></table>");
  return out.join("\n");
}

function processLists(html) {
  const lines = html.split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^- (.+)$/);
    const olMatch = line.match(/^\d+\. (.+)$/);

    if (ulMatch) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (inOl) { out.push("</ol>"); inOl = false; }
      out.push(line);
    }
  }
  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");
  return out.join("\n");
}

const body = mdToHtml(md);

const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lone OS — Documentação Técnica Completa</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    font-size: 12px;
    line-height: 1.6;
    color: #1a1a2e;
    background: #fff;
    padding: 40px 48px;
    max-width: 900px;
    margin: 0 auto;
  }
  h1 {
    font-size: 26px;
    font-weight: 800;
    color: #0d4af5;
    border-bottom: 3px solid #0d4af5;
    padding-bottom: 10px;
    margin: 32px 0 16px;
  }
  h1:first-child { margin-top: 0; }
  h2 {
    font-size: 18px;
    font-weight: 700;
    color: #0d4af5;
    border-left: 4px solid #0d4af5;
    padding-left: 10px;
    margin: 28px 0 12px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 14px;
    font-weight: 700;
    color: #1a1a2e;
    margin: 20px 0 8px;
    page-break-after: avoid;
  }
  h4 {
    font-size: 13px;
    font-weight: 600;
    color: #444;
    margin: 16px 0 6px;
  }
  p {
    margin: 6px 0;
    color: #333;
  }
  strong { color: #1a1a2e; }
  em { color: #555; }
  code {
    background: #f0f4ff;
    border: 1px solid #d0d8ff;
    border-radius: 3px;
    padding: 1px 5px;
    font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
    font-size: 10px;
    color: #0d4af5;
  }
  pre {
    background: #0f0f1a;
    border-radius: 8px;
    padding: 14px 18px;
    overflow-x: auto;
    margin: 12px 0;
    page-break-inside: avoid;
  }
  pre code {
    background: none;
    border: none;
    color: #a8d8a8;
    font-size: 10px;
    padding: 0;
    line-height: 1.7;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 11px;
    page-break-inside: avoid;
  }
  th {
    background: #0d4af5;
    color: #fff;
    font-weight: 600;
    text-align: left;
    padding: 7px 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid #e8ecff;
    color: #333;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f6f8ff; }
  ul, ol {
    margin: 8px 0 8px 20px;
    color: #333;
  }
  li {
    margin: 3px 0;
    line-height: 1.5;
  }
  hr {
    border: none;
    border-top: 1px solid #dde3ff;
    margin: 24px 0;
  }
  @media print {
    body { padding: 20px 28px; }
    h2 { page-break-before: auto; }
    pre { page-break-inside: avoid; }
    table { page-break-inside: avoid; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

writeFileSync(new URL("./lone-os-system-doc.html", import.meta.url), fullHtml);
console.log("HTML gerado: docs/lone-os-system-doc.html");
