# TAG_LOGIC.md — `packages/tag`

## Обзор

`@cpmind/tag` — legacy JS-тег для прямого встраивания на страницу издателя. Используется в классическом (не hosted) flow: издатель размещает HTML-контейнер с атрибутами и подключает JS-файл тега. Вся логика измерения (S1–S7, presence, transport) делегирована `@cpmind/sdk` — тег является тонкой оберткой над SDK с DOM-discovery и S6 legacy адаптером.

**Статус:** legacy компонент. Основной flow продукта переведён на hosted creative delivery через `@cpmind/display-runtime` и `@cpmind/player`. Tag используется для обратной совместимости с размещениями сделанными до hosted delivery.

---

## Структура пакета

```txt
    ├── [DIR] tag
        ├── [FILE] build.ts
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [FILE] config.ts
            ├── [FILE] constants.ts
            ├── [FILE] index.ts
            ├── [DIR] signals
                ├── [FILE] s6_legacy.ts
            ├── [FILE] types.ts
        ├── [FILE] tsconfig.json
        ├── [FILE] tsconfig.node.json
```

---

## Сборка — два режима

### Dev (локальная CLI-сборка)

```bash
pnpm --filter @cpmind/tag build
# или с hot-reload:
pnpm --filter @cpmind/tag dev
```

Выходной файл: `packages/tag/dist/cpmind-tag.min.js`, version=`'dev'`. Подставляет `DEFAULT_TAG_CONSTANTS` из `@cpmind/shared` через esbuild `define`. Используется для локальной отладки.

### Production (runtime-сборка backend-ом)

Backend вызывает `buildTagBundle()` из `packages/tag/build.ts` через esbuild JS API при создании версии констант (`POST /api/tag-constants`). Подставляет конкретный набор калиброванных констант и версию через `define`. Артефакт пишется в Docker volume `tag_dist`, откуда NGINX раздаёт по адресу:

```
https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js
```

Несколько версий сосуществуют на диске одновременно. `dist/` не коммитится в git.

### Константы через `define`, не через HTTP

Все калиброванные константы (`TagConstantsValues`) и версия (`__CPMIND_TAG_VERSION__`) подставляются esbuild через `define` — текстовая замена идентификатора на JSON-литерал при бандлинге. Нет сетевого запроса при инициализации тега, нет зависимости от доступности сервера в момент загрузки.

```typescript
// constants.ts — не глобальные переменные браузера, а esbuild define
declare const __CPMIND_CONSTANTS__: TagConstantsValues;
declare const __CPMIND_TAG_VERSION__: string;

export const PRESENCE_IDLE_TIMEOUT_MS = __CPMIND_CONSTANTS__.PRESENCE_IDLE_TIMEOUT_MS;
export const S1_VIEWPORT_THRESHOLDS   = __CPMIND_CONSTANTS__.S1_VIEWPORT_THRESHOLDS;
// ... и т.д. для всех 19 констант
```

Чтение из `__CPMIND_CONSTANTS__` через модуль `constants.ts` создаёт именованные exports — SDK-функции принимают `SdkSignalConfig.constants` с типизированными полями, не сырой `__CPMIND_CONSTANTS__` объект.

### Целевые браузеры

`TAG_BUILD_TARGETS` из `@cpmind/shared` — Chrome 90+, Firefox 90+, Safari 14+, Edge 90+. Общий source of truth между tag и backend.

---

## Встраивание на страницу издателя

> **Legacy flow.** Актуален только для размещений созданных до внедрения hosted creative delivery. В новом flow издатель вставляет один `<script async src="https://delivery.cpmind.tech/e/{token}.js">` — контейнер монтируется embed script'ом автоматически.

В legacy flow издатель размещает два фрагмента вручную:

```html
<!-- 1. Контейнер баннера — размечается издателем -->
<div
  data-cpmind-creative
  data-tag-uuid="UUID_тега"
  data-campaign-id="campaign_abc123"
  data-creative-id="banner_xyz"
  data-creative-type="banner_static"
  data-endpoint="https://app.cpmind.tech/api/collect"
  data-publisher-domain="yoursite.com"
  data-skippable="false"
  style="width: 300px; height: 250px;">
  <!-- Контент баннера -->
</div>

<!-- 2. Тег — раздаётся с app.cpmind.tech/tag/ -->
<script async src="https://app.cpmind.tech/tag/cpmind-tag_v3.min.js"></script>
```

### Атрибуты контейнера

| Атрибут | Обязательный | Валидация | Назначение |
|---|---|---|---|
| `data-cpmind-creative` | да | presence | Маркер контейнера для discovery |
| `data-tag-uuid` | да | UUID regex | Идентификатор тега |
| `data-campaign-id` | да | non-empty | Идентификатор кампании |
| `data-creative-id` | да | non-empty | Идентификатор баннера |
| `data-creative-type` | да | enum | `banner_static`, `banner_gif`, `banner_html5`, `video_creative` |
| `data-endpoint` | да | non-empty | URL для отправки импрешена |
| `data-publisher-domain` | нет | trim | Домен площадки (fallback: `document.referrer` → `location.hostname`) |
| `data-skippable` | нет | `'true'/'false'` | Признак пропускаемого видео |
| `data-debug` | нет | `'true'` | Включает debug overlay |

`parseConfig()` возвращает `null` при отсутствии обязательных атрибутов или невалидном UUID — контейнер пропускается с `console.warn`.

---

## Жизненный цикл показа

### Discovery и инициализация

```
init() при загрузке тега
│
├─ querySelectorAll('[data-cpmind-creative]')
│    └─ initializeContainer(el) для каждого
│
└─ MutationObserver на document.documentElement
     childList: true, subtree: true — новые контейнеры
     attributes: true, attributeFilter — изменение data-атрибутов
```

`WeakSet<HTMLElement> initializedContainers` — idempotent guard. Один контейнер инициализируется один раз даже при повторных MutationObserver срабатываниях.

### `initializeContainer(container)`

```
parseConfig(container) → TagConfig | null
    │
createSession({ publisherDomain? })  ← SDK
    │
collectFpHash() → session.fpHash      ← async, не блокирует
    │
initS1(container, session, sdkConfig) ← SDK: IntersectionObserver
initS2(container, session, sdkConfig) ← SDK: share of screen sampling
initS3(container, session, sdkConfig) ← SDK: scroll velocity
initS4(session, sdkConfig)            ← SDK: tab activity
initS5(container, session, sdkConfig) ← SDK: interaction events
initS6Legacy(container, session)      ← TAG: S6 legacy DOM adapter
initS7(container, session, sdkConfig) ← SDK: page context
    │
initPresence(session, sdkConfig, onIdle) ← SDK: presence timer
    │  onIdle = () => {
    │      resetSegmentS6Legacy(container)
    │      startNewSegment(container, session, sdkConfig, meta, presenceHandle)
    │  }
    │
if (cfg.debug) new DebugOverlay(container, session) ← SDK
    │
attachUnloadHandlers(container, session, meta, sdkConfig, presenceHandle.cleanup) ← SDK
```

Всё измерение кроме S6 обработки видео — в SDK. Tag отвечает только за: discovery, parseConfig, создание `SdkSignalConfig` из baked-in констант, `initS6Legacy`.

---

## S6 Legacy адаптер (`signals/s6_legacy.ts`)

В отличие от `@cpmind/player` где S6 accumulator управляется явными вызовами из player события, legacy tag обнаруживает `<video>` элемент в DOM и навешивает event listeners напрямую.

### `initS6Legacy(creativeEl, session)`

```
videoEl = creativeEl.querySelector('video')
если не найден → session.s6 = null, return

state = createS6AccumulatorState('unknown', videoEl.volume)  ← SDK
session.s6 = state

// Autoplay guard: если видео уже играет до initS6Legacy
if (!videoEl.paused && !videoEl.ended):
    onS6Play(state, videoEl.muted, videoEl.volume)

detectAudioConnection() → onS6AudioConnectionDetected()  ← async

Listeners на videoEl:
    'loadedmetadata' → onS6LoadedMetadata(state, duration)
    'play'           → onS6Play(state, muted, volume)
    'pause'          → onS6Pause(state)
    'ended'          → onS6Ended(state, muted, volume)
    'timeupdate'     → onS6TimeUpdate(state, currentTime, muted, volume)
    'volumechange'   → onS6VolumeChange(state, ..., previousMuted)
    'seeking'        → onS6Seeking(state)
    'seeked'         → onS6Seeked(state, currentTime)

[data-cpmind-skip] click → onS6Skip(state)

resetters.set(creativeEl, resetFn)  ← WeakMap для resetSegmentS6Legacy
```

`previousMuted` — локальная переменная в closure, обновляется после каждого `volumechange` и `play`. Передаётся в `onS6VolumeChange` как 6-й аргумент для корректного расчёта `unmuted_by_user`.

### `resetSegmentS6Legacy(creativeEl)`

Вызывается из `onIdle` перед `startNewSegment`. Берёт сохранённый `resetFn` из WeakMap и вызывает `resetS6Accumulator(state, currentTime, paused, ended, muted, volume)` с актуальным состоянием video element. Event listeners не пересоздаются — `state` мутируется in-place, listeners продолжают работать со сброшенным state.

### Отличие от Player S6

| Аспект | Tag (s6_legacy) | Player (sdk_bridge) |
|---|---|---|
| Источник событий | DOM video listeners | Explicit вызовы из player.ts |
| `previousMuted` | closure в initS6Legacy | `VideoPlaybackState` в SdkBridge |
| Autoplay guard | `!paused && !ended` при init | Через `onS6Play` при `handle.play()` |
| Skip detection | `[data-cpmind-skip]` click | `onS6Skip` при `finishOnce({ type: 'skipped' })` |

---

## Сегментация при присутствии

F_Presence (в SDK) отслеживает активность пользователя. При idle (нет событий дольше `PRESENCE_IDLE_TIMEOUT_MS`):

```
onIdle() →
    resetSegmentS6Legacy(container)  ← сброс S6 in-place
    startNewSegment(container, session, sdkConfig, meta, presenceHandle)
        │
        finalizeAndSend(session, meta, config, isFinal=false)
        resetSessionForNewSegment(session)  ← новый impressionId, segmentIndex++
        presenceHandle.resetSegment()
        resetSegmentS1..S7()
        session.s6 сбрасывается через resetS6Accumulator
```

`sessionGroupId` не сбрасывается — связывает все сегменты одного показа на backend. `fpHash` не сбрасывается — fingerprint постоянен в рамках страницы.

---

## Архитектурные решения

**IIFE-изоляция.** Весь код завёрнут в `(function(doc) { ... })(document)`. Никаких глобальных переменных. Ошибка внутри тега не достигает `window.onerror` страницы издателя.

**Делегирование SDK.** S1–S7 (кроме S6 legacy adapter), presence, session, transport, fingerprint, debug overlay — всё в `@cpmind/sdk`. Tag содержит минимум кода: discovery, config parsing, SdkSignalConfig construction, S6 DOM binding.

**`@cpmind/sdk` как dependency, `@cpmind/shared` как devDependency.** SDK инлайнится в bundle при сборке. Shared используется только для типов на этапе компиляции — в выходном бандле нет следов shared-пакета.

**WeakSet idempotency.** `initializedContainers` — один контейнер инициализируется один раз. MutationObserver может срабатывать многократно при изменении атрибутов — guard критичен для правильного подсчёта показов.

**MutationObserver вместо DOMContentLoaded.** Тег работает корректно при любом порядке загрузки: async script может загрузиться до или после рендера контейнеров. MutationObserver обрабатывает оба случая.

**S6 listeners не пересоздаются при сегментации.** `resetS6Accumulator` мутирует state in-place, listeners на video element сохраняются. Аналогично S1 (observer остаётся) и S2–S5 (document/window listeners сохраняются).

**Autoplay guard в `initS6Legacy`.** Видео может начать воспроизведение до загрузки тега (autoplay). Guard `!videoEl.paused && !videoEl.ended` при инициализации вызывает `onS6Play` если видео уже играет — `play_initiated` не будет пропущен.

**`collectFpHash()` — fire-and-forget.** `void collectFpHash().then(hash => session.fpHash = hash)` не блокирует инициализацию. При закрытии вкладки в первые ~100ms хэш может не успеть вычислиться — `fp_hash` будет `null` в payload. Принятый trade-off: не задерживать event-listeners ради IVT-сигнала.

**MRC критерий системы: 75% / 2 секунды.** S1 использует `intersectionRatio >= 0.75` и `segmentSec >= 2.0` для `mrcCompliant = true`. Это строже стандартного MRC (50%/1s) — намеренная бизнес-логика для повышения качества данных. Не подлежит изменению.

**`publisher_domain` fallback цепочка.** `getPublisherDomain(configDomain?)` из SDK: config → `document.referrer` hostname → `location.hostname` → детерминированный хэш. Детерминированность критична: один клиент на одной странице без referrer должен давать одинаковый домен во всех сегментах.

---

## Браузерная совместимость

| Браузер | Версия |
|---|---|
| Chrome | 90+ |
| Firefox | 90+ |
| Safari | 14+ |
| Edge | 90+ |

**Ключевые API:**
- `IntersectionObserver` — S1
- `getBoundingClientRect` — S2
- `requestAnimationFrame` — S3
- `document.visibilityState` / `visibilitychange` — S4
- `PointerEvent` / `TouchEvent` — S5
- `HTMLVideoElement` events — S6
- `navigator.mediaDevices.enumerateDevices()` — S6 audio connection (опционально)
- `sendBeacon` + `fetch keepalive` — транспорт
- `crypto.randomUUID()` / `crypto.getRandomValues()` — UUID
- `crypto.subtle.digest('SHA-256', ...)` — fingerprint (только HTTPS; null fallback)
- `MutationObserver` — dynamic creative discovery