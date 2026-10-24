// Colours used for each tracked object, in order.
export const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];

// Units the scale length can be typed in. Data are always output in metres.
export const UNITS = { m: 1, cm: 0.01, mm: 0.001 };

// Variables available on graphs: [key, label, unit]
export const VARS = {
  point: [
    ['t', 'time, t', 's'], ['x', 'x position', 'm'], ['y', 'y position', 'm'],
    ['vx', 'x velocity, vx', 'm/s'], ['vy', 'y velocity, vy', 'm/s'], ['v', 'speed, v', 'm/s'],
    ['ax', 'x acceleration, ax', 'm/s²'], ['ay', 'y acceleration, ay', 'm/s²'],
    ['t2', 'time squared, t²', 's²'], ['v2', 'speed squared, v²', 'm²/s²'], ['frame', 'frame number', ''],
  ],
  angle: [
    ['t', 'time, t', 's'], ['theta', 'angle, θ', '°'], ['omega', 'angular velocity, ω', '°/s'],
    ['alpha', 'angular acceleration, α', '°/s²'], ['t2', 'time squared, t²', 's²'], ['frame', 'frame number', ''],
  ],
};

// Short symbols used in fit equations and CSV headers.
export const SYM = {
  t: 't', x: 'x', y: 'y', vx: 'vx', vy: 'vy', v: 'v', ax: 'ax', ay: 'ay', t2: 't²', v2: 'v²',
  frame: 'frame', theta: 'θ', omega: 'ω', alpha: 'α',
};

// Measured frame rates are snapped to the nearest of these if within 4%.
export const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 240];

// "After each click, move on N frames" choices.
export const ADVANCE_OPTIONS = [1, 2, 3, 5, 10];

// Length of the drawn axis arrows, in screen pixels.
export const AXLEN = 80;
