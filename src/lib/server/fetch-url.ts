import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

// Fetches a user-supplied job/company URL. The DNS lookup used for the actual connection
// rejects private, loopback and link-local addresses, so the server cannot be pointed at
// internal services (including via redirects or DNS rebinding).

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export class FetchUrlError extends Error {}

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false; // multicast + reserved
    return true;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === "::" || lower === "::1") return false;
    if (/^f[cd]/.test(lower)) return false; // unique local
    if (/^fe[89ab]/.test(lower)) return false; // link local
    if (/^ff/.test(lower)) return false; // multicast
    return true;
  }
  return false;
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (addresses as dns.LookupAddress[]).filter((a) => isPublicAddress(a.address));
    if (!list.length) return callback(new FetchUrlError("That address is not allowed."), "", 4);
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function request(url: URL): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; Jobfit/1.0; job-posting reader)",
          accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new FetchUrlError("The page is too large."));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new FetchUrlError("The page took too long to respond.")));
    req.on("error", reject);
  });
}

function decode(body: Buffer, encoding: string | undefined): Buffer {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
      return zlib.gunzipSync(body, { maxOutputLength: MAX_BYTES * 4 });
    case "deflate":
      return zlib.inflateSync(body, { maxOutputLength: MAX_BYTES * 4 });
    case "br":
      return zlib.brotliDecompressSync(body, { maxOutputLength: MAX_BYTES * 4 });
    default:
      return body;
  }
}

export { htmlToText } from "../html";
import { htmlToText } from "../html";

export async function fetchUrlText(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchUrlError("That is not a valid URL.");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchUrlError("Only http and https links are supported.");
    if (url.username || url.password) throw new FetchUrlError("Links with credentials are not supported.");
    // Node skips the DNS lookup for literal IPs, so check those directly.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) throw new FetchUrlError("That address is not allowed.");
    let res;
    try {
      res = await request(url);
    } catch (e) {
      if (e instanceof FetchUrlError) throw e;
      throw new FetchUrlError("Could not reach that page.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, url);
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 999)
      throw new FetchUrlError("That site blocks automated access (many job boards require sign-in). Paste the job description text instead.");
    if (res.status >= 400) throw new FetchUrlError(`The page returned an error (${res.status}).`);
    const type = String(res.headers["content-type"] ?? "");
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new FetchUrlError("That link is not a web page. Upload the file instead.");
    const body = decode(res.body, res.headers["content-encoding"] as string | undefined).toString("utf8");
    const text = /html/i.test(type) ? htmlToText(body) : body.trim();
    if (text.length < 200) throw new FetchUrlError("Very little text was found on that page (it may need JavaScript or sign-in). Paste the text instead.");
    return text.slice(0, 40000);
  }
  throw new FetchUrlError("Too many redirects.");
}
