import { desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db/client.ts";
import { entries } from "../db/schema.ts";
import { publishEntry, publishEntryRemoved } from "../lib/realtime.ts";
import { requireAdmin } from "../middleware/require-admin.ts";

const admin = new Hono();
const previewsPrefixRegex = /^previews\//u;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

admin.get("/login", (c) =>
  c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Login</title>
  <link rel="stylesheet" href="/app/styles.css" />
</head>
<body class="admin-page">
  <main class="admin-login">
    <h1>Admin Login</h1>
    <form id="login-form">
      <label>Email <input type="email" name="email" required /></label>
      <label>Password <input type="password" name="password" required /></label>
      <button type="submit">Sign in</button>
      <p id="login-error" class="error" hidden></p>
    </form>
  </main>
  <script type="module" src="/app/admin.js"></script>
</body>
</html>`)
);

admin.get("/", requireAdmin({ mode: "html" }), (c) => {
  const visible = db
    .select()
    .from(entries)
    .where(ne(entries.status, "deleted"))
    .orderBy(desc(entries.createdAt))
    .all();

  const items = visible
    .map((entry) => {
      const actions = [
        entry.status === "approved"
          ? ""
          : '<button type="button" data-action="approve">Approve</button>',
        entry.status === "hidden"
          ? ""
          : '<button type="button" data-action="hide">Hide</button>',
        '<button type="button" data-action="delete">Delete</button>',
      ].join("\n    ");

      return `<article class="admin-entry" data-id="${entry.id}">
  <img src="/media/${entry.previewPath.replace(previewsPrefixRegex, "")}" alt="preview" width="${entry.previewWidth}" height="${entry.previewHeight}" />
  <p>${entry.authorName ? escapeHtml(entry.authorName) : "(anonymous)"} <span class="status status-${entry.status}">${entry.status}</span></p>
  <p class="meta">${escapeHtml(entry.createdAt)}</p>
  <div class="actions">
    ${actions}
  </div>
</article>`;
    })
    .join("\n");

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin — Entries</title>
  <link rel="stylesheet" href="/app/styles.css" />
</head>
<body class="admin-page">
  <main class="admin-dashboard">
    <h1>Entries</h1>
    <section id="entries-list">${items || "<p>No entries.</p>"}</section>
  </main>
  <script type="module" src="/app/admin.js"></script>
</body>
</html>`);
});

admin.post("/entries/:id/approve", requireAdmin({ mode: "api" }), (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const entry = db.select().from(entries).where(eq(entries.id, id)).get();

  if (!entry || !["hidden", "pending"].includes(entry.status)) {
    return c.json({ error: "Entry not found or already approved" }, 404);
  }

  db.update(entries)
    .set({ approvedAt: now, status: "approved" })
    .where(eq(entries.id, id))
    .run();

  publishEntry(entry.surfaceId, {
    author_name: entry.authorName,
    created_at: entry.createdAt,
    id: entry.id,
    preview_path: entry.previewPath,
  });

  return c.json({ ok: true, status: "approved" });
});

admin.post("/entries/:id/hide", requireAdmin({ mode: "api" }), (c) => {
  const id = c.req.param("id");

  const entry = db.select().from(entries).where(eq(entries.id, id)).get();

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (entry.status === "approved") {
    publishEntryRemoved(entry.surfaceId, entry.id);
  }

  db.update(entries).set({ status: "hidden" }).where(eq(entries.id, id)).run();

  return c.json({ ok: true, status: "hidden" });
});

admin.delete("/entries/:id", requireAdmin({ mode: "api" }), (c) => {
  const id = c.req.param("id");

  const entry = db.select().from(entries).where(eq(entries.id, id)).get();

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (entry.status === "approved") {
    publishEntryRemoved(entry.surfaceId, entry.id);
  }

  db.update(entries).set({ status: "deleted" }).where(eq(entries.id, id)).run();

  return c.json({ ok: true, status: "deleted" });
});

export { admin };
