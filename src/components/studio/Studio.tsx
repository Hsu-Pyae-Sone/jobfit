"use client";

import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, Lock } from "lucide-react";
import type { Workspace } from "@/lib/types";
import { Alert, Spinner, cx } from "../ui";
import { WorkspaceContext, useWorkspaceState } from "./useWorkspace";
import { StepInputs } from "./StepInputs";
import { StepAnalysis } from "./StepAnalysis";
import { StepGaps } from "./StepGaps";
import { StepOptimize } from "./StepOptimize";
import { StepCoverLetter } from "./StepCoverLetter";
import { StepReview } from "./StepReview";

export type StepKey = "inputs" | "analysis" | "gaps" | "optimize" | "cover" | "review";

const STEPS: { key: StepKey; label: string; short: string }[] = [
  { key: "inputs", label: "Documents", short: "Docs" },
  { key: "analysis", label: "Match analysis", short: "Match" },
  { key: "gaps", label: "Your results", short: "Results" },
  { key: "optimize", label: "Resume changes", short: "Resume" },
  { key: "cover", label: "Cover letter", short: "Letter" },
  { key: "review", label: "Review & export", short: "Export" },
];

function unlocked(ws: Workspace, key: StepKey): boolean {
  if (key === "inputs") return true;
  if (key === "analysis") return ws.inputs.resumeConfirmed && ws.inputs.jobConfirmed;
  return Boolean(ws.analysis);
}

function done(ws: Workspace, key: StepKey): boolean {
  switch (key) {
    case "inputs":
      return ws.inputs.resumeConfirmed && ws.inputs.jobConfirmed;
    case "analysis":
      return Boolean(ws.analysis);
    case "gaps":
      return Boolean(ws.analysis) && (ws.analysis!.metricQuestions.length === 0 || ws.analysis!.metricQuestions.every((q) => ws.answers[q.id]));
    case "optimize":
      return Boolean(ws.optimization) && ws.optimization!.suggestions.every((s) => ws.decisions[s.id] && ws.decisions[s.id] !== "pending");
    case "cover":
      return Boolean(ws.coverLetter);
    case "review":
      return Boolean(ws.review);
  }
}

function initialStep(ws: Workspace): StepKey {
  const fromUrl = new URLSearchParams(window.location.search).get("step") as StepKey | null;
  if (fromUrl && STEPS.some((s) => s.key === fromUrl) && unlocked(ws, fromUrl)) return fromUrl;
  if (!done(ws, "inputs")) return "inputs";
  if (!ws.analysis) return "analysis";
  if (!ws.optimization) return "gaps";
  if (!ws.coverLetter) return "optimize";
  return "review";
}

export function Studio({ id }: { id: string }) {
  const state = useWorkspaceState(id);
  const { ws, loadError } = state;
  const [step, setStep] = useState<StepKey | null>(null);
  // Once loaded, open the step that matches their progress (set once, during render).
  if (ws && step === null) setStep(initialStep(ws));

  const go = (k: StepKey) => {
    setStep(k);
    const url = new URL(window.location.href);
    url.searchParams.set("step", k);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ctx = useMemo(
    () =>
      ws
        ? { ws, aiConfigured: state.aiConfigured, save: state.save, run: state.run, refresh: state.refresh, busy: state.busy, error: state.error, setError: state.setError, saving: state.saving }
        : null,
    [ws, state.aiConfigured, state.save, state.run, state.refresh, state.busy, state.error, state.setError, state.saving],
  );

  if (loadError)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert kind="error" title="Couldn’t open this application">
          {loadError} <Link className="underline" href="/studio">Back to applications</Link>
        </Alert>
      </div>
    );
  if (!ctx || !step)
    return (
      <div className="px-8 py-12">
        <Spinner label="Loading application…" />
      </div>
    );

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className="border-b border-line bg-paper/95">
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-8">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Link href="/studio" className="inline-flex items-center gap-1 hover:text-ink">
              <ChevronLeft className="size-4" /> Applications
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate text-ink-2">{ctx.ws.title}</span>
            {ctx.saving && <span className="ml-auto text-xs">Saving…</span>}
          </div>
          <Tabs
            value={step}
            onChange={(_, v) => go(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            aria-label="Studio steps"
            sx={{ mt: 2, minHeight: 44, "& .MuiTabs-indicator": { height: 3, borderRadius: 2 } }}
          >
            {STEPS.map((s, i) => {
              const open = unlocked(ctx.ws, s.key);
              const isDone = done(ctx.ws, s.key);
              const active = s.key === step;
              return (
                <Tab
                  key={s.key}
                  value={s.key}
                  disabled={!open}
                  iconPosition="start"
                  icon={
                    <span
                      className={cx(
                        "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                        isDone ? "bg-brand text-white" : active ? "bg-ink text-white" : "bg-black/[0.06] text-muted",
                      )}
                      aria-hidden
                    >
                      {isDone ? <Check className="size-3" /> : !open ? <Lock className="size-2.5" /> : i + 1}
                    </span>
                  }
                  label={
                    <>
                      <span className="hidden sm:inline">{s.label}</span>
                      <span className="sm:hidden">{s.short}</span>
                    </>
                  }
                  aria-label={`${s.label}${isDone ? " (done)" : !open ? " (locked)" : ""}`}
                  sx={{ minHeight: 44, px: 1.5, gap: 1, color: "var(--muted)", "&.Mui-selected": { color: "var(--ink)", fontWeight: 600 } }}
                />
              );
            })}
          </Tabs>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {ctx.error && (
          <Alert kind="error" className="mb-6" title="Something didn’t work">
            {ctx.error}{" "}
            <button className="ml-1 underline" onClick={() => ctx.setError(null)}>
              Dismiss
            </button>
          </Alert>
        )}
        {step === "inputs" && <StepInputs onNext={() => go("analysis")} />}
        {step === "analysis" && <StepAnalysis onNext={() => go("gaps")} />}
        {step === "gaps" && <StepGaps onNext={() => go("optimize")} />}
        {step === "optimize" && <StepOptimize onNext={() => go("cover")} />}
        {step === "cover" && <StepCoverLetter onNext={() => go("review")} />}
        {step === "review" && <StepReview />}
      </div>
    </WorkspaceContext.Provider>
  );
}
