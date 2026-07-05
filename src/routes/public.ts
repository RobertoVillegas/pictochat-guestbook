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
  <link rel="stylesheet" href="/picto-ds/picto-ds.css" />
</head>
<body>
  <main class="guestbook picto-ds picto-page${embed ? " embed" : ""}" data-surface="${escapeHtml(slug)}">
    <div class="picto-shell-frame">
      <div class="picto-shell">
        <section class="picto-screen-top">
          <img class="picto-screen-bg" src="/picto-ds/sprites/screen-touch-striped-bg.png" alt="" width="256" height="192" />
          <img class="picto-logo-bar" src="/picto-ds/sprites/bar-pictochat-logo.png" alt="PictoChat" width="234" height="22" />
          <img class="picto-entering-banner" src="/picto-ds/sprites/banner-now-entering-black.png" alt="Now entering" width="238" height="22" />
          <input class="picto-author-input" type="text" id="author-name" maxlength="32" placeholder="nickname" autocomplete="nickname" />
          <div class="picto-message-list" id="feed"></div>
        </section>
        <section class="picto-composer">
          <img class="picto-composer-bg" src="/picto-ds/sprites/composer-chrome-default.png" alt="" width="256" height="192" />
          <canvas class="picto-canvas" id="picto-canvas" width="228" height="79"></canvas>
          <img class="picto-keyboard" src="/picto-ds/sprites/kbd-latin-main.png" alt="" width="200" height="81" />
          <button type="button" class="picto-send-zone" id="submit-entry" aria-label="Send"></button>
        </section>
      </div>
    </div>
    <p id="submit-status" class="picto-statusbar"></p>
    <div class="picto-toolbar" hidden>
      <button type="button" class="picto-button active" data-tool="pen">Pen</button>
      <button type="button" class="picto-button" data-tool="eraser">Eraser</button>
      <button type="button" class="picto-button" data-tool="clear">Clear</button>
    </div>
  </main>
  <script type="module" src="/app/guestbook.js"></script>
  <script type="module" src="/app/editor.js"></script>
</body>
</html>`;

publicRoutes.get("/", (c) => {
  const slug = "roberto-guestbook";
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
