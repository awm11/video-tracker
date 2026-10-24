// Longer pieces of text shown in pop-ups.

export function CodecHelp({ file }) {
  const iphoneish = /\.(mov|hevc|heic)$/i.test(file.name) || /quicktime|hevc/i.test(file.type);
  return (
    <>
      <p>
        {iphoneish ? <>It looks like an <b>iPhone video</b>. iPhones</> : 'This is probably because some phones (especially iPhones)'}
        {' '}save video in a format called <b>HEVC</b>, which many Windows laptops and Chromebooks can’t play.
      </p>
      <p><b>Any of these will fix it:</b></p>
      <ol>
        <li><b>Use an iPad, iPhone or Mac</b> — open this page in Safari there, and the video will work.</li>
        <li><b>Film it again in a compatible format.</b> On the iPhone: <i>Settings → Camera → Formats → Most Compatible</i>.</li>
        <li><b>Convert it</b> to MP4 (H.264) with a free converter such as HandBrake.</li>
      </ol>
      <p className="muted">File: {file.name}</p>
    </>
  );
}

export function HelpText() {
  return (
    <>
      <p>
        <b>1.</b> Choose a video. <b>2.</b> Drag the yellow line onto something of known length and type its length.
        {' '}<b>3.</b> Click the object in each frame — the video moves on by itself and the graphs draw themselves.
      </p>
      <p>
        <b>Keyboard shortcuts</b><br />
        <kbd>←</kbd> <kbd>→</kbd> previous / next frame (hold <kbd>Shift</kbd> for 10)<br />
        <kbd>Space</kbd> play / pause<br />
        <kbd>Delete</kbd> remove the mark on this frame<br />
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo &nbsp; <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo
      </p>
      <p>
        <b>Good to know</b><br />
        • Your work saves itself in this browser. Open the same video again to carry on.<br />
        • Click a point on any graph to jump to that frame.<br />
        • Speeds and accelerations are worked out from neighbouring points, so they look jumpy if your clicks are a little off —
        that’s real measurement uncertainty! Try moving on 2 or 3 frames per click for smoother results.<br />
        • Videos never leave your device.
      </p>
    </>
  );
}
