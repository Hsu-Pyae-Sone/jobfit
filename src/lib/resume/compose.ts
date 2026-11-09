import type { Decision, LineKind, ResumeLine, Suggestion, Workspace } from "../types";
import { linesToText, parseResume } from "./parse";

export type RowStatus =
  | "unchanged"
  | "modified"
  | "removed"
  | "added"
  | "moved-from"
  | "moved-to";

export interface DiffRow {
  key: string;
  status: RowStatus;
  left: { text: string; kind: LineKind } | null;
  right: { text: string; kind: LineKind } | null;
  /** Every suggestion that concerns this row, whatever its decision, so the UI can show it. */
  suggestionIds: string[];
}

export interface ComposeResult {
  rows: DiffRow[];
  lines: { kind: LineKind; text: string }[];
  text: string;
}

function splitProposed(proposed: string, kind: LineKind): { kind: LineKind; text: string }[] {
  return proposed
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      // A multi-line "add" may introduce a new section: re-parse each line's kind.
      const parsed = parseResume(t)[0];
      if (parsed?.kind === "heading") return { kind: "heading" as const, text: parsed.text };
      return { kind, text: t.replace(/^\s*[-•*]\s*/, "") };
    });
}

export function proposedText(s: Suggestion, edits: Record<string, string>): string {
  return (edits[s.id] ?? s.proposed).trim();
}

/**
 * Apply accepted suggestions to the original lines. Pending and rejected suggestions are
 * never applied - nothing reaches the final resume without the user's explicit decision.
 */
export function composeResume(
  lines: ResumeLine[],
  suggestions: Suggestion[],
  decisions: Record<string, Decision>,
  edits: Record<string, string> = {},
): ComposeResult {
  const accepted = (s: Suggestion) => decisions[s.id] === "accepted";
  const byTarget = new Map<string, Suggestion[]>();
  const inserts = new Map<string, Suggestion[]>(); // anchor line id -> adds / moves landing after it
  for (const s of suggestions) {
    if (s.type === "add") {
      inserts.set(s.lineId, [...(inserts.get(s.lineId) ?? []), s]);
    } else {
      byTarget.set(s.lineId, [...(byTarget.get(s.lineId) ?? []), s]);
      if (s.type === "move" && s.afterLineId) {
        inserts.set(s.afterLineId, [...(inserts.get(s.afterLineId) ?? []), s]);
      }
    }
  }

  const lineById = new Map(lines.map((l) => [l.id, l]));
  const rows: DiffRow[] = [];
  const out: { kind: LineKind; text: string }[] = [];

  for (const line of lines) {
    const targeted = byTarget.get(line.id) ?? [];
    const ids = targeted.map((s) => s.id);
    const active = targeted.find(accepted);
    const left = { text: line.text, kind: line.kind };

    if (active?.type === "modify") {
      const text = proposedText(active, edits);
      rows.push({ key: line.id, status: "modified", left, right: { text, kind: line.kind }, suggestionIds: ids });
      out.push({ kind: line.kind, text });
    } else if (active?.type === "remove") {
      rows.push({ key: line.id, status: "removed", left, right: null, suggestionIds: ids });
    } else if (active?.type === "move") {
      rows.push({ key: line.id, status: "moved-from", left, right: null, suggestionIds: ids });
    } else {
      rows.push({ key: line.id, status: "unchanged", left, right: left, suggestionIds: ids });
      out.push({ kind: line.kind, text: line.text });
    }

    for (const ins of inserts.get(line.id) ?? []) {
      if (ins.type === "add") {
        if (!accepted(ins)) {
          // Show the pending/rejected add as a card-only row so it can be decided on.
          rows.push({ key: `${ins.id}-pending`, status: "added", left: null, right: null, suggestionIds: [ins.id] });
          continue;
        }
        splitProposed(proposedText(ins, edits), ins.kind).forEach((nl, i) => {
          rows.push({ key: `${ins.id}-${i}`, status: "added", left: null, right: nl, suggestionIds: i === 0 ? [ins.id] : [] });
          out.push(nl);
        });
      } else if (ins.type === "move" && accepted(ins)) {
        const src = lineById.get(ins.lineId);
        if (!src) continue;
        const nl = { kind: src.kind, text: src.text };
        rows.push({ key: `${ins.id}-to`, status: "moved-to", left: null, right: nl, suggestionIds: [] });
        out.push(nl);
      }
    }
  }

  return { rows, lines: out, text: linesToText(out) };
}

/** The resume text that will be reviewed and exported. */
export function currentResumeText(ws: Workspace): string {
  if (ws.finalResume !== null && ws.finalResume !== undefined) return ws.finalResume;
  if (!ws.optimization) return ws.inputs.resumeText;
  return composeResume(
    parseResume(ws.inputs.resumeText),
    ws.optimization.suggestions,
    ws.decisions,
    ws.edits,
  ).text;
}
