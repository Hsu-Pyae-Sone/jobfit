import "server-only";
import type { ProfileOption } from "../../jobs/types";
import { currentResumeText } from "../../resume/compose";
import { store } from "../context";
import { getLibraryItem, getWorkspace, listLibrary, listWorkspaces } from "../db";

// A "profile" is a verified resume used for matching and recommendations: the user's
// master career profile, a Studio application's confirmed resume, or a Library resume.

export interface Profile {
  id: string;
  label: string;
  text: string;
  resumeText: string;
  extra: Record<string, string>;
}

const nonEmpty = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim()));

export async function listProfiles(): Promise<ProfileOption[]> {
  const out: ProfileOption[] = [];
  const me = await store().profileGet();
  if (me.masterResumeConfirmed && me.masterResume.trim()) out.push({ id: "master", label: "My master profile", detail: "Master career profile" });
  for (const s of await listWorkspaces()) {
    const ws = await getWorkspace(s.id);
    if (!ws?.inputs.resumeConfirmed || !ws.inputs.resumeText.trim()) continue;
    out.push({ id: `ws:${ws.id}`, label: ws.title, detail: ws.finalResume || ws.optimization ? "Studio · tailored resume" : "Studio · confirmed resume" });
  }
  for (const item of await listLibrary()) {
    if (item.kind === "resume") out.push({ id: `lib:${item.id}`, label: item.title, detail: item.category === "template" ? "Resume template" : "Application resume" });
  }
  return out;
}

export async function getProfile(id: string | null | undefined): Promise<Profile | null> {
  if (!id) return null;
  if (id === "master") {
    const me = await store().profileGet();
    if (!me.masterResumeConfirmed || !me.masterResume.trim()) return null;
    const extra = nonEmpty(me.masterExtra as unknown as Record<string, string>);
    return { id, label: "My master profile", resumeText: me.masterResume, extra, text: [me.masterResume, ...Object.values(extra)].join("\n") };
  }
  const [kind, ref] = id.split(":");
  if (kind === "ws") {
    const ws = await getWorkspace(ref);
    if (!ws?.inputs.resumeConfirmed) return null;
    const resumeText = currentResumeText(ws);
    const extra = nonEmpty(ws.inputs.extra as unknown as Record<string, string>);
    return { id, label: ws.title, resumeText, extra, text: [resumeText, ...Object.values(extra)].join("\n") };
  }
  if (kind === "lib") {
    const item = await getLibraryItem(ref);
    if (!item || item.kind !== "resume") return null;
    return { id, label: item.title, resumeText: item.content, extra: {}, text: item.content };
  }
  return null;
}
