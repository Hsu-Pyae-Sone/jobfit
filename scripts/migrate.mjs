// Apply supabase/migrations/*.sql to your Supabase database, in order, once each.
//
//   1. Supabase dashboard → Connect → "Session pooler" connection string (IPv4-friendly)
//   2. Put it in .env.local as SUPABASE_DB_URL=postgresql://postgres.xxxx:PASSWORD@...:5432/postgres
//   3. npm run db:migrate
//
// Alternatively, paste each migration file into the dashboard's SQL editor and run it.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadEnvLocal();
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add your Supabase database connection string to .env.local (see the README).");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = postgres(url, { max: 1, onnotice: () => {}, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require" });
try {
  // Bookkeeping lives in its own schema, which the Supabase Data API does not expose.
  await sql`create schema if not exists careerfit_meta`;
  await sql`create table if not exists careerfit_meta.migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from careerfit_meta.migrations`).map((r) => r.name));
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    process.stdout.write(`Applying ${f} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into careerfit_meta.migrations (name) values (${f})`;
    });
    console.log("done");
    applied++;
  }
  console.log(applied ? `Applied ${applied} migration(s).` : "Database is up to date.");
} catch (err) {
  console.error(`\nMigration failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
