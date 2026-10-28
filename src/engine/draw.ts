import type { BadgeInput, FormatLayout, Theme, ThemeAssets } from "./types";

/**
 * Draws the shareable event badge: a hanging badge with the person's photo
 * turned into an accent halftone, their name in the display face, their role
 * and team. It never carries a QR: that belongs to the private pass.
 *
 * The same drawing runs as a short clip: `drawFrame` paints any instant of
 * it. Accent pixels rain down, a curtain of blocks sweeps over and lifts off
 * the badge, which drops on its strap, resolves the photo from big pixels to
 * the halftone, types the name and the headline and holds on the person. Its
 * last frames are the still.
 *
 * Pure drawing, driven by a `Theme`. The caller loads the photo and the
 * theme's images, waits for the fonts, owns the canvas and decides what to do
 * with the pixels.
 */

/** Deterministic noise in 0..1, so every frame of the clip agrees with the others. */
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Splits a name into at most two lines that fit `width`. */
function nameLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines.length > 2 ? [lines[0]!, lines.slice(1).join(" ")] : lines;
}

/** Shrinks the font until every line fits, down to a floor. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  start: number,
  floor: number,
  width: number,
  weight = "",
): { size: number; lines: string[] } {
  for (let size = start; size >= floor; size -= 4) {
    ctx.font = `${weight}${size}px ${family}`;
    const lines = nameLines(ctx, text, width);
    if (lines.every((line) => ctx.measureText(line).width <= width)) {
      return { size, lines };
    }
  }
  ctx.font = `${weight}${floor}px ${family}`;
  return { size: floor, lines: nameLines(ctx, text, width) };
}

/** "#rrggbb" as numbers, for writing pixels. */
function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** 0 before `start`, 1 after `start + span`, linear in between. The still is always 1. */
function phase(t: number | null, start: number, span: number) {
  return t == null ? 1 : clamp01((t - start) / span);
}

function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

/** How many characters a typist starting at `start` has written by `t`. */
function typedCount(total: number, t: number | null, start: number, perChar: number) {
  if (t == null) return total;
  return Math.max(0, Math.min(total, Math.floor((t - start) / perChar)));
}

/** The display face's weight as a `ctx.font` prefix, empty for the regular cut. */
function displayWeight(theme: Theme) {
  return theme.fonts.displayWeight ? `${theme.fonts.displayWeight} ` : "";
}

/** An image's aspect ratio, tolerating SVGs without intrinsic size. */
function aspect(img: HTMLImageElement) {
  return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4;
}

/** Everything one frame needs, resolved once. */
type Scene = {
  theme: Theme;
  assets: ThemeAssets;
  ctx: CanvasRenderingContext2D;
  input: BadgeInput;
  L: Layout;
};

/** The accent block the typing ends in. */
function caret(s: Scene, x: number, baseline: number, size: number) {
  s.ctx.fillStyle = s.theme.colors.accent;
  s.ctx.fillRect(x + size * 0.06, baseline - size * 0.78, size * 0.5, size * 0.9);
}

/**
 * The square crop of the photo at `grid` by `grid`, as light levels from 0 to
 * 1, stretched so a dim selfie still reads as a face.
 */
function sampleLevels(photo: CanvasImageSource, sx: number, sy: number, side: number, grid: number) {
  const canvas = document.createElement("canvas");
  canvas.width = grid;
  canvas.height = grid;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(photo, sx, sy, side, side, 0, 0, grid, grid);
  const data = ctx.getImageData(0, 0, grid, grid).data;
  const lum = new Float32Array(grid * grid);
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < lum.length; i += 1) {
    const l = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    lum[i] = l;
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < lum.length; i += 1) lum[i] = (lum[i]! - lo) / span;
  return { canvas, ctx, levels: lum };
}

type Crop = { sx: number; sy: number; side: number };

/** Where the square crop sits inside the photo, from zoom and focus. */
function cropOf(input: BadgeInput): Crop | null {
  if (!input.photo || !input.photoSize) return null;
  const { width: pw, height: ph } = input.photoSize;
  const zoom = Math.max(1, input.zoom ?? 1);
  const side = Math.min(pw, ph) / zoom;
  const fx = Math.max(-1, Math.min(1, input.focus?.x ?? 0));
  const fy = Math.max(-1, Math.min(1, input.focus?.y ?? 0));
  return {
    side,
    sx: (pw - side) / 2 + (fx * (pw - side)) / 2,
    sy: (ph - side) / 2 + (fy * (ph - side)) / 2,
  };
}

/**
 * What the photo becomes, sampled once per crop and palette. A clip draws the
 * portrait a couple of hundred times; reading the photo's pixels each time
 * would be most of the work.
 */
type Prepared = {
  photo: CanvasImageSource;
  key: string;
  crop: Crop;
  tone: HTMLCanvasElement | null;
  levels: Map<number, Float32Array | null>;
};

let prepared: Prepared | null = null;

function prepare(photo: CanvasImageSource, crop: Crop, theme: Theme): Prepared {
  const key = `${crop.sx}|${crop.sy}|${crop.side}|${theme.colors.background}|${theme.colors.accent}`;
  if (prepared && prepared.photo === photo && prepared.key === key) return prepared;
  prepared = { photo, key, crop, tone: duotone(photo, crop, theme), levels: new Map() };
  return prepared;
}

function levelsAt(p: Prepared, grid: number) {
  if (!p.levels.has(grid)) {
    p.levels.set(grid, sampleLevels(p.photo, p.crop.sx, p.crop.sy, p.crop.side, grid)?.levels ?? null);
  }
  return p.levels.get(grid) ?? null;
}

/** The photo itself in background-to-accent duotone, laid under the dots. */
function duotone(photo: CanvasImageSource, crop: Crop, theme: Theme) {
  const size = 240;
  const tone = sampleLevels(photo, crop.sx, crop.sy, crop.side, size);
  if (!tone) return null;
  const [ir, ig, ib] = channels(theme.colors.background);
  const [vr, vg, vb] = channels(theme.colors.accent);
  const { canvas, ctx, levels } = tone;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < levels.length; i += 1) {
    const v = levels[i]!;
    image.data[i * 4] = ir + (vr - ir) * v;
    image.data[i * 4 + 1] = ig + (vg - ig) * v;
    image.data[i * 4 + 2] = ib + (vb - ib) * v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The finished portrait: an accent dot per cell, as big as the light there. */
function drawHalftone(s: Scene, p: Prepared, x: number, y: number, size: number) {
  const { ctx, theme } = s;
  const { grid, duotoneAlpha } = theme.effects.halftone;
  // The duotone stays at partial opacity: the halftone is the look, and the
  // face stays recognisable.
  if (p.tone) {
    ctx.globalAlpha = duotoneAlpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(p.tone, x, y, size, size);
    ctx.globalAlpha = 1;
  }
  const cell = size / grid;
  const levels = levelsAt(p, grid);
  if (!levels) return;
  ctx.fillStyle = theme.colors.accent;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const v = levels[gy * grid + gx]!;
      const r = (cell / 2) * Math.pow(v, 0.9) * 0.95;
      if (r < cell * 0.08) continue;
      ctx.beginPath();
      ctx.arc(x + gx * cell + cell / 2, y + gy * cell + cell / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * The photo as square pixels in four steps of the accent, the way it looks
 * before it resolves. `shown` is how many of the cells have popped in, 0 to 1.
 */
function drawBlocks(
  s: Scene,
  levels: Float32Array,
  grid: number,
  x: number,
  y: number,
  size: number,
  shown = 1,
  alpha = 1,
) {
  const { ctx } = s;
  const cell = size / grid;
  const gap = Math.max(1, cell * 0.08);
  ctx.fillStyle = s.theme.colors.accent;
  for (let i = 0; i < levels.length; i += 1) {
    if (shown < 1 && hash(i * 1.37 + 0.5) > shown) continue;
    const q = Math.round(levels[i]! * 4) / 4;
    if (q === 0) continue;
    ctx.globalAlpha = q * alpha;
    ctx.fillRect(x + (i % grid) * cell, y + Math.floor(i / grid) * cell, cell - gap, cell - gap);
  }
  ctx.globalAlpha = 1;
}

/** The theme's placeholder mark: a pixel grid in dots, or its image, popping in. */
function drawMark(s: Scene, t: number | null, x: number, y: number, size: number) {
  const { ctx, theme, assets } = s;
  const shown = phase(t, theme.timing.beats.pop, 0.8);
  if ("image" in theme.mark) {
    const img = assets.mark;
    if (!img) return;
    const r = aspect(img);
    const box = size * 0.66;
    const w = r >= 1 ? box : box * r;
    const h = r >= 1 ? box / r : box;
    ctx.globalAlpha = shown;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    ctx.globalAlpha = 1;
    return;
  }
  const grid = theme.mark.grid;
  const cols = Math.max(...grid.map((row) => row.length)) * 2;
  const rows = grid.length * 2;
  const unit = (size * 0.66) / Math.max(rows, cols);
  const ox = x + (size - cols * unit) / 2;
  const oy = y + (size - rows * unit) / 2;
  ctx.fillStyle = theme.colors.accent;
  grid.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      if (row[rx] !== "#") continue;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          if (shown < 1 && hash(rx * 13.1 + ry * 7.3 + dx + dy * 2.7) > shown) continue;
          ctx.beginPath();
          ctx.arc(ox + (rx * 2 + dx) * unit + unit / 2, oy + (ry * 2 + dy) * unit + unit / 2, unit * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
}

/**
 * The portrait. In the clip it pops in as big pixels, refines and resolves
 * into the halftone over a soft duotone. Without a photo, the theme's mark.
 */
function drawPortrait(s: Scene, t: number | null, x: number, y: number, size: number) {
  const { ctx, theme, input } = s;
  const { beats } = theme.timing;
  const refine = theme.effects.refine;
  ctx.save();
  roundRect(ctx, x, y, size, size, 24);
  ctx.clip();
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(x, y, size, size);

  const crop = cropOf(input);
  if (input.photo && crop) {
    const p = prepare(input.photo, crop, theme);
    if (t == null || t >= beats.sharp) {
      drawHalftone(s, p, x, y, size);
      const fade = 1 - phase(t, beats.sharp, 0.4);
      const last = refine[refine.length - 1]!;
      const levels = levelsAt(p, last);
      if (fade > 0 && levels) drawBlocks(s, levels, last, x, y, size, 1, fade);
    } else if (t >= beats.pop) {
      const step =
        t < beats.refine ? 0 : Math.min(refine.length - 1, Math.floor((t - beats.refine) / 0.2));
      const grid = refine[step]!;
      const levels = levelsAt(p, grid);
      if (levels) drawBlocks(s, levels, grid, x, y, size, phase(t, beats.pop, beats.refine - beats.pop));
    }
  } else {
    drawMark(s, t, x, y, size);
  }
  ctx.restore();
}

/**
 * Pixel fragments eating into the card's edges, like the printed badges.
 * `shown` is how many of them are there yet, 0 to 1.
 */
function drawFragments(s: Scene, x: number, y: number, w: number, h: number, seed: number, shown = 1) {
  const { ctx } = s;
  const cols = 20;
  const cell = w / cols;
  const rows = Math.round(h / cell);
  ctx.fillStyle = s.theme.colors.accent;
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const edge = Math.min(gx, gy, cols - 1 - gx, rows - 1 - gy);
      if (edge > 1) continue;
      // The foot carries text: keep the inner ring off the bottom rows.
      if (edge === 1 && gy > rows - 5) continue;
      if (shown < 1 && hash(gx * 3.1 + gy * 7.7 + 0.3) > shown) continue;
      const corner = (gx < 5 || gx > cols - 6) && (gy < 6 || gy > rows - 7) ? 0.22 : 0;
      const odds = [0.42, 0.12][edge]! + corner;
      if (hash(gx * 17.3 + gy * 41.9 + seed * 7.7) < odds) {
        const wide = hash(gx + gy * 3 + seed) > 0.86 ? 2 : 1;
        ctx.fillRect(x + gx * cell, y + gy * cell, cell * wide + 0.5, cell + 0.5);
      }
    }
  }
}

/**
 * The hand-over: big accent blocks on a grid sweep in from the top right
 * until the frame is covered, then drop away in the same order.
 */
function drawWipe(s: Scene, t: number | null) {
  const { wipe } = s.theme.timing;
  if (!s.theme.effects.wipe || t == null || t < wipe.start || t >= wipe.end) return;
  const { ctx } = s;
  const { width, height } = s.L;
  const cols = 8;
  const cell = width / cols;
  const rows = Math.ceil(height / cell);
  const covering = t < wipe.full;
  const p = covering ? easeOut((t - wipe.start) / (wipe.full - wipe.start)) : (t - wipe.full) / (wipe.end - wipe.full);
  ctx.fillStyle = s.theme.colors.accent;
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const order = hash(gx * 12.9898 + gy * 78.233 + 4.1) * 0.6 + (1 - gx / cols) * 0.2 + (gy / rows) * 0.2;
      if (covering ? order > p : order < p) continue;
      ctx.fillRect(gx * cell, gy * cell, cell - 4, cell - 4);
    }
  }
}

/**
 * Loose pixels blinking around an area, a few at a time, so a frame that
 * holds still never looks frozen. `ring` keeps them to a band along the edges.
 */
function drawSparks(
  s: Scene,
  t: number,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  count: number,
  odds: number,
  ring?: number,
) {
  const { ctx } = s;
  ctx.fillStyle = s.theme.colors.accent;
  const tick = Math.floor(t * 5);
  for (let i = 0; i < count; i += 1) {
    if (hash(i * 4.4 + tick * 1.7) < odds) continue;
    const px = x + hash(i * 3.3 + 1) * w;
    const py = y + hash(i * 8.1 + 2) * h;
    if (ring && px > x + ring && px < x + w - ring && py > y + ring && py < y + h - ring) continue;
    ctx.fillRect(Math.round(px / size) * size, Math.round(py / size) * size, size, size);
  }
}

/** The opening: accent pixels of a few sizes falling down the frame, faster as they go. */
function drawRain(s: Scene, t: number) {
  const { ctx } = s;
  const { width, height } = s.L;
  const unit = width / 24;
  ctx.fillStyle = s.theme.colors.accent;
  for (let i = 0; i < 90; i += 1) {
    const start = hash(i * 2.3 + 0.7) * 0.75;
    if (t < start) continue;
    const size = unit * (1 + Math.floor(hash(i * 5.9 + 3) * 3));
    const x = Math.floor(hash(i * 7.1 + 1) * 24) * unit;
    const fall = t - start;
    const y = -size + fall * fall * (2600 + hash(i * 3.7 + 9) * 2600);
    if (y > height) continue;
    // A short trail of fainter copies reads as speed.
    for (let k = 2; k >= 0; k -= 1) {
      ctx.globalAlpha = k === 0 ? 1 : 0.35 / k;
      ctx.fillRect(x, y - k * size * 0.9, size - 3, size - 3);
    }
  }
  ctx.globalAlpha = 1;
}

function layoutOf(f: FormatLayout) {
  const { width } = f;
  const cardW = f.card.width;
  const cardH = f.card.height;
  const cardX = (width - cardW) / 2;
  const cardY = f.card.y;
  return {
    ...f,
    pad: 72,
    cardW,
    cardH,
    cardX,
    cardY,
    strapW: 64,
    inner: cardX + cardW * 0.16,
    innerW: cardW * 0.68,
    photoSize: f.photo.size,
    photoX: width / 2 - f.photo.size / 2,
    photoY: cardY + f.photo.offsetY,
    footY: cardY + cardH - f.footInset,
    headY: cardY + cardH + f.headlineGap,
  };
}

type Layout = ReturnType<typeof layoutOf>;

/** The wordmark (typed text or a logo image), the date and the byline. */
function drawTop(s: Scene, t: number | null) {
  const { ctx, theme, L, assets } = s;
  const { beats } = theme.timing;
  const display = theme.fonts.display;
  const baseline = L.pad + 40;
  ctx.textBaseline = "alphabetic";

  if ("parts" in theme.wordmark) {
    const parts = theme.wordmark.parts;
    const total = parts.reduce((n, part) => n + part.text.length, 0);
    let left = typedCount(total, t, beats.mark, 0.035);
    let x = L.pad;
    ctx.font = `${displayWeight(theme)}52px ${display}`;
    for (const part of parts) {
      const shown = part.text.slice(0, Math.max(0, left));
      left -= part.text.length;
      ctx.fillStyle = theme.colors[part.color];
      ctx.fillText(shown, x, baseline);
      x += ctx.measureText(shown).width;
      if (shown.length < part.text.length) break;
    }
    if (t != null && t >= beats.mark && left < 0) caret(s, x, baseline, 52);
  } else if (assets.wordmark) {
    const h = theme.wordmark.height;
    ctx.globalAlpha = phase(t, beats.mark, 0.4);
    ctx.drawImage(assets.wordmark, L.pad, baseline - h * 0.85, h * aspect(assets.wordmark), h);
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = phase(t, beats.meta, 0.3);
  ctx.font = `30px ${theme.fonts.body}`;
  ctx.textAlign = "right";
  ctx.fillStyle = theme.colors.text;
  ctx.fillText(theme.copy.dateLine.toUpperCase(), L.width - L.pad, L.pad + 36);
  ctx.textAlign = "left";
  if (theme.copy.byline) {
    ctx.globalAlpha *= 0.6;
    ctx.font = `26px ${theme.fonts.body}`;
    ctx.fillText(theme.copy.byline, L.pad, L.pad + 84);
  }
  ctx.globalAlpha = 1;
}

/** The card and its strap, with everything printed on it. */
function drawCard(s: Scene, t: number | null) {
  const { ctx, theme, input, L } = s;
  const { beats } = theme.timing;
  const { width, cardX, cardY, cardW, cardH, strapW, inner, innerW, card } = L;
  const display = theme.fonts.display;
  const body = theme.fonts.body;

  // In the clip the card falls in from above, tilted, and swings on its
  // strap until it settles, turning around the top of the strap.
  const fall = 1 - easeOut(phase(t, beats.drop, 0.7));
  const swing = t == null ? 0 : Math.max(0, t - beats.drop);
  const angle = t == null ? 0 : -0.22 * Math.exp(-3.5 * swing) * Math.cos(6 * swing);
  ctx.save();
  ctx.translate(width / 2, 0);
  ctx.rotate(angle);
  ctx.translate(-width / 2, -(cardY + cardH + 160) * fall);

  if (theme.effects.strap) {
    // The strap runs well above the frame so the swing never shows its end.
    const strapTop = -14 * 150;
    ctx.fillStyle = theme.colors.accent;
    ctx.fillRect(width / 2 - strapW / 2, strapTop, strapW, cardY + 30 - strapTop);
    ctx.fillStyle = theme.colors.background;
    for (let sy = strapTop; sy < cardY; sy += 14) {
      ctx.fillRect(width / 2 - strapW / 2, sy, strapW, 4);
    }
  }

  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, card.radius);
  ctx.fillStyle = theme.colors.card;
  ctx.fill();
  ctx.clip();
  if (theme.effects.fragments) {
    drawFragments(s, cardX, cardY, cardW, cardH, (input.name.length % 5) + 3, phase(t, beats.fragments, 0.7));
  }
  ctx.restore();

  // Clip and slot.
  ctx.fillStyle = theme.colors.background;
  roundRect(ctx, width / 2 - 90, cardY + 44, 180, 30, 15);
  ctx.fill();

  drawPortrait(s, t, L.photoX, L.photoY, L.photoSize);

  // Name, typed; then role and team.
  let cursor = L.photoY + L.photoSize + L.nameGap;
  const fitted = fitFont(ctx, input.name || " ", display, L.nameSize.max, L.nameSize.min, innerW, displayWeight(theme));
  const total = fitted.lines.reduce((n, line) => n + line.length, 0);
  const perChar = Math.min(0.05, 0.8 / Math.max(1, total));
  let left = typedCount(total, t, beats.name, perChar);
  const typing = t != null && t >= beats.name && left < total;
  ctx.font = `${displayWeight(theme)}${fitted.size}px ${display}`;
  for (const line of fitted.lines) {
    const shown = line.slice(0, Math.max(0, left));
    ctx.fillStyle = theme.colors.text;
    ctx.fillText(shown, inner, cursor);
    if (typing && left >= 0 && left < line.length) {
      caret(s, inner + ctx.measureText(shown).width, cursor, fitted.size);
    }
    left -= line.length;
    cursor += fitted.size * 1.02;
  }

  const after = beats.name + perChar * total + 0.1;
  const role = input.role.toUpperCase();
  cursor += 14;
  ctx.font = `30px ${body}`;
  ctx.fillStyle = theme.colors.accent;
  ctx.fillText(role.slice(0, typedCount(role.length, t, after, 0.02)), inner, cursor);
  if (input.team) {
    cursor += 44;
    ctx.fillStyle = theme.colors.text;
    const team = fitFont(ctx, input.team.toUpperCase(), body, 30, 22, innerW);
    const line = team.lines[0]!;
    ctx.font = `${team.size}px ${body}`;
    ctx.fillText(line.slice(0, typedCount(line.length, t, after + 0.15, 0.02)), inner, cursor);
  }

  // Card foot: a rule drawn across, the event and what it is.
  ctx.fillStyle = theme.colors.text;
  ctx.fillRect(inner, L.footY, innerW * easeOut(phase(t, beats.rule, 0.4)), 2);
  ctx.globalAlpha = phase(t, beats.foot, 0.3);
  ctx.font = `26px ${body}`;
  ctx.fillText(theme.copy.footer.replace("{date}", theme.copy.dateLine).toUpperCase(), inner, L.footY + 46);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.colors.accent;
  ctx.fillText(theme.copy.footerTag.toUpperCase(), inner + innerW, L.footY + 46);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;

  ctx.restore();
}

/** Under the card: the line people read first, typed, with its caret blinking while it holds. */
function drawUnder(s: Scene, t: number | null) {
  const { ctx, theme, L } = s;
  const { beats } = theme.timing;
  const headline = theme.copy.headline;
  const size = L.headlineSize;
  ctx.font = `${displayWeight(theme)}${size}px ${theme.fonts.display}`;
  const full = ctx.measureText(headline).width;
  const x = L.width / 2 - full / 2;
  const shown = headline.slice(0, typedCount(headline.length, t, beats.headline, 0.06));
  ctx.fillStyle = theme.colors.accent;
  ctx.fillText(shown, x, L.headY);
  if (t != null && t >= beats.headline && (shown.length < headline.length || Math.floor(t * 2) % 2 === 0)) {
    caret(s, x + ctx.measureText(shown).width, L.headY, size);
  }
  if (L.showUrl && theme.copy.url) {
    ctx.globalAlpha = phase(t, beats.url, 0.3);
    ctx.font = `32px ${theme.fonts.body}`;
    ctx.fillStyle = theme.colors.text;
    ctx.textAlign = "center";
    ctx.fillText(theme.copy.url, L.width / 2, L.headY + 80);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}

/** The sponsor strip: logos side by side, centred, all at the same height. */
function drawLogos(s: Scene, t: number | null) {
  const { ctx, L, assets, theme } = s;
  if (!L.logos || !assets.logos.length) return;
  const { y, height, gap } = L.logos;
  const maxW = L.width - L.pad * 2;
  let widths = assets.logos.map((img) => height * aspect(img));
  let h = height;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  // Too many logos for the row: shrink them all together rather than overflow.
  if (total > maxW) {
    const k = (maxW - gap * (widths.length - 1)) / (total - gap * (widths.length - 1));
    widths = widths.map((w) => w * k);
    h = height * k;
  }
  let x = (L.width - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1))) / 2;
  assets.logos.forEach((img, i) => {
    ctx.globalAlpha = phase(t, theme.timing.beats.logos + i * 0.08, 0.3);
    ctx.drawImage(img, x, y + (height - h) / 2, widths[i]!, h);
    x += widths[i]! + gap;
  });
  ctx.globalAlpha = 1;
}

/**
 * One instant of the clip, `t` seconds in. `null` is the still: no caret, no
 * motion, everything in place.
 */
export function drawFrame(
  canvas: HTMLCanvasElement,
  theme: Theme,
  assets: ThemeAssets,
  input: BadgeInput,
  t: number | null,
) {
  const L = layoutOf(theme.formats[input.format]);
  // Resizing clears and reallocates the canvas; a clip draws the same size
  // every frame, so only resize when it changed.
  if (canvas.width !== L.width) canvas.width = L.width;
  if (canvas.height !== L.height) canvas.height = L.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s: Scene = { theme, assets, ctx, input, L };
  const { wipe, badgeAt, beats } = theme.timing;

  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, L.width, L.height);

  const raining = theme.effects.rain && t != null && t < (theme.effects.wipe ? wipe.full : badgeAt);
  if (raining) {
    drawRain(s, t);
  } else {
    const u = t == null ? null : t - badgeAt;
    drawTop(s, u);
    drawCard(s, u);
    drawUnder(s, u);
    drawLogos(s, u);
    if (theme.effects.sparks && t != null && u != null && u > beats.name) {
      const m = 56;
      drawSparks(s, t, L.cardX - m, L.cardY - m, L.cardW + 2 * m, L.cardH + 2 * m, 20, 40, 0.8, m + 40);
    }
  }
  drawWipe(s, t);
}

/** The still: the last frame of the clip, with nothing moving. */
export function drawBadge(canvas: HTMLCanvasElement, theme: Theme, assets: ThemeAssets, input: BadgeInput) {
  drawFrame(canvas, theme, assets, input, null);
}
