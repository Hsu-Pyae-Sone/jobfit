import { aiConfigured, MODEL } from "@/lib/server/ai";
import { json } from "@/lib/server/http";

export async function GET() {
  return json({ aiConfigured: aiConfigured(), model: MODEL });
}
