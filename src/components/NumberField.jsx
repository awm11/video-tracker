import { useEffect, useState } from 'react';

/**
 * A number box that only "commits" when you leave it or press Enter, so typing
 * "1" on the way to "120" never briefly sets the value to 1. If onCommit
 * returns false the box snaps back to the last good value.
 */
export default function NumberField({ value, onCommit, ...rest }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (v === value) return;
    if (onCommit(v) === false) setText(String(value));
  };
  return (
    <input
      type="number"
      step="any"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      {...rest}
    />
  );
}
