"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { Workspace, WorkspaceSummary } from "@/lib/types";
import { Alert, Badge, Button, Card, Input, Spinner } from "./ui";

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function NewApplicationForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { workspace } = await api<{ workspace: Workspace }>("/api/workspaces", { body: { title } });
      router.push(`/studio/${workspace.id}`);
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
      <Input
        autoFocus={autoFocus}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Data Analyst — Northwind Health"
        aria-label="Application name"
        maxLength={200}
      />
      <Button type="submit" variant="primary" loading={busy} icon={<Plus className="size-4" />}>
        New application
      </Button>
      {err && <p className="text-sm text-del-ink">{err}</p>}
    </form>
  );
}

export function WorkspaceList({ limit, allowDelete }: { limit?: number; allowDelete?: boolean }) {
  const [items, setItems] = useState<WorkspaceSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ workspaces: WorkspaceSummary[] }>("/api/workspaces")
      .then((r) => setItems(r.workspaces))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  async function remove(w: WorkspaceSummary) {
    if (!confirm(`Delete “${w.title}”? This removes its documents and analysis.`)) return;
    try {
      await api(`/api/workspaces/${w.id}`, { method: "DELETE" });
      setItems((cur) => cur?.filter((x) => x.id !== w.id) ?? null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  if (err) return <Alert kind="error">{err}</Alert>;
  if (!items) return <Spinner label="Loading applications…" />;
  if (!items.length)
    return <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">No applications yet. Create one to get started.</p>;

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {items.slice(0, limit).map((w) => (
        <div key={w.id} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
          <Link href={`/studio/${w.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{w.title}</p>
              <p className="text-xs text-muted">Updated {timeAgo(w.updatedAt)}</p>
            </div>
            <Badge tone={w.stage === "Reviewed" ? "add" : "brand"} className="hidden sm:inline-flex">
              {w.stage}
            </Badge>
            <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          {allowDelete && (
            <button onClick={() => remove(w)} className="rounded-lg p-2 text-muted hover:bg-del-bg hover:text-del-ink" aria-label={`Delete ${w.title}`}>
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
    </Card>
  );
}
