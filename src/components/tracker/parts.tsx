"use client";

import type { KeyboardEvent } from "react";
import type { StatusColor, StatusDef, VersionOption, DocRef } from "@/lib/tracker/types";
import { cx, useDraft } from "../ui";

export const COLOR_CLASS: Record<StatusColor, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-300",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  gray: "bg-gray-100 text-gray-600 ring-gray-300",
};
export const COLOR_DOT: Record<StatusColor, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  green: "bg-green-600",
  red: "bg-red-500",
  gray: "bg-gray-400",
};

export function StatusBadge({ status, statuses }: { status: string; statuses: StatusDef[] }) {
  const s = statuses.find((x) => x.id === status);
  if (!s) return <span className="text-xs text-muted">{status}</span>;
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", COLOR_CLASS[s.color])}>
      <span className={cx("size-1.5 rounded-full", COLOR_DOT[s.color])} aria-hidden />
      {s.label}
    </span>
  );
}

export function StatusSelect({ value, statuses, onChange, label, className }: { value: string; statuses: StatusDef[]; onChange: (v: string) => void; label: string; className?: string }) {
  const s = statuses.find((x) => x.id === value);
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx("h-7 rounded-full border-0 py-0 pl-2.5 pr-7 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-brand", s ? COLOR_CLASS[s.color] : "", className)}
    >
      {statuses.map((st) => (
        <option key={st.id} value={st.id}>
          {st.label}
        </option>
      ))}
    </select>
  );
}

const cellBase = "h-9 w-full min-w-0 border-0 bg-transparent px-2 text-[13px] text-ink placeholder:text-muted/50 hover:bg-black/[0.03] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand";

/** Spreadsheet cell: edits locally, saves on Enter/blur, Escape reverts. */
export function TextCell({ value, onSave, label, placeholder, type = "text", className }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; type?: "text" | "url"; className?: string }) {
  const [v, setV] = useDraft(value);
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setV(value);
      setTimeout(() => (e.target as HTMLInputElement).blur(), 0);
    }
  };
  return (
    <input
      aria-label={label}
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={keys}
      onBlur={() => v !== value && onSave(v.trim())}
      className={cx(cellBase, className)}
      title={v}
    />
  );
}

export function DateCell({ value, onSave, label, withTime }: { value: string; onSave: (v: string) => void; label: string; withTime?: boolean }) {
  return (
    <input
      aria-label={label}
      type={withTime ? "datetime-local" : "date"}
      value={value}
      onChange={(e) => onSave(e.target.value)}
      className={cx(cellBase, "pr-1 tabular-nums", !value && "text-muted/60")}
    />
  );
}

export function SelectCell({ value, options, onSave, label }: { value: string; options: Record<string, string>; onSave: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onSave(e.target.value)} className={cx(cellBase, "pr-6", !value && "text-muted/60")}>
      <option value="">—</option>
      {Object.entries(options).map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Choose a Library document / Studio application, or keep a free-text label. */
export function VersionCell({ value, versions, kind, onSave, label }: { value: DocRef | null; versions: VersionOption[]; kind: "resume" | "cover_letter"; onSave: (v: DocRef | null) => void; label: string }) {
  const opts = versions.filter((o) => o.kind === kind || o.kind === "both");
  const current = value?.ref ?? (value ? "__text" : "");
  return (
    <select
      aria-label={label}
      value={current}
      onChange={(e) => {
        const ref = e.target.value;
        if (!ref) return onSave(null);
        if (ref === "__new") {
          const t = prompt(`Name this ${kind === "resume" ? "resume" : "cover letter"} version`);
          if (t?.trim()) onSave({ ref: "", label: t.trim().slice(0, 200) });
          return;
        }
        const o = opts.find((x) => x.ref === ref);
        if (o) onSave({ ref: o.ref, label: o.label });
      }}
      className={cx(cellBase, "pr-6", !value && "text-muted/60")}
      title={value?.label}
    >
      <option value="">—</option>
      {value && !value.ref && <option value="__text">{value.label}</option>}
      {value?.ref && !opts.some((o) => o.ref === value.ref) && <option value={value.ref}>{value.label} (deleted)</option>}
      {opts.map((o) => (
        <option key={o.ref} value={o.ref}>
          {o.label}
        </option>
      ))}
      <option value="__new">Other (type a name)…</option>
    </select>
  );
}

export function versionHref(ref: string | undefined): string | null {
  if (!ref) return null;
  const [kind, id] = ref.split(":");
  if (kind === "workspace") return `/studio/${id}`;
  if (kind === "library") return `/library`;
  return null;
}

export function formatDate(s: string): string {
  if (!s) return "";
  const d = new Date(s.length === 10 ? `${s}T00:00` : s);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", ...(s.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
