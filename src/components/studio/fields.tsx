"use client";

import type { ExtraInfo } from "@/lib/types";
import { Input, Label, Textarea, useDraft } from "../ui";

/** Text field that keeps a local draft and saves when focus leaves. */
export function BlurField({
  id,
  label,
  hint,
  value,
  onSave,
  multiline,
  placeholder,
  rows = 3,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const [v, setV] = useDraft(value);
  const commit = () => v !== value && onSave(v);
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {multiline ? (
        <Textarea id={id} rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      ) : (
        <Input id={id} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      )}
    </div>
  );
}

export const EXTRA_FIELDS: { key: keyof ExtraInfo; label: string; placeholder: string }[] = [
  { key: "experience", label: "Experience details", placeholder: "Roles, responsibilities or context not in your resume…" },
  { key: "projects", label: "Projects", placeholder: "Project name, what you built, tools, your role, outcome…" },
  { key: "achievements", label: "Achievements", placeholder: "Awards, results, recognition — include numbers only if they’re accurate." },
  { key: "skills", label: "Skills", placeholder: "Tools, languages, methods you can genuinely demonstrate…" },
  { key: "education", label: "Education", placeholder: "Degree, institution, dates, relevant coursework…" },
  { key: "certifications", label: "Certifications", placeholder: "Name, issuer, year…" },
];
