"use client";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import { useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/client/api";
import type { LibraryItem, LibraryKind } from "@/lib/types";
import { Alert, Button, Input, Label } from "../ui";

type Conflict = { code: "limit" | "name_exists" | "confirm_overwrite"; message: string; existing: { id: string; title: string }[] };

/** What to save: pasted/edited content, a Studio application's final document, a starter, or a duplicate. */
export type TemplateSource = { content: string } | { fromWorkspaceId: string } | { starter: string } | { duplicateOf: string };

/**
 * Save a reusable template. Handles the three overwrite situations explicitly:
 * same name exists, the 3-template limit is reached, and confirming the replacement.
 */
export function SaveTemplateDialog({
  open,
  kind,
  source,
  defaultName,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: LibraryKind;
  source: TemplateSource;
  defaultName: string;
  onClose: () => void;
  onSaved: (item: LibraryItem) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [replaceId, setReplaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = kind === "resume" ? "resume" : "cover letter";

  async function submit(opts: { replaceId?: string; confirmOverwrite?: boolean } = {}) {
    setBusy(true);
    setErr(null);
    try {
      const r =
        "duplicateOf" in source
          ? await api<{ item: LibraryItem }>(`/api/library/${source.duplicateOf}/actions`, { body: { action: "duplicate", name, ...opts } })
          : await api<{ item: LibraryItem }>("/api/library", { body: { action: "template", kind, name, ...source, ...opts } });
      setConflict(null);
      onSaved(r.item);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details.code) {
        const c = { code: e.details.code, message: e.message, existing: (e.details.existing as Conflict["existing"]) ?? [] } as Conflict;
        setConflict(c);
        setReplaceId(c.code === "name_exists" ? c.existing[0]?.id ?? "" : "");
      } else setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const target = conflict?.existing.find((x) => x.id === replaceId);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="save-template-title">
      <DialogTitle id="save-template-title">{"duplicateOf" in source ? `Duplicate ${label} template` : `Save as a reusable ${label} template`}</DialogTitle>
      <DialogContent>
        {!conflict ? (
          <form
            id="save-template-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-3 pt-1"
          >
            <div>
              <Label htmlFor="tpl-name">Template name</Label>
              <Input id="tpl-name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "resume" ? "e.g. Data Analyst" : "e.g. General cover letter"} />
            </div>
            <p className="text-xs text-muted">You can keep up to three {label} templates. Documents made for a specific application are stored with that application instead.</p>
          </form>
        ) : (
          <div className="space-y-3 pt-1">
            <Alert kind="warning" title={conflict.code === "limit" ? "Template limit reached" : "Overwrite a saved template?"}>
              {conflict.message}
            </Alert>
            {conflict.code === "limit" && (
              <RadioGroup value={replaceId} onChange={(e) => setReplaceId(e.target.value)} aria-label="Template to replace">
                {conflict.existing.map((x) => (
                  <FormControlLabel key={x.id} value={x.id} control={<Radio size="small" />} label={`Replace “${x.title}”`} />
                ))}
              </RadioGroup>
            )}
            {target && (
              <p className="text-sm text-ink-2">
                “{target.title}” will be permanently replaced by <strong className="font-medium">“{name}”</strong>. This can’t be undone.
              </p>
            )}
          </div>
        )}
        {err && <Alert kind="error" className="mt-3">{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {conflict ? (
          <>
            <Button onClick={() => setConflict(null)}>{conflict.code === "name_exists" ? "Choose another name" : "Back"}</Button>
            <Button variant="danger" loading={busy} disabled={!replaceId} onClick={() => submit({ replaceId, confirmOverwrite: true })}>
              Overwrite template
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form="save-template-form" loading={busy} disabled={!name.trim()}>
              Save template
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
