import { structureResume } from "@/lib/resume/parse";
import { getLibraryItem } from "@/lib/server/db";
import { fileResponse, letterDocx, letterPdf, resumeDocx, resumePdf, safeFileName, type LetterContent } from "@/lib/server/export";
import { handle, HttpError } from "@/lib/server/http";
import { parseLetter } from "@/lib/letter";

type Ctx = { params: Promise<{ id: string }> };

function letterFromText(text: string): LetterContent {
  const p = parseLetter(text);
  return {
    name: p.headerLines[0] ?? p.signatureName,
    contactLines: p.headerLines.slice(1),
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    greeting: p.greeting,
    paragraphs: p.paragraphs,
    closing: p.closing,
    signatureName: p.signatureName,
  };
}

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format");
  if (format !== "pdf" && format !== "docx") throw new HttpError(400, "format must be pdf or docx");
  const item = await getLibraryItem(id);
  if (!item) throw new HttpError(404, "Document not found.");
  if (item.kind === "resume") {
    const buf = format === "pdf" ? await resumePdf(item.content) : await resumeDocx(item.content);
    return fileResponse(buf, `${safeFileName(structureResume(item.content).name || item.title)}_Resume`, format);
  }
  const l = letterFromText(item.content);
  const buf = format === "pdf" ? await letterPdf(l) : await letterDocx(l);
  return fileResponse(buf, `${safeFileName(l.name || item.title)}_Cover_Letter`, format);
});
