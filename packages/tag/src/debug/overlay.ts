/**
 *
 * Визуальный индикатор работы тега на странице:
 *   - Статус viewport (≥50% / < 50%)
 *   - Время в зоне видимости (обновляется каждые 250 мс)
 *   - Ключевые метрики S1–S5 в реальном времени
 *
 * Активируется при ?cpmind_debug=1 в URL или data-debug="true" на контейнере.
 * Не влияет на производительность страницы — поллинг только в debug-режиме.
 */

import type { Session } from '../types.js';
import { computeActiveTimeMsInRange } from '../session.js';

const OVERLAY_STYLES: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  bottom: '16px',
  right: '16px',
  zIndex: '2147483647',
  backgroundColor: 'rgba(15, 18, 26, 0.92)',
  color: '#f1f5f9',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: '11px',
  lineHeight: '1.6',
  padding: '10px 14px',
  borderRadius: '6px',
  minWidth: '260px',
  maxWidth: '360px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  pointerEvents: 'none',
  userSelect: 'none',
};

const LABEL_COLOR = '#64748b';
const VALUE_COLOR = '#32d345';
const WARN_COLOR = '#fb923c';
const HEADER_COLOR = '#f1f5f9';
const BORDER_COLOR = '#1e293b';

export class DebugOverlay {
  private readonly el: HTMLElement;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly session: Session;

  constructor(creativeEl: HTMLElement, session: Session) {
    this.session = session;
    this.el = document.createElement('div');
    this.el.setAttribute('id', 'cpmind-debug-overlay');

    for (const [key, value] of Object.entries(OVERLAY_STYLES)) {
      (this.el.style as unknown as Record<string, string>)[key] = value as string;
    }

    document.body.appendChild(this.el);

    this.render();

    this.intervalId = setInterval(() => this.render(), 250);

    window.addEventListener('pagehide', () => this.destroy(), { once: true });

    console.log(
      '%c[CPMind Debug] Overlay initialized',
      'color: #4ade80; font-weight: bold;',
    );
    console.log('[CPMind Debug] Creative element:', creativeEl);
    console.log('[CPMind Debug] Session ID:', session.impressionId);
  }

  private getCurrentTimeInView(): number {
    let t = this.session.timeInViewSec;
    if (this.session.viewStart !== null) {
      t += (Date.now() - this.session.viewStart) / 1000;
    }
    return t;
  }

  private getTabActivePct(): string {
    const now = Date.now();
    const impressionStart = this.session.timestampStart || now;
    const total = now - impressionStart;
    if (total === 0) return '100%';
    const active = computeActiveTimeMsInRange(this.session.visibilityStateHistory, impressionStart, now);
    return ((active / total) * 100).toFixed(1) + '%';
  }

  private getShareOfScreenAvg(): string {
    const samples = this.session.shareOfScreenSamples;
    if (samples.length === 0) return '0%';
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return avg.toFixed(1) + '%';
  }

  private row(label: string, value: string, warn = false): string {
    const valueColor = warn ? WARN_COLOR : VALUE_COLOR;
    return (
      `<div>` +
      `<span style="color:${LABEL_COLOR}">${label}: </span>` +
      `<span style="color:${valueColor}">${value}</span>` +
      `</div>`
    );
  }

  private render(): void {
    const s = this.session;
    const inView = s.viewStart !== null;
    const timeInView = this.getCurrentTimeInView();

    const viewportStatus = inView
      ? `<span style="color:${VALUE_COLOR}">✓ viewport ≥50%</span>`
      : `<span style="color:${WARN_COLOR}">✗ viewport &lt;50%</span>`;

    let s5Event = 'none';
    if (s.clicked) s5Event = 'clicked';
    else if (s.zoom) s5Event = 'zoom';
    else if (s.swipeCount > 0) s5Event = `swipe×${s.swipeCount}`;
    else if (s.tapCount > 0) s5Event = `tap×${s.tapCount}`;
    else if (s.hoverDurationMaxMs > 0) s5Event = `hover ${s.hoverDurationMaxMs}ms`;
    else if (s.hoverCount > 0) s5Event = `hover×${s.hoverCount}`;

    const scrollSpeed = s.s3 === null
      ? 'n/a (iframe)'
      : `${(s.s3.scroll_speed_avg_px_s ?? 0).toFixed(0)} px/s`;

    this.el.innerHTML =
      `<div style="color:${HEADER_COLOR};font-weight:bold;margin-bottom:6px;border-bottom:1px solid ${BORDER_COLOR};padding-bottom:4px">` +
      `CPMind Debug` +
      `</div>` +
      `<div style="margin-bottom:6px">` +
      viewportStatus +
      `</div>` +
      `<div style="color:${VALUE_COLOR};font-size:13px;font-weight:bold;margin-bottom:6px">` +
      `${timeInView.toFixed(1)}s в зоне видимости` +
      `</div>` +
      this.row('S1 time_in_view', timeInView.toFixed(2) + 's') +
      this.row('S1 mrc_compliant', timeInView >= 1 ? 'true' : 'false', timeInView < 1) +
      this.row('S1 max_continuous', s.maxContinuousViewSec.toFixed(2) + 's') +
      this.row('S1 visible_pct', s.visiblePixelsPct + '%') +
      this.row('S2 share_avg', this.getShareOfScreenAvg()) +
      this.row('S2 share_max', s.shareOfScreenMax.toFixed(1) + '%') +
      this.row('S3 scroll_speed', scrollSpeed, s.s3 === null) +
      this.row('S3 pauses', s.s3 !== null ? String(s.s3.pause_count ?? 0) : 'n/a') +
      this.row('S3 dir_changes', s.s3 !== null ? String(s.s3.direction_changes ?? 0) : 'n/a') +
      this.row('S4 tab_active', this.getTabActivePct(), s.tabSwitchesCount > 0) +
      this.row('S4 switches', String(s.tabSwitchesCount)) +
      this.row('S5 top_event', s5Event, s5Event === 'none') +
      this.row('Presence events', String(s.eventsDuringImpression), s.eventsDuringImpression === 0) +
      `<div style="color:${LABEL_COLOR};margin-top:6px;border-top:1px solid ${BORDER_COLOR};padding-top:4px;font-size:10px">` +
      `id: ${s.impressionId.slice(0, 8)}... · ${s.deviceType}` +
      `</div>`;
  }

  destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}