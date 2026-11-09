import { DEFAULT_STATUSES, type StatusDef, type StatusGroup, type TrackerEntry } from "./types";

// Pure tracker logic: statistics, reminders and CSV. Shared by UI, API and tests.

export function groupOf(statusId: string, statuses: StatusDef[]): StatusGroup {
  return statuses.find((s) => s.id === statusId)?.group ?? "not_applied";
}

function reached(e: TrackerEntry, statuses: StatusDef[], groups: StatusGroup[]): boolean {
  const current = groupOf(e.status, statuses);
  return groups.includes(current) || e.history.some((h) => groups.includes(h.group));
}

export interface TrackerStats {
  total: number; // applications actually submitted
  notApplied: number;
  awaiting: number;
  interviews: number;
  offers: number;
  rejections: number;
  withdrawn: number;
  responded: number;
  responseRate: number | null; // 0..1
  interviewRate: number | null; // 0..1
}

/**
 * An application counts as submitted only when the user has moved it to a status beyond
 * "not applied" (ever) or entered an application date. Downloading documents never does.
 */
export function isApplied(e: TrackerEntry, statuses: StatusDef[]): boolean {
  if (Boolean(e.applicationDate)) return true;
  const g = groupOf(e.status, statuses);
  if (g !== "not_applied" && g !== "withdrawn") return true;
  return e.history.some((h) => h.group !== "not_applied" && h.group !== "withdrawn");
}

export function computeStats(entries: TrackerEntry[], statuses: StatusDef[]): TrackerStats {
  const applied = entries.filter((e) => isApplied(e, statuses));
  const interviews = applied.filter((e) => reached(e, statuses, ["interview"]) || Boolean(e.interviewDate) || e.feedback.length > 0).length;
  const offers = applied.filter((e) => reached(e, statuses, ["offer"])).length;
  // A response = the employer reacted in any way (moved forward, interviewed, offered or rejected).
  const responded = applied.filter((e) => reached(e, statuses, ["in_process", "interview", "offer", "rejected"]) || Boolean(e.interviewDate)).length;
  return {
    total: applied.length,
    notApplied: entries.length - applied.length,
    awaiting: applied.filter((e) => groupOf(e.status, statuses) === "applied").length,
    interviews,
    offers,
    rejections: applied.filter((e) => groupOf(e.status, statuses) === "rejected").length,
    withdrawn: applied.filter((e) => groupOf(e.status, statuses) === "withdrawn").length,
    responded,
    responseRate: applied.length ? responded / applied.length : null,
    interviewRate: applied.length ? interviews / applied.length : null,
  };
}

export type ReminderKind = "deadline" | "interview" | "follow_up";

export interface Reminder {
  entryId: string;
  kind: ReminderKind;
  when: string; // date or datetime
  daysUntil: number; // negative = overdue
  label: string;
}

const day = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Reminders within `windowDays`: deadlines for jobs not yet applied to, upcoming interviews,
 * and follow-ups that are due or overdue. Closed applications produce no reminders.
 */
export function computeReminders(entries: TrackerEntry[], statuses: StatusDef[], now = new Date(), windowDays = 7): Reminder[] {
  const today = day(todayIso(now));
  const out: Reminder[] = [];
  for (const e of entries) {
    const g = groupOf(e.status, statuses);
    const closed = g === "rejected" || g === "withdrawn" || e.status === "accepted";
    const name = [e.title, e.company].filter(Boolean).join(" — ") || "Untitled";
    if (e.deadline && g === "not_applied") {
      const d = Math.round((day(e.deadline) - today) / 86400000);
      if (d <= windowDays && d >= -3) out.push({ entryId: e.id, kind: "deadline", when: e.deadline, daysUntil: d, label: `Application deadline: ${name}` });
    }
    if (e.interviewDate && !closed) {
      const d = Math.round((day(e.interviewDate) - today) / 86400000);
      if (d >= 0 && d <= windowDays) out.push({ entryId: e.id, kind: "interview", when: e.interviewDate, daysUntil: d, label: `${e.interviewStage || "Interview"}: ${name}` });
    }
    if (e.followUpDate && !closed) {
      const d = Math.round((day(e.followUpDate) - today) / 86400000);
      if (d <= windowDays) out.push({ entryId: e.id, kind: "follow_up", when: e.followUpDate, daysUntil: d, label: `Follow up: ${name}` });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ---------- CSV ----------

/** Neutralise spreadsheet formula injection (cells starting with = + - @ tab CR). */
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export function csvEscape(v: string): string {
  const s = safeCell(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: string[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export function defaultStatuses(): StatusDef[] {
  return DEFAULT_STATUSES.map((s) => ({ ...s }));
}
