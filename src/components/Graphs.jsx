// The graph column: one card per graph, each with its own axis choices and
// optional line of best fit.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SYM } from '../lib/constants.js';
import { fmt, isNum, signed, unitRatio } from '../lib/maths.js';
import { FIT_KINDS, fitData, minPoints } from '../lib/fitting.js';
import { objById, series, varInfo, varsFor } from '../lib/model.js';
import { drawGraph } from '../lib/graphDraw.js';

const SPEEDS = ['vx', 'vy', 'v', 'v2', 'omega'];
const ACCELS = ['ax', 'ay', 'alpha'];

export default function GraphPanel({ V, S, frame, onJump, onGraphChange, onGraphRemove, onAddGraph }) {
  // series for every object, recomputed only when the data change
  const seriesById = useMemo(() => new Map(S.objects.map((o) => [o.id, series(S, o)])), [S]);
  if (!V.loaded) {
    return (
      <aside className="graphs" id="graphPane">
        <div className="placeholder">Graphs will appear here as you track.</div>
      </aside>
    );
  }
  return (
    <aside className="graphs" id="graphPane">
      {S.graphs.map((g) => {
        const o = objById(S, g.obj) || S.objects[0];
        if (!o) return null;
        return (
          <GraphCard
            key={g.id}
            g={g}
            o={o}
            r={seriesById.get(o.id)}
            S={S}
            frame={frame}
            onJump={onJump}
            onChange={(patch) => onGraphChange(g.id, patch)}
            onRemove={() => onGraphRemove(g.id)}
          />
        );
      })}
      <button className="btn" id="addGraph" onClick={onAddGraph}>＋ Add another graph</button>
    </aside>
  );
}

function GraphCard({ g, o, r, S, frame, onJump, onChange, onRemove }) {
  const cvRef = useRef(null);
  const hits = useRef([]);
  const [width, setWidth] = useState(0);
  const [, xLabel, xUnit] = varInfo(o, g.x);
  const [, yLabel, yUnit] = varInfo(o, g.y);

  const pts = useMemo(() => {
    const X = r?.[g.x] || [], Y = r?.[g.y] || [], out = [];
    if (!r) return out;
    for (let i = 0; i < r.frame.length; i++) if (isNum(X[i]) && isNum(Y[i])) out.push({ x: X[i], y: Y[i], f: r.frame[i] });
    return out;
  }, [r, g.x, g.y]);

  // Straight lines and quadratics are instant. The curved fits take a few
  // milliseconds each, so they wait until the data stop changing (e.g. the
  // end of a drag) instead of refitting on every mouse movement.
  const [fit, setFit] = useState(null);
  const [fitting, setFitting] = useState(false);
  useEffect(() => {
    const run = () => { setFit(g.fit === 'none' ? null : fitData(g.fit, pts.map((p) => p.x), pts.map((p) => p.y))); setFitting(false); };
    if (g.fit === 'none' || g.fit === 'lin' || g.fit === 'quad') { run(); return undefined; }
    setFitting(true);
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
  }, [g.fit, pts]);

  const emptyMsg = !r || r.frame.length === 0 ? 'Click on the video to add points'
    : [g.x, g.y].some((k) => SPEEDS.includes(k)) ? 'Speeds need at least 3 points in a row'
      : [g.x, g.y].some((k) => ACCELS.includes(k)) ? 'Accelerations need at least 5 points in a row'
        : 'Not enough points yet';

  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(cvRef.current?.clientWidth || 0));
    ro.observe(cvRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      hits.current = drawGraph(cvRef.current, {
        pts, fit: fit && fit.kind === g.fit ? fit : null, color: o.color, frame, emptyMsg,
        xTitle: `${xLabel}${xUnit ? ` (${xUnit})` : ''}`,
        yTitle: `${yLabel}${yUnit ? ` (${yUnit})` : ''}`,
      });
    } catch (e) { console.error(e); }
  }, [pts, fit, g.fit, o.color, frame, emptyMsg, xLabel, xUnit, yLabel, yUnit, width]);

  const nearest = (e) => {
    const rect = cvRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = null, bd = 14;
    hits.current.forEach((h) => { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } });
    return best;
  };

  let warn = null;
  if (o.type === 'point' && !S.scale.confirmed) warn = 'Scale not set: distances are not yet correct. Go to step 2.';
  else if (o.type === 'angle' && !o.vertex) warn = 'Click the pivot point on the video first.';

  const options = varsFor(o).map(([k, label, u]) => <option key={k} value={k}>{label}{u ? ` (${u})` : ''}</option>);

  return (
    <div className="gcard">
      <div className="ghead">
        {S.objects.length > 1 && (
          <select className="gobj" aria-label="Object" value={o.id} onChange={(e) => onChange({ obj: +e.target.value })}>
            {S.objects.map((ob) => <option key={ob.id} value={ob.id}>{ob.name}</option>)}
          </select>
        )}
        <select className="gy" aria-label="Vertical axis" value={g.y} onChange={(e) => onChange({ y: e.target.value })}>{options}</select>
        <span>against</span>
        <select className="gx" aria-label="Horizontal axis" value={g.x} onChange={(e) => onChange({ x: e.target.value })}>{options}</select>
        <button className="x" title="Remove this graph" aria-label="Remove graph" onClick={onRemove}>✕</button>
      </div>
      <canvas
        ref={cvRef}
        onClick={(e) => { const h = nearest(e); if (h) onJump(h.f); }}
        onMouseMove={(e) => { e.currentTarget.style.cursor = nearest(e) ? 'pointer' : 'default'; }}
      />
      <div className="gfoot">
        <label>
          Best fit:{' '}
          <select className="gfit" value={g.fit} onChange={(e) => onChange({ fit: e.target.value })}>
            {FIT_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <span className="geq">
          {g.fit !== 'none' && (
            pts.length < minPoints(g.fit) ? `(needs at least ${minPoints(g.fit)} points)`
              : fit && fit.kind === g.fit ? <FitText g={g} fit={fit} xUnit={xUnit} yUnit={yUnit} />
                : fitting ? 'fitting…' : '(couldn’t fit this shape to these points)'
          )}
        </span>
      </div>
      {warn && <div className="gwarn">{warn}</div>}
    </div>
  );
}

/** The fitted equation plus a plain-English physics hint where one makes sense. */
function FitText({ g, fit, xUnit, yUnit }) {
  const ys = SYM[g.y], xs = SYM[g.x];
  let eq, hint = null;
  if (fit.kind === 'lin') {
    const gu = unitRatio(yUnit, xUnit);
    eq = `${ys} = ${fmt(fit.m)} ${xs}${signed(fit.c)}  ·  gradient = ${fmt(fit.m)}${gu ? ` ${gu}` : ''}`;
    if (g.x === 't' && ['x', 'y'].includes(g.y)) hint = `→ velocity ≈ ${fmt(fit.m)} m/s`;
    if (g.x === 't' && ['vx', 'vy'].includes(g.y)) hint = `average acceleration ≈ ${fmt(fit.m)} m/s²`;
    if (g.x === 't2' && ['x', 'y'].includes(g.y)) hint = `→ if it started from rest, acceleration ≈ 2 × gradient = ${fmt(2 * fit.m)} m/s²`;
    if (g.x === 't' && g.y === 'theta') hint = `→ angular velocity ≈ ${fmt(fit.m)} °/s`;
  } else if (fit.kind === 'quad') {
    eq = `${ys} = ${fmt(fit.a)} ${xs}²${signed(fit.b)} ${xs}${signed(fit.c)}`;
    if (g.x === 't' && ['x', 'y'].includes(g.y)) hint = `average acceleration ≈ 2 × ${fmt(fit.a)} = ${fmt(2 * fit.a)} m/s²`;
  } else if (fit.kind === 'exp') {
    eq = `${ys} = ${fmt(fit.A)} e^(${fmt(fit.k)} ${xs})${signed(fit.C)}`;
    const per = xUnit || 'units';
    if (fit.k < 0) hint = `→ time constant = 1/${fmt(-fit.k)} = ${fmt(-1 / fit.k)} ${per}, half-life = ${fmt(Math.LN2 / -fit.k)} ${per}`
      + `${Math.abs(fit.C) > 1e-9 ? `; levels off at ${fmt(fit.C)}${yUnit ? ` ${yUnit}` : ''}` : ''}`;
    else if (fit.k > 0) hint = `→ doubles every ln2/${fmt(fit.k)} = ${fmt(Math.LN2 / fit.k)} ${per}`;
  } else if (fit.kind === 'sin' || fit.kind === 'dsin') {
    const damp = fit.kind === 'dsin' ? ` e^(${fmt(-fit.g)} ${xs})` : '';
    eq = `${ys} = ${fmt(fit.A)}${damp} sin(${fmt(fit.w)} ${xs}${signed(fit.phi)})${signed(fit.C)}`;
    const T = (2 * Math.PI) / fit.w;
    if (g.x === 't') {
      hint = `→ period T = 2π/${fmt(fit.w)} = ${fmt(T)} s, frequency = ${fmt(1 / T)} Hz`;
      if (fit.kind === 'dsin' && fit.g > 0) hint += `; amplitude halves every ${fmt(Math.LN2 / fit.g)} s`;
    } else {
      hint = `→ repeats every ${fmt(T)}${xUnit ? ` ${xUnit}` : ''}`;
    }
  }
  return (
    <>
      {eq}  ·  R² = {fit.r2.toFixed(4)}
      {(fit.kind === 'sin' || fit.kind === 'dsin') && <span className="muted"> (angle inside sin in radians)</span>}
      {hint && <><br /><span className="hint">{hint}</span></>}
    </>
  );
}
