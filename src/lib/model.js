// The project "state" (S) is plain JSON so it can be autosaved, undone and
// saved to a project file. Everything here is pure: functions take S and
// either read from it or mutate a copy the caller has made.
import { COLORS, UNITS, VARS, ADVANCE_OPTIONS } from './constants.js';
import { deriv, isNum } from './maths.js';
import { FIT_KEYS } from './fitting.js';

export const emptyVideo = { loaded: false, name: '', size: 0, w: 0, h: 0, duration: 0, frames: 1, url: null };

export function freshState() {
  return {
    v: 1,
    fileFps: 30,          // frame rate the file plays at (used to step through frames)
    fpsMeasured: false,
    captureFps: 30,       // frame rate the camera filmed at (used for time) — differs for slow-mo
    frame0: 0,            // frame where t = 0
    advance: 1,           // frames to move on after each click
    scale: { p1: null, p2: null, length: 1, unit: 'm', confirmed: false },
    axes: { o: null, a: 0 },
    objects: [],
    active: null,
    graphs: [],
    nextId: 1,
  };
}

let gid = 0;
export const newGraph = (obj, x, y) => ({ id: `g${Date.now().toString(36)}${gid++}`, obj, x, y, fit: 'none' });

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const objById = (S, id) => S.objects.find((o) => o.id === id) || null;
export const activeObj = (S) => objById(S, S.active);
export const varsFor = (o) => VARS[o && o.type === 'angle' ? 'angle' : 'point'];
export const varInfo = (o, k) => varsFor(o).find((v) => v[0] === k) || ['?', '?', ''];
export const timeOf = (S, f) => (f - S.frame0) / S.captureFps;
export const framesFor = (duration, fps) => Math.max(1, Math.round(duration * fps));
/** The object whose clicks an angle borrows for its moving end, or null. */
export const sourceObj = (S, o) => {
  if (!o || o.type !== 'angle' || o.source == null) return null;
  const src = objById(S, o.source);
  return src && src.type === 'point' ? src : null;
};
/** The points that define an object: its own clicks, or its source's for a borrowing angle. */
export const trackedPts = (S, o) => (sourceObj(S, o) || o).pts;
export const hasData = (S) => S.objects.some((o) => Object.keys(o.pts).length);
export const pointCount = (S) => S.objects.reduce((a, o) => a + Object.keys(o.pts).length, 0);

/** Validate anything loaded from storage or a project file into a safe state. */
export function adopt(o) {
  const f = freshState();
  if (!o || typeof o !== 'object') return f;
  const s = Object.assign(f, o);
  s.scale = Object.assign(freshState().scale, o.scale || {});
  s.axes = Object.assign({ o: null, a: 0 }, o.axes || {});
  if (!isNum(s.scale.length) || s.scale.length <= 0) s.scale.length = 1;
  if (!(s.scale.unit in UNITS)) s.scale.unit = 'm';
  if (!isNum(s.axes.a)) s.axes.a = 0;
  if (!isNum(s.fileFps) || s.fileFps <= 0) s.fileFps = 30;
  if (!isNum(s.captureFps) || s.captureFps <= 0) s.captureFps = s.fileFps;
  if (!isNum(s.frame0)) s.frame0 = 0;
  if (!ADVANCE_OPTIONS.includes(s.advance)) s.advance = 1;
  s.objects = Array.isArray(s.objects) ? s.objects.filter((x) => x && typeof x === 'object') : [];
  s.objects.forEach((ob) => {
    ob.type = ob.type === 'angle' ? 'angle' : 'point';
    ob.pts = ob.pts && typeof ob.pts === 'object' ? ob.pts : {};
    for (const k in ob.pts) {
      const p = ob.pts[k];
      if (!p || !isNum(p.x) || !isNum(p.y)) delete ob.pts[k];
    }
    ob.name = String(ob.name || 'Object').slice(0, 30);
    ob.ref = ['x', 'custom'].includes(ob.ref) ? ob.ref : 'down';
    if (!isNum(ob.refA)) ob.refA = DEFAULT_REF_ANGLE;
    if (!isNum(ob.source)) ob.source = null;
    if (!ob.color) ob.color = COLORS[0];
  });
  s.graphs = Array.isArray(s.graphs) ? s.graphs.filter((g) => g && typeof g === 'object') : [];
  s.graphs.forEach((g) => { if (!g.id) g.id = newGraph().id; });
  const maxId = s.objects.reduce((m, ob) => Math.max(m, +ob.id || 0), 0);
  if (!isNum(s.nextId) || s.nextId <= maxId) s.nextId = maxId + 1;
  return s;
}

/** Adds a tracked object (mutates S) and returns it. */
export function addObject(S, type) {
  const id = S.nextId++;
  const nPoint = S.objects.filter((o) => o.type === 'point').length;
  const nAngle = S.objects.filter((o) => o.type === 'angle').length;
  const name = type === 'angle'
    ? (nAngle ? `Angle ${nAngle + 1}` : 'Angle')
    : (nPoint ? `Object ${nPoint + 1}` : 'Ball');
  const o = { id, type, name, color: COLORS[(id - 1) % COLORS.length], pts: {}, vertex: null, ref: 'down', refA: DEFAULT_REF_ANGLE, source: null };
  S.objects.push(o);
  S.active = id;
  if (type === 'angle') S.graphs.push(newGraph(id, 't', 'theta'));
  return o;
}

/** Fill in anything missing once a video is loaded (mutates S). */
export function ensureDefaults(S, V) {
  if (!V.loaded) return S;
  const sc = S.scale;
  if (!sc.p1 || !sc.p2) {
    sc.p1 = { x: V.w * 0.35, y: V.h * 0.5 };
    sc.p2 = { x: V.w * 0.65, y: V.h * 0.5 };
  }
  if (!S.axes.o) S.axes.o = { x: V.w * 0.08, y: V.h * 0.92 };
  if (!S.objects.length) addObject(S, 'point');
  if (!objById(S, S.active)) S.active = S.objects[0].id;
  // an angle whose source object was deleted goes back to its own clicks
  S.objects.forEach((o) => { if (o.type === 'angle' && o.source != null && !sourceObj(S, o)) o.source = null; });
  if (!S.graphs.length) {
    const first = S.objects.find((o) => o.type === 'point') || S.objects[0];
    if (first.type === 'point') S.graphs.push(newGraph(first.id, 't', 'y'), newGraph(first.id, 't', 'vy'));
    else S.graphs.push(newGraph(first.id, 't', 'theta'));
  }
  S.graphs.forEach((g) => {
    if (!objById(S, g.obj)) g.obj = S.objects[0].id;
    const o = objById(S, g.obj);
    const keys = varsFor(o).map((v) => v[0]);
    if (!keys.includes(g.x)) g.x = 't';
    if (!keys.includes(g.y)) g.y = o.type === 'angle' ? 'theta' : 'y';
    if (!FIT_KEYS.includes(g.fit)) g.fit = 'none';
  });
  return S;
}

/* ---------- coordinates ---------- */

/** Video pixels -> axes coordinates (still in pixels), with y pointing up. */
export function toWorld(S, p) {
  const o = S.axes.o || { x: 0, y: 0 };
  const a = S.axes.a || 0;
  const dx = p.x - o.x, dy = -(p.y - o.y);
  return { X: dx * Math.cos(a) + dy * Math.sin(a), Y: -dx * Math.sin(a) + dy * Math.cos(a) };
}

export function metresPerPixel(S) {
  const sc = S.scale;
  if (!sc.p1 || !sc.p2) return 1;
  const d = Math.max(1e-6, Math.hypot(sc.p2.x - sc.p1.x, sc.p2.y - sc.p1.y));
  return (sc.length * (UNITS[sc.unit] || 1)) / d;
}

/* ---------- angles ---------- */

// Default direction of an "another angle" reference line: 45° above the x-axis.
export const DEFAULT_REF_ANGLE = Math.PI / 4;

/**
 * Direction the angle is measured from, as an angle in axes coordinates
 * (radians, anticlockwise from +x, y up).
 */
export function refAngle(o) {
  if (o.ref === 'x') return 0;
  if (o.ref === 'custom') return Number.isFinite(o.refA) ? o.refA : DEFAULT_REF_ANGLE;
  return -Math.PI / 2; // straight down
}

/**
 * Angle (degrees, anticlockwise positive, in (−180, 180]) of the arm from
 * `vertex` to `end`, measured from the object's reference direction.
 * Returns null if the two points coincide.
 */
export function armAngle(S, o, vertex, end) {
  const a = toWorld(S, vertex), b = toWorld(S, end);
  const dx = b.X - a.X, dy = b.Y - a.Y;
  if (!dx && !dy) return null;
  let th = (Math.atan2(dy, dx) - refAngle(o)) * 180 / Math.PI;
  while (th > 180) th -= 360;
  while (th <= -180) th += 360;
  return th;
}

/* ---------- derived data ---------- */

/** All the graphable quantities for one object, one entry per tracked frame. */
export function series(S, o) {
  const pts = trackedPts(S, o);
  const fs = Object.keys(pts).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const r = { frame: fs.slice(), t: [], t2: [] };
  fs.forEach((f) => { const t = timeOf(S, f); r.t.push(t); r.t2.push(t * t); });
  if (o.type === 'angle') {
    r.theta = [];
    let prev = null;
    fs.forEach((f) => {
      let th = null;
      if (o.vertex) th = armAngle(S, o, o.vertex, pts[f]);
      if (th != null) {
        // keep the angle continuous (e.g. for something spinning round)
        if (prev != null) {
          while (th - prev > 180) th -= 360;
          while (th - prev < -180) th += 360;
        }
        prev = th;
      }
      r.theta.push(th);
    });
    r.omega = deriv(r.t, r.theta);
    r.alpha = deriv(r.t, r.omega);
  } else {
    const k = metresPerPixel(S);
    r.x = []; r.y = [];
    fs.forEach((f) => { const w = toWorld(S, o.pts[f]); r.x.push(w.X * k); r.y.push(w.Y * k); });
    r.vx = deriv(r.t, r.x);
    r.vy = deriv(r.t, r.y);
    r.v = r.vx.map((vx, i) => (vx == null || r.vy[i] == null ? null : Math.hypot(vx, r.vy[i])));
    r.v2 = r.v.map((v) => (v == null ? null : v * v));
    r.ax = deriv(r.t, r.vx);
    r.ay = deriv(r.t, r.vy);
  }
  return r;
}
