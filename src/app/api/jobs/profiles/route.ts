import { handle, json } from "@/lib/server/http";
import { listProfiles } from "@/lib/server/jobs/profiles";
import { PROVIDERS } from "@/lib/server/jobs/providers";

export const GET = handle(async () =>
  json({
    profiles: await listProfiles(),
    sources: PROVIDERS.map((p) => ({ id: p.id, name: p.name, homepage: p.homepage, configured: p.configured(), needsKey: p.needsKey, countries: p.countries() })),
  }),
);
