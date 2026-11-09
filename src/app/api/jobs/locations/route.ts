import { suggestLocations } from "@/lib/server/geo";
import { handle, json } from "@/lib/server/http";

export const GET = handle(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  return json({ suggestions: suggestLocations(q) });
});
