import type { SpriteMatrix } from "./sprite-matrix.ts";

const parseHexColor = (hex: string): { fill: string; opacity: number } => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (normalized.length === 6) {
    return { fill: `#${normalized}`, opacity: 255 };
  }
  if (normalized.length === 8) {
    const rgb = normalized.slice(0, 6);
    const alpha = Number.parseInt(normalized.slice(6, 8), 16);
    return { fill: `#${rgb}`, opacity: alpha };
  }
  throw new Error(`Unsupported color format: ${hex}`);
};

const horizontalRunsForRow = (row: number[], y: number): string[] => {
  const runs: string[] = [];
  let x = 0;

  while (x < row.length) {
    const colorIndex = row[x];
    if (colorIndex === undefined || colorIndex < 0) {
      x += 1;
      continue;
    }

    const runStart = x;
    let runLen = 1;
    x += 1;

    while (x < row.length && row[x] === colorIndex) {
      runLen += 1;
      x += 1;
    }

    runs.push(`M${runStart} ${y}h${runLen}v1H${runStart}z`);
  }

  return runs;
};

const pathDataForColorIndex = (
  matrix: SpriteMatrix,
  colorIndex: number
): string => {
  const parts: string[] = [];
  for (let y = 0; y < matrix.h; y += 1) {
    const row = matrix.matrix[y];
    if (!row) {
      continue;
    }
    const maskedRow = row.map((index) =>
      index === colorIndex ? colorIndex : -1
    );
    parts.push(...horizontalRunsForRow(maskedRow, y));
  }
  return parts.join("");
};

export const matrixToSvg = (matrix: SpriteMatrix): string => {
  const paths: string[] = [];

  for (
    let colorIndex = 0;
    colorIndex < matrix.palette.length;
    colorIndex += 1
  ) {
    const hex = matrix.palette[colorIndex];
    if (!hex) {
      continue;
    }

    const pathData = pathDataForColorIndex(matrix, colorIndex);
    if (pathData.length === 0) {
      continue;
    }

    const { fill, opacity } = parseHexColor(hex);
    paths.push(
      `<path d="${pathData}" shape-rendering="crispEdges" style="fill:${fill};opacity:${opacity}"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${matrix.w}" height="${matrix.h}" viewBox="0 0 ${matrix.w} ${matrix.h}">${paths.join("")}</svg>`;
};
