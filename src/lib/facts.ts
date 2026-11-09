import type { CoverLetter, Workspace } from "./types";
import { currentResumeText, proposedText } from "./resume/compose";

// "Verified facts" = everything the user supplied or explicitly confirmed.
// Generated text is checked against this corpus; anything not found in it is flagged.

export function userFactsCorpus(ws: Workspace, includeConfirmed = true): string {
  const { inputs } = ws;
  const parts = [inputs.resumeText, ...Object.values(inputs.extra)];
  for (const a of Object.values(ws.answers)) {
    if (!a.noNumber && a.answer.trim()) parts.push(a.answer);
  }
  // Text of suggestions the user accepted after confirming the new claims are true.
  if (includeConfirmed) {
    for (const s of ws.optimization?.suggestions ?? []) {
      if (ws.confirmations[s.id] && ws.decisions[s.id] === "accepted") parts.push(proposedText(s, ws.edits));
    }
  }
  return parts.filter(Boolean).join("\n");
}

/** Cover letters may also reference facts about the company the user provided. */
export function coverLetterCorpus(ws: Workspace): string {
  const c = ws.inputs.company;
  return [userFactsCorpus(ws), c.name, c.notes, c.pageText, ws.inputs.targetRole].filter(Boolean).join("\n");
}

export function coverLetterText(cl: CoverLetter, header?: string[]): string {
  const parts: string[] = [];
  if (header?.length) parts.push(header.join("\n"), "");
  parts.push(cl.greeting, "");
  for (const p of cl.paragraphs) parts.push(p.text, "");
  parts.push(cl.closing, cl.signatureName);
  return parts.join("\n").trim();
}

/** Short, stable hash (FNV-1a) used to detect stale analysis/review results. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function inputsHash(ws: Workspace): string {
  const i = ws.inputs;
  return hashString(
    JSON.stringify([i.resumeText, i.jobText, i.extra, i.company, i.targetRole, i.targetIndustry]),
  );
}

export function answersHash(ws: Workspace): string {
  return hashString(JSON.stringify(ws.answers));
}

/** Changes whenever the documents that will be exported change. */
export function contentHash(ws: Workspace): string {
  return hashString(currentResumeText(ws) + "\u0000" + (ws.coverLetter ? coverLetterText(ws.coverLetter) : ""));
}

export function optimizationHash(ws: Workspace): string {
  return hashString(inputsHash(ws) + answersHash(ws));
}
