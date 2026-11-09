import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyExtra, type ExtraInfo, type LibraryItem, type UploadMeta, type UserProfile, type Workspace } from "../../types";
import type { DocTable, SharedStore, UserStore } from "./types";
import { TemplateLimitError } from "./types";

// Supabase/Postgres storage. UserStore uses the signed-in user's own session (RLS applies);
// SharedStore uses the server's secret key and only touches non-personal tables.

const TABLE: Record<DocTable, string> = { matches: "matches", tracker: "tracker_entries" };
const BUCKET = "uploads";

function check<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (/TEMPLATE_LIMIT/.test(r.error.message)) throw new TemplateLimitError();
    throw new Error(`Database error: ${r.error.message}`);
  }
  return r.data;
}

interface LibRow {
  id: string;
  kind: LibraryItem["kind"];
  category: LibraryItem["category"];
  title: string;
  workspace_id: string | null;
  tracker_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}
const fromLib = (r: LibRow): LibraryItem => ({
  id: r.id,
  kind: r.kind,
  category: r.category,
  title: r.title,
  workspaceId: r.workspace_id,
  trackerId: r.tracker_id,
  content: r.content,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SupabaseUserStore implements UserStore {
  constructor(
    private sb: SupabaseClient,
    readonly userId: string,
  ) {}

  async workspacesList() {
    const rows = check(await this.sb.from("workspaces").select("data").order("updated_at", { ascending: false }));
    return (rows ?? []).map((r) => r.data as Workspace);
  }
  async workspaceGet(id: string) {
    const r = check(await this.sb.from("workspaces").select("data").eq("id", id).maybeSingle());
    return (r?.data as Workspace) ?? null;
  }
  async workspaceUpsert(ws: Workspace) {
    check(await this.sb.from("workspaces").upsert({ id: ws.id, user_id: this.userId, title: ws.title, data: ws, created_at: ws.createdAt, updated_at: ws.updatedAt }));
  }
  async workspaceDelete(id: string) {
    const r = check(await this.sb.from("workspaces").delete().eq("id", id).select("id"));
    return (r ?? []).length > 0;
  }

  async docList<T>(t: DocTable) {
    const rows = check(await this.sb.from(TABLE[t]).select("data").order("updated_at", { ascending: false }));
    return (rows ?? []).map((r) => r.data as T);
  }
  async docGet<T>(t: DocTable, id: string) {
    const r = check(await this.sb.from(TABLE[t]).select("data").eq("id", id).maybeSingle());
    return (r?.data as T) ?? null;
  }
  async docUpsert<T extends { id: string; updatedAt: string }>(t: DocTable, doc: T) {
    check(await this.sb.from(TABLE[t]).upsert({ id: doc.id, user_id: this.userId, data: doc, updated_at: doc.updatedAt }));
  }
  async docDelete(t: DocTable, id: string) {
    const r = check(await this.sb.from(TABLE[t]).delete().eq("id", id).select("id"));
    return (r ?? []).length > 0;
  }

  async libraryList() {
    return (check(await this.sb.from("library_items").select("*").order("created_at", { ascending: false })) ?? []).map((r) => fromLib(r as LibRow));
  }
  async libraryGet(id: string) {
    const r = check(await this.sb.from("library_items").select("*").eq("id", id).maybeSingle());
    return r ? fromLib(r as LibRow) : null;
  }
  async libraryInsert(i: LibraryItem) {
    check(
      await this.sb.from("library_items").insert({
        id: i.id,
        user_id: this.userId,
        kind: i.kind,
        category: i.category,
        title: i.title,
        workspace_id: i.workspaceId,
        tracker_id: i.trackerId,
        content: i.content,
        created_at: i.createdAt,
        updated_at: i.updatedAt,
      }),
    );
  }
  async libraryUpdate(i: LibraryItem) {
    check(await this.sb.from("library_items").update({ title: i.title, content: i.content, tracker_id: i.trackerId, updated_at: i.updatedAt }).eq("id", i.id));
  }
  async libraryDelete(id: string) {
    const r = check(await this.sb.from("library_items").delete().eq("id", id).select("id"));
    return (r ?? []).length > 0;
  }

  async kvGet<T>(key: string) {
    const r = check(await this.sb.from("user_kv").select("value").eq("key", key).maybeSingle());
    return (r?.value as T) ?? null;
  }
  async kvSet(key: string, value: unknown) {
    check(await this.sb.from("user_kv").upsert({ user_id: this.userId, key, value }));
  }

  async kvAll() {
    const rows = check(await this.sb.from("user_kv").select("key, value"));
    return Object.fromEntries((rows ?? []).map((r) => [r.key as string, r.value as unknown]));
  }

  async jobsPut(jobs: { id: string }[]) {
    if (!jobs.length) return;
    const now = new Date().toISOString();
    for (let i = 0; i < jobs.length; i += 200) {
      check(await this.sb.from("jobs_seen").upsert(jobs.slice(i, i + 200).map((j) => ({ user_id: this.userId, job_id: j.id, data: j, seen_at: now }))));
    }
    check(await this.sb.from("jobs_seen").delete().lt("seen_at", new Date(Date.now() - 14 * 86400000).toISOString()));
  }
  async jobGet<T>(id: string) {
    const r = check(await this.sb.from("jobs_seen").select("data").eq("job_id", id).maybeSingle());
    return (r?.data as T) ?? null;
  }
  async jobsRecent<T>(sinceMs: number, limit: number) {
    const rows = check(await this.sb.from("jobs_seen").select("data, seen_at").gt("seen_at", new Date(sinceMs).toISOString()).order("seen_at", { ascending: false }).limit(limit));
    return (rows ?? []).map((r) => ({ job: r.data as T, seenAt: Date.parse(r.seen_at as string) }));
  }

  async aiCacheGet<T>(key: string, maxAgeMs: number) {
    const r = check(await this.sb.from("ai_cache").select("value, created_at").eq("key", key).maybeSingle());
    return r && Date.now() - Date.parse(r.created_at as string) <= maxAgeMs ? (r.value as T) : null;
  }
  async aiCacheSet(key: string, value: unknown) {
    check(await this.sb.from("ai_cache").upsert({ user_id: this.userId, key, value, created_at: new Date().toISOString() }));
  }
  async aiUsageIncrement() {
    return Number(check(await this.sb.rpc("increment_ai_usage")));
  }

  async profileGet(): Promise<UserProfile> {
    const r = check(await this.sb.from("profiles").select("*").eq("id", this.userId).maybeSingle());
    return {
      email: (r?.email as string) ?? "",
      displayName: (r?.display_name as string) ?? "",
      masterResume: (r?.master_resume as string) ?? "",
      masterResumeConfirmed: Boolean(r?.master_resume_confirmed),
      masterExtra: { ...emptyExtra(), ...((r?.master_extra as ExtraInfo) ?? {}) },
      aiConsentAt: (r?.ai_consent_at as string) ?? null,
      updatedAt: (r?.updated_at as string) ?? new Date(0).toISOString(),
    };
  }
  async profileUpdate(patch: Partial<Omit<UserProfile, "email" | "updatedAt">>) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.masterResume !== undefined) row.master_resume = patch.masterResume;
    if (patch.masterResumeConfirmed !== undefined) row.master_resume_confirmed = patch.masterResumeConfirmed;
    if (patch.masterExtra !== undefined) row.master_extra = patch.masterExtra;
    if (patch.aiConsentAt !== undefined) row.ai_consent_at = patch.aiConsentAt;
    // Upsert, so an account whose profile row is missing still saves (RLS: own row only).
    check(await this.sb.from("profiles").upsert({ id: this.userId, ...row }));
    return this.profileGet();
  }

  async fileSave(meta: { fileName: string; mime: string; purpose: string }, bytes: Buffer): Promise<UploadMeta> {
    const id = randomUUID();
    const safe = meta.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
    const objectPath = `${this.userId}/${id}-${safe}`;
    const up = await this.sb.storage.from(BUCKET).upload(objectPath, bytes, { contentType: meta.mime, upsert: false });
    if (up.error) throw new Error(`Storage error: ${up.error.message}`);
    const row = check(
      await this.sb
        .from("uploads")
        .insert({ id, user_id: this.userId, path: objectPath, file_name: meta.fileName.slice(0, 200), mime: meta.mime, size: bytes.length, purpose: meta.purpose })
        .select("created_at")
        .single(),
    );
    return { id, fileName: meta.fileName.slice(0, 200), mime: meta.mime, size: bytes.length, purpose: meta.purpose, createdAt: (row?.created_at as string) ?? new Date().toISOString() };
  }
  async fileList() {
    const rows = check(await this.sb.from("uploads").select("id, file_name, mime, size, purpose, created_at").order("created_at", { ascending: false }));
    return (rows ?? []).map((r) => ({ id: r.id as string, fileName: r.file_name as string, mime: r.mime as string, size: r.size as number, purpose: r.purpose as string, createdAt: r.created_at as string }));
  }
  async fileGet(id: string) {
    const r = check(await this.sb.from("uploads").select("*").eq("id", id).maybeSingle());
    if (!r) return null;
    const dl = await this.sb.storage.from(BUCKET).download(r.path as string);
    if (dl.error || !dl.data) return null;
    return {
      meta: { id, fileName: r.file_name as string, mime: r.mime as string, size: r.size as number, purpose: r.purpose as string, createdAt: r.created_at as string },
      bytes: Buffer.from(await dl.data.arrayBuffer()),
    };
  }
  async fileDelete(id: string) {
    const r = check(await this.sb.from("uploads").select("path").eq("id", id).maybeSingle());
    if (!r) return false;
    await this.sb.storage.from(BUCKET).remove([r.path as string]);
    check(await this.sb.from("uploads").delete().eq("id", id));
    return true;
  }

  async wipeAll() {
    for (const f of await this.fileList()) await this.fileDelete(f.id);
    // Row-level security limits each delete to this user's rows; the filter makes it explicit.
    for (const t of ["library_items", "tracker_entries", "matches", "workspaces", "user_kv", "jobs_seen", "ai_cache", "ai_usage"]) {
      check(await this.sb.from(t).delete().eq("user_id", this.userId));
    }
    await this.profileUpdate({ displayName: "", masterResume: "", masterResumeConfirmed: false, masterExtra: emptyExtra(), aiConsentAt: null });
  }
}

export class SupabaseSharedStore implements SharedStore {
  constructor(private admin: SupabaseClient) {}
  async cacheGet<T>(key: string, maxAgeMs: number) {
    const r = check(await this.admin.from("job_cache").select("payload, fetched_at").eq("key", key).maybeSingle());
    if (!r) return null;
    const fetchedAt = Date.parse(r.fetched_at as string);
    return Date.now() - fetchedAt <= maxAgeMs ? { value: r.payload as T, fetchedAt } : null;
  }
  async cacheSet(key: string, value: unknown) {
    check(await this.admin.from("job_cache").upsert({ key, payload: value, fetched_at: new Date().toISOString() }));
  }
  async counterGet(key: string) {
    const r = check(await this.admin.from("app_counters").select("value").eq("key", key).maybeSingle());
    return (r?.value as number) ?? 0;
  }
  async counterSet(key: string, value: number) {
    check(await this.admin.from("app_counters").upsert({ key, value }));
  }
}
