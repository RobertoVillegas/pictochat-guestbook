const CANVAS_W = 256;
const CANVAS_H = 192;
const DEFAULT_PALETTE = ["#000000", "#ffffff", "#ff0000", "#0000ff"];

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
  w: 256;
  h: 192;
  bg: string;
  palette: string[];
  ops: StrokeOp[];
}

const canvas = document.querySelector(
  "#editor-canvas"
) as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("editor canvas not found");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

let currentTool: "pen" | "eraser" = "pen";
let drawing = false;
let currentStroke: StrokeOp | null = null;
const ops: StrokeOp[] = [];

const clearCanvas = (): void => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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

const drawStrokeSegment = (stroke: StrokeOp, fromIndex: number): void => {
  const [first] = stroke.p;
  if (!first) {
    return;
  }
  ctx.strokeStyle =
    stroke.tool === "eraser"
      ? "#ffffff"
      : (DEFAULT_PALETTE[stroke.color] ?? "#000000");
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.beginPath();
  let [x, y] = first;
  for (let i = 1; i <= fromIndex; i += 1) {
    const delta = stroke.p[i];
    if (!delta) {
      continue;
    }
    x += delta[0];
    y += delta[1];
  }
  const next = stroke.p[fromIndex + 1] ?? [0, 0];
  const [dx, dy] = next;
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
};

const redraw = (): void => {
  clearCanvas();
  for (const op of ops) {
    if (op.p.length === 0) {
      continue;
    }
    ctx.strokeStyle =
      op.tool === "eraser"
        ? "#ffffff"
        : (DEFAULT_PALETTE[op.color] ?? "#000000");
    ctx.lineWidth = op.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const [start] = op.p;
    if (!start) {
      continue;
    }
    const [startX, startY] = start;
    ctx.moveTo(startX, startY);
    let x = startX;
    let y = startY;
    for (let i = 1; i < op.p.length; i += 1) {
      const delta = op.p[i];
      if (!delta) {
        continue;
      }
      x += delta[0];
      y += delta[1];
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

const canvasPoint = (event: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_W);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_H);
  return [Math.max(0, Math.min(255, x)), Math.max(0, Math.min(191, y))];
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
    size: currentTool === "eraser" ? 8 : 2,
    t: "stroke",
    tool: currentTool,
  };
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing || !currentStroke) {
    return;
  }
  const point = canvasPoint(event);
  const lastAbs = absoluteLastPoint(currentStroke);
  const delta: Point = [point[0] - lastAbs[0], point[1] - lastAbs[1]];
  if (delta[0] === 0 && delta[1] === 0) {
    return;
  }
  currentStroke.p.push(delta);
  redraw();
  drawStrokeSegment(currentStroke, currentStroke.p.length - 2);
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
  h: 192,
  ops: structuredClone(ops),
  palette: DEFAULT_PALETTE.slice(0, 2),
  v: 1,
  w: 256,
});

export const buildPreviewDataUrl = (): string => canvas.toDataURL("image/png");

declare global {
  interface Window {
    pictoEditor?: {
      buildPictoCard: () => PictoCard;
      buildPreviewDataUrl: () => string;
    };
  }
}

window.pictoEditor = {
  buildPictoCard,
  buildPreviewDataUrl,
};
