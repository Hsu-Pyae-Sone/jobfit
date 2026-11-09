"use client";

import Checkbox from "@mui/material/Checkbox";
import { Hash } from "lucide-react";
import type { MetricAnswer, MetricQuestion } from "@/lib/types";
import { Alert, Button, Card, SectionTitle, Textarea, useDraft } from "../ui";
import { useWs } from "./useWorkspace";

function QuestionCard({ q, value, onSave }: { q: MetricQuestion; value?: MetricAnswer; onSave: (a: MetricAnswer) => void }) {
  const [text, setText] = useDraft(value?.answer ?? "");
  const [noNumber, setNoNumber] = useDraft(value?.noNumber ?? false);

  return (
    <Card className="p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Your bullet</p>
      <p className="mt-1 border-l-2 border-line-strong pl-3 text-[15px] leading-relaxed text-ink">{q.bulletText}</p>
      {q.whyItMatters && <p className="mt-3 text-sm text-muted">{q.whyItMatters}</p>}
      <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
        {q.questions.map((x) => (
          <li key={x} className="flex gap-2">
            <Hash className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
            {x}
          </li>
        ))}
      </ul>
      <label className="sr-only" htmlFor={`ans-${q.id}`}>
        Your answer
      </label>
      <Textarea
        id={`ans-${q.id}`}
        className="mt-4"
        rows={3}
        disabled={noNumber}
        value={noNumber ? "" : text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (value?.answer ?? "") && onSave({ answer: text, noNumber: false })}
        placeholder={noNumber ? "No figure — the bullet will be written without numbers." : "e.g. About 40 users tested it; we shipped 6 features before the March deadline."}
      />
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <Checkbox size="small" sx={{ p: 0.25 }}
          checked={noNumber}
          onChange={(e) => {
            setNoNumber(e.target.checked);
            onSave({ answer: e.target.checked ? "" : text, noNumber: e.target.checked });
          }} />
        I don’t have an accurate number for this
      </label>
    </Card>
  );
}

export function StepGaps({ onNext }: { onNext: () => void }) {
  const { ws, save } = useWs();
  const qs = ws.analysis?.metricQuestions ?? [];
  const answered = qs.filter((q) => ws.answers[q.id] && (ws.answers[q.id].noNumber || ws.answers[q.id].answer.trim())).length;

  return (
    <div className="max-w-4xl">
      <SectionTitle eyebrow="Step 3" title="Add the results only you know">
        Strong bullets follow <strong className="font-medium text-ink">action verb + task + measurable result</strong>. Numbers are used only if you
        provide them here. If you don’t have an accurate figure, tick the box and the bullet will be made specific without inventing one.
      </SectionTitle>

      {qs.length === 0 ? (
        <Alert kind="success">No questions — your bullets either already include results or don’t need a number.</Alert>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            {answered} of {qs.length} answered · Answers save automatically and are optional.
          </p>
          <div className="space-y-4">
            {qs.map((q) => (
              <QuestionCard key={q.id} q={q} value={ws.answers[q.id]} onSave={(a) => save({ answers: { [q.id]: a } })} />
            ))}
          </div>
        </>
      )}

      {ws.optimization && (
        <Alert kind="info" className="mt-6">
          You already generated resume suggestions. If you change answers, regenerate them on the next step to use the new information.
        </Alert>
      )}

      <div className="mt-8 flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue to resume changes
        </Button>
      </div>
    </div>
  );
}
