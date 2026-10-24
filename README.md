# Video Tracker — Vite project

Video analysis for physics lessons. Pupils open a video of an experiment (a ball dropping, a pendulum, a trolley on a ramp), set the scale against a metre rule, then click the object in each frame. The video moves on by itself after each click, and graphs of position, velocity, acceleration or angle draw themselves alongside, with optional lines of best fit. Data export as CSV or copy straight into Excel / Google Sheets.

Everything runs in the browser — videos never leave the pupil's device.

## Setup

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

## Deploying

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`. In the repo on GitHub, set *Settings → Pages → Source* to **GitHub Actions**. If the repo isn't called `video-tracker`, change `REPO_NAME` in `vite.config.js`.

## Structure

- `index.html` — Vite entry HTML (loads the font and `src/main.jsx`).
- `src/main.jsx` — React root, wrapped in an error boundary so a bug never leaves a blank page.
- `src/App.jsx` — app shell: project state, undo/redo, loading videos, frame stepping, autosave, keyboard shortcuts.
- `src/components/`
  - `TopBar.jsx` — steps 1·2·3, Undo, Copy data, Download CSV, More menu.
  - `Guide.jsx` — the blue instruction strip and each step's settings.
  - `VideoStage.jsx` — the video canvas and all mouse/touch handling.
  - `FrameBar.jsx` — play / step / slider controls.
  - `Graphs.jsx` — graph cards, axis choices, best-fit equations and hints.
  - `feedback.jsx` — toasts and pop-up dialogs. `messages.jsx` — help and "video won't open" text.
  - `NumberField.jsx`, `ErrorBoundary.jsx`.
- `src/lib/`
  - `model.js` — the project state, validation, coordinates, and the physics (positions → velocities → accelerations, angles).
  - `maths.js` — derivatives, straight-line and quadratic fits, number formatting, axis ticks.
  - `fitting.js` — all best-fit options, including exponential (A·e^(kx) + C), sinusoidal (A·sin(ωx + φ) + C) and damped sinusoidal (A·e^(−γx)·sin(ωx + φ) + C). The curved fits scan a wide range of rates/frequencies before refining, so they don't lock onto the wrong frequency.
  - `video.js` — opening a video, measuring frame rate, frame-accurate seeking.
  - `draw.js` / `graphDraw.js` — canvas drawing for the video overlays and the graphs.
  - `exporting.js` — CSV / clipboard / project files.
  - `constants.js` — colours, units and the list of graphable variables.

## Good to know

- **Time** uses the frame rate the camera *filmed* at (step 1), so slow-motion clips give real-world times.
- **Angles** are measured anticlockwise-positive from a reference direction: straight down, the x-axis, or "another direction" (a dashed 0° line pupils drag to any angle, snapped to whole degrees). After the pivot is placed, a dashed preview arm and θ follow the cursor until the point is clicked; they hide when the cursor leaves the video. The moving end can be clicked in each frame, or borrowed from an object that's already been tracked ("Moving end: use Ball's points"), in which case only the pivot needs placing.
- **Velocities and accelerations** use central differences between neighbouring points; the first and last points are left blank rather than guessed.
- **Autosave** is per video (name + size) in the browser's localStorage. "Save project file" gives a portable copy.
- **iPhone HEVC videos** won't play in Chrome/Edge on many Windows laptops and Chromebooks. The app detects this and explains the fixes (use Safari on an Apple device, set *Camera → Formats → Most Compatible*, or convert with HandBrake).
