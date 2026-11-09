import { store } from "@/lib/server/context";
import { extractFile, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, mimeOf, sniff } from "@/lib/server/extract";
import { handle, HttpError, json } from "@/lib/server/http";
import { normalizeText } from "@/lib/resume/parse";

export const maxDuration = 300;

const PURPOSES = new Set(["resume", "job", "master-resume", "other"]);

export const POST = handle(async (req: Request) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, `Files must be ${MAX_UPLOAD_LABEL} or smaller.`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected a file upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file was uploaded.");
  const preferAi = form.get("engine") === "ai";
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await extractFile(buf, file.name, preferAi);
  const text = normalizeText(result.text);
  if (!text) throw new HttpError(422, "No text could be found in that file.");

  // Keep the original privately in the user's account (only files that were read successfully).
  let stored = null;
  if (form.get("keep") !== "0") {
    const purpose = String(form.get("purpose") ?? "other");
    stored = await store().fileSave({ fileName: file.name.slice(0, 200) || "upload", mime: mimeOf(sniff(buf)), purpose: PURPOSES.has(purpose) ? purpose : "other" }, buf);
  }
  return json({ ...result, text, fileName: file.name, storedFileId: stored?.id ?? null });
});
