"use client";

import { useEffect, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { LibraryItem } from "@/lib/types";
import { Button, Card, Select } from "../ui";
import { useWs } from "./useWorkspace";

/** Load a saved resume template into this application (the user then reviews and confirms it). */
export function ResumeTemplatePicker() {
  const { ws, refresh } = useWs();
  const [templates, setTemplates] = useState<LibraryItem[]>([]);
  const [id, setId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ templates: LibraryItem[] }>("/api/library")
      .then((r) => setTemplates(r.templates.filter((t) => t.kind === "resume")))
      .catch(() => setTemplates([]));
  }, []);

  if (!templates.length || ws.optimization) return null;

  async function use() {
    if (ws.inputs.resumeText.trim() && !confirm("Replace the resume text in this application with the template?")) return;
    setMsg(null);
    try {
      await api(`/api/library/${id}/actions`, { body: { action: "apply", workspaceId: ws.id } });
      await refresh();
      setMsg("Template loaded. Replace any [placeholders], then confirm the text.");
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  return (
    <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
      <LayoutTemplate className="size-5 text-brand" aria-hidden />
      <p className="text-sm font-medium">Start from a saved resume template</p>
      <div className="min-w-48 flex-1">
        <Select aria-label="Resume template" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      </div>
      <Button size="sm" disabled={!id} onClick={use}>
        Use template
      </Button>
      {msg && <p className="w-full text-xs text-brand">{msg}</p>}
    </Card>
  );
}
