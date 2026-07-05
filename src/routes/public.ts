import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db/client.ts";
import { surfaces } from "../db/schema.ts";

const publicRoutes = new Hono();

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const surfacePage = (title: string, slug: string, embed = false): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/app/styles.css" />
</head>
<body class="${embed ? "embed" : "surface"}">
  <main class="guestbook" data-surface="${escapeHtml(slug)}">
    <header><h1>${escapeHtml(title)}</h1></header>
    <section id="feed" class="feed"></section>
    <section class="editor-shell">
      <canvas id="editor-canvas" width="256" height="192"></canvas>
      <div class="editor-toolbar">
        <button type="button" data-tool="pen">Pen</button>
        <button type="button" data-tool="eraser">Eraser</button>
        <button type="button" data-tool="clear">Clear</button>
        <input type="text" id="author-name" maxlength="32" placeholder="Your name (optional)" />
        <button type="button" id="submit-entry">Submit</button>
      </div>
      <p id="submit-status"></p>
    </section>
  </main>
  <script type="module" src="/app/guestbook.js"></script>
  <script type="module" src="/app/editor.js"></script>
</body>
</html>`;

publicRoutes.get("/", (c) => c.redirect("/s/roberto-guestbook"));

publicRoutes.get("/s/:surfaceSlug", (c) => {
  const slug = c.req.param("surfaceSlug");
  const surface = db
    .select()
    .from(surfaces)
    .where(eq(surfaces.slug, slug))
    .get();

  if (!surface) {
    return c.text("Surface not found", 404);
  }

  return c.html(surfacePage(surface.title, surface.slug));
});

publicRoutes.get("/embed/:surfaceSlug", (c) => {
  const slug = c.req.param("surfaceSlug");
  const surface = db
    .select()
    .from(surfaces)
    .where(eq(surfaces.slug, slug))
    .get();

  if (!surface) {
    return c.text("Surface not found", 404);
  }

  c.header("Content-Security-Policy", "frame-ancestors https://*.omg.lol");
  return c.html(surfacePage(surface.title, surface.slug, true));
});

export { publicRoutes };
