# CPMind — Документация

Навигационный индекс технических документов проекта. Все документы находятся в `docs/`; детали реализации пакетов — в `docs/packages_information/`.

---

## Архитектура

### [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Полное техническое описание системы. Содержит:
- Граф зависимостей всех пакетов с Mermaid-диаграммами
- Docker Compose топологию (6 сервисов + Yandex Cloud Object Storage + CDN)
- NGINX и доменную модель (4 домена: app / delivery / creative / cdn)
- Hosted Creative Delivery flow (embed → loader → runtime → SDK → collect)
- Upload и Media Processing pipeline (presigned URL → staging → media-worker → delivery)
- Legacy Tag flow (DOM discovery → сигналы → sendBeacon → scoring)
- Pipeline расчёта Score (кэппинг → нормализация → веса → F_Presence → IVT)
- Сигналы S1–S7: модели нормализации, сегментация, cron-расписание рекалибровки
- Формулу CPMind Score (banner / video) с таблицей интерпретации
- IVT-детекцию: GIVT, SIVT-правила, confidence-агрегацию, batch fp_hash анализ
- Схему БД: ER-диаграмма, ключевые таблицы, индексы, retention-политики
- Безопасность, технический стек, конфигурацию монорепо, известные ограничения

**Читать первым** при онбординге или возврате к проекту после перерыва.

---

## Пакеты — детали реализации

Документация каждого пакета монорепо. Читать после `ARCHITECTURE.md` при работе с конкретным компонентом.

### Инфраструктура

#### [`packages_information/INFRA_LOGIC.md`](./packages_information/INFRA_LOGIC.md)

Производственная инфраструктура: Terraform (3 бакета YC Object Storage, 2 IAM сервисных аккаунта, Yandex CDN, DNS), NGINX (4 vhost, rate limiting, TLS, security headers), Docker Compose (6 сервисов, volumes, healthcheck-цепочка), матрица переменных окружения, IAM permissions, CORS-политики, операционные процедуры, известные ограничения.

### Общие компоненты

#### [`packages_information/SHARED_LOGIC.md`](./packages_information/SHARED_LOGIC.md)

`packages/shared` — единственный источник истины для всех пакетов. Содержит: экспортный контракт (разделение Zod-схем и TypeScript-типов, обязательность пересборки), все схемы (impression, delivery, placement, upload, ad_session, player, VAST и др.), скоринг-слой (формулы S1–S7, `computeEffectiveWeights`, `recomputeScoreFromNormalized`), 19 калибруемых констант тега (`DEFAULT_TAG_CONSTANTS`), IVT-классификацию (`classifyIvtSync`), контроль доступа (`USER_VISIBLE_IMPRESSION_FIELDS`).

#### [`packages_information/SDK_LOGIC.md`](./packages_information/SDK_LOGIC.md)

`packages/sdk` — SDK измерения показов. Два режима использования: legacy tag (прямые вызовы `initS1–S7`) и hosted creative (`prepareMeasurementSession()`). Содержит: `MeasurementSession` API и машину состояний (PREPARED→MEASURING→FINALIZING→FINALIZED→DESTROYED), инвариант §17 (`renderConfirmedAt`), `MeasurementSurface` (оркестратор S1–S7 + presence + unload), S6 accumulator (pure state machine, `audibleTimeStart`, `muted_status` ternary, `replay_count`), transport (`sendBeacon` → `fetch keepalive` fallback, `WeakMap` дедупликация финальных payload'ов), device fingerprint (`collectFpHash`, SHA-256 128 бит), `waitForFirstFrame` (`requestVideoFrameCallback` + timeupdate fallback).

### Backend

#### [`packages_information/BACKEND_LOGIC.md`](./packages_information/BACKEND_LOGIC.md)

`packages/backend` — Fastify API-сервер. Содержит: все эндпоинты по группам доступа (публичные: `/api/collect`, `/e/:token`, `/vast/:token`, `/t/vast/:event`, `/api/delivery/event`; панельные; admin-only), полный pipeline обработки показа, delivery-сервисы (`resolveEmbedScript`, `resolveVastContext`, `createAdSession`, `processDeliveryEvent`, VAST генерацию), upload pipeline (`createUploadSession`, `completeUploadSession`, presigned URL / multipart), placement management (`ensureTagForUser`, `generateDeliveryToken`, `buildEmbedCode`), все сервисы с архитектурными решениями, фоновые задачи (asset_gc, scheduled_deletion, IVT frequency, S1–S7 recalibration cron), миграции 0000–0021, схему БД.

### Media Worker

#### [`packages_information/MEDIA_WORKER_LOGIC.md`](./packages_information/MEDIA_WORKER_LOGIC.md)

`packages/media-worker` — автономный сервис обработки рекламных материалов. Содержит: PostgreSQL SKIP LOCKED очередь (claim query, lease + heartbeat механизм, recovery loop), полный processing pipeline (download → detectMime → processor → SHA-256 content-addressed → upload → publish → delete staging), процессоры по типу (static/sharp, gif, svg, html5/ZIP extract + bridge injection + repack, video/ffprobe + FFmpeg renditions + poster), ZIP security (path traversal, null bytes, symlinks, compression ratio static+runtime, total size), retry с exponential backoff + jitter, graceful shutdown (SIGTERM → 60s grace), Dockerfile (3-stage, non-root user, tmpfs 10GB).

### Delivery Runtime

#### [`packages_information/EMBED_LOGIC.md`](./packages_information/EMBED_LOGIC.md)

`packages/embed` — loader bundle (~minimal). Двухступенчатая загрузка: embed script (dynamic, no-store) → loader (CDN, 1yr cache) → runtime (CDN, 1yr cache). GTM-style `__CPMIND_QUEUE__`. Дедупликация через Set + DOM-проверку. `__CPMIND_LOADER__` guard. CDN_BASE_URL baked-in через esbuild `define`.

#### [`packages_information/DISPLAY_RUNTIME_LOGIC.md`](./packages_information/DISPLAY_RUNTIME_LOGIC.md)

`packages/display-runtime` — рендеринг и измерение display-форматов (`banner_static`, `banner_gif`, `banner_html5`). Flow: `createDisplaySessionContext` → `mountSurface` → `runStaticFlow`/`runHtml5Flow` → `render_confirmed` → `prepareDisplayMeasurement` → `startMeasurement(renderConfirmedAt)`. Static flow: img + anchor, `toSafeHref` validation, `waitForImageLoaded` + `img.decode()` + rAF. HTML5 flow: iframe sandbox, handshake с creative-bridge, race condition prevention (src после listener). `measurementMode: 'full_direct_display'`.

#### [`packages_information/PLAYER_LOGIC.md`](./packages_information/PLAYER_LOGIC.md)

`packages/player` — VAST 4.3 player для `video_creative`. Два режима: `mountOutstream` (IntersectionObserver lifecycle, state machine: mounting→loading→eligible→playing→paused_by_scroll→completed/closed) и `attachNative` (content video play event, iOS Safari defer pause). Содержит: VAST fetch (manual timeout, Safari 14 compat — нет `AbortSignal.any()`), parse (DOMParser, InLine only), media selection (DPR-aware, CDN_HOSTNAME trust check), autoplay policy (muted fallback, Coalition for Better Ads), VAST tracking (quartile fire-and-forget keepalive, `vastFired` Set), SDK bridge (`setPendingSource` 100ms attribution window, `VideoPlaybackState`, S6 accumulator через explicit calls, `detectAudioConnection`), UI (compact mode 400px, auto-hide controls 3s). `measurementMode: 'full_cpmind_player'`.

#### [`packages_information/CREATIVE_BRIDGE_LOGIC.md`](./packages_information/CREATIVE_BRIDGE_LOGIC.md)

`packages/creative-bridge` — ~0.8 KB IIFE, инжектируется media-worker'ом в HTML5-креативы. postMessage протокол: `cpmind:ready` → `cpmind:init` → `cpmind:click`/`cpmind:destroy`. Валидация источника через `event.source === window.parent` (event.origin всегда `'null'` в opaque sandbox). AbortController cleanup при destroy.

### Frontend

#### [`packages_information/FRONTEND_LOGIC.md`](./packages_information/FRONTEND_LOGIC.md)

`packages/frontend` — Next.js 14 App Router панель. Содержит: ролевой роутинг (admin / user / workspace route group), middleware, авторизацию (cookie forwarding, `decodeTokenUuid`, `decodeTokenRole`), workspace flow (campaigns → upload → creatives → placements → embed code), upload pipeline (`UploadFlow`, XHR + progress, `ProcessingPoller`), delivery (`PlacementEmbedModal`), весь lib-слой (`use-popover` — position: fixed + почему не CSS Anchor Positioning, `parseListSearchParams`, `SIGNALS_META`, `buildSegmentColorMap`, `upload-api.ts` с PART_CONCURRENCY=4), все страницы и компоненты, TypeScript-конфигурацию (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), историю диагностики зависания (IntersectionObserver + бесконечный цикл), таблицу технического долга.

### Legacy Tag

#### [`packages_information/TAG_LOGIC.md`](./packages_information/TAG_LOGIC.md)

`packages/tag` — **legacy компонент**. Актуален для размещений, созданных до hosted creative delivery. Два режима сборки (CLI dev / runtime backend через esbuild JS API). Содержит: DOM discovery через `querySelectorAll` + `MutationObserver`, `WeakSet` idempotency guard, S6 legacy DOM adapter (`initS6Legacy` — находит `<video>` в контейнере, event listeners, autoplay guard, `resetSegmentS6Legacy` через WeakMap resetters), делегирование S1–S7 и transport в `@cpmind/sdk`, константы через esbuild `define` (`__CPMIND_CONSTANTS__`), конфигурацию из data-атрибутов.

---

## Размещение и развёртывание

### [`PLACEMENT.md`](./PLACEMENT.md)

Руководство по размещению рекламных плейсментов — для технических и нетехнических специалистов. Содержит: пошаговое создание плейсмента через личный кабинет (кампания → загрузка → плейсмент → embed-код), объяснение всех форматов (display: static/gif/html5; видео: outstream, instream pre/mid/post-roll, skippable/non-skippable, VAST URL), детальные инструкции по платформам: **Tilda** (блок T123 / настройки сайта → перед `</body>`), **WordPress** (WP Code plugin / `functions.php` `wp_footer` hook / блок «Пользовательский HTML»), **1С-Битрикс** (пользовательские скрипты / `footer.php` / HTML-блок), **кастомный код** (чистый HTML, PHP с `htmlspecialchars`, React с `useEffect`, Next.js App Router с `<Script strategy="lazyOnload">`, Python Flask/Django с Jinja2). Раздел миграции со старой интеграции (data-атрибуты → embed-скрипт).

### [`DEPLOYMENT.md`](./DEPLOYMENT.md)

Production-развёртывание: подготовка сервера, переменные окружения (полная матрица), первый запуск, обновление, SSL (Let's Encrypt + certbot), бэкапы, мониторинг.

---

## Технический долг и история

### [`TECH_DEBT.md`](./TECH_DEBT.md)

Все открытые пункты технического долга с датами и источниками: незакрытые пункты клиентского тестирования, согласованные отступления от ТЗ, архитектурные ограничения.

### [`development_history/BUG_FIXING_V1.md`](./development_history/BUG_FIXING_V1.md)

Итерация 1 (21.06.2026). Исправлены: P-16 (зона скролла), P-01/P-02 (double penalty streaks/mobile-инерция), P-18 частично (gesturechange scope), P-14 (S4 visibilityState), P-06 (валидация campaign_id/creative_id). В техдолге: P-17, P-03, P-15, P-18 калибровочная часть.

### [`development_history/BUG_FIXING_V2.md`](./development_history/BUG_FIXING_V2.md)

Итерация 2 (23.06.2026). Реализованы: P-18 полностью (`SWIPE_MIN_DISTANCE_PX`, `GESTURE_SCALE_DELTA_MIN`), P-15 (сегментация показа по простою: `segment.ts`, `session_group_id`/`segment_index`, миграция 0002), P-05 (`computeActiveTimeMsInRange`), баг `presence` в `signals_raw`. Открытые: P-17, P-03.