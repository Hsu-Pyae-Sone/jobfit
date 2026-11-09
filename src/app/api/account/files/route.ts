import { store } from "@/lib/server/context";
import { handle, json } from "@/lib/server/http";

export const GET = handle(async () => json({ files: await store().fileList() }));
