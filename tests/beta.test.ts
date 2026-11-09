import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

// Local single-user store (SQLite) in a temporary directory; no network is used.
describe("private beta: AI consent, reuse and limits; profile; export data", () => {
  let ai: typeof import("@/lib/server/ai");
  let ctx: typeof import("@/lib/server/context");
  let db: typeof import("@/lib/server/db");

  beforeAll(async () => {
    process.env.CAREERFIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "careerfit-beta-"));
    process.env.ANTHROPIC_API_KEY = "test-key-not-used";
    ai = await import("@/lib/server/ai");
    ctx = await import("@/lib/server/context");
    db = await import("@/lib/server/db");
  });

  afterEach(() => {
    delete process.env.AI_DAILY_LIMIT;
  });

  const Schema = z.object({ answer: z.string() });
  const content = [{ type: "text" as const, text: "Resume text" }];

  it("refuses AI calls until the user has agreed", async () => {
    await expect(ai.runStructured(Schema, "system", content)).rejects.toMatchObject({ status: 428, details: { code: "ai_consent_required" } });
    await ctx.store().profileUpdate({ aiConsentAt: new Date().toISOString() });
    await expect(ai.requireAiConsent()).resolves.toBeUndefined();
  });

  it("reuses a stored result for identical inputs without calling the AI", async () => {
    const key = ai.aiCacheKey(Schema, "system", content, {});
    await ctx.store().aiCacheSet(key, { answer: "stored" });
    // No AI request is possible here (fake key, no server); a cache hit must not need one.
    await expect(ai.runStructured(Schema, "system", content)).resolves.toEqual({ answer: "stored" });
    // Different inputs produce a different key.
    expect(ai.aiCacheKey(Schema, "system", [{ type: "text", text: "Other" }], {})).not.toBe(key);
    expect(ai.aiCacheKey(Schema, "system", content, { effort: "low" })).not.toBe(key);
  });

  it("stops at the daily AI limit before contacting the provider", async () => {
    process.env.AI_DAILY_LIMIT = "1";
    await ctx.store().aiUsageIncrement(); // today's one allowed request is used up
    await expect(ai.runStructured(Schema, "system 2", content, { cache: false })).rejects.toMatchObject({ status: 429 });
    expect(ai.aiDailyLimit()).toBe(1);
  });

  it("starts new applications from the confirmed master profile only", async () => {
    await ctx.store().profileUpdate({ masterResume: "Maya Thein\n- Built dashboards", masterResumeConfirmed: false });
    expect((await db.createWorkspace("A")).inputs.resumeText).toBe("");
    await ctx.store().profileUpdate({
      masterResumeConfirmed: true,
      masterExtra: { education: "", experience: "", projects: "", achievements: "", certifications: "Google Data Analytics (2024)", skills: "" },
    });
    const ws = await db.createWorkspace("B");
    expect(ws.inputs.resumeText).toContain("Built dashboards");
    expect(ws.inputs.resumeConfirmed).toBe(true);
    expect(ws.inputs.resumeSource?.method).toBe("profile");
    expect(ws.inputs.extra.certifications).toContain("Google");
  });

  it("export sources: preferences and files; wipe removes everything", async () => {
    const s = ctx.store();
    await s.kvSet("settings", { primaryProfileId: "master" });
    const f = await s.fileSave({ fileName: "cv.txt", mime: "text/plain", purpose: "resume" }, Buffer.from("hello"));
    expect(await s.kvAll()).toMatchObject({ settings: { primaryProfileId: "master" } });
    expect((await s.fileGet(f.id))?.bytes.toString()).toBe("hello");
    await s.wipeAll();
    expect(await s.workspacesList()).toEqual([]);
    expect(await s.fileList()).toEqual([]);
    expect(await s.kvAll()).toEqual({});
    expect((await s.profileGet()).masterResume).toBe("");
  });
});

describe("auth helpers", () => {
  it("only allows same-site relative redirect targets", async () => {
    const { safeNext } = await import("@/lib/server/auth");
    expect(safeNext("/tracker?view=board")).toBe("/tracker?view=board");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null, "/auth/set-password")).toBe("/auth/set-password");
  });
});
