import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { db } from "../db/client.ts";
import { entries, surfaces } from "../db/schema.ts";
import { env } from "../env.ts";
import { hashWithSalt } from "../lib/hash.ts";
import {
  assertCompressedSize,
  compressJson,
  decompressJson,
  sha256Hex,
} from "../lib/picto-card/compress.ts";
import { deriveText } from "../lib/picto-card/derive-text.ts";
import {
  createEntryBodySchema,
  normalizePictoCard,
} from "../lib/picto-card/schema.ts";
import type { PictoCard } from "../lib/picto-card/schema.ts";
import { createSurfaceMessageStream, publishEntry } from "../lib/realtime.ts";
import type { EntryStreamMetadata } from "../lib/realtime.ts";

const api = new Hono();
const previewDataUrlRegex =
  /^data:image\/(?<format>webp|png);base64,(?<data>.+)$/u;
const previewsPrefixRegex = /^previews\//u;

const entriesQuerySchema = z.object({
  before: z.string().optional(),
});

const toStreamMetadata = (row: {
  authorName: string | null;
  createdAt: string;
  id: string;
  previewPath: string;
}): EntryStreamMetadata => ({
  author_name: row.authorName,
  created_at: row.createdAt,
  id: row.id,
  preview_path: row.previewPath,
});

api.get("/surfaces/:slug/entries", (c) => {
  const slug = c.req.param("slug");
  const query = entriesQuerySchema.parse(c.req.query());

  const surface = db
    .select()
    .from(surfaces)
    .where(eq(surfaces.slug, slug))
    .get();

  if (!surface) {
    return c.json({ error: "Surface not found" }, 404);
  }

  const conditions = [
    eq(entries.surfaceId, surface.id),
    eq(entries.status, "approved"),
  ];

  if (query.before) {
    conditions.push(lt(entries.createdAt, query.before));
  }

  const rows = db
    .select({
      approved_at: entries.approvedAt,
      author_name: entries.authorName,
      created_at: entries.createdAt,
      id: entries.id,
      preview_height: entries.previewHeight,
      preview_path: entries.previewPath,
      preview_width: entries.previewWidth,
    })
    .from(entries)
    .where(and(...conditions))
    .orderBy(desc(entries.createdAt))
    .limit(50)
    .all();

  return c.json(rows);
});

api.get("/surfaces/:slug/stream", (c) => {
  const slug = c.req.param("slug");

  const surface = db
    .select()
    .from(surfaces)
    .where(eq(surfaces.slug, slug))
    .get();

  if (!surface) {
    return c.json({ error: "Surface not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    const reader = createSurfaceMessageStream(surface.id).getReader();

    stream.onAbort(() => {
      void reader.cancel();
    });

    const forwardMessages = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done || stream.aborted) {
        return;
      }
      await stream.writeSSE({ data: value.data, event: value.event });
      return forwardMessages();
    };

    const sendHeartbeats = async (): Promise<void> => {
      if (stream.aborted) {
        return;
      }
      await stream.sleep(25_000);
      if (stream.aborted) {
        return;
      }
      await stream.writeSSE({ data: "", event: "heartbeat" });
      return sendHeartbeats();
    };

    void forwardMessages();
    await sendHeartbeats();
  });
});

api.post(
  "/surfaces/:slug/entries",
  zValidator("json", createEntryBodySchema),
  (c) => {
    const slug = c.req.param("slug");
    const body = c.req.valid("json");

    const surface = db
      .select()
      .from(surfaces)
      .where(eq(surfaces.slug, slug))
      .get();

    if (!surface) {
      return c.json({ error: "Surface not found" }, 404);
    }

    const normalized = normalizePictoCard(body.card);
    const derivedText = deriveText(normalized);
    const compressed = compressJson(normalized);
    assertCompressedSize(compressed);
    const payloadSha256 = sha256Hex(compressed);

    const previewMatch = body.preview.match(previewDataUrlRegex);
    if (!previewMatch?.groups?.format || !previewMatch.groups.data) {
      return c.json({ error: "Invalid preview data URL" }, 400);
    }

    const ext = previewMatch.groups.format === "png" ? "png" : "webp";
    const previewBytes = Buffer.from(previewMatch.groups.data, "base64");

    const now = new Date();
    const createdAt = now.toISOString();
    const entryId = crypto.randomUUID();
    const datePath = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
    ].join("/");

    const relativePath = path.join(
      "previews",
      slug,
      datePath,
      `${entryId}.${ext}`
    );
    const absolutePath = path.join(
      env.MEDIA_ROOT,
      relativePath.replace(previewsPrefixRegex, "")
    );
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, previewBytes);

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    const userAgent = c.req.header("user-agent") ?? "unknown";

    const autoApprove = env.MODERATION_MODE === "auto";
    const status = autoApprove ? "approved" : "pending";
    const approvedAt = autoApprove ? createdAt : null;

    db.insert(entries)
      .values({
        approvedAt,
        authorName: body.author_name ?? null,
        createdAt,
        derivedText,
        id: entryId,
        ipHash: hashWithSalt(ip),
        payloadCompressed: Buffer.from(compressed),
        payloadSha256,
        payloadSize: compressed.byteLength,
        previewHeight: normalized.h,
        previewPath: relativePath,
        previewWidth: normalized.w,
        status,
        surfaceId: surface.id,
        userAgentHash: hashWithSalt(userAgent),
      })
      .run();

    if (autoApprove) {
      publishEntry(
        surface.id,
        toStreamMetadata({
          authorName: body.author_name ?? null,
          createdAt,
          id: entryId,
          previewPath: relativePath,
        })
      );
    }

    return c.json(
      {
        id: entryId,
        preview_path: relativePath,
        status,
      },
      201
    );
  }
);

api.get("/entries/:entryId/payload", (c) => {
  const entryId = c.req.param("entryId");

  const entry = db
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.status, "approved")))
    .get();

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  const card = decompressJson<PictoCard>(
    new Uint8Array(entry.payloadCompressed)
  );
  return c.json(card);
});

export { api };
