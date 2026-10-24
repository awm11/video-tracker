import { SYM } from './constants.js';
import { isNum } from './maths.js';
import { series, timeOf, trackedPts, varInfo } from './model.js';

/** One row per tracked frame, one column per quantity per object. */
export function buildTable(S) {
  const cols = [];
  const header = ['frame', 't (s)'];
  S.objects.forEach((o) => {
    const r = series(S, o);
    const keys = o.type === 'angle' ? ['theta', 'omega', 'alpha'] : ['x', 'y', 'vx', 'vy', 'v', 'ax', 'ay'];
    keys.forEach((k) => {
      const u = varInfo(o, k)[2].replace('°', 'deg');
      header.push(`${o.name} ${SYM[k]} (${u})`);
      cols.push({ r, k });
    });
  });
  const frames = [...new Set(S.objects.flatMap((o) => Object.keys(trackedPts(S, o)).map(Number)))].sort((a, b) => a - b);
  const rows = frames.map((f) => {
    const row = [f + 1, +timeOf(S, f).toFixed(6)];
    cols.forEach(({ r, k }) => {
      const i = r.frame.indexOf(f);
      const v = i >= 0 ? r[k][i] : null;
      row.push(isNum(v) ? +v.toPrecision(6) : '');
    });
    return row;
  });
  return { header, rows };
}

export function toCSV({ header, rows }) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  // The BOM makes Excel read the ² and ° symbols correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}

export const toTSV = ({ header, rows }) => [header, ...rows].map((r) => r.join('\t')).join('\n');

export function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
}
