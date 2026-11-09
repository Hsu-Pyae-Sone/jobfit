"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, PanelRightOpen, Trash2 } from "lucide-react";
import { ARRANGEMENT_OPTIONS, EMPLOYMENT_OPTIONS, type StatusDef, type TrackerEntry, type VersionOption } from "@/lib/tracker/types";
import { cx } from "../ui";
import { DateCell, SelectCell, StatusSelect, TextCell, VersionCell } from "./parts";
import type { Patch } from "./useTracker";

export type ColumnKey =
  | "status"
  | "company"
  | "title"
  | "location"
  | "employmentType"
  | "workArrangement"
  | "salary"
  | "url"
  | "applicationDate"
  | "deadline"
  | "matchScore"
  | "resumeVersion"
  | "coverLetterVersion"
  | "recruiterContact"
  | "interviewDate"
  | "interviewStage"
  | "followUpDate"
  | "notes"
  | "updatedAt";

export const COLUMNS: { key: ColumnKey; label: string; width: number }[] = [
  { key: "company", label: "Company", width: 170 },
  { key: "title", label: "Job title", width: 210 },
  { key: "status", label: "Status", width: 150 },
  { key: "location", label: "Location", width: 150 },
  { key: "employmentType", label: "Employment type", width: 130 },
  { key: "workArrangement", label: "Work arrangement", width: 130 },
  { key: "salary", label: "Salary", width: 140 },
  { key: "url", label: "Application URL", width: 200 },
  { key: "applicationDate", label: "Application date", width: 140 },
  { key: "deadline", label: "Deadline", width: 140 },
  { key: "matchScore", label: "Match score", width: 100 },
  { key: "resumeVersion", label: "Resume version", width: 180 },
  { key: "coverLetterVersion", label: "Cover letter version", width: 180 },
  { key: "recruiterContact", label: "Recruiter contact", width: 190 },
  { key: "interviewDate", label: "Interview date", width: 190 },
  { key: "interviewStage", label: "Interview stage", width: 160 },
  { key: "followUpDate", label: "Follow-up date", width: 140 },
  { key: "notes", label: "Notes", width: 240 },
  { key: "updatedAt", label: "Last updated", width: 130 },
];

export type Sort = { key: ColumnKey; dir: "asc" | "desc" } | null;

export function sortValue(e: TrackerEntry, key: ColumnKey, statuses: StatusDef[]): string | number | null {
  switch (key) {
    case "status":
      return statuses.findIndex((s) => s.id === e.status);
    case "matchScore":
      return e.matchScore;
    case "resumeVersion":
    case "coverLetterVersion":
      return e[key]?.label?.toLowerCase() || null;
    default: {
      const v = e[key] as string;
      return v ? v.toLowerCase() : null;
    }
  }
}

export function sortEntries(list: TrackerEntry[], sort: Sort, statuses: StatusDef[]): TrackerEntry[] {
  if (!sort) return list;
  return [...list].sort((a, b) => {
    const va = sortValue(a, sort.key, statuses);
    const vb = sortValue(b, sort.key, statuses);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // empty always last
    if (vb === null) return -1;
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return sort.dir === "asc" ? c : -c;
  });
}

export function TableView({
  rows,
  statuses,
  versions,
  visible,
  sort,
  onSort,
  onUpdate,
  onOpen,
  onDelete,
}: {
  rows: TrackerEntry[];
  statuses: StatusDef[];
  versions: VersionOption[];
  visible: ColumnKey[];
  sort: Sort;
  onSort: (s: Sort) => void;
  onUpdate: (id: string, p: Patch) => void;
  onOpen: (id: string) => void;
  onDelete: (e: TrackerEntry) => void;
}) {
  const cols = COLUMNS.filter((c) => visible.includes(c.key));
  const width = cols.reduce((s, c) => s + c.width, 0) + 84;

  const cell = (e: TrackerEntry, key: ColumnKey) => {
    const save = (p: Patch) => onUpdate(e.id, p);
    const label = (l: string) => `${l} for ${e.title || e.company || "application"}`;
    switch (key) {
      case "status":
        return (
          <div className="px-2">
            <StatusSelect className="w-full max-w-full" value={e.status} statuses={statuses} onChange={(status) => save({ status })} label={label("Status")} />
          </div>
        );
      case "employmentType":
        return <SelectCell label={label("Employment type")} value={e.employmentType} options={EMPLOYMENT_OPTIONS} onSave={(v) => save({ employmentType: v as Patch["employmentType"] })} />;
      case "workArrangement":
        return <SelectCell label={label("Work arrangement")} value={e.workArrangement} options={ARRANGEMENT_OPTIONS} onSave={(v) => save({ workArrangement: v as Patch["workArrangement"] })} />;
      case "applicationDate":
      case "deadline":
      case "followUpDate":
        return <DateCell label={label(COLUMNS.find((c) => c.key === key)!.label)} value={e[key]} onSave={(v) => save({ [key]: v })} />;
      case "interviewDate":
        return <DateCell withTime label={label("Interview date")} value={e.interviewDate} onSave={(v) => save({ interviewDate: v })} />;
      case "url":
        return (
          <div className="flex items-center">
            <TextCell type="url" label={label("Application URL")} value={e.url} placeholder="https://…" onSave={(v) => save({ url: v })} />
            {e.url && /^https?:\/\//.test(e.url) && (
              <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open posting" className="mr-1 shrink-0 rounded p-1 text-muted hover:text-brand">
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        );
      case "matchScore":
        return e.matchId ? (
          <Link href={`/match/${e.matchId}`} className="block px-2 text-[13px] font-medium text-brand hover:underline" title="Open match analysis">
            {e.matchScore ?? "—"}
            {e.matchScore !== null && <span className="text-muted">/100</span>}
          </Link>
        ) : (
          <span className="block px-2 text-[13px] text-muted/60" title="Run Job Match to get a score">—</span>
        );
      case "resumeVersion":
      case "coverLetterVersion":
        return (
          <VersionCell
            label={label(key === "resumeVersion" ? "Resume version" : "Cover letter version")}
            value={e[key]}
            versions={versions}
            kind={key === "resumeVersion" ? "resume" : "cover_letter"}
            onSave={(v) => save({ [key]: v })}
          />
        );
      case "updatedAt":
        return <span className="block px-2 text-[12px] tabular-nums text-muted">{new Date(e.updatedAt).toLocaleDateString()}</span>;
      default:
        return <TextCell label={label(COLUMNS.find((c) => c.key === key)!.label)} value={e[key] as string} onSave={(v) => save({ [key]: v })} />;
    }
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="border-separate border-spacing-0 text-left" style={{ width, tableLayout: "fixed" }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
          <col style={{ width: 84 }} />
        </colgroup>
        <thead>
          <tr>
            {cols.map((c, i) => {
              const active = sort?.key === c.key;
              const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cx("sticky top-0 z-10 border-b border-line bg-surface-2 p-0 text-[11px] font-semibold uppercase tracking-wide text-muted", i === 0 && "left-0 z-20 border-r")}
                >
                  <button
                    className="flex w-full items-center gap-1 px-2 py-2.5 text-left hover:text-ink"
                    onClick={() => onSort(!active ? { key: c.key, dir: "asc" } : sort!.dir === "asc" ? { key: c.key, dir: "desc" } : null)}
                  >
                    <span className="truncate">{c.label}</span>
                    <Icon className={cx("size-3 shrink-0", !active && "opacity-40")} aria-hidden />
                  </button>
                </th>
              );
            })}
            <th className="sticky top-0 border-b border-line bg-surface-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="group">
              {cols.map((c, i) => (
                <td key={c.key} className={cx("border-b border-line/70 p-0 align-middle", i === 0 && "sticky left-0 z-[5] border-r bg-surface group-hover:bg-surface-2")}>
                  {cell(e, c.key)}
                </td>
              ))}
              <td className="border-b border-line/70 px-1">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={() => onOpen(e.id)} className="rounded p-1.5 text-muted hover:bg-black/5 hover:text-ink" aria-label={`Open details for ${e.title || e.company}`} title="Details, notes & interview feedback">
                    <PanelRightOpen className="size-4" />
                  </button>
                  <button onClick={() => onDelete(e)} className="rounded p-1.5 text-muted hover:bg-del-bg hover:text-del-ink" aria-label={`Delete ${e.title || e.company}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
