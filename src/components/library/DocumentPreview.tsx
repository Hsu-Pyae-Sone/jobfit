"use client";

import { parseLetter } from "@/lib/letter";
import { structureResume } from "@/lib/resume/parse";
import type { LibraryKind } from "@/lib/types";

/** Read-only, page-like preview of a resume or cover letter (plain text, no HTML injection). */
export function DocumentPreview({ kind, content }: { kind: LibraryKind; content: string }) {
  if (!content.trim()) return <p className="text-sm text-muted">This document is empty.</p>;
  if (kind === "cover_letter") {
    const l = parseLetter(content);
    return (
      <article className="mx-auto max-w-[680px] space-y-4 rounded-xl border border-line bg-white px-6 py-8 text-[14px] leading-relaxed text-ink shadow-sm sm:px-10">
        {l.headerLines.length > 0 && <p className="whitespace-pre-line text-ink-2">{l.headerLines.join("\n")}</p>}
        {l.greeting && <p>{l.greeting}</p>}
        {l.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {(l.closing || l.signatureName) && (
          <p className="whitespace-pre-line">
            {l.closing}
            {l.signatureName && `\n${l.signatureName}`}
          </p>
        )}
      </article>
    );
  }
  const r = structureResume(content);
  return (
    <article className="mx-auto max-w-[720px] rounded-xl border border-line bg-white px-6 py-8 text-[13.5px] text-ink shadow-sm sm:px-10">
      <h3 className="text-2xl font-bold">{r.name || "Untitled"}</h3>
      {r.contactLines.length > 0 && <p className="mt-1 text-[12.5px] text-ink-2">{r.contactLines.join("  |  ")}</p>}
      {r.sections.map((s, i) => (
        <section key={i} className="mt-5">
          <h4 className="border-b border-line-strong pb-1 text-[12.5px] font-bold uppercase tracking-wide">{s.title}</h4>
          <div className="mt-2 space-y-1">
            {s.lines.map((l) =>
              l.kind === "bullet" ? (
                <p key={l.id} className="flex gap-2 pl-1">
                  <span aria-hidden>•</span>
                  <span>{l.text}</span>
                </p>
              ) : (
                <p key={l.id} className={/\b(19|20)\d{2}\b|present/i.test(l.text) && l.text.length < 110 ? "pt-1 font-semibold" : ""}>
                  {l.text}
                </p>
              ),
            )}
          </div>
        </section>
      ))}
    </article>
  );
}
