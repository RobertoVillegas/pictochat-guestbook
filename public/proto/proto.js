const draw = document.querySelector("#draw");
const preview = document.querySelector("#message-preview");
const ctx = draw.getContext("2d");
const penButton = document.querySelector("#tool-pen");
const eraserButton = document.querySelector("#tool-eraser");

let tool = "pen";
let drawing = false;
let last = null;

const canvasPoint = (event) => {
  const rect = draw.getBoundingClientRect();
  const scaleX = draw.width / rect.width;
  const scaleY = draw.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

const stroke = (from, to) => {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 6;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#1a1a1e";
    ctx.lineWidth = 2;
  }
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
};

draw.addEventListener("pointerdown", (event) => {
  drawing = true;
  draw.setPointerCapture(event.pointerId);
  last = canvasPoint(event);
  stroke(last, last);
});

draw.addEventListener("pointermove", (event) => {
  if (!drawing) {
    return;
  }
  const point = canvasPoint(event);
  stroke(last, point);
  last = point;
});

const stop = () => {
  drawing = false;
  last = null;
};
draw.addEventListener("pointerup", stop);
draw.addEventListener("pointercancel", stop);

const setTool = (next) => {
  tool = next;
  penButton.classList.toggle("active", next === "pen");
  eraserButton.classList.toggle("active", next === "eraser");
};
penButton.addEventListener("click", () => setTool("pen"));
eraserButton.addEventListener("click", () => setTool("eraser"));

document.querySelector("#clear").addEventListener("click", () => {
  ctx.clearRect(0, 0, draw.width, draw.height);
});

document.querySelector("#send").addEventListener("click", () => {
  const previewCtx = preview.getContext("2d");
  previewCtx.clearRect(0, 0, preview.width, preview.height);
  previewCtx.drawImage(
    draw,
    0,
    0,
    draw.width,
    draw.height,
    0,
    0,
    preview.width,
    preview.height
  );
  ctx.clearRect(0, 0, draw.width, draw.height);
});
