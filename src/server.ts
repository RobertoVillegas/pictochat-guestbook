import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import { auth } from "./auth.ts";
import { env } from "./env.ts";
import { admin } from "./routes/admin.ts";
import { api } from "./routes/api.ts";
import { publicRoutes } from "./routes/public.ts";

const app = new Hono();

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api", api);
app.route("/admin", admin);
app.route("/", publicRoutes);

// static directories with relative asset paths need the trailing slash
app.get("/proto", (c) => c.redirect("/proto/", 301));

app.use(
  "/media/*",
  serveStatic({
    rewriteRequestPath: (requestPath) => requestPath.replace(/^\/media/u, ""),
    root: env.MEDIA_ROOT,
  })
);
app.use("/*", serveStatic({ root: "./public" }));

app.get("/health", (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  // SSE streams heartbeat every 25s; Bun's default 10s idleTimeout kills them
  idleTimeout: 60,
  port: env.PORT,
};
