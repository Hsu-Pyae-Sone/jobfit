import "server-only";
import { randomUUID } from "node:crypto";
import type { LibraryCategory, LibraryItem, LibraryKind, Workspace, WorkspaceSummary } from "../types";
import { emptyInputs } from "../types";
import { shared, store } from "./context";
import type { DocTable } from "./store/types";

// Data access for the current request's user. Everything here is scoped to that user:
// in production through their own Supabase session (enforced by row-level security).

// ---------- JSON document tables (matches, tracker) ----------

export const docList = <T>(table: DocTable) => store().docList<T>(table);
export const docGet = <T>(table: DocTable, id: string) => store().docGet<T>(table, id);

export async function docPut<T extends { id: string; updatedAt: string }>(table: DocTable, doc: T): Promise<T> {
  doc.updatedAt = new Date().toISOString();
  await store().docUpsert(table, doc);
  return doc;
}

export const docDelete = (table: DocTable, id: string) => store().docDelete(table, id);

// ---------- Shared cache of public job-listing responses (no personal data) ----------

export const cacheGet = <T>(key: string, maxAgeMs: number) => shared().cacheGet<T>(key, maxAgeMs);
/** Last cached value regardless of age (used when a source is down or rate limited). */
export const cacheGetStale = <T>(key: string) => shared().cacheGet<T>(key, Number.MAX_SAFE_INTEGER);
export const cacheSet = (key: string, value: unknown) => shared().cacheSet(key, value);
export const counterGet = (key: string) => shared().counterGet(key);
export const counterSet = (key: string, value: number) => shared().counterSet(key, value);

// ---------- Per-user settings ----------

export const kvGet = <T>(key: string) => store().kvGet<T>(key);
export const kvSet = (key: string, value: unknown) => store().kvSet(key, value);

// ---------- Jobs the user has seen ----------

export const storeJobs = (jobs: { id: string }[]) => store().jobsPut(jobs);
export const recentJobs = <T>(sinceMs: number, limit = 600) => store().jobsRecent<T>(sinceMs, limit);
export const getStoredJob = <T>(id: string) => store().jobGet<T>(id);

// ---------- Studio applications ----------

export function stageOf(ws: Workspace): string {
  if (ws.review) return "Reviewed";
  if (ws.coverLetter) return "Cover letter drafted";
  if (ws.optimization) return "Optimizing";
  if (ws.analysis) return "Analyzed";
  if (ws.inputs.resumeConfirmed && ws.inputs.jobConfirmed) return "Ready to analyze";
  return "Adding documents";
}

export function newWorkspace(title: string): Workspace {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: title.trim() || "Untitled application",
    createdAt: now,
    updatedAt: now,
    inputs: emptyInputs(),
    answers: {},
    decisions: {},
    edits: {},
    confirmations: {},
    finalResume: null,
  };
}

/** A new application starts from the user's confirmed master Career Profile, when there is one. */
export async function createWorkspace(title: string): Promise<Workspace> {
  const ws = newWorkspace(title);
  const profile = await store().profileGet();
  if (profile.masterResumeConfirmed && profile.masterResume.trim()) {
    ws.inputs.resumeText = profile.masterResume;
    ws.inputs.resumeConfirmed = true;
    ws.inputs.resumeSource = { method: "profile" };
    ws.inputs.extra = { ...ws.inputs.extra, ...profile.masterExtra };
  }
  await store().workspaceUpsert(ws);
  return ws;
}

export const getWorkspace = (id: string) => store().workspaceGet(id);

export async function saveWorkspace(ws: Workspace): Promise<Workspace> {
  ws.updatedAt = new Date().toISOString();
  await store().workspaceUpsert(ws);
  return ws;
}

export const deleteWorkspace = (id: string) => store().workspaceDelete(id);

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return (await store().workspacesList()).map((ws) => ({ id: ws.id, title: ws.title, updatedAt: ws.updatedAt, stage: stageOf(ws) }));
}

// ---------- Saved documents ----------

export async function addLibraryItem(input: {
  kind: LibraryKind;
  category: LibraryCategory;
  title: string;
  content: string;
  workspaceId?: string | null;
  trackerId?: string | null;
}): Promise<LibraryItem> {
  const now = new Date().toISOString();
  const item: LibraryItem = {
    id: randomUUID(),
    kind: input.kind,
    category: input.category,
    title: input.title.trim() || (input.kind === "resume" ? "Resume" : "Cover letter"),
    workspaceId: input.workspaceId ?? null,
    trackerId: input.trackerId ?? null,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };
  await store().libraryInsert(item);
  return item;
}

export const listLibrary = () => store().libraryList();
export const getLibraryItem = (id: string) => store().libraryGet(id);

export async function updateLibraryItem(id: string, patch: { title?: string; content?: string; trackerId?: string | null }): Promise<LibraryItem | null> {
  const cur = await store().libraryGet(id);
  if (!cur) return null;
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: new Date().toISOString() } as LibraryItem;
  await store().libraryUpdate(next);
  return next;
}

export const deleteLibraryItem = (id: string) => store().libraryDelete(id);
