import { z } from "zod";

const pointSchema = z.tuple([z.number().int(), z.number().int()]);
const hexColorRegex = /^#[0-9a-fA-F]{6}$/u;

const strokeOpSchema = z.object({
  color: z.number().int().min(0).max(3),
  p: z.array(pointSchema).min(1),
  size: z.number().int().min(1).max(8),
  t: z.literal("stroke"),
  tool: z.enum(["pen", "eraser"]),
});

const glyphOpSchema = z.object({
  ch: z.string().min(1).max(1),
  font: z.string(),
  s: z.number().min(0.25).max(4),
  t: z.literal("glyph"),
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(191),
});

const stampOpSchema = z.object({
  id: z.string().min(1).max(64),
  s: z.number().min(0.25).max(4),
  t: z.literal("stamp"),
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(191),
});

const opSchema = z.discriminatedUnion("t", [
  strokeOpSchema,
  glyphOpSchema,
  stampOpSchema,
]);

export const pictoCardSchema = z
  .object({
    bg: z.string(),
    h: z.literal(192),
    ops: z.array(opSchema).max(512),
    palette: z.array(z.string().regex(hexColorRegex)).max(4),
    v: z.literal(1),
    w: z.literal(256),
  })
  .superRefine((card, ctx) => {
    let totalPoints = 0;
    for (const op of card.ops) {
      if (op.t === "stroke") {
        totalPoints += op.p.length;
        if (op.p.length > 0) {
          const [firstPoint] = op.p;
          if (!firstPoint) {
            continue;
          }
          const [x, y] = firstPoint;
          if (x < 0 || x > 255 || y < 0 || y > 191) {
            ctx.addIssue({
              code: "custom",
              message:
                "Stroke first point must be absolute within canvas bounds",
              path: ["ops"],
            });
          }
          for (let i = 1; i < op.p.length; i += 1) {
            const deltaPoint = op.p[i];
            if (!deltaPoint) {
              continue;
            }
            const [dx, dy] = deltaPoint;
            if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
              ctx.addIssue({
                code: "custom",
                message: "Stroke delta points must be integers",
                path: ["ops"],
              });
            }
          }
        }
      }
    }
    if (totalPoints > 8000) {
      ctx.addIssue({
        code: "custom",
        message: "Total stroke points must not exceed 8000",
        path: ["ops"],
      });
    }
  });

export type PictoCard = z.infer<typeof pictoCardSchema>;

export const createEntryBodySchema = z.object({
  author_name: z.string().max(32).optional(),
  card: pictoCardSchema,
  preview: z.string().min(1),
});

export type CreateEntryBody = z.infer<typeof createEntryBodySchema>;

export const countStrokePoints = (card: PictoCard): number => {
  let total = 0;
  for (const op of card.ops) {
    if (op.t === "stroke") {
      total += op.p.length;
    }
  }
  return total;
};

export const normalizePictoCard = (card: PictoCard): PictoCard => ({
  ...card,
  ops: card.ops.map((op) => {
    if (op.t !== "stroke") {
      return op;
    }
    return {
      ...op,
      p: op.p.map(
        ([x, y]) => [Math.trunc(x), Math.trunc(y)] as [number, number]
      ),
    };
  }),
});
