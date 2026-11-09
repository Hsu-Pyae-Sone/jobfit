import "server-only";
import type { LibraryItem, UploadMeta, UserProfile, Workspace } from "../../types";

export type DocTable = "matches" | "tracker";

/**
 * All personal data access goes through a UserStore bound to ONE signed-in user.
 * The Supabase implementation uses that user's own session, so Postgres row-level
 * security enforces isolation even if application code had a bug.
 */
export interface UserStore {
  readonly userId: string;

  workspacesList(): Promise<Workspace[]>;
  workspaceGet(id: string): Promise<Workspace | null>;
  workspaceUpsert(ws: Workspace): Promise<void>;
  workspaceDelete(id: string): Promise<boolean>;

  docList<T>(table: DocTable): Promise<T[]>;
  docGet<T>(table: DocTable, id: string): Promise<T | null>;
  docUpsert<T extends { id: string; updatedAt: string }>(table: DocTable, doc: T): Promise<void>;
  docDelete(table: DocTable, id: string): Promise<boolean>;

  libraryList(): Promise<LibraryItem[]>;
  libraryGet(id: string): Promise<LibraryItem | null>;
  libraryInsert(item: LibraryItem): Promise<void>;
  libraryUpdate(item: LibraryItem): Promise<void>;
  libraryDelete(id: string): Promise<boolean>;

  kvGet<T>(key: string): Promise<T | null>;
  kvSet(key: string, value: unknown): Promise<void>;
  /** Every stored preference (for the personal-data export). */
  kvAll(): Promise<Record<string, unknown>>;

  jobsPut(jobs: { id: string }[]): Promise<void>;
  jobGet<T>(id: string): Promise<T | null>;
  jobsRecent<T>(sinceMs: number, limit: number): Promise<{ job: T; seenAt: number }[]>;

  aiCacheGet<T>(key: string, maxAgeMs: number): Promise<T | null>;
  aiCacheSet(key: string, value: unknown): Promise<void>;
  /** Increments and returns today's AI call count for this user. */
  aiUsageIncrement(): Promise<number>;

  profileGet(): Promise<UserProfile>;
  profileUpdate(patch: Partial<Omit<UserProfile, "email" | "updatedAt">>): Promise<UserProfile>;

  fileSave(meta: { fileName: string; mime: string; purpose: string }, bytes: Buffer): Promise<UploadMeta>;
  fileList(): Promise<UploadMeta[]>;
  fileGet(id: string): Promise<{ meta: UploadMeta; bytes: Buffer } | null>;
  fileDelete(id: string): Promise<boolean>;

  /** Delete all of this user's data (local mode's "delete account"). */
  wipeAll(): Promise<void>;
}

/** Non-personal data shared by all users (public job-listing API cache, source quotas). */
export interface SharedStore {
  cacheGet<T>(key: string, maxAgeMs: number): Promise<{ value: T; fetchedAt: number } | null>;
  cacheSet(key: string, value: unknown): Promise<void>;
  counterGet(key: string): Promise<number>;
  counterSet(key: string, value: number): Promise<void>;
}

export class TemplateLimitError extends Error {}
