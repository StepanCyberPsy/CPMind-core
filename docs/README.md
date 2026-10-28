# CPMind — Документация

Навигационный индекс технических документов проекта. Все документы находятся в `docs/`; детали реализации пакетов — в `docs/packages_information/`.

---

## Архитектура

### [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Полное техническое описание системы. Содержит:
- Граф зависимостей всех пакетов с Mermaid-диаграммами
- Docker Compose топологию (7 сервисов + Selectel Object Storage + CDN)
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

### Общие компоненты

#### [`packages_information/SHARED_LOGIC.md`](./packages_information/SHARED_LOGIC.md)

`packages/shared` — единственный источник истины для всех пакетов. Содержит: экспортный контракт (разделение Zod-схем и TypeScript-типов, обязательность пересборки), все схемы (impression, delivery, placement, upload, ad_session, player, VAST и др.), скоринг-слой (формулы S1–S7, `computeEffectiveWeights`, `recomputeScoreFromNormalized`), 19 калибруемых констант тега (`DEFAULT_TAG_CONSTANTS`), сегментацию S6 и квантильную модель S2, IVT-классификацию (`classifyIvtSync`), контроль доступа (`USER_VISIBLE_IMPRESSION_FIELDS`), контракт частичного показа OMID (`OmidPartialImpressionSchema`) и полноту измерения (`resolveMeasurementLevel`).

#### [`packages_information/SDK_LOGIC.md`](./packages_information/SDK_LOGIC.md)

`packages/sdk` — SDK измерения показов. Два режима использования: legacy tag (прямые вызовы `initS1–S7`) и hosted creative (`prepareMeasurementSession()`). Содержит: `MeasurementSession` API и машину состояний (PREPARED→MEASURING→FINALIZING→FINALIZED→DESTROYED), инвариант §17 (явное время старта), `MeasurementSurface` (оркестратор S1–S7 + presence + unload), S6 accumulator (непрерывно просмотренный отрезок, `audibleTimeStart`, `muted_status`, `replay_count`), transport (`sendBeacon` → `fetch keepalive`, промежуточные снимки и кеширование финальных payload'ов), device fingerprint (`collectFpHash`, SHA-256 128 бит), `waitForFirstFrame` (`requestVideoFrameCallback` + timeupdate fallback).

### Backend

#### [`packages_information/BACKEND_LOGIC.md`](./packages_information/BACKEND_LOGIC.md)

`packages/backend` — Fastify API-сервер. Содержит: все эндпоинты по группам доступа (публичные: `/api/collect`, `/api/collect/omid`, `/e/:token`, `/vast/:token`, `/t/vast/:event`, `/api/delivery/event`; панельные; admin-only), полный pipeline обработки показа, delivery-сервисы (`resolveEmbedScript`, `resolveVastContext`, `createAdSession`, `processDeliveryEvent`, генерацию VAST InLine и Wrapper, блок верификации OMID), upload pipeline (`createUploadSession`, `completeUploadSession`, presigned URL / multipart), placement management (`ensureTagForUser`, `generateDeliveryToken`, `buildEmbedCode`), ротацию роликов, доменную политику и контекст hosted-показа, все сервисы с архитектурными решениями, приём частичных показов OMID (`/api/collect/omid`, `buildPartialImpressionRecord`), креатив из стороннего VAST-тега (`createExternalVastCreative`, политика внешних адресов), фоновые задачи (asset_gc, scheduled_deletion, IVT frequency, S1–S7 recalibration cron), миграции 0000–0033, схему БД.

### Media Worker

#### [`packages_information/MEDIA_WORKER_LOGIC.md`](./packages_information/MEDIA_WORKER_LOGIC.md)

`packages/media-worker` — автономный сервис обработки рекламных материалов. Содержит: PostgreSQL SKIP LOCKED очередь (claim query, lease + heartbeat механизм, recovery loop), полный processing pipeline (download → detectMime → processor → SHA-256 content-addressed → upload → publish → delete staging), процессоры по типу (static/sharp, gif, svg, html5/ZIP extract + bridge injection + пофайловая публикация, video/ffprobe + FFmpeg renditions + poster), ZIP security (path traversal, null bytes, symlinks, compression ratio static+runtime, total size), retry с exponential backoff + jitter, graceful shutdown (SIGTERM → 60s grace), Dockerfile (3-stage, non-root user, tmpfs 10GB).

### Delivery Runtime

#### [`packages_information/EMBED_LOGIC.md`](./packages_information/EMBED_LOGIC.md)

`packages/embed` — loader bundle (~minimal). Двухступенчатая загрузка: embed script (dynamic, no-store) → loader (CDN, 1yr cache) → runtime (CDN, 1yr cache). GTM-style `__CPMIND_QUEUE__`. Дедупликация через Set + DOM-проверку. `__CPMIND_LOADER__` guard. CDN_BASE_URL baked-in через esbuild `define`.

#### [`packages_information/DISPLAY_RUNTIME_LOGIC.md`](./packages_information/DISPLAY_RUNTIME_LOGIC.md)

`packages/display-runtime` — рендеринг и измерение display-форматов (`banner_static`, `banner_gif`, `banner_html5`). Flow: `createDisplaySessionContext` → `mountSurface` → `runStaticFlow`/`runHtml5Flow` → `render_confirmed` → ожидание области просмотра → `prepareDisplayMeasurement` → `startMeasurement(measurementStartedAt)`. Static flow: img + anchor, `toSafeHref` validation, `waitForImageLoaded` + `img.decode()` + rAF. HTML5 flow: iframe sandbox, handshake с creative-bridge, race condition prevention (src после listener). `measurementMode` поступает в конфигурации от backend.

#### [`packages_information/PLAYER_LOGIC.md`](./packages_information/PLAYER_LOGIC.md)

`packages/player` — VAST 4.3 player для `video_creative`. Три метода: `mountOutstream` (IntersectionObserver lifecycle, state machine: mounting→loading→eligible→playing→paused_by_scroll→completed/closed), `mountSticky` (закреплённая поверхность) и `attachNative` (привязка к content video, поддержка pre/mid/post/pause-roll). Содержит: VAST fetch (manual timeout, Safari 14 compat — нет `AbortSignal.any()`), parse (DOMParser, InLine only), media selection (DPR-aware, CDN_HOSTNAME trust check), autoplay policy (muted fallback, Coalition for Better Ads), VAST tracking (quartile fire-and-forget keepalive, `vastFired` Set), SDK bridge (`setPendingSource` 100ms attribution window, `VideoPlaybackState`, передача событий в SDK, `detectAudioConnection`), UI (compact mode 400px, auto-hide controls 3s). `measurementMode: 'full_cpmind_player'`.

#### [`packages_information/OMID_LOGIC.md`](./packages_information/OMID_LOGIC.md)

`packages/omid` — скрипт верификации IAB OMID. Исполняется плеером площадки из блока `<AdVerifications>` VAST-ответа — единственный стандартный путь измерения, когда на странице издателя нет кода CPMind. Содержит: рукопожатие с клиентом верификации (`registerSessionObserver`, ключ вендора), определение уровня доступа (`resolveAccessLevel`, `friendlyToTop`), две ветки измерения (полная через `prepareMeasurementSession` SDK и ограниченная — собственный накопитель S1, S2, S4, S5, S6), доставку параметров через `<VerificationParameters>`, отправку на `/api/collect/omid`, два бандла IIFE и задел SIMID 1.2 (не подключён). `measurementMode: 'vast_omid'`.

#### [`packages_information/CREATIVE_BRIDGE_LOGIC.md`](./packages_information/CREATIVE_BRIDGE_LOGIC.md)

`packages/creative-bridge` — IIFE, инжектируется media-worker'ом в HTML5-креативы. postMessage протокол: `cpmind:ready` → `cpmind:init` → `cpmind:click`/`cpmind:activity`/`cpmind:interaction`/`cpmind:destroy`. Валидация источника через `event.source === window.parent` (event.origin всегда `'null'` в opaque sandbox). AbortController cleanup при destroy.

### Frontend

#### [`packages_information/FRONTEND_LOGIC.md`](./packages_information/FRONTEND_LOGIC.md)

`packages/frontend` — Next.js 14 App Router панель. Содержит: ролевой роутинг (admin / user / workspace route group), middleware, авторизацию (cookie forwarding, `decodeTokenUuid`, `decodeTokenRole`), workspace flow (campaigns → upload → creatives → placements → embed code), настройки форматов и наборов роликов, upload pipeline (`UploadFlow` с выбором источника креатива — файл или сторонний VAST-тег, XHR + progress, `ProcessingPoller`), delivery (`PlacementEmbedModal`), отображение полноты измерения показа, весь lib-слой (`use-popover` — position: fixed + почему не CSS Anchor Positioning, `parseListSearchParams`, `SIGNALS_META`, `buildSegmentColorMap`, `upload-api.ts` с PART_CONCURRENCY=4), все страницы и компоненты, TypeScript-конфигурацию (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), историю диагностики зависания (IntersectionObserver + бесконечный цикл), таблицу технического долга.

### Legacy Tag

#### [`packages_information/TAG_LOGIC.md`](./packages_information/TAG_LOGIC.md)

`packages/tag` — **legacy компонент**. Актуален для размещений, созданных до hosted creative delivery. Два режима сборки (CLI dev / runtime backend через esbuild JS API). Содержит: DOM discovery через `querySelectorAll` + `MutationObserver`, `WeakSet` idempotency guard, S6 legacy DOM adapter (`initS6Legacy` — находит `<video>` в контейнере, event listeners, autoplay guard, `resetSegmentS6Legacy` через WeakMap resetters), делегирование S1–S7 и transport в `@cpmind/sdk`, константы через esbuild `define` (`__CPMIND_CONSTANTS__`), конфигурацию из data-атрибутов.

---

## Размещение и развёртывание

### [`PLACEMENT.md`](./PLACEMENT.md)

Руководство по размещению рекламных плейсментов — для технических и нетехнических специалистов. Содержит: пошаговое создание плейсмента через личный кабинет (кампания → загрузка → плейсмент → embed-код), объяснение всех форматов (display: static/gif/html5; видео: outstream, instream pre/mid/post-roll, skippable/non-skippable, VAST URL, креатив из стороннего VAST-тега), детальные инструкции по платформам: **Tilda** (блок T123 / настройки сайта → перед `</body>`), **WordPress** (WP Code plugin / `functions.php` `wp_footer` hook / блок «Пользовательский HTML»), **1С-Битрикс** (пользовательские скрипты / `footer.php` / HTML-блок), **кастомный код** (чистый HTML, PHP с `htmlspecialchars`, React с `useEffect`, Next.js App Router с `<Script strategy="lazyOnload">`, Python Flask/Django с Jinja2). Раздел миграции со старой интеграции (data-атрибуты → embed-скрипт).

### [`DEPLOYMENT.md`](./DEPLOYMENT.md)

Production-развёртывание: подготовка сервера, переменные окружения (полная матрица), первый запуск, обновление, SSL (Let's Encrypt + certbot), бэкапы, мониторинг.

---

## Технический долг и история

### [`development_history/TECH_DEBT.md`](./development_history/TECH_DEBT.md)

Все открытые пункты технического долга с датами и источниками: незакрытые пункты клиентского тестирования, согласованные отступления от ТЗ, архитектурные ограничения.

### [`development_history/BUG_FIXING_V1.md`](./development_history/BUG_FIXING_V1.md)

Итерация 1 (21.06.2026). Исправлены: P-16 (зона скролла), P-01/P-02 (double penalty streaks/mobile-инерция), P-18 частично (gesturechange scope), P-14 (S4 visibilityState), P-06 (валидация campaign_id/creative_id). В техдолге: P-17, P-03, P-15, P-18 калибровочная часть.

### [`development_history/BUG_FIXING_V2.md`](./development_history/BUG_FIXING_V2.md)

Итерация 2 (23.06.2026). Реализованы: P-18 полностью (`SWIPE_MIN_DISTANCE_PX`, `GESTURE_SCALE_DELTA_MIN`), P-15 (сегментация показа по простою: `segment.ts`, `session_group_id`/`segment_index`, миграция 0002), P-05 (`computeActiveTimeMsInRange`), баг `presence` в `signals_raw`. Открытые: P-17, P-03.