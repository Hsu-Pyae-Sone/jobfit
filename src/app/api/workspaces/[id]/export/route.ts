import { currentResumeText } from "@/lib/resume/compose";
import { structureResume } from "@/lib/resume/parse";
import { letterContent } from "@/lib/server/documents";
import { fileResponse, letterDocx, letterPdf, resumeDocx, resumePdf, safeFileName } from "@/lib/server/export";
import { handle, HttpError, requireWorkspace } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const doc = url.searchParams.get("doc");
  const format = url.searchParams.get("format");
  if (format !== "pdf" && format !== "docx") throw new HttpError(400, "format must be pdf or docx");
  const ws = await requireWorkspace(id);

  if (doc === "resume") {
    const text = currentResumeText(ws);
    if (!text.trim()) throw new HttpError(400, "There is no resume to export.");
    const name = structureResume(text).name;
    const buf = format === "pdf" ? await resumePdf(text) : await resumeDocx(text);
    return fileResponse(buf, `${safeFileName(name)}_Resume`, format);
  }
  if (doc === "cover") {
    const l = letterContent(ws);
    if (!l) throw new HttpError(400, "There is no cover letter to export.");
    const buf = format === "pdf" ? await letterPdf(l) : await letterDocx(l);
    return fileResponse(buf, `${safeFileName(l.name)}_Cover_Letter`, format);
  }
  throw new HttpError(400, "doc must be resume or cover");
});
