"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { EditableField, StatusDef, TrackerEntry, VersionOption } from "@/lib/tracker/types";

export type Patch = Partial<Pick<TrackerEntry, EditableField>>;

export function useTracker() {
  const [entries, setEntries] = useState<TrackerEntry[] | null>(null);
  const [statuses, setStatuses] = useState<StatusDef[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<{ entries: TrackerEntry[]; statuses: StatusDef[]; versions: VersionOption[] }>("/api/tracker")
        .then((r) => {
          setEntries(r.entries);
          setStatuses(r.statuses);
          setVersions(r.versions);
        })
        .catch((e) => setError(errorMessage(e))),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = (e: TrackerEntry) => setEntries((cur) => cur?.map((x) => (x.id === e.id ? e : x)) ?? null);

  /** Optimistic update; the server's version (with history / dates) replaces it. */
  const update = useCallback(async (id: string, patch: Patch) => {
    setEntries((cur) => cur?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);
    try {
      replace((await api<{ entry: TrackerEntry }>(`/api/tracker/${id}`, { method: "PATCH", body: patch })).entry);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      void reload();
      return false;
    }
  }, [reload]);

  const create = useCallback(async (entry: Patch) => {
    const r = await api<{ entry: TrackerEntry }>("/api/tracker", { body: { entry } });
    setEntries((cur) => [r.entry, ...(cur ?? [])]);
    return r.entry;
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await api(`/api/tracker/${id}`, { method: "DELETE" });
      setEntries((cur) => cur?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const addFeedback = useCallback(async (id: string, note: { date: string; stage: string; text: string }) => {
    replace((await api<{ entry: TrackerEntry }>(`/api/tracker/${id}/feedback`, { body: note })).entry);
  }, []);

  const removeFeedback = useCallback(async (id: string, noteId: string) => {
    try {
      replace((await api<{ entry: TrackerEntry }>(`/api/tracker/${id}/feedback?noteId=${noteId}`, { method: "DELETE" })).entry);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const saveStatuses = useCallback(
    async (list: StatusDef[], reassign: Record<string, string>) => {
      const r = await api<{ statuses: StatusDef[] }>("/api/tracker/statuses", { method: "PUT", body: { statuses: list, reassign } });
      setStatuses(r.statuses);
      await reload();
    },
    [reload],
  );

  return { entries, statuses, versions, error, setError, update, create, remove, addFeedback, removeFeedback, saveStatuses, reload };
}
