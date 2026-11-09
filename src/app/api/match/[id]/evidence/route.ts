import { z } from "zod";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { addEvidence, requireMatch, saveMatch } from "@/lib/server/match/store";

type Ctx = { params: Promise<{ id: string }> };

const Evidence = z.object({
  type: z.enum(["project", "certification", "experience", "course", "other"]),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(20, "Describe what you did in at least a sentence.").max(4000),
  link: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Links must start with http:// or https://")
    .default(""),
  date: z.string().trim().max(40).default(""),
  requirementIds: z.array(z.string().max(10)).max(25).default([]),
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const m = await requireMatch(id);
  const e = Evidence.parse(await readJson(req));
  return json({ match: await addEvidence(m, e) }, 201);
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const eid = new URL(req.url).searchParams.get("evidenceId");
  const m = await requireMatch(id);
  const before = m.evidence.length;
  m.evidence = m.evidence.filter((e) => e.id !== eid);
  if (m.evidence.length === before) throw new HttpError(404, "Evidence not found.");
  m.pendingEvidence = true;
  return json({ match: await saveMatch(m) });
});
