const AUTHOR_STORAGE_KEY = "picto-author-name";
const SURFACE_SLUG = "roberto-guestbook";

const CANVAS_W = 437;
const CANVAS_H = 151;
const INK_COLOR = "#0e155b";
const GLYPH_FONT = "16px system-ui, sans-serif";
const GLYPH_FONT_ID = "paper-v1";
const DEFAULT_PALETTE = ["#0e155b", "#f8f9f4", "#ff0000", "#0000ff"];

// text starts below the nametag pill, like real PictoChat
const CURSOR_X_START = 12;
const CURSOR_Y_START = 42;
const CURSOR_WRAP_X = 420;
const CURSOR_LINE_HEIGHT = 22;
const GLYPH_ADVANCE_GAP = 2;

type Point = [number, number];

interface StrokeOp {
  t: "stroke";
  tool: "pen" | "eraser";
  size: number;
  color: number;
  p: Point[];
}

interface GlyphOp {
  t: "glyph";
  ch: string;
  x: number;
  y: number;
  font: string;
  s: number;
}

type Op = StrokeOp | GlyphOp;

interface PictoCard {
  v: 1;
  w: number;
  h: number;
  bg: string;
  palette: string[];
  ops: Op[];
}

interface FeedEntry {
  id: string;
  author_name: string | null;
  preview_path: string;
  preview_width: number;
  preview_height: number;
  created_at: string;
}

interface StreamEntry {
  id: string;
  author_name: string | null;
  preview_path: string;
  created_at: string;
}

const SHIFT_MAP: Record<string, string> = {
  "'": '"',
  ",": "<",
  "-": "_",
  ".": ">",
  "/": "?",
  "0": ")",
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  ";": ":",
  "=": "+",
  "[": "{",
  "\\": "|",
  "]": "}",
  "`": "~",
};

const previewsPrefixRegex = /^previews\//u;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const mediaUrl = (previewPath: string): string =>
  `/media/${previewPath.replace(previewsPrefixRegex, "")}`;

const displayName = (authorName: string | null): string =>
  authorName ? escapeHtml(authorName) : "Anonymous";

const canvas = document.querySelector("#pc-canvas") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("demo canvas not found");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

ctx.imageSmoothingEnabled = false;

const glyphCanvas = document.createElement("canvas");
const glyphCtx = glyphCanvas.getContext("2d");
if (!glyphCtx) {
  throw new Error("glyph offscreen context unavailable");
}
glyphCtx.imageSmoothingEnabled = false;

const ops: Op[] = [];
let cursorX = CURSOR_X_START;
let cursorY = CURSOR_Y_START;
let shiftActive = false;
let capsActive = false;
let drawing = false;
let currentStroke: StrokeOp | null = null;

const measureThresholdedGlyph = (ch: string): number => {
  glyphCtx.clearRect(0, 0, 64, 32);
  glyphCtx.font = GLYPH_FONT;
  glyphCtx.fillStyle = "#000";
  glyphCtx.textBaseline = "top";
  glyphCtx.fillText(ch, 0, 0);
  const metrics = glyphCtx.measureText(ch);
  return Math.ceil(metrics.width);
};

const stampThresholdedGlyph = (ch: string, x: number, y: number): number => {
  const width = measureThresholdedGlyph(ch);
  glyphCanvas.width = Math.max(width + 2, 8);
  glyphCanvas.height = 24;
  glyphCtx.clearRect(0, 0, glyphCanvas.width, glyphCanvas.height);
  glyphCtx.font = GLYPH_FONT;
  glyphCtx.fillStyle = "#000";
  glyphCtx.textBaseline = "top";
  glyphCtx.fillText(ch, 0, 0);

  const imageData = glyphCtx.getImageData(
    0,
    0,
    glyphCanvas.width,
    glyphCanvas.height
  );
  const { data } = imageData;
  const inkR = 14;
  const inkG = 21;
  const inkB = 91;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    if (alpha >= 128) {
      data[i] = inkR;
      data[i + 1] = inkG;
      data[i + 2] = inkB;
      data[i + 3] = 255;
    } else {
      data[i + 3] = 0;
    }
  }
  glyphCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(glyphCanvas, x, y);
  return width;
};

const resolveChar = (raw: string): string => {
  if (raw.length !== 1) {
    return raw;
  }
  const isLetter = /[a-z]/iu.test(raw);
  if (isLetter) {
    if (shiftActive) {
      return raw.toUpperCase();
    }
    return capsActive ? raw.toUpperCase() : raw;
  }
  if (shiftActive && SHIFT_MAP[raw]) {
    return SHIFT_MAP[raw];
  }
  return raw;
};

const insertGlyph = (raw: string): void => {
  const ch = resolveChar(raw);
  if (shiftActive) {
    shiftActive = false;
    document
      .querySelector('[data-key="Shift"]')
      ?.classList.remove("is-pressed");
  }

  if (ch === "\n") {
    cursorX = CURSOR_X_START;
    cursorY += CURSOR_LINE_HEIGHT;
    if (cursorY > CANVAS_H - 20) {
      cursorY = CANVAS_H - 20;
    }
    return;
  }

  if (ch === " ") {
    ops.push({
      ch: " ",
      font: GLYPH_FONT_ID,
      s: 1,
      t: "glyph",
      x: cursorX,
      y: cursorY,
    });
    cursorX += 8;
    if (cursorX > CURSOR_WRAP_X) {
      cursorX = CURSOR_X_START;
      cursorY += CURSOR_LINE_HEIGHT;
    }
    return;
  }

  const width = stampThresholdedGlyph(ch, cursorX, cursorY);
  ops.push({
    ch,
    font: GLYPH_FONT_ID,
    s: 1,
    t: "glyph",
    x: cursorX,
    y: cursorY,
  });
  cursorX += width + GLYPH_ADVANCE_GAP;
  if (cursorX > CURSOR_WRAP_X) {
    cursorX = CURSOR_X_START;
    cursorY += CURSOR_LINE_HEIGHT;
  }
};

const resetCursor = (): void => {
  cursorX = CURSOR_X_START;
  cursorY = CURSOR_Y_START;
};

const syncCursorFromOps = (): void => {
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    const op = ops[i];
    if (op?.t === "glyph") {
      const width = op.ch === " " ? 8 : measureThresholdedGlyph(op.ch);
      cursorX = op.x + width + GLYPH_ADVANCE_GAP;
      cursorY = op.y;
      return;
    }
  }
  resetCursor();
};

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
  ctx.fillStyle = DEFAULT_PALETTE[stroke.color] ?? INK_COLOR;
  ctx.fillRect(x, y, stroke.size, stroke.size);
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

const replayGlyph = (op: GlyphOp): void => {
  stampThresholdedGlyph(op.ch, op.x, op.y);
};

const clearCanvas = (): void => {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
};

const redraw = (): void => {
  clearCanvas();
  for (const op of ops) {
    if (op.t === "stroke") {
      replayStroke(op);
    } else {
      replayGlyph(op);
    }
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

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  drawing = true;
  const point = canvasPoint(event);
  currentStroke = {
    color: 0,
    p: [point],
    size: 1,
    t: "stroke",
    tool: "pen",
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

const flashPressed = (el: Element): void => {
  el.classList.add("is-pressed");
  setTimeout(() => {
    if (el.dataset.key !== "Shift" && el.dataset.key !== "Caps") {
      el.classList.remove("is-pressed");
    }
  }, 100);
};

const handleKeyPress = (key: string, el: Element): void => {
  flashPressed(el);

  if (key === "Shift") {
    shiftActive = true;
    el.classList.add("is-pressed");
    return;
  }

  if (key === "Caps") {
    capsActive = !capsActive;
    el.classList.toggle("is-pressed", capsActive);
    return;
  }

  if (key === "Backspace") {
    for (let i = ops.length - 1; i >= 0; i -= 1) {
      const op = ops[i];
      if (op?.t === "glyph") {
        ops.splice(i, 1);
        break;
      }
    }
    redraw();
    syncCursorFromOps();
    return;
  }

  if (key === "Enter") {
    insertGlyph("\n");
    return;
  }

  if (key === " ") {
    insertGlyph(" ");
    return;
  }

  insertGlyph(key);
};

for (const keyEl of document.querySelectorAll<HTMLButtonElement>(".pc-key")) {
  keyEl.addEventListener("click", () => {
    const { key } = keyEl.dataset;
    if (!key) {
      return;
    }
    handleKeyPress(key, keyEl);
  });
}

const undoLastOp = (): void => {
  ops.pop();
  redraw();
  syncCursorFromOps();
};

const clearAll = (): void => {
  ops.length = 0;
  resetCursor();
  clearCanvas();
};

document
  .querySelector("#pc-control-back")
  ?.addEventListener("click", (event) => {
    const el = event.currentTarget as Element;
    el.classList.add("is-pressed");
    setTimeout(() => el.classList.remove("is-pressed"), 100);
    undoLastOp();
  });

document
  .querySelector("#pc-control-clear")
  ?.addEventListener("click", (event) => {
    const el = event.currentTarget as Element;
    el.classList.add("is-pressed");
    setTimeout(() => el.classList.remove("is-pressed"), 100);
    clearAll();
  });

const buildPictoCard = (): PictoCard => ({
  bg: "blank",
  h: CANVAS_H,
  ops: structuredClone(ops),
  palette: DEFAULT_PALETTE.slice(0, 2),
  v: 1,
  w: CANVAS_W,
});

const buildPreviewDataUrl = (): string => canvas.toDataURL("image/png");

const resetEditor = (): void => {
  ops.length = 0;
  drawing = false;
  currentStroke = null;
  resetCursor();
  clearCanvas();
};

const renderFeedCard = (entry: FeedEntry): string =>
  `<article class="pc-message pc-message--sent" data-id="${entry.id}">
  <span class="pc-nametag pc-nametag--readonly">${displayName(entry.author_name)}</span>
  <div class="pc-message-body">
    <img class="pc-message-preview" src="${mediaUrl(entry.preview_path)}" alt="${entry.author_name ?? "entry"}" width="${entry.preview_width}" height="${entry.preview_height}" />
  </div>
</article>`;

const prependFeedCard = (entry: FeedEntry): void => {
  const feed = document.querySelector("#pc-feed");
  if (!feed) {
    return;
  }
  if (feed.querySelector(`[data-id="${entry.id}"]`)) {
    return;
  }
  feed.insertAdjacentHTML("afterbegin", renderFeedCard(entry));
};

const removeFeedCard = (entryId: string): void => {
  document.querySelector(`[data-id="${entryId}"]`)?.remove();
};

const loadFeed = async (): Promise<void> => {
  const feed = document.querySelector("#pc-feed");
  if (!feed) {
    return;
  }

  const response = await fetch(
    `/api/surfaces/${encodeURIComponent(SURFACE_SLUG)}/entries`
  );
  if (!response.ok) {
    feed.textContent = "Could not load the feed.";
    return;
  }

  const entries = (await response.json()) as FeedEntry[];
  feed.innerHTML = entries.map((entry) => renderFeedCard(entry)).join("");
};

const connectStream = (): void => {
  const source = new EventSource(
    `/api/surfaces/${encodeURIComponent(SURFACE_SLUG)}/stream`
  );

  let dropped = false;
  source.addEventListener("error", () => {
    dropped = true;
  });
  source.addEventListener("open", () => {
    if (dropped) {
      dropped = false;
      void loadFeed();
    }
  });

  source.addEventListener("entry", (event) => {
    const entry = JSON.parse(event.data) as StreamEntry;
    prependFeedCard({
      ...entry,
      preview_height: CANVAS_H,
      preview_width: CANVAS_W,
    });
  });

  source.addEventListener("entry:removed", (event) => {
    const payload = JSON.parse(event.data) as { id: string };
    removeFeedCard(payload.id);
  });
};

const authorInput = document.querySelector(
  "#pc-author"
) as HTMLInputElement | null;

if (authorInput) {
  const savedName = localStorage.getItem(AUTHOR_STORAGE_KEY);
  if (savedName) {
    authorInput.value = savedName;
  }
  authorInput.addEventListener("change", () => {
    const trimmed = authorInput.value.trim();
    if (trimmed) {
      localStorage.setItem(AUTHOR_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(AUTHOR_STORAGE_KEY);
    }
  });
}

void loadFeed();
connectStream();

const submitEntry = async (): Promise<void> => {
  const status = document.querySelector("#pc-status");

  const authorName = authorInput?.value.trim() || undefined;
  if (authorName) {
    localStorage.setItem(AUTHOR_STORAGE_KEY, authorName);
  }

  const payload = {
    author_name: authorName,
    card: buildPictoCard(),
    preview: buildPreviewDataUrl(),
  };

  const response = await fetch(
    `/api/surfaces/${encodeURIComponent(SURFACE_SLUG)}/entries`,
    {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );

  if (status) {
    if (!response.ok) {
      status.textContent = `Failed to submit (${response.status}).`;
      return;
    }

    const body = (await response.json()) as { status: string };
    status.textContent =
      body.status === "approved"
        ? "Entry published."
        : "Entry submitted (pending moderation).";
    resetEditor();
  }
};

document
  .querySelector("#pc-control-send")
  ?.addEventListener("click", (event) => {
    const el = event.currentTarget as Element;
    el.classList.add("is-pressed");
    setTimeout(() => el.classList.remove("is-pressed"), 100);
    void submitEntry();
  });

clearCanvas();
