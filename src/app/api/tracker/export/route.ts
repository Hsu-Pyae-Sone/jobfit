import { z } from "zod";
import { handle, readJson } from "@/lib/server/http";
import { exportCsv, exportIcs, exportXlsx } from "@/lib/server/tracker/store";

const TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ics: "text/calendar; charset=utf-8",
} as const;

/** POST so the current filtered/sorted view (a list of ids) can be exported. */
export const POST = handle(async (req: Request) => {
  const { format, ids } = z
    .object({ format: z.enum(["csv", "xlsx", "ics"]), ids: z.array(z.string().max(64)).max(5000).nullable().default(null) })
    .parse(await readJson(req));
  const body = format === "csv" ? await exportCsv(ids) : format === "xlsx" ? new Uint8Array(await exportXlsx(ids)) : await exportIcs(ids);
  const name = format === "ics" ? "jobfit-reminders.ics" : `jobfit-applications-${new Date().toISOString().slice(0, 10)}.${format}`;
  return new Response(body, { headers: { "content-type": TYPES[format], "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
});
