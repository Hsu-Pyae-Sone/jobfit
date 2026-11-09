import "server-only";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { EMPLOYMENT_LABEL, type ResultJob } from "../../jobs/types";
import { groupOf, safeCell, toCsv, todayIso } from "../../tracker/logic";
import {
  ARRANGEMENT_OPTIONS,
  DEFAULT_STATUSES,
  EMPLOYMENT_OPTIONS,
  type ArrangementValue,
  type EditableField,
  type EmploymentTypeValue,
  type StatusDef,
  type TrackerEntry,
  type VersionOption,
} from "../../tracker/types";
import { docDelete, docGet, docList, docPut, getStoredJob, getWorkspace, kvGet, kvSet, listLibrary, listWorkspaces, updateLibraryItem } from "../db";
import { HttpError } from "../http";

// ---------- Statuses ----------

export async function getStatuses(): Promise<StatusDef[]> {
  return (await kvGet<StatusDef[]>("tracker:statuses")) ?? DEFAULT_STATUSES.map((s) => ({ ...s }));
}

/**
 * Replace the status list. Entries using a removed status must be moved: `reassign` maps
 * removed id -> new id. History keeps the old label's group, so statistics stay correct.
 */
export async function setStatuses(list: StatusDef[], reassign: Record<string, string>): Promise<StatusDef[]> {
  const ids = list.map((s) => s.id);
  if (!list.length) throw new HttpError(400, "Keep at least one status.");
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "Status ids must be unique.");
  if (new Set(list.map((s) => s.label.trim().toLowerCase())).size !== list.length) throw new HttpError(400, "Two statuses have the same name.");
  const removed = (await getStatuses()).filter((s) => !ids.includes(s.id));
  const entries = await listEntries();
  for (const r of removed) {
    const using = entries.filter((e) => e.status === r.id);
    if (!using.length) continue;
    const target = reassign[r.id];
    if (!target || !ids.includes(target)) throw new HttpError(409, `“${r.label}” is used by ${using.length} application(s). Choose a status to move them to.`);
    for (const e of using) {
      e.status = target;
      e.history.push({ status: target, group: list.find((s) => s.id === target)!.group, at: new Date().toISOString() });
      await docPut("tracker", e);
    }
  }
  await kvSet("tracker:statuses", list);
  return list;
}

// ---------- Entries ----------

const OLD_STATUS: Record<string, string> = { interviewing: "interview", offer: "offer_received" };

/** Fill defaults (and migrate records created by the earlier basic tracker). */
function normalize(raw: Partial<TrackerEntry> & { id: string }, statuses: StatusDef[]): TrackerEntry {
  const status = OLD_STATUS[raw.status ?? ""] ?? raw.status ?? "saved";
  const valid = statuses.some((s) => s.id === status) ? status : statuses[0].id;
  const now = new Date().toISOString();
  return {
    company: "",
    title: "",
    location: "",
    employmentType: "",
    workArrangement: "",
    salary: "",
    url: "",
    applicationDate: "",
    deadline: "",
    matchScore: null,
    matchId: null,
    resumeVersion: null,
    coverLetterVersion: null,
    recruiterContact: "",
    interviewDate: "",
    interviewStage: "",
    followUpDate: "",
    notes: "",
    feedback: [],
    history: [],
    workspaceId: null,
    source: "manual",
    createdAt: now,
    updatedAt: now,
    // Fields missing (or undefined) in older records keep the defaults above.
    ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)),
    status: valid,
  } as unknown as TrackerEntry;
}

export async function listEntries(): Promise<TrackerEntry[]> {
  const statuses = await getStatuses();
  return (await docList<TrackerEntry>("tracker")).map((e) => normalize(e, statuses));
}

export async function getEntry(id: string): Promise<TrackerEntry> {
  const e = await docGet<TrackerEntry>("tracker", id);
  if (!e) throw new HttpError(404, "Application not found.");
  return normalize(e, await getStatuses());
}

export async function deleteEntry(id: string): Promise<void> {
  if (!(await docDelete("tracker", id))) throw new HttpError(404, "Application not found.");
}

export async function createEntry(fields: Partial<TrackerEntry>): Promise<TrackerEntry> {
  const statuses = await getStatuses();
  const status = fields.status && statuses.some((s) => s.id === fields.status) ? fields.status : statuses[0].id;
  const now = new Date().toISOString();
  const e = normalize({ ...fields, id: randomUUID(), status, createdAt: now, updatedAt: now, history: [{ status, group: groupOf(status, statuses), at: now }] }, statuses);
  if (!e.company.trim() && !e.title.trim()) throw new HttpError(400, "Enter at least a company or a job title.");
  return docPut("tracker", e);
}

/** Record from a discovered job posting: only published fields are copied. Status: Saved. */
export async function createFromJob(jobId: string): Promise<TrackerEntry> {
  const j = await getStoredJob<ResultJob>(jobId);
  if (!j) throw new HttpError(404, "This job is no longer available. Run the search again.");
  const existing = (await listEntries()).find((e) => e.url && e.url === j.url);
  if (existing) return existing;
  const types = j.employmentTypes?.value ?? [];
  const arr = j.workArrangement?.value;
  return createEntry({
    company: j.company ?? "",
    title: j.title,
    location: j.location.raw ?? (j.location.remoteScope ? `Remote (${j.location.remoteScope})` : ""),
    employmentType: (types[0] ?? "") as EmploymentTypeValue,
    workArrangement: (arr && arr !== "not_remote" ? arr : "") as ArrangementValue,
    salary: j.salary?.text ?? "",
    url: j.url,
    notes: types.length > 1 ? `Employment types listed: ${types.map((t) => EMPLOYMENT_LABEL[t]).join(", ")}` : "",
    source: "search",
  });
}

/** Record for a Studio application (status Preparing — drafting documents is not applying). */
export async function createFromWorkspace(workspaceId: string): Promise<TrackerEntry> {
  const existing = (await listEntries()).find((e) => e.workspaceId === workspaceId);
  if (existing) return existing;
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new HttpError(404, "Application not found.");
  const docs = (await listLibrary()).filter((i) => i.category === "application" && i.workspaceId === workspaceId);
  const ref = (kind: string) => {
    const d = docs.find((x) => x.kind === kind);
    return d ? { ref: `library:${d.id}`, label: d.title } : null;
  };
  const entry = await createEntry({
    company: ws.inputs.company.name,
    title: ws.inputs.targetRole || ws.analysis?.detectedRole || ws.title,
    url: /^https?:\/\//.test(ws.inputs.company.url) ? ws.inputs.company.url : "",
    status: "preparing",
    workspaceId,
    resumeVersion: ref("resume") ?? { ref: `workspace:${workspaceId}`, label: `Studio: ${ws.title}` },
    coverLetterVersion: ref("cover_letter") ?? (ws.coverLetter ? { ref: `workspace:${workspaceId}`, label: `Studio: ${ws.title}` } : null),
    source: "manual",
  });
  for (const d of docs) if (!d.trackerId) await updateLibraryItem(d.id, { trackerId: entry.id });
  return entry;
}

/** Apply a user edit. Status changes are logged; nothing else changes the status. */
export async function updateEntry(id: string, patch: Partial<Pick<TrackerEntry, EditableField>>): Promise<TrackerEntry> {
  const statuses = await getStatuses();
  const e = await getEntry(id);
  if (patch.status !== undefined && patch.status !== e.status) {
    if (!statuses.some((s) => s.id === patch.status)) throw new HttpError(400, "Unknown status.");
    const group = groupOf(patch.status, statuses);
    e.history.push({ status: patch.status, group, at: new Date().toISOString() });
    // The user said they applied; record today's date if they haven't entered one.
    if (group === "applied" && !e.applicationDate && patch.applicationDate === undefined) e.applicationDate = todayIso();
  }
  Object.assign(e, patch);
  return docPut("tracker", e);
}

export async function addFeedback(id: string, note: { date: string; stage: string; text: string }): Promise<TrackerEntry> {
  const e = await getEntry(id);
  e.feedback.push({ id: randomUUID().slice(0, 8), ...note, createdAt: new Date().toISOString() });
  return docPut("tracker", e);
}

export async function removeFeedback(id: string, noteId: string): Promise<TrackerEntry> {
  const e = await getEntry(id);
  const before = e.feedback.length;
  e.feedback = e.feedback.filter((n) => n.id !== noteId);
  if (e.feedback.length === before) throw new HttpError(404, "Note not found.");
  return docPut("tracker", e);
}

/** Resume / cover-letter versions the user can link: Library documents and Studio applications. */
export async function versionOptions(): Promise<VersionOption[]> {
  const out: VersionOption[] = [];
  for (const item of await listLibrary()) out.push({ ref: `library:${item.id}`, label: item.category === "template" ? `Template: ${item.title}` : item.title, kind: item.kind });
  for (const ws of await listWorkspaces()) out.push({ ref: `workspace:${ws.id}`, label: `Studio: ${ws.title}`, kind: "both" });
  return out;
}

// ---------- Export ----------

const COLUMNS: { header: string; get: (e: TrackerEntry, s: StatusDef[]) => string; width: number }[] = [
  { header: "Company", get: (e) => e.company, width: 24 },
  { header: "Job title", get: (e) => e.title, width: 30 },
  { header: "Location", get: (e) => e.location, width: 20 },
  { header: "Employment type", get: (e) => (e.employmentType ? EMPLOYMENT_OPTIONS[e.employmentType] : ""), width: 14 },
  { header: "Work arrangement", get: (e) => (e.workArrangement ? ARRANGEMENT_OPTIONS[e.workArrangement] : ""), width: 14 },
  { header: "Salary", get: (e) => e.salary, width: 18 },
  { header: "Application URL", get: (e) => e.url, width: 40 },
  { header: "Application date", get: (e) => e.applicationDate, width: 14 },
  { header: "Application deadline", get: (e) => e.deadline, width: 14 },
  { header: "Status", get: (e, s) => s.find((x) => x.id === e.status)?.label ?? e.status, width: 14 },
  { header: "Match score", get: (e) => (e.matchScore === null ? "" : String(e.matchScore)), width: 10 },
  { header: "Resume version", get: (e) => e.resumeVersion?.label ?? "", width: 24 },
  { header: "Cover letter version", get: (e) => e.coverLetterVersion?.label ?? "", width: 24 },
  { header: "Recruiter contact", get: (e) => e.recruiterContact, width: 24 },
  { header: "Interview date", get: (e) => e.interviewDate.replace("T", " "), width: 16 },
  { header: "Interview stage", get: (e) => e.interviewStage, width: 18 },
  { header: "Follow-up date", get: (e) => e.followUpDate, width: 14 },
  { header: "Notes", get: (e) => e.notes, width: 40 },
  { header: "Interview feedback", get: (e) => e.feedback.map((f) => `${f.date} ${f.stage}: ${f.text}`).join("\n"), width: 40 },
  { header: "Last updated", get: (e) => e.updatedAt.slice(0, 16).replace("T", " "), width: 16 },
];

async function select(ids: string[] | null): Promise<TrackerEntry[]> {
  const all = await listEntries();
  if (!ids) return all;
  const order = new Map(ids.map((id, i) => [id, i]));
  return all.filter((e) => order.has(e.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

export async function exportCsv(ids: string[] | null): Promise<string> {
  const s = await getStatuses();
  return toCsv(
    COLUMNS.map((c) => c.header),
    (await select(ids)).map((e) => COLUMNS.map((c) => c.get(e, s))),
  );
}

export async function exportXlsx(ids: string[] | null): Promise<Buffer> {
  const s = await getStatuses();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Jobfit";
  const ws = wb.addWorksheet("Applications", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.header, width: c.width }));
  for (const e of await select(ids)) {
    // Every value is written as text, with formula-like values neutralised.
    ws.addRow(COLUMNS.map((c) => safeCell(c.get(e, s))));
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  ws.eachRow((row, n) => {
    if (n > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** iCalendar file with deadlines, interviews and follow-ups (with alarms), for any calendar app. */
export async function exportIcs(ids: string[] | null): Promise<string> {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jobfit//Application Tracker//EN", "CALSCALE:GREGORIAN"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const statuses = await getStatuses();
  for (const e of await select(ids)) {
    const g = groupOf(e.status, statuses);
    if (g === "rejected" || g === "withdrawn") continue;
    const name = [e.title, e.company].filter(Boolean).join(" — ");
    const events: { key: string; summary: string; date: string; timed: boolean; alarm: string }[] = [];
    if (e.deadline && g === "not_applied") events.push({ key: "deadline", summary: `Application deadline: ${name}`, date: e.deadline, timed: false, alarm: "-P2D" });
    if (e.interviewDate) events.push({ key: "interview", summary: `${e.interviewStage || "Interview"}: ${name}`, date: e.interviewDate, timed: e.interviewDate.includes("T"), alarm: "-PT2H" });
    if (e.followUpDate) events.push({ key: "followup", summary: `Follow up: ${name}`, date: e.followUpDate, timed: false, alarm: "PT9H" });
    for (const ev of events) {
      const d = ev.date.replace(/[-:]/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.id}-${ev.key}@careerfit.local`,
        `DTSTAMP:${stamp}`,
        ev.timed ? `DTSTART:${d.slice(0, 13)}00` : `DTSTART;VALUE=DATE:${d.slice(0, 8)}`,
        ev.timed ? `DURATION:PT1H` : `DURATION:P1D`,
        `SUMMARY:${icsText(ev.summary)}`,
        ...(e.url ? [`URL:${icsText(e.url)}`] : []),
        `DESCRIPTION:${icsText([e.recruiterContact && `Contact: ${e.recruiterContact}`, e.notes].filter(Boolean).join("\n"))}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsText(ev.summary)}`,
        `TRIGGER:${ev.alarm}`,
        "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
