import { createRequestHandler } from "react-router";
import { contentSecurityPolicy, SECURITY_HEADERS } from "../app/lib/security-headers";
import type { Env } from "./env";

// Dynamic import of the React Router server-build virtual module — the
// shape the @cloudflare/vite-plugin's React Router integration expects.
// A static `import * as build from "virtual:..."` confuses the worker
// bundler at deploy time (it tries to resolve the virtual module
// without going through the SSR environment first).
const handler = createRequestHandler(
  () => import("virtual:react-router/server-build" as string),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const response = await handler(request, { cloudflare: { env, ctx } });
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    if (!headers.has("Content-Security-Policy")) {
      headers.set("Content-Security-Policy", contentSecurityPolicy());
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
