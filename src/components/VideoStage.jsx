// The video picture with everything drawn on top of it, and all the mouse /
// touch handling for placing and dragging marks. Drawing is done directly on
// a canvas (not through React) so it stays smooth while dragging.
import { useCallback, useEffect, useRef } from 'react';
import {
  clampVideo, dragMutation, drawLoupe, drawOverlays, hitTest, insideVideo, toVideo,
} from '../lib/draw.js';
import { activeObj } from '../lib/model.js';

export default function VideoStage({
  vidRef, V, S, frame, step, playing, tick, busy, dragOver,
  onChooseVideo, onPlace, onDragStart, onDragApply, onStopPlay, toast,
}) {
  const wrapRef = useRef(null);
  const cvRef = useRef(null);
  const view = useRef({ s: 1, ox: 0, oy: 0, cw: 0, ch: 0 });
  const hover = useRef(null);
  const drag = useRef(null);
  const pressing = useRef(false);
  const latest = useRef(null);
  latest.current = { V, S, frame, step, playing };

  const draw = useCallback(() => {
    const cv = cvRef.current, wrap = wrapRef.current, vid = vidRef.current;
    if (!cv || !wrap) return;
    const { V, S, frame, step, playing } = latest.current;
    const cw = wrap.clientWidth, ch = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!V.loaded) return;
    const s = Math.min(cw / V.w, ch / V.h);
    view.current = { s, ox: (cw - V.w * s) / 2, oy: (ch - V.h * s) / 2, cw, ch };
    try { ctx.drawImage(vid, view.current.ox, view.current.oy, V.w * s, V.h * s); } catch { /* frame not ready */ }
    const data = { S, frame, step, preview: previewPoint(view.current, { V, S, frame, step, playing }) };
    drawOverlays(ctx, view.current, data);
    const h = hover.current;
    if (h && step >= 2 && !playing && (step === 3 || drag.current)) drawLoupe(ctx, view.current, data, vid, V, h);
  }, [vidRef]);

  /**
   * Where the angle preview arm should point (video coords), or null. Shown
   * once the pivot is placed, on frames with no point yet, only while the
   * cursor is over the video picture and not over something draggable.
   */
  function previewPoint(v, L) {
    const h = hover.current;
    if (!h || drag.current || L.playing || L.step !== 3) return null;
    const o = activeObj(L.S);
    if (!o || o.type !== 'angle' || !o.vertex || o.source != null || o.pts[L.frame]) return null;
    const vp = toVideo(v, h);
    if (!insideVideo(L.V, vp)) return null;
    if (hitTest(v, L, h, h.type)) return null;
    return vp;
  }

  const queued = useRef(false);
  const schedule = useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    requestAnimationFrame(() => {
      queued.current = false;
      try { draw(); } catch (e) { console.error(e); }
    });
  }, [draw]);

  useEffect(() => { schedule(); }, [V, S, frame, step, playing, tick, schedule]);
  useEffect(() => {
    const ro = new ResizeObserver(schedule);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [schedule]);
  useEffect(() => {
    // used by the automated tests to find where things are on screen
    window.__vtView = view;
  }, []);

  const pt = (e) => {
    const r = cvRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const setCursor = (p, type) => {
    const cv = cvRef.current;
    const L = latest.current;
    if (!L.V.loaded) { cv.style.cursor = 'default'; return; }
    if (drag.current) { cv.style.cursor = 'grabbing'; return; }
    cv.style.cursor = hitTest(view.current, L, p, type || 'mouse') ? 'grab' : (L.step === 3 ? 'crosshair' : 'default');
  };

  const onPointerDown = (e) => {
    const L = latest.current;
    if (!L.V.loaded || (e.button !== undefined && e.button > 0)) return;
    e.preventDefault();
    if (L.playing) onStopPlay();
    const p = pt(e);
    hover.current = { ...p, type: e.pointerType };
    try { cvRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const hit = hitTest(view.current, L, p, e.pointerType);
    if (hit) { onDragStart(); drag.current = hit; }
    else if (L.step === 3) pressing.current = true;
    else if (L.step === 1) toast('Press “Next” to set the scale first.');
    schedule();
  };

  const onPointerMove = (e) => {
    const L = latest.current;
    if (!L.V.loaded) return;
    const p = pt(e);
    hover.current = { ...p, type: e.pointerType };
    const d = drag.current;
    if (d) {
      if (d.kind === 'pt' && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 3) d.moved = true;
      onDragApply(dragMutation(d, toVideo(view.current, p), L.V, L.frame));
    }
    setCursor(p, e.pointerType);
    schedule();
  };

  const onPointerUp = (e) => {
    const L = latest.current;
    if (!L.V.loaded) return;
    const p = pt(e);
    const vp = toVideo(view.current, p);
    const d = drag.current;
    drag.current = null;
    if (d) {
      // a click (no movement) on an existing mark means "put it here and move on"
      if (d.kind === 'pt' && !d.moved) onPlace(clampVideo(L.V, vp), true);
    } else if (pressing.current) {
      if (insideVideo(L.V, vp)) onPlace(vp, false);
      else toast('Click on the video picture itself.');
    }
    pressing.current = false;
    if (e.pointerType !== 'mouse') hover.current = null;
    schedule();
  };

  const onPointerCancel = () => { drag.current = null; pressing.current = false; hover.current = null; schedule(); };
  const onPointerLeave = (e) => {
    if (!drag.current && e.pointerType === 'mouse') { hover.current = null; schedule(); }
  };

  return (
    <div id="canvasWrap" ref={wrapRef}>
      <canvas
        id="view"
        ref={cvRef}
        aria-label="Video frame. Click to mark the object."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!V.loaded && (
        <div className={`drop${dragOver ? ' dragging' : ''}`}>
          <div><b>Drop a video here</b> or</div>
          <button className="btn primary big" onClick={onChooseVideo}>Choose a video</button>
          <div className="hint">Your video stays on this device. Nothing is uploaded.</div>
        </div>
      )}
      {busy && <div className="busy">{busy}</div>}
    </div>
  );
}
