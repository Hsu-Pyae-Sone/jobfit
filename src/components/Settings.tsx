"use client";

import Skeleton from "@mui/material/Skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleSlash, Database, KeyRound, Scale, Sparkles, UserRound, Briefcase } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { ProfileOption } from "@/lib/jobs/types";
import { CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_WEIGHTS, type Weights } from "@/lib/match/types";
import { AiConsentControl, YourData } from "./account/AccountSettings";
import { Alert, Button, Card, Input, Select } from "./ui";

interface SettingsData {
  settings: { primaryProfileId: string | null };
  profiles: ProfileOption[];
  ai: { configured: boolean; model: string };
  sources: { id: string; name: string; homepage: string; configured: boolean; needsKey: string | null; countries: string[] | null }[];
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Sparkles; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function Settings() {
  const [d, setD] = useState<SettingsData | null>(null);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<SettingsData>("/api/settings"), api<{ weights: Weights }>("/api/match/weights")])
      .then(([s, w]) => {
        setD(s);
        setWeights(w.weights);
      })
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(null), 2500);
  };

  async function setPrimary(id: string) {
    try {
      const r = await api<{ settings: SettingsData["settings"] }>("/api/settings", { method: "PUT", body: { primaryProfileId: id || null } });
      setD((cur) => (cur ? { ...cur, settings: r.settings } : cur));
      flash("Resume preference saved.");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function saveWeights(w: Weights) {
    try {
      setWeights((await api<{ weights: Weights }>("/api/match/weights", { method: "PUT", body: w })).weights);
      flash("Scoring weights saved.");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  const total = weights ? Object.values(weights).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Settings</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
      {err && <Alert kind="error" className="mt-5">{err}</Alert>}
      {saved && <Alert kind="success" className="mt-5">{saved}</Alert>}

      {!d || !weights ? (
        <div className="mt-6 space-y-4">
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={200} />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Section icon={UserRound} title="Resume for recommendations" description="Used by the Dashboard to recommend jobs and suggest next actions.">
            {d.profiles.length ? (
              <Select aria-label="Resume for recommendations" value={d.settings.primaryProfileId ?? ""} onChange={(e) => setPrimary(e.target.value)}>
                <option value="">Most recently confirmed resume</option>
                {d.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.detail})
                  </option>
                ))}
              </Select>
            ) : (
              <Alert kind="info">
                Confirm your resume in <Link href="/studio" className="underline">Resume Studio</Link> or save a template in <Link href="/library" className="underline">Saved Documents</Link>.
              </Alert>
            )}
          </Section>

          <Section icon={Sparkles} title="AI" description="Analysis, rewriting, cover letters, match assessments and AI OCR use Claude.">
            {d.ai.configured ? (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-add-ink" /> Connected · model <span className="font-mono">{d.ai.model}</span>
                </p>
                <AiConsentControl />
              </>
            ) : (
              <Alert kind="warning" title="Not configured">
                The server administrator needs to set <code>ANTHROPIC_API_KEY</code> in the server environment. Keys stay on the server and are never sent to the
                browser. Everything except AI features works without it.
              </Alert>
            )}
          </Section>

          <Section icon={Briefcase} title="Job sources" description="Official APIs and public feeds. Sources that need a key are enabled by the server administrator.">
            <ul className="divide-y divide-line">
              {d.sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  {s.configured ? <CheckCircle2 className="size-4 text-add-ink" aria-label="Enabled" /> : <CircleSlash className="size-4 text-muted" aria-label="Not enabled" />}
                  <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {s.name}
                  </a>
                  <span className="text-muted">
                    {s.configured ? (s.countries ? `Countries: ${s.countries.join(", ")}` : "No key needed") : <>Set <code className="text-xs">{s.needsKey}</code></>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" /> For administrators: on-site jobs in Finland need a Jooble key for Finland (<code>JOOBLE_KEYS=FI:your-key</code>) in the server environment. See <code>.env.example</code>.
            </p>
          </Section>

          <Section icon={Scale} title="Match score weights" description="How Match Analysis weighs each category. Weights are re-normalised over the categories a posting actually mentions.">
            <div className="grid gap-3 sm:grid-cols-5">
              {CATEGORY_ORDER.map((c) => (
                <div key={c}>
                  <label htmlFor={`w-${c}`} className="mb-1 block text-xs font-medium text-ink-2">
                    {CATEGORY_LABEL[c]}
                  </label>
                  <Input id={`w-${c}`} type="number" inputMode="numeric" value={weights[c]} onChange={(e) => setWeights({ ...weights, [c]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Total {total}%{total !== 100 ? " — that’s fine; weights are normalised to 100% when scoring." : "."}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" onClick={() => saveWeights(weights)} disabled={total === 0}>
                Save weights
              </Button>
              <Button size="sm" variant="ghost" onClick={() => saveWeights(DEFAULT_WEIGHTS)}>
                Reset to 35 / 25 / 15 / 15 / 10
              </Button>
            </div>
          </Section>

          <Section icon={Database} title="Your data" description="What is stored, your uploaded files, export and account deletion.">
            <YourData />
          </Section>
        </div>
      )}
    </div>
  );
}
