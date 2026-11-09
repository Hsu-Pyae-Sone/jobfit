"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, CircleAlert, CircleDashed, CircleMinus, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { inputsHash } from "@/lib/facts";
import { parseResume } from "@/lib/resume/parse";
import type { Finding, ReviewItem } from "@/lib/types";
import { Alert, Badge, Button, Card, SectionTitle, WorkingPanel, cx } from "../ui";
import { useWs } from "./useWorkspace";

const CATS = [
  { key: "strongMatches", label: "Strong matches", icon: BadgeCheck, tone: "text-add-ink", bg: "bg-add-bg", desc: "Clearly demonstrated in your resume." },
  { key: "partialMatches", label: "Partial matches", icon: CircleDashed, tone: "text-mod-ink", bg: "bg-mod-bg", desc: "Related evidence, but not explicit or complete." },
  { key: "missingRequirements", label: "Missing requirements", icon: CircleMinus, tone: "text-del-ink", bg: "bg-del-bg", desc: "Not shown anywhere in what you provided." },
  { key: "recommendedImprovements", label: "Recommended improvements", icon: Lightbulb, tone: "text-brand", bg: "bg-brand-soft", desc: "Changes to wording, emphasis or structure." },
] as const;

const IMPORTANCE: Record<Finding["importance"], string> = { required: "Required", preferred: "Preferred", nice_to_have: "Nice to have" };

function Quote({ text, verified, label }: { text: string; verified?: boolean; label: string }) {
  if (!text) return null;
  return (
    <p className="mt-2 text-[13px] leading-relaxed">
      <span className="font-medium text-ink-2">{label}: </span>
      <span className="italic text-ink-2">“{text}”</span>{" "}
      {verified ? (
        <span className="whitespace-nowrap text-xs text-add-ink">✓ found in text</span>
      ) : (
        <span className="whitespace-nowrap text-xs text-mod-ink">⚠ not found word-for-word</span>
      )}
    </p>
  );
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium leading-snug">{f.title}</p>
        <Badge tone={f.importance === "required" ? "del" : f.importance === "preferred" ? "mod" : "neutral"}>{IMPORTANCE[f.importance]}</Badge>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.detail}</p>
      <Quote label="Job asks for" text={f.requirementQuote} verified={f.requirementQuoteVerified} />
      <Quote label="Your evidence" text={f.resumeEvidence} verified={f.resumeEvidenceVerified} />
    </li>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: React.ReactNode[]; empty?: string }) {
  return (
    <Card className="p-5">
      <h4 className="font-medium">{title}</h4>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2">{items}</ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty ?? "Nothing found."}</p>
      )}
    </Card>
  );
}

const SEV_ICON: Record<ReviewItem["severity"], string> = { error: "text-del-ink", warning: "text-mod-ink", info: "text-muted", pass: "text-add-ink" };

export function StepAnalysis({ onNext }: { onNext: () => void }) {
  const { ws, run, busy, aiConfigured } = useWs();
  const a = ws.analysis;
  const [cat, setCat] = useState<(typeof CATS)[number]["key"]>("strongMatches");
  const lines = useMemo(() => parseResume(ws.inputs.resumeText), [ws.inputs.resumeText]);
  const lineText = (id: string) => lines.find((l) => l.id === id)?.text ?? id;
  const stale = a && a.inputHash !== inputsHash(ws);

  if (busy === "analyze")
    return <WorkingPanel title="Analysing your match" steps={["Reading the job’s requirements", "Comparing them with your resume line by line", "Checking quotes against your documents"]} />;

  if (!a)
    return (
      <div>
        <SectionTitle eyebrow="Step 2" title="Match analysis">
          Compare your confirmed resume with the job description. You’ll see strong and partial matches, missing requirements, and specific
          improvements, each backed by quotes from the documents.
        </SectionTitle>
        {!aiConfigured && (
          <Alert kind="warning" className="mb-5" title="AI is not configured">
            The analysis needs AI, which isn’t set up on this server yet. The administrator adds <code>ANTHROPIC_API_KEY</code> to the server environment.
          </Alert>
        )}
        <Button variant="primary" onClick={() => run("analyze")} disabled={!aiConfigured} icon={<Sparkles className="size-4" />}>
          Analyse match
        </Button>
      </div>
    );

  const total = a.strongMatches.length + a.partialMatches.length + a.missingRequirements.length;
  const current = CATS.find((c) => c.key === cat)!;
  const findings = a[cat];

  return (
    <div>
      <SectionTitle eyebrow="Step 2" title="Match analysis">
        {a.detectedRole && (
          <>
            For <span className="font-medium text-ink">{a.detectedRole}</span>
            {a.detectedIndustry && <> · {a.detectedIndustry}</>}.{" "}
          </>
        )}
        Quotes marked “found in text” were checked against your documents.
      </SectionTitle>

      {stale && (
        <Alert kind="warning" className="mb-5" title="Your inputs changed since this analysis">
          Re-run it so findings and suggestions reflect the current documents.
        </Alert>
      )}

      <Card className="mb-6 p-5 sm:p-6">
        <p className="text-[15px] leading-relaxed text-ink-2">{a.overview}</p>
        {total > 0 && (
          <div className="mt-4" aria-label="Requirement coverage">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-black/5">
              <div className="bg-add-ink" style={{ width: `${(a.strongMatches.length / total) * 100}%` }} />
              <div className="bg-[#d39b1c]" style={{ width: `${(a.partialMatches.length / total) * 100}%` }} />
              <div className="bg-del-ink/80" style={{ width: `${(a.missingRequirements.length / total) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {a.strongMatches.length} strong · {a.partialMatches.length} partial · {a.missingRequirements.length} missing
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => run("analyze")} icon={<RefreshCw className="size-3.5" />}>
            Re-run analysis
          </Button>
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="Finding categories">
        {CATS.map((c) => {
          const Icon = c.icon;
          const active = c.key === cat;
          return (
            <button
              key={c.key}
              role="tab"
              aria-selected={active}
              onClick={() => setCat(c.key)}
              className={cx("rounded-xl border p-4 text-left transition-colors", active ? "border-ink bg-surface shadow-sm" : "border-line bg-surface-2 hover:border-line-strong")}
            >
              <div className="flex items-center justify-between">
                <span className={cx("grid size-8 place-items-center rounded-lg", c.bg, c.tone)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="font-display text-2xl font-semibold">{a[c.key].length}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{c.label}</p>
              <p className="text-xs text-muted">{c.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4" role="tabpanel" aria-label={current.label}>
        {findings.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {findings.map((f, n) => (
              <FindingCard key={n} f={f} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">None in this category.</p>
        )}
      </div>

      <h3 className="mb-3 mt-10 font-display text-xl font-semibold">Keywords</h3>
      <Card className="p-5">
        <p className="text-sm font-medium text-add-ink">In your documents ({a.keywords.matched.length})</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.keywords.matched.map((k) => (
            <Badge key={k} tone="add">
              {k}
            </Badge>
          ))}
        </div>
        <p className="mt-4 text-sm font-medium text-del-ink">Missing ({a.keywords.missing.length})</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.keywords.missing.map((k) => (
            <span key={k} className="rounded-full border border-del-ink/30 px-2 py-0.5 text-xs text-del-ink">
              {k}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Missing keywords are added to your resume only if your own information shows you have that skill.</p>
      </Card>

      <h3 className="mb-3 mt-10 font-display text-xl font-semibold">Details</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <ListBlock
          title="Experience to emphasise"
          items={a.emphasize.map((e) => (
            <li key={e.lineId}>
              <span className="text-ink">“{lineText(e.lineId)}”</span>
              <span className="block text-muted">{e.reason}</span>
            </li>
          ))}
        />
        <ListBlock
          title="Weak or generic bullet points"
          items={a.weakBullets.map((w) => (
            <li key={w.lineId}>
              <span className="text-ink">“{lineText(w.lineId)}”</span>
              <span className="block text-muted">{w.issue}</span>
            </li>
          ))}
        />
        <ListBlock title="Preferred qualifications" items={a.preferredQualifications.map((p) => <li key={p}>• {p}</li>)} />
        <ListBlock title="Missing information" items={a.missingInformation.map((p) => <li key={p}>• {p}</li>)} />
        <ListBlock title="Industry terminology" items={a.industryTerms.length ? [<li key="t" className="flex flex-wrap gap-1.5">{a.industryTerms.map((t) => <Badge key={t}>{t}</Badge>)}</li>] : []} />
        <ListBlock
          title="Formatting & ATS"
          empty="No formatting issues found."
          items={[
            ...a.formattingIssues.map((p) => <li key={p}>• {p}</li>),
            ...a.autoFormatting.map((r) => (
              <li key={r.id} className="flex gap-2">
                <CircleAlert className={cx("mt-0.5 size-4 shrink-0", SEV_ICON[r.severity])} aria-hidden />
                <span>
                  {r.message}
                  {r.detail && <span className="block text-muted">{r.detail}</span>}
                </span>
              </li>
            )),
          ]}
        />
      </div>

      <div className="mt-8 flex justify-end">
        <Button variant="primary" onClick={onNext}>
          {a.metricQuestions.length ? `Answer ${a.metricQuestions.length} question${a.metricQuestions.length > 1 ? "s" : ""} about your results` : "Continue"}
        </Button>
      </div>
    </div>
  );
}
