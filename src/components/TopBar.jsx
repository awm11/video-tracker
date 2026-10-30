import { BrandLogo } from '../Branding.jsx';
import { useEffect, useRef } from 'react';

const STEPS = [[1, 'Video'], [2, 'Scale'], [3, 'Track']];

export default function TopBar({ step, loaded, onStep, onUndo, onRedo, onCopy, onExport, onSaveProject, onOpenProject, onClear, onHelp }) {
  const menu = useRef(null);
  const close = () => menu.current?.removeAttribute('open');
  useEffect(() => {
    const onDoc = (e) => { if (menu.current?.open && !menu.current.contains(e.target)) close(); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  const item = (fn) => () => { close(); fn(); };

  return (
    <header className="top">
      <div className="brand has-logo"><BrandLogo />Video Tracker</div>
      <nav className="steps" aria-label="Steps">
        {STEPS.map(([n, name]) => (
          <button key={n} className={step === n ? 'on' : ''} disabled={!loaded && n > 1} onClick={() => onStep(n)}>
            <span className="num">{n}</span>{name}
          </button>
        ))}
      </nav>
      <div className="actions">
        <button className="btn" disabled={!loaded} onClick={onUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button className="btn" disabled={!loaded} onClick={onCopy} title="Copy the data so you can paste it into Excel or Google Sheets">Copy data</button>
        <button className="btn primary" disabled={!loaded} onClick={onExport}>⬇ Download CSV</button>
        <details className="more" ref={menu}>
          <summary className="btn">More ▾</summary>
          <div className="menu">
            <button onClick={item(onSaveProject)}>💾 Save project file</button>
            <button onClick={item(onOpenProject)}>📂 Open project file…</button>
            <hr />
            <button onClick={item(onRedo)}>↷ Redo</button>
            <button onClick={item(onClear)}>🗑 Clear all tracked points</button>
            <hr />
            <button onClick={item(onHelp)}>❓ Help &amp; keyboard shortcuts</button>
          </div>
        </details>
      </div>
    </header>
  );
}
