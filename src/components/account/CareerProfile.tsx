"use client";

import Skeleton from "@mui/material/Skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, UserRound } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { UserProfile } from "@/lib/types";
import { DocumentInput } from "../studio/DocumentInput";
import { BlurField, EXTRA_FIELDS } from "../studio/fields";
import { Alert, Card } from "../ui";
import { useAccount } from "./AccountProvider";

/** The user's private master career profile, reused for every new application. */
export function CareerProfile() {
  const { me, refresh } = useAccount();
  const [p, setP] = useState<UserProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ profile: UserProfile }>("/api/profile")
      .then((r) => setP(r.profile))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  async function save(patch: Record<string, unknown>) {
    setErr(null);
    try {
      const r = await api<{ profile: UserProfile }>("/api/profile", { method: "PUT", body: patch });
      setP(r.profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if ("masterResumeConfirmed" in patch || "masterResume" in patch || "displayName" in patch) await refresh();
    } catch (e) {
      setErr(errorMessage(e));
      throw e;
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Career Profile</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your master profile</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Keep your up-to-date resume and career details here once. Every new application in Resume Studio starts from it, and Job Explorer and the Dashboard
        can rank jobs against it. Only you can see it.
      </p>

      {err && (
        <Alert kind="error" className="mt-5">
          {err}
        </Alert>
      )}
      <div aria-live="polite" className="sr-only">
        {saved ? "Saved" : ""}
      </div>

      {!p ? (
        <div className="mt-6 space-y-4">
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={320} />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <UserRound className="size-5 text-brand" aria-hidden />
              <p className="font-medium">About you</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <BlurField id="pf-name" label="Display name" value={p.displayName} onSave={(displayName) => void save({ displayName }).catch(() => undefined)} />
              <div>
                <p className="mb-1 text-sm font-medium text-ink-2">Email</p>
                <p className="py-2 text-sm text-muted">{me?.mode === "local" ? "Local mode (no account)" : p.email || me?.user.email}</p>
              </div>
            </div>
          </Card>

          {p.masterResumeConfirmed ? (
            <Alert kind="success" title="Your master resume is confirmed">
              New applications in <Link href="/studio" className="underline">Resume Studio</Link> start from it, and it appears as “My master profile” in Job
              Explorer and Match Analysis.
            </Alert>
          ) : (
            <Alert kind="info" title="Add and confirm your resume">
              Upload or paste your current resume, check the extracted text, correct anything that was read wrongly, then confirm it. Nothing is used until you
              confirm.
            </Alert>
          )}

          <DocumentInput
            id="master-resume"
            purpose="master-resume"
            title="Master resume"
            description="PDF, Word (.docx) or pasted text. Edit it here any time; no need to upload again."
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            aiConfigured={Boolean(me?.aiConfigured)}
            value={{ text: p.masterResume, confirmed: p.masterResumeConfirmed, source: p.masterResume ? { method: "paste" } : undefined }}
            onSave={(v) => save({ masterResume: v.text, masterResumeConfirmed: v.confirmed })}
          />

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <FileText className="mt-0.5 size-5 text-brand" aria-hidden />
              <div>
                <p className="font-medium">Additional professional information</p>
                <p className="text-sm text-muted">
                  True details that aren’t in your resume. AI suggestions may draw on them but never go beyond them. Changes save when you leave a field.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {EXTRA_FIELDS.map((f) => (
                <BlurField
                  key={f.key}
                  id={`pf-extra-${f.key}`}
                  label={f.label}
                  multiline
                  rows={4}
                  placeholder={f.placeholder}
                  value={p.masterExtra[f.key]}
                  onSave={(v) => void save({ masterExtra: { [f.key]: v } }).catch(() => undefined)}
                />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
