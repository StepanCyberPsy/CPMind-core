// Единый источник констант, иконок и CSS для CPMind Player.
// Все компоненты импортируют отсюда — ничего не определяется в самих компонентах

export function formatTime(sec: number): string {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const ss = String(s % 60).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// SVG Icons 
// Минималистичные SVG по стандартам Google Material / YouTube.
// viewBox 24×24, stroke-based (не fill) — чистый, масштабируемый вид

export const ICON_PLAY =
    `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z"/>` +
    `</svg>`;

export const ICON_PAUSE =
    `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="5" y="4" width="4" height="16" rx="1"/>` +
    `<rect x="15" y="4" width="4" height="16" rx="1"/>` +
    `</svg>`;

export const ICON_MUTED =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">` +
    `<polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" stroke="none"/>` +
    `<line x1="23" y1="9" x2="17" y2="15"/>` +
    `<line x1="17" y1="9" x2="23" y2="15"/>` +
    `</svg>`;

export const ICON_UNMUTED =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">` +
    `<polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" stroke="none"/>` +
    `<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>` +
    `<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>` +
    `</svg>`;

// Skip: стрелка вправо + вертикальная линия (YouTube-style)
export const ICON_SKIP =
    `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M5.58 5.14v13.72a1 1 0 0 0 1.5.86l9-6.02V19a1 1 0 0 0 2 0V5a1 1 0 0 0-2 0v5.3l-9-6.02a1 1 0 0 0-1.5.86z"/>` +
    `</svg>`;

// Close: тонкий крест (×) — Google Material style
export const ICON_CLOSE =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="18" y1="6" x2="6" y2="18"/>` +
    `<line x1="6" y1="6" x2="18" y2="18"/>` +
    `</svg>`;

// Timing 

export const CONTROLS_HIDE_DELAY_MS = 3000;
export const COMPACT_BREAKPOINT_PX = 400;
export const SEEK_STEP_SEC = 5;

// Viewport

export const ELIGIBILITY_THRESHOLD = 0;
export const PLAYBACK_THRESHOLD = 0.5;

// Outstream surface

export const OUTSTREAM_ASPECT_RATIO = 16 / 9;
export const OUTSTREAM_MIN_HEIGHT_PX = 180;

// For bridge

export const ACTION_SOURCE_WINDOW_MS = 100;

// CSS 

export const PLAYER_CSS = `
/* Reset & Container */
[data-cpmind-surface] *,
[data-cpmind-surface] *::before,
[data-cpmind-surface] *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

[data-cpmind-surface] {
  position: relative;
  overflow: hidden;
  background: #000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
  outline: none;
}

[data-cpmind-surface] video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Ad label */
[data-cpmind-label-ad] {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 2px 7px;
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 3px;
  color: rgba(255,255,255,0.75);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  pointer-events: none;
  z-index: 10;
}

/* Controls bar */
[data-cpmind-controls] {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px 10px 10px;
  /* Gradient: Netflix/YouTube — subtle, не перекрывает контент */
  background: linear-gradient(
    to top,
    rgba(0,0,0,0.72) 0%,
    rgba(0,0,0,0.28) 60%,
    transparent 100%
  );
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 20;
  opacity: 1;
  transition: opacity 0.25s ease;
}

[data-cpmind-surface][data-cpmind-controls-hidden] [data-cpmind-controls] {
  opacity: 0;
  pointer-events: none;
}

/* Progress row */
[data-cpmind-progress-row] {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}

[data-cpmind-time] {
  flex-shrink: 0;
  color: rgba(255,255,255,0.85);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  min-width: 38px;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-time] {
  display: none;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-btn] {
  width: 28px;
  height: 28px;
  padding: 5px;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-controls] {
  padding: 16px 8px 8px;
  gap: 4px;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-skip] {
  bottom: 50px;
  font-size: 10px;
  padding: 4px 8px 4px 6px;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-skip] svg {
  width: 12px;
  height: 12px;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-close] {
  width: 22px;
  height: 22px;
  padding: 4px;
}

[data-cpmind-surface][data-cpmind-compact] [data-cpmind-label-ad] {
  font-size: 9px;
  padding: 1px 5px;
}

/* Seek / Progress bar */
[data-cpmind-seek] {
  flex: 1;
  height: 3px;
  background: rgba(255,255,255,0.22);
  border-radius: 2px;
  position: relative;
  cursor: pointer;
  touch-action: none;
  transition: height 0.15s ease;
}

[data-cpmind-seek]:hover,
[data-cpmind-seek][data-dragging] {
  height: 5px;
}

[data-cpmind-seek-fill] {
  height: 100%;
  background: #fff;
  border-radius: 2px;
  pointer-events: none;
  width: 0%;
  transition: width 0.1s linear;
}

[data-cpmind-seek][data-dragging] [data-cpmind-seek-fill] {
  transition: none;
}

[data-cpmind-seek-thumb] {
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%) scale(0);
  pointer-events: none;
  left: 0%;
  transition: transform 0.15s ease;
}

[data-cpmind-seek]:hover [data-cpmind-seek-thumb],
[data-cpmind-seek][data-dragging] [data-cpmind-seek-thumb] {
  transform: translate(-50%, -50%) scale(1);
}

/* Buttons row */
[data-cpmind-btn-row] {
  display: flex;
  align-items: center;
  gap: 4px;
}

[data-cpmind-btn] {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 7px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, opacity 0.12s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  opacity: 0.9;
}

[data-cpmind-btn] svg {
  width: 100%;
  height: 100%;
  display: block;
}

[data-cpmind-btn]:hover {
  background: rgba(255,255,255,0.12);
  opacity: 1;
}

[data-cpmind-btn]:active {
  background: rgba(255,255,255,0.2);
}

/* Skip button */
[data-cpmind-skip] {
  position: absolute;
  bottom: 58px;
  right: 10px;
  padding: 5px 10px 5px 8px;
  background: rgba(20,20,20,0.82);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 3px;
  color: rgba(255,255,255,0.65);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: default;
  z-index: 30;
  white-space: nowrap;
  transition: border-color 0.15s ease, color 0.15s ease;
}

[data-cpmind-skip] svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.5;
}

[data-cpmind-skip][data-cpmind-skip-ready] {
  cursor: pointer;
  border-color: rgba(255,255,255,0.55);
  color: rgba(255,255,255,0.92);
}

[data-cpmind-skip][data-cpmind-skip-ready] svg {
  opacity: 0.9;
}

[data-cpmind-skip][data-cpmind-skip-ready]:hover {
  border-color: #fff;
  background: rgba(40,40,40,0.88);
  color: #fff;
}

/* Close button */
[data-cpmind-close] {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  padding: 5px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}

[data-cpmind-close] svg {
  width: 100%;
  height: 100%;
  display: block;
}

[data-cpmind-close]:hover {
  background: rgba(0,0,0,0.8);
  border-color: rgba(255,255,255,0.5);
  color: #fff;
}
`.trim();