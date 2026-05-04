// Converte os .md em .docx prontos pra upload no D4Sign.
// Uso: npm install && npm run build

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  "Contrato - Social Media.md",
  "Contrato - Tráfego Pago.md",
  "Contrato - Lone Growth.md",
];

// Parse **bold** into array of TextRun with bold flag where needed.
function parseInline(text) {
  // Strip Markdown escape backslashes (\_  \* etc.) before processing
  text = text.replace(/\\([_*[\]()~`>#+=|{}.!\-])/g, "$1");
  const runs = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }
    runs.push(new TextRun({ text: match[1], bold: true }));
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }
  return runs.length ? runs : [new TextRun({ text })];
}

function horizontalRule() {
  return new Paragraph({
    border: {
      bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 },
    },
    spacing: { before: 200, after: 200 },
  });
}

function mdToDocx(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const children = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      // skip extra blank lines; paragraphs already break
      continue;
    }

    if (trimmed === "---") {
      children.push(horizontalRule());
      continue;
    }

    if (trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 200 },
          children: parseInline(trimmed.replace(/^#\s+/, "")),
        })
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
          children: parseInline(trimmed.replace(/^##\s+/, "")),
        })
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
          children: parseInline(trimmed.replace(/^###\s+/, "")),
        })
      );
      continue;
    }

    if (trimmed.startsWith("- ")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: parseInline(trimmed.slice(2)),
        })
      );
      continue;
    }

    // Default: paragraph
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120, line: 300 },
        children: parseInline(trimmed),
      })
    );
  }

  return new Document({
    creator: "Lone Midia",
    title: "Contrato",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 }, // 11pt
        },
      },
    },
    sections: [{ children }],
  });
}

for (const file of FILES) {
  const mdPath = path.join(__dirname, file);
  const docxPath = path.join(__dirname, file.replace(/\.md$/, ".docx"));
  const md = fs.readFileSync(mdPath, "utf8");
  const doc = mdToDocx(md);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  console.log(`✓ ${file.replace(/\.md$/, ".docx")}`);
}
