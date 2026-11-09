"use client";

import Link from "next/link";
import Drawer from "@mui/material/Drawer";
import { useState } from "react";
import { ExternalLink, Trash2, X } from "lucide-react";
import { errorMessage } from "@/lib/client/api";
import { todayIso } from "@/lib/tracker/logic";
import { ARRANGEMENT_OPTIONS, EMPLOYMENT_OPTIONS, INTERVIEW_STAGES, type StatusDef, type TrackerEntry, type VersionOption } from "@/lib/tracker/types";
import { Alert, Button, Input, Label, Textarea, useDraft } from "../ui";
import { DateCell, SelectCell, StatusBadge, StatusSelect, TextCell, VersionCell, formatDate, versionHref } from "./parts";
import type { Patch } from "./useTracker";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="rounded-lg border border-line-strong bg-surface">{children}</div>
    </div>
  );
}

export function EntryDrawer({
  entry,
  statuses,
  versions,
  onClose,
  onUpdate,
  onDelete,
  onAddFeedback,
  onRemoveFeedback,
}: {
  entry: TrackerEntry;
  statuses: StatusDef[];
  versions: VersionOption[];
  onClose: () => void;
  onUpdate: (p: Patch) => void;
  onDelete: () => void;
  onAddFeedback: (n: { date: string; stage: string; text: string }) => Promise<void>;
  onRemoveFeedback: (id: string) => void;
}) {
  const [notes, setNotes] = useDraft(entry.notes);
  const [fb, setFb] = useState({ date: todayIso(), stage: entry.interviewStage, text: "" });
  const [fbErr, setFbErr] = useState<string | null>(null);

  const studioHref = entry.workspaceId ? `/studio/${entry.workspaceId}` : null;

  return (
    <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 576 }, bgcolor: "var(--paper)" }, role: "dialog", "aria-label": `Details: ${entry.title}` } }}>
      <aside className="flex h-full flex-col">
        <header className="flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold">{entry.title || "Untitled role"}</p>
            <p className="truncate text-sm text-ink-2">{entry.company || "Company not set"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <StatusSelect value={entry.status} statuses={statuses} onChange={(status) => onUpdate({ status })} label="Status" />
              {entry.url && /^https?:\/\//.test(entry.url) && (
                <a href={entry.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
                  Posting <ExternalLink className="size-3" />
                </a>
              )}
              {entry.matchId && (
                <Link href={`/match/${entry.matchId}`} className="text-brand hover:underline">
                  Match {entry.matchScore ?? "—"}/100
                </Link>
              )}
              {studioHref && (
                <Link href={studioHref} className="text-brand hover:underline">
                  Documents in Studio
                </Link>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-black/5" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Company"><TextCell label="Company" value={entry.company} onSave={(company) => onUpdate({ company })} /></Field>
            <Field label="Job title"><TextCell label="Job title" value={entry.title} onSave={(title) => onUpdate({ title })} /></Field>
            <Field label="Location"><TextCell label="Location" value={entry.location} onSave={(location) => onUpdate({ location })} /></Field>
            <Field label="Salary"><TextCell label="Salary" value={entry.salary} onSave={(salary) => onUpdate({ salary })} /></Field>
            <Field label="Employment type">
              <SelectCell label="Employment type" value={entry.employmentType} options={EMPLOYMENT_OPTIONS} onSave={(v) => onUpdate({ employmentType: v as Patch["employmentType"] })} />
            </Field>
            <Field label="Work arrangement">
              <SelectCell label="Work arrangement" value={entry.workArrangement} options={ARRANGEMENT_OPTIONS} onSave={(v) => onUpdate({ workArrangement: v as Patch["workArrangement"] })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Application URL"><TextCell type="url" label="Application URL" value={entry.url} placeholder="https://…" onSave={(url) => onUpdate({ url })} /></Field>
            </div>
            <Field label="Application date"><DateCell label="Application date" value={entry.applicationDate} onSave={(applicationDate) => onUpdate({ applicationDate })} /></Field>
            <Field label="Application deadline"><DateCell label="Application deadline" value={entry.deadline} onSave={(deadline) => onUpdate({ deadline })} /></Field>
            <Field label="Resume version">
              <VersionCell label="Resume version" value={entry.resumeVersion} versions={versions} kind="resume" onSave={(resumeVersion) => onUpdate({ resumeVersion })} />
            </Field>
            <Field label="Cover letter version">
              <VersionCell label="Cover letter version" value={entry.coverLetterVersion} versions={versions} kind="cover_letter" onSave={(coverLetterVersion) => onUpdate({ coverLetterVersion })} />
            </Field>
            {(versionHref(entry.resumeVersion?.ref) || versionHref(entry.coverLetterVersion?.ref)) && (
              <p className="text-xs sm:col-span-2">
                <Link href={versionHref(entry.resumeVersion?.ref) ?? versionHref(entry.coverLetterVersion?.ref)!} className="text-brand hover:underline">
                  Open linked documents
                </Link>
              </p>
            )}
            <div className="sm:col-span-2">
              <Field label="Recruiter contact"><TextCell label="Recruiter contact" value={entry.recruiterContact} placeholder="Name, email, phone" onSave={(recruiterContact) => onUpdate({ recruiterContact })} /></Field>
            </div>
            <Field label="Interview date & time"><DateCell withTime label="Interview date" value={entry.interviewDate} onSave={(interviewDate) => onUpdate({ interviewDate })} /></Field>
            <Field label="Interview stage">
              <TextCell label="Interview stage" value={entry.interviewStage} placeholder="e.g. Technical interview" onSave={(interviewStage) => onUpdate({ interviewStage })} />
            </Field>
            <Field label="Follow-up date"><DateCell label="Follow-up date" value={entry.followUpDate} onSave={(followUpDate) => onUpdate({ followUpDate })} /></Field>
          </section>

          <section>
            <Label htmlFor="drawer-notes">Notes</Label>
            <Textarea id="drawer-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== entry.notes && onUpdate({ notes })} />
          </section>

          <section>
            <h3 className="font-medium">Interview feedback</h3>
            <p className="text-xs text-muted">Questions asked, how it went, what to prepare next time.</p>
            <ul className="mt-3 space-y-2">
              {entry.feedback.map((n) => (
                <li key={n.id} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{formatDate(n.date)}</span>
                    {n.stage && <span>· {n.stage}</span>}
                    <button onClick={() => onRemoveFeedback(n.id)} className="ml-auto rounded p-1 hover:bg-del-bg hover:text-del-ink" aria-label="Delete note">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-ink-2">{n.text}</p>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 space-y-2 rounded-xl border border-dashed border-line-strong p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setFbErr(null);
                try {
                  await onAddFeedback(fb);
                  setFb({ ...fb, text: "" });
                } catch (er) {
                  setFbErr(errorMessage(er));
                }
              }}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Input type="date" aria-label="Feedback date" value={fb.date} onChange={(e) => setFb({ ...fb, date: e.target.value })} required />
                <Input aria-label="Interview stage for feedback" list="stages" placeholder="Stage" value={fb.stage} onChange={(e) => setFb({ ...fb, stage: e.target.value })} />
                <datalist id="stages">
                  {INTERVIEW_STAGES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <Textarea aria-label="Feedback note" rows={3} value={fb.text} onChange={(e) => setFb({ ...fb, text: e.target.value })} placeholder="What happened in this interview?" required />
              {fbErr && <Alert kind="error">{fbErr}</Alert>}
              <Button type="submit" size="sm">Add note</Button>
            </form>
          </section>

          <section>
            <h3 className="font-medium">Status history</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {[...entry.history].reverse().map((h, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-xs tabular-nums text-muted">{new Date(h.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                  <StatusBadge status={h.status} statuses={statuses} />
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted">
              Created {new Date(entry.createdAt).toLocaleDateString()} from {entry.source === "manual" ? "manual entry" : entry.source === "search" ? "Job Search" : "Job Match"} · last updated{" "}
              {new Date(entry.updatedAt).toLocaleString()}
            </p>
          </section>
        </div>

        <footer className="flex justify-between border-t border-line bg-surface px-5 py-3">
          <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
            Delete application
          </Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </footer>
      </aside>
    </Drawer>
  );
}
