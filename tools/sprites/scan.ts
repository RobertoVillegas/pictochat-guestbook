import { mkdir, rm, writeFile } from "node:fs/promises";
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
const OUTPUT_DIR = path.join(ROOT, "design/generated");
const CATALOG_PATH = path.join(ROOT, "design/sprites.catalog.json");
const ALPHA_THRESHOLD = 16;
const gapArg = process.argv.find((arg) => arg.startsWith("--gap="));
const DILATION_RADIUS = gapArg ? Number(gapArg.slice("--gap=".length)) : 2;
const MIN_AREA = 9;
const SHEET_BATCH_SIZE = 30;
const CROP_SCALE = 2;
const LABEL_HEIGHT = 18;
const CELL_PADDING = 4;
const SHEET_BG = { alpha: 1, b: 220, g: 220, r: 220 };

interface Segment {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  density: number;
}

interface CatalogEntry {
  id: string;
  category: "sprite" | "group" | "noise";
}

interface CatalogFile {
  segments: CatalogEntry[];
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

const formatSegmentId = (index: number): string =>
  `seg-${String(index).padStart(3, "0")}`;

const toSegments = (bboxes: BBox[]): Segment[] => {
  const sorted = [...bboxes].toSorted(sortReadingOrder);
  return sorted.map((bbox, index) => ({
    area: bbox.area,
    density: bbox.area / (bbox.w * bbox.h),
    h: bbox.h,
    id: formatSegmentId(index + 1),
    w: bbox.w,
    x: bbox.x,
    y: bbox.y,
  }));
};

const writeSegmentCrops = async (
  sourcePath: string,
  segments: Segment[],
  segmentsDir: string
): Promise<void> => {
  await mkdir(segmentsDir, { recursive: true });
  await Promise.all(
    segments.map(async (segment) => {
      const outPath = path.join(segmentsDir, `${segment.id}.png`);
      await sharp(sourcePath)
        .extract({
          height: segment.h,
          left: segment.x,
          top: segment.y,
          width: segment.w,
        })
        .png()
        .toFile(outPath);
    })
  );
};

const renderLabelPng = (text: string, width: number): Promise<Buffer> => {
  const svg = `<svg width="${width}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#dcdcdc"/>
  <text x="50%" y="13" text-anchor="middle" font-family="monospace" font-size="11" fill="#222">${text}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

const buildContactSheetComposites = async (
  sourcePath: string,
  batchSegments: Segment[],
  cols: number,
  cellWidth: number,
  cellHeight: number
): Promise<sharp.OverlayOptions[]> => {
  const compositePairs = await Promise.all(
    batchSegments.map(async (segment, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = col * cellWidth + CELL_PADDING;
      const cellY = row * cellHeight + CELL_PADDING;

      const cropBuffer = await sharp(sourcePath)
        .extract({
          height: segment.h,
          left: segment.x,
          top: segment.y,
          width: segment.w,
        })
        .resize(segment.w * CROP_SCALE, segment.h * CROP_SCALE, {
          kernel: sharp.kernel.nearest,
        })
        .png()
        .toBuffer();

      const labelBuffer = await renderLabelPng(
        segment.id,
        segment.w * CROP_SCALE
      );

      return [
        {
          input: cropBuffer,
          left: cellX,
          top: cellY,
        },
        {
          input: labelBuffer,
          left: cellX,
          top: cellY + segment.h * CROP_SCALE,
        },
      ] satisfies sharp.OverlayOptions[];
    })
  );
  return compositePairs.flat();
};

const writeContactSheetBatch = async (
  sourcePath: string,
  batchSegments: Segment[],
  batch: number,
  sheetsDir: string
): Promise<void> => {
  const scaledWidths = batchSegments.map((s) => s.w * CROP_SCALE);
  const scaledHeights = batchSegments.map((s) => s.h * CROP_SCALE);
  const cellWidth = Math.max(...scaledWidths, 1) + CELL_PADDING * 2;
  const cellHeight =
    Math.max(...scaledHeights, 1) + LABEL_HEIGHT + CELL_PADDING * 2;

  const cols = Math.ceil(Math.sqrt(batchSegments.length));
  const rows = Math.ceil(batchSegments.length / cols);
  const sheetWidth = cols * cellWidth;
  const sheetHeight = rows * cellHeight;

  const composites = await buildContactSheetComposites(
    sourcePath,
    batchSegments,
    cols,
    cellWidth,
    cellHeight
  );

  const sheetNumber = String(batch + 1).padStart(2, "0");
  const sheetPath = path.join(sheetsDir, `sheet-${sheetNumber}.png`);
  await sharp({
    create: {
      background: SHEET_BG,
      channels: 4,
      height: sheetHeight,
      width: sheetWidth,
    },
  })
    .composite(composites)
    .png()
    .toFile(sheetPath);
};

const writeContactSheets = async (
  sourcePath: string,
  segments: Segment[],
  sheetsDir: string
): Promise<void> => {
  await mkdir(sheetsDir, { recursive: true });

  const batchCount = Math.ceil(segments.length / SHEET_BATCH_SIZE);
  await Promise.all(
    Array.from({ length: batchCount }, (_, batch) => {
      const batchSegments = segments.slice(
        batch * SHEET_BATCH_SIZE,
        (batch + 1) * SHEET_BATCH_SIZE
      );
      return writeContactSheetBatch(
        sourcePath,
        batchSegments,
        batch,
        sheetsDir
      );
    })
  );
};

const loadCatalog = async (): Promise<
  Map<string, CatalogEntry["category"]>
> => {
  const map = new Map<string, CatalogEntry["category"]>();
  const file = Bun.file(CATALOG_PATH);
  if (!(await file.exists())) {
    return map;
  }
  const catalog = (await file.json()) as CatalogFile;
  for (const entry of catalog.segments) {
    map.set(entry.id, entry.category);
  }
  return map;
};

const categoryColor = (
  category: CatalogEntry["category"] | undefined
): string => {
  switch (category) {
    case "sprite": {
      return "#22c55e";
    }
    case "group": {
      return "#3b82f6";
    }
    case "noise": {
      return "#ef4444";
    }
    default: {
      return "#eab308";
    }
  }
};

const writeAtlasHtml = async (
  segments: Segment[],
  imageWidth: number,
  imageHeight: number
): Promise<void> => {
  const catalog = await loadCatalog();
  const boxes = segments
    .map((segment) => {
      const category = catalog.get(segment.id);
      const color = categoryColor(category);
      const title = `${segment.id} ${segment.x},${segment.y} ${segment.w}×${segment.h}`;
      return `<div class="seg" data-id="${segment.id}" title="${title}" style="left:${segment.x}px;top:${segment.y}px;width:${segment.w}px;height:${segment.h}px;border-color:${color};"></div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Sprite atlas</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #eee; }
    .toolbar { padding: 8px 12px; display: flex; gap: 8px; align-items: center; }
    .viewport { overflow: auto; padding: 12px; }
    .stage { position: relative; display: inline-block; transform-origin: top left; }
    .stage img { display: block; max-width: none; }
    .seg { position: absolute; box-sizing: border-box; border: 1px solid; pointer-events: auto; }
    .seg:hover { outline: 2px solid #fff; z-index: 2; }
    button { cursor: pointer; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>Zoom:</span>
    <button type="button" data-zoom="1">1×</button>
    <button type="button" data-zoom="2">2×</button>
    <button type="button" data-zoom="4">4×</button>
    <span id="count">${segments.length} segments</span>
  </div>
  <div class="viewport">
    <div class="stage" id="stage" style="width:${imageWidth}px;height:${imageHeight}px;">
      <img src="../../assets/source/ds-pictochat-sprites.png" width="${imageWidth}" height="${imageHeight}" alt="sprite sheet"/>
      ${boxes}
    </div>
  </div>
  <script>
    const stage = document.getElementById('stage');
    document.querySelectorAll('[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scale = Number(btn.getAttribute('data-zoom'));
        stage.style.transform = 'scale(' + scale + ')';
      });
    });
  </script>
</body>
</html>`;

  await writeFile(path.join(OUTPUT_DIR, "atlas.html"), html, "utf-8");
};

const pickRandomIndices = (count: number, max: number): number[] => {
  const indices = new Set<number>();
  while (indices.size < Math.min(count, max)) {
    indices.add(Math.floor(Math.random() * max));
  }
  return [...indices];
};

const verifySingleCrop = async (
  sourcePath: string,
  segment: Segment,
  data: Buffer,
  width: number,
  imageWidth: number,
  imageHeight: number
): Promise<void> => {
  const cropPath = path.join(OUTPUT_DIR, "segments", `${segment.id}.png`);
  const cropMeta = await sharp(cropPath).stats();
  const maxAlpha = Math.max(...cropMeta.channels.map((channel) => channel.max));
  if (maxAlpha === 0) {
    throw new Error(`Crop ${segment.id} is empty`);
  }

  const marginChecks: string[] = [];

  if (segment.x > 0) {
    for (let { y } = segment; y < segment.y + segment.h; y += 1) {
      const idx = (y * width + (segment.x - 1)) * 4 + 3;
      const alpha = data[idx];
      if (alpha !== undefined && alpha >= ALPHA_THRESHOLD) {
        marginChecks.push(`left margin at y=${y}`);
        break;
      }
    }
  }

  if (segment.y > 0) {
    for (let { x } = segment; x < segment.x + segment.w; x += 1) {
      const idx = ((segment.y - 1) * width + x) * 4 + 3;
      const alpha = data[idx];
      if (alpha !== undefined && alpha >= ALPHA_THRESHOLD) {
        marginChecks.push(`top margin at x=${x}`);
        break;
      }
    }
  }

  if (segment.x + segment.w < imageWidth) {
    for (let { y } = segment; y < segment.y + segment.h; y += 1) {
      const idx = (y * width + (segment.x + segment.w)) * 4 + 3;
      const alpha = data[idx];
      if (alpha !== undefined && alpha >= ALPHA_THRESHOLD) {
        marginChecks.push(`right margin at y=${y}`);
        break;
      }
    }
  }

  if (segment.y + segment.h < imageHeight) {
    for (let { x } = segment; x < segment.x + segment.w; x += 1) {
      const idx = ((segment.y + segment.h) * width + x) * 4 + 3;
      const alpha = data[idx];
      if (alpha !== undefined && alpha >= ALPHA_THRESHOLD) {
        marginChecks.push(`bottom margin at x=${x}`);
        break;
      }
    }
  }

  if (marginChecks.length > 0) {
    throw new Error(
      `Crop ${segment.id} lacks 1px transparent margin: ${marginChecks.join("; ")}`
    );
  }

  console.log(
    `  ${segment.id}: ok (${segment.w}×${segment.h}, area=${segment.area})`
  );
};

const verifyRandomCrops = async (
  sourcePath: string,
  segments: Segment[],
  imageWidth: number,
  imageHeight: number
): Promise<void> => {
  const meta = await sharp(sourcePath).raw().ensureAlpha().toBuffer({
    resolveWithObject: true,
  });
  const { data, info } = meta;
  const { width } = info;

  const indices = pickRandomIndices(3, segments.length);
  console.log(`Verifying crops at indices: ${indices.join(", ")}`);

  await Promise.all(
    indices.map(async (index) => {
      const segment = segments[index];
      if (!segment) {
        throw new Error(`Missing segment at index ${index}`);
      }
      await verifySingleCrop(
        sourcePath,
        segment,
        data,
        width,
        imageWidth,
        imageHeight
      );
    })
  );
};

const main = async (): Promise<void> => {
  const sourceFile = Bun.file(SOURCE_PATH);
  if (!(await sourceFile.exists())) {
    throw new Error(`Source PNG not found: ${SOURCE_PATH}`);
  }

  const image = sharp(SOURCE_PATH);
  const { width, height } = await image.metadata();
  if (!width || !height) {
    throw new Error("Could not read source image dimensions");
  }

  const raw = await image.ensureAlpha().raw().toBuffer();
  const originalMask = buildBinaryMask(raw, width, height);
  const dilatedMask = dilateMask(originalMask, width, height, DILATION_RADIUS);
  const dilatedLabels = labelConnectedComponents(dilatedMask, width, height);

  const rawBboxes = computeBboxesFromLabels(
    originalMask,
    dilatedLabels,
    width,
    height
  );

  const dustCount = rawBboxes.filter((bbox) => bbox.area < MIN_AREA).length;
  const keptBboxes = recountAreas(
    originalMask,
    width,
    absorbContainedBboxes(rawBboxes.filter((bbox) => bbox.area >= MIN_AREA))
  );
  const segments = toSegments(keptBboxes);

  console.log(`Dust components discarded (<${MIN_AREA}px): ${dustCount}`);
  console.log(`Segments detected: ${segments.length}`);

  await rm(OUTPUT_DIR, { force: true, recursive: true });
  await mkdir(path.join(OUTPUT_DIR, "segments"), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, "sheets"), { recursive: true });

  await writeFile(
    path.join(OUTPUT_DIR, "segments.json"),
    `${JSON.stringify(segments, null, 2)}\n`,
    "utf-8"
  );

  await writeSegmentCrops(
    SOURCE_PATH,
    segments,
    path.join(OUTPUT_DIR, "segments")
  );
  await writeContactSheets(
    SOURCE_PATH,
    segments,
    path.join(OUTPUT_DIR, "sheets")
  );
  await writeAtlasHtml(segments, width, height);
  await verifyRandomCrops(SOURCE_PATH, segments, width, height);

  console.log(`Outputs written to ${OUTPUT_DIR}`);
};

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
