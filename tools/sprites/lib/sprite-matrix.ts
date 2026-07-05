export const ALPHA_THRESHOLD = 16;

export interface SpriteMatrix {
  name: string;
  w: number;
  h: number;
  palette: string[];
  matrix: number[][];
}

export interface RegionBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const byteToHex = (value: number): string =>
  value.toString(16).padStart(2, "0");

export const rgbaToHex = (
  r: number,
  g: number,
  b: number,
  a: number
): string => {
  if (a === 255) {
    return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
  }
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}${byteToHex(a)}`;
};

export const matrixFromRgba = (
  name: string,
  data: Buffer,
  width: number,
  height: number
): SpriteMatrix => {
  const palette: string[] = [];
  const colorIndex = new Map<string, number>();
  const matrix: number[][] = [];

  const indexForPixel = (offset: number): number => {
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const a = data[offset + 3] ?? 0;

    if (a < ALPHA_THRESHOLD) {
      return -1;
    }

    const hex = rgbaToHex(r, g, b, a);
    let index = colorIndex.get(hex);
    if (index === undefined) {
      index = palette.length;
      palette.push(hex);
      colorIndex.set(hex, index);
    }
    return index;
  };

  for (let y = 0; y < height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < width; x += 1) {
      row.push(indexForPixel((y * width + x) * 4));
    }
    matrix.push(row);
  }

  return { h: height, matrix, name, palette, w: width };
};
