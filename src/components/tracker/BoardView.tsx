"use client";

import { useState } from "react";
import { CalendarClock, Flag, MessageSquareReply } from "lucide-react";
import type { StatusDef, TrackerEntry } from "@/lib/tracker/types";
import { cx } from "../ui";
import { COLOR_DOT, StatusSelect, formatDate } from "./parts";

export function BoardView({ rows, statuses, onMove, onOpen }: { rows: TrackerEntry[]; statuses: StatusDef[]; onMove: (id: string, status: string) => void; onOpen: (id: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3" style={{ minWidth: statuses.length * 252 }}>
        {statuses.map((s) => {
          const items = rows.filter((r) => r.status === s.id);
          return (
            <section
              key={s.id}
              aria-label={`${s.label} column`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) onMove(id, s.id);
              }}
              className={cx("flex w-60 shrink-0 flex-col rounded-2xl border bg-surface-2 transition-colors", over === s.id ? "border-brand bg-brand-soft/40" : "border-line")}
            >
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className={cx("size-2 rounded-full", COLOR_DOT[s.color])} aria-hidden />
                <h3 className="flex-1 truncate text-sm font-semibold">{s.label}</h3>
                <span className="rounded-full bg-black/5 px-1.5 text-xs text-muted">{items.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {items.map((e) => (
                  <article
                    key={e.id}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData("text/plain", e.id);
                      ev.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab select-none rounded-xl border border-line bg-surface p-3 shadow-sm active:cursor-grabbing"
                  >
                    <button onClick={() => onOpen(e.id)} className="block w-full text-left">
                      <p className="text-[13px] font-semibold leading-snug text-ink">{e.title || "Untitled role"}</p>
                      <p className="text-xs text-ink-2">{e.company || "Company not set"}</p>
                    </button>
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted">
                      {e.deadline && (
                        <p className="flex items-center gap-1">
                          <Flag className="size-3" /> Deadline {formatDate(e.deadline)}
                        </p>
                      )}
                      {e.interviewDate && (
                        <p className="flex items-center gap-1">
                          <CalendarClock className="size-3" /> {e.interviewStage || "Interview"} {formatDate(e.interviewDate)}
                        </p>
                      )}
                      {e.followUpDate && (
                        <p className="flex items-center gap-1">
                          <MessageSquareReply className="size-3" /> Follow up {formatDate(e.followUpDate)}
                        </p>
                      )}
                      {e.matchScore !== null && <p>Match {e.matchScore}/100</p>}
                    </div>
                    {/* Keyboard / touch alternative to drag-and-drop */}
                    <StatusSelect className="mt-2 w-full" value={e.status} statuses={statuses} onChange={(v) => onMove(e.id, v)} label={`Move ${e.title || e.company} to status`} />
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
