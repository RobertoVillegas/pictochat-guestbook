import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Packed review montages: small segments in a tight grid (2x, labeled),
// so a human/vision reviewer can classify many crops per image.
const ROOT = path.join(import.meta.dir, "../..");
const GENERATED = path.join(ROOT, "design/generated");
const OUT_DIR = path.join(GENERATED, "review");
const SCALE = 2;
const MAX_SMALL = 320;
const COLS = 6;
const PAD = 10;
const LABEL_H = 16;

interface Segment {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const segments: Segment[] = JSON.parse(
  await readFile(path.join(GENERATED, "segments.json"), "utf-8")
);

const small = segments.filter((s) => s.w <= MAX_SMALL && s.h <= MAX_SMALL);
const large = segments.filter((s) => s.w > MAX_SMALL || s.h > MAX_SMALL);

await mkdir(OUT_DIR, { recursive: true });

const perSheet = 24;

const buildSmallSheet = async (sheet: number): Promise<void> => {
  const batch = small.slice(sheet * perSheet, (sheet + 1) * perSheet);
  const cellW = Math.max(...batch.map((s) => s.w * SCALE), 60) + PAD * 2;
  const cellH =
    Math.max(...batch.map((s) => s.h * SCALE), 24) + PAD * 2 + LABEL_H;
  const rows = Math.ceil(batch.length / COLS);
  const width = COLS * cellW;
  const height = rows * cellH;

  const compositePairs = await Promise.all(
    batch.map(async (seg, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const crop = await sharp(
        path.join(GENERATED, "segments", `${seg.id}.png`)
      )
        .resize(seg.w * SCALE, seg.h * SCALE, { kernel: "nearest" })
        .png()
        .toBuffer();
      const label = Buffer.from(
        `<svg width="${cellW}" height="${LABEL_H}"><text x="4" y="12" font-family="monospace" font-size="12" fill="#000">${seg.id} ${seg.w}x${seg.h}</text></svg>`
      );
      return [
        {
          input: crop,
          left: col * cellW + PAD,
          top: row * cellH + PAD,
        },
        {
          input: label,
          left: col * cellW,
          top: row * cellH + cellH - LABEL_H,
        },
      ] satisfies sharp.OverlayOptions[];
    })
  );
  const composites = compositePairs.flat();

  const out = path.join(
    OUT_DIR,
    `small-${String(sheet + 1).padStart(2, "0")}.png`
  );
  await sharp({
    create: {
      background: { alpha: 1, b: 235, g: 235, r: 235 },
      channels: 4,
      height,
      width,
    },
  })
    .composite(composites)
    .png()
    .toFile(out);
  console.log(`${out}: ${batch.length} segments`);
};

const sheetCount = Math.ceil(small.length / perSheet);
await Promise.all(
  Array.from({ length: sheetCount }, (_, sheet) => buildSmallSheet(sheet))
);

await writeFile(
  path.join(OUT_DIR, "large.txt"),
  `${large.map((s) => `${s.id} x=${s.x} y=${s.y} ${s.w}x${s.h}`).join("\n")}\n`,
  "utf-8"
);
console.log(`Large segments (review individually): ${large.length}`);
