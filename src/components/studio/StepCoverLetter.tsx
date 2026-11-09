"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { checkClaims, hasClaimRisk } from "@/lib/claims";
import { coverLetterCorpus } from "@/lib/facts";
import type { CoverParagraph, LibraryItem, Tone } from "@/lib/types";
import { Alert, Button, Card, Input, SectionTitle, Select, Spinner, Textarea, WorkingPanel, cx, useDraft } from "../ui";
import { SaveDocButtons } from "./SaveDocButtons";
import { useWs } from "./useWorkspace";

const TONES: { key: Tone; label: string; desc: string }[] = [
  { key: "professional", label: "Professional", desc: "Polished and measured." },
  { key: "confident", label: "Confident & engaging", desc: "Warm, energetic, direct." },
  { key: "concise", label: "Concise & direct", desc: "Short and to the point." },
];

function ParagraphEditor({ p, index, all }: { p: CoverParagraph; index: number; all: CoverParagraph[] }) {
  const { ws, save, run, busy } = useWs();
  const [text, setText] = useDraft(p.text);
  const [instr, setInstr] = useState("");
  const [showInstr, setShowInstr] = useState(false);
  const flags = useMemo(() => checkClaims(text, coverLetterCorpus(ws), ws.analysis?.keywords.missing ?? []), [text, ws]);
  const regenerating = busy === "cover-letter/paragraph" && showInstr;

  return (
    <div className="group relative rounded-xl border border-transparent p-1 transition-colors focus-within:border-line hover:border-line">
      <div className="mb-1 flex items-center justify-between gap-2 px-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Paragraph {index + 1}
          {p.purpose && ` · ${p.purpose}`}
        </span>
        <button className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setShowInstr((v) => !v)}>
          <Wand2 className="size-3.5" /> Regenerate
        </button>
      </div>
      <Textarea
        value={text}
        aria-label={`Paragraph ${index + 1}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== p.text) void save({ coverLetter: { paragraphs: all.map((x) => (x.id === p.id ? { id: x.id, text, purpose: x.purpose } : { id: x.id, text: x.text, purpose: x.purpose })) } });
        }}
        rows={Math.max(4, Math.ceil(text.length / 95))}
        className="border-transparent bg-transparent font-[inherit] text-[15px] leading-[1.7] focus:bg-surface"
      />
      {hasClaimRisk(flags) && (
        <p className="mx-2 mb-2 flex items-start gap-1.5 rounded-lg bg-del-bg/60 px-2.5 py-1.5 text-xs text-del-ink">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          <span>
            Not found in your information: {[...flags.unsupportedNumbers, ...flags.newTerms].join(", ")}. Edit or regenerate unless it’s accurate.
          </span>
        </p>
      )}
      {flags.genericPhrases.length > 0 && <p className="mx-2 mb-2 text-xs text-mod-ink">Generic phrasing: {flags.genericPhrases.join(", ")}</p>}
      {showInstr && (
        <div className="mx-2 mb-2 flex flex-col gap-2 sm:flex-row">
          <Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Optional: e.g. focus on my capstone project, make it shorter" maxLength={500} aria-label="Instructions for this paragraph" />
          <Button
            size="sm"
            className="h-10"
            loading={regenerating}
            disabled={busy !== null}
            onClick={async () => {
              if (await run("cover-letter/paragraph", { paragraphId: p.id, instruction: instr })) {
                setInstr("");
                setShowInstr(false);
              }
            }}
          >
            Rewrite paragraph
          </Button>
        </div>
      )}
    </div>
  );
}

function SmallField({ value, onSave, label, className }: { value: string; onSave: (v: string) => void; label: string; className?: string }) {
  const [v, setV] = useDraft(value);
  return (
    <input
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      className={cx("w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[15px] hover:border-line focus:border-brand focus:bg-surface focus:outline-none", className)}
    />
  );
}

export function StepCoverLetter({ onNext }: { onNext: () => void }) {
  const { ws, run, busy, save, aiConfigured, refresh } = useWs();
  const cl = ws.coverLetter;
  const [tone, setTone] = useState<Tone>(cl?.tone ?? "professional");

  async function generate() {
    if (cl && !confirm("Generate a new letter? Your current letter and edits will be replaced.")) return;
    await run("cover-letter", { tone });
  }

  const [templates, setTemplates] = useState<LibraryItem[]>([]);
  const [tplId, setTplId] = useState("");
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ templates: LibraryItem[] }>("/api/library")
      .then((r) => setTemplates(r.templates.filter((t) => t.kind === "cover_letter")))
      .catch(() => setTemplates([]));
  }, []);

  async function startFromTemplate() {
    if (!tplId) return;
    if (cl && !confirm("Replace your current cover letter with this template? Your edits will be lost.")) return;
    setTplMsg(null);
    try {
      await api(`/api/library/${tplId}/actions`, { body: { action: "apply", workspaceId: ws.id, confirmOverwrite: Boolean(cl) } });
      await refresh();
      setTplMsg("Template loaded. Fill in any [placeholders] and edit it to fit this job.");
    } catch (e) {
      setTplMsg(errorMessage(e));
    }
  }

  return (
    <div>
      <SectionTitle eyebrow="Step 5" title="Cover letter">
        Written from your verified experience, the job’s requirements and the company details you provided. Edit any paragraph directly or
        regenerate it on its own.
      </SectionTitle>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <p className="text-sm font-medium">Tone</p>
          <div className="space-y-2" role="radiogroup" aria-label="Tone">
            {TONES.map((t) => (
              <button
                key={t.key}
                role="radio"
                aria-checked={tone === t.key}
                onClick={() => setTone(t.key)}
                className={cx("w-full rounded-xl border px-4 py-3 text-left", tone === t.key ? "border-brand bg-brand-soft/60" : "border-line bg-surface hover:border-line-strong")}
              >
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted">{t.desc}</p>
              </button>
            ))}
          </div>
          <Button variant="primary" className="w-full" onClick={generate} disabled={!aiConfigured || busy !== null} loading={busy === "cover-letter"} icon={cl ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}>
            {cl ? "Generate new letter" : "Generate cover letter"}
          </Button>
          {cl && cl.tone !== tone && <p className="text-xs text-muted">Current letter uses the “{TONES.find((t) => t.key === cl.tone)?.label}” tone.</p>}
          {templates.length > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-sm font-medium">Or start from a saved template</p>
              <Select aria-label="Cover letter template" value={tplId} onChange={(e) => setTplId(e.target.value)}>
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
              <Button size="sm" className="w-full" disabled={!tplId} onClick={startFromTemplate}>
                Use template
              </Button>
              {tplMsg && <p className="text-xs text-brand">{tplMsg}</p>}
            </div>
          )}
          {!ws.inputs.company.name && !ws.inputs.company.notes && (
            <Alert kind="info">Add company information on the Documents step for a more specific letter.</Alert>
          )}
        </div>

        <div>
          {busy === "cover-letter" ? (
            <WorkingPanel title="Writing your cover letter" steps={["Matching your strongest evidence to the role", "Checking every claim against your information"]} />
          ) : !cl ? (
            <Card className="grid min-h-[300px] place-items-center p-8 text-center text-sm text-muted">
              <div>
                <p>Choose a tone and generate your letter.</p>
                <button className="mt-3 font-medium text-brand hover:underline" onClick={onNext}>
                  Skip — review and export the resume only
                </button>
              </div>
            </Card>
          ) : (
            <Card className="px-3 py-6 sm:px-8 sm:py-10">
              <div className="mx-auto max-w-[680px] space-y-3">
                <SmallField label="Greeting" value={cl.greeting} onSave={(greeting) => save({ coverLetter: { greeting } })} className="font-medium" />
                {cl.paragraphs.map((p, i) => (
                  <ParagraphEditor key={p.id} p={p} index={i} all={cl.paragraphs} />
                ))}
                <div className="pt-2">
                  <SmallField label="Closing" value={cl.closing} onSave={(closing) => save({ coverLetter: { closing } })} />
                  <SmallField label="Signature name" value={cl.signatureName} onSave={(signatureName) => save({ coverLetter: { signatureName } })} className="font-medium" />
                </div>
              </div>
              {busy === "cover-letter/paragraph" && (
                <div className="mt-4 text-center">
                  <Spinner label="Rewriting paragraph…" />
                </div>
              )}
            </Card>
          )}
          {cl && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">{cl.paragraphs.map((p) => p.text).join(" ").split(/\s+/).filter(Boolean).length} words in the body</p>
              <div className="flex flex-wrap items-center gap-3">
                <SaveDocButtons workspaceId={ws.id} kind="cover_letter" title={ws.title} />
                <Button variant="primary" size="sm" onClick={onNext}>
                  Final review
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
