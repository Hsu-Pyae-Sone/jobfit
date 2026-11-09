import { strToU8, zipSync, type Zippable } from "fflate";
import { ctx } from "@/lib/server/context";
import { handle } from "@/lib/server/http";

export const maxDuration = 60;

const README = `Jobfit — personal data export

data.json contains everything stored in your account:
  profile        your master career profile and account details
  applications   Resume Studio applications (inputs, suggestions, decisions, final documents)
  matches        Match Analysis results
  tracker        Application Tracker entries
  documents      saved resume and cover letter templates and application versions
  preferences    settings, tracker statuses, scoring weights
files/ contains the original files you uploaded.

Not included: temporary caches (search results, stored AI responses), which are
recreated as needed and are deleted with your account.
`;

/** Download all of the signed-in user's data as a ZIP. */
export const GET = handle(async () => {
  const c = ctx();
  const s = c.store;
  const [profile, applications, matches, tracker, documents, preferences, files] = await Promise.all([
    s.profileGet(),
    s.workspacesList(),
    s.docList("matches"),
    s.docList("tracker"),
    s.libraryList(),
    s.kvAll(),
    s.fileList(),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    format: "careerfit-export-v1",
    account: { email: c.user.email },
    profile,
    applications,
    matches,
    tracker,
    documents,
    preferences,
    files,
  };

  const zip: Zippable = { "README.txt": strToU8(README), "data.json": strToU8(JSON.stringify(data, null, 2)) };
  const used = new Set<string>();
  for (const f of files) {
    const got = await s.fileGet(f.id);
    if (!got) continue;
    let name = f.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_") || f.id;
    if (used.has(name)) name = `${f.id.slice(0, 8)}-${name}`;
    used.add(name);
    zip[`files/${name}`] = new Uint8Array(got.bytes);
  }
  const bytes = zipSync(zip, { level: 6 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(bytes, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="jobfit-export-${day}.zip"`,
      "cache-control": "no-store",
    },
  });
});
