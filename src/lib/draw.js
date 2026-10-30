// Drawing the video frame with its overlays (scale, axes, tracked points,
// magnifier), plus hit-testing and dragging of those overlays.
import { AXLEN } from './constants.js';
import { clamp } from './maths.js';
import { activeObj, armAngle, objById, refAngle, series, sourceObj, toWorld, trackedPts } from './model.js';

export const toScreen = (view, p) => ({ x: view.ox + p.x * view.s, y: view.oy + p.y * view.s });
export const toVideo = (view, q) => ({ x: (q.x - view.ox) / view.s, y: (q.y - view.oy) / view.s });
export const insideVideo = (V, p) => p.x >= 0 && p.y >= 0 && p.x <= V.w && p.y <= V.h;
export const clampVideo = (V, p) => ({ x: clamp(p.x, 0, V.w), y: clamp(p.y, 0, V.h) });

/** Screen directions (unit vectors) of the +x and +y axes. */
export function axisDirs(a = 0) {
  return { xd: { x: Math.cos(a), y: -Math.sin(a) }, yd: { x: -Math.sin(a), y: -Math.cos(a) } };
}

/* ---------- primitives ---------- */
function line(ctx, a, b, color, w, dash) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}
function circle(ctx, p, r, fill, stroke, w = 2) {
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
}
function label(ctx, text, p, color = '#fff', bg = 'rgba(0,0,0,.65)') {
  ctx.save();
  ctx.font = '700 14px "Atkinson Hyperlegible", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(p.x - w / 2, p.y - 12, w, 24, 6); else ctx.rect(p.x - w / 2, p.y - 12, w, 24);
  ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y + 1);
  ctx.restore();
}

/* ---------- overlays ---------- */
const AXIS_COL = '#38bdf8';
const SCALE_COL = '#facc15';

function drawAxes(ctx, view, S, step, alpha) {
  if (!S.axes.o) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const o = toScreen(view, S.axes.o);
  const { xd, yd } = axisDirs(S.axes.a);
  const xe = { x: o.x + xd.x * AXLEN, y: o.y + xd.y * AXLEN };
  const ye = { x: o.x + yd.x * AXLEN, y: o.y + yd.y * AXLEN };
  [[xe, 'x'], [ye, 'y']].forEach(([e, n]) => {
    line(ctx, o, e, 'rgba(0,0,0,.6)', 5);
    line(ctx, o, e, AXIS_COL, 2.5);
    const ang = Math.atan2(e.y - o.y, e.x - o.x);
    ctx.fillStyle = AXIS_COL;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(ang) * 10, e.y + Math.sin(ang) * 10);
    ctx.lineTo(e.x + Math.cos(ang + 2.5) * 10, e.y + Math.sin(ang + 2.5) * 10);
    ctx.lineTo(e.x + Math.cos(ang - 2.5) * 10, e.y + Math.sin(ang - 2.5) * 10);
    ctx.fill();
    label(ctx, n, { x: e.x + Math.cos(ang) * 24, y: e.y + Math.sin(ang) * 24 }, AXIS_COL);
  });
  circle(ctx, o, 8, 'rgba(0,0,0,.35)', AXIS_COL, 3);
  line(ctx, { x: o.x - 5, y: o.y }, { x: o.x + 5, y: o.y }, AXIS_COL, 2);
  line(ctx, { x: o.x, y: o.y - 5 }, { x: o.x, y: o.y + 5 }, AXIS_COL, 2);
  if (step === 2) circle(ctx, xe, 7, '#fff', AXIS_COL, 3);
  ctx.restore();
}

function drawScale(ctx, view, S, step, alpha) {
  const sc = S.scale;
  if (!sc.p1 || !sc.p2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const a = toScreen(view, sc.p1), b = toScreen(view, sc.p2);
  line(ctx, a, b, 'rgba(0,0,0,.65)', 6);
  line(ctx, a, b, SCALE_COL, 3);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const nx = -Math.sin(ang) * 10, ny = Math.cos(ang) * 10;
  [a, b].forEach((p) => {
    line(ctx, { x: p.x - nx, y: p.y - ny }, { x: p.x + nx, y: p.y + ny }, SCALE_COL, 3);
    if (step === 2) circle(ctx, p, 9, 'rgba(250,204,21,.25)', SCALE_COL, 3);
  });
  label(ctx, `${+sc.length.toPrecision(4)} ${sc.unit}`,
    { x: (a.x + b.x) / 2 - nx * 2.2, y: (a.y + b.y) / 2 - ny * 2.2 }, SCALE_COL);
  ctx.restore();
}

const REF_LEN = 60;

/** Screen direction (unit vector) of an angle object's reference line. */
function refDirScreen(S, o) {
  const { xd, yd } = axisDirs(S.axes.a), r = refAngle(o);
  return { x: xd.x * Math.cos(r) + yd.x * Math.sin(r), y: xd.y * Math.cos(r) + yd.y * Math.sin(r) };
}

/** Arm from pivot v to point c, with the arc from the reference direction and a θ label. */
function drawArm(ctx, v, c, rd, theta, color, isPreview) {
  ctx.save();
  if (isPreview) ctx.globalAlpha *= 0.85;
  line(ctx, v, c, 'rgba(0,0,0,.6)', 5, isPreview ? [8, 5] : null);
  line(ctx, v, c, color, 2.5, isPreview ? [8, 5] : null);
  const a1 = Math.atan2(rd.y, rd.x), a2 = Math.atan2(c.y - v.y, c.x - v.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(v.x, v.y, 30, a1, a1 + d, d < 0); ctx.stroke();
  if (theta != null) {
    label(ctx, `θ = ${theta.toFixed(1)}°`, { x: v.x + Math.cos(a1 + d / 2) * 56, y: v.y + Math.sin(a1 + d / 2) * 56 }, '#fff', color);
  }
  ctx.restore();
}

function drawObject(ctx, view, S, o, frame, step, isActive, alpha, preview) {
  ctx.save();
  ctx.globalAlpha = alpha * (isActive ? 1 : 0.55);
  // an angle borrowing another object's points doesn't draw its own (unused) clicks
  const borrowed = sourceObj(S, o);
  const own = borrowed ? {} : o.pts;
  const fs = Object.keys(own).map(Number).sort((a, b) => a - b);
  // faint trail joining the points
  if (o.type === 'point' && fs.length > 1) {
    ctx.save();
    ctx.globalAlpha *= 0.6;
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    fs.forEach((f, i) => { const s = toScreen(view, o.pts[f]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.stroke();
    ctx.restore();
  }
  fs.forEach((f) => { if (f !== frame) circle(ctx, toScreen(view, o.pts[f]), isActive ? 3.5 : 3, o.color, 'rgba(0,0,0,.5)', 1); });

  if (o.type === 'angle' && o.vertex) {
    const v = toScreen(view, o.vertex);
    const rd = refDirScreen(S, o);
    const tip = { x: v.x + rd.x * REF_LEN, y: v.y + rd.y * REF_LEN };
    // reference ("0°") line; for "another angle" its end is a draggable handle
    line(ctx, v, tip, 'rgba(0,0,0,.5)', 3.5, [5, 4]);
    line(ctx, v, tip, 'rgba(255,255,255,.9)', 1.5, [5, 4]);
    if (isActive && o.ref === 'custom' && step === 3) circle(ctx, tip, 7, '#fff', o.color, 3);
    label(ctx, '0°', { x: tip.x + rd.x * 20, y: tip.y + rd.y * 20 }, '#fff', 'rgba(0,0,0,.55)');
    ctx.fillStyle = o.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.fillRect(v.x - 6, v.y - 6, 12, 12);
    ctx.strokeRect(v.x - 6, v.y - 6, 12, 12);

    const cur = trackedPts(S, o)[frame];
    if (cur) {
      const r = series(S, o), i = r.frame.indexOf(frame);
      drawArm(ctx, v, toScreen(view, cur), rd, i >= 0 ? r.theta[i] : null, o.color, false);
    } else if (isActive && preview && !borrowed) {
      // live preview from the pivot to the cursor, ready to place this frame's point
      drawArm(ctx, v, toScreen(view, preview), rd, armAngle(S, o, o.vertex, preview), o.color, true);
    }
  }

  const cur = own[frame];
  if (cur) {
    const c = toScreen(view, cur);
    circle(ctx, c, 10, null, 'rgba(0,0,0,.7)', 4);
    circle(ctx, c, 10, null, o.color, 2.5);
    line(ctx, { x: c.x - 15, y: c.y }, { x: c.x - 5, y: c.y }, o.color, 2);
    line(ctx, { x: c.x + 5, y: c.y }, { x: c.x + 15, y: c.y }, o.color, 2);
    line(ctx, { x: c.x, y: c.y - 15 }, { x: c.x, y: c.y - 5 }, o.color, 2);
    line(ctx, { x: c.x, y: c.y + 5 }, { x: c.x, y: c.y + 15 }, o.color, 2);
  }
  ctx.restore();
}

/** All overlays for the current step. */
export function drawOverlays(ctx, view, { S, frame, step, preview }) {
  drawAxes(ctx, view, S, step, step === 2 ? 1 : 0.4);
  drawScale(ctx, view, S, step, step === 2 ? 1 : 0.4);
  if (step === 3) S.objects.forEach((o) => { if (o.id !== S.active) drawObject(ctx, view, S, o, frame, step, false, 1, null); });
  const a = activeObj(S);
  if (a) drawObject(ctx, view, S, a, frame, step, step === 3, step === 3 ? 1 : 0.5, step === 3 ? preview : null);
}

/** A circular 3× magnifier next to the pointer, so pupils can click precisely. */
export function drawLoupe(ctx, view, data, vid, V, hover) {
  const touch = hover.type === 'touch' || hover.type === 'pen';
  const R = touch ? 70 : 62, Z = 3;
  const vp = toVideo(view, hover);
  if (!insideVideo(V, vp)) return;
  let cx = hover.x + (touch ? 0 : R + 24);
  let cy = hover.y - (R + (touch ? 50 : 24));
  if (cx + R + 4 > view.cw) cx = hover.x - R - 24;
  cx = clamp(cx, R + 4, view.cw - R - 4);
  if (cy - R < 4) cy = hover.y + R + (touch ? 50 : 24);
  cy = clamp(cy, R + 4, view.ch - R - 4);

  // source rectangle, clipped to the video (some browsers reject out-of-range sources)
  const srcR = R / (view.s * Z);
  let sx = vp.x - srcR, sy = vp.y - srcR, sw = 2 * srcR, sh = 2 * srcR;
  let dx = cx - R, dy = cy - R, dw = 2 * R, dh = 2 * R;
  const k = dw / sw;
  if (sx < 0) { dx -= sx * k; dw += sx * k; sw += sx; sx = 0; }
  if (sy < 0) { dy -= sy * k; dh += sy * k; sh += sy; sy = 0; }
  if (sx + sw > V.w) { const e = sx + sw - V.w; sw -= e; dw -= e * k; }
  if (sy + sh > V.h) { const e = sy + sh - V.h; sh -= e; dh -= e * k; }

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  if (sw > 0 && sh > 0) { try { ctx.drawImage(vid, sx, sy, sw, sh, dx, dy, dw, dh); } catch { /* not ready */ } }
  // draw the overlays magnified too
  const zoomed = { s: view.s * Z, ox: cx - vp.x * view.s * Z, oy: cy - vp.y * view.s * Z, cw: view.cw, ch: view.ch };
  drawOverlays(ctx, zoomed, data);
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.restore();
  circle(ctx, { x: cx, y: cy }, R, null, '#fff', 3);
}

/* ---------- interaction ---------- */

/** What (if anything) is under screen point p? Returns a drag descriptor or null. */
export function hitTest(view, { S, frame, step }, p, pointerType) {
  const tol = pointerType === 'mouse' ? 14 : 24;
  const near = (q, t = tol) => q && Math.hypot(toScreen(view, q).x - p.x, toScreen(view, q).y - p.y) <= t;
  if (step === 2) {
    const sc = S.scale, o = S.axes.o;
    if (near(sc.p1)) return { kind: 'p1' };
    if (near(sc.p2)) return { kind: 'p2' };
    if (o) {
      const { xd } = axisDirs(S.axes.a), so = toScreen(view, o);
      const tip = { x: so.x + xd.x * AXLEN, y: so.y + xd.y * AXLEN };
      if (Math.hypot(tip.x - p.x, tip.y - p.y) <= tol) return { kind: 'axis' };
      if (near(o)) return { kind: 'origin' };
    }
    if (sc.p1 && sc.p2) {
      const a = toScreen(view, sc.p1), b = toScreen(view, sc.p2);
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = L2 ? clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0, 1) : 0;
      if (Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y) <= tol * 0.7) {
        return { kind: 'body', start: toVideo(view, p), p1: { ...sc.p1 }, p2: { ...sc.p2 } };
      }
    }
  }
  if (step === 3) {
    const o = activeObj(S);
    if (!o) return null;
    if (!sourceObj(S, o) && near(o.pts[frame])) return { kind: 'pt', start: { ...p }, moved: false };
    if (o.type === 'angle' && near(o.vertex)) return { kind: 'vertex' };
    if (o.type === 'angle' && o.vertex && o.ref === 'custom') {
      const v = toScreen(view, o.vertex), rd = refDirScreen(S, o);
      if (Math.hypot(v.x + rd.x * REF_LEN - p.x, v.y + rd.y * REF_LEN - p.y) <= tol) return { kind: 'ref' };
    }
  }
  return null;
}

/** Returns a function that applies a drag to a (copied) state. */
export function dragMutation(drag, vpRaw, V, frame) {
  const vp = clampVideo(V, vpRaw);
  switch (drag.kind) {
    case 'p1': return (s) => { s.scale.p1 = vp; s.scale.confirmed = true; };
    case 'p2': return (s) => { s.scale.p2 = vp; s.scale.confirmed = true; };
    case 'body': {
      const dx = vp.x - drag.start.x, dy = vp.y - drag.start.y;
      return (s) => {
        s.scale.p1 = clampVideo(V, { x: drag.p1.x + dx, y: drag.p1.y + dy });
        s.scale.p2 = clampVideo(V, { x: drag.p2.x + dx, y: drag.p2.y + dy });
        s.scale.confirmed = true;
      };
    }
    case 'origin': return (s) => { s.axes.o = vp; };
    case 'axis': return (s) => {
      const o = s.axes.o;
      let a = Math.atan2(-(vpRaw.y - o.y), vpRaw.x - o.x);
      for (const snap of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) if (Math.abs(a - snap) < 0.05) a = snap;
      s.axes.a = a;
    };
    case 'pt': return (s) => { const o = objById(s, s.active); if (o) o.pts[frame] = vp; };
    case 'vertex': return (s) => { const o = objById(s, s.active); if (o) o.vertex = vp; };
    case 'ref': return (s) => {
      const o = objById(s, s.active);
      if (!o || !o.vertex) return;
      const a = toWorld(s, o.vertex), b = toWorld(s, vpRaw);
      if (a.X === b.X && a.Y === b.Y) return;
      // snap to whole degrees so the reference is a tidy number
      o.refA = Math.round(Math.atan2(b.Y - a.Y, b.X - a.X) * 180 / Math.PI) * Math.PI / 180;
    };
    default: return () => {};
  }
}
