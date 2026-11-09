"use client";

import { useState } from "react";
import { FolderPlus, LayoutTemplate } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { LibraryKind } from "@/lib/types";
import { SaveTemplateDialog } from "../library/SaveTemplateDialog";
import { Button } from "../ui";

/** "Save to this application" (kept with its tracker record) and "Save as template" (reusable, max 3). */
export function SaveDocButtons({ workspaceId, kind, title }: { workspaceId: string; kind: LibraryKind; title: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [tpl, setTpl] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveToApplication() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/library", { body: { action: "application", workspaceId, kinds: [kind] } });
      setMsg("Saved with this application in Saved Documents.");
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy} icon={<FolderPlus className="size-3.5" />} onClick={saveToApplication}>
          Save to this application
        </Button>
        <Button size="sm" variant="ghost" icon={<LayoutTemplate className="size-3.5" />} onClick={() => setTpl(true)}>
          Save as template
        </Button>
        {msg && <span className="text-sm text-brand">{msg}</span>}
      </div>
      {tpl && (
        <SaveTemplateDialog
          open
          kind={kind}
          source={{ fromWorkspaceId: workspaceId }}
          defaultName={title.slice(0, 120)}
          onClose={() => setTpl(false)}
          onSaved={(i) => {
            setTpl(false);
            setMsg(`Saved as template “${i.title}”.`);
          }}
        />
      )}
    </>
  );
}
