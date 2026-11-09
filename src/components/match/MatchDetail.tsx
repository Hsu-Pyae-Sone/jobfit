"use client";

import Checkbox from "@mui/material/Checkbox";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  CircleDashed,
  CircleHelp,
  CircleMinus,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  Hammer,
  Info,
  ListChecks,
  RefreshCw,
  Rocket,
  Search,
  Timer,
  Trash2,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { computeScore, gapCandidates, potentialScore, priorityFor } from "@/lib/match/score";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  DEFAULT_WEIGHTS,
  STATUS_LABEL,
  type EvidenceType,
  type GapProgress,
  type MatchAnalysis,
  type ReqStatus,
  type Weights,
} from "@/lib/match/types";
import { Alert, Badge, Button, Card, Input, Label, Spinner, Textarea, WorkingPanel, cx, Select } from "../ui";

const STATUS_UI: Record<ReqStatus, { icon: typeof BadgeCheck; cls: string; tone: "add" | "mod" | "del" | "neutral" }> = {
  verified: { icon: BadgeCheck, cls: "text-add-ink", tone: "add" },
  partial: { icon: CircleDashed, cls: "text-mod-ink", tone: "mod" },
  not_demonstrated: { icon: CircleMinus, cls: "text-del-ink", tone: "del" },
  unknown: { icon: CircleHelp, cls: "text-muted", tone: "neutral" },
};

function ScoreRing({ value, size = 132 }: { value: number | null; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <svg className="shrink-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={value === null ? "No score" : `${value} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={pct >= 70 ? "var(--add-ink)" : pct >= 45 ? "var(--brand)" : "var(--accent)"}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="font-display" fontSize={size / 3.6} fontWeight={600} fill="var(--ink)">
        {value ?? "—"}
      </text>
      <text x="50%" y="68%" textAnchor="middle" fontSize={size / 11} fill="var(--muted)">
        / 100
      </text>
    </svg>
  );
}

function EvidenceForm({ m, requirementIds, onDone }: { m: MatchAnalysis; requirementIds: string[]; onDone: (m: MatchAnalysis) => void }) {
  const [type, setType] = useState<EvidenceType>("project");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await api<{ match: MatchAnalysis }>(`/api/match/${m.id}/evidence`, { body: { type, title, description, link, date, requirementIds } });
          onDone(r.match);
        } catch (e) {
          setErr(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-medium">Add evidence</p>
      <div className="flex flex-wrap gap-1.5">
        {(["project", "certification", "experience", "course", "other"] as const).map((t) => (
          <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)} className={cx("rounded-full border px-2.5 py-1 text-xs capitalize", type === t ? "border-brand bg-brand text-white" : "border-line-strong")}>
            {t}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <Label htmlFor={`ev-title-${requirementIds.join()}`}>Title</Label>
          <Input id={`ev-title-${requirementIds.join()}`} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sales dashboard in Power BI" />
        </div>
        <div>
          <Label htmlFor={`ev-date-${requirementIds.join()}`} hint="optional">Date</Label>
          <Input id={`ev-date-${requirementIds.join()}`} value={date} onChange={(e) => setDate(e.target.value)} placeholder="e.g. Nov 2026" />
        </div>
      </div>
      <div>
        <Label htmlFor={`ev-desc-${requirementIds.join()}`}>What you did</Label>
        <Textarea
          id={`ev-desc-${requirementIds.join()}`}
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the work in specific terms: tools used, what you built, and any results you can verify."
        />
      </div>
      <div>
        <Label htmlFor={`ev-link-${requirementIds.join()}`} hint="optional — portfolio, repository, certificate">Link</Label>
        <Input id={`ev-link-${requirementIds.join()}`} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
      </div>
      {err && <Alert kind="error">{err}</Alert>}
      <p className="text-xs text-muted">Evidence is your own statement. It’s used like resume content: only what you write here can support a requirement.</p>
      <Button type="submit" variant="primary" size="sm" loading={busy}>
        Save evidence
      </Button>
    </form>
  );
}

function searchUrl(q: string) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

const PREP_STEPS = ["Load job description and your resume", "Run match analysis", "Recommend improvements", "Generate tailored cover letter"] as const;

export function MatchDetail({ id }: { id: string }) {
  const [m, setM] = useState<MatchAnalysis | null>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [draftWeights, setDraftWeights] = useState<Weights | null>(null);
  const [aiConfigured, setAi] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [selectedGaps, setSelectedGaps] = useState<string[] | null>(null);
  const [fullText, setFullText] = useState("");
  const [prep, setPrep] = useState<{ step: number; workspaceId: string | null; error?: string } | null>(null);
  const [tone, setTone] = useState<"professional" | "confident" | "concise">("professional");
  const [trackerMsg, setTrackerMsg] = useState<string | null>(null);
  const autoRan = useRef(false);

  async function run(mode: "full" | "reassess", current = m) {
    if (!current) return;
    setBusy(mode);
    setErr(null);
    try {
      setM((await api<{ match: MatchAnalysis }>(`/api/match/${current.id}/run`, { body: { mode } })).match);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    Promise.all([api<{ match: MatchAnalysis }>(`/api/match/${id}`), api<{ weights: Weights }>("/api/match/weights"), api<{ aiConfigured: boolean }>("/api/status")])
      .then(([a, w, s]) => {
        setM(a.match);
        setWeights(w.weights);
        setAi(s.aiConfigured);
        // "After a user selects a job, automatically analyze": run once when new.
        if (a.match.state === "new" && a.match.job.descriptionComplete && s.aiConfigured && !autoRan.current) {
          autoRan.current = true;
          void run("full", a.match);
        }
      })
      .catch((e) => setErr(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const result = useMemo(() => (m ? computeScore(m.requirements, weights) : null), [m, weights]);
  const gaps = useMemo(() => (m ? gapCandidates(m.requirements, weights) : []), [m, weights]);
  const chosen = selectedGaps ?? gaps.map((g) => g.requirement.id);
  const potential = m && gaps.length ? potentialScore(m.requirements, weights, chosen) : null;

  if (err && !m) return <div className="mx-auto max-w-3xl px-4 py-12"><Alert kind="error">{err}</Alert></div>;
  if (!m || !result) return <div className="px-8 py-12"><Spinner label="Loading…" /></div>;

  const patch = async (body: unknown) => {
    try {
      setM((await api<{ match: MatchAnalysis }>(`/api/match/${m.id}`, { method: "PATCH", body })).match);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  async function saveWeights() {
    if (!draftWeights) return;
    try {
      setWeights((await api<{ weights: Weights }>("/api/match/weights", { method: "PUT", body: draftWeights })).weights);
      setDraftWeights(null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function prepare() {
    if (!m) return;
    setPrep({ step: 0, workspaceId: null });
    try {
      const { workspaceId } = await api<{ workspaceId: string }>(`/api/match/${m.id}/actions`, { body: { action: "prepare" } });
      setPrep({ step: 1, workspaceId });
      await api(`/api/workspaces/${workspaceId}/analyze`, { body: {} });
      setPrep({ step: 2, workspaceId });
      await api(`/api/workspaces/${workspaceId}/optimize`, { body: {} });
      setPrep({ step: 3, workspaceId });
      await api(`/api/workspaces/${workspaceId}/cover-letter`, { body: { tone } });
      setPrep({ step: 4, workspaceId });
      setM((await api<{ match: MatchAnalysis }>(`/api/match/${m.id}`)).match);
    } catch (e) {
      setPrep((p) => ({ step: p?.step ?? 0, workspaceId: p?.workspaceId ?? null, error: errorMessage(e) }));
    }
  }

  async function refreshResume() {
    try {
      setM((await api<{ match: MatchAnalysis }>(`/api/match/${m!.id}/actions`, { body: { action: "refresh-resume" } })).match);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function addTracker() {
    try {
      const r = await api<{ match: MatchAnalysis }>(`/api/match/${m!.id}/actions`, { body: { action: "tracker" } });
      setM(r.match);
      setTrackerMsg("Added to your tracker.");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  const reqById = (rid: string) => m.requirements.find((r) => r.id === rid);
  const statusCount = (s: ReqStatus) => m.requirements.filter((r) => r.status === s).length;
  const latest = m.history[m.history.length - 1];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <Link href="/match" className="text-sm text-muted hover:text-ink">← Match analyses</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Match Analysis</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{m.job.title}</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {[m.job.company, m.job.location].filter(Boolean).join(" · ") || "Company not provided"}
            {m.job.url && (
              <>
                {" · "}
                <a href={m.job.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
                  Original posting <ExternalLink className="size-3.5" />
                </a>
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-muted">
            Compared with: <span className="text-ink-2">{m.profileLabel}</span>{" "}
            <button className="ml-1 text-brand hover:underline" onClick={refreshResume}>
              Use latest version of this resume
            </button>
          </p>
        </div>
      </div>

      {err && <Alert kind="error" className="mt-5">{err}</Alert>}
      {!aiConfigured && <Alert kind="warning" className="mt-5" title="AI is not configured">Match analysis needs AI, which isn’t set up on this server yet (the administrator adds <code>ANTHROPIC_API_KEY</code> to the server environment).</Alert>}

      {!m.job.descriptionComplete && (
        <Card className="mt-6 p-5">
          <Alert kind="warning" title="Only a summary of this job is available">
            The source only provided a short summary, so requirements would be incomplete. Open the original posting, copy the full description and paste it here.
          </Alert>
          <Textarea className="mt-3" rows={8} value={fullText} onChange={(e) => setFullText(e.target.value)} placeholder="Paste the full job description…" aria-label="Full job description" />
          <Button
            className="mt-3"
            variant="primary"
            disabled={fullText.trim().length < 50}
            onClick={async () => {
              await patch({ fullDescription: fullText });
              setFullText("");
              autoRan.current = true;
              const fresh = (await api<{ match: MatchAnalysis }>(`/api/match/${m.id}`)).match;
              await run("full", fresh);
            }}
          >
            Use this description and analyse
          </Button>
        </Card>
      )}

      {busy === "full" && (
        <div className="mt-6">
          <WorkingPanel title="Analysing this job against your resume" steps={["Extracting every stated requirement", "Checking each one against your documents", "Finding the gaps that matter most"]} />
        </div>
      )}

      {m.state === "new" && !busy && m.job.descriptionComplete && (
        <Card className="mt-6 p-6 text-center">
          <Button variant="primary" onClick={() => run("full")} disabled={!aiConfigured} icon={<Search className="size-4" />}>
            Analyse match
          </Button>
        </Card>
      )}

      {m.state === "analyzed" && busy !== "full" && (
        <>
          {/* ---------- Score ---------- */}
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center">
              <ScoreRing value={result.score} />
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold">Estimated qualification match</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  How well your documented background matches the requirements this posting states. It is <strong className="font-medium text-ink-2">not</strong> the
                  probability of being hired or of passing ATS screening.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(["verified", "partial", "not_demonstrated", "unknown"] as const).map((s) => (
                    <Badge key={s} tone={STATUS_UI[s].tone}>
                      {statusCount(s)} {STATUS_LABEL[s]}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <p className="text-sm font-medium">Potential after verified improvements</p>
              {potential !== null && result.score !== null ? (
                <>
                  <p className="mt-1 font-display text-3xl font-semibold">
                    {result.score} → <span className="text-brand">{potential}</span>
                    <span className="text-base font-normal text-muted"> / 100</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <strong className="font-medium text-ink-2">Hypothetical.</strong> This is what the score would be if the {chosen.length} selected gap
                    {chosen.length === 1 ? "" : "s"} below became verified matches. Your verified score only changes when you add evidence and recalculate.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">No gaps found that would raise the score.</p>
              )}
              {m.pendingEvidence && (
                <Alert kind="info" className="mt-3" title="New evidence or resume changes since the last calculation">
                  <Button size="sm" variant="primary" className="mt-2" loading={busy === "reassess"} onClick={() => run("reassess")} icon={<RefreshCw className="size-3.5" />}>
                    Recalculate verified score
                  </Button>
                </Alert>
              )}
              {m.history.length > 1 && (
                <ul className="mt-3 space-y-0.5 text-xs text-muted">
                  {m.history.slice(-4).map((h) => (
                    <li key={h.at}>
                      {new Date(h.at).toLocaleString()} — {h.score ?? "—"}/100 · {h.reason}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ---------- How the score was calculated ---------- */}
          <h2 className="mb-3 mt-10 font-display text-xl font-semibold">How the score was calculated</h2>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-3 py-2.5 font-semibold">Requirements</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Category score</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Weight</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Used weight</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.categories.map((c) => (
                  <tr key={c.category} className={c.included ? "" : "text-muted"}>
                    <td className="px-4 py-2.5 font-medium">{c.label}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {c.counts.verified + c.counts.partial + c.counts.not_demonstrated + c.counts.unknown === 0
                        ? "None stated in the posting"
                        : `${c.counts.verified} verified · ${c.counts.partial} partial · ${c.counts.not_demonstrated} not shown${c.counts.unknown ? ` · ${c.counts.unknown} unknown` : ""}`}
                    </td>
                    <td className="px-3 py-2.5 text-right">{c.score === null ? "—" : Math.round(c.score)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {draftWeights ? (
                        <input
                          aria-label={`${c.label} weight`}
                          type="number"
                          min={0}
                          max={100}
                          value={draftWeights[c.category]}
                          onChange={(e) => setDraftWeights({ ...draftWeights, [c.category]: Number(e.target.value) })}
                          className="w-16 rounded border border-line-strong px-1.5 py-0.5 text-right"
                        />
                      ) : (
                        `${c.weight}%`
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{c.included ? `${(c.normalizedWeight * 100).toFixed(1)}%` : "excluded"}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{c.included ? c.contribution.toFixed(1) : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-4 py-2.5" colSpan={5}>Total (rounded)</td>
                  <td className="px-4 py-2.5 text-right">{result.score ?? "—"}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
              <p className="max-w-3xl">
                Each requirement counts Verified = 1, Partial = 0.5, Not demonstrated = 0. Unknown requirements (too vague to check) are left out. A category’s score is
                the average of its requirements. Categories the posting doesn’t mention are excluded, and the remaining weights are scaled to 100%.
              </p>
              {draftWeights ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDraftWeights(null)}>Cancel</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraftWeights(DEFAULT_WEIGHTS)}>Reset to defaults</Button>
                  <Button size="sm" variant="primary" onClick={saveWeights}>Save weights</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setDraftWeights(weights)}>Adjust weights</Button>
              )}
            </div>
          </Card>

          {/* ---------- Requirements ---------- */}
          <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Requirements from the posting</h2>
          {m.requirementsNote && <Alert kind="info" className="mb-3">{m.requirementsNote}</Alert>}
          <div className="grid gap-4 lg:grid-cols-2">
            {CATEGORY_ORDER.filter((c) => m.requirements.some((r) => r.category === c)).map((c) => (
              <Card key={c} className="p-5">
                <h3 className="font-medium">{CATEGORY_LABEL[c]}</h3>
                <ul className="mt-3 space-y-3">
                  {m.requirements
                    .filter((r) => r.category === c)
                    .map((r) => {
                      const ui = STATUS_UI[r.status];
                      const Icon = ui.icon;
                      return (
                        <li key={r.id} className="text-sm">
                          <div className="flex items-start gap-2">
                            <Icon className={cx("mt-0.5 size-4 shrink-0", ui.cls)} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-ink">{r.text}</span>
                                <Badge tone={ui.tone}>{STATUS_LABEL[r.status]}</Badge>
                              </div>
                              {r.quote && (
                                <p className="mt-0.5 text-xs text-muted">
                                  Posting: “{r.quote}”{!r.quoteVerified && " (not found word-for-word)"}
                                </p>
                              )}
                              {r.evidence && (
                                <p className="mt-0.5 text-xs text-add-ink">
                                  {r.evidenceSource === "resume" || !r.evidenceSource ? "Your resume" : `Your evidence ${r.evidenceSource}`}: “{r.evidence}”
                                </p>
                              )}
                              <p className="mt-0.5 text-xs text-ink-2">{r.explanation}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            ))}
          </div>

          {/* ---------- Skills gap ---------- */}
          <h2 className="mb-1 mt-10 font-display text-xl font-semibold">Skills gap recommendations</h2>
          <p className="mb-4 text-sm text-muted">Sorted by how much each would raise your score if verified. Tick the ones to include in the hypothetical potential score.</p>
          {gaps.length === 0 ? (
            <Alert kind="success">No gaps: every assessable requirement is a verified match.</Alert>
          ) : (
            <div className="space-y-4">
              {gaps.map(({ requirement: r, impact }) => {
                const rec = m.gaps.find((g) => g.requirementId === r.id);
                const pr = priorityFor(impact, r);
                const progress: GapProgress = m.gapProgress[r.id] ?? "not_started";
                const linked = m.evidence.filter((e) => e.requirementIds.includes(r.id));
                return (
                  <Card key={r.id} className="p-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <Checkbox size="small" sx={{ p: 0.25 }} slotProps={{ input: { "aria-label": `Include ${rec?.skillName ?? r.text} in potential score` } }}
                        checked={chosen.includes(r.id)}
                        onChange={(e) => setSelectedGaps(e.target.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[16px] font-semibold">{rec?.skillName ?? r.text}</h3>
                          <Badge tone={pr === "high" ? "del" : pr === "medium" ? "mod" : "neutral"}>{pr} priority</Badge>
                          <Badge tone={STATUS_UI[r.status].tone}>{STATUS_LABEL[r.status]}</Badge>
                          <span className="text-xs text-muted">+{impact} points if verified (hypothetical)</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{CATEGORY_LABEL[r.category]} · Posting: “{r.quote || r.text}”</p>
                      </div>
                      <Select
                        aria-label="Progress"
                        value={progress}
                        onChange={(e) => patch({ gapProgress: { [r.id]: e.target.value } })}
                        >
                        <option value="not_started">Not started</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                      </Select>
                    </div>

                    {rec ? (
                      <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Info className="size-3.5" /> Why it matters</p>
                          <p className="mt-1 leading-relaxed text-ink-2">{rec.whyItMatters}</p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><BookOpen className="size-3.5" /> Learning resources</p>
                          <ul className="mt-1 space-y-1">
                            {rec.resources.map((res) => (
                              <li key={res.name} className="text-ink-2">
                                <a href={searchUrl(`${res.name} ${res.provider}`)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                                  {res.name}
                                </a>{" "}
                                <span className="text-xs text-muted">· {res.provider} · {res.type}{res.free ? " · free" : ""}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1 text-[11px] text-muted">Links open a web search. Check that a resource is current before relying on it.</p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Hammer className="size-3.5" /> Practical project</p>
                          <p className="mt-1 leading-relaxed text-ink-2">{rec.project}</p>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Timer className="size-3.5" /> Estimated learning time</p>
                            <p className="mt-1 text-ink-2">{rec.estimatedTime || "Not estimated: depends on circumstances outside a course (e.g. a degree or years of experience)."}</p>
                          </div>
                          <div>
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><FileCheck2 className="size-3.5" /> How to demonstrate it</p>
                            <p className="mt-1 leading-relaxed text-ink-2">{rec.demonstrate}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted">Recommendations are generated for the eight highest-impact gaps.</p>
                    )}

                    {progress === "completed" && !linked.length && (
                      <Alert kind="warning" className="mt-4" title="Marked as completed. Your score hasn’t changed.">
                        Add evidence such as a project, certification or updated experience, then recalculate. Only evidence can change the verified score.
                      </Alert>
                    )}
                    {linked.length > 0 && <p className="mt-3 text-xs text-add-ink">Evidence added: {linked.map((e) => e.title).join(", ")}</p>}
                    <div className="mt-3">
                      {evidenceFor === r.id ? (
                        <EvidenceForm
                          m={m}
                          requirementIds={[r.id]}
                          onDone={(next) => {
                            setM(next);
                            setEvidenceFor(null);
                          }}
                        />
                      ) : (
                        <Button size="sm" variant={progress === "completed" ? "primary" : "secondary"} onClick={() => setEvidenceFor(r.id)}>
                          Add evidence for this
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {m.evidence.length > 0 && (
            <>
              <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Your evidence</h2>
              <Card className="divide-y divide-line">
                {m.evidence.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                    <Badge>{e.id}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {e.title} <span className="font-normal capitalize text-muted">· {e.type}{e.date ? ` · ${e.date}` : ""}</span>
                      </p>
                      <p className="text-ink-2">{e.description}</p>
                      {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-brand hover:underline">{e.link}</a>}
                      {e.requirementIds.length > 0 && <p className="text-xs text-muted">For: {e.requirementIds.map((rid) => reqById(rid)?.text ?? rid).join(", ")}</p>}
                    </div>
                    <button
                      aria-label={`Delete evidence ${e.title}`}
                      className="rounded p-1.5 text-muted hover:bg-del-bg hover:text-del-ink"
                      onClick={async () => {
                        try {
                          setM((await api<{ match: MatchAnalysis }>(`/api/match/${m.id}/evidence?evidenceId=${e.id}`, { method: "DELETE" })).match);
                        } catch (er) {
                          setErr(errorMessage(er));
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* ---------- Prepare application ---------- */}
          <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Prepare application</h2>
          <Card className="p-5 sm:p-6">
            <p className="text-sm leading-relaxed text-ink-2">
              Loads this job and your resume{m.evidence.length ? " (with your evidence as additional information)" : ""} into the Studio. Then it runs the match analysis, recommends
              improvements, and drafts a tailored resume and cover letter. You review every change before anything is applied, then edit and export.
            </p>
            {m.pendingEvidence && <Alert kind="info" className="mt-3">Recalculate your score first if you want this page to reflect your new evidence; the Studio will use it either way.</Alert>}
            {!prep && !m.workspaceId && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Select aria-label="Cover letter tone" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} >
                  <option value="professional">Cover letter: Professional</option>
                  <option value="confident">Cover letter: Confident & engaging</option>
                  <option value="concise">Cover letter: Concise & direct</option>
                </Select>
                <Button variant="primary" onClick={prepare} disabled={!aiConfigured || !m.job.descriptionComplete} icon={<Rocket className="size-4" />}>
                  Prepare Application
                </Button>
              </div>
            )}
            {prep && (
              <ol className="mt-4 space-y-1.5 text-sm">
                {PREP_STEPS.map((s, i) => (
                  <li key={s} className={cx("flex items-center gap-2", i < prep.step ? "text-add-ink" : i === prep.step && !prep.error ? "text-ink" : "text-muted")}>
                    {i < prep.step ? <BadgeCheck className="size-4" /> : i === prep.step && !prep.error && prep.step < 4 ? <Spinner /> : <ListChecks className="size-4" />}
                    {s}
                  </li>
                ))}
                {prep.error && <Alert kind="error" className="mt-2">{prep.error}</Alert>}
              </ol>
            )}
            {(m.workspaceId || prep?.workspaceId) && (prep === null || prep.step === 4 || prep.error) && (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-medium">Your tailored documents are ready to review:</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/studio/${m.workspaceId ?? prep?.workspaceId}?step=optimize`} className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-sm font-medium text-white hover:bg-ink-2">
                    Before & after resume
                  </Link>
                  <Link href={`/studio/${m.workspaceId ?? prep?.workspaceId}?step=cover`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-sm font-medium hover:border-ink-2">
                    Cover letter
                  </Link>
                  <Link href={`/studio/${m.workspaceId ?? prep?.workspaceId}?step=review`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-sm font-medium hover:border-ink-2">
                    Review & export
                  </Link>
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              {m.trackerId ? (
                <p className="text-sm text-add-ink">
                  In your tracker. <Link href="/tracker" className="underline">Open tracker</Link>
                </p>
              ) : (
                <Button size="sm" icon={<ClipboardList className="size-4" />} onClick={addTracker}>
                  Add this application to the tracker
                </Button>
              )}
              {trackerMsg && <span className="text-sm text-brand">{trackerMsg}</span>}
              <p className="w-full text-xs text-muted">
                Jobfit never submits applications. When you’re ready, apply through the original posting yourself.
              </p>
            </div>
          </Card>
          {latest && <p className="mt-6 text-xs text-muted">Last calculated {new Date(latest.at).toLocaleString()}.</p>}
        </>
      )}
    </div>
  );
}
