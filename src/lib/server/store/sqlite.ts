import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { emptyExtra, type LibraryItem, type UploadMeta, type UserProfile, type Workspace } from "../../types";
import type { DocTable, SharedStore, UserStore } from "./types";
import { TemplateLimitError } from "./types";

// Local single-user storage for development and tests (Node's built-in SQLite).
// Never used in production: the app refuses to start there without Supabase.

export const LOCAL_USER_ID = "local";

function dataDir() {
  return process.env.CAREERFIT_DATA_DIR || path.join(process.cwd(), "data");
}

let db: DatabaseSync | null = null;
let dbDir: string | null = null;

function getDb(): DatabaseSync {
  const dir = dataDir();
  if (db && dbDir === dir) return db;
  fs.mkdirSync(dir, { recursive: true });
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  db = new DatabaseSync(path.join(dir, "careerfit.db"));
  dbDir = dir;
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tracker (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, workspace_id TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, created_at INTEGER NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, file_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, purpose TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
  `);
  const cols = (db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("category")) {
    db.exec("ALTER TABLE library ADD COLUMN category TEXT NOT NULL DEFAULT 'template'");
    db.exec("UPDATE library SET category = 'application' WHERE workspace_id IS NOT NULL");
  }
  if (!cols.includes("tracker_id")) db.exec("ALTER TABLE library ADD COLUMN tracker_id TEXT");
  if (!cols.includes("updated_at")) {
    db.exec("ALTER TABLE library ADD COLUMN updated_at TEXT");
    db.exec("UPDATE library SET updated_at = created_at WHERE updated_at IS NULL");
  }
  return db;
}

interface LibraryRow {
  id: string;
  kind: LibraryItem["kind"];
  category: LibraryItem["category"];
  title: string;
  workspace_id: string | null;
  tracker_id: string | null;
  content: string;
  created_at: string;
  updated_at: string | null;
}
const toItem = (r: LibraryRow): LibraryItem => ({
  id: r.id,
  kind: r.kind,
  category: r.category,
  title: r.title,
  workspaceId: r.workspace_id,
  trackerId: r.tracker_id,
  content: r.content,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? r.created_at,
});

const json = <T>(s: string) => JSON.parse(s) as T;

export class SqliteUserStore implements UserStore {
  readonly userId = LOCAL_USER_ID;

  async workspacesList() {
    return (getDb().prepare("SELECT data FROM workspaces ORDER BY updated_at DESC").all() as { data: string }[]).map((r) => json<Workspace>(r.data));
  }
  async workspaceGet(id: string) {
    const r = getDb().prepare("SELECT data FROM workspaces WHERE id = ?").get(id) as { data: string } | undefined;
    return r ? json<Workspace>(r.data) : null;
  }
  async workspaceUpsert(ws: Workspace) {
    getDb()
      .prepare("INSERT OR REPLACE INTO workspaces (id, title, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)")
      .run(ws.id, ws.title, ws.createdAt, ws.updatedAt, JSON.stringify(ws));
  }
  async workspaceDelete(id: string) {
    return getDb().prepare("DELETE FROM workspaces WHERE id = ?").run(id).changes > 0;
  }

  async docList<T>(t: DocTable) {
    return (getDb().prepare(`SELECT data FROM ${t} ORDER BY updated_at DESC`).all() as { data: string }[]).map((r) => json<T>(r.data));
  }
  async docGet<T>(t: DocTable, id: string) {
    const r = getDb().prepare(`SELECT data FROM ${t} WHERE id = ?`).get(id) as { data: string } | undefined;
    return r ? json<T>(r.data) : null;
  }
  async docUpsert<T extends { id: string; updatedAt: string }>(t: DocTable, doc: T) {
    getDb().prepare(`INSERT OR REPLACE INTO ${t} (id, updated_at, data) VALUES (?, ?, ?)`).run(doc.id, doc.updatedAt, JSON.stringify(doc));
  }
  async docDelete(t: DocTable, id: string) {
    return getDb().prepare(`DELETE FROM ${t} WHERE id = ?`).run(id).changes > 0;
  }

  async libraryList() {
    return (getDb().prepare("SELECT * FROM library ORDER BY created_at DESC").all() as unknown as LibraryRow[]).map(toItem);
  }
  async libraryGet(id: string) {
    const r = getDb().prepare("SELECT * FROM library WHERE id = ?").get(id) as unknown as LibraryRow | undefined;
    return r ? toItem(r) : null;
  }
  async libraryInsert(i: LibraryItem) {
    if (i.category === "template" && (await this.libraryList()).filter((x) => x.category === "template" && x.kind === i.kind).length >= 3) throw new TemplateLimitError();
    getDb()
      .prepare("INSERT INTO library (id, kind, category, title, workspace_id, tracker_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(i.id, i.kind, i.category, i.title, i.workspaceId, i.trackerId, i.content, i.createdAt, i.updatedAt);
  }
  async libraryUpdate(i: LibraryItem) {
    getDb().prepare("UPDATE library SET title = ?, content = ?, tracker_id = ?, updated_at = ? WHERE id = ?").run(i.title, i.content, i.trackerId, i.updatedAt, i.id);
  }
  async libraryDelete(id: string) {
    return getDb().prepare("DELETE FROM library WHERE id = ?").run(id).changes > 0;
  }

  async kvGet<T>(key: string) {
    const r = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return r ? json<T>(r.value) : null;
  }
  async kvSet(key: string, value: unknown) {
    getDb().prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
  }

  async jobsPut(jobs: { id: string }[]) {
    const d = getDb();
    const stmt = d.prepare("INSERT OR REPLACE INTO jobs (id, seen_at, data) VALUES (?, ?, ?)");
    const now = Date.now();
    d.exec("BEGIN");
    try {
      for (const j of jobs) stmt.run(j.id, now, JSON.stringify(j));
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
    d.prepare("DELETE FROM jobs WHERE seen_at < ?").run(now - 14 * 86400000);
  }
  async jobGet<T>(id: string) {
    const r = getDb().prepare("SELECT data FROM jobs WHERE id = ?").get(id) as { data: string } | undefined;
    return r ? json<T>(r.data) : null;
  }
  async jobsRecent<T>(sinceMs: number, limit: number) {
    return (getDb().prepare("SELECT data, seen_at FROM jobs WHERE seen_at > ? ORDER BY seen_at DESC LIMIT ?").all(sinceMs, limit) as { data: string; seen_at: number }[]).map((r) => ({
      job: json<T>(r.data),
      seenAt: r.seen_at,
    }));
  }

  async aiCacheGet<T>(key: string, maxAgeMs: number) {
    const r = getDb().prepare("SELECT value, created_at FROM ai_cache WHERE key = ?").get(key) as { value: string; created_at: number } | undefined;
    return r && Date.now() - r.created_at <= maxAgeMs ? json<T>(r.value) : null;
  }
  async aiCacheSet(key: string, value: unknown) {
    getDb().prepare("INSERT OR REPLACE INTO ai_cache (key, created_at, value) VALUES (?, ?, ?)").run(key, Date.now(), JSON.stringify(value));
  }
  async aiUsageIncrement() {
    const day = new Date().toISOString().slice(0, 10);
    getDb().prepare("INSERT INTO ai_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1").run(day);
    return (getDb().prepare("SELECT count FROM ai_usage WHERE day = ?").get(day) as { count: number }).count;
  }

  async kvAll() {
    const rows = getDb().prepare("SELECT key, value FROM kv WHERE key <> 'profile'").all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, json<unknown>(r.value)]));
  }

  async wipeAll() {
    const d = getDb();
    for (const t of ["workspaces", "jobs", "matches", "tracker", "kv", "library", "ai_cache", "ai_usage", "uploads"]) d.exec(`DELETE FROM ${t}`);
    fs.rmSync(path.join(dataDir(), "uploads"), { recursive: true, force: true });
  }

  async profileGet(): Promise<UserProfile> {
    return { email: "local@localhost", displayName: "", masterResume: "", masterResumeConfirmed: false, masterExtra: emptyExtra(), aiConsentAt: null, updatedAt: new Date(0).toISOString(), ...((await this.kvGet<UserProfile>("profile")) ?? {}) };
  }
  async profileUpdate(patch: Partial<UserProfile>) {
    const next = { ...(await this.profileGet()), ...patch, updatedAt: new Date().toISOString() };
    await this.kvSet("profile", next);
    return next;
  }

  private filesDir() {
    const d = path.join(dataDir(), "uploads");
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  async fileSave(meta: { fileName: string; mime: string; purpose: string }, bytes: Buffer): Promise<UploadMeta> {
    const m: UploadMeta = { id: randomUUID(), fileName: meta.fileName.slice(0, 200), mime: meta.mime, size: bytes.length, purpose: meta.purpose, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(this.filesDir(), m.id), bytes);
    getDb().prepare("INSERT INTO uploads (id, file_name, mime, size, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(m.id, m.fileName, m.mime, m.size, m.purpose, m.createdAt);
    return m;
  }
  async fileList() {
    return (getDb().prepare("SELECT * FROM uploads ORDER BY created_at DESC").all() as { id: string; file_name: string; mime: string; size: number; purpose: string; created_at: string }[]).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      mime: r.mime,
      size: r.size,
      purpose: r.purpose,
      createdAt: r.created_at,
    }));
  }
  async fileGet(id: string) {
    const meta = (await this.fileList()).find((f) => f.id === id);
    if (!meta) return null;
    return { meta, bytes: fs.readFileSync(path.join(this.filesDir(), id)) };
  }
  async fileDelete(id: string) {
    const ok = getDb().prepare("DELETE FROM uploads WHERE id = ?").run(id).changes > 0;
    fs.rmSync(path.join(this.filesDir(), id), { force: true });
    return ok;
  }
}

export class SqliteSharedStore implements SharedStore {
  async cacheGet<T>(key: string, maxAgeMs: number) {
    const r = getDb().prepare("SELECT fetched_at, payload FROM cache WHERE key = ?").get(key) as { fetched_at: number; payload: string } | undefined;
    if (!r || Date.now() - r.fetched_at > maxAgeMs) return null;
    return { value: json<T>(r.payload), fetchedAt: r.fetched_at };
  }
  async cacheSet(key: string, value: unknown) {
    getDb().prepare("INSERT OR REPLACE INTO cache (key, fetched_at, payload) VALUES (?, ?, ?)").run(key, Date.now(), JSON.stringify(value));
  }
  async counterGet(key: string) {
    return (getDb().prepare("SELECT value FROM counters WHERE key = ?").get(key) as { value: number } | undefined)?.value ?? 0;
  }
  async counterSet(key: string, value: number) {
    getDb().prepare("INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)").run(key, value);
  }
}
