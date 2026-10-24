// Draws one graph onto a canvas. Returns the screen positions of the points
// so clicks on the graph can jump to that frame.
import { niceTicks } from './maths.js';

const FONT = '"Atkinson Hyperlegible", system-ui, sans-serif';

export function drawGraph(canvas, { pts, fit, color, xTitle, yTitle, frame, emptyMsg }) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return [];
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  if (!pts.length) {
    g.fillStyle = '#5d6678';
    g.font = `15px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emptyMsg, W / 2, H / 2);
    return [];
  }

  const L = 58, Rm = 14, T = 12, B = 42, pw = W - L - Rm, ph = H - T - B;
  let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  let y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  if (x1 - x0 < 1e-12) { const d = Math.abs(x0) * 0.1 || 1; x0 -= d; x1 += d; }
  if (y1 - y0 < 1e-12) { const d = Math.abs(y0) * 0.1 || 1; y0 -= d; y1 += d; }
  const px = (x1 - x0) * 0.06, py = (y1 - y0) * 0.08;
  x0 -= px; x1 += px; y0 -= py; y1 += py;
  const sx = (v) => L + ((v - x0) / (x1 - x0)) * pw;
  const sy = (v) => T + ph - ((v - y0) / (y1 - y0)) * ph;

  // grid and tick labels
  const xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 70)));
  const yt = niceTicks(y0, y1, Math.max(3, Math.floor(ph / 40)));
  g.font = `13px ${FONT}`;
  g.fillStyle = '#5d6678';
  g.strokeStyle = '#eceff4';
  g.lineWidth = 1;
  g.textAlign = 'center'; g.textBaseline = 'top';
  xt.ticks.forEach((v) => {
    const X = Math.round(sx(v)) + 0.5;
    g.beginPath(); g.moveTo(X, T); g.lineTo(X, T + ph); g.stroke();
    g.fillText(v.toFixed(xt.dec), X, T + ph + 4);
  });
  g.textAlign = 'right'; g.textBaseline = 'middle';
  yt.ticks.forEach((v) => {
    const Y = Math.round(sy(v)) + 0.5;
    g.beginPath(); g.moveTo(L, Y); g.lineTo(L + pw, Y); g.stroke();
    g.fillText(v.toFixed(yt.dec), L - 5, Y);
  });
  // zero lines
  g.strokeStyle = '#9aa3b2';
  if (x0 < 0 && x1 > 0) { const X = Math.round(sx(0)) + 0.5; g.beginPath(); g.moveTo(X, T); g.lineTo(X, T + ph); g.stroke(); }
  if (y0 < 0 && y1 > 0) { const Y = Math.round(sy(0)) + 0.5; g.beginPath(); g.moveTo(L, Y); g.lineTo(L + pw, Y); g.stroke(); }
  g.strokeStyle = '#c3c9d4';
  g.strokeRect(L + 0.5, T + 0.5, pw, ph);

  // axis titles
  g.fillStyle = '#1c2230';
  g.font = `700 13px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(xTitle, L + pw / 2, H - 2);
  g.save();
  g.translate(13, T + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle';
  g.fillText(yTitle, 0, 0);
  g.restore();

  g.save();
  g.beginPath(); g.rect(L, T, pw, ph); g.clip();
  if (fit) {
    g.strokeStyle = '#1c2230'; g.lineWidth = 1.8; g.setLineDash([6, 4]);
    g.beginPath();
    // plenty of samples so fast oscillations draw smoothly; skip off-scale values
    const N = Math.max(200, Math.round(pw * 1.5));
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const xv = x0 + ((x1 - x0) * i) / N, yv = fit.f(xv);
      if (!Number.isFinite(yv) || Math.abs(sy(yv)) > 1e5) { pen = false; continue; }
      if (pen) g.lineTo(sx(xv), sy(yv)); else { g.moveTo(sx(xv), sy(yv)); pen = true; }
    }
    g.stroke(); g.setLineDash([]);
  }
  const hits = [];
  pts.forEach((p) => {
    const X = sx(p.x), Y = sy(p.y);
    g.beginPath(); g.arc(X, Y, 3.6, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    hits.push({ x: X, y: Y, f: p.f });
  });
  const cur = pts.find((p) => p.f === frame);
  if (cur) {
    g.beginPath(); g.arc(sx(cur.x), sy(cur.y), 7.5, 0, Math.PI * 2);
    g.strokeStyle = '#1c2230'; g.lineWidth = 2; g.stroke();
  }
  g.restore();
  return hits;
}
