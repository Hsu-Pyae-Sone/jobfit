import { z } from "zod";
import { EMPLOYMENT_LABEL, type ResultJob } from "@/lib/jobs/types";
import { createWorkspace, getStoredJob, saveWorkspace } from "@/lib/server/db";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { getProfile } from "@/lib/server/jobs/profiles";

type Ctx = { params: Promise<{ id: string }> };

/** Start a Studio application from a job: the posting becomes the job description (to confirm). */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { profileId } = z.object({ profileId: z.string().max(80).nullable().optional() }).parse(await readJson(req));
  const job = await getStoredJob<ResultJob>(decodeURIComponent(id));
  if (!job) throw new HttpError(404, "This job is no longer available. Run the search again.");

  const jobText = [
    job.title,
    job.company && `Company: ${job.company}`,
    `Location: ${job.location.raw ?? job.location.remoteScope ?? "Not provided"}`,
    job.employmentTypes && `Employment type: ${job.employmentTypes.value.map((t) => EMPLOYMENT_LABEL[t]).join(", ")}`,
    job.salary && `Salary: ${job.salary.text}`,
    "",
    job.description,
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n");

  const ws = await createWorkspace(`${job.title}${job.company ? ` — ${job.company}` : ""}`.slice(0, 200));
  ws.inputs.jobText = jobText;
  ws.inputs.jobConfirmed = false;
  ws.inputs.jobSource = {
    method: "url",
    fileName: job.url,
    warnings: job.descriptionComplete
      ? ["Imported from a job listing. Check it against the original posting before confirming."]
      : ["This source only provides a summary. Open the original posting and paste the full description here."],
  };
  ws.inputs.company = { ...ws.inputs.company, name: job.company ?? "", url: job.url };
  ws.inputs.targetRole = job.title;

  // Bring over the resume used for matching (already confirmed by the user).
  const profile = await getProfile(profileId);
  if (profile) {
    ws.inputs.resumeText = profile.resumeText;
    ws.inputs.resumeConfirmed = true;
    ws.inputs.resumeSource = { method: "paste", fileName: profile.label };
    for (const [k, v] of Object.entries(profile.extra)) (ws.inputs.extra as unknown as Record<string, string>)[k] = v;
  }
  await saveWorkspace(ws);
  return json({ workspaceId: ws.id }, 201);
});
