import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  absorbContainedBboxes,
  dilateMask,
  labelConnectedComponents,
} from "./lib/connected-components.ts";
import type { BBox } from "./lib/connected-components.ts";

const ROOT = path.join(import.meta.dir, "../..");
const SOURCE_PATH = path.join(ROOT, "assets/source/ds-pictochat-sprites.png");
const CATALOG_PATH = path.join(ROOT, "design/sprites.catalog.json");
const SEGMENTS_PATH = path.join(ROOT, "design/generated/segments.json");
const OUTPUT_DIR = path.join(ROOT, "design/generated/splits");

const ALPHA_THRESHOLD = 16;
const gapArg = process.argv.find((arg) => arg.startsWith("--gap="));
const DILATION_RADIUS = gapArg ? Number(gapArg.slice("--gap=".length)) : 1;
const MIN_AREA = 9;
const CROP_SCALE = 2;
const MONTAGE_COLS = 6;
const MONTAGE_PAD = 10;
const MONTAGE_LABEL_H = 16;
const MONTAGE_BG = { alpha: 1, b: 235, g: 235, r: 235 };

interface ParentSegment {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GridSpec {
  cols: number;
  rows: number;
}

interface CatalogEntry {
  id: string;
  name?: string;
  category: "sprite" | "group" | "noise";
  status: "ready" | "needs-split" | "ignore" | "verify";
  splitGap?: number;
  grid?: GridSpec;
}

interface CatalogFile {
  segments: CatalogEntry[];
}

interface SubSegment {
  id: string;
  parentId: string;
  parentName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

const buildBinaryMask = (
  data: Buffer,
  width: number,
  height: number
): Uint8Array => {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = data[i * 4 + 3];
    if (alpha !== undefined && alpha >= ALPHA_THRESHOLD) {
      mask[i] = 1;
    }
  }
  return mask;
};

const computeBboxesFromLabels = (
  originalMask: Uint8Array,
  dilatedLabels: Int32Array,
  width: number,
  height: number
): BBox[] => {
  const stats = new Map<
    number,
    { xMin: number; yMin: number; xMax: number; yMax: number; area: number }
  >();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (originalMask[idx] === 0) {
        continue;
      }
      const label = dilatedLabels[idx];
      if (label === undefined || label === 0) {
        continue;
      }

      let entry = stats.get(label);
      if (!entry) {
        entry = { area: 0, xMax: x, xMin: x, yMax: y, yMin: y };
        stats.set(label, entry);
      }
      entry.xMin = Math.min(entry.xMin, x);
      entry.yMin = Math.min(entry.yMin, y);
      entry.xMax = Math.max(entry.xMax, x);
      entry.yMax = Math.max(entry.yMax, y);
      entry.area += 1;
    }
  }

  return [...stats.values()].map((entry) => ({
    area: entry.area,
    h: entry.yMax - entry.yMin + 1,
    w: entry.xMax - entry.xMin + 1,
    x: entry.xMin,
    y: entry.yMin,
  }));
};

const recountAreas = (
  mask: Uint8Array,
  width: number,
  bboxes: BBox[]
): BBox[] =>
  bboxes.map((bbox) => {
    let area = 0;
    const xEnd = bbox.x + bbox.w;
    const yEnd = bbox.y + bbox.h;
    for (let { y } = bbox; y < yEnd; y += 1) {
      for (let { x } = bbox; x < xEnd; x += 1) {
        if (mask[y * width + x] === 1) {
          area += 1;
        }
      }
    }
    return { ...bbox, area };
  });

const sortReadingOrder = (a: BBox, b: BBox): number => {
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.x - b.x;
};

const formatSubsegmentLetter = (index: number): string => {
  let n = index;
  let result = "";
  do {
    result = String.fromCodePoint(97 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
};

const segmentGrid = (
  regionWidth: number,
  regionHeight: number,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number
): BBox[] => {
  const cellW = Math.floor(regionWidth / cols);
  const cellH = Math.floor(regionHeight / rows);
  const bboxes: BBox[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const localX = col * cellW;
      const localY = row * cellH;
      const w = col === cols - 1 ? regionWidth - localX : cellW;
      const h = row === rows - 1 ? regionHeight - localY : cellH;
      bboxes.push({
        area: w * h,
        h,
        w,
        x: offsetX + localX,
        y: offsetY + localY,
      });
    }
  }

  return bboxes;
};

const segmentRegion = (
  regionData: Buffer,
  regionWidth: number,
  regionHeight: number,
  offsetX: number,
  offsetY: number,
  dilationRadius: number
): BBox[] => {
  const originalMask = buildBinaryMask(regionData, regionWidth, regionHeight);
  const dilatedMask = dilateMask(
    originalMask,
    regionWidth,
    regionHeight,
    dilationRadius
  );
  const dilatedLabels = labelConnectedComponents(
    dilatedMask,
    regionWidth,
    regionHeight
  );

  const rawBboxes = computeBboxesFromLabels(
    originalMask,
    dilatedLabels,
    regionWidth,
    regionHeight
  );

  const kept = recountAreas(
    originalMask,
    regionWidth,
    absorbContainedBboxes(rawBboxes.filter((bbox) => bbox.area >= MIN_AREA))
  );

  return [...kept].toSorted(sortReadingOrder).map((bbox) => ({
    ...bbox,
    x: bbox.x + offsetX,
    y: bbox.y + offsetY,
  }));
};

const loadParentMap = async (): Promise<Map<string, ParentSegment>> => {
  const parents = JSON.parse(
    await readFile(SEGMENTS_PATH, "utf-8")
  ) as ParentSegment[];
  return new Map(parents.map((segment) => [segment.id, segment]));
};

const loadSplitTargets = async (): Promise<
  { entry: CatalogEntry; parent: ParentSegment }[]
> => {
  const catalog = JSON.parse(
    await readFile(CATALOG_PATH, "utf-8")
  ) as CatalogFile;
  const parentMap = await loadParentMap();

  const targets: { entry: CatalogEntry; parent: ParentSegment }[] = [];
  for (const entry of catalog.segments) {
    if (entry.status !== "needs-split") {
      continue;
    }
    if (entry.category === "noise") {
      continue;
    }
    const parent = parentMap.get(entry.id);
    if (!parent) {
      throw new Error(`Parent segment not found in segments.json: ${entry.id}`);
    }
    targets.push({ entry, parent });
  }
  return targets;
};

const writeSubsegmentCrop = async (
  sourcePath: string,
  subsegment: SubSegment,
  cropsDir: string
): Promise<void> => {
  const outPath = path.join(cropsDir, `${subsegment.id}.png`);
  await sharp(sourcePath)
    .extract({
      height: subsegment.h,
      left: subsegment.x,
      top: subsegment.y,
      width: subsegment.w,
    })
    .png()
    .toFile(outPath);
};

const buildMontageComposites = async (
  subsegments: SubSegment[],
  cropsDir: string,
  cellWidth: number,
  cellHeight: number
): Promise<sharp.OverlayOptions[]> => {
  const compositePairs = await Promise.all(
    subsegments.map(async (subsegment, index) => {
      const col = index % MONTAGE_COLS;
      const row = Math.floor(index / MONTAGE_COLS);
      const cellX = col * cellWidth + MONTAGE_PAD;
      const cellY = row * cellHeight + MONTAGE_PAD;

      const cropBuffer = await sharp(
        path.join(cropsDir, `${subsegment.id}.png`)
      )
        .resize(subsegment.w * CROP_SCALE, subsegment.h * CROP_SCALE, {
          kernel: sharp.kernel.nearest,
        })
        .png()
        .toBuffer();

      const labelSvg = Buffer.from(
        `<svg width="${cellWidth}" height="${MONTAGE_LABEL_H}"><text x="4" y="12" font-family="monospace" font-size="12" fill="#000">${subsegment.id}</text></svg>`
      );

      return [
        {
          input: cropBuffer,
          left: cellX,
          top: cellY,
        },
        {
          input: labelSvg,
          left: col * cellWidth,
          top: row * cellHeight + cellHeight - MONTAGE_LABEL_H,
        },
      ] satisfies sharp.OverlayOptions[];
    })
  );
  return compositePairs.flat();
};

const writeParentMontage = async (
  parentId: string,
  subsegments: SubSegment[],
  cropsDir: string,
  montagesDir: string
): Promise<void> => {
  if (subsegments.length === 0) {
    return;
  }

  const scaledWidths = subsegments.map((s) => s.w * CROP_SCALE);
  const scaledHeights = subsegments.map((s) => s.h * CROP_SCALE);
  const cellWidth = Math.max(...scaledWidths, 24) + MONTAGE_PAD * 2;
  const cellHeight =
    Math.max(...scaledHeights, 24) + MONTAGE_PAD * 2 + MONTAGE_LABEL_H;

  const rows = Math.ceil(subsegments.length / MONTAGE_COLS);
  const sheetWidth = MONTAGE_COLS * cellWidth;
  const sheetHeight = rows * cellHeight;

  const composites = await buildMontageComposites(
    subsegments,
    cropsDir,
    cellWidth,
    cellHeight
  );

  const outPath = path.join(montagesDir, `montage-${parentId}.png`);
  await sharp({
    create: {
      background: MONTAGE_BG,
      channels: 4,
      height: sheetHeight,
      width: sheetWidth,
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
};

const splitParent = async (
  sourcePath: string,
  entry: CatalogEntry,
  parent: ParentSegment,
  cropsDir: string,
  montagesDir: string
): Promise<SubSegment[]> => {
  let bboxes: BBox[];
  if (entry.grid) {
    bboxes = segmentGrid(
      parent.w,
      parent.h,
      entry.grid.cols,
      entry.grid.rows,
      parent.x,
      parent.y
    );
  } else {
    const regionBuffer = await sharp(sourcePath)
      .extract({
        height: parent.h,
        left: parent.x,
        top: parent.y,
        width: parent.w,
      })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const dilationRadius = entry.splitGap ?? DILATION_RADIUS;
    bboxes = segmentRegion(
      regionBuffer,
      parent.w,
      parent.h,
      parent.x,
      parent.y,
      dilationRadius
    );
  }

  const parentName = entry.name ?? entry.id;
  const subsegments: SubSegment[] = bboxes.map((bbox, index) => ({
    area: bbox.area,
    h: bbox.h,
    id: `${parent.id}${formatSubsegmentLetter(index)}`,
    parentId: parent.id,
    parentName,
    w: bbox.w,
    x: bbox.x,
    y: bbox.y,
  }));

  await Promise.all(
    subsegments.map((subsegment) =>
      writeSubsegmentCrop(sourcePath, subsegment, cropsDir)
    )
  );
  await writeParentMontage(parent.id, subsegments, cropsDir, montagesDir);

  return subsegments;
};

const main = async (): Promise<void> => {
  const sourceFile = Bun.file(SOURCE_PATH);
  if (!(await sourceFile.exists())) {
    throw new Error(`Source PNG not found: ${SOURCE_PATH}`);
  }

  const segmentsFile = Bun.file(SEGMENTS_PATH);
  if (!(await segmentsFile.exists())) {
    throw new Error(
      `segments.json not found: ${SEGMENTS_PATH} — run sprites:scan first`
    );
  }

  const targets = await loadSplitTargets();
  console.log(
    `Splitting ${targets.length} parent segments (gap=${DILATION_RADIUS})`
  );

  const cropsDir = path.join(OUTPUT_DIR, "crops");
  const montagesDir = path.join(OUTPUT_DIR, "montages");
  await rm(OUTPUT_DIR, { force: true, recursive: true });
  await mkdir(cropsDir, { recursive: true });
  await mkdir(montagesDir, { recursive: true });

  const results = await Promise.all(
    targets.map(async ({ entry, parent }) => {
      const subsegments = await splitParent(
        SOURCE_PATH,
        entry,
        parent,
        cropsDir,
        montagesDir
      );
      return { entry, parent, subsegments };
    })
  );

  const allSubsegments: SubSegment[] = [];
  for (const { entry, parent, subsegments } of results) {
    allSubsegments.push(...subsegments);
    console.log(
      `  ${parent.id} (${entry.name ?? entry.id}): ${subsegments.length} sub-segments`
    );
  }

  await writeFile(
    path.join(OUTPUT_DIR, "subsegments.json"),
    `${JSON.stringify(allSubsegments, null, 2)}\n`,
    "utf-8"
  );

  console.log(`Total sub-segments: ${allSubsegments.length}`);
  console.log(`Outputs written to ${OUTPUT_DIR}`);
};

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
