import "server-only";
import path from "node:path";
import type { SourceInfo } from "../types";
import { aiConfigured } from "./ai";
import { htmlToText } from "./fetch-url";
import { ocrWithAi } from "./tasks";

// Hosting platforms cap request bodies (Vercel: 4.5 MB), so uploads stay under 4 MB.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "4 MB";

export class ExtractError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface ExtractResult {
  text: string;
  method: SourceInfo["method"];
  warnings: string[];
  canRetryWithAi: boolean;
}

type FileKind = "pdf" | "docx" | "png" | "jpeg" | "gif" | "webp" | "text";

/** Identify the file from its bytes, not its name or claimed MIME type. */
export function sniff(buf: Buffer): FileKind | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "docx";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (!buf.subarray(0, 4096).includes(0)) return "text";
  return null;
}

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Content type from the file's actual bytes (the browser-supplied type is not trusted). */
export function mimeOf(kind: FileKind | null): string {
  if (kind === "pdf") return "application/pdf";
  if (kind === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (kind === "text") return "text/plain";
  return (kind && IMAGE_MIME[kind]) || "application/octet-stream";
}

async function pdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let out = "";
    let lastY: number | null = null;
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
      out += it.str;
      if (it.hasEOL) out += "\n";
      lastY = y;
    }
    pages.push(out);
  }
  const numPages = doc.numPages;
  await task.destroy();
  return { text: pages.join("\n\n"), pages: numPages };
}

async function docxText(buf: Buffer): Promise<{ text: string; warnings: string[] }> {
  const mammoth = await import("mammoth");
  try {
    // Convert via HTML (not raw text) so Word list items keep their bullet markers.
    const res = await mammoth.convertToHtml({ buffer: buf });
    const html = res.value.replace(/<\/p>/gi, "</p>\n");
    return { text: htmlToText(html), warnings: res.messages.filter((m) => m.type === "warning").map((m) => m.message).slice(0, 3) };
  } catch {
    throw new ExtractError("This file could not be read as a Word document (.docx). Older .doc files are not supported; save it as .docx or PDF.");
  }
}

async function tesseractText(buf: Buffer): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  const worker = await createWorker("eng", 1, { langPath, gzip: true, cacheMethod: "none" });
  try {
    const { data } = await worker.recognize(buf);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

export async function extractFile(buf: Buffer, fileName: string, preferAi: boolean): Promise<ExtractResult> {
  if (buf.length === 0) throw new ExtractError("The file is empty.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new ExtractError(`Files must be ${MAX_UPLOAD_LABEL} or smaller.`, 413);
  const kind = sniff(buf);
  const warnings: string[] = [];
  const ai = aiConfigured();

  if (kind === "pdf") {
    if (preferAi) {
      const r = await ocrWithAi(buf, "application/pdf");
      return { text: r.text, method: "ocr-ai", warnings: r.legibility === "good" ? [] : ["Parts of the document were hard to read. Check the text carefully."], canRetryWithAi: false };
    }
    let res: { text: string; pages: number };
    try {
      res = await pdfText(buf);
    } catch {
      throw new ExtractError("This PDF could not be opened. It may be encrypted or damaged.");
    }
    const chars = res.text.replace(/\s/g, "").length;
    if (chars < 40 * res.pages) {
      if (ai) {
        const r = await ocrWithAi(buf, "application/pdf");
        return { text: r.text, method: "ocr-ai", warnings: ["This PDF had no text layer (likely scanned), so it was read with AI OCR. Check the text carefully."], canRetryWithAi: false };
      }
      throw new ExtractError("This PDF looks scanned (no selectable text). Upload a screenshot/image of it for OCR, paste the text, or configure an API key to enable AI OCR for scanned PDFs.", 422);
    }
    if (res.pages > 4) warnings.push(`The PDF has ${res.pages} pages; make sure only the relevant document was uploaded.`);
    return { text: res.text, method: "pdf-text", warnings, canRetryWithAi: ai };
  }

  if (kind === "docx") {
    if (!/\.docx$/i.test(fileName) && !/\.dotx$/i.test(fileName)) warnings.push("File was read as a Word document.");
    const r = await docxText(buf);
    return { text: r.text, method: "docx", warnings: [...warnings, ...r.warnings], canRetryWithAi: false };
  }

  if (kind && kind in IMAGE_MIME) {
    if (preferAi) {
      const r = await ocrWithAi(buf, IMAGE_MIME[kind]);
      return { text: r.text, method: "ocr-ai", warnings: r.legibility === "good" ? [] : ["Parts of the image were hard to read. Check the text carefully."], canRetryWithAi: false };
    }
    if (kind === "webp" || kind === "gif") {
      if (ai) return extractFile(buf, fileName, true);
      throw new ExtractError("WebP and GIF images need AI OCR. Upload a PNG or JPEG screenshot instead.", 415);
    }
    const r = await tesseractText(buf);
    if (r.confidence < 70) warnings.push(`OCR confidence is ${Math.round(r.confidence)}%. Some words may be wrong; please check the text.`);
    return { text: r.text, method: "ocr-tesseract", warnings, canRetryWithAi: ai };
  }

  if (kind === "text") {
    return { text: buf.toString("utf8"), method: "text-file", warnings, canRetryWithAi: false };
  }

  throw new ExtractError("Unsupported file type. Upload a PDF, DOCX, PNG, JPEG, or plain-text file.", 415);
}
