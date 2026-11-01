import { timeOf } from '../lib/model.js';

const Icon = ({ d, fill }) => (
  <svg className="ico" viewBox="0 0 14 14" aria-hidden="true">
    <path d={d} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.8" />
  </svg>
);
const FIRST = 'M3 2v10M11 2 6 7l5 5', PREV = 'M9 2 4 7l5 5', NEXT = 'm5 2 5 5-5 5';
const PLAY = 'M3.5 2v10l8.5-5z', PAUSE = 'M3 2h3v10H3zM8 2h3v10H8z';

export default function FrameBar({ V, S, frame, playing, onGo, onPlay, onStop }) {
  if (!V.loaded) return <div className="framebar" style={{ visibility: 'hidden' }} />;
  const step = (f) => () => { onStop(); onGo(f); };
  return (
    <div className="framebar">
      <button className="btn" onClick={step(0)} title="First frame" aria-label="First frame"><Icon d={FIRST} /></button>
      <button className="btn" onClick={step(frame - 1)} title="Previous frame (←)" aria-label="Previous frame"><Icon d={PREV} /></button>
      <button className="btn" onClick={playing ? onStop : onPlay} title="Play / pause (space)">
        {playing ? <><Icon d={PAUSE} fill />Pause</> : <><Icon d={PLAY} fill />Play</>}
      </button>
      <button className="btn" onClick={step(frame + 1)} title="Next frame (→)" aria-label="Next frame"><Icon d={NEXT} /></button>
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
