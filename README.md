# pictochat-guestbook

Guestbook visual estilo DS/PictoChat para [roberto.omg.lol](https://roberto.omg.lol). Cada entrada es una **PictoCard**: un documento canvas de strokes, glyphs y stamps guardado como JSON comprimido (fuente de verdad), con preview WebP como cache de lectura.

Stack: Bun · Hono · SQLite (drizzle) · better-auth · zod · Vite 8 (rolldown) · ultracite (oxc) · lefthook · Docker/Dokploy.

```bash
bun install
cp .env.example .env   # y llena los valores
bun run db:migrate && bun run seed
bun run build && bun run dev
```

Los visitantes son anónimos (nickname editable); la moderación es manual: toda entrada nace `pending` y solo lo aprobado aparece en el feed.

Los sprites de referencia del DS no se redistribuyen en este repo.
