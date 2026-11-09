import { z } from "zod";
import { fetchUrlText } from "@/lib/server/fetch-url";
import { handle, json, readJson } from "@/lib/server/http";

export const POST = handle(async (req: Request) => {
  const { url } = z.object({ url: z.string().min(4).max(2000) }).parse(await readJson(req));
  const text = await fetchUrlText(url);
  return json({ text });
});
