"use client";

import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { ProfileOption } from "@/lib/jobs/types";
import type { MatchAnalysis, MatchSummary } from "@/lib/match/types";
import type { WorkspaceSummary } from "@/lib/types";
import { Alert, Badge, Button, Card, Input, Label, Spinner, Textarea, Select } from "../ui";
import { timeAgo } from "../WorkspaceList";

export function MatchList() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [apps, setApps] = useState<WorkspaceSummary[]>([]);
  const [profileId, setProfileId] = useState("");
  const [mode, setMode] = useState<"paste" | "workspace">("paste");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [text, setText] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<{ matches: MatchSummary[] }>("/api/match"), api<{ profiles: ProfileOption[] }>("/api/jobs/profiles"), api<{ workspaces: WorkspaceSummary[] }>("/api/workspaces")])
      .then(([a, b, c]) => {
        setMatches(a.matches);
        setProfiles(b.profiles);
        setProfileId(b.profiles[0]?.id ?? "");
        setApps(c.workspaces);
      })
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const source = mode === "paste" ? { kind: "pasted", title, company, text } : { kind: "workspace", workspaceId };
      const r = await api<{ match: MatchAnalysis }>("/api/match", { body: { source, profileId } });
      router.push(`/match/${r.match.id}`);
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this match analysis and its evidence?")) return;
    await api(`/api/match/${id}`, { method: "DELETE" }).catch((e) => setErr(errorMessage(e)));
    setMatches((cur) => cur?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Match Analysis</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">How well do you fit this job?</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        A transparent 0–100 estimate of how well your documented background matches a job’s stated requirements, the gaps worth closing first, and a
        one-click route to a tailored application. Pick a job from <Link href="/search" className="text-brand underline">Job Search</Link>, or start here.
      </p>

      {err && <Alert kind="error" className="mt-5">{err}</Alert>}

      <Card className="mt-6 p-5 sm:p-6">
        {profiles.length === 0 ? (
          <Alert kind="info" title="You need a confirmed resume first">
            Confirm your resume in the <Link href="/studio" className="underline">Studio</Link>, or save one to the <Link href="/library" className="underline">Library</Link>.
          </Alert>
        ) : (
          <form onSubmit={create} className="space-y-4">
            <div>
              <Label htmlFor="m-profile">Your resume</Label>
              <Select id="m-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.detail})</option>
                ))}
              </Select>
            </div>
            <Tabs value={mode} onChange={(_, v) => setMode(v)} variant="fullWidth" aria-label="Job source" sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider" }}>
              <Tab value="paste" label="Paste a job description" sx={{ minHeight: 40 }} />
              <Tab value="workspace" label="Use a Studio application’s job" sx={{ minHeight: 40 }} />
            </Tabs>
            {mode === "paste" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="m-title">Job title</Label>
                    <Input id="m-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="m-company" hint="optional">Company</Label>
                    <Input id="m-company" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="m-text">Job description</Label>
                  <Textarea id="m-text" required rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full posting, including requirements." />
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor="m-ws">Application</Label>
                <Select id="m-ws" required value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} >
                  <option value="">Choose…</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </Select>
              </div>
            )}
            <Button type="submit" variant="primary" loading={busy}>Analyse match</Button>
          </form>
        )}
      </Card>

      <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Your match analyses</h2>
      {!matches ? (
        <Spinner label="Loading…" />
      ) : matches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">None yet.</p>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {matches.map((x) => (
            <div key={x.id} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
              <Link href={`/match/${x.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-lg font-semibold text-brand-ink">{x.score ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{x.title}</span>
                  <span className="block truncate text-xs text-muted">{[x.company, `vs. ${x.profileLabel}`, timeAgo(x.updatedAt)].filter(Boolean).join(" · ")}</span>
                </span>
                {x.score === null && <Badge>Not analysed</Badge>}
                <ArrowRight className="size-4 text-muted" aria-hidden />
              </Link>
              <button onClick={() => remove(x.id)} className="rounded-lg p-2 text-muted hover:bg-del-bg hover:text-del-ink" aria-label={`Delete ${x.title}`}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
