"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `Request failed (${res.status}).`;
    throw new ApiError(msg, res.status, (body as Record<string, unknown>) ?? {});
  }
  return body as T;
}

/**
 * Shown when the server says AI processing needs the user's agreement. Resolves true when
 * the user agreed (the request is then retried once), false when they declined.
 */
type ConsentHandler = () => Promise<boolean>;
let consentHandler: ConsentHandler | null = null;

export function setConsentHandler(h: ConsentHandler): () => void {
  consentHandler = h;
  return () => {
    if (consentHandler === h) consentHandler = null;
  };
}

async function needsConsent(res: Response): Promise<boolean> {
  if (res.status !== 428) return false;
  try {
    const body = (await res.clone().json()) as { code?: string };
    return body.code === "ai_consent_required";
  } catch {
    return false;
  }
}

/** Run a request; if it needs AI consent, ask once and retry when the user agrees. */
export async function send(doFetch: () => Promise<Response>): Promise<Response> {
  const res = await doFetch();
  if (consentHandler && (await needsConsent(res)) && (await consentHandler())) return doFetch();
  return res;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await send(() =>
    fetch(path, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    }),
  );
  return parse<T>(res);
}

export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await send(() => fetch(path, { method: "POST", body: form }));
  return parse<T>(res);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
