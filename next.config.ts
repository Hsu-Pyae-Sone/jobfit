import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Everything (fonts included, via next/font) is served from this origin; the browser never
// talks to Supabase or the AI provider directly.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // These packages read their own data/worker files from disk at runtime, so they must
  // be loaded from node_modules rather than bundled.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "pdfkit", "mammoth", "all-the-cities", "i18n-iso-countries"],
  // ...and those data files must be shipped with the serverless functions (Vercel).
  outputFileTracingIncludes: {
    "/api/extract": [
      "./node_modules/tesseract.js/src/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
    ],
    "/api/**/*": ["./node_modules/pdfkit/js/data/**/*", "./node_modules/all-the-cities/cities.pbf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
