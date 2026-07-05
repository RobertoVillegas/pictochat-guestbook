import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Export named catalog pieces as individual theme sprites.
// Output is derived from the reference rip, so public/picto-ds/ stays
// gitignored (private theme only — see PRD §14).
const ROOT = path.join(import.meta.dir, "../..");
const SOURCE = path.join(ROOT, "assets/source/ds-pictochat-sprites.png");
const OUT_DIR = path.join(ROOT, "public/picto-ds/sprites");

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ExportSpec {
  id: string;
  name: string;
  /** optional crop relative to the segment box */
  sub?: { x: number; y: number; w: number; h: number };
}

const EXPORTS: ExportSpec[] = [
  { id: "seg-023", name: "tabs-room-column-v1" },
  { id: "seg-033", name: "screen-touch-striped-bg" },
  { id: "seg-042a", name: "bar-pictochat-logo" },
  { id: "seg-042b", name: "banner-now-entering" },
  {
    id: "seg-042b",
    name: "banner-now-entering-black",
    sub: { h: 22, w: 238, x: 0, y: 0 },
  },
  {
    id: "seg-042b",
    name: "banner-now-entering-outline",
    sub: { h: 26, w: 238, x: 0, y: 22 },
  },
  { id: "seg-042e", name: "composer-chrome-active" },
  { id: "seg-042f", name: "composer-chrome-default" },
  { id: "seg-045", name: "kbd-latin-main" },
  { id: "seg-048c", name: "nametag-pills" },
  { id: "seg-048c", name: "nametag-pill", sub: { h: 22, w: 64, x: 0, y: 0 } },
];

const loadBoxes = async (): Promise<Map<string, Box>> => {
  const boxes = new Map<string, Box>();
  const segments = JSON.parse(
    await readFile(path.join(ROOT, "design/generated/segments.json"), "utf-8")
  ) as Box[];
  const splitData = JSON.parse(
    await readFile(
      path.join(ROOT, "design/generated/splits/subsegments.json"),
      "utf-8"
    )
  ) as { subsegments: Box[] } | Box[];
  const subsegments = Array.isArray(splitData)
    ? splitData
    : splitData.subsegments;
  for (const box of [...segments, ...subsegments]) {
    boxes.set(box.id, box);
  }
  return boxes;
};

const boxes = await loadBoxes();
await mkdir(OUT_DIR, { recursive: true });

await Promise.all(
  EXPORTS.map(async ({ id, name, sub }) => {
    const box = boxes.get(id);
    if (!box) {
      throw new Error(
        `segment ${id} not found; run sprites:scan + sprites:split first`
      );
    }
    const region = sub
      ? { height: sub.h, left: box.x + sub.x, top: box.y + sub.y, width: sub.w }
      : { height: box.h, left: box.x, top: box.y, width: box.w };
    const outPath = path.join(OUT_DIR, `${name}.png`);
    await sharp(SOURCE).extract(region).png().toFile(outPath);
    console.log(`${name}.png (${region.width}x${region.height})`);
  })
);
console.log(`Exported ${EXPORTS.length} sprites to public/picto-ds/sprites/`);
