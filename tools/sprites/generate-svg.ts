import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SpriteMatrix } from "./lib/sprite-matrix.ts";
import { matrixToSvg } from "./lib/svg-pixel.ts";

const ROOT = path.join(import.meta.dir, "../..");
const MATRICES_DIR = path.join(ROOT, "design/generated/matrices");
const SVG_DIR = path.join(ROOT, "public/picto-ds/svg");
const GALLERY_PATH = path.join(ROOT, "design/generated/gallery.html");
const CATALOG_PATH = path.join(ROOT, "design/sprites.catalog.json");
const SUBCATALOG_PATH = path.join(ROOT, "design/sprites.subcatalog.json");

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

interface GallerySprite {
  name: string;
  w: number;
  h: number;
  pngPath: string;
}

const loadGallerySprites = async (): Promise<GallerySprite[]> => {
  const catalog = JSON.parse(
    await readFile(CATALOG_PATH, "utf-8")
  ) as CatalogFile;
  const subcatalog = JSON.parse(
    await readFile(SUBCATALOG_PATH, "utf-8")
  ) as SubCatalogFile;

  const catalogSprites = await Promise.all(
    catalog.segments
      .filter((entry) => entry.status === "ready" && entry.name)
      .map(async (entry) => {
        const matrixPath = path.join(MATRICES_DIR, `${entry.name}.json`);
        const matrix = JSON.parse(
          await readFile(matrixPath, "utf-8")
        ) as SpriteMatrix;
        return {
          h: matrix.h,
          name: entry.name as string,
          pngPath: `segments/${entry.id}.png`,
          w: matrix.w,
        };
      })
  );

  const subcatalogSprites = await Promise.all(
    subcatalog.subsegments
      .filter((entry) => entry.status === "ready" && entry.name)
      .map(async (entry) => {
        const matrixPath = path.join(MATRICES_DIR, `${entry.name}.json`);
        const matrix = JSON.parse(
          await readFile(matrixPath, "utf-8")
        ) as SpriteMatrix;
        return {
          h: matrix.h,
          name: entry.name as string,
          pngPath: `splits/crops/${entry.id}.png`,
          w: matrix.w,
        };
      })
  );

  return [...catalogSprites, ...subcatalogSprites].toSorted((a, b) =>
    a.name.localeCompare(b.name)
  );
};

const writeGalleryHtml = async (sprites: GallerySprite[]): Promise<void> => {
  const cards = sprites
    .map((sprite) => {
      const scale = 4;
      const displayW = sprite.w * scale;
      const displayH = sprite.h * scale;
      return `<article class="card">
  <h2>${sprite.name}</h2>
  <p class="meta">${sprite.w}×${sprite.h}</p>
  <div class="compare">
    <figure>
      <figcaption>PNG</figcaption>
      <img src="${sprite.pngPath}" width="${displayW}" height="${displayH}" alt="${sprite.name} PNG" style="image-rendering:pixelated"/>
    </figure>
    <figure>
      <figcaption>SVG</figcaption>
      <img src="../../public/picto-ds/svg/${sprite.name}.svg" width="${displayW}" height="${displayH}" alt="${sprite.name} SVG" style="image-rendering:pixelated"/>
    </figure>
  </div>
</article>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Sprite gallery — PNG vs SVG</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #1a1a1a; color: #eee; }
    header { padding: 16px 20px; border-bottom: 1px solid #333; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; padding: 16px; }
    .card { background: #262626; border: 1px solid #444; border-radius: 8px; padding: 12px; }
    .card h2 { margin: 0 0 4px; font-size: 14px; font-family: monospace; }
    .meta { margin: 0 0 12px; color: #aaa; font-size: 12px; }
    .compare { display: flex; gap: 12px; flex-wrap: wrap; }
    figure { margin: 0; }
    figcaption { font-size: 11px; color: #888; margin-bottom: 4px; }
    img { display: block; background: repeating-conic-gradient(#555 0% 25%, #444 0% 50%) 50% / 16px 16px; }
  </style>
</head>
<body>
  <header>
    <h1>Sprite gallery (${sprites.length})</h1>
    <p>PNG crop vs generated SVG at 4× — design/generated/gallery.html</p>
  </header>
  <div class="grid">
${cards}
  </div>
</body>
</html>`;

  await writeFile(GALLERY_PATH, html, "utf-8");
};

const parseSvgDimensions = (svg: string): { width: number; height: number } => {
  const viewBoxMatch = /viewBox="0 0 (?<width>\d+) (?<height>\d+)"/u.exec(svg);
  if (viewBoxMatch?.groups?.width && viewBoxMatch.groups.height) {
    return {
      height: Number(viewBoxMatch.groups.height),
      width: Number(viewBoxMatch.groups.width),
    };
  }

  const widthMatch = /width="(?<width>\d+)"/u.exec(svg);
  const heightMatch = /height="(?<height>\d+)"/u.exec(svg);
  if (widthMatch?.groups?.width && heightMatch?.groups?.height) {
    return {
      height: Number(heightMatch.groups.height),
      width: Number(widthMatch.groups.width),
    };
  }

  throw new Error("Could not parse SVG dimensions");
};

const pickRandomIndices = (count: number, max: number): number[] => {
  const indices = new Set<number>();
  while (indices.size < Math.min(count, max)) {
    indices.add(Math.floor(Math.random() * max));
  }
  return [...indices];
};

const verifyOutputs = async (
  matrices: SpriteMatrix[],
  svgFiles: string[]
): Promise<void> => {
  if (matrices.length !== svgFiles.length) {
    throw new Error(
      `Matrix count (${matrices.length}) != SVG count (${svgFiles.length})`
    );
  }

  const indices = pickRandomIndices(3, matrices.length);
  console.log(`Verifying SVG dimensions at indices: ${indices.join(", ")}`);

  await Promise.all(
    indices.map(async (index) => {
      const matrix = matrices[index];
      const svgFile = svgFiles[index];
      if (!matrix || !svgFile) {
        throw new Error(`Missing matrix or SVG at index ${index}`);
      }

      const svg = await readFile(path.join(SVG_DIR, svgFile), "utf-8");
      const dims = parseSvgDimensions(svg);

      if (dims.width !== matrix.w || dims.height !== matrix.h) {
        throw new Error(
          `${svgFile}: SVG ${dims.width}×${dims.height} != matrix ${matrix.w}×${matrix.h}`
        );
      }

      console.log(`  ${matrix.name}: ok (${matrix.w}×${matrix.h})`);
    })
  );
};

const main = async (): Promise<void> => {
  let matrixFiles: string[];
  try {
    const dirEntries = await readdir(MATRICES_DIR);
    matrixFiles = dirEntries
      .filter((file) => file.endsWith(".json"))
      .toSorted();
  } catch {
    throw new Error(
      `Matrices directory not found: ${MATRICES_DIR} — run sprites:extract first`
    );
  }

  if (matrixFiles.length === 0) {
    throw new Error(`No matrix files in ${MATRICES_DIR}`);
  }

  await mkdir(SVG_DIR, { recursive: true });

  const outputs = await Promise.all(
    matrixFiles.map(async (file) => {
      const matrix = JSON.parse(
        await readFile(path.join(MATRICES_DIR, file), "utf-8")
      ) as SpriteMatrix;
      const svg = matrixToSvg(matrix);
      const outName = `${matrix.name}.svg`;
      await writeFile(path.join(SVG_DIR, outName), `${svg}\n`, "utf-8");
      console.log(
        `${outName} (${matrix.w}×${matrix.h}, ${matrix.palette.length} colors)`
      );
      return { matrix, outName };
    })
  );

  const matrices = outputs.map((output) => output.matrix);
  const svgFiles = outputs.map((output) => output.outName);

  const gallerySprites = await loadGallerySprites();
  await writeGalleryHtml(gallerySprites);
  await verifyOutputs(matrices, svgFiles);

  console.log(`Generated ${svgFiles.length} SVGs in ${SVG_DIR}`);
  console.log(`Gallery written to ${GALLERY_PATH}`);
};

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
