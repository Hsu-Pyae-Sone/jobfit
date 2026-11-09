"use client";

import Checkbox from "@mui/material/Checkbox";
import { diffWords } from "diff";
import { useMemo, useState } from "react";
import { ArrowDownUp, Check, Minus, Pencil, Plus, RefreshCw, RotateCcw, ShieldAlert, Sparkles, Undo2, X } from "lucide-react";
import { checkClaims, hasClaimRisk } from "@/lib/claims";
import { optimizationHash, userFactsCorpus } from "@/lib/facts";
import { composeResume, proposedText, type DiffRow } from "@/lib/resume/compose";
import { parseResume } from "@/lib/resume/parse";
import type { ClaimFlags, Decision, LineKind, Suggestion } from "@/lib/types";
import { Alert, Badge, Button, Card, SectionTitle, Textarea, WorkingPanel, cx, useDraft } from "../ui";
import { SaveDocButtons } from "./SaveDocButtons";
import { useWs } from "./useWorkspace";

function WordDiff({ from, to }: { from: string; to: string }) {
  const parts = diffWords(from, to);
  return (
    <>
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="diff-ins">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="diff-del">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

function LineText({ kind, children, className }: { kind: LineKind; children: React.ReactNode; className?: string }) {
  if (kind === "heading") return <p className={cx("text-[13px] font-semibold uppercase tracking-wide", className)}>{children}</p>;
  if (kind === "bullet")
    return (
      <p className={cx("flex gap-2", className)}>
        <span aria-hidden>•</span>
        <span>{children}</span>
      </p>
    );
  return <p className={className}>{children}</p>;
}

const STATUS = {
  unchanged: { label: "Unchanged", tone: "neutral", cell: "" },
  modified: { label: "Modified", tone: "mod", cell: "bg-mod-bg/70" },
  removed: { label: "Removed", tone: "del", cell: "bg-del-bg/70" },
  added: { label: "Added", tone: "add", cell: "bg-add-bg/70" },
  "moved-from": { label: "Moved", tone: "move", cell: "bg-move-bg/70" },
  "moved-to": { label: "Moved here", tone: "move", cell: "bg-move-bg/70" },
} as const;

function Legend() {
  const items = [
    ["Added", "bg-add-bg text-add-ink", Plus],
    ["Modified", "bg-mod-bg text-mod-ink", Pencil],
    ["Removed", "bg-del-bg text-del-ink", Minus],
    ["Moved", "bg-move-bg text-move-ink", ArrowDownUp],
    ["Unchanged", "bg-black/5 text-ink-2", Check],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2 text-xs" aria-label="Legend">
      {items.map(([label, cls, Icon]) => (
        <span key={label} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium", cls)}>
          <Icon className="size-3" aria-hidden /> {label}
        </span>
      ))}
    </div>
  );
}

const TYPE_LABEL: Record<Suggestion["type"], string> = { modify: "Rewrite", add: "Add", remove: "Remove", move: "Reorder" };

function FlagList({ flags }: { flags: ClaimFlags }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {flags.unsupportedNumbers.length > 0 && <li>Numbers not in your information: <strong>{flags.unsupportedNumbers.join(", ")}</strong></li>}
      {flags.newTerms.length > 0 && <li>Skills/terms not in your information: <strong>{flags.newTerms.join(", ")}</strong></li>}
    </ul>
  );
}

function SuggestionCard({ s, lineText }: { s: Suggestion; lineText: (id: string) => string }) {
  const { ws, save } = useWs();
  const decision: Decision = ws.decisions[s.id] ?? "pending";
  const text = proposedText(s, ws.edits);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useDraft(text);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Recompute claim checks against the user's own information (covers user edits too).
  const flags = useMemo(
    () => (s.type === "modify" || s.type === "add" ? checkClaims(text, userFactsCorpus(ws, false), ws.analysis?.keywords.missing ?? []) : null),
    [s.type, text, ws],
  );
  const risky = hasClaimRisk(flags ?? undefined);
  const confirmed = Boolean(ws.confirmations[s.id]);

  const decide = (d: Decision) => {
    const patch: Record<string, unknown> = { decisions: { [s.id]: d } };
    if (d === "accepted" && risky) patch.confirmations = { [s.id]: true };
    void save(patch);
  };

  return (
    <div
      className={cx(
        "rounded-xl border p-4 text-sm",
        decision === "accepted" ? "border-add-ink/30 bg-add-bg/40" : decision === "rejected" ? "border-line bg-surface-2 opacity-75" : "border-brand/30 bg-surface shadow-sm",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={s.type === "add" ? "add" : s.type === "remove" ? "del" : s.type === "move" ? "move" : "mod"}>{TYPE_LABEL[s.type]}</Badge>
        <Badge>{s.category}</Badge>
        {s.significance === "major" && <Badge tone="brand">Significant</Badge>}
        <span className="ml-auto text-xs font-medium text-muted">
          {decision === "accepted" ? "✓ Accepted" : decision === "rejected" ? "Rejected" : "Awaiting your decision"}
        </span>
      </div>

      {(s.type === "modify" || s.type === "add") && (
        <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5 leading-relaxed">
          {editing ? (
            <>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))} aria-label="Edit suggestion" />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    void save({ edits: { [s.id]: draft } });
                    setEditing(false);
                    setConfirmChecked(false);
                  }}
                >
                  Save edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : s.type === "modify" ? (
            <WordDiff from={s.original} to={text} />
          ) : (
            <span className="whitespace-pre-line">{text}</span>
          )}
        </div>
      )}
      {s.type === "remove" && (
        <p className="mt-3 rounded-lg bg-del-bg/60 px-3 py-2 text-del-ink">
          Removes: <span className="line-through">“{s.original}”</span>
        </p>
      )}
      {s.type === "move" && (
        <p className="mt-3 rounded-lg bg-move-bg/60 px-3 py-2 text-move-ink">
          Moves this line after: “{lineText(s.afterLineId)}”
        </p>
      )}

      <p className="mt-2.5 leading-relaxed text-ink-2">
        <span className="font-medium text-ink">Why: </span>
        {s.reason}
      </p>

      {flags && flags.genericPhrases.length > 0 && <p className="mt-2 text-xs text-mod-ink">Contains generic phrasing: {flags.genericPhrases.join(", ")}</p>}

      {risky && flags && (
        <div className="mt-3 rounded-lg border border-del-ink/25 bg-del-bg/50 px-3 py-2.5 text-[13px] text-ink">
          <p className="flex items-center gap-1.5 font-semibold text-del-ink">
            <ShieldAlert className="size-4" /> Check before accepting
          </p>
          <FlagList flags={flags} />
          {decision !== "accepted" && (
            <label className="mt-2 flex items-start gap-2">
              <Checkbox size="small" sx={{ p: 0.25 }} checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
              <span>These details are accurate for me. (Otherwise edit the text or reject it.)</span>
            </label>
          )}
          {decision === "accepted" && confirmed && <p className="mt-1 text-xs text-muted">You confirmed these details are accurate.</p>}
        </div>
      )}
      {s.type === "remove" && decision === "pending" && <p className="mt-2 text-xs text-mod-ink">Removing content is never applied automatically. Keep anything that is a relevant, true qualification.</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {decision === "pending" ? (
          <>
            <Button size="sm" variant="success" icon={<Check className="size-3.5" />} disabled={risky && !confirmChecked} onClick={() => decide("accepted")}>
              Accept
            </Button>
            <Button size="sm" icon={<X className="size-3.5" />} onClick={() => decide("rejected")}>
              Reject
            </Button>
            {(s.type === "modify" || s.type === "add") && !editing && (
              <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => decide("pending")}>
            Undo
          </Button>
        )}
      </div>
    </div>
  );
}

function Cell({ side, row }: { side: "left" | "right"; row: DiffRow }) {
  const content = row[side];
  const st = STATUS[row.status];
  const highlight = (side === "left" && (row.status === "removed" || row.status === "moved-from" || row.status === "modified")) || (side === "right" && row.status !== "unchanged" && row.status !== "removed" && row.status !== "moved-from");
  if (!content) {
    const placeholder =
      side === "right" && row.status === "removed" ? "Removed" : side === "right" && row.status === "moved-from" ? "Moved lower in this section" : side === "left" && row.status === "added" ? "New" : side === "left" ? "" : "";
    return <div className={cx("min-h-9 px-3 py-2 text-xs italic text-muted", highlight && st.cell)}>{placeholder}</div>;
  }
  const leftModified = side === "left" && row.status === "modified";
  return (
    <div className={cx("px-3 py-2 text-[14px] leading-relaxed", highlight && st.cell, row.status === "unchanged" && "text-ink-2")}>
      {side === "right" && row.status === "modified" && row.left ? (
        <LineText kind={content.kind}>
          <WordDiff from={row.left.text} to={content.text} />
        </LineText>
      ) : (
        <LineText kind={content.kind} className={cx(row.status === "removed" && side === "left" && "text-del-ink line-through", leftModified && "text-ink-2")}>
          {content.text}
        </LineText>
      )}
    </div>
  );
}

function FinalResumeEditor({ composed }: { composed: string }) {
  const { ws, save } = useWs();
  const manual = ws.finalResume !== null;
  const value = manual ? ws.finalResume! : composed;
  const [draft, setDraft] = useDraft(value);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Final resume</h3>
          <p className="mt-0.5 text-sm text-muted">
            {manual ? "You’ve edited this directly. Accepting or rejecting suggestions no longer changes it." : "Built from the original plus the suggestions you accepted. Edit freely."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manual && (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => save({ finalResume: null })}>
              Discard manual edits
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3">
        <SaveDocButtons workspaceId={ws.id} kind="resume" title={ws.title} />
      </div>
      <Textarea
        className="mt-4 min-h-[480px] font-mono text-[13px]"
        value={draft}
        aria-label="Final resume text"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) void save({ finalResume: draft === composed ? null : draft });
        }}
      />
      <p className="mt-2 text-xs text-muted">
        Formatting: one item per line, section titles on their own line (e.g. EXPERIENCE), bullets start with “- ”.
      </p>
    </Card>
  );
}

export function StepOptimize({ onNext }: { onNext: () => void }) {
  const { ws, run, busy, save, aiConfigured } = useWs();
  const [onlyChanges, setOnlyChanges] = useState(false);
  const opt = ws.optimization;
  const lines = useMemo(() => parseResume(ws.inputs.resumeText), [ws.inputs.resumeText]);
  const composed = useMemo(
    () => (opt ? composeResume(lines, opt.suggestions, ws.decisions, ws.edits) : null),
    [lines, opt, ws.decisions, ws.edits],
  );
  const byId = useMemo(() => new Map((opt?.suggestions ?? []).map((s) => [s.id, s])), [opt]);
  const lineText = (id: string) => lines.find((l) => l.id === id)?.text ?? id;

  if (busy === "optimize")
    return <WorkingPanel title="Writing suggestions" steps={["Aligning wording with the job’s requirements", "Using only your verified information", "Checking every number and skill against your inputs"]} />;

  if (!opt || !composed)
    return (
      <div className="max-w-3xl">
        <SectionTitle eyebrow="Step 4" title="Resume changes">
          Generate line-by-line suggestions. Each one explains why it helps; nothing is applied until you accept it.
        </SectionTitle>
        <Button variant="primary" onClick={() => run("optimize")} disabled={!aiConfigured} icon={<Sparkles className="size-4" />}>
          Generate suggestions
        </Button>
      </div>
    );

  const stale = opt.inputHash !== optimizationHash(ws);
  const counts = { accepted: 0, rejected: 0, pending: 0 };
  for (const s of opt.suggestions) counts[(ws.decisions[s.id] ?? "pending") as keyof typeof counts]++;
  const safePending = opt.suggestions.filter((s) => {
    if ((ws.decisions[s.id] ?? "pending") !== "pending" || s.type === "remove") return false;
    if (s.type === "move") return true;
    return !hasClaimRisk(checkClaims(proposedText(s, ws.edits), userFactsCorpus(ws, false), ws.analysis?.keywords.missing ?? []));
  });
  const rows = onlyChanges ? composed.rows.filter((r) => r.status !== "unchanged" || r.suggestionIds.length) : composed.rows;

  return (
    <div>
      <SectionTitle eyebrow="Step 4" title="Review each change">
        Original on the left, improved on the right. Accept, reject or edit each suggestion. Changes flagged with a shield mention numbers or skills
        that aren’t in your information. Accept them only if they’re true.
      </SectionTitle>

      {stale && (
        <Alert kind="warning" className="mb-5" title="Your documents or answers changed">
          These suggestions were written before that change.{" "}
          <button className="font-medium underline" onClick={() => confirm("Regenerating replaces all suggestions and clears your decisions. Continue?") && run("optimize")}>
            Regenerate suggestions
          </button>
        </Alert>
      )}
      {opt.notes && (
        <Alert kind="info" className="mb-5" title="Notes">
          {opt.notes}
        </Alert>
      )}

      <div className="sticky top-[57px] z-20 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-y border-line bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:top-0">
        <p className="text-sm">
          <span className="font-semibold text-add-ink">{counts.accepted}</span> accepted · <span className="font-semibold">{counts.rejected}</span> rejected ·{" "}
          <span className="font-semibold text-brand">{counts.pending}</span> to decide
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!safePending.length}
            onClick={() => save({ decisions: Object.fromEntries(safePending.map((s) => [s.id, "accepted"])) })}
            title="Accepts pending rewrites, additions and reorders that add no new numbers or skills. Removals are never bulk-accepted."
          >
            Accept {safePending.length} unflagged
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOnlyChanges((v) => !v)}>
            {onlyChanges ? "Show all lines" : "Only lines with changes"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => confirm("Regenerating replaces all suggestions and clears your decisions. Continue?") && run("optimize")}
          >
            Regenerate
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <Legend />
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-2 border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted md:grid">
          <div className="px-3 py-2.5">Original</div>
          <div className="border-l border-line px-3 py-2.5">Improved</div>
        </div>
        <div className="divide-y divide-line/70">
          {rows.map((row) => {
            const cards = row.suggestionIds.map((id) => byId.get(id)).filter(Boolean) as Suggestion[];
            const cardOnly = !row.left && !row.right; // pending add
            return (
              <div key={row.key}>
                {!cardOnly && (
                  <div className="grid md:grid-cols-2">
                    <div className="relative">
                      <span className="absolute right-2 top-2 text-[10px] font-semibold uppercase tracking-wide text-muted md:hidden">Original</span>
                      <Cell side="left" row={row} />
                    </div>
                    <div className="relative border-t border-dashed border-line md:border-l md:border-t-0 md:border-solid">
                      {row.status !== "unchanged" && (
                        <span className="absolute right-2 top-2">
                          <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                        </span>
                      )}
                      <Cell side="right" row={row} />
                    </div>
                  </div>
                )}
                {cards.length > 0 && (
                  <div className="space-y-2 bg-surface-2/60 px-3 py-3 md:px-6">
                    {cards.map((s) => (
                      <SuggestionCard key={s.id} s={s} lineText={lineText} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-8">
        <FinalResumeEditor composed={composed.text} />
      </div>

      <div className="mt-8 flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue to cover letter
        </Button>
      </div>
    </div>
  );
}
