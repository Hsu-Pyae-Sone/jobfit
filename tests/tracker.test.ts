import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { computeReminders, computeStats, csvEscape, isApplied, toCsv } from "@/lib/tracker/logic";
import { DEFAULT_STATUSES, type StatusGroup, type TrackerEntry } from "@/lib/tracker/types";

const S = DEFAULT_STATUSES;
const groupOf = (id: string) => S.find((s) => s.id === id)!.group;

function entry(status: string, extra: Partial<TrackerEntry> = {}, past: string[] = []): TrackerEntry {
  const at = "2026-10-01T10:00:00Z";
  return {
    id: Math.random().toString(36).slice(2),
    company: "Acme",
    title: "Analyst",
    location: "",
    employmentType: "",
    workArrangement: "",
    salary: "",
    url: "",
    applicationDate: "",
    deadline: "",
    status,
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
    history: [...past, status].map((s) => ({ status: s, group: groupOf(s) as StatusGroup, at })),
    workspaceId: null,
    source: "manual",
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

describe("tracker statistics", () => {
  const list = [
    entry("saved"), // not applied
    entry("preparing", { resumeVersion: { ref: "workspace:1", label: "Tailored" } }), // documents ready ≠ applied
    entry("applied"), // awaiting
    entry("applied"), // awaiting
    entry("screening", {}, ["applied"]), // responded
    entry("interview", {}, ["applied", "screening"]), // interview
    entry("rejected", {}, ["applied", "interview"]), // rejected after interview
    entry("offer_received", {}, ["applied", "interview"]), // offer
    entry("withdrawn", {}, ["saved"]), // withdrew before applying → not an application
  ];
  const s = computeStats(list, S);

  it("counts only submitted applications", () => {
    expect(s.total).toBe(6);
    expect(s.notApplied).toBe(3);
  });

  it("never treats prepared documents as an application", () => {
    expect(isApplied(list[1], S)).toBe(false);
  });

  it("an entered application date counts as applied", () => {
    expect(isApplied(entry("saved", { applicationDate: "2026-10-02" }), S)).toBe(true);
  });

  it("computes awaiting, interviews (from history), offers, rejections", () => {
    expect(s.awaiting).toBe(2);
    expect(s.interviews).toBe(3); // interview, rejected-after-interview, offer
    expect(s.offers).toBe(1);
    expect(s.rejections).toBe(1);
  });

  it("computes response and interview conversion rates", () => {
    expect(s.responded).toBe(4); // screening, interview, rejected, offer
    expect(s.responseRate).toBeCloseTo(4 / 6);
    expect(s.interviewRate).toBeCloseTo(3 / 6);
    expect(computeStats([], S).responseRate).toBeNull();
  });

  it("custom statuses count by their group", () => {
    const custom = [...S, { id: "phone", label: "Phone screen", group: "interview" as const, color: "violet" as const }];
    const e = entry("applied");
    e.status = "phone";
    e.history.push({ status: "phone", group: "interview", at: "2026-10-03T00:00:00Z" });
    expect(computeStats([e], custom).interviews).toBe(1);
  });
});

describe("reminders", () => {
  const now = new Date("2026-11-06T09:00:00");
  it("finds upcoming deadlines, interviews and due follow-ups", () => {
    const r = computeReminders(
      [
        entry("saved", { deadline: "2026-11-08" }),
        entry("applied", { deadline: "2026-11-08" }), // already applied → no deadline reminder
        entry("interview", { interviewDate: "2026-11-06T14:00" }, ["applied"]),
        entry("applied", { followUpDate: "2026-11-04" }), // overdue
        entry("rejected", { followUpDate: "2026-11-07" }, ["applied"]), // closed → none
        entry("saved", { deadline: "2026-12-30" }), // too far
      ],
      S,
      now,
    );
    expect(r.map((x) => [x.kind, x.daysUntil])).toEqual([
      ["follow_up", -2],
      ["interview", 0],
      ["deadline", 2],
    ]);
  });
});

describe("CSV", () => {
  it("escapes quotes/commas/newlines and neutralises formulas", () => {
    expect(csvEscape('Acme, "Inc"')).toBe('"Acme, ""Inc"""');
    expect(csvEscape("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvEscape("+123")).toBe("'+123");
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(toCsv(["a"], [["b"]]).startsWith("﻿a\r\nb")).toBe(true);
  });
});

describe("tracker store (server)", () => {
  type Store = typeof import("@/lib/server/tracker/store");
  let store: Store;
  let db: typeof import("@/lib/server/db");

  beforeAll(async () => {
    process.env.CAREERFIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "careerfit-test-"));
    db = await import("@/lib/server/db");
    store = await import("@/lib/server/tracker/store");
  });

  it("logs status changes and records today's date when marked applied", async () => {
    const e = await store.createEntry({ company: "Northwind", title: "Data Analyst" });
    expect(e.status).toBe("saved");
    expect(e.applicationDate).toBe("");
    const u = await store.updateEntry(e.id, { status: "applied" });
    expect(u.history.map((h) => h.status)).toEqual(["saved", "applied"]);
    expect(u.applicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Editing other fields never changes the status.
    expect((await store.updateEntry(e.id, { notes: "Downloaded resume PDF" })).status).toBe("applied");
  });

  it("migrates records from the earlier basic tracker", async () => {
    await db.docPut("tracker", { id: "old1", title: "Old", company: "X", url: "", status: "interviewing", updatedAt: "" } as never);
    const e = await store.getEntry("old1");
    expect(e.status).toBe("interview");
    expect(e.feedback).toEqual([]);
    expect(e.location).toBe("");
  });

  it("requires reassignment when removing a status in use", async () => {
    const e = await store.createEntry({ company: "Contoso", status: "assessment" });
    const without = (await store.getStatuses()).filter((s) => s.id !== "assessment");
    await expect(store.setStatuses(without, {})).rejects.toThrow(/used by/);
    await store.setStatuses(without, { assessment: "screening" });
    const moved = await store.getEntry(e.id);
    expect(moved.status).toBe("screening");
    expect(moved.history.at(-1)?.group).toBe("in_process");
    await store.setStatuses(DEFAULT_STATUSES.map((s) => ({ ...s })), {});
  });

  it("exports XLSX with text cells and formula injection neutralised", async () => {
    const e = await store.createEntry({ company: "=cmd|' /C calc'!A0", title: "Analyst" });
    const buf = await store.exportXlsx([e.id]);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Applications")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Company");
    expect(ws.getRow(1).cellCount).toBe(20);
    expect(ws.getRow(2).getCell(1).value).toBe("'=cmd|' /C calc'!A0");
    expect(ws.getRow(2).getCell(1).formula).toBeUndefined();
  });

  it("exports an iCalendar file with alarms", async () => {
    const e = await store.createEntry({ company: "Fabrikam", title: "BI Developer", deadline: "2026-11-20", interviewDate: "2026-11-25T14:30", interviewStage: "Technical interview" });
    const ics = await store.exportIcs([e.id]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("DTSTART:20261125T143000");
    expect(ics).toContain("SUMMARY:Technical interview: BI Developer — Fabrikam");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });
});
