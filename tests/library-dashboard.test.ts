import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildActions, type ActionInput } from "@/lib/dashboard/actions";
import { parseLetter } from "@/lib/letter";

describe("cover letter parsing", () => {
  it("splits header, greeting, paragraphs, closing and signature", () => {
    const p = parseLetter("Maya Thein\nmaya@x.com\n\nDear Hiring Manager,\n\nFirst para.\n\nSecond para\ncontinues.\n\nSincerely,\nMaya Thein");
    expect(p.headerLines).toEqual(["Maya Thein", "maya@x.com"]);
    expect(p.greeting).toBe("Dear Hiring Manager,");
    expect(p.paragraphs).toEqual(["First para.", "Second para continues."]);
    expect(p.closing).toBe("Sincerely,");
    expect(p.signatureName).toBe("Maya Thein");
  });
});

describe("dashboard next actions", () => {
  const base: ActionInput = {
    today: "2026-11-06",
    hasProfile: true,
    profileWorkspaceId: "ws1",
    interviews: [],
    deadlines: [],
    followUps: [],
    staleApplications: [],
    completedWithoutEvidence: [],
    pendingRecalculation: [],
    frequentGaps: [],
    resumeIssue: null,
    newJobs: [],
    hasSearched: true,
  };

  it("prioritizes imminent interviews and deadlines, each with its evidence", () => {
    const a = buildActions({
      ...base,
      interviews: [{ trackerId: "t1", company: "Northwind", title: "Data Analyst", stage: "Technical interview", date: "2026-11-07T10:30", matchId: "m1" }],
      deadlines: [{ trackerId: "t2", company: "Contoso", title: "BI Developer", date: "2026-11-08", workspaceId: null }],
      frequentGaps: [{ skill: "Power BI", count: 3, total: 4, project: "Build a sales dashboard.", matchId: "m1", progress: "not_started" }],
      staleApplications: [{ trackerId: "t3", company: "Fabrikam", title: "Analyst", appliedOn: "2026-10-20" }],
      resumeIssue: { message: "No Skills section heading found." },
    });
    // A quick, time-sensitive follow-up ranks above a longer-term portfolio project.
    expect(a.map((x) => x.kind)).toEqual(["interview", "deadline", "follow_up", "project", "resume"]);
    expect(a[0]).toMatchObject({ priority: "high", href: "/match/m1" });
    expect(a[0].evidence).toContain("tomorrow at 10:30");
    expect(a[3].evidence).toContain("3 of 4 jobs");
    expect(a[2].evidence).toContain("17 days ago");
  });

  it("asks for setup when there is no resume, and never invents work", () => {
    const a = buildActions({ ...base, hasProfile: false, hasSearched: false });
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("setup");
    expect(buildActions(base)).toEqual([]);
  });

  it("skips gaps seen once, completed gaps, distant interviews and recent applications", () => {
    const a = buildActions({
      ...base,
      frequentGaps: [
        { skill: "dbt", count: 1, total: 4, project: null, matchId: "m", progress: "not_started" },
        { skill: "SQL", count: 3, total: 4, project: null, matchId: "m", progress: "completed" },
      ],
      interviews: [{ trackerId: "t", company: "X", title: "Y", stage: "", date: "2026-12-30", matchId: null }],
      staleApplications: [{ trackerId: "t", company: "X", title: "Y", appliedOn: "2026-11-01" }],
    });
    expect(a).toEqual([]);
  });

  it("surfaces completed-without-evidence and pending recalculation", () => {
    const a = buildActions({ ...base, completedWithoutEvidence: [{ matchId: "m", skill: "Power BI", jobTitle: "Analyst" }], pendingRecalculation: [{ matchId: "m", jobTitle: "Analyst" }] });
    expect(a.map((x) => x.kind)).toEqual(["evidence", "recalculate"]);
    expect(a[0].evidence).toContain("only changes once evidence is added");
  });
});

describe("saved documents (server)", () => {
  let lib: typeof import("@/lib/server/library");
  let db: typeof import("@/lib/server/db");

  beforeAll(async () => {
    process.env.CAREERFIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "careerfit-lib-"));
    db = await import("@/lib/server/db");
    lib = await import("@/lib/server/library");
  });

  it("allows three templates per kind, then requires choosing one to replace", async () => {
    for (const n of ["UX/UI Designer", "Software Engineer", "Data Analyst"]) await lib.saveTemplate({ kind: "resume", name: n, content: `${n}\nSKILLS\n- x` });
    expect(await lib.templates("resume")).toHaveLength(3);
    await expect(lib.saveTemplate({ kind: "resume", name: "Fourth", content: "x" })).rejects.toThrow(/already have 3/);
    // cover letters have their own limit
    expect((await lib.saveTemplate({ kind: "cover_letter", name: "General", content: "Dear X,\n\nBody\n\nSincerely,\nMe" })).category).toBe("template");
  });

  it("never overwrites without explicit confirmation", async () => {
    const target = (await lib.templates("resume")).find((t) => t.title === "Data Analyst")!;
    await expect(lib.saveTemplate({ kind: "resume", name: "Fourth", content: "new", replaceId: target.id })).rejects.toThrow(/overwrite/);
    await expect(lib.saveTemplate({ kind: "resume", name: "data analyst", content: "dup" })).rejects.toThrow(/already exists/);
    await expect(lib.editTemplate(target.id, { content: "changed" })).rejects.toThrow(/overwrite/);
    const replaced = await lib.saveTemplate({ kind: "resume", name: "Fourth", content: "new", replaceId: target.id, confirmOverwrite: true });
    expect(replaced.id).toBe(target.id);
    expect(replaced.title).toBe("Fourth");
    expect(await lib.templates("resume")).toHaveLength(3);
  });

  it("duplicating at the limit asks which template to replace", async () => {
    const t = (await lib.templates("resume"))[0];
    try {
      await lib.duplicateTemplate(t.id, {});
      expect.unreachable();
    } catch (e) {
      const err = e as InstanceType<typeof lib.TemplateConflict>;
      expect(err.status).toBe(409);
      expect(err.details).toMatchObject({ code: "limit" });
      expect((err.details!.existing as unknown[]).length).toBe(3);
    }
  });

  it("keeps application documents separate from the template limit and links them to the tracker", async () => {
    const ws = await db.createWorkspace("Analyst — Northwind");
    ws.inputs.resumeText = "Maya Thein\nmaya@x.com\nEXPERIENCE\n- Built dashboards";
    ws.inputs.resumeConfirmed = true;
    await db.saveWorkspace(ws);
    const tracker = await import("@/lib/server/tracker/store");
    const entry = await tracker.createFromWorkspace(ws.id);
    expect(entry.status).toBe("preparing");
    const [doc] = await lib.saveApplicationDocs(ws.id, ["resume"]);
    expect(doc.category).toBe("application");
    expect(doc.trackerId).toBe(entry.id);
    expect(await lib.templates("resume")).toHaveLength(3); // unaffected
    const updated = await tracker.getEntry(entry.id);
    expect(updated.resumeVersion?.ref).toBe(`library:${doc.id}`);
    expect(updated.status).toBe("preparing"); // saving documents never changes the status
    // saving again replaces that application's previous version
    expect((await lib.saveApplicationDocs(ws.id, ["resume"]))[0].id).toBe(doc.id);
  });

  it("starter structures contain placeholders only and start unconfirmed", async () => {
    expect(lib.hasPlaceholders(lib.STARTERS["data-analyst"].content)).toBe(true);
    const t = (await lib.templates("resume"))[0];
    const wsId = await lib.startFromResumeTemplate(t.id);
    const ws = (await db.getWorkspace(wsId))!;
    expect(ws.inputs.resumeText).toBe(t.content);
    expect(ws.inputs.resumeConfirmed).toBe(false);
  });

  it("cover letter template becomes an editable draft, with overwrite confirmation", async () => {
    const ws = await db.createWorkspace("Letter test");
    const cl = (await lib.templates("cover_letter"))[0];
    await lib.applyCoverTemplate(cl.id, ws.id, false);
    const after = (await db.getWorkspace(ws.id))!;
    expect(after.coverLetter?.greeting).toBe("Dear X,");
    expect(after.coverLetter?.paragraphs.map((p) => p.text)).toEqual(["Body"]);
    await expect(lib.applyCoverTemplate(cl.id, ws.id, false)).rejects.toThrow(/already has a cover letter/);
  });
});
