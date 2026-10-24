// Low-level video helpers: opening a file, measuring its frame rate and
// seeking to exact frames without piling up seeks.
import { COMMON_FPS } from './constants.js';

/** Resolves true if the browser can decode the video's picture, false otherwise. */
export function openVideo(vid, url) {
  return new Promise((res) => {
    let done = false;
    const fin = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(tm);
      vid.removeEventListener('loadedmetadata', onMeta);
      vid.removeEventListener('error', onErr);
      res(ok);
    };
    // A video the browser can't decode often still loads with width 0 (audio only).
    const onMeta = () => fin(!!(vid.videoWidth && vid.videoHeight));
    const onErr = () => fin(false);
    const tm = setTimeout(() => fin(false), 20000);
    vid.addEventListener('loadedmetadata', onMeta);
    vid.addEventListener('error', onErr);
    vid.src = url;
    vid.load();
  });
}

/** Some files (e.g. recorder webm) report an Infinite duration until you seek to the end. */
export function fixDuration(vid) {
  return new Promise((res) => {
    if (Number.isFinite(vid.duration) && vid.duration > 0) { res(); return; }
    const done = () => { vid.removeEventListener('durationchange', h); clearTimeout(tm); res(); };
    const h = () => { if (Number.isFinite(vid.duration)) done(); };
    const tm = setTimeout(done, 4000);
    vid.addEventListener('durationchange', h);
    try { vid.currentTime = 1e7; } catch { done(); }
  });
}

/** Plays the start of the video briefly and measures frame spacing. Returns fps or null. */
export function measureFps(vid) {
  return new Promise((res) => {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
      // Still play briefly so mobile browsers decode a first frame.
      vid.play().then(() => setTimeout(() => { vid.pause(); res(null); }, 150)).catch(() => res(null));
      return;
    }
    const times = [];
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      clearTimeout(tm);
      try { vid.pause(); } catch { /* ignore */ }
      const d = [];
      for (let i = 1; i < times.length; i++) {
        const x = times[i] - times[i - 1];
        if (x > 0.0008) d.push(x);
      }
      if (d.length < 4) { res(null); return; }
      d.sort((a, b) => a - b);
      const fps = 1 / d[Math.floor(d.length * 0.25)];
      const near = COMMON_FPS.reduce((b, c) => (Math.abs(c - fps) < Math.abs(b - fps) ? c : b));
      res(Math.abs(near - fps) / near < 0.04 ? near : Math.round(fps));
    };
    const cb = (now, meta) => {
      if (done) return;
      times.push(meta.mediaTime);
      if (times.length >= 30) fin(); else vid.requestVideoFrameCallback(cb);
    };
    vid.requestVideoFrameCallback(cb);
    vid.currentTime = 0;
    vid.playbackRate = 1;
    vid.play().catch(() => fin());
    const tm = setTimeout(fin, 3000);
  });
}

/**
 * Seeks to frames one at a time. If a new frame is requested while a seek is
 * in progress, only the latest request is honoured — so dragging the slider
 * quickly never queues up hundreds of seeks.
 */
export function createSeeker(vid, timeForFrame, onPainted) {
  let pending = false, want = null, guard = null;
  const doSeek = () => {
    const f = want;
    want = null;
    if (f == null) return;
    pending = true;
    clearTimeout(guard);
    guard = setTimeout(() => { pending = false; onPainted(); if (want != null) doSeek(); }, 2500);
    try { vid.currentTime = timeForFrame(f); } catch { pending = false; }
  };
  const onSeeked = () => {
    clearTimeout(guard);
    pending = false;
    onPainted();
    if (want != null) doSeek();
  };
  vid.addEventListener('seeked', onSeeked);
  return {
    go(f) { want = f; if (!pending) doSeek(); },
    reset() { pending = false; want = null; clearTimeout(guard); },
    dispose() { vid.removeEventListener('seeked', onSeeked); clearTimeout(guard); },
  };
}
