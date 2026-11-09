"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayIso } from "@/lib/tracker/logic";
import type { TrackerEntry } from "@/lib/tracker/types";
import { Button, cx } from "../ui";

type Kind = "applied" | "deadline" | "interview" | "follow_up";
interface CalEvent {
  date: string; // YYYY-MM-DD
  time: string | null;
  kind: Kind;
  entry: TrackerEntry;
}

const KIND: Record<Kind, { label: string; cls: string }> = {
  deadline: { label: "Deadline", cls: "bg-red-50 text-red-700 border-red-200" },
  interview: { label: "Interview", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  follow_up: { label: "Follow-up", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  applied: { label: "Applied", cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

function eventsOf(rows: TrackerEntry[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const e of rows) {
    if (e.applicationDate) out.push({ date: e.applicationDate, time: null, kind: "applied", entry: e });
    if (e.deadline) out.push({ date: e.deadline, time: null, kind: "deadline", entry: e });
    if (e.interviewDate) out.push({ date: e.interviewDate.slice(0, 10), time: e.interviewDate.slice(11, 16) || null, kind: "interview", entry: e });
    if (e.followUpDate) out.push({ date: e.followUpDate, time: null, kind: "follow_up", entry: e });
  }
  return out;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function CalendarView({ rows, onOpen }: { rows: TrackerEntry[]; onOpen: (id: string) => void }) {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const events = useMemo(() => eventsOf(rows), [rows]);
  const today = todayIso();

  const first = new Date(month.y, month.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const monthEvents = events.filter((ev) => ev.date.startsWith(iso(month.y, month.m, 1).slice(0, 7))).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const shift = (d: number) => setMonth(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));

  const chip = (ev: CalEvent, i: number) => (
    <button
      key={i}
      onClick={() => onOpen(ev.entry.id)}
      className={cx("block w-full truncate rounded border px-1 py-0.5 text-left text-[11px]", KIND[ev.kind].cls)}
      title={`${KIND[ev.kind].label}: ${ev.entry.title} — ${ev.entry.company}`}
    >
      {ev.time && <span className="font-semibold">{ev.time} </span>}
      {KIND[ev.kind].label}: {ev.entry.company || ev.entry.title}
    </button>
  );

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-display text-lg font-semibold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(KIND).map(([k, v]) => (
            <span key={k} className={cx("rounded border px-1.5 py-0.5", v.cls)}>
              {v.label}
            </span>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month" icon={<ChevronLeft className="size-4" />} />
        <Button size="sm" variant="ghost" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>
          Today
        </Button>
        <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month" icon={<ChevronRight className="size-4" />} />
      </div>

      {/* Month grid (tablet and up) */}
      <div className="hidden grid-cols-7 overflow-hidden rounded-xl border border-line sm:grid" role="grid" aria-label="Month calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b border-line bg-surface-2 px-2 py-1.5 text-[11px] font-semibold uppercase text-muted">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          const date = d ? iso(month.y, month.m, d) : "";
          const evs = d ? events.filter((ev) => ev.date === date) : [];
          return (
            <div key={i} role="gridcell" className={cx("min-h-24 border-b border-r border-line/70 p-1", !d && "bg-surface-2/60", date === today && "bg-brand-soft/40")}>
              {d && <p className={cx("mb-1 text-right text-[11px]", date === today ? "font-bold text-brand" : "text-muted")}>{d}</p>}
              <div className="space-y-0.5">
                {evs.slice(0, 3).map(chip)}
                {evs.length > 3 && <p className="px-1 text-[10px] text-muted">+{evs.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agenda list (phones) */}
      <ul className="space-y-1.5 sm:hidden">
        {monthEvents.length === 0 && <li className="py-6 text-center text-sm text-muted">Nothing scheduled this month.</li>}
        {monthEvents.map((ev, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs tabular-nums text-muted">{new Date(`${ev.date}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
            <div className="min-w-0 flex-1">{chip(ev, i)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
