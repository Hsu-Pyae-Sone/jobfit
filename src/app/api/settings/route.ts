import { z } from "zod";
import { aiConfigured, MODEL } from "@/lib/server/ai";
import { getSettings, saveSettings } from "@/lib/server/dashboard";
import { handle, json, readJson } from "@/lib/server/http";
import { listProfiles } from "@/lib/server/jobs/profiles";
import { PROVIDERS } from "@/lib/server/jobs/providers";

export const GET = handle(async () =>
  json({
    settings: await getSettings(),
    profiles: await listProfiles(),
    ai: { configured: aiConfigured(), model: MODEL },
    sources: PROVIDERS.map((p) => ({ id: p.id, name: p.name, homepage: p.homepage, configured: p.configured(), needsKey: p.needsKey, countries: p.countries() })),
  }),
);

export const PUT = handle(async (req: Request) => {
  const patch = z.object({ primaryProfileId: z.string().max(80).nullable() }).partial().parse(await readJson(req));
  return json({ settings: await saveSettings(patch) });
});
