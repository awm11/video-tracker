// Small "toast" messages and promise-based pop-up dialogs.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((text, ms = 2600) => {
    setMsg({ text, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const toastEl = (
    <div className={`toast${msg ? ' show' : ''}`} role="status">{msg ? msg.text : ''}</div>
  );
  return { toast, toastEl };
}

/**
 * const { choice, inputs } = await ask(title, body, buttons)
 * `buttons` is a list of { label, value, primary }. `inputs` holds the values of
 * any <input>s inside the body at the moment a button was pressed.
 */
export function useModal() {
  const [m, setM] = useState(null);
  const ask = useCallback(
    (title, body, buttons = [{ label: 'OK', primary: true, value: 'ok' }]) =>
      new Promise((resolve) => setM({ title, body, buttons, resolve })),
    []
  );
  const pick = useCallback((choice, inputs) => {
    setM((cur) => {
      if (cur) cur.resolve({ choice, inputs });
      return null;
    });
  }, []);
  const modalEl = m ? <Modal {...m} onPick={pick} /> : null;
  return { ask, modalEl, isOpen: !!m };
}

function Modal({ title, body, buttons, onPick }) {
  const ref = useRef(null);
  const readInputs = () => [...(ref.current?.querySelectorAll('input') || [])].map((i) => i.value);
  const cancelValue = buttons[0].value !== undefined ? buttons[0].value : 0;

  useEffect(() => {
    const first = ref.current?.querySelector('input');
    if (first) { first.focus(); first.select(); } else ref.current?.querySelector('.btn.primary')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onPick(cancelValue, readInputs()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const primary = buttons.find((b) => b.primary) || buttons[buttons.length - 1];
    onPick(primary.value !== undefined ? primary.value : buttons.indexOf(primary), readInputs());
  };

  return (
    <div className="modal-back">
      <form className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} onSubmit={submit}>
        <h2>{title}</h2>
        <div>{body}</div>
        <div className="btns">
          {buttons.map((b, i) => (
            <button
              key={b.label}
              type={b.primary ? 'submit' : 'button'}
              className={`btn${b.primary ? ' primary' : ''}`}
              onClick={b.primary ? undefined : () => onPick(b.value !== undefined ? b.value : i, readInputs())}
            >
              {b.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
