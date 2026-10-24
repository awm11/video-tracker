// The blue instruction strip under the top bar. It always says, in one
// sentence, what to do right now, and holds that step's few settings.
import { ADVANCE_OPTIONS, UNITS } from '../lib/constants.js';
import { fmt } from '../lib/maths.js';
import { activeObj, sourceObj } from '../lib/model.js';
import NumberField from './NumberField.jsx';

export default function Guide(props) {
  const { step } = props;
  return (
    <section className="guide" aria-live="polite">
      {step === 1 && <VideoStep {...props} />}
      {step === 2 && <ScaleStep {...props} />}
      {step === 3 && <TrackStep {...props} />}
    </section>
  );
}

function VideoStep({ V, S, a }) {
  if (!V.loaded) {
    return (
      <>
        <div className="row">
          <span><b>Step 1 — Choose your video.</b></span>
          <button className="btn primary" onClick={a.chooseVideo}>Choose a video</button>
        </div>
        <div className="row tip">
          Tips for a good video: film side-on, hold the phone still (lean it on something), and include a metre rule or something you know the length of.
        </div>
      </>
    );
  }
  const slow = S.captureFps > S.fileFps * 1.5;
  return (
    <>
      <div className="row">
        <span>Video loaded: <b>{V.name}</b> &nbsp;<span className="tip">{fmt(V.duration, 3)} s · {V.frames} frames</span></span>
        <button className="btn small" onClick={a.chooseVideo}>Choose a different video</button>
      </div>
      <div className="row">
        <label htmlFor="capFps"><b>How many frames per second did the camera film?</b></label>
        <NumberField id="capFps" min="1" max="10000" value={+S.captureFps.toFixed(3)} onCommit={a.setCaptureFps} />
        <span>fps</span>
        <button className="btn primary" id="next1" onClick={() => a.setStep(2)}>Next: set the scale →</button>
      </div>
      <div className="row tip">
        <span>
          Normal video: leave this as it is (this video plays at {fmt(S.fileFps, 4)} fps
          {!S.fpsMeasured && <> — <b>estimated</b>, please check</>}).
          {' '}Slow-motion video: change it to the slow-mo setting, usually 120 or 240.
          {slow && <> <b>Slow motion is on:</b> each frame is {fmt(1000 / S.captureFps, 3)} ms apart in real life.</>}
          {' '}<button className="link" onClick={a.changeFileFps}>Change the file’s frame rate</button>
        </span>
      </div>
    </>
  );
}

function ScaleStep({ S, a }) {
  const sc = S.scale;
  return (
    <>
      <div className="row">
        <span>
          <b>Step 2 — Set the scale.</b> Drag the ends of the <span className="swatch" style={{ background: '#facc15' }}>yellow line</span> onto the ends of something you know the length of.
        </span>
      </div>
      <div className="row">
        <label htmlFor="lenIn"><b>The yellow line is</b></label>
        <NumberField id="lenIn" min="0" value={sc.length} onCommit={a.setLength} />
        <select id="unitIn" value={sc.unit} onChange={(e) => a.setUnit(e.target.value)}>
          {Object.keys(UNITS).map((u) => <option key={u}>{u}</option>)}
        </select>
        <span><b>long.</b></span>
        <button className="btn primary" id="next2" onClick={a.nextFromScale}>Next: start tracking →</button>
      </div>
      <div className="row tip">
        <span>
          Optional: drag the <span className="swatch" style={{ background: '#38bdf8', color: '#fff' }}>blue ⊕</span> to where you want (0, 0), and drag the tip of the x arrow to tilt the axes (useful for slopes).
        </span>
        <button className="btn small" onClick={a.resetAxes}>Reset axes</button>
      </div>
    </>
  );
}

function TrackStep({ S, a }) {
  const o = activeObj(S);
  const src = sourceObj(S, o);
  const pointObjs = S.objects.filter((ob) => ob.type === 'point');
  let instr = null;
  if (o?.type === 'angle' && !o.vertex) instr = <><b>Click the pivot</b> — the fixed point the angle turns around.</>;
  else if (src) instr = <>This angle is worked out from <b>{src.name}</b>’s points, from the pivot. Drag the square to move the pivot.</>;
  else if (o?.type === 'angle') instr = <><b>Click the moving end</b> in each frame — the dashed line shows the angle before you click. The video moves on by itself. Drag the square to move the pivot.</>;
  else if (o) {
    const what = o.name.toLowerCase() === 'ball' ? 'ball' : o.name;
    instr = <><b>Click the centre of the {what}.</b> The video moves on by itself. Mistake? Drag the mark, or press ◀ to go back.</>;
  }
  return (
    <>
      <div className="row"><span><b>Step 3 — Track.</b> {instr}</span></div>
      <div className="row">
        <span className="tip">Tracking:</span>
        {S.objects.map((ob) => {
          const on = ob.id === S.active;
          return (
            <span
              key={ob.id}
              className={`chip${on ? ' on' : ''}`}
              style={{ borderColor: on ? ob.color : undefined }}
              onClick={() => a.selectObject(ob.id)}
            >
              <span className="dot" style={{ background: ob.color }} />
              {ob.name}{ob.type === 'angle' ? ' ∠' : ''}
              {on && (
                <>
                  <button className="mini" title="Rename" onClick={(e) => { e.stopPropagation(); a.renameObject(ob.id); }}>✎</button>
                  {S.objects.length > 1 && (
                    <button className="mini" title="Delete" onClick={(e) => { e.stopPropagation(); a.deleteObject(ob.id); }}>✕</button>
                  )}
                </>
              )}
            </span>
          );
        })}
        <button className="btn small" id="addPt" onClick={a.addPointObject}>＋ Another object</button>
        <button className="btn small" id="addAng" onClick={a.addAngleObject}>＋ Angle</button>
        {o?.type === 'angle' && pointObjs.length > 0 && (
          <label className="tip">
            Moving end:{' '}
            <select id="srcIn" value={src ? src.id : ''} onChange={(e) => a.setAngleSource(e.target.value)}>
              <option value="">click it in each frame</option>
              {pointObjs.map((ob) => <option key={ob.id} value={ob.id}>use {ob.name}’s points</option>)}
            </select>
          </label>
        )}
        {o?.type === 'angle' && (
          <label className="tip">
            Angle measured from{' '}
            <select value={o.ref} onChange={(e) => a.setAngleRef(e.target.value)}>
              <option value="down">straight down</option>
              <option value="x">the x-axis</option>
              <option value="custom">another direction (drag it)</option>
            </select>
          </label>
        )}
        {o?.type === 'angle' && o.ref === 'custom' && (
          <span className="tip">Drag the white dot at the end of the dashed <b>0°</b> line to set the direction.</span>
        )}
      </div>
      <div className="row tip">
        <label>
          After each click, move on{' '}
          <select value={S.advance} onChange={(e) => a.setAdvance(+e.target.value)}>
            {ADVANCE_OPTIONS.map((n) => <option key={n} value={n}>{n} frame{n > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <button className="btn small" onClick={a.setT0} title="Use this frame as the start of the clock">Start the clock (t = 0) here</button>
      </div>
    </>
  );
}
