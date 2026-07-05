import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { matrixFromRgba } from "./lib/sprite-matrix.ts";
import type { RegionBox, SpriteMatrix } from "./lib/sprite-matrix.ts";

const ROOT = path.join(import.meta.dir, "../..");
const SOURCE_PATH = path.join(ROOT, "assets/source/ds-pictochat-sprites.png");
const CATALOG_PATH = path.join(ROOT, "design/sprites.catalog.json");
const SUBCATALOG_PATH = path.join(ROOT, "design/sprites.subcatalog.json");
const SEGMENTS_PATH = path.join(ROOT, "design/generated/segments.json");
const SUBSEGMENTS_PATH = path.join(
  ROOT,
  "design/generated/splits/subsegments.json"
);
const MATRICES_DIR = path.join(ROOT, "design/generated/matrices");

interface CatalogEntry {
  id: string;
  name?: string;
  status: string;
}

interface CatalogFile {
  segments: CatalogEntry[];
}

interface SubCatalogFile {
  subsegments: CatalogEntry[];
}

interface ReadySprite {
  id: string;
  name: string;
}

const loadRegionMap = async (): Promise<Map<string, RegionBox>> => {
  const map = new Map<string, RegionBox>();

  const segments = JSON.parse(
    await readFile(SEGMENTS_PATH, "utf-8")
  ) as RegionBox[];
  for (const segment of segments) {
    map.set(segment.id, segment);
  }

  const subsegments = JSON.parse(
    await readFile(SUBSEGMENTS_PATH, "utf-8")
  ) as RegionBox[];
  for (const subsegment of subsegments) {
    map.set(subsegment.id, subsegment);
  }

  return map;
};

const loadReadySprites = async (): Promise<ReadySprite[]> => {
  const catalog = JSON.parse(
    await readFile(CATALOG_PATH, "utf-8")
  ) as CatalogFile;
  const subcatalog = JSON.parse(
    await readFile(SUBCATALOG_PATH, "utf-8")
  ) as SubCatalogFile;

  const ready: ReadySprite[] = [];

  for (const entry of catalog.segments) {
    if (entry.status !== "ready") {
      continue;
    }
    if (!entry.name) {
      throw new Error(`Catalog entry ${entry.id} is ready but has no name`);
    }
    ready.push({ id: entry.id, name: entry.name });
  }

  for (const entry of subcatalog.subsegments) {
    if (entry.status !== "ready") {
      continue;
    }
    if (!entry.name) {
      throw new Error(`Subcatalog entry ${entry.id} is ready but has no name`);
    }
    ready.push({ id: entry.id, name: entry.name });
  }

  const names = new Set<string>();
  for (const sprite of ready) {
    if (names.has(sprite.name)) {
      throw new Error(`Duplicate sprite name: ${sprite.name}`);
    }
    names.add(sprite.name);
  }

  return ready;
};

const extractSpriteMatrix = async (
  sourcePath: string,
  region: RegionBox,
  name: string
): Promise<SpriteMatrix> => {
  const { data, info } = await sharp(sourcePath)
    .extract({
      height: region.h,
      left: region.x,
      top: region.y,
      width: region.w,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return matrixFromRgba(name, data, info.width, info.height);
};

const main = async (): Promise<void> => {
  const sourceFile = Bun.file(SOURCE_PATH);
  if (!(await sourceFile.exists())) {
    throw new Error(`Source PNG not found: ${SOURCE_PATH}`);
  }

  const requiredPaths = [SEGMENTS_PATH, SUBSEGMENTS_PATH];
  const requiredExists = await Promise.all(
    requiredPaths.map(async (requiredPath) => ({
      exists: await Bun.file(requiredPath).exists(),
      path: requiredPath,
    }))
  );
  for (const { exists, path: requiredPath } of requiredExists) {
    if (!exists) {
      throw new Error(`Missing ${requiredPath} — run sprites:scan/split first`);
    }
  }

  const readySprites = await loadReadySprites();
  const regionMap = await loadRegionMap();

  await mkdir(MATRICES_DIR, { recursive: true });

  const matrices = await Promise.all(
    readySprites.map(async (sprite) => {
      const region = regionMap.get(sprite.id);
      if (!region) {
        throw new Error(`Region not found for ready sprite ${sprite.id}`);
      }

      const matrix = await extractSpriteMatrix(
        SOURCE_PATH,
        region,
        sprite.name
      );
      const outPath = path.join(MATRICES_DIR, `${sprite.name}.json`);
      await writeFile(outPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf-8");
      return matrix;
    })
  );

  console.log(
    `Extracted ${matrices.length} sprite matrices to ${MATRICES_DIR}`
  );
};

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
