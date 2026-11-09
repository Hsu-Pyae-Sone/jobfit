import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { StatusList } from "@/lib/server/tracker/schemas";
import { getStatuses, setStatuses } from "@/lib/server/tracker/store";

export const GET = handle(async () => json({ statuses: await getStatuses() }));

export const PUT = handle(async (req: Request) => {
  const body = z.object({ statuses: StatusList, reassign: z.record(z.string(), z.string()).default({}) }).parse(await readJson(req));
  return json({ statuses: await setStatuses(body.statuses, body.reassign) });
});
