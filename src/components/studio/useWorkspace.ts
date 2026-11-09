"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { Workspace } from "@/lib/types";

type Patch = Record<string, unknown>;

export interface WorkspaceCtx {
  ws: Workspace;
  aiConfigured: boolean;
  /** Persist a partial update (merged server-side). */
  save: (patch: Patch) => Promise<Workspace | null>;
  /** Run a server action such as "analyze"; returns true on success. */
  run: (action: string, body?: unknown) => Promise<boolean>;
  /** Reload the application from the server (after changes made elsewhere). */
  refresh: () => Promise<void>;
  busy: string | null;
  error: string | null;
  setError: (e: string | null) => void;
  saving: boolean;
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWs(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWs must be used inside WorkspaceContext");
  return ctx;
}

export function useWorkspaceState(id: string) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiConfigured, setAi] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve() as Promise<unknown>);

  useEffect(() => {
    api<{ workspace: Workspace }>(`/api/workspaces/${id}`)
      .then((r) => setWs(r.workspace))
      .catch((e) => setLoadError(errorMessage(e)));
    api<{ aiConfigured: boolean }>("/api/status")
      .then((r) => setAi(r.aiConfigured))
      .catch(() => setAi(false));
  }, [id]);

  // Saves are serialised so a slow request can't overwrite a newer one.
  const save = useCallback(
    (patch: Patch) => {
      const p = queue.current.then(async () => {
        setSaving(true);
        try {
          const r = await api<{ workspace: Workspace }>(`/api/workspaces/${id}`, { method: "PATCH", body: patch });
          setWs(r.workspace);
          return r.workspace;
        } catch (e) {
          setError(errorMessage(e));
          return null;
        } finally {
          setSaving(false);
        }
      });
      queue.current = p.catch(() => undefined);
      return p;
    },
    [id],
  );

  const run = useCallback(
    async (action: string, body: unknown = {}) => {
      setBusy(action);
      setError(null);
      try {
        await queue.current;
        const r = await api<{ workspace: Workspace }>(`/api/workspaces/${id}/${action}`, { body });
        setWs(r.workspace);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [id],
  );

  const refresh = useCallback(async () => {
    try {
      setWs((await api<{ workspace: Workspace }>(`/api/workspaces/${id}`)).workspace);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  return { ws, setWs, loadError, aiConfigured, save, run, refresh, busy, error, setError, saving };
}
