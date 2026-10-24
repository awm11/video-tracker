// Lines of best fit. Straight line and quadratic are solved directly (in
// maths.js). Exponential, sine and damped sine are "nonlinear": a rate or a
// frequency can't be solved for directly. For those we use the standard trick
// of separating the problem: for any trial rate/frequency the remaining
// coefficients (amplitude, phase, offset) ARE a simple linear least-squares
// problem, so we only have to search over one or two numbers. We scan a wide
// range first (so a sine fit can't lock onto the wrong frequency), then refine.
import { fitData as polyFit } from './maths.js';

/** Dropdown options, in order: [value, label, minimum number of points]. */
export const FIT_KINDS = [
  ['none', 'none', 0],
  ['lin', 'straight line', 2],
  ['quad', 'curve (quadratic)', 3],
  ['exp', 'exponential', 4],
  ['sin', 'sinusoidal', 5],
  ['dsin', 'damped sinusoidal', 6],
];
export const FIT_KEYS = FIT_KINDS.map((k) => k[0]);
export const minPoints = (kind) => (FIT_KINDS.find((k) => k[0] === kind) || [0, 0, 2])[2];

export function fitData(kind, xs, ys) {
  try {
    if (kind === 'lin' || kind === 'quad') return polyFit(kind, xs, ys);
    if (xs.length < minPoints(kind)) return null;
    if (kind === 'exp') return fitExp(xs, ys);
    if (kind === 'sin') return fitSin(xs, ys);
    if (kind === 'dsin') return fitDampedSin(xs, ys);
  } catch (e) {
    console.error(e);
  }
  return null;
}

/* ---------- building blocks ---------- */

function rSquared(xs, ys, f) {
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let ssr = 0, sst = 0;
  xs.forEach((x, i) => { ssr += (ys[i] - f(x)) ** 2; sst += (ys[i] - my) ** 2; });
  return sst > 0 ? 1 - ssr / sst : 1;
}

/** Solve a small linear system by Gaussian elimination. Returns null if singular. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  const scale = Math.max(...A.flat().map(Math.abs)) || 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < scale * 1e-13) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/**
 * Least squares for y ≈ Σ c_j · b_j(x), where fill(x, out) writes the m
 * basis values into `out`; the last basis value must be the constant 1.
 * Returns { c, ssr } or null. Written without per-point allocations because
 * it runs thousands of times per fit.
 */
function linearFit(xs, ys, m, fill) {
  const n = xs.length;
  let my = 0;
  for (let i = 0; i < n; i++) my += ys[i];
  my /= n;                                   // centre y to avoid rounding loss
  const AtA = Array.from({ length: m }, () => new Float64Array(m));
  const Aty = new Float64Array(m);
  const b = new Float64Array(m);
  let yy = 0;
  for (let i = 0; i < n; i++) {
    fill(xs[i], b);
    const y = ys[i] - my;
    yy += y * y;
    for (let j = 0; j < m; j++) {
      if (!Number.isFinite(b[j])) return null;
      Aty[j] += b[j] * y;
      for (let k = j; k < m; k++) AtA[j][k] += b[j] * b[k];
    }
  }
  for (let j = 0; j < m; j++) for (let k = 0; k < j; k++) AtA[j][k] = AtA[k][j];
  const c = solve(AtA.map((r) => Array.from(r)), Array.from(Aty));
  if (!c || c.some((v) => !Number.isFinite(v))) return null;
  let fitted = 0;
  for (let j = 0; j < m; j++) fitted += c[j] * Aty[j];
  c[m - 1] += my;                            // undo the centring (constant term)
  return { c, ssr: Math.max(0, yy - fitted) };
}

/** Minimise f on [a, b] (golden-section search). */
function golden(f, a, b, iters = 70) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** Minimise f(p) for a 2-element p (Nelder–Mead simplex). */
function nelderMead(f, p0, steps, iters = 400) {
  let s = [p0, [p0[0] + steps[0], p0[1]], [p0[0], p0[1] + steps[1]]].map((p) => ({ p, v: f(p) }));
  const add = (a, b, k) => a.map((x, i) => x + k * (b[i] - x));
  for (let it = 0; it < iters; it++) {
    s.sort((a, b) => a.v - b.v);
    const [best, mid, worst] = s;
    const cen = best.p.map((x, i) => (x + mid.p[i]) / 2);
    const r = add(cen, worst.p, -1), fr = f(r);
    if (fr < best.v) {
      const e = add(cen, worst.p, -2), fe = f(e);
      s[2] = fe < fr ? { p: e, v: fe } : { p: r, v: fr };
    } else if (fr < mid.v) {
      s[2] = { p: r, v: fr };
    } else {
      const k = add(cen, worst.p, 0.5), fk = f(k);
      if (fk < worst.v) s[2] = { p: k, v: fk };
      else s = s.map((q, i) => (i === 0 ? q : { p: add(best.p, q.p, 0.5), v: f(add(best.p, q.p, 0.5)) }));
    }
    if (Math.abs(s[2].v - s[0].v) <= 1e-15 * (1 + Math.abs(s[0].v))) break;
  }
  s.sort((a, b) => a.v - b.v);
  return s[0].p;
}

/** Scan values of one parameter, then refine around the best with golden search. */
function scanThenRefine(sse, grid) {
  let bi = 0, bv = Infinity;
  grid.forEach((g, i) => { const v = sse(g); if (v < bv) { bv = v; bi = i; } });
  const lo = grid[Math.max(0, bi - 1)], hi = grid[Math.min(grid.length - 1, bi + 1)];
  return golden(sse, Math.min(lo, hi), Math.max(lo, hi));
}

const logGrid = (lo, hi, n) => Array.from({ length: n + 1 }, (_, i) => lo * Math.pow(hi / lo, i / n));
const wrapPhase = (p) => { let q = p % (2 * Math.PI); if (q > Math.PI) q -= 2 * Math.PI; if (q <= -Math.PI) q += 2 * Math.PI; return q; };

const spanCache = new WeakMap();
function spanInfo(xs) {
  if (!spanCache.has(xs)) spanCache.set(xs, computeSpan(xs));
  return spanCache.get(xs);
}
function computeSpan(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1]) gaps.push(s[i] - s[i - 1]);
  gaps.sort((a, b) => a - b);
  return { x0: s[0], span: s[s.length - 1] - s[0], dx: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0 };
}

/** Frequencies to try: from a quarter of a cycle across the data up to the sampling limit. */
function frequencyGrid(xs) {
  const { span, dx } = spanInfo(xs);
  if (!(span > 0) || !(dx > 0)) return null;
  const wMin = (0.5 * Math.PI) / span, wMax = Math.PI / dx;
  return wMax > wMin ? logGrid(wMin, wMax, 800) : null;
}

/* ---------- exponential: y = A·e^(kx) + C ---------- */
function fitExp(xs, ys) {
  const { x0, span } = spanInfo(xs);
  if (!(span > 0)) return null;
  const fit = (k) => linearFit(xs, ys, 2, (x, o) => { o[0] = Math.exp(k * (x - x0)); o[1] = 1; });
  const sse = (k) => { const r = fit(k); return r ? r.ssr : Infinity; };
  // try growth and decay, rates from very slow (≈ straight line) to very fast
  const mags = logGrid(0.02 / span, 60 / span, 120);
  const candidates = [-1, 1].map((sgn) => {
    const k = scanThenRefine(sse, mags.map((m) => sgn * m));
    return { k, v: sse(k) };
  });
  const { k } = candidates.sort((a, b) => a.v - b.v)[0];
  const r = fit(k);
  if (!r) return null;
  const A = r.c[0] * Math.exp(-k * x0), C = r.c[1];
  if (!Number.isFinite(A)) return null;
  const f = (x) => A * Math.exp(k * x) + C;
  return { kind: 'exp', A, k, C, f, r2: rSquared(xs, ys, f) };
}

/* ---------- sinusoidal: y = A·sin(ωx + φ) + C ---------- */
function sinCoefs(xs, ys, w) {
  const { x0 } = spanInfo(xs);
  const r = linearFit(xs, ys, 3, (x, o) => { const u = w * (x - x0); o[0] = Math.sin(u); o[1] = Math.cos(u); o[2] = 1; });
  if (!r) return null;
  const [a, b, C] = r.c;
  // a·sin(u) + b·cos(u) = A·sin(u + φ'), with u = ω(x − x0)
  return { A: Math.hypot(a, b), phi: wrapPhase(Math.atan2(b, a) - w * x0), C, ssr: r.ssr };
}
function bestFrequency(xs, ys) {
  const grid = frequencyGrid(xs);
  if (!grid) return null;
  return scanThenRefine((w) => sinCoefs(xs, ys, w)?.ssr ?? Infinity, grid);
}
function fitSin(xs, ys) {
  const w = bestFrequency(xs, ys);
  if (w == null) return null;
  const c = sinCoefs(xs, ys, w);
  if (!c) return null;
  const { A, phi, C } = c;
  const f = (x) => A * Math.sin(w * x + phi) + C;
  return { kind: 'sin', A, w, phi, C, f, r2: rSquared(xs, ys, f) };
}

/* ---------- damped sinusoidal: y = A·e^(−γx)·sin(ωx + φ) + C ---------- */
function dampedCoefs(xs, ys, g, w) {
  const { x0 } = spanInfo(xs);
  const r = linearFit(xs, ys, 3, (x, o) => {
    const e = Math.exp(-g * (x - x0)), u = w * (x - x0);
    o[0] = e * Math.sin(u); o[1] = e * Math.cos(u); o[2] = 1;
  });
  if (!r) return null;
  const [a, b, C] = r.c;
  return { A: Math.hypot(a, b) * Math.exp(g * x0), phi: wrapPhase(Math.atan2(b, a) - w * x0), C, ssr: r.ssr };
}
function fitDampedSin(xs, ys) {
  const { span } = spanInfo(xs);
  const grid = frequencyGrid(xs);
  if (!grid) return null;
  const sse = ([g, w]) => (w > 0 ? dampedCoefs(xs, ys, g, w)?.ssr ?? Infinity : Infinity);
  // start from the best undamped frequency, then scan damping rates
  const w0 = bestFrequency(xs, ys);
  const gammas = [0, ...logGrid(0.02 / span, 20 / span, 60)];
  let start = [0, w0], bv = Infinity;
  // also try a few nearby frequencies, since damping can shift the best match
  for (const wf of [0.85, 0.93, 1, 1.07, 1.15]) {
    for (const g of gammas) {
      const v = sse([g, w0 * wf]);
      if (v < bv) { bv = v; start = [g, w0 * wf]; }
    }
  }
  const [g, w] = nelderMead(sse, start, [Math.max(0.5 / span, start[0] * 0.2), w0 * 0.03]);
  const c = dampedCoefs(xs, ys, g, w);
  if (!c || !Number.isFinite(c.A)) return null;
  const { A, phi, C } = c;
  const f = (x) => A * Math.exp(-g * x) * Math.sin(w * x + phi) + C;
  return { kind: 'dsin', A, g, w, phi, C, f, r2: rSquared(xs, ys, f) };
}
