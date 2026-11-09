import "server-only";
import { coverLetterText } from "../facts";
import { currentResumeText } from "../resume/compose";
import { structureResume } from "../resume/parse";
import type { Workspace } from "../types";
import type { LetterContent } from "./export";

export { contentHash } from "../facts";

export function letterContent(ws: Workspace): LetterContent | null {
  const cl = ws.coverLetter;
  if (!cl) return null;
  const r = structureResume(currentResumeText(ws));
  return {
    name: r.name || cl.signatureName,
    contactLines: r.contactLines,
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    greeting: cl.greeting,
    paragraphs: cl.paragraphs.map((p) => p.text),
    closing: cl.closing,
    signatureName: cl.signatureName || r.name,
  };
}

export function letterPlainText(ws: Workspace): string | null {
  if (!ws.coverLetter) return null;
  return coverLetterText(ws.coverLetter);
}
