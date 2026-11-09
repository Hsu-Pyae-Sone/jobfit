import { buildDashboard } from "@/lib/server/dashboard";
import { handle, json } from "@/lib/server/http";

export const GET = handle(async () => json(await buildDashboard()));
