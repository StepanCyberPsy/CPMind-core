import type { Session, TagConfig } from '../types.js';
import { buildPayload } from '../session.js';

export function finalizeAndSend(
  session: Session,
  cfg: TagConfig,
  isFinal: boolean,
): void {
  if (session.sent) return;
  if (session.timestampStart === 0) return;

  session.timestampEnd = Date.now();
  session.sent = isFinal;

  const payload = buildPayload(session, cfg);

  if (cfg.debug) {
    console.log('[CPMind] Final payload:', JSON.stringify(payload, null, 2));
  }

  sendPayload(payload, cfg.endpoint);
}

function sendPayload(payload: unknown, endpoint: string): void {
  const body = JSON.stringify(payload);

  if (typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    const queued = navigator.sendBeacon(endpoint, blob);

    if (queued) return;
    // sendBeacon вернул false — очередь переполнена (редко)
    // Fallback: keepalive fetch
  }

  // keepalive fetch — fallback для браузеров без sendBeacon и для случая когда sendBeacon отклонен
  fetchKeepalive(body, endpoint);
}

function fetchKeepalive(body: string, endpoint: string): void {
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Страница закрывается - сетевые ошибки нормальны, не логируем
  });
}

export function attachUnloadHandlers(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
  cleanupPresence?: () => void,
): void {

  // 1. Click — Mobile Safari: отправляем в момент клика
  creativeEl.addEventListener('click', (e) => {
    if (session.s6 !== null) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-cpmind-skip]') !== null) {
        session.s6.skipped = true;
      }
    }
    finalizeAndSend(session, cfg, true);
  }, { capture: true });
  // capture: true — обрабатываем до того как событие дойдет до ссылки внутри баннера

  // 2. visibilitychange -> hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      finalizeAndSend(session, cfg, true);
      cleanupPresence?.();
    }
  });

  // 3. pagehide — финальный резерв
  window.addEventListener('pagehide', () => {
    finalizeAndSend(session, cfg, true);
    cleanupPresence?.();
  });
}