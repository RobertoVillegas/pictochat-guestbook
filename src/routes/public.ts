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

const pcKey = (label: string, key: string, extraClass = ""): string =>
  `<button type="button" class="pc-key${extraClass ? ` ${extraClass}` : ""}" data-key="${escapeHtml(key)}">${label}</button>`;

const demoPage = (): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PictoChat Paper Demo</title>
  <link rel="stylesheet" href="/picto-paper/picto-paper.css" />
</head>
<body>
  <main class="pc-demo">
    <div class="pc-device">
      <section class="pc-top">
        <aside class="pc-sidebar-top" aria-hidden="true">
          <div class="pc-sidebar-swatch pc-sidebar-swatch--red"></div>
          <div class="pc-sidebar-swatch pc-sidebar-swatch--blue"></div>
          <div class="pc-sidebar-swatch pc-sidebar-swatch--green"></div>
          <div class="pc-sidebar-swatch pc-sidebar-swatch--yellow"></div>
          <div class="pc-sidebar-bars">
            <div class="pc-sidebar-bar"></div>
            <div class="pc-sidebar-bar"></div>
            <div class="pc-sidebar-bar"></div>
            <div class="pc-sidebar-bar"></div>
          </div>
        </aside>
        <div class="pc-feed" id="pc-feed"></div>
      </section>
      <section class="pc-composer">
        <aside class="pc-sidebar-bottom" aria-hidden="true">
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-divider"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-divider"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
          <div class="pc-sidebar-slot"></div>
        </aside>
        <div class="pc-composer-main">
          <div class="pc-message">
            <input class="pc-nametag" id="pc-author" type="text" maxlength="32" placeholder="name" autocomplete="nickname" />
            <div class="pc-message-body">
              <canvas class="pc-canvas" id="pc-canvas" width="437" height="151"></canvas>
              <div class="pc-ruled-lines" aria-hidden="true">
                <div class="pc-ruled-line pc-ruled-line--1"></div>
                <div class="pc-ruled-line pc-ruled-line--2"></div>
                <div class="pc-ruled-line pc-ruled-line--3"></div>
                <div class="pc-ruled-line pc-ruled-line--4"></div>
              </div>
            </div>
          </div>
          <div class="pc-input-row">
            <div class="pc-keyboard">
              <div class="pc-keys">
                <div class="pc-key-row">
                  ${pcKey("1", "1")}${pcKey("2", "2")}${pcKey("3", "3")}${pcKey("4", "4")}${pcKey("5", "5")}${pcKey("6", "6")}${pcKey("7", "7")}${pcKey("8", "8")}${pcKey("9", "9")}${pcKey("0", "0")}${pcKey("-", "-")}${pcKey("=", "=")}
                </div>
                <div class="pc-key-row">
                  ${pcKey("q", "q")}${pcKey("w", "w")}${pcKey("e", "e")}${pcKey("r", "r")}${pcKey("t", "t")}${pcKey("y", "y")}${pcKey("u", "u")}${pcKey("i", "i")}${pcKey("o", "o")}${pcKey("p", "p")}
                  <button type="button" class="pc-key pc-key--wide" data-key="Backspace">←</button>
                </div>
                <div class="pc-key-row">
                  <button type="button" class="pc-key pc-key--caps" data-key="Caps">CAPS</button>
                  ${pcKey("a", "a")}${pcKey("s", "s")}${pcKey("d", "d")}${pcKey("f", "f")}${pcKey("g", "g")}${pcKey("h", "h")}${pcKey("j", "j")}${pcKey("k", "k")}${pcKey("l", "l")}
                  <button type="button" class="pc-key pc-key--enter" data-key="Enter"><span class="pc-enter-arrow">↵</span><span class="pc-enter-label">ENTER</span></button>
                </div>
                <div class="pc-key-row">
                  <button type="button" class="pc-key pc-key--wide" data-key="Shift">SHIFT</button>
                  ${pcKey("z", "z")}${pcKey("x", "x")}${pcKey("c", "c")}${pcKey("v", "v")}${pcKey("b", "b")}${pcKey("n", "n")}${pcKey("m", "m")}${pcKey(",", ",")}${pcKey(".", ".")}${pcKey("/", "/")}
                </div>
                <div class="pc-key-row">
                  ${pcKey(";", ";")}${pcKey("'", "'")}
                  <button type="button" class="pc-key pc-key--space" data-key=" "></button>
                  ${pcKey("[", "[")}${pcKey("]", "]")}
                </div>
              </div>
            </div>
            <div class="pc-controls">
              <button type="button" class="pc-control pc-control--send" id="pc-control-send" aria-label="Send">
                <svg class="pc-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16 L12 4 L20 16 M12 4 L12 20" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="pc-control-label">SEND</span>
              </button>
              <button type="button" class="pc-control pc-control--back" id="pc-control-back" aria-label="Back">
                <svg class="pc-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 L12 20 M12 20 L6 14 M12 20 L18 14" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button type="button" class="pc-control pc-control--clear" id="pc-control-clear" aria-label="Clear">
                <div class="pc-spinner" aria-hidden="true">
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                  <div class="pc-spinner-spoke"></div>
                </div>
              </button>
            </div>
          </div>
        </div>
        <button type="button" class="pc-close" aria-label="Close">✕</button>
      </section>
    </div>
    <p class="pc-status" id="pc-status"></p>
  </main>
  <script type="module" src="/app/demo.js"></script>
</body>
</html>`;

publicRoutes.get("/demo", (c) => c.html(demoPage()));

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
