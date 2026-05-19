import { readFileSync, writeFileSync } from "fs";

const md = readFileSync(new URL("./meta-api-status.md", import.meta.url), "utf8");

function processTable(html) {
  const lines = html.split("\n");
  const out = [];
  let inTable = false;
  let isHeader = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\|.+\|$/)) {
      if (!inTable) { out.push("<table>"); inTable = true; isHeader = true; }
      if (line.match(/^\|[\s\-|:]+\|$/)) { isHeader = false; continue; }
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (isHeader) {
        out.push("<thead><tr>" + cells.map(c => `<th>${c}</th>`).join("") + "</tr></thead><tbody>");
      } else {
        out.push("<tr>" + cells.map(c => `<td>${c}</td>`).join("") + "</tr>");
      }
    } else {
      if (inTable) { out.push("</tbody></table>"); inTable = false; isHeader = true; }
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
    const ulMatch = line.match(/^- \[[ x]\] (.+)$/) || line.match(/^- (.+)$/);
    const olMatch = line.match(/^\d+\. (.+)$/);
    if (line.match(/^- \[ \] (.+)$/)) {
      if (!inUl) { out.push("<ul class='checklist'>"); inUl = true; }
      out.push(`<li class='unchecked'>${line.match(/^- \[ \] (.+)$/)[1]}</li>`);
    } else if (line.match(/^- \[x\] (.+)$/)) {
      if (!inUl) { out.push("<ul class='checklist'>"); inUl = true; }
      out.push(`<li class='checked'>${line.match(/^- \[x\] (.+)$/)[1]}</li>`);
    } else if (line.match(/^- (.+)$/)) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${line.match(/^- (.+)$/)[1]}</li>`);
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

function mdToHtml(md) {
  let html = md
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/^---$/gm, "<hr>");

  html = processTable(html);
  html = processLists(html);

  const lines = html.split("\n");
  const result = [];
  let inPre = false, inTable = false, inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("<pre>")) inPre = true;
    if (line.includes("</pre>")) inPre = false;
    if (line.startsWith("<table")) inTable = true;
    if (line.includes("</table>")) inTable = false;
    if (line.startsWith("<ul") || line.startsWith("<ol")) inList = true;
    if (line.includes("</ul>") || line.includes("</ol>")) inList = false;
    if (!inPre && !inTable && !inList && line.trim() && !line.match(/^<(h[1-6]|ul|ol|li|pre|table|hr|div|p)/)) {
      result.push(`<p>${line}</p>`);
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

const body = mdToHtml(md);

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>API Meta — Status & Auditoria · Lone Mídia</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
  font-size: 12px;
  line-height: 1.65;
  color: #1a1a2e;
  background: #fff;
  padding: 48px 56px;
  max-width: 920px;
  margin: 0 auto;
}
/* Cover header */
.cover {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 3px solid #0d4af5;
  padding-bottom: 20px;
  margin-bottom: 32px;
}
.cover-logo {
  font-size: 22px;
  font-weight: 900;
  color: #0d4af5;
  letter-spacing: -0.5px;
}
.cover-meta {
  font-size: 11px;
  color: #666;
  text-align: right;
  line-height: 1.8;
}
h1 {
  font-size: 24px;
  font-weight: 800;
  color: #0d4af5;
  border-bottom: 2px solid #e8ecff;
  padding-bottom: 8px;
  margin: 36px 0 14px;
}
h1:first-of-type { margin-top: 0; }
h2 {
  font-size: 16px;
  font-weight: 700;
  color: #0d4af5;
  border-left: 4px solid #0d4af5;
  padding-left: 10px;
  margin: 28px 0 10px;
  page-break-after: avoid;
}
h3 {
  font-size: 13px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 20px 0 8px;
  page-break-after: avoid;
}
h4 {
  font-size: 12px;
  font-weight: 600;
  color: #444;
  margin: 14px 0 6px;
}
p { margin: 6px 0; color: #333; }
strong { color: #1a1a2e; font-weight: 700; }
em { color: #555; font-style: italic; }
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
  margin: 12px 0;
  overflow-x: auto;
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
  margin: 12px 0;
  font-size: 11px;
  page-break-inside: avoid;
}
thead th {
  background: #0d4af5;
  color: #fff;
  font-weight: 600;
  text-align: left;
  padding: 7px 10px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
td {
  padding: 6px 10px;
  border-bottom: 1px solid #e8ecff;
  color: #333;
  vertical-align: top;
}
tr:nth-child(even) td { background: #f6f8ff; }
ul, ol { margin: 8px 0 8px 20px; color: #333; }
li { margin: 3px 0; line-height: 1.55; }
ul.checklist { list-style: none; margin-left: 4px; }
ul.checklist li { padding-left: 20px; position: relative; }
ul.checklist li.unchecked::before {
  content: "☐";
  position: absolute;
  left: 0;
  color: #999;
  font-size: 13px;
}
ul.checklist li.checked::before {
  content: "☑";
  position: absolute;
  left: 0;
  color: #22c55e;
  font-size: 13px;
}
hr { border: none; border-top: 1px solid #dde3ff; margin: 24px 0; }
/* Status badges inline in p */
.badge-ok { color: #15803d; font-weight: 700; }
.badge-warn { color: #b45309; font-weight: 700; }
.badge-err { color: #dc2626; font-weight: 700; }
/* Section dividers */
h2 { border-left-color: #0d4af5; }
/* "Bugs corrigidos" section: green accent */
/* "Atenção" section: orange accent */
@media print {
  body { padding: 20px 28px; }
  h2 { page-break-before: auto; }
  pre, table { page-break-inside: avoid; }
}
</style>
</head>
<body>
<div class="cover">
  <div class="cover-logo">Lone Mídia</div>
  <div class="cover-meta">
    API Meta — Status &amp; Auditoria Técnica<br>
    13 de maio de 2026<br>
    Documento interno · Confidencial
  </div>
</div>
${body}
</body>
</html>`;

writeFileSync(new URL("./meta-api-status.html", import.meta.url), html);
console.log("HTML gerado: docs/meta-api-status.html");
