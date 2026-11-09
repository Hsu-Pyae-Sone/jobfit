import { NewApplicationForm, WorkspaceList } from "@/components/WorkspaceList";

export const metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Resume Studio</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your applications</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Each application pairs one resume with one job description. You’ll confirm the extracted text, see how well you match, answer a few
        questions about your results, decide on each suggested change, then review and export.
      </p>
      <div className="mt-6">
        <NewApplicationForm autoFocus />
      </div>
      <div className="mt-8">
        <WorkspaceList allowDelete />
      </div>
    </div>
  );
}
