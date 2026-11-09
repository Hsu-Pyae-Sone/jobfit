import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import { structureResume } from "../resume/parse";

// ATS-friendly exports: single column, standard fonts, real text (no images), no tables,
// text boxes, headers or footers. Contact details stay in the document body.

export interface LetterContent {
  name: string;
  contactLines: string[];
  date: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
  signatureName: string;
}

// ---------- PDF ----------

function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void, title: string, author: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 54, left: 60, right: 60 },
      info: { Title: title, Author: author, Creator: "Jobfit" },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

// Standard PDF fonts only cover Latin-1-ish characters; replace common typographic ones.
function pdfSafe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•▪●]/g, "-");
}

export function resumePdf(text: string): Promise<Buffer> {
  const r = structureResume(text);
  return pdfBuffer(
    (doc) => {
      const width = doc.page.width - 120;
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text(pdfSafe(r.name || "Resume"), { align: "left" });
      if (r.contactLines.length) {
        doc.moveDown(0.15).font("Helvetica").fontSize(10).fillColor("#333333").text(pdfSafe(r.contactLines.join("  |  ")));
      }
      for (const section of r.sections) {
        doc.moveDown(0.8);
        doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#111111").text(pdfSafe(section.title.toUpperCase()), { characterSpacing: 0.5 });
        const y = doc.y + 2;
        doc.moveTo(60, y).lineTo(60 + width, y).lineWidth(0.6).strokeColor("#888888").stroke();
        doc.moveDown(0.35);
        for (const line of section.lines) {
          if (line.kind === "bullet") {
            // Hanging indent: wrapped lines align with the text, not the dash.
            const y = doc.y;
            doc.font("Helvetica").fontSize(10.5).fillColor("#111111").text("-", 64, y, { lineBreak: false });
            doc.text(pdfSafe(line.text), 76, y, { width: width - 16, paragraphGap: 2, align: "left" });
            doc.x = 60;
          } else {
            const looksLikeRole = line.text.length < 110 && /\b(19|20)\d{2}\b|present/i.test(line.text);
            doc
              .font(looksLikeRole ? "Helvetica-Bold" : "Helvetica")
              .fontSize(10.5)
              .fillColor("#111111")
              .text(pdfSafe(line.text), { paragraphGap: 2 });
          }
        }
      }
    },
    `${r.name || "Resume"} - Resume`,
    r.name,
  );
}

export function letterPdf(l: LetterContent): Promise<Buffer> {
  return pdfBuffer(
    (doc) => {
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111").text(pdfSafe(l.name));
      if (l.contactLines.length) doc.font("Helvetica").fontSize(10).fillColor("#333333").text(pdfSafe(l.contactLines.join("  |  ")));
      doc.moveDown(1.2).font("Helvetica").fontSize(11).fillColor("#111111").text(l.date);
      doc.moveDown(1).text(pdfSafe(l.greeting));
      for (const p of l.paragraphs) doc.moveDown(0.8).text(pdfSafe(p), { align: "left", lineGap: 2 });
      doc.moveDown(1).text(pdfSafe(l.closing));
      doc.moveDown(0.2).text(pdfSafe(l.signatureName));
    },
    `${l.name} - Cover Letter`,
    l.name,
  );
}

// ---------- DOCX ----------

const FONT = "Calibri";
const numbering = {
  config: [
    {
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
    },
  ],
};

export function resumeDocx(text: string): Promise<Buffer> {
  const r = structureResume(text);
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: r.name || "Resume", bold: true, size: 36, font: FONT })], spacing: { after: 60 } }),
  ];
  if (r.contactLines.length)
    children.push(new Paragraph({ children: [new TextRun({ text: r.contactLines.join("  |  "), size: 20, font: FONT })], spacing: { after: 120 } }));
  for (const section of r.sections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.title.toUpperCase(), bold: true, size: 23, font: FONT })],
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "888888", space: 2 } },
      }),
    );
    for (const line of section.lines) {
      if (line.kind === "bullet") {
        children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: line.text, size: 21, font: FONT })], spacing: { after: 40 } }));
      } else {
        const looksLikeRole = line.text.length < 110 && /\b(19|20)\d{2}\b|present/i.test(line.text);
        children.push(new Paragraph({ children: [new TextRun({ text: line.text, size: 21, font: FONT, bold: looksLikeRole })], spacing: { before: looksLikeRole ? 80 : 0, after: 40 } }));
      }
    }
  }
  const doc = new Document({
    creator: "Jobfit",
    title: `${r.name || "Resume"} - Resume`,
    numbering,
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

export function letterDocx(l: LetterContent): Promise<Buffer> {
  const p = (text: string, opts: { bold?: boolean; size?: number; after?: number } = {}) =>
    new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: FONT })], spacing: { after: opts.after ?? 200 } });
  const children = [
    p(l.name, { bold: true, size: 32, after: 40 }),
    ...(l.contactLines.length ? [p(l.contactLines.join("  |  "), { size: 20, after: 280 })] : []),
    p(l.date),
    p(l.greeting),
    ...l.paragraphs.map((t) => p(t)),
    p(l.closing, { after: 40 }),
    p(l.signatureName),
  ];
  const doc = new Document({
    creator: "Jobfit",
    title: `${l.name} - Cover Letter`,
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export function fileResponse(buf: Buffer, name: string, format: "pdf" | "docx") {
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": MIME[format],
      "content-disposition": `attachment; filename="${name}.${format}"`,
      "cache-control": "no-store",
    },
  });
}

export function safeFileName(s: string): string {
  return (s || "document").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "document";
}
