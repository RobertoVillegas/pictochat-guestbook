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

const EXPORTS: Record<string, string> = {
  "seg-023": "tabs-room-column-v1",
  "seg-033": "screen-touch-striped-bg",
  "seg-042a": "bar-pictochat-logo",
  "seg-042b": "banner-now-entering",
  "seg-042e": "composer-chrome-active",
  "seg-042f": "composer-chrome-default",
  "seg-045": "kbd-latin-main",
  "seg-048c": "nametag-pills",
};

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
  Object.entries(EXPORTS).map(async ([id, name]) => {
    const box = boxes.get(id);
    if (!box) {
      throw new Error(
        `segment ${id} not found; run sprites:scan + sprites:split first`
      );
    }
    const outPath = path.join(OUT_DIR, `${name}.png`);
    await sharp(SOURCE)
      .extract({ height: box.h, left: box.x, top: box.y, width: box.w })
      .png()
      .toFile(outPath);
    console.log(`${name}.png (${box.w}x${box.h})`);
  })
);
console.log(
  `Exported ${Object.keys(EXPORTS).length} sprites to public/picto-ds/sprites/`
);
