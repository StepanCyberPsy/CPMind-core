/**
 * S7 — Page Context + Position + Clutter §4.6
 *
 * Собирает статические поля при инициализации:
 *   - creative_position_y_px
 *   - page_height_total_px
 *   - is_above_the_fold
 *
 * Сэмплирует каждую секунду:
 *   - competing_ads_visible (среднее за показ -> берем последнее актуальное)
 *   - viewability_persistence (попадает ли баннер в viewport)
 *
 * Эвристика competing_ads описана в docs/TAG_INTEGRATION.md согласно §4.6 ТЗ.
 */

import type { Session, TagConfig } from '../types.js';
import { S7_SAMPLE_INTERVAL_MS } from '../constants.js';

const AD_SELECTORS = [
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="googletagservices.com"]',
  'iframe[src*="adfox.ru"]',
  'iframe[src*="begun.ru"]',
  'iframe[src*="criteo.com"]',
  'iframe[src*="rtbhouse.com"]',
  'iframe[src*="yandex.ru/adv"]',
  'iframe[src*="ssp.rambler.ru"]',
  '[class*="adsbygoogle"]',
  '[id*="yandex_rtb"]',
  '[class*="banner-ad"]',
  '[class*="ad-banner"]',
  '[class*="advertisement"]',
  'ins.adsbygoogle',
];

/**
 * Проверяет виден ли элемент в viewport
 * Элемент видим если его rect пересекается с viewport и имеет ненулевые размеры
 */
function isElementInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/**
 * Считает количество рекламных элементов одновременно видимых в viewport
 * Исключает сам баннер CPMind.
 * Описание эвристики согласно
 */
function countCompetingAds(creativeEl: HTMLElement): number {
  let count = 0;

  for (const selector of AD_SELECTORS) {
    let elements: NodeListOf<Element>;
    try {
      elements = document.querySelectorAll(selector);
    } catch {
      continue;
    }

    for (const el of elements) {
      if (el === creativeEl || creativeEl.contains(el)) continue;
      if (isElementInViewport(el)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Вычисляет Y-координату креатива относительно начала страницы
 * Использует scrollY + getBoundingClientRect для точности
 */
function getCreativePositionY(creativeEl: HTMLElement): number {
  const rect = creativeEl.getBoundingClientRect();
  return Math.round(rect.top + window.scrollY);
}

/**
 * Определяет is_above_the_fold на момент загрузки страницы
 * баннер виден без скролла при загрузке
 */
function checkIsAboveTheFold(creativeEl: HTMLElement): boolean {
  const rect = creativeEl.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

export function initS7(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  session.pageHeightTotalPx = Math.max(
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight,
    document.body.scrollHeight,
    document.body.offsetHeight,
  );

  // creative_position_y_px: Y от начала страницы
  session.creativePositionYPx = getCreativePositionY(creativeEl);

  // is_above_the_fold: виден без скролла при загрузке
  session.isAboveTheFold = checkIsAboveTheFold(creativeEl);

  // Начальный подсчет competing ads
  session.competingAdsVisible = countCompetingAds(creativeEl);

  if (cfg.debug) {
    console.log('[CPMind S7] Initial state:', {
      creativePositionYPx: session.creativePositionYPx,
      pageHeightTotalPx: session.pageHeightTotalPx,
      isAboveTheFold: session.isAboveTheFold,
      competingAdsVisible: session.competingAdsVisible,
      relativePosition: (session.creativePositionYPx / session.pageHeightTotalPx).toFixed(3),
    });
  }

  const intervalId = setInterval(() => {
    // viewability_persistence
    // true если баннер сейчас в viewport (≥50% пикселей)
    // viewStart !== null означает что IntersectionObserver зафиксировал вход
    const isInView = session.viewStart !== null;
    session.viewabilityPersistenceSamples.push(isInView);

    // competing_ads_visible
    session.competingAdsVisible = countCompetingAds(creativeEl);

    // page_height_total_px
    session.pageHeightTotalPx = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      session.pageHeightTotalPx, // не уменьшаем
    );

    // creative_position_y_px
    session.creativePositionYPx = getCreativePositionY(creativeEl);

    if (cfg.debug) {
      const persistenceCount = session.viewabilityPersistenceSamples.filter(Boolean).length;
      const totalSamples = session.viewabilityPersistenceSamples.length;
      const persistencePct = totalSamples > 0
        ? ((persistenceCount / totalSamples) * 100).toFixed(1)
        : '0.0';

      console.log('[CPMind S7] Sample:', {
        isInView,
        persistencePct: persistencePct + '%',
        competingAdsVisible: session.competingAdsVisible,
        pageHeightTotalPx: session.pageHeightTotalPx,
      });
    }
  }, S7_SAMPLE_INTERVAL_MS);

  window.addEventListener('pagehide', () => {
    clearInterval(intervalId);
  }, { once: true });
}

export function resetSegmentS7(session: Session): void {
  session.viewabilityPersistenceSamples = [];
}