"use client";

import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useRef, useState } from "react";
import { CheckCircle2, ClipboardPaste, FileUp, Link2, ScanText, Sparkles } from "lucide-react";
import { api, errorMessage, upload } from "@/lib/client/api";
import type { SourceInfo } from "@/lib/types";
import { Alert, Badge, Button, Card, Input, Textarea, cx, useDraft } from "../ui";

interface ExtractResponse {
  text: string;
  method: SourceInfo["method"];
  warnings: string[];
  canRetryWithAi: boolean;
  fileName: string;
}

const METHOD_LABEL: Record<SourceInfo["method"], string> = {
  paste: "Pasted",
  "pdf-text": "PDF text",
  docx: "Word document",
  "ocr-tesseract": "OCR (on-device)",
  "ocr-ai": "AI OCR",
  url: "From link",
  "text-file": "Text file",
  profile: "From Career Profile",
};

export interface DocumentValue {
  text: string;
  confirmed: boolean;
  source?: SourceInfo;
}

export function DocumentInput({
  id,
  title,
  description,
  value,
  allowUrl,
  aiConfigured,
  accept,
  onSave,
  purpose = "other",
}: {
  id: string;
  title: string;
  description: string;
  value: DocumentValue;
  allowUrl?: boolean;
  aiConfigured: boolean;
  accept: string;
  onSave: (v: DocumentValue) => Promise<unknown>;
  /** Stored with the original file (resume, job, master-resume). */
  purpose?: "resume" | "job" | "master-resume" | "other";
}) {
  // Keep local text in sync if the server copy changes (e.g. after another save).
  const [text, setText] = useDraft(value.text);
  const [source, setSource] = useState<SourceInfo | undefined>(value.source);
  const [mode, setMode] = useState<"upload" | "paste" | "url">(value.text ? "paste" : "upload");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [canRetryAi, setCanRetryAi] = useState(false);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = text !== value.text;
  const confirmed = value.confirmed && !dirty;

  async function extract(file: File, engine?: "ai") {
    setErr(null);
    setBusy(engine === "ai" ? "Reading with AI OCR…" : /\.(png|jpe?g|webp|gif)$/i.test(file.name) ? "Running OCR on the image…" : "Extracting text…");
    try {
      const form = new FormData();
      form.append("file", file);
      if (engine) form.append("engine", engine);
      form.append("purpose", purpose);
      // A re-read of the same file with AI OCR doesn't store a second copy.
      if (engine === "ai") form.append("keep", "0");
      const r = await upload<ExtractResponse>("/api/extract", form);
      setText(r.text);
      const src: SourceInfo = { method: r.method, fileName: r.fileName, warnings: r.warnings };
      setSource(src);
      setCanRetryAi(r.canRetryWithAi);
      setLastFile(file);
      setMode("paste");
      await onSave({ text: r.text, confirmed: false, source: src });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function fetchUrl() {
    setErr(null);
    setBusy("Fetching the page…");
    try {
      const r = await api<{ text: string }>("/api/extract-url", { body: { url } });
      setText(r.text);
      const src: SourceInfo = { method: "url", fileName: url, warnings: ["Web pages include navigation and unrelated text. Delete everything that isn’t the job description."] };
      setSource(src);
      setMode("paste");
      await onSave({ text: r.text, confirmed: false, source: src });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (f) void extract(f);
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
        {value.text &&
          (confirmed ? (
            <Badge tone="add">
              <CheckCircle2 className="size-3.5" /> Confirmed
            </Badge>
          ) : (
            <Badge tone="warn">Needs confirmation</Badge>
          ))}
      </div>

      <Tabs value={mode} onChange={(_, v) => setMode(v)} variant="fullWidth" aria-label={`${title} input method`} sx={{ mt: 2, minHeight: 40, borderBottom: 1, borderColor: "divider" }}>
        {(
          [
            ["upload", "Upload", FileUp],
            ["paste", text ? "Text" : "Paste", ClipboardPaste],
            ...(allowUrl ? [["url", "Link", Link2] as const] : []),
          ] as const
        ).map(([k, label, Icon]) => (
          <Tab key={k} value={k} label={label} icon={<Icon className="size-4" aria-hidden />} iconPosition="start" sx={{ minHeight: 40, gap: 0.75 }} />
        ))}
      </Tabs>

      {err && (
        <Alert kind="error" className="mt-4">
          {err}
        </Alert>
      )}

      {mode === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFiles(e.dataTransfer.files);
          }}
          className={cx(
            "mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
            drag ? "border-brand bg-brand-soft/50" : "border-line-strong bg-surface-2",
          )}
        >
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <ScanText className="size-4 animate-pulse text-brand" /> {busy}
            </p>
          ) : (
            <>
              <FileUp className="size-6 text-muted" aria-hidden />
              <p className="mt-2 text-sm text-ink-2">Drop a file here, or</p>
              <Button className="mt-2" size="sm" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <p className="mt-3 text-xs text-muted">{accept.includes("image") ? "PDF, DOCX, PNG, JPEG or screenshot" : "PDF, DOCX or TXT"} · max 4 MB · the original is kept privately in your account</p>
            </>
          )}
          <input
            id={`${id}-file`}
            ref={fileRef}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {mode === "url" && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.com/careers/job-123" type="url" aria-label="Job posting link" />
            <Button onClick={fetchUrl} loading={busy !== null} disabled={!url.trim()}>
              Fetch
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Works for most company career pages. Sites that require sign-in (e.g. LinkedIn) block this; paste the text instead.
          </p>
        </div>
      )}

      {mode === "paste" && (
        <div className="mt-4 flex flex-1 flex-col">
          {source && source.method !== "paste" && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge>{METHOD_LABEL[source.method]}</Badge>
              {source.fileName && <span className="max-w-[16rem] truncate">{source.fileName}</span>}
              {canRetryAi && lastFile && aiConfigured && (
                <button onClick={() => extract(lastFile, "ai")} className="inline-flex items-center gap-1 font-medium text-brand hover:underline" disabled={busy !== null}>
                  <Sparkles className="size-3.5" /> {busy ?? "Re-read with AI OCR"}
                </button>
              )}
            </div>
          )}
          {source?.warnings?.map((w) => (
            <Alert key={w} kind="warning" className="mb-2">
              {w}
            </Alert>
          ))}
          <Textarea
            id={`${id}-text`}
            aria-label={`${title} text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (dirty) void onSave({ text, confirmed: false, source: source ?? { method: "paste" } });
            }}
            placeholder={allowUrl ? "Paste the full job description…" : "Paste your resume text…"}
            className="min-h-[340px] flex-1 font-mono text-[13px]"
            spellCheck
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {words} words{!confirmed && text.trim() ? " · Check the text, fix any extraction errors, then confirm." : ""}
            </p>
            <Button
              variant={confirmed ? "secondary" : "primary"}
              size="sm"
              disabled={!text.trim() || confirmed}
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => onSave({ text, confirmed: true, source: source ?? { method: "paste" } })}
            >
              {confirmed ? "Confirmed" : "Text is correct — confirm"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
