"use client";

import Dialog from "@mui/material/Dialog";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { errorMessage } from "@/lib/client/api";
import { DEFAULT_STATUSES, GROUP_LABEL, type StatusColor, type StatusDef, type StatusGroup, type TrackerEntry } from "@/lib/tracker/types";
import { Alert, Button, Input, cx, Select } from "../ui";
import { COLOR_DOT } from "./parts";

const COLORS = Object.keys(COLOR_DOT) as StatusColor[];

export function StatusEditor({ statuses, entries, onSave, onClose }: { statuses: StatusDef[]; entries: TrackerEntry[]; onSave: (list: StatusDef[], reassign: Record<string, string>) => Promise<void>; onClose: () => void }) {
  const [list, setList] = useState<StatusDef[]>(statuses.map((s) => ({ ...s })));
  const [reassign, setReassign] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const removed = statuses.filter((s) => !list.some((x) => x.id === s.id));
  const usage = (id: string) => entries.filter((e) => e.status === id).length;
  const set = (i: number, p: Partial<StatusDef>) => setList((l) => l.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) =>
    setList((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x);
      return n;
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="status-editor-title">
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="status-editor-title" className="font-display text-xl font-semibold">Customize statuses</h2>
            <p className="text-xs text-muted">Each status belongs to a group, which is how the statistics count it.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-black/5" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {list.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-2 py-2">
              <div className="flex flex-col">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${s.label} up`}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${s.label} down`}>
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              <Input aria-label="Status name" value={s.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} className="h-9 w-40 flex-1" />
              <Select aria-label={`Group for ${s.label}`} value={s.group} onChange={(e) => set(i, { group: e.target.value as StatusGroup })} >
                {Object.entries(GROUP_LABEL).map(([g, l]) => (
                  <option key={g} value={g}>
                    {l}
                  </option>
                ))}
              </Select>
              <div className="flex gap-1" role="radiogroup" aria-label={`Color for ${s.label}`}>
                {COLORS.map((c) => (
                  <button key={c} role="radio" aria-checked={s.color === c} aria-label={c} onClick={() => set(i, { color: c })} className={cx("size-5 rounded-full ring-offset-2", COLOR_DOT[c], s.color === c && "ring-2 ring-ink")} />
                ))}
              </div>
              <button onClick={() => setList((l) => l.filter((_, j) => j !== i))} disabled={list.length === 1} className="rounded p-1.5 text-muted hover:bg-del-bg hover:text-del-ink disabled:opacity-30" aria-label={`Remove ${s.label}`}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="size-3.5" />}
            onClick={() => setList((l) => [...l, { id: `custom-${Date.now().toString(36)}`, label: "New status", group: "in_process", color: "teal" }])}
          >
            Add status
          </Button>

          {removed.filter((r) => usage(r.id) > 0).map((r) => (
            <Alert key={r.id} kind="warning" title={`“${r.label}” is used by ${usage(r.id)} application(s)`}>
              Move them to:{" "}
              <Select aria-label={`Move ${r.label} applications to`} value={reassign[r.id] ?? ""} onChange={(e) => setReassign({ ...reassign, [r.id]: e.target.value })} >
                <option value="">Choose…</option>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Alert>
          ))}
          {err && <Alert kind="error">{err}</Alert>}
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => setList(DEFAULT_STATUSES.map((s) => ({ ...s })))}>
            Restore defaults
          </Button>
          <div className="flex gap-2">
            <Button size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await onSave(list.map((s) => ({ ...s, label: s.label.trim() })), reassign);
                  onClose();
                } catch (e) {
                  setErr(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save statuses
            </Button>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}
