"use client";

import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import FormControlLabel from "@mui/material/FormControlLabel";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarDays, CalendarPlus, Columns3, Download, Kanban, Plus, Search, Settings2, Table2, X } from "lucide-react";
import { errorMessage } from "@/lib/client/api";
import { computeReminders, computeStats, groupOf, type Reminder } from "@/lib/tracker/logic";
import { GROUP_LABEL, type StatusDef, type TrackerEntry } from "@/lib/tracker/types";
import { Alert, Button, Card, Input, Label, Spinner, cx, Select } from "../ui";
import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { EntryDrawer } from "./EntryDrawer";
import { StatusBadge } from "./parts";
import { StatusEditor } from "./StatusEditor";
import { COLUMNS, TableView, sortEntries, type ColumnKey, type Sort } from "./TableView";
import { useTracker, type Patch } from "./useTracker";

type View = "table" | "board" | "calendar";
type Quick = "all" | "upcoming_interview" | "follow_up_due" | "deadline_soon" | "active" | "closed";

const PREFS = "careerfit.tracker";
const DEFAULT_VISIBLE: ColumnKey[] = COLUMNS.map((c) => c.key);

function loadPrefs(): { view: View; visible: ColumnKey[]; sort: Sort } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? "null");
    if (p) return { view: p.view ?? "table", visible: Array.isArray(p.visible) && p.visible.length ? p.visible : DEFAULT_VISIBLE, sort: p.sort ?? null };
  } catch {
    /* storage unavailable */
  }
  return { view: "table", visible: DEFAULT_VISIBLE, sort: { key: "updatedAt", dir: "desc" } };
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3" title={hint}>
      <p className="font-display text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function matchesSearch(e: TrackerEntry, q: string, statuses: StatusDef[]): boolean {
  if (!q) return true;
  const hay = [e.company, e.title, e.location, e.salary, e.url, e.recruiterContact, e.interviewStage, e.notes, e.resumeVersion?.label, e.coverLetterVersion?.label, statuses.find((s) => s.id === e.status)?.label, ...e.feedback.map((f) => f.text)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TrackerApp() {
  const t = useTracker();
  const [view, setView] = useState<View>("table");
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [sort, setSort] = useState<Sort>({ key: "updatedAt", dir: "desc" });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [quick, setQuick] = useState<Quick>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingStatuses, setEditingStatuses] = useState(false);
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState<Patch>({ company: "", title: "", url: "", status: "saved", deadline: "" });
  const [addErr, setAddErr] = useState<string | null>(null);

  useEffect(() => {
    const p = loadPrefs();
    // Restored once from per-browser preferences (a convenience only).
    queueMicrotask(() => {
      setView(p.view);
      setVisible(p.visible);
      setSort(p.sort);
    });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ view, visible, sort }));
    } catch {
      /* storage unavailable */
    }
  }, [view, visible, sort]);

  const entries = useMemo(() => t.entries ?? [], [t.entries]);
  const reminders = useMemo(() => computeReminders(entries, t.statuses), [entries, t.statuses]);
  const stats = useMemo(() => computeStats(entries, t.statuses), [entries, t.statuses]);

  const rows = useMemo(() => {
    const reminderIds = (k: Reminder["kind"]) => new Set(reminders.filter((r) => r.kind === k).map((r) => r.entryId));
    const filtered = entries.filter((e) => {
      if (statusFilter.length && !statusFilter.includes(e.status)) return false;
      const g = groupOf(e.status, t.statuses);
      if (quick === "upcoming_interview" && !reminderIds("interview").has(e.id)) return false;
      if (quick === "follow_up_due" && !reminderIds("follow_up").has(e.id)) return false;
      if (quick === "deadline_soon" && !reminderIds("deadline").has(e.id)) return false;
      if (quick === "active" && (g === "rejected" || g === "withdrawn")) return false;
      if (quick === "closed" && !(g === "rejected" || g === "withdrawn")) return false;
      return matchesSearch(e, q, t.statuses);
    });
    return sortEntries(filtered, sort, t.statuses);
  }, [entries, statusFilter, quick, q, sort, t.statuses, reminders]);

  const open = entries.find((e) => e.id === openId) ?? null;

  async function exportAs(format: "csv" | "xlsx" | "ics") {
    setExportAnchor(null);
    try {
      const res = await fetch("/api/tracker/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format, ids: rows.map((r) => r.id) }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Export failed.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `applications.${format}`;
      downloadBlob(await res.blob(), name);
    } catch (e) {
      t.setError(errorMessage(e));
    }
  }

  const del = (e: TrackerEntry) => {
    if (confirm(`Delete “${e.title || e.company}” from the tracker? This can’t be undone.`)) {
      if (openId === e.id) setOpenId(null);
      void t.remove(e.id);
    }
  };

  const filtersActive = statusFilter.length > 0 || quick !== "all" || q.trim() !== "";

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Application Tracker</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Applications</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your applications in one place. Statuses change only when you change them: downloading a resume or cover letter never marks a job as applied, and Jobfit never submits applications for you.
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Add application
        </Button>
      </div>

      {t.error && (
        <Alert kind="error" className="mt-5" title="Something didn’t work">
          {t.error}{" "}
          <button className="underline" onClick={() => t.setError(null)}>
            Dismiss
          </button>
        </Alert>
      )}

      {!t.entries ? (
        <div className="mt-10">
          <Spinner label="Loading applications…" />
        </div>
      ) : (
        <>
          {/* ---------- Statistics ---------- */}
          <section aria-label="Application statistics" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Total applications" value={stats.total} hint="Applications you’ve submitted: any status past ‘not applied’, or an application date entered." />
            <Stat label="Awaiting response" value={stats.awaiting} hint="Currently in an ‘Applied’-group status with no response yet." />
            <Stat label="Interviews" value={stats.interviews} hint="Applications that reached an interview-group status, or have an interview date or interview notes." />
            <Stat label="Offers" value={stats.offers} hint="Applications that reached an offer-group status." />
            <Stat label="Rejections" value={stats.rejections} hint="Applications currently in a rejected-group status." />
            <Stat label="Response rate" value={pct(stats.responseRate)} hint="Share of submitted applications where the employer responded (moved forward, interviewed, offered or rejected)." />
            <Stat label="Interview conversion" value={pct(stats.interviewRate)} hint="Share of submitted applications that reached an interview." />
          </section>
          <p className="mt-2 text-xs text-muted">
            {stats.notApplied} saved or in preparation (not counted as applications). Hover a number for how it’s counted.
          </p>

          {/* ---------- Reminders ---------- */}
          {reminders.length > 0 && (
            <Card className="mt-5 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <BellRing className="size-4 text-accent" aria-hidden />
                <h2 className="mr-auto text-sm font-semibold">Reminders — next 7 days</h2>
                <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-3.5" />} onClick={() => exportAs("ics")}>
                  Add to my calendar (.ics)
                </Button>
              </div>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {reminders.slice(0, 9).map((r) => (
                  <li key={`${r.entryId}-${r.kind}`} className="min-w-0">
                    <button onClick={() => setOpenId(r.entryId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                      <span
                        className={cx(
                          "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                          r.daysUntil < 0 ? "bg-red-100 text-red-700" : r.daysUntil === 0 ? "bg-amber-100 text-amber-800" : "bg-black/5 text-ink-2",
                        )}
                      >
                        {r.daysUntil < 0 ? `${-r.daysUntil}d overdue` : r.daysUntil === 0 ? "Today" : r.daysUntil === 1 ? "Tomorrow" : `In ${r.daysUntil}d`}
                      </span>
                      <span className="min-w-0 truncate" title={r.label}>{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---------- Toolbar ---------- */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search applications" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, title, notes, contacts…" className="pl-9" />
            </div>
            <Select aria-label="Quick filter" value={quick} onChange={(e) => setQuick(e.target.value as Quick)} >
              <option value="all">All applications</option>
              <option value="active">Active only</option>
              <option value="closed">Closed (rejected / withdrawn)</option>
              <option value="upcoming_interview">Interview in next 7 days</option>
              <option value="follow_up_due">Follow-up due</option>
              <option value="deadline_soon">Deadline soon</option>
            </Select>
            <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => v && setView(v)} aria-label="View" sx={{ bgcolor: "background.paper" }}>
              {(
                [
                  ["table", "Table", Table2],
                  ["board", "Board", Kanban],
                  ["calendar", "Calendar", CalendarDays],
                ] as const
              ).map(([k, l, Icon]) => (
                <ToggleButton key={k} value={k} aria-label={l} sx={{ gap: 0.75, px: 1.5, textTransform: "none" }}>
                  <Icon className="size-4" aria-hidden /> <span className="hidden sm:inline">{l}</span>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {view === "table" && (
              <>
                <Button size="sm" className="h-10" icon={<Columns3 className="size-4" />} onClick={(e) => setColumnsAnchor(e.currentTarget)} aria-haspopup="menu">
                  Columns
                </Button>
                <Menu anchorEl={columnsAnchor} open={Boolean(columnsAnchor)} onClose={() => setColumnsAnchor(null)}>
                  {COLUMNS.map((c) => (
                    <MenuItem key={c.key} dense sx={{ py: 0 }}>
                      <FormControlLabel
                        sx={{ width: "100%", m: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={visible.includes(c.key)}
                            disabled={visible.length === 1 && visible.includes(c.key)}
                            onChange={(e) => setVisible((v) => (e.target.checked ? COLUMNS.map((x) => x.key).filter((k) => v.includes(k) || k === c.key) : v.filter((k) => k !== c.key)))}
                          />
                        }
                        label={<span className="text-sm">{c.label}</span>}
                      />
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
            <Button size="sm" className="h-10" icon={<Download className="size-4" />} onClick={(e) => setExportAnchor(e.currentTarget)} aria-haspopup="menu">
              Export
            </Button>
            <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
              <MenuItem onClick={() => exportAs("xlsx")}>Excel (.xlsx)</MenuItem>
              <MenuItem onClick={() => exportAs("csv")}>CSV (.csv)</MenuItem>
              <MenuItem onClick={() => exportAs("ics")}>Calendar reminders (.ics)</MenuItem>
              <p className="max-w-60 px-4 pb-1 pt-1 text-[11px] text-muted">
                Exports the {rows.length} application{rows.length === 1 ? "" : "s"} in the current view.
              </p>
            </Menu>
            <Button size="sm" variant="ghost" className="h-10" icon={<Settings2 className="size-4" />} onClick={() => setEditingStatuses(true)}>
              Statuses
            </Button>
          </div>

          {/* Status filter chips */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Filter by status">
            {t.statuses.map((s) => {
              const on = statusFilter.includes(s.id);
              const count = entries.filter((e) => e.status === s.id).length;
              return (
                <button
                  key={s.id}
                  aria-pressed={on}
                  onClick={() => setStatusFilter((f) => (on ? f.filter((x) => x !== s.id) : [...f, s.id]))}
                  className={cx("rounded-full transition-opacity", statusFilter.length > 0 && !on && "opacity-45")}
                  title={GROUP_LABEL[s.group]}
                >
                  <span className="sr-only">Filter: </span>
                  <StatusBadge status={s.id} statuses={t.statuses} />
                  <span className="sr-only"> ({count})</span>
                  <span className="ml-0.5 text-[11px] text-muted" aria-hidden>{count}</span>
                </button>
              );
            })}
            {filtersActive && (
              <button
                onClick={() => {
                  setStatusFilter([]);
                  setQuick("all");
                  setQ("");
                }}
                className="ml-1 inline-flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <X className="size-3" /> Clear filters
              </button>
            )}
          </div>

          {/* ---------- Views ---------- */}
          <div className="mt-4">
            {entries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
                <p className="font-medium">No applications yet</p>
                <p className="mt-1 text-sm text-muted">Add one manually, or use “Add to tracker” on a job in Job Search or Job Match.</p>
                <Button className="mt-4" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                  Add application
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">No applications match these filters.</p>
            ) : view === "table" ? (
              <TableView
                rows={rows}
                statuses={t.statuses}
                versions={t.versions}
                visible={visible}
                sort={sort}
                onSort={setSort}
                onUpdate={(id, p) => void t.update(id, p)}
                onOpen={setOpenId}
                onDelete={del}
              />
            ) : view === "board" ? (
              <BoardView rows={rows} statuses={statusFilter.length ? t.statuses.filter((s) => statusFilter.includes(s.id)) : t.statuses} onMove={(id, status) => void t.update(id, { status })} onOpen={setOpenId} />
            ) : (
              <CalendarView rows={rows} onOpen={setOpenId} />
            )}
          </div>
          {view === "table" && rows.length > 0 && <p className="mt-2 text-xs text-muted">Click any cell to edit. Changes save when you press Enter or leave the cell. Esc cancels.</p>}
        </>
      )}

      {/* ---------- Add dialog ---------- */}
      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm" aria-labelledby="add-app-title">
          <form
            className="space-y-3 p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setAddErr(null);
              try {
                const created = await t.create(draft);
                setAdding(false);
                setDraft({ company: "", title: "", url: "", status: "saved", deadline: "" });
                setOpenId(created.id);
              } catch (er) {
                setAddErr(errorMessage(er));
              }
            }}
          >
            <h2 id="add-app-title" className="font-display text-xl font-semibold">Add application</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="add-company">Company</Label>
                <Input id="add-company" autoFocus value={draft.company ?? ""} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="add-title">Job title</Label>
                <Input id="add-title" value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="add-url" hint="optional">Application URL</Label>
                <Input id="add-url" type="url" placeholder="https://…" value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="add-status">Status</Label>
                <Select id="add-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} >
                  {t.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="add-deadline" hint="optional">Deadline</Label>
                <Input id="add-deadline" type="date" value={draft.deadline ?? ""} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted">You can fill in the other columns in the table or the details panel.</p>
            {addErr && <Alert kind="error">{addErr}</Alert>}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Add
              </Button>
            </div>
          </form>
      </Dialog>

      {open && (
        <EntryDrawer
          entry={open}
          statuses={t.statuses}
          versions={t.versions}
          onClose={() => setOpenId(null)}
          onUpdate={(p) => void t.update(open.id, p)}
          onDelete={() => del(open)}
          onAddFeedback={(n) => t.addFeedback(open.id, n)}
          onRemoveFeedback={(nid) => void t.removeFeedback(open.id, nid)}
        />
      )}
      {editingStatuses && <StatusEditor statuses={t.statuses} entries={entries} onSave={t.saveStatuses} onClose={() => setEditingStatuses(false)} />}
    </div>
  );
}
