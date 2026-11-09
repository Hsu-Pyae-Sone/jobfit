// Plain-text cover letter <-> structured parts. Used by Library export and templates.

export interface LetterParts {
  headerLines: string[];
  greeting: string;
  paragraphs: string[];
  closing: string;
  signatureName: string;
}

const SIGNOFF = /^(sincerely|kind regards|best regards|regards|best|yours sincerely|yours faithfully|thank you|with appreciation|ystävällisin terveisin|mit freundlichen grüßen)[,!.]?$/i;

export function parseLetter(text: string): LetterParts {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const gIdx = blocks.findIndex((b) => /^(dear|hello|hi|to)\b/i.test(b.split("\n")[0]));
  const headerLines = gIdx > 0 ? blocks.slice(0, gIdx).join("\n").split("\n") : [];
  const body = gIdx >= 0 ? blocks.slice(gIdx) : blocks;
  let greeting = "";
  if (gIdx >= 0) {
    const [first, ...rest] = body[0].split("\n");
    greeting = first;
    if (rest.length) body[0] = rest.join("\n");
    else body.shift();
  }
  let closing = "";
  let signatureName = "";
  const last = body[body.length - 1]?.split("\n") ?? [];
  const sIdx = last.findIndex((l) => SIGNOFF.test(l.trim()));
  if (sIdx >= 0) {
    closing = last[sIdx].trim();
    signatureName = last.slice(sIdx + 1).join(" ").trim();
    const before = last.slice(0, sIdx).join("\n").trim();
    body.pop();
    if (before) body.push(before);
  }
  return { headerLines, greeting, paragraphs: body.map((p) => p.replace(/\n/g, " ")), closing, signatureName };
}
