"use client";

import { useState } from "react";
import { ArrowRight, Building2, ChevronDown, Download, UserRound } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Alert, Button, Card, SectionTitle } from "../ui";
import { BlurField, EXTRA_FIELDS } from "./fields";
import { DocumentInput } from "./DocumentInput";
import { ResumeTemplatePicker } from "./ResumeTemplatePicker";
import { useWs } from "./useWorkspace";

export function StepInputs({ onNext }: { onNext: () => void }) {
  const { ws, save, aiConfigured } = useWs();
  const i = ws.inputs;
  const [showExtra, setShowExtra] = useState(Object.values(i.extra).some((v) => v.trim()));
  const [pageBusy, setPageBusy] = useState(false);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  async function saveToProfile() {
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      await api("/api/profile", {
        method: "PUT",
        body: { ...(i.resumeConfirmed && i.resumeText.trim() ? { masterResume: i.resumeText, masterResumeConfirmed: true } : {}), mergeExtra: i.extra },
      });
      setProfileMsg({
        kind: "success",
        text: i.resumeConfirmed ? "Saved your resume and additional information to your Career Profile." : "Saved your additional information to your Career Profile. Confirm the resume to save it too.",
      });
    } catch (e) {
      setProfileMsg({ kind: "error", text: errorMessage(e) });
    } finally {
      setProfileBusy(false);
    }
  }
  const ready = i.resumeConfirmed && i.jobConfirmed;

  async function fetchCompanyPage() {
    setPageBusy(true);
    setPageErr(null);
    try {
      const r = await api<{ text: string }>("/api/extract-url", { body: { url: i.company.url } });
      await save({ inputs: { company: { pageText: r.text } } });
    } catch (e) {
      setPageErr(errorMessage(e));
    } finally {
      setPageBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle eyebrow="Step 1" title="Add your documents">
        Upload or paste your resume and the job description. We extract the text and show it to you first. Fix anything that was misread, then
        confirm both before the analysis runs.
      </SectionTitle>

      <div className="mb-6 max-w-md">
        <BlurField id="title" label="Application name" value={ws.title} onSave={(title) => save({ title })} />
      </div>

      {!aiConfigured && (
        <Alert kind="warning" className="mb-6" title="AI is not configured">
          You can upload and confirm documents now, but analysis and rewriting need AI, which isn’t set up on this server yet. The administrator adds{" "}
          <code>ANTHROPIC_API_KEY</code> to the server environment.
        </Alert>
      )}
      {ws.optimization && (
        <Alert kind="info" className="mb-6">
          Changing the resume text will discard the current resume suggestions and your decisions on them, because they refer to specific lines.
        </Alert>
      )}

      <ResumeTemplatePicker />

      <div className="grid gap-5 lg:grid-cols-2">
        <DocumentInput
          id="resume"
          purpose="resume"
          title="Your resume"
          description="PDF, Word (.docx) or pasted text."
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          aiConfigured={aiConfigured}
          value={{ text: i.resumeText, confirmed: i.resumeConfirmed, source: i.resumeSource }}
          onSave={(v) => save({ inputs: { resumeText: v.text, resumeConfirmed: v.confirmed, resumeSource: v.source } })}
        />
        <DocumentInput
          id="job"
          purpose="job"
          title="Job description"
          description="Paste it, upload a PDF/DOCX, a screenshot, or fetch a link."
          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
          allowUrl
          aiConfigured={aiConfigured}
          value={{ text: i.jobText, confirmed: i.jobConfirmed, source: i.jobSource }}
          onSave={(v) => save({ inputs: { jobText: v.text, jobConfirmed: v.confirmed, jobSource: v.source } })}
        />
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <BlurField id="role" label="Target role" hint="optional" placeholder="e.g. Junior Data Analyst" value={i.targetRole} onSave={(targetRole) => save({ inputs: { targetRole } })} />
          <BlurField
            id="industry"
            label="Target industry"
            hint="optional"
            placeholder="e.g. Healthcare analytics"
            value={i.targetIndustry}
            onSave={(targetIndustry) => save({ inputs: { targetIndustry } })}
          />
        </div>
      </Card>

      <Card className="mt-5">
        <button className="flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6" onClick={() => setShowExtra((s) => !s)} aria-expanded={showExtra}>
          <UserRound className="size-5 text-brand" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Additional professional information</p>
            <p className="text-sm text-muted">Anything true about you that isn’t in the resume. The AI may use it; it won’t invent anything beyond it.</p>
          </div>
          <ChevronDown className={`size-5 text-muted transition-transform ${showExtra ? "rotate-180" : ""}`} />
        </button>
        {showExtra && (
          <div className="grid gap-4 border-t border-line px-5 py-5 sm:grid-cols-2 sm:px-6">
            {EXTRA_FIELDS.map((f) => (
              <BlurField
                key={f.key}
                id={`extra-${f.key}`}
                label={f.label}
                multiline
                placeholder={f.placeholder}
                value={i.extra[f.key]}
                onSave={(v) => save({ inputs: { extra: { [f.key]: v } } })}
              />
            ))}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button size="sm" variant="ghost" onClick={saveToProfile} loading={profileBusy} disabled={!i.resumeConfirmed && !Object.values(i.extra).some((v) => v.trim())}>
                Save to my Career Profile
              </Button>
              <span className="text-xs text-muted">Reuse this resume and information for future applications.</span>
              {profileMsg && (
                <Alert kind={profileMsg.kind} className="w-full">
                  {profileMsg.text}
                </Alert>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <Building2 className="size-5 text-brand" aria-hidden />
          <div>
            <p className="font-medium">Company information</p>
            <p className="text-sm text-muted">Optional. Used to make the cover letter specific. Only facts you provide here are mentioned.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <BlurField id="company-name" label="Company name" value={i.company.name} onSave={(name) => save({ inputs: { company: { name } } })} />
          <div>
            <BlurField id="company-url" label="Company or job link" value={i.company.url} placeholder="https://…" onSave={(url) => save({ inputs: { company: { url } } })} />
            <Button size="sm" variant="ghost" className="mt-1.5" onClick={fetchCompanyPage} loading={pageBusy} disabled={!i.company.url.trim()} icon={<Download className="size-3.5" />}>
              Read page text
            </Button>
          </div>
          <div className="sm:col-span-2">
            <BlurField
              id="company-notes"
              label="What you know about the company"
              hint="mission, products, recent news, why you’re interested"
              multiline
              value={i.company.notes}
              onSave={(notes) => save({ inputs: { company: { notes } } })}
            />
          </div>
          {pageErr && (
            <Alert kind="error" className="sm:col-span-2">
              {pageErr}
            </Alert>
          )}
          {i.company.pageText && (
            <div className="sm:col-span-2">
              <BlurField
                id="company-page"
                label="Text from the link"
                hint="review and delete anything irrelevant"
                multiline
                rows={8}
                value={i.company.pageText}
                onSave={(pageText) => save({ inputs: { company: { pageText } } })}
              />
            </div>
          )}
        </div>
      </Card>

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
        {!ready && <p className="text-sm text-muted">Confirm both documents to continue.</p>}
        <Button variant="primary" disabled={!ready} onClick={onNext} icon={<ArrowRight className="size-4" />}>
          Continue to analysis
        </Button>
      </div>
    </div>
  );
}
