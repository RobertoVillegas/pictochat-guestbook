export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

const NEIGHBORS_8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/** Binary mask dilation with a square structuring element (Chebyshev radius). */
export const dilateMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array => {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue;
      }
      const yMin = Math.max(0, y - radius);
      const yMax = Math.min(height - 1, y + radius);
      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(width - 1, x + radius);
      for (let ny = yMin; ny <= yMax; ny += 1) {
        for (let nx = xMin; nx <= xMax; nx += 1) {
          out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
};

/** 8-connected component labeling. Returns per-pixel labels (0 = background). */
export const labelConnectedComponents = (
  mask: Uint8Array,
  width: number,
  height: number
): Int32Array => {
  const labels = new Int32Array(mask.length);
  let nextLabel = 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (mask[idx] === 0 || labels[idx] !== 0) {
        continue;
      }

      const label = nextLabel;
      nextLabel += 1;
      const stack: number[] = [idx];
      labels[idx] = label;

      while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) {
          break;
        }
        const cy = Math.floor(current / width);
        const cx = current % width;

        for (const [dx, dy] of NEIGHBORS_8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            continue;
          }
          const nIdx = ny * width + nx;
          if (mask[nIdx] === 0 || labels[nIdx] !== 0) {
            continue;
          }
          labels[nIdx] = label;
          stack.push(nIdx);
        }
      }
    }
  }

  return labels;
};

/**
 * Absorb bounding boxes fully contained inside a larger one. Partial overlaps
 * are kept as separate segments: transitively merging them chains distinct
 * sprites into sheet-sized blobs.
 */
export const absorbContainedBboxes = (bboxes: BBox[]): BBox[] => {
  const sorted = [...bboxes].toSorted((a, b) => b.w * b.h - a.w * a.h);
  const kept: BBox[] = [];

  for (const bbox of sorted) {
    const container = kept.find(
      (candidate) =>
        bbox.x >= candidate.x &&
        bbox.y >= candidate.y &&
        bbox.x + bbox.w <= candidate.x + candidate.w &&
        bbox.y + bbox.h <= candidate.y + candidate.h
    );
    if (!container) {
      kept.push(bbox);
    }
  }

  return kept;
};
