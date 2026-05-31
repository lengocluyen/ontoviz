type PillOpts = {
  font: string;
  color: string;
  background: string;
  border?: string;
  paddingX?: number;
  paddingY?: number;
  radius?: number;
};

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));

  // Modern browsers support `ctx.roundRect`.
  const anyCtx = ctx as any;
  if (typeof anyCtx.roundRect === "function") {
    ctx.beginPath();
    anyCtx.roundRect(x, y, w, h, rr);
    return;
  }

  // Fallback for older browsers.
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawTextPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: PillOpts,
) {
  const paddingX = opts.paddingX ?? 4;
  const paddingY = opts.paddingY ?? 2;

  ctx.save();
  ctx.font = opts.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(text);
  const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : 8;
  const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : 2;
  const textW = metrics.width;
  const textH = ascent + descent;

  const w = Math.ceil(textW + paddingX * 2);
  const h = Math.ceil(textH + paddingY * 2);
  const r = opts.radius ?? Math.min(8, h / 2);

  pathRoundRect(ctx, x - w / 2, y - h / 2, w, h, r);
  ctx.fillStyle = opts.background;
  ctx.fill();

  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = opts.color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

