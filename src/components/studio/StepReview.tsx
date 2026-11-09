"use client";

import Checkbox from "@mui/material/Checkbox";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Download, FileText, FolderPlus, Info, Mail, ShieldCheck, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { contentHash } from "@/lib/facts";
import type { ReviewCategory, ReviewItem } from "@/lib/types";
import { Alert, Badge, Button, Card, SectionTitle, WorkingPanel, cx } from "../ui";
import { useWs } from "./useWorkspace";

const CATEGORY_LABEL: Record<ReviewCategory, string> = {
  claims: "Unsupported claims",
  accuracy: "Accuracy",
  contact: "Contact information",
  completeness: "Document completeness",
  ats: "ATS readability",
  consistency: "Consistency",
  grammar: "Grammar & language",
  relevance: "Relevance",
};
const ORDER: ReviewCategory[] = ["claims", "accuracy", "contact", "completeness", "ats", "consistency", "grammar", "relevance"];

const SEV = {
  error: { icon: XCircle, cls: "text-del-ink", label: "Must fix" },
  warning: { icon: CircleAlert, cls: "text-mod-ink", label: "Warning" },
  info: { icon: Info, cls: "text-muted", label: "Note" },
  pass: { icon: CheckCircle2, cls: "text-add-ink", label: "Pass" },
};

function ItemRow({ item }: { item: ReviewItem }) {
  const s = SEV[item.severity];
  const Icon = s.icon;
  return (
    <li className="flex gap-3 px-4 py-3">
      <Icon className={cx("mt-0.5 size-4 shrink-0", s.cls)} aria-label={s.label} />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="text-ink">
          {item.message}{" "}
          <span className="ml-1 whitespace-nowrap text-xs text-muted">
            {item.target === "resume" ? "Resume" : "Cover letter"} · {item.source === "ai" ? "AI review" : "Automatic check"}
          </span>
        </p>
        {item.detail && <p className="mt-0.5 break-words text-ink-2">{item.detail}</p>}
      </div>
    </li>
  );
}

export function StepReview() {
  const { ws, run, busy, aiConfigured } = useWs();
  const [aiChoice, setIncludeAi] = useState<boolean | null>(null);
  const includeAi = aiChoice ?? aiConfigured;
  const [override, setOverride] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const r = ws.review;
  const stale = r && r.contentHash !== contentHash(ws);
  const errors = r?.items.filter((i) => i.severity === "error") ?? [];
  const warnings = r?.items.filter((i) => i.severity === "warning") ?? [];
  const canExport = Boolean(r) && !stale && (errors.length === 0 || override);

  const [tracked, setTracked] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ entries: { workspaceId: string | null }[] }>("/api/tracker")
      .then((r) => setTracked(r.entries.some((e) => e.workspaceId === ws.id)))
      .catch(() => setTracked(null));
  }, [ws.id]);

  async function saveBoth() {
    setMsg(null);
    try {
      await api("/api/library", { body: { action: "application", workspaceId: ws.id, kinds: ws.coverLetter ? ["resume", "cover_letter"] : ["resume"] } });
      setMsg(tracked ? "Saved with this application and linked to its tracker record." : "Saved with this application in Saved Documents.");
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  async function addToTracker() {
    setMsg(null);
    try {
      await api("/api/tracker", { body: { fromWorkspaceId: ws.id } });
      setTracked(true);
      setMsg("Added to the tracker as “Preparing”. Change the status yourself once you’ve applied.");
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  if (busy === "review") return <WorkingPanel title="Running the final review" steps={["Checking contact details and completeness", "Verifying every number and skill against your information", "Proofreading for grammar, tense and consistency"]} />;

  const grouped = ORDER.map((c) => ({ c, items: (r?.items ?? []).filter((i) => i.category === c) })).filter((g) => g.items.length);

  const exportLink = (doc: "resume" | "cover", format: "pdf" | "docx") => `/api/workspaces/${ws.id}/export?doc=${doc}&format=${format}`;

  return (
    <div>
      <SectionTitle eyebrow="Step 6" title="Final review & export">
        Before exporting, the documents are checked for accuracy, unsupported claims, grammar, consistency, relevance, ATS readability, contact
        information and completeness. No tool can guarantee a resume will pass every ATS. These checks cover the common problems.
      </SectionTitle>

      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <ShieldCheck className="size-6 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r ? (stale ? "Documents changed since the last review" : "Review complete") : "Run the final review"}</p>
          <p className="text-sm text-muted">
            {r
              ? `${errors.length} must-fix · ${warnings.length} warnings · ${r.aiIncluded ? "includes AI proofreading" : "automatic checks only"}`
              : "Required before export."}
          </p>
        </div>
        {aiConfigured && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <Checkbox size="small" sx={{ p: 0.25 }} checked={includeAi} onChange={(e) => setIncludeAi(e.target.checked)} />
            Include AI proofreading
          </label>
        )}
        <Button variant="primary" onClick={() => run("review", { includeAi })}>
          {r ? "Run review again" : "Run review"}
        </Button>
      </Card>

      {stale && <Alert kind="warning" className="mb-6">You edited the resume or cover letter after the review. Run it again before exporting.</Alert>}

      {r && (
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map(({ c, items }) => {
            const worst = items.some((i) => i.severity === "error") ? "del" : items.some((i) => i.severity === "warning") ? "mod" : items.every((i) => i.severity === "pass") ? "add" : "neutral";
            return (
              <Card key={c} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
                  <h3 className="text-sm font-semibold">{CATEGORY_LABEL[c]}</h3>
                  <Badge tone={worst as "del" | "mod" | "add" | "neutral"}>{items.length}</Badge>
                </div>
                <ul className="divide-y divide-line/70">
                  {items.map((i) => (
                    <ItemRow key={i.id} item={i} />
                  ))}
                </ul>
              </Card>
            );
          })}
          {grouped.length === 0 && <Alert kind="success">No issues found.</Alert>}
        </div>
      )}

      <h3 className="mb-3 mt-10 font-display text-xl font-semibold">Export</h3>
      {r && !stale && errors.length > 0 && (
        <Alert kind="error" className="mb-4" title={`${errors.length} must-fix issue${errors.length > 1 ? "s" : ""}`}>
          Fix them in the Resume changes or Cover letter step, then run the review again.
          <label className="mt-2 flex items-center gap-2 text-ink">
            <Checkbox size="small" sx={{ p: 0.25 }} checked={override} onChange={(e) => setOverride(e.target.checked)} />
            I’ve read these issues and want to export anyway.
          </label>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["resume", "Resume", FileText, true],
            ["cover", "Cover letter", Mail, Boolean(ws.coverLetter)],
          ] as const
        ).map(([doc, label, Icon, available]) => (
          <Card key={doc} className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-medium">{label}</p>
                <p className="text-xs text-muted">{available ? "Single-column, standard fonts, real text." : "Not generated yet."}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {(["pdf", "docx"] as const).map((f) =>
                canExport && available ? (
                  <a key={f} href={exportLink(doc, f)} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-sm font-medium hover:border-ink-2">
                    <Download className="size-4" /> {f.toUpperCase()}
                  </a>
                ) : (
                  <span key={f} aria-disabled className="inline-flex h-9 flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 text-sm text-muted">
                    <Download className="size-4" /> {f.toUpperCase()}
                  </span>
                ),
              )}
            </div>
          </Card>
        ))}
      </div>
      {!canExport && <p className="mt-3 text-sm text-muted">{!r || stale ? "Run the review on the current documents to enable export." : "Confirm the must-fix issues above to enable export."}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" icon={<FolderPlus className="size-3.5" />} onClick={saveBoth}>
          Save {ws.coverLetter ? "documents" : "resume"} to this application
        </Button>
        {tracked === false && (
          <Button size="sm" variant="ghost" onClick={addToTracker}>
            Add to tracker
          </Button>
        )}
        {msg && <span className="text-sm text-brand">{msg}</span>}
      </div>
      <p className="mt-2 text-xs text-muted">Exporting or saving documents doesn’t mark the job as applied. Update the status in the tracker after you apply.</p>
    </div>
  );
}
