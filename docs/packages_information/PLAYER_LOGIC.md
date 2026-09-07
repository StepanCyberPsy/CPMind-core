# PLAYER_LOGIC.md — `packages/player`

## Обзор

`@cpmind/player` — браузерный IIFE-бандл (~228 KB) для воспроизведения видеорекламы в форматах outstream и in-stream (pre-roll, mid-roll, post-roll). Реализует полный VAST 4.3 pipeline: fetch → parse → media selection → playback → tracking → SDK measurement. Экспонируется как `window.CPMindPlayer` с двумя публичными методами: `mountOutstream` и `attachNative`.

---

## Структура пакета

```txt
    ├── [DIR] player
        ├── [FILE] build.ts
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [DIR] autoplay
                ├── [FILE] policy.ts
            ├── [FILE] config.ts
            ├── [DIR] content
                ├── [FILE] bridge.ts
                ├── [FILE] native_video.ts
            ├── [DIR] controls
                ├── [FILE] close.ts
                ├── [FILE] controls.ts
                ├── [FILE] keyboard.ts
                ├── [FILE] play.ts
                ├── [FILE] seek.ts
                ├── [FILE] skip.ts
                ├── [FILE] volume.ts
            ├── [FILE] errors.ts
            ├── [FILE] index.ts
            ├── [DIR] lifecycle
                ├── [FILE] instream.ts
                ├── [FILE] outstream.ts
                ├── [FILE] viewport.ts
            ├── [DIR] measurement
                ├── [FILE] sdk_bridge.ts
            ├── [DIR] media
                ├── [FILE] element.ts
                ├── [FILE] frame.ts
                ├── [FILE] playback.ts
                ├── [FILE] quality.ts
                ├── [FILE] select.ts
            ├── [FILE] player-config.ts
            ├── [FILE] player.ts
            ├── [FILE] public_api.ts
            ├── [FILE] types.ts
            ├── [DIR] ui
                ├── [FILE] styles.ts
                ├── [FILE] surface.ts
            ├── [DIR] vast
                ├── [FILE] client.ts
                ├── [FILE] error-codes.ts
                ├── [FILE] macros.ts
                ├── [FILE] parser.ts
                ├── [FILE] tracking.ts
                ├── [FILE] types.ts
        ├── [FILE] tsconfig.json
```

---

## Архитектура

### Публичный API и точка входа

```
window.CPMindPlayer
    ├── mountOutstream(OutstreamOptions) → PlayerController
    │       IntersectionObserver → load → VAST → play → measure
    │
    └── attachNative(NativeAttachOptions) → PlayerController
            content.play event → pause content → VAST → play → measure
                                              → resume content
```

`index.ts` присваивает `CPMindPlayer` в `window` внутри `try/catch` — сбой не ломает страницу издателя.

### Слои системы

```
public_api.ts          ← Публичный фасад: mountOutstream, attachNative
    │
    ├── lifecycle/
    │    ├── outstream.ts   ← Outstream state machine + IntersectionObserver
    │    ├── instream.ts    ← Instream binding к content video
    │    └── viewport.ts   ← observeEligibility / observePlayback
    │
    ├── player.ts          ← Core: VAST fetch → parse → load → events → finalize
    │    ├── vast/
    │    │    ├── client.ts    ← VAST XML fetch с timeout
    │    │    ├── parser.ts    ← VAST 4.3 InLine parsing через DOMParser
    │    │    ├── macros.ts    ← IAB macro substitution
    │    │    ├── tracking.ts  ← fire-and-forget tracking pixels
    │    │    └── error-codes.ts ← PlayerError → IAB VAST numeric codes
    │    │
    │    ├── media/
    │    │    ├── select.ts   ← DPR-aware media file selection
    │    │    ├── element.ts  ← createAdVideoElement
    │    │    ├── playback.ts ← attemptPlay, safePause, waitForCanPlay
    │    │    ├── frame.ts    ← waitForFirstFrame (reexport из SDK)
    │    │    └── quality.ts  ← getVideoPlaybackQuality
    │    │
    │    ├── autoplay/
    │    │    └── policy.ts   ← muted fallback autoplay
    │    │
    │    ├── ui/
    │    │    ├── surface.ts  ← DOM структура плеера
    │    │    └── styles.ts   ← CSS injection (data-cpmind-* prefix)
    │    │
    │    ├── controls/
    │    │    └── controls.ts ← Оркестратор: play/pause/seek/skip/close/keyboard
    │    │
    │    └── measurement/
    │         └── sdk_bridge.ts ← Интеграция с @cpmind/sdk
    │
    └── errors.ts          ← PlayerError codes + toAdSessionErrorCode
```

---

## Режимы воспроизведения

### Outstream (`mountOutstream`)

Рекламный блок появляется в контенте издателя. Player монтируется в `container` и управляется видимостью через IntersectionObserver.

```
createOutstreamLifecycle(container, callbacks)
    │
    observeEligibility (threshold: 0)
    │  при первом появлении любого px в viewport:
    │
    callbacks.onLoad()
    │  createPlayerSession() ← VAST fetch + media load
    │
    observePlayback (threshold: 0.5)
    │  50%+ видно → callbacks.onRequestPlay()
    │               ← attemptAutoplay() → muted fallback
    │  < 50% → callbacks.onScrollPause()
    │           ← handle.pause()
```

**Машина состояний Outstream:**

```
mounting → loading → eligible → playing → completed
                              ↓          ↑
                         paused_by_scroll
                              ↓
                            closed
```

- `mounting` → `loading`: eligibility observer сработал
- `loading` → `eligible`: VAST загружен и медиа готово к воспроизведению
- `eligible` → `playing`: autoplay успешен
- `playing` → `paused_by_scroll`: элемент вышел из viewport (< 50%)
- `paused_by_scroll` → `playing`: элемент вернулся в viewport
- `playing` → `completed`: видео завершено (`handle.whenFinished()`)
- любое → `closed`: пользователь нажал close

### In-stream (`attachNative`)

Player вставляет рекламу перед/во время воспроизведения content видео. Не использует IntersectionObserver — привязан к content video событию.

```
bindNativeContent(contentVideo, callbacks)
    │
    content.addEventListener('play', { once: true })
    │
    at first play:
    ├── await Promise.resolve()  ← defer для iOS Safari
    ├── safePause(content)
    ├── callbacks.runAd()
    │    createPlayerSession() → play → whenFinished()
    └── content.play()          ← resume content
```

**Ключевые особенности:**
- `consumed` flag — ad играет ровно один раз
- `running` guard — предотвращает race condition при двойном `play` event
- `await Promise.resolve()` перед `pause` — iOS Safari игнорирует `pause()` внутри синхронного play handler
- Fail-open: любая ошибка VAST/media → catch → resume content

---

## Core player: `createPlayerSession`

Главная функция. Создаёт сессию воспроизведения одного ad.

### Инициализация (до возврата `PlayerHandle`)

```
createAdSurface(container, width, height)
│   ├── ensurePlayerStyles() ← CSS injection с guard
│   ├── wrapper [data-cpmind-surface]
│   ├── videoSlot
│   ├── controlsBar [data-cpmind-controls]
│   │    ├── progressRow [data-cpmind-progress-row]
│   │    └── btnRow [data-cpmind-btn-row]
│   └── ResizeObserver → data-cpmind-compact при width < 400px
│
createAdVideoElement(initialMuted) ← video element
createSdkBridge({creativeEl, deliveryConfig}) ← SDK measurement

if (deliveryConfig.vastUrl === null) → throw VAST_FETCH_FAILED
loadVastXml(vastUrl, timeouts.vastRequestMs, signal)
parseVastXml(xml) → ParsedVastAd
selectMediaFile(video, mediaFiles, containerWidth) ← DPR-aware
setMediaSource(video, url)
bridge.sendEvent('asset_load_started')
waitForCanPlay(video, signal)
bridge.sendEvent('creative_ready')
```

При любой ошибке на этом этапе — `finishOnce({ type: 'failed' | 'destroyed' })` и `throw`.

### `PlayerHandle.play()`

```
attemptAutoplay(video, initialMuted)
│  video.muted = requestedMuted → video.play()
│  если blocked и !requestedMuted → video.muted = true → video.play() (muted fallback)
│
если outcome === 'started':
    waitForFirstFrame(video, signal) ← timeout = timeouts.firstFrameMs
    renderConfirmedAt = Date.now()
    bridge.startMeasurement(renderConfirmedAt)
    bridge.sendEvent('render_confirmed')
    detectAudioConnection() → bridge.reportAudioConnection()
```

`waitForFirstFrame` — best-effort: timeout не является фатальной ошибкой, видео уже воспроизводится.

### Video event handlers

```typescript
'loadedmetadata' → bridge.handleVideoEvent + controls (длительность известна)
'play'           → bridge, controls, VAST tracking (impression при playCount===1)
'pause'          → bridge, controls, VAST 'pause' tracking
'ended'          → bridge, controls, finishOnce({ type: 'completed' })
'timeupdate'     → bridge, controls, VAST quartile tracking (25/50/75%)
'seeking'        → bridge (S6 accumulator)
'seeked'         → bridge
'volumechange'   → bridge, controls, VAST mute/unmute tracking
'error'          → finishOnce({ type: 'failed' })
```

### VAST tracking quartiles

```typescript
const vastFired = new Set<string>();  // предотвращает повторный fire

if (!vastFired.has('start') && currentTime > 0) → 'start'
if (pct >= 0.25) → 'firstQuartile'
if (pct >= 0.50) → 'midpoint'
if (pct >= 0.75) → 'thirdQuartile'
// 'complete' — в finishOnce при type === 'completed'
```

### `finishOnce` — единственная точка завершения

```typescript
function finishOnce(outcome: PlayerTerminalOutcome): void {
    if (terminalOutcome !== null) return;  // guard против повторного вызова
    terminalOutcome = outcome;

    // VAST tracking по outcome
    if (outcome.type === 'completed') fireTrackingEvent('complete')
    if (outcome.type === 'skipped')   fireTrackingEvent('skip')
    if (outcome.type === 'failed')    fireError(errorUrls)

    bridge.sendEvent(...)
    bridge.finalize(outcome)
    doCleanup()           ← abort, video cleanup, surface remove
    opts.onFinished?.(outcome)
    resolveFinished(outcome)
}
```

Триггеры `finishOnce`:
- `video.ended` → `{ type: 'completed' }`
- `onSkip` callback → `{ type: 'skipped', source: 'user' }`
- `onClose` callback → `{ type: 'closed', source }`
- `video.error` → `{ type: 'failed' }`
- `surface.wrapper.isConnected === false` (MutationObserver) → `{ type: 'creative_removed' }`
- `pagehide` event → `{ type: 'page_unloaded' }`
- `destroy()` → `{ type: 'destroyed' }`

---

## VAST Pipeline

### Fetch (`vast/client.ts`)

`AbortSignal.any()` не поддерживается в Safari 14 — реализован ручной timeout через второй `AbortController`:

```typescript
const timeoutController = new AbortController();
const timeoutId = setTimeout(() => timeoutController.abort(), vastRequestMs);
signal.addEventListener('abort', () => timeoutController.abort(), { once: true });

fetch(url, { signal: timeoutController.signal, credentials: 'omit' })
```

Классификация ошибок:
- Внешний AbortSignal → пробрасывает `AbortError` (player уничтожен)
- Timeout → `PlayerError.VAST_FETCH_TIMEOUT`
- HTTP ошибка / сетевая ошибка → `PlayerError.VAST_FETCH_FAILED`

### Parsing (`vast/parser.ts`)

Парсинг через нативный `DOMParser` (не string manipulation). Обрабатывает только VAST 4.3 `InLine` — `Wrapper` не поддерживается в v1.

Обязательные поля (отсутствие → `VAST_STRUCTURE_UNSUPPORTED`):
- `Ad > InLine`
- `Linear > Duration` (формат HH:MM:SS, должна быть > 0)
- `Linear > MediaFiles > MediaFile` (минимум один с непустым URL, width > 0, height > 0)

MIME типы нормализуются через `.toLowerCase()` — несоответствие регистра в VAST не должно ломать playback.

`DOMParser` не бросает при невалидном XML — возвращает документ с `<parsererror>`. Явная проверка `doc.querySelector('parsererror')`.

### Media Selection (`media/select.ts`)

**Фильтрация кандидатов:**
1. `delivery === 'progressive'` — HLS/DASH не поддерживается
2. `video.canPlayType(mimeType) !== ''` — браузерная поддержка
3. `assertTrustedMediaUrl` — только `https:` и только `CDN_HOSTNAME` (baked-in при сборке)

**Выбор оптимального файла:**
- DPR-aware: `targetWidth = containerWidthCssPx × devicePixelRatio`
- Sorted по width ASC, при равной width — по bitrate ASC
- Выбирается наименьший файл с `width >= targetWidth`
- Если не найден — максимально доступный

### Macro Substitution (`vast/macros.ts`)

Замена IAB VAST макросов в tracking/error URL:

| Макрос | Значение |
|---|---|
| `[ERRORCODE]` | IAB VAST numeric error code (через `toVastErrorCode`) |
| `[CACHEBUSTING]` | 8 цифр из `crypto.getRandomValues` (не `Math.random`) |
| `[TIMESTAMP]` | Unix timestamp в секундах |
| `[CONTENTPLAYHEAD]` | `HH:MM:SS.mmm` текущей позиции content video |
| Все остальные `[MACRO]` | Удаляются (пустая строка) — IAB spec §2.4.1 |

### Tracking (`vast/tracking.ts`)

Все tracking pixels — fire-and-forget через `fetch` с `keepalive: true`:

```typescript
fetch(url, {
    method: 'GET',
    keepalive: true,    // доставка при закрытии страницы
    credentials: 'omit',
    mode: 'no-cors',
})
```

Ошибки сети не влияют на воспроизведение.

---

## SDK Measurement Bridge (`measurement/sdk_bridge.ts`)

### Инициализация

```typescript
const session = prepareMeasurementSession({ creativeEl, meta, config });
const s6 = createS6AccumulatorState('unknown', 0);

meta.adSessionIdentity.measurementMode = 'full_cpmind_player'
```

`session.startMeasurement(renderConfirmedAt)` вызывается только после подтверждённого первого frame — инвариант §17 SDK.

### `VideoPlaybackState`

Bridge поддерживает локальную копию состояния плеера (`vs`) для корректной атрибуции S6 событий:

```typescript
const vs: VideoPlaybackState = {
    isMuted, volume, isPaused, isEnded,
    previouslyMuted,  // нужен onS6VolumeChange 6-й параметр
    durationSec, currentTimeSec,
};
```

`vs` обновляется синхронно при каждом video событии до вызова S6 accumulator.

### `setPendingSource` — атрибуция источника действия

Проблема: video DOM события (`play`, `pause`, `volumechange`) не содержат информации об источнике (user click vs browser autoplay). Решение — 100ms временное окно:

```typescript
// Контрол вызывает setPendingSource до действия
bridge.setPendingSource('play', 'user')  // source + timestamp
video.play()                              // → DOM event 'play'

// В handleVideoEvent:
function consumePendingSource(eventType: string): PlayerActionSource {
    if (pendingAction === null) return 'unknown';
    if (Date.now() - pendingAction.setAt > ACTION_SOURCE_WINDOW_MS) {
        pendingAction = null;
        return 'browser';  // истёк → браузерное событие
    }
    return pendingAction.source;  // атрибуция из контрола
}
```

`ACTION_SOURCE_WINDOW_MS = 100ms` — достаточно для синхронного DOM propagation.

### `handleVideoEvent` — S6 accumulator + VideoMeasurementEvent

Каждое видео событие:
1. Обновляет `VideoPlaybackState`
2. Вызывает соответствующую S6 функцию SDK
3. Формирует и отправляет `VideoMeasurementEvent` в session

Особые случаи:
- `pause` при `isEnded === true` → игнорируется (не отправляем 'pause' после завершения)
- `play` при `wasEnded === true` → `{ type: 'replay' }` вместо `{ type: 'play' }`
- `volumechange`: различает mute/unmute vs volume change (порог 0.01)

### Audio Connection Detection

```typescript
navigator.mediaDevices.enumerateDevices()
→ фильтрует audiooutput устройства
→ определяет тип по label: bluetooth | wired_headphones | external_speaker | built_in_speaker | unknown
```

Вызывается однократно после первого успешного play, результат отправляется в S6.

### Finalization

```
finalize(outcome) → terminalOutcomeToFinalizationReason(outcome)
    → session.finalize(reason)
```

Маппинг `PlayerTerminalOutcome.type` → `MeasurementFinalizationReason`:

| Outcome | Reason |
|---|---|
| `completed` | `complete` |
| `skipped` | `skip` |
| `closed` | `close` |
| `failed` | `error` |
| `timed_out` | `timeout` |
| `page_unloaded` | `page_unload` |
| `creative_removed` | `creative_removed` |
| `destroyed` | `destroyed` |

---

## UI и Controls

### DOM структура (`ui/surface.ts`)

```
container (publisher element)
└── wrapper [data-cpmind-surface]          ← CSS isolation root
     ├── div [data-cpmind-label-ad]        ← "Реклама" label
     ├── videoSlot                         ← HTMLVideoElement монтируется сюда
     └── controlsBar [data-cpmind-controls]
          ├── progressRow [data-cpmind-progress-row]
          │    ├── timeEl [data-cpmind-time]
          │    └── seekBar
          └── btnRow [data-cpmind-btn-row]
               ├── playBtn
               └── volumeBtn
```

**CSS isolation:** `data-cpmind-*` атрибуты вместо Shadow DOM. CSS инжектируется через `ensurePlayerStyles()` с guard `data-cpmind-styles` — повторная инъекция при нескольких инстансах невозможна.

**Compact mode:** `ResizeObserver` на `wrapper` → при `width < 400px` устанавливает `data-cpmind-compact` → CSS скрывает второстепенные элементы.

### Controls оркестратор (`controls/controls.ts`)

Auto-hide: controls скрыты по умолчанию. Показываются при `pointermove`/`pointerdown` и автоматически скрываются через `CONTROLS_HIDE_DELAY_MS = 3000ms`.

Компоненты:
- `PlayButton` — play/pause иконка
- `VolumeButton` — mute/unmute иконка
- `SeekBar` — прогресс бар с drag (setPointerCapture)
- `SkipButton` — появляется после `skipOffsetSec` секунд
- `CloseButton` — только если `showClose: true` (outstream)
- `KeyboardControls` — Space (play/pause), M (mute), ←/→ (seek ±5s)

Keyboard navigation использует `e.code` (не `e.key`) — не зависит от раскладки клавиатуры.

---

## Autoplay Policy (`autoplay/policy.ts`)

**Coalition for Better Ads** стандарт — muted autoplay всегда разрешён мобильными браузерами:

```
Шаг 1: video.muted = requestedMuted → video.play()
    успех → { outcome: 'started', finallyMuted: requestedMuted }

Шаг 2 (только если !requestedMuted && blocked):
    video.muted = true → video.play()
    успех → { outcome: 'started', finallyMuted: true }

Шаг 3 (оба заблокированы):
    → { outcome: 'blocked', finallyMuted: video.muted }
```

Пользователь видит muted рекламу с кнопкой включения звука (volumeBtn).

---

## Сборка

```typescript
{
    entryPoints: ['src/index.ts'],
    bundle: true, minify: true,
    platform: 'browser',
    target: [...TAG_BUILD_TARGETS],
    format: 'iife',
    outfile: `dist/cpmind-player_v${version}.min.js`,
    define: {
        CDN_HOSTNAME: JSON.stringify(cdnHostname),
        PLAYER_RUNTIME_VERSION: JSON.stringify(version),
    },
}
```

**Baked-in константы:**
- `CDN_HOSTNAME` — используется в `select.ts` для `assertTrustedMediaUrl`. Только медиафайлы с этого hostname принимаются к воспроизведению
- `PLAYER_RUNTIME_VERSION` — экспонируется через `getPlayerRuntimeVersion()`

`@cpmind/sdk` инлайнится в бандл — нет внешних зависимостей в runtime.

Результат: `dist/cpmind-player_v1.min.js` (~228 KB).

---

## Обработка ошибок

| Код | Причина | Фаза |
|---|---|---|
| `VAST_FETCH_FAILED` | HTTP ошибка или сетевая ошибка | fetch |
| `VAST_FETCH_TIMEOUT` | Превышен `timeouts.vastRequestMs` | fetch |
| `VAST_XML_INVALID` | Невалидный XML или не `<VAST>` root | parse |
| `VAST_STRUCTURE_UNSUPPORTED` | Нет InLine, нет Duration, нет MediaFiles | parse |
| `NO_SUPPORTED_MEDIA` | Нет поддерживаемых/доверенных media файлов | select |
| `MEDIA_LOAD_FAILED` | `video.error` event | playback |
| `MEDIA_PLAYBACK_BLOCKED` | Autoplay заблокирован и muted fallback не помог | play |
| `MEDIA_START_TIMEOUT` | Нет `canplay` за `timeouts.adLoadTotalMs` | load |
| `FIRST_FRAME_TIMEOUT` | Первый frame не подтверждён (non-fatal) | play |
| `PLAYER_DESTROYED` | `destroy()` вызван извне | lifecycle |

`toAdSessionErrorCode` маппит `PlayerErrorCode` → `AdSessionPlayerErrorCode` (частичный маппинг: `VAST_FETCH_TIMEOUT` → `MEDIA_START_TIMEOUT`).

`toVastErrorCode` маппит `PlayerErrorCode` → IAB VAST numeric codes для `[ERRORCODE]` macro.

---

## Известные ограничения v1

| Ограничение | Описание |
|---|---|
| VAST Wrapper | Только InLine — Wrapper chains не поддерживается |
| OMID | `AdVerifications` парсятся, но JS vendor scripts не исполняются |
| Streaming | Только progressive delivery — HLS/DASH не поддерживается |
| Multi-Ad | Один ad на session — Ad pods/sequences не поддерживаются |
| Safari 14 | `AbortSignal.any()` не используется — ручной timeout через второй AbortController |