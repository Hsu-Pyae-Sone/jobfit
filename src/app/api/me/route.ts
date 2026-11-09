import { aiConfigured, aiDailyLimit } from "@/lib/server/ai";
import { ctx } from "@/lib/server/context";
import { handle, json } from "@/lib/server/http";

export const GET = handle(async () => {
  const c = ctx();
  const profile = await c.store.profileGet();
  return json({
    mode: c.mode,
    user: { email: c.user.email, isAdmin: c.user.isAdmin, displayName: profile.displayName },
    aiConfigured: aiConfigured(),
    aiConsentAt: profile.aiConsentAt,
    aiDailyLimit: aiDailyLimit(),
    masterResumeConfirmed: profile.masterResumeConfirmed,
  });
});
