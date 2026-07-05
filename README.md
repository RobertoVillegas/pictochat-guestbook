# pictochat-guestbook

A DS/PictoChat-style visual guestbook for [roberto.omg.lol](https://roberto.omg.lol). Every entry is a **PictoCard**: a canvas document of strokes, glyphs, and stamps stored as compressed JSON (the source of truth), with a WebP preview as a read cache. New entries show up in the feed in realtime.

Stack: Bun · Hono · SQLite (Drizzle) · better-auth · Zod · Vite 8 (Rolldown) · Ultracite (oxc) · Lefthook · Docker.

## Quick start

```bash
bun install
cp .env.example .env   # fill in the values
bun run db:migrate && bun run seed
bun run build && bun run dev
```

Or with Docker:

```bash
docker compose up --build
```

## How it works

- Visitors are anonymous; they can pick and change a nickname anytime (stored locally, sent as `author_name` per entry).
- Entries are published immediately by default (`MODERATION_MODE=auto`). Set `MODERATION_MODE=manual` to hold new entries for approval instead.
- The admin can hide or delete anything at any time. Admin auth is handled by better-auth; the single admin account is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- The feed updates live via server-sent events.

The original DS sprite assets used as visual reference are not redistributed in this repository.
