"use client";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Eye, FilePlus2, FileText, Mail, MoreVertical, Pencil, Play, Trash2 } from "lucide-react";
import { ApiError, api, errorMessage } from "@/lib/client/api";
import { TEMPLATE_LIMIT, type LibraryItem, type LibraryKind, type WorkspaceSummary } from "@/lib/types";
import { Alert, Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "../ui";
import { DocumentPreview } from "./DocumentPreview";
import { SaveTemplateDialog, type TemplateSource } from "./SaveTemplateDialog";

type AppDoc = LibraryItem & { tracker: { id: string; title: string; company: string; status: string } | null };
interface Data {
  templates: LibraryItem[];
  applicationDocs: AppDoc[];
  limit: number;
  starters: { id: string; kind: LibraryKind; name: string }[];
}

const KIND_LABEL: Record<LibraryKind, string> = { resume: "Resume", cover_letter: "Cover letter" };
const hasPlaceholders = (t: string) => /\[[^\]\n]{2,60}\]/.test(t);

function exportLinks(id: string) {
  return (["pdf", "docx"] as const).map((f) => ({ f, href: `/api/library/${id}/export?format=${f}` }));
}

/** Preview / edit one template. Saving edits overwrites the saved version, so it's confirmed first. */
function TemplateDialog({ item, initialTab = "preview", onClose, onChanged }: { item: LibraryItem; initialTab?: "preview" | "edit"; onClose: () => void; onChanged: (i: LibraryItem) => void }) {
  const [tab, setTab] = useState<"preview" | "edit">(initialTab);
  const [name, setName] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = content !== item.content || name.trim() !== item.title;

  async function save() {
    setErr(null);
    try {
      const r = await api<{ item: LibraryItem }>(`/api/library/${item.id}`, { method: "PATCH", body: { title: name.trim(), content, confirmOverwrite: true } });
      onChanged(r.item);
      setConfirm(false);
      setTab("preview");
    } catch (e) {
      setErr(errorMessage(e));
      setConfirm(false);
    }
  }

  const close = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this template?")) return;
    onClose();
  };

  return (
    <Dialog open onClose={close} fullWidth maxWidth="md" aria-labelledby="tpl-dialog-title">
      <DialogTitle id="tpl-dialog-title" sx={{ pb: 0 }}>
        {item.title} <span className="text-sm font-normal text-muted">· {KIND_LABEL[item.kind]} template</span>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: "divider" }} aria-label="Template view">
        <Tab value="preview" label="Preview" />
        <Tab value="edit" label={dirty ? "Edit •" : "Edit"} />
      </Tabs>
      <DialogContent sx={{ bgcolor: tab === "preview" ? "var(--surface-2)" : undefined }}>
        {tab === "preview" ? (
          <div className="py-2">
            {hasPlaceholders(dirty ? content : item.content) && (
              <Alert kind="info" className="mb-3">
                Contains [placeholders]. When you use this template, replace them with your real details. The final review flags any that are left.
              </Alert>
            )}
            <DocumentPreview kind={item.kind} content={dirty ? content : item.content} />
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="tpl-edit-name">Name</Label>
              <Input id="tpl-edit-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tpl-edit-content">Content</Label>
              <Textarea id="tpl-edit-content" rows={18} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-[13px]" />
              <p className="mt-1 text-xs text-muted">
                {item.kind === "resume" ? "One item per line; section titles in capitals on their own line; bullets start with “- ”." : "Separate paragraphs with a blank line."}
              </p>
            </div>
          </div>
        )}
        {err && <Alert kind="error" className="mt-3">{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>{dirty ? "Cancel" : "Close"}</Button>
        {tab === "edit" && (
          <Button variant="primary" disabled={!dirty || !content.trim() || !name.trim()} onClick={() => setConfirm(true)}>
            Save changes
          </Button>
        )}
      </DialogActions>

      <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="overwrite-title">
        <DialogTitle id="overwrite-title">Overwrite saved template?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Saving replaces the stored version of “{item.title}”. Documents you’ve already created from it aren’t affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Keep editing</Button>
          <Button variant="primary" onClick={save}>
            Overwrite
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

function NewTemplateDialog({ kind, starters, workspaces, onClose, onSaved }: { kind: LibraryKind; starters: Data["starters"]; workspaces: WorkspaceSummary[]; onClose: () => void; onSaved: (i: LibraryItem) => void }) {
  const [from, setFrom] = useState<string>("blank");
  const [paste, setPaste] = useState("");
  const [ready, setReady] = useState<{ source: TemplateSource; name: string } | null>(null);
  const kindStarters = starters.filter((s) => s.kind === kind);

  const next = () => {
    if (from === "paste") return setReady({ source: { content: paste }, name: "" });
    if (from.startsWith("starter:")) {
      const st = kindStarters.find((s) => s.id === from.slice(8))!;
      return setReady({ source: { starter: st.id }, name: st.name });
    }
    if (from.startsWith("ws:")) {
      const ws = workspaces.find((w) => w.id === from.slice(3))!;
      return setReady({ source: { fromWorkspaceId: ws.id }, name: ws.title.slice(0, 120) });
    }
    setReady({ source: { content: kind === "resume" ? "[Full name]\n[email] | [phone] | [city]\n\nEXPERIENCE\n- \n\nEDUCATION\n\nSKILLS\n" : "Dear Hiring Manager,\n\n\n\nSincerely,\n[Full name]" }, name: "" });
  };

  if (ready) return <SaveTemplateDialog open kind={kind} source={ready.source} defaultName={ready.name} onClose={onClose} onSaved={onSaved} />;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="new-tpl-title">
      <DialogTitle id="new-tpl-title">New {kind === "resume" ? "resume" : "cover letter"} template</DialogTitle>
      <DialogContent>
        <div className="space-y-3 pt-1">
          <div>
            <Label htmlFor="tpl-from">Start from</Label>
            <Select id="tpl-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="blank">A blank outline</option>
              {kindStarters.map((s) => (
                <option key={s.id} value={`starter:${s.id}`}>
                  {s.name} structure (placeholders only)
                </option>
              ))}
              {workspaces.length > 0 && (
                <optgroup label={`Final ${kind === "resume" ? "resume" : "cover letter"} from Resume Studio`}>
                  {workspaces.map((w) => (
                    <option key={w.id} value={`ws:${w.id}`}>
                      {w.title}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="paste">Paste text</option>
            </Select>
          </div>
          {from === "paste" && <Textarea aria-label="Template text" rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} className="font-mono text-[13px]" />}
          {from.startsWith("starter:") && (
            <p className="text-xs text-muted">Starter structures contain only section headings and [placeholders]. Nothing is filled in for you.</p>
          )}
        </div>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={next} disabled={from === "paste" && !paste.trim()}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function UseCoverDialog({ item, workspaces, onClose }: { item: LibraryItem; workspaces: WorkspaceSummary[]; onClose: () => void }) {
  const router = useRouter();
  const [ws, setWs] = useState(workspaces[0]?.id ?? "");
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function apply(confirmOverwrite: boolean) {
    setErr(null);
    try {
      await api(`/api/library/${item.id}/actions`, { body: { action: "apply", workspaceId: ws, confirmOverwrite } });
      router.push(`/studio/${ws}?step=cover`);
    } catch (e) {
      if (e instanceof ApiError && e.details.code === "confirm_overwrite") setOverwrite(true);
      else setErr(errorMessage(e));
    }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="use-cover-title">
      <DialogTitle id="use-cover-title">Use “{item.title}” as a starting point</DialogTitle>
      <DialogContent>
        {workspaces.length ? (
          <div className="space-y-3 pt-1">
            <div>
              <Label htmlFor="use-ws">Application in Resume Studio</Label>
              <Select id="use-ws" value={ws} onChange={(e) => {
                setWs(e.target.value);
                setOverwrite(false);
              }}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </Select>
            </div>
            {overwrite && <Alert kind="warning" title="This application already has a cover letter">Using the template replaces it.</Alert>}
          </div>
        ) : (
          <Alert kind="info">Create an application in Resume Studio first.</Alert>
        )}
        {err && <Alert kind="error" className="mt-3">{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={overwrite ? "danger" : "primary"} disabled={!ws} onClick={() => apply(overwrite)}>
          {overwrite ? "Replace cover letter" : "Use template"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TemplateCard({ item, onOpen, onAction }: { item: LibraryItem; onOpen: (tab?: "edit") => void; onAction: (a: "duplicate" | "start" | "delete") => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const snippet = item.content.split("\n").filter((l) => l.trim()).slice(0, 3).join(" · ");
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.title}</p>
          <p className="text-xs text-muted">Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
        </div>
        <IconButton size="small" aria-label={`More actions for ${item.title}`} onClick={(e) => setAnchor(e.currentTarget)}>
          <MoreVertical className="size-4" />
        </IconButton>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <MenuItem onClick={() => (setAnchor(null), onAction("duplicate"))}>
            <Copy className="mr-2 size-4" /> Duplicate
          </MenuItem>
          {exportLinks(item.id).map(({ f, href }) => (
            <MenuItem key={f} component="a" href={href} onClick={() => setAnchor(null)}>
              <Download className="mr-2 size-4" /> Export {f.toUpperCase()}
            </MenuItem>
          ))}
          <MenuItem onClick={() => (setAnchor(null), onAction("delete"))} sx={{ color: "error.main" }}>
            <Trash2 className="mr-2 size-4" /> Delete
          </MenuItem>
        </Menu>
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-ink-2">{snippet}</p>
      {hasPlaceholders(item.content) && <p className="mt-1 text-[11px] text-mod-ink">Has placeholders to fill in</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Eye className="size-3.5" />} onClick={() => onOpen()}>
          Preview
        </Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => onOpen("edit")}>
          Edit
        </Button>
        <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={() => onAction("start")}>
          Use
        </Button>
      </div>
    </Card>
  );
}

export function SavedDocuments() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<{ item: LibraryItem; tab?: "preview" | "edit" } | null>(null);
  const [creating, setCreating] = useState<LibraryKind | null>(null);
  const [dup, setDup] = useState<LibraryItem | null>(null);
  const [useCover, setUseCover] = useState<LibraryItem | null>(null);
  const [preview, setPreview] = useState<AppDoc | null>(null);

  const load = () =>
    Promise.all([api<Data>("/api/library"), api<{ workspaces: WorkspaceSummary[] }>("/api/workspaces")])
      .then(([a, b]) => {
        setD(a);
        setWorkspaces(b.workspaces);
      })
      .catch((e) => setErr(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; subtitle: string; trackerId: string | null; workspaceId: string | null; docs: AppDoc[] }>();
    for (const doc of d?.applicationDocs ?? []) {
      const key = doc.tracker?.id ?? `ws:${doc.workspaceId}`;
      const g = map.get(key) ?? {
        key,
        title: doc.tracker ? [doc.tracker.title, doc.tracker.company].filter(Boolean).join(" — ") : doc.title.replace(/^(Resume|Cover letter) — /, ""),
        subtitle: doc.tracker ? `Tracker status: ${doc.tracker.status}` : "Not in the tracker",
        trackerId: doc.tracker?.id ?? null,
        workspaceId: doc.workspaceId,
        docs: [],
      };
      g.docs.push(doc);
      map.set(key, g);
    }
    return [...map.values()];
  }, [d]);

  async function action(item: LibraryItem, a: "duplicate" | "start" | "delete") {
    setErr(null);
    if (a === "duplicate") return setDup(item);
    if (a === "delete") {
      if (!window.confirm(`Delete the template “${item.title}”? This can’t be undone.`)) return;
      try {
        await api(`/api/library/${item.id}`, { method: "DELETE" });
        await load();
      } catch (e) {
        setErr(errorMessage(e));
      }
      return;
    }
    if (item.kind === "cover_letter") return setUseCover(item);
    try {
      const r = await api<{ workspaceId: string }>(`/api/library/${item.id}/actions`, { body: { action: "start" } });
      router.push(`/studio/${r.workspaceId}?step=inputs`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function addToTracker(workspaceId: string) {
    try {
      await api("/api/tracker", { body: { fromWorkspaceId: workspaceId } });
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Saved Documents</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Templates & application documents</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        Keep up to {TEMPLATE_LIMIT} reusable resume templates and {TEMPLATE_LIMIT} cover letter templates as starting points. Documents tailored for a specific application are
        stored with that application and don’t count toward the limit.
      </p>
      {err && <Alert kind="error" className="mt-5">{err}</Alert>}

      {!d ? (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={170} />
          ))}
        </div>
      ) : (
        <>
          {(["resume", "cover_letter"] as const).map((kind) => {
            const list = d.templates.filter((t) => t.kind === kind);
            const Icon = kind === "resume" ? FileText : Mail;
            return (
              <section key={kind} className="mt-8" aria-labelledby={`h-${kind}`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Icon className="size-5 text-brand" aria-hidden />
                  <h2 id={`h-${kind}`} className="font-display text-xl font-semibold">
                    {kind === "resume" ? "Resume templates" : "Cover letter templates"}
                  </h2>
                  <Badge tone={list.length >= d.limit ? "warn" : "neutral"}>
                    {list.length} / {d.limit}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => (
                    <TemplateCard key={t.id} item={t} onOpen={(tab) => setOpen({ item: t, tab })} onAction={(a) => action(t, a)} />
                  ))}
                  {list.length < d.limit && (
                    <button
                      onClick={() => setCreating(kind)}
                      className="flex min-h-[170px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-ink-2 hover:border-brand hover:bg-brand-soft/30 hover:text-brand"
                    >
                      <FilePlus2 className="size-5" aria-hidden />
                      New {kind === "resume" ? "resume" : "cover letter"} template
                      <span className="text-xs text-muted">{d.limit - list.length} slot{d.limit - list.length === 1 ? "" : "s"} left</span>
                    </button>
                  )}
                </div>
                {list.length > d.limit && <p className="mt-2 text-xs text-mod-ink">You have more than {d.limit} templates from an earlier version. Delete some to add new ones.</p>}
              </section>
            );
          })}

          <section className="mt-10" aria-labelledby="h-app">
            <h2 id="h-app" className="font-display text-xl font-semibold">Application documents</h2>
            <p className="mb-3 text-sm text-muted">Final documents saved from Resume Studio, kept with their application and tracker record.</p>
            {groups.length === 0 ? (
              <EmptyState icon={<FileText className="size-5" />} title="No application documents yet">
                In Resume Studio, use “Save to this application” after reviewing your tailored resume or cover letter.
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <Card key={g.key} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{g.title}</p>
                        <p className="text-xs text-muted">{g.subtitle}</p>
                      </div>
                      {g.workspaceId && (
                        <Link href={`/studio/${g.workspaceId}`} className="text-sm text-brand hover:underline">
                          Open in Studio
                        </Link>
                      )}
                      {g.trackerId ? (
                        <Link href="/tracker" className="text-sm text-brand hover:underline">
                          Tracker
                        </Link>
                      ) : (
                        g.workspaceId && (
                          <Button size="sm" onClick={() => addToTracker(g.workspaceId!)}>
                            Add to tracker
                          </Button>
                        )
                      )}
                    </div>
                    <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                      {g.docs.map((doc) => (
                        <li key={doc.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                          {doc.kind === "resume" ? <FileText className="size-4 text-muted" /> : <Mail className="size-4 text-muted" />}
                          <span className="min-w-0 flex-1 truncate">{KIND_LABEL[doc.kind]}</span>
                          <span className="text-xs text-muted">saved {new Date(doc.updatedAt).toLocaleDateString()}</span>
                          <Button size="sm" variant="ghost" onClick={() => setPreview(doc)}>
                            Preview
                          </Button>
                          {exportLinks(doc.id).map(({ f, href }) => (
                            <a key={f} href={href} className="rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft">
                              {f.toUpperCase()}
                            </a>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {open && (
        <TemplateDialog
          key={open.item.id}
          item={open.item}
          initialTab={open.tab}
          onClose={() => setOpen(null)}
          onChanged={(i) => {
            setOpen({ item: i });
            void load();
          }}
        />
      )}
      {creating && d && (
        <NewTemplateDialog
          kind={creating}
          starters={d.starters}
          workspaces={workspaces}
          onClose={() => setCreating(null)}
          onSaved={(i) => {
            setCreating(null);
            void load().then(() => setOpen({ item: i }));
          }}
        />
      )}
      {dup && (
        <SaveTemplateDialog
          open
          kind={dup.kind}
          source={{ duplicateOf: dup.id }}
          defaultName={`Copy of ${dup.title}`.slice(0, 120)}
          onClose={() => setDup(null)}
          onSaved={() => {
            setDup(null);
            void load();
          }}
        />
      )}
      {useCover && <UseCoverDialog item={useCover} workspaces={workspaces} onClose={() => setUseCover(null)} />}
      {preview && (
        <Dialog open onClose={() => setPreview(null)} fullWidth maxWidth="md" aria-labelledby="doc-preview-title">
          <DialogTitle id="doc-preview-title">{preview.title}</DialogTitle>
          <DialogContent sx={{ bgcolor: "var(--surface-2)" }}>
            <DocumentPreview kind={preview.kind} content={preview.content} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreview(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
