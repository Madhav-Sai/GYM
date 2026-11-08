import type { NextConfig } from "next";

// The browser only ever talks to this origin. /api/* is proxied to the Fastify API (Render),
// so the session cookie is first-party (works in Safari/ITP) and no CORS is needed.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@gym/types", "@gym/ui"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};
export default config;
