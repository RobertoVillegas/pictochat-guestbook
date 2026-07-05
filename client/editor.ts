const CANVAS_W = 228;
const CANVAS_H = 79;
const DEFAULT_PALETTE = ["#1a1a1e", "#fbfbfb", "#ff0000", "#0000ff"];

type Point = [number, number];

interface StrokeOp {
  t: "stroke";
  tool: "pen" | "eraser";
  size: number;
  color: number;
  p: Point[];
}

interface PictoCard {
  v: 1;
  w: 228;
  h: 79;
  bg: string;
  palette: string[];
  ops: StrokeOp[];
}

const canvas = document.querySelector(
  "#picto-canvas"
) as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("picto canvas not found");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

ctx.imageSmoothingEnabled = false;

let currentTool: "pen" | "eraser" = "pen";
let drawing = false;
let currentStroke: StrokeOp | null = null;
const ops: StrokeOp[] = [];

const bresenhamPoints = (
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Point[] => {
  const points: Point[] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xEnd = Math.round(x1);
  const yEnd = Math.round(y1);
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push([x, y]);
    if (x === xEnd && y === yEnd) {
      break;
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
};

const plotPoint = (stroke: StrokeOp, x: number, y: number): void => {
  if (stroke.tool === "eraser") {
    const size = 6;
    const half = Math.floor(size / 2);
    ctx.clearRect(x - half, y - half, size, size);
    return;
  }

  const { size } = stroke;
  ctx.fillStyle = DEFAULT_PALETTE[stroke.color] ?? "#1a1a1e";
  ctx.fillRect(x, y, size, size);
};

const plotSegment = (stroke: StrokeOp, from: Point, to: Point): void => {
  for (const [x, y] of bresenhamPoints(from[0], from[1], to[0], to[1])) {
    plotPoint(stroke, x, y);
  }
};

const absoluteLastPoint = (stroke: StrokeOp): Point => {
  const [first] = stroke.p;
  if (!first) {
    return [0, 0];
  }
  let [x, y] = first;
  for (let i = 1; i < stroke.p.length; i += 1) {
    const delta = stroke.p[i];
    if (!delta) {
      continue;
    }
    x += delta[0];
    y += delta[1];
  }
  return [x, y];
};

const replayStroke = (stroke: StrokeOp): void => {
  if (stroke.p.length === 0) {
    return;
  }
  const [first] = stroke.p;
  if (!first) {
    return;
  }
  plotPoint(stroke, first[0], first[1]);
  let prev = first;
  for (let i = 1; i < stroke.p.length; i += 1) {
    const delta = stroke.p[i];
    if (!delta) {
      continue;
    }
    const next: Point = [prev[0] + delta[0], prev[1] + delta[1]];
    plotSegment(stroke, prev, next);
    prev = next;
  }
};

const clearCanvas = (): void => {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
};

const redraw = (): void => {
  clearCanvas();
  for (const op of ops) {
    replayStroke(op);
  }
};

const canvasPoint = (event: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_W);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_H);
  return [
    Math.max(0, Math.min(CANVAS_W - 1, x)),
    Math.max(0, Math.min(CANVAS_H - 1, y)),
  ];
};

const setActiveTool = (tool: "pen" | "eraser"): void => {
  currentTool = tool;
  for (const el of document.querySelectorAll<HTMLButtonElement>(
    "[data-tool]"
  )) {
    el.classList.toggle("active", el.dataset.tool === tool);
  }
};

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  drawing = true;
  const point = canvasPoint(event);
  currentStroke = {
    color: 0,
    p: [point],
    size: currentTool === "eraser" ? 6 : 1,
    t: "stroke",
    tool: currentTool,
  };
  plotPoint(currentStroke, point[0], point[1]);
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing || !currentStroke) {
    return;
  }
  const point = canvasPoint(event);
  const lastAbs = absoluteLastPoint(currentStroke);
  if (point[0] === lastAbs[0] && point[1] === lastAbs[1]) {
    return;
  }
  const delta: Point = [point[0] - lastAbs[0], point[1] - lastAbs[1]];
  currentStroke.p.push(delta);
  plotSegment(currentStroke, lastAbs, point);
});

canvas.addEventListener("pointerup", () => {
  if (currentStroke && currentStroke.p.length > 0) {
    ops.push(currentStroke);
  }
  drawing = false;
  currentStroke = null;
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-tool]"
)) {
  button.addEventListener("click", () => {
    const { tool } = button.dataset;
    if (tool === "clear") {
      ops.length = 0;
      redraw();
      return;
    }
    if (tool === "pen" || tool === "eraser") {
      setActiveTool(tool);
    }
  });
}

clearCanvas();

export const buildPictoCard = (): PictoCard => ({
  bg: "blank",
  h: 79,
  ops: structuredClone(ops),
  palette: DEFAULT_PALETTE.slice(0, 2),
  v: 1,
  w: 228,
});

export const buildPreviewDataUrl = (): string => canvas.toDataURL("image/png");

export const resetEditor = (): void => {
  ops.length = 0;
  drawing = false;
  currentStroke = null;
  clearCanvas();
};

declare global {
  interface Window {
    pictoEditor?: {
      buildPictoCard: () => PictoCard;
      buildPreviewDataUrl: () => string;
      resetEditor: () => void;
    };
  }
}

window.pictoEditor = {
  buildPictoCard,
  buildPreviewDataUrl,
  resetEditor,
};
