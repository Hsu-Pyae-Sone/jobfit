import { z } from "zod";
import { store } from "@/lib/server/context";
import { handle, json, readJson } from "@/lib/server/http";

const text = (max: number) => z.string().max(max);

const Extra = z
  .object({
    education: text(10_000),
    experience: text(10_000),
    projects: text(10_000),
    achievements: text(10_000),
    certifications: text(10_000),
    skills: text(10_000),
  })
  .partial();

const Patch = z.object({
  displayName: text(80).optional(),
  masterResume: text(60_000).optional(),
  masterResumeConfirmed: z.boolean().optional(),
  masterExtra: Extra.optional(),
  /** Combine with the saved fields without losing anything already there (from a Studio application). */
  mergeExtra: Extra.optional(),
  /** Append to (rather than replace) extra-information fields, e.g. evidence from Match Analysis. */
  appendExtra: z.object({ field: z.enum(["education", "experience", "projects", "achievements", "certifications", "skills"]), text: text(4000) }).optional(),
});

export const GET = handle(async () => json({ profile: await store().profileGet() }));

export const PUT = handle(async (req: Request) => {
  const p = Patch.parse(await readJson(req));
  const s = store();
  const cur = await s.profileGet();
  const patch: Parameters<typeof s.profileUpdate>[0] = {};
  if (p.displayName !== undefined) patch.displayName = p.displayName.trim();
  if (p.masterResume !== undefined) {
    patch.masterResume = p.masterResume;
    // Edited text must be re-confirmed before it's used.
    if (p.masterResume !== cur.masterResume && p.masterResumeConfirmed === undefined) patch.masterResumeConfirmed = false;
  }
  if (p.masterResumeConfirmed !== undefined) patch.masterResumeConfirmed = p.masterResumeConfirmed && Boolean((p.masterResume ?? cur.masterResume).trim());
  if (p.masterExtra || p.appendExtra || p.mergeExtra) {
    const extra = { ...cur.masterExtra, ...p.masterExtra };
    for (const [k, v] of Object.entries(p.mergeExtra ?? {}) as [keyof typeof extra, string][]) {
      const prev = extra[k].trim();
      const next = v.trim();
      if (!next || prev.includes(next)) continue;
      extra[k] = (next.includes(prev) ? next : prev ? `${prev}\n${next}` : next).slice(0, 10_000);
    }
    if (p.appendExtra && p.appendExtra.text.trim()) {
      const prev = extra[p.appendExtra.field].trim();
      const add = p.appendExtra.text.trim();
      if (!prev.includes(add)) extra[p.appendExtra.field] = (prev ? `${prev}\n${add}` : add).slice(0, 10_000);
    }
    patch.masterExtra = extra;
  }
  return json({ profile: await s.profileUpdate(patch) });
});
