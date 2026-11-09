import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { localModeAllowed, supabaseConfigured, supabaseEnv } from "@/lib/server/env";

// Runs before every page and API request:
// 1. Rejects cross-site API requests, so another website open in the same browser cannot
//    trigger AI calls or change saved data.
// 2. Refreshes the Supabase session cookie and sends signed-out visitors to /login.
//    (Every API route also verifies the user itself; this is the first line, not the only one.)
// 3. Without Supabase, local single-user mode only answers on localhost.

const PUBLIC_PAGES = ["/login", "/auth/"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function crossSite(request: NextRequest): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && request.method !== "GET" && request.method !== "HEAD") {
    try {
      if (new URL(origin).host !== request.headers.get("host")) {
        return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  // Form posts to /auth/* (sign out) get the same origin check as the API.
  if (isApi || (path.startsWith("/auth/") && request.method !== "GET")) {
    const blocked = crossSite(request);
    if (blocked) return blocked;
  }

  if (!supabaseConfigured()) {
    if (localModeAllowed()) {
      if (!LOCAL_HOSTS.has(request.nextUrl.hostname)) {
        return new NextResponse("Local mode is only available on localhost.", { status: 403 });
      }
      if (path === "/login") return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  // getClaims verifies the token (and refreshes an expired session via setAll).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const isPublic = PUBLIC_PAGES.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));
  if (!signedIn && !isPublic) {
    if (isApi) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const login = new URL("/login", request.url);
    if (path !== "/") login.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (signedIn && path === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
