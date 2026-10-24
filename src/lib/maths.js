export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Format a number to `sig` significant figures, switching to standard form when tiny/huge. */
export function fmt(v, sig = 3) {
  if (!isNum(v)) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(sig - 1).replace('-', '−');
  return String(Number(v.toPrecision(sig))).replace('-', '−');
}
export const signed = (v) => (v < 0 ? ' − ' : ' + ') + fmt(Math.abs(v));

/**
 * Central-difference derivative dy/dt. Ends (and points next to big gaps in
 * the tracking) are left as null rather than guessed.
 */
export function deriv(t, y) {
  const n = t.length;
  const out = new Array(n).fill(null);
  const gaps = [];
  for (let i = 1; i < n; i++) gaps.push(t[i] - t[i - 1]);
  const sorted = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  for (let i = 1; i < n - 1; i++) {
    const a = y[i - 1], b = y[i + 1], dt = t[i + 1] - t[i - 1];
    if (a == null || b == null || !(dt > 0)) continue;
    if (med > 0 && dt > 4.5 * med) continue;
    out[i] = (b - a) / dt;
  }
  return out;
}

function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

function rSquared(xs, ys, f) {
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let ssr = 0, sst = 0;
  xs.forEach((x, i) => { ssr += (ys[i] - f(x)) ** 2; sst += (ys[i] - my) ** 2; });
  return sst > 0 ? 1 - ssr / sst : 1;
}

/** Least-squares fit. kind: 'lin' (y = mx + c) or 'quad' (y = ax² + bx + c). */
export function fitData(kind, xs, ys) {
  const n = xs.length;
  if (kind === 'lin') {
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-14) return null;
    const m = (n * sxy - sx * sy) / d, c = (sy - m * sx) / n;
    const f = (x) => m * x + c;
    return tidy({ kind, m, c, f, r2: rSquared(xs, ys, f) }, ['m', 'c']);
  }
  if (kind === 'quad') {
    if (n < 3) return null;
    const s = [0, 0, 0, 0, 0], t = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      let p = 1;
      for (let k = 0; k < 5; k++) { s[k] += p; if (k < 3) t[k] += p * ys[i]; p *= xs[i]; }
    }
    const sol = solve3([[s[4], s[3], s[2]], [s[3], s[2], s[1]], [s[2], s[1], s[0]]], [t[2], t[1], t[0]]);
    if (!sol) return null;
    const [a, b, c] = sol;
    const f = (x) => a * x * x + b * x + c;
    return tidy({ kind, a, b, c, f, r2: rSquared(xs, ys, f) }, ['a', 'b', 'c']);
  }
  return null;
}
// Coefficients that are only rounding noise are shown as 0.
function tidy(fit, keys) {
  const big = Math.max(...keys.map((k) => Math.abs(fit[k])));
  keys.forEach((k) => { if (Math.abs(fit[k]) < big * 1e-5) fit[k] = 0; });
  return fit;
}

/** "Nice" tick values for an axis running from min to max. */
export function niceTicks(min, max, count) {
  const span = max - min || 1;
  let st = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / st;
  if (err >= 7.5) st *= 10; else if (err >= 3.5) st *= 5; else if (err >= 1.5) st *= 2;
  const ticks = [];
  for (let v = Math.ceil(min / st) * st; v <= max + st * 1e-9; v += st) ticks.push(+v.toFixed(12));
  return { ticks, dec: Math.max(0, -Math.floor(Math.log10(st) + 1e-9)) };
}

/** Unit of a gradient: unit(y) / unit(x), simplified for the common cases. */
export function unitRatio(uy, ux) {
  if (!ux) return uy;
  const special = {
    'm|s': 'm/s', 'm/s|s': 'm/s²', 'm|s²': 'm/s²', '°|s': '°/s', '°/s|s': '°/s²', 'm²/s²|m': 'm/s²', 's|s': '',
  };
  const k = `${uy}|${ux}`;
  if (k in special) return special[k];
  if (!uy) return `1/${ux}`;
  return `${uy}/${ux.includes('/') ? `(${ux})` : ux}`;
}
