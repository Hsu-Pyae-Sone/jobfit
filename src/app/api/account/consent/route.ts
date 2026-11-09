import { z } from "zod";
import { store } from "@/lib/server/context";
import { handle, json, readJson } from "@/lib/server/http";

/** Record (or withdraw) the user's agreement to send their information to the AI provider. */
export const POST = handle(async (req: Request) => {
  const { consent } = z.object({ consent: z.boolean() }).parse(await readJson(req));
  const profile = await store().profileUpdate({ aiConsentAt: consent ? new Date().toISOString() : null });
  return json({ aiConsentAt: profile.aiConsentAt });
});
