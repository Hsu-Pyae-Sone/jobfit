"use client";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useEffect, useState } from "react";
import { Download, FileArchive, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { UploadMeta } from "@/lib/types";
import { Alert, Button, Input, Label } from "../ui";
import { AiDataNotice, useAccount } from "./AccountProvider";

const PURPOSE_LABEL: Record<string, string> = { resume: "Resume", job: "Job description", "master-resume": "Master resume", other: "Upload" };
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** AI permission: shows what is shared and lets the user allow or withdraw it. */
export function AiConsentControl() {
  const { me, askConsent, setConsent } = useAccount();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!me) return null;

  async function withdraw() {
    setBusy(true);
    setErr(null);
    try {
      await setConsent(false);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line p-4">
      {me.aiConsentAt ? (
        <>
          <p className="text-sm">
            You allowed AI processing on {new Date(me.aiConsentAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. Up to{" "}
            {me.aiDailyLimit} AI requests per day; repeated identical requests reuse stored results and don’t count.
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={withdraw} loading={busy}>
            Withdraw permission
          </Button>
        </>
      ) : (
        <>
          <AiDataNotice />
          <Button size="sm" variant="primary" className="mt-3" onClick={() => void askConsent()}>
            Review and allow AI processing
          </Button>
        </>
      )}
      {err && (
        <Alert kind="error" className="mt-2">
          {err}
        </Alert>
      )}
    </div>
  );
}

/** Uploaded originals, data export and account deletion. */
export function YourData() {
  const { me } = useAccount();
  const [files, setFiles] = useState<UploadMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    api<{ files: UploadMeta[] }>("/api/account/files")
      .then((r) => setFiles(r.files))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  async function removeFile(f: UploadMeta) {
    setErr(null);
    try {
      await api(`/api/account/files/${f.id}`, { method: "DELETE" });
      setFiles((cur) => cur?.filter((x) => x.id !== f.id) ?? null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ signedOut: boolean }>("/api/account/delete", { body: { confirm: confirmText } });
      if (r.signedOut) {
        window.location.href = new URL("/login", window.location.origin).href;
        return;
      }
      setDeleting(false);
      setConfirmText("");
      setFiles([]);
      setDone("All locally stored data was deleted.");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const local = me?.mode === "local";

  return (
    <div className="space-y-5">
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
        {local ? (
          <li>Local mode: everything is stored on this computer (./data). Use a Supabase project for the shared beta.</li>
        ) : (
          <li>Your profile, applications, documents and files are stored in your private account. Database rules prevent other accounts from reading them.</li>
        )}
        <li>Text is sent to the AI provider only when you start an AI feature, after you’ve allowed it (see AI above).</li>
        <li>Jobfit never submits job applications on your behalf.</li>
      </ul>

      {done && <Alert kind="success">{done}</Alert>}
      {err && <Alert kind="error">{err}</Alert>}

      <div>
        <h3 className="text-sm font-semibold">Uploaded files</h3>
        <p className="text-xs text-muted">Originals of files you uploaded, kept privately. Deleting one doesn’t change the text you already confirmed.</p>
        {files === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : files.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No files stored.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={f.fileName}>
                  {f.fileName}
                </span>
                <span className="text-xs text-muted">
                  {PURPOSE_LABEL[f.purpose] ?? "Upload"} · {size(f.size)} · {new Date(f.createdAt).toLocaleDateString()}
                </span>
                <a href={`/api/account/files/${f.id}`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline" aria-label={`Download ${f.fileName}`}>
                  <Download className="size-3.5" /> Download
                </a>
                <button className="inline-flex items-center gap-1 text-xs text-del-ink hover:underline" onClick={() => removeFile(f)} aria-label={`Delete ${f.fileName}`}>
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/account/export"
          className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          download
        >
          <FileArchive className="size-4" /> Export all my data (.zip)
        </a>
        <Button variant="danger" size="sm" onClick={() => setDeleting(true)} icon={<Trash2 className="size-4" />}>
          {local ? "Delete all local data" : "Delete my account"}
        </Button>
      </div>

      <Dialog open={deleting} onClose={() => setDeleting(false)} maxWidth="xs" fullWidth aria-labelledby="delete-account-title">
        <DialogTitle id="delete-account-title">{local ? "Delete all local data?" : "Delete your account?"}</DialogTitle>
        <DialogContent>
          <p className="text-sm text-ink-2">
            Your profile, applications, match analyses, tracker entries, saved documents and uploaded files are permanently deleted
            {local ? "" : ", and you’ll be signed out"}. This can’t be undone. Export your data first if you want a copy.
          </p>
          <div className="mt-4">
            <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
            <Input id="delete-confirm" value={confirmText} autoComplete="off" onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          {err && (
            <Alert kind="error" className="mt-3">
              {err}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" disabled={confirmText !== "DELETE"} loading={busy} onClick={deleteAccount}>
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
