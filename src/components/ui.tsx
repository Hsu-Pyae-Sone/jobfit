"use client";

// Shared interface components, built on Material UI. Pages use these wrappers so the whole
// app gets consistent MUI buttons, fields, alerts, chips and progress indicators.

import MuiAlert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button";
import MuiCheckbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import type { ChangeEvent, FocusEvent, KeyboardEvent, ReactNode } from "react";
import { forwardRef, useState } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/**
 * Local editable copy of a saved value. When the saved value changes (e.g. after a save
 * or a regeneration), the draft resets to it - adjusted during render, not in an effect.
 */
export function useDraft<T>(source: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState(source);
  const [prev, setPrev] = useState(source);
  if (!Object.is(prev, source)) {
    setPrev(source);
    setDraft(source);
  }
  return [draft, setDraft];
}

// ---------- Button ----------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const VARIANT: Record<Variant, Pick<MuiButtonProps, "variant" | "color">> = {
  primary: { variant: "contained", color: "primary" },
  secondary: { variant: "outlined", color: "inherit" },
  ghost: { variant: "text", color: "inherit" },
  danger: { variant: "outlined", color: "error" },
  success: { variant: "contained", color: "success" },
};

export type ButtonProps = Omit<MuiButtonProps, "variant" | "size" | "color"> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, sx, ...rest }: ButtonProps) {
  const iconOnly = !children;
  return (
    <MuiButton
      {...VARIANT[variant]}
      size={size === "sm" ? "small" : "medium"}
      loading={loading}
      startIcon={iconOnly ? undefined : icon}
      className={className}
      sx={{
        whiteSpace: "nowrap",
        ...(variant === "secondary" ? { borderColor: "var(--line-strong)", bgcolor: "background.paper" } : {}),
        ...(iconOnly ? { minWidth: 36, px: 1 } : {}),
        ...sx,
      }}
      {...rest}
    >
      {iconOnly ? icon : children}
    </MuiButton>
  );
}

// ---------- Surfaces & text ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" className={cx("rounded-2xl", className)}>
      {children}
    </Paper>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>}
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h2>
      {children && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "add" | "mod" | "del" | "move" | "warn";
const TONE: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "rgba(23,32,51,0.06)", fg: "var(--ink-2)" },
  brand: { bg: "var(--brand-soft)", fg: "var(--brand-ink)" },
  add: { bg: "var(--add-bg)", fg: "var(--add-ink)" },
  mod: { bg: "var(--mod-bg)", fg: "var(--mod-ink)" },
  del: { bg: "var(--del-bg)", fg: "var(--del-ink)" },
  move: { bg: "var(--move-bg)", fg: "var(--move-ink)" },
  warn: { bg: "var(--mod-bg)", fg: "var(--mod-ink)" },
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <Chip
      label={<span className="inline-flex items-center gap-1">{children}</span>}
      className={className}
      sx={{ bgcolor: TONE[tone].bg, color: TONE[tone].fg, height: 22, fontSize: 12, "& .MuiChip-label": { px: 1 } }}
    />
  );
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
    </label>
  );
}

// ---------- Form fields ----------

type FieldEvents = {
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: () => void;
};

type InputProps = FieldEvents & {
  id?: string;
  value?: string | number;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  inputMode?: "numeric" | "text" | "email" | "url" | "tel";
  autoComplete?: string;
  list?: string;
  className?: string;
  startIcon?: ReactNode;
  "aria-label"?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, value, type, placeholder, required, disabled, autoFocus, maxLength, inputMode, autoComplete, list, className, startIcon, onChange, onBlur, onKeyDown, onFocus, ...aria },
  ref,
) {
  return (
    <TextField
      id={id}
      inputRef={ref}
      type={type}
      value={value}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      className={className}
      slotProps={{
        htmlInput: { maxLength, inputMode, list, onKeyDown, "aria-label": aria["aria-label"] },
        input: startIcon ? { startAdornment: <InputAdornment position="start">{startIcon}</InputAdornment> } : undefined,
      }}
      sx={{ bgcolor: "background.paper" }}
    />
  );
});

type TextareaProps = FieldEvents & {
  id?: string;
  value?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  spellCheck?: boolean;
  /** Applied to the <textarea> element itself (height, font). */
  className?: string;
  "aria-label"?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id, value, rows = 3, placeholder, required, disabled, spellCheck, className, onChange, onBlur, onKeyDown, onFocus, ...aria },
  ref,
) {
  return (
    <TextField
      id={id}
      inputRef={ref}
      multiline
      minRows={rows}
      value={value}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      slotProps={{ htmlInput: { className: cx("leading-relaxed", className), spellCheck, onKeyDown, "aria-label": aria["aria-label"] } }}
      sx={{ bgcolor: "background.paper", "& .MuiInputBase-root": { alignItems: "flex-start" } }}
    />
  );
});

/** Native select rendered as an MUI field (keeps <option> children, accessible on mobile). */
export function Select({
  id,
  value,
  onChange,
  children,
  className,
  required,
  disabled,
  ...aria
}: {
  id?: string;
  value: string | number | undefined;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <TextField
      select
      id={id}
      value={value ?? ""}
      required={required}
      disabled={disabled}
      onChange={onChange as unknown as (e: ChangeEvent<HTMLInputElement>) => void}
      className={className}
      slotProps={{ select: { native: true }, htmlInput: { "aria-label": aria["aria-label"] } }}
      sx={{ bgcolor: "background.paper" }}
    >
      {children}
    </TextField>
  );
}

export function CheckField({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <FormControlLabel
      className={className}
      disabled={disabled}
      control={<MuiCheckbox size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={<span className="text-sm text-ink-2">{label}</span>}
      sx={{ alignItems: "flex-start", ml: -0.5, "& .MuiCheckbox-root": { pt: 0.25 } }}
    />
  );
}

// ---------- Feedback ----------

const SEVERITY = { info: "info", warning: "warning", error: "error", success: "success" } as const;

export function Alert({ kind = "info", title, children, className }: { kind?: keyof typeof SEVERITY; title?: string; children?: ReactNode; className?: string }) {
  return (
    <MuiAlert severity={SEVERITY[kind]} variant="outlined" className={className} role={kind === "error" ? "alert" : "status"} sx={{ bgcolor: "background.paper" }}>
      {title && <AlertTitle sx={{ fontWeight: 600, mb: children ? 0.25 : 0 }}>{title}</AlertTitle>}
      {children && <div className="text-ink-2">{children}</div>}
    </MuiAlert>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <CircularProgress size={16} color="inherit" aria-hidden />
      {label}
    </span>
  );
}

/** Large in-progress panel for multi-second AI tasks. */
export function WorkingPanel({ title, steps }: { title: string; steps: string[] }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <CircularProgress size={32} aria-label={title} />
      <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      <ul className="mt-3 space-y-1 text-sm text-muted">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">This usually takes 30–90 seconds.</p>
    </Card>
  );
}

/** Helpful empty state with an optional action. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-black/5 text-ink-2">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
