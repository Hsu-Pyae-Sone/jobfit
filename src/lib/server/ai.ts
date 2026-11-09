import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { store } from "./context";
import { HttpError } from "./errors";

export const MODEL = process.env.CAREERFIT_MODEL || "claude-opus-5-5";

export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!aiConfigured()) {
    throw new AiError(
      "AI features need an Anthropic API key. Add ANTHROPIC_API_KEY to .env.local and restart the server.",
      503,
    );
  }
  client ??= new Anthropic({ maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

/**
 * Convert a Zod schema to a JSON schema accepted by structured outputs:
 * every object closed (additionalProperties: false) with all properties required.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$schema") continue;
      obj[k] = walk(v);
    }
    if (obj.type === "object" && obj.properties) {
      obj.additionalProperties = false;
      obj.required = Object.keys(obj.properties as object);
    }
    return obj;
  };
  return walk(json) as Record<string, unknown>;
}

export type UserContent = Anthropic.Beta.Messages.BetaContentBlockParam[];

interface RunOptions {
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  /**
   * Reuse a stored result for identical inputs (default true). Generative steps the user
   * explicitly re-runs to get a different draft pass false.
   */
  cache?: boolean;
}

const AI_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Per-user AI requests per day (cache hits are free). */
export function aiDailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

export const AI_CONSENT_MESSAGE =
  "AI features send the information you provide to Anthropic's Claude API. Please review and allow this first.";

/** AI calls send personal documents to Anthropic, so the user must have agreed to that. */
export async function requireAiConsent(): Promise<void> {
  const profile = await store().profileGet();
  if (!profile.aiConsentAt) throw new HttpError(428, AI_CONSENT_MESSAGE, { code: "ai_consent_required" });
}

export function aiCacheKey(schema: z.ZodType, system: string, content: UserContent, opts: RunOptions): string {
  const h = createHash("sha256");
  h.update(JSON.stringify([MODEL, opts.effort ?? "high", opts.maxTokens ?? 0, toStrictJsonSchema(schema), system, content]));
  return `ai:${h.digest("hex")}`;
}

/**
 * One structured call: streams (long outputs never hit HTTP timeouts), constrains the
 * response to `schema`, validates it with Zod, and enables server-side refusal fallback.
 */
export async function runStructured<T extends z.ZodType>(
  schema: T,
  system: string,
  content: UserContent,
  opts: RunOptions = {},
): Promise<z.infer<T>> {
  const anthropic = getClient();
  await requireAiConsent();
  const s = store();
  const useCache = opts.cache !== false;
  const key = useCache ? aiCacheKey(schema, system, content, opts) : "";
  if (useCache) {
    const hit = schema.safeParse(await s.aiCacheGet<unknown>(key, AI_CACHE_MAX_AGE_MS));
    if (hit.success) return hit.data;
  }
  const used = await s.aiUsageIncrement();
  if (used > aiDailyLimit()) {
    throw new AiError(`You've reached today's limit of ${aiDailyLimit()} AI requests. Your saved work is unaffected; AI features will be available again tomorrow.`, 429);
  }

  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content }],
      output_config: {
        effort: opts.effort ?? "high",
        format: { type: "json_schema", schema: toStrictJsonSchema(schema) },
      },
    });
    message = await stream.finalMessage();
  } catch (err) {
    throw mapError(err);
  }

  if (message.stop_reason === "refusal") {
    throw new AiError("The AI declined this request. Try rephrasing or removing unusual content from the inputs.", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError("The AI response was cut off because the input is very long. Try shortening the resume or job description.", 422);
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("The AI returned an unreadable response. Please try again.", 502);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiError("The AI response did not match the expected format. Please try again.", 502);
  }
  if (useCache) await s.aiCacheSet(key, result.data);
  return result.data;
}

function mapError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", 503);
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError("This API key does not have access to the configured model.", 503);
  if (err instanceof Anthropic.RateLimitError) return new AiError("The AI service is rate limited right now. Wait a minute and try again.", 429);
  if (err instanceof Anthropic.BadRequestError) return new AiError(`The AI request was rejected: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Could not reach the AI service. Check your internet connection.", 502);
  if (err instanceof Anthropic.APIError) return new AiError(`AI service error (${err.status ?? "unknown"}). Please try again.`, 502);
  return new AiError("Unexpected error while contacting the AI service.", 500);
}
