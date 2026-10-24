import { SiteFooter } from './Branding.jsx';
// Video Tracker — app shell. Holds the project state, undo history, video
// element and frame navigation, and passes actions down to the components.
import { useEffect, useRef, useState } from 'react';
import { clamp } from './lib/maths.js';
import { UNITS } from './lib/constants.js';
import {
  activeObj, addObject, adopt, clone, emptyVideo, ensureDefaults, framesFor, freshState,
  hasData, newGraph, objById, pointCount, sourceObj,
} from './lib/model.js';
import { createSeeker, fixDuration, measureFps, openVideo } from './lib/video.js';
import { buildTable, copyText, download, toCSV, toTSV } from './lib/exporting.js';
import { useModal, useToast } from './components/feedback.jsx';
import TopBar from './components/TopBar.jsx';
import Guide from './components/Guide.jsx';
import VideoStage from './components/VideoStage.jsx';
import FrameBar from './components/FrameBar.jsx';
import GraphPanel from './components/Graphs.jsx';
import { CodecHelp, HelpText } from './components/messages.jsx';

const storeKey = (V) => `vtrack:${V.name}:${V.size}`;
const baseName = (V) => (V.name || 'video').replace(/\.[^.]+$/, '');
const VIDEO_EXT = /\.(mov|mp4|m4v|webm|ogv|mkv|avi|3gp)$/i;

export default function App() {
  const vidRef = useRef(null);
  const fileIn = useRef(null);
  const projIn = useRef(null);

  const [S, setSState] = useState(freshState);
  const [V, setVState] = useState(emptyVideo);
  const [frame, setFrameState] = useState(0);
  const [step, setStepState] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(null);
  const [tick, setTick] = useState(0);          // bumps whenever a new video frame is painted
  const [dragOver, setDragOver] = useState(false);

  // Latest values, readable synchronously from event handlers and async code.
  const R = useRef({ S, V, frame: 0, step: 1, playing: false });
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const seeker = useRef(null);

  const { toast, toastEl } = useToast();
  const { ask, modalEl, isOpen: modalOpen } = useModal();

  const setS = (next) => { R.current.S = next; setSState(next); };
  const setV = (next) => { R.current.V = next; setVState(next); };
  const setFrame = (f) => { R.current.frame = f; setFrameState(f); };

  /* ---------- state changes & undo ---------- */
  const pushUndo = () => {
    undoStack.current.push({ s: JSON.stringify(R.current.S), f: R.current.frame });
    if (undoStack.current.length > 400) undoStack.current.shift();
    redoStack.current = [];
  };
  /** Copy the state, apply fn to the copy, and make it current. */
  const commit = (fn, { undoable = true, defaults = false } = {}) => {
    if (undoable) pushUndo();
    const next = clone(R.current.S);
    fn(next);
    if (defaults) ensureDefaults(next, R.current.V);
    setS(next);
    return next;
  };
  const restore = (entry) => {
    const s = ensureDefaults(adopt(JSON.parse(entry.s)), R.current.V);
    const V0 = R.current.V;
    if (V0.loaded && framesFor(V0.duration, s.fileFps) !== V0.frames) setV({ ...V0, frames: framesFor(V0.duration, s.fileFps) });
    setS(s);
    gotoFrame(entry.f);
  };
  const undo = () => {
    if (!undoStack.current.length) { toast('Nothing to undo'); return; }
    redoStack.current.push({ s: JSON.stringify(R.current.S), f: R.current.frame });
    restore(undoStack.current.pop());
  };
  const redo = () => {
    if (!redoStack.current.length) { toast('Nothing to redo'); return; }
    undoStack.current.push({ s: JSON.stringify(R.current.S), f: R.current.frame });
    restore(redoStack.current.pop());
  };

  /* ---------- frames & playback ---------- */
  useEffect(() => {
    const vid = vidRef.current;
    seeker.current = createSeeker(
      vid,
      (f) => Math.min((f + 0.5) / R.current.S.fileFps, Math.max(0, R.current.V.duration - 0.0005)),
      () => setTick((t) => t + 1)
    );
    return () => seeker.current.dispose();
  }, []);

  const gotoFrame = (f) => {
    const V0 = R.current.V;
    if (!V0.loaded) return;
    const nf = clamp(Math.round(f) || 0, 0, V0.frames - 1);
    setFrame(nf);
    seeker.current.go(nf);
  };
  const stopPlay = () => {
    if (!R.current.playing) return;
    R.current.playing = false;
    setPlaying(false);
    try { vidRef.current.pause(); } catch { /* ignore */ }
    gotoFrame(R.current.frame);
  };
  const startPlay = () => {
    if (!R.current.V.loaded || R.current.playing) return;
    const vid = vidRef.current;
    R.current.playing = true;
    setPlaying(true);
    if (R.current.frame >= R.current.V.frames - 1) vid.currentTime = 0;
    vid.play().catch(() => stopPlay());
    const loop = () => {
      if (!R.current.playing) return;
      const f = clamp(Math.floor(vid.currentTime * R.current.S.fileFps), 0, R.current.V.frames - 1);
      if (f !== R.current.frame) setFrame(f);
      setTick((t) => t + 1);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const setStep = (n) => {
    if (!R.current.V.loaded && n > 1) { toast('Choose a video first.'); return; }
    stopPlay();
    R.current.step = n;
    setStepState(n);
  };

  /* ---------- loading a video ---------- */
  const loadVideo = async (file) => {
    if (!file) return;
    if (/\.json$/i.test(file.name)) { openProjectFile(file); return; }
    if (file.type && !file.type.startsWith('video/') && !VIDEO_EXT.test(file.name)) {
      ask('That isn’t a video', <p>“{file.name}” doesn’t look like a video file. Please choose a video (for example an .mp4 or .mov file).</p>);
      return;
    }
    stopPlay();
    const vid = vidRef.current;
    setBusy('Opening video…');
    if (R.current.V.url) { try { URL.revokeObjectURL(R.current.V.url); } catch { /* ignore */ } }
    setV(emptyVideo);
    seeker.current.reset();
    const url = URL.createObjectURL(file);

    let ok = await openVideo(vid, url);
    if (ok) await fixDuration(vid);
    if (ok && !(Number.isFinite(vid.duration) && vid.duration > 0)) ok = false;
    if (!ok) {
      setBusy(null);
      try { vid.removeAttribute('src'); vid.load(); URL.revokeObjectURL(url); } catch { /* ignore */ }
      ask('This video won’t open here 😕', <CodecHelp file={file} />);
      return;
    }
    setBusy('Measuring the frame rate…');
    const fps = await measureFps(vid);
    setBusy(null);

    const newV = { loaded: true, name: file.name, size: file.size, w: vid.videoWidth, h: vid.videoHeight, duration: vid.duration, frames: 1, url };
    undoStack.current = [];
    redoStack.current = [];

    // Offer to restore earlier work on the same video.
    let next = null;
    try {
      const raw = localStorage.getItem(storeKey(newV));
      if (raw) {
        const prev = adopt(JSON.parse(raw));
        const n = pointCount(prev);
        if (n > 0 || prev.scale.confirmed) {
          const { choice } = await ask(
            'Welcome back 👋',
            <>
              <p>You’ve worked on this video before{n ? ` (${n} point${n === 1 ? '' : 's'} tracked)` : ''}.</p>
              <p>Do you want to carry on where you left off?</p>
            </>,
            [{ label: 'Start again', value: 0 }, { label: 'Carry on', primary: true, value: 1 }]
          );
          if (choice === 1) next = prev;
        }
      }
    } catch { /* corrupt storage: start fresh */ }

    const restored = !!next;
    if (!next) {
      next = freshState();
      if (fps) { next.fileFps = fps; next.fpsMeasured = true; }
      next.captureFps = next.fileFps;
    }
    newV.frames = framesFor(newV.duration, next.fileFps);
    setV(newV);
    setS(ensureDefaults(next, newV));
    setStep(restored ? 3 : 1);
    gotoFrame(restored ? clamp(next.frame0, 0, newV.frames - 1) : 0);
    if (!fps && !restored) toast('Couldn’t measure the frame rate — please check it in the blue box.', 4000);
  };

  /* ---------- tracking ---------- */
  const placeAt = (vp, alreadyUndoable) => {
    const o = activeObj(R.current.S);
    if (!o) return;
    const undoable = !alreadyUndoable;
    const src = sourceObj(R.current.S, o);
    if (o.type === 'angle' && !o.vertex) {
      commit((s) => { objById(s, s.active).vertex = vp; }, { undoable });
      toast(src ? `Pivot set ✓  The angle now follows ${src.name}’s points.` : 'Pivot set ✓  Now click the moving end in each frame.', 3500);
      return;
    }
    if (src) {
      toast(`This angle uses ${src.name}’s points. Click “${src.name}” above to track more of them.`, 4000);
      return;
    }
    const f = R.current.frame;
    commit((s) => { objById(s, s.active).pts[f] = vp; }, { undoable });
    const nf = f + R.current.S.advance;
    if (nf <= R.current.V.frames - 1) gotoFrame(nf);
    else toast('That was the last frame 🎉');
  };

  /* ---------- project files & export ---------- */
  const exportCSV = () => {
    const S0 = R.current.S, V0 = R.current.V;
    if (!hasData(S0)) { toast('Track some points first.'); return; }
    download(`${baseName(V0)}-data.csv`, toCSV(buildTable(S0)), 'text/csv;charset=utf-8');
    toast(`Downloaded ${baseName(V0)}-data.csv`);
  };
  const copyData = async () => {
    if (!hasData(R.current.S)) { toast('Track some points first.'); return; }
    await copyText(toTSV(buildTable(R.current.S)));
    toast('Copied ✓  Now paste into Excel or Google Sheets.');
  };
  const saveProject = () => {
    const V0 = R.current.V;
    if (!V0.loaded) { toast('Open a video first.'); return; }
    const data = { app: 'video-tracker', version: 1, video: { name: V0.name, size: V0.size }, state: R.current.S };
    download(`${baseName(V0)}-project.json`, JSON.stringify(data, null, 1), 'application/json');
    toast('Project saved. Open it again later with More → Open project file.');
  };
  const openProjectFile = async (file) => {
    let d;
    try { d = JSON.parse(await file.text()); } catch { d = null; }
    if (!d || d.app !== 'video-tracker' || !d.state) {
      ask('Couldn’t open that file', <p>That doesn’t look like a Video Tracker project file.</p>);
      return;
    }
    const V0 = R.current.V;
    if (!V0.loaded) {
      ask('Open the video first', <p>Please open the video <b>{d.video?.name}</b> first, then open the project file.</p>);
      return;
    }
    if (d.video && d.video.name !== V0.name) {
      const { choice } = await ask(
        'Different video?',
        <p>This project was made with <b>{d.video.name}</b>, but the open video is <b>{V0.name}</b>. Load it anyway?</p>,
        [{ label: 'Cancel', value: 0 }, { label: 'Load anyway', primary: true, value: 1 }]
      );
      if (choice !== 1) return;
    }
    pushUndo();
    const s = ensureDefaults(adopt(d.state), V0);
    setV({ ...V0, frames: framesFor(V0.duration, s.fileFps) });
    setS(s);
    setStep(3);
    gotoFrame(s.frame0);
    toast('Project opened ✓');
  };
  const clearPoints = async () => {
    if (!hasData(R.current.S)) { toast('There are no points to clear.'); return; }
    const { choice } = await ask('Clear all points?', <p>This removes every tracked point (the scale is kept). You can undo this.</p>,
      [{ label: 'Cancel', value: 0 }, { label: 'Clear them', primary: true, value: 1 }]);
    if (choice === 1) commit((s) => { s.objects.forEach((o) => { o.pts = {}; }); });
  };

  /* ---------- actions used by the blue guide strip ---------- */
  const a = {
    chooseVideo: () => fileIn.current.click(),
    setStep,
    setCaptureFps: (v) => {
      if (!(v > 0 && v < 100000)) { toast('Please type a number of frames per second, e.g. 30 or 240.'); return false; }
      commit((s) => { s.captureFps = v; });
      return true;
    },
    changeFileFps: async () => {
      const S0 = R.current.S;
      const { choice, inputs } = await ask(
        'File frame rate',
        <>
          <p>The video file plays at <b>{+S0.fileFps.toPrecision(5)}</b> frames per second
            {S0.fpsMeasured ? ' (measured automatically)' : ' (a guess — it couldn’t be measured)'}.</p>
          <p>Only change this if stepping through the video skips frames or shows the same frame twice.
            {' '}<b>Changing it will remove your tracked points.</b></p>
          <p><label>File frame rate: <input type="number" defaultValue={+S0.fileFps.toPrecision(5)} min="1" max="1000" step="any" style={{ width: 100 }} /></label> fps</p>
        </>,
        [{ label: 'Cancel', value: 0 }, { label: 'Change it', primary: true, value: 1 }]
      );
      if (choice !== 1) return;
      const v = parseFloat(inputs[0]);
      if (!(v > 0 && v <= 1000) || v === S0.fileFps) return;
      commit((s) => {
        const wasSame = s.captureFps === s.fileFps;
        s.fileFps = v; s.fpsMeasured = true;
        if (wasSame) s.captureFps = v;
        s.objects.forEach((o) => { o.pts = {}; });
        s.frame0 = 0;
      });
      setV({ ...R.current.V, frames: framesFor(R.current.V.duration, v) });
      gotoFrame(0);
    },
    nextFromScale: () => {
      if (!R.current.S.scale.confirmed) commit((s) => { s.scale.confirmed = true; }, { undoable: false });
      setStep(3);
    },
    setLength: (v) => {
      if (!(v > 0)) { toast('The length must be a number bigger than 0.'); return false; }
      commit((s) => { s.scale.length = v; s.scale.confirmed = true; });
      return true;
    },
    setUnit: (u) => { if (u in UNITS) commit((s) => { s.scale.unit = u; s.scale.confirmed = true; }); },
    resetAxes: () => {
      const V0 = R.current.V;
      commit((s) => { s.axes = { o: { x: V0.w * 0.08, y: V0.h * 0.92 }, a: 0 }; });
    },
    selectObject: (id) => commit((s) => { s.active = id; }, { undoable: false }),
    renameObject: async (id) => {
      const ob = objById(R.current.S, id);
      if (!ob) return;
      const { choice, inputs } = await ask(
        'Rename',
        <p><label>New name: <input type="text" defaultValue={ob.name} maxLength={30} style={{ width: 220 }} /></label></p>,
        [{ label: 'Cancel', value: 0 }, { label: 'Rename', primary: true, value: 1 }]
      );
      const name = (inputs?.[0] || '').trim();
      if (choice === 1 && name) commit((s) => { objById(s, id).name = name.slice(0, 30); });
    },
    deleteObject: async (id) => {
      const ob = objById(R.current.S, id);
      if (!ob) return;
      const { choice } = await ask(`Delete ${ob.name}?`, <p>This removes {ob.name} and all its tracked points. (You can undo this.)</p>,
        [{ label: 'Cancel', value: 0 }, { label: 'Delete', primary: true, value: 1 }]);
      if (choice !== 1) return;
      commit((s) => {
        s.objects = s.objects.filter((x) => x.id !== id);
        s.graphs = s.graphs.filter((g) => g.obj !== id);
        s.active = s.objects[0]?.id ?? null;
      }, { defaults: true });
    },
    addPointObject: () => {
      let name = '';
      commit((s) => { const ob = addObject(s, 'point'); name = ob.name; s.graphs.push(newGraph(ob.id, 't', 'y')); }, { defaults: true });
      toast(`Now tracking “${name}”. Go back to its first frame and click it.`, 3500);
    },
    addAngleObject: () => commit((s) => { addObject(s, 'angle'); }, { defaults: true }),
    setAngleSource: (v) => commit((s) => {
      const o = objById(s, s.active);
      const id = v === '' ? null : +v;
      o.source = id != null && objById(s, id)?.type === 'point' ? id : null;
    }),
    setAngleRef: (v) => commit((s) => { objById(s, s.active).ref = ['x', 'custom'].includes(v) ? v : 'down'; }),
    setAdvance: (n) => commit((s) => { s.advance = n; }, { undoable: false }),
    setT0: () => {
      const f = R.current.frame;
      commit((s) => { s.frame0 = f; });
      toast(`The clock now starts at frame ${f + 1}.`);
    },
  };

  /* ---------- graph actions ---------- */
  const graphChange = (id, patch) => commit((s) => { Object.assign(s.graphs.find((g) => g.id === id) || {}, patch); }, { undoable: false, defaults: true });
  const graphRemove = (id) => commit((s) => { s.graphs = s.graphs.filter((g) => g.id !== id); }, { undoable: false });
  const graphAdd = () => {
    const o = activeObj(R.current.S) || R.current.S.objects[0];
    if (!o) return;
    commit((s) => { s.graphs.push(o.type === 'angle' ? newGraph(o.id, 't', 'omega') : newGraph(o.id, 't', 'x')); }, { undoable: false });
    setTimeout(() => document.getElementById('graphPane')?.scrollTo({ top: 1e6, behavior: 'smooth' }), 50);
  };
  const jumpTo = (f) => { if (R.current.step !== 3) setStep(3); gotoFrame(f); };

  const help = () => ask('Help', <HelpText />);

  /* ---------- global listeners ---------- */
  // Handlers change every render; listeners call through this ref so they always see the latest.
  const handlers = useRef(null);
  handlers.current = { loadVideo, undo, redo, gotoFrame, startPlay, stopPlay, commit, toast, modalOpen };

  useEffect(() => {
    const onKey = (e) => {
      const h = handlers.current;
      if (h.modalOpen) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) h.redo(); else h.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); h.redo(); return; }
      if (!R.current.V.loaded || mod) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); h.stopPlay(); h.gotoFrame(R.current.frame + (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); h.stopPlay(); h.gotoFrame(R.current.frame - (e.shiftKey ? 10 : 1)); }
      else if (e.key === ' ') { e.preventDefault(); if (R.current.playing) h.stopPlay(); else h.startPlay(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && R.current.step === 3) {
        e.preventDefault();
        const o = activeObj(R.current.S), f = R.current.frame;
        if (o && o.pts[f]) { h.commit((s) => { delete objById(s, s.active).pts[f]; }); h.toast('Mark removed'); }
      }
    };
    const over = (e) => { e.preventDefault(); setDragOver(true); };
    const leave = (e) => { e.preventDefault(); setDragOver(false); };
    const drop = (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handlers.current.loadVideo(f);
    };
    const ended = () => handlers.current.stopPlay();
    const save = () => {
      try { if (R.current.V.loaded) localStorage.setItem(storeKey(R.current.V), JSON.stringify(R.current.S)); } catch { /* ignore */ }
    };
    let lastErr = 0;
    const onErr = (e) => {
      console.error(e);
      if (Date.now() - lastErr > 5000) {
        lastErr = Date.now();
        handlers.current.toast('Oops — something went wrong, but your work is saved. If anything looks odd, reload the page.', 5000);
      }
    };
    const onErrEvt = (e) => onErr(e.error || e.message);
    const onRej = (e) => onErr(e.reason);
    const vid = vidRef.current;
    window.addEventListener('keydown', onKey);
    window.addEventListener('dragenter', over);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('beforeunload', save);
    window.addEventListener('error', onErrEvt);
    window.addEventListener('unhandledrejection', onRej);
    vid.addEventListener('ended', ended);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dragenter', over);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('beforeunload', save);
      window.removeEventListener('error', onErrEvt);
      window.removeEventListener('unhandledrejection', onRej);
      vid.removeEventListener('ended', ended);
    };
  }, []);

  // Autosave (debounced) whenever the work changes.
  useEffect(() => {
    if (!V.loaded) return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(storeKey(V), JSON.stringify(S)); } catch { /* storage full or private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [S, V]);

  // Read-only hook used by the automated tests.
  useEffect(() => {
    window.__vt = {
      get S() { return R.current.S; },
      get V() { return R.current.V; },
      get frame() { return R.current.frame; },
    };
  }, []);

  return (
    <>
      <TopBar
        step={step}
        loaded={V.loaded}
        onStep={setStep}
        onUndo={undo}
        onRedo={redo}
        onCopy={copyData}
        onExport={exportCSV}
        onSaveProject={saveProject}
        onOpenProject={() => projIn.current.click()}
        onClear={clearPoints}
        onHelp={help}
      />
      <Guide step={step} V={V} S={S} a={a} />
      <main>
        <section className="stage">
          <VideoStage
            vidRef={vidRef}
            V={V}
            S={S}
            frame={frame}
            step={step}
            playing={playing}
            tick={tick}
            busy={busy}
            dragOver={dragOver}
            onChooseVideo={a.chooseVideo}
            onPlace={placeAt}
            onDragStart={pushUndo}
            onDragApply={(fn) => commit(fn, { undoable: false })}
            onStopPlay={stopPlay}
            toast={toast}
          />
          <FrameBar V={V} S={S} frame={frame} playing={playing} onGo={gotoFrame} onPlay={startPlay} onStop={stopPlay} />
        </section>
        <GraphPanel
          V={V}
          S={S}
          frame={frame}
          onJump={jumpTo}
          onGraphChange={graphChange}
          onGraphRemove={graphRemove}
          onAddGraph={graphAdd}
        />
      </main>

      <video ref={vidRef} className="hidden-video" muted playsInline preload="auto" />
      <input
        ref={fileIn}
        id="fileIn"
        type="file"
        accept="video/*,.mov,.mp4,.m4v,.webm"
        className="sr"
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; loadVideo(f); }}
      />
      <input
        ref={projIn}
        id="projIn"
        type="file"
        accept=".json,application/json"
        className="sr"
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openProjectFile(f); }}
      />
      <SiteFooter />
      {modalEl}
      {toastEl}
    </>
  );
}
