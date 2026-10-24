import { timeOf } from '../lib/model.js';

export default function FrameBar({ V, S, frame, playing, onGo, onPlay, onStop }) {
  if (!V.loaded) return <div className="framebar" style={{ visibility: 'hidden' }} />;
  const step = (f) => () => { onStop(); onGo(f); };
  return (
    <div className="framebar">
      <button className="btn" onClick={step(0)} title="First frame">⏮</button>
      <button className="btn" onClick={step(frame - 1)} title="Previous frame (←)">◀</button>
      <button className="btn" onClick={playing ? onStop : onPlay} title="Play / pause (space)">
        {playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <button className="btn" onClick={step(frame + 1)} title="Next frame (→)">▶</button>
      <input
        type="range"
        min="0"
        max={V.frames - 1}
        value={frame}
        aria-label="Frame"
        onChange={(e) => { onStop(); onGo(+e.target.value); }}
      />
      <span className="info">
        Frame <b>{frame + 1}</b> of {V.frames} &nbsp;·&nbsp; t = <b>{timeOf(S, frame).toFixed(3)} s</b>
      </span>
    </div>
  );
}
