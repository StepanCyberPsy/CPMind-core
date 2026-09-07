# SDK_LOGIC.md — `packages/sdk`

## Обзор

`@cpmind/sdk` — внутренняя TypeScript-библиотека измерения качества рекламных показов. Компилируется через `tsc` (не esbuild), инлайнится в bundle-потребители (`@cpmind/tag`, `@cpmind/display-runtime`, `@cpmind/player`). Реализует сбор семи сигналов (S1–S7) и сигнала присутствия (F_Presence), сериализацию и доставку impression payload на backend.

SDK не имеет собственного bundle — это library package (`sideEffects: false`), потребляемый через `workspace:*` зависимость.

---

## Структура пакета

```txt
    ├── [DIR] sdk
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [DIR] debug
                ├── [FILE] overlay.ts
            ├── [FILE] index.ts
            ├── [FILE] public_api.ts
            ├── [FILE] runtime_config.ts
            ├── [FILE] segment.ts
            ├── [FILE] session.ts
            ├── [DIR] signals
                ├── [FILE] frame.ts
                ├── [FILE] headless.ts
                ├── [FILE] presence.ts
                ├── [FILE] s1.ts
                ├── [FILE] s2.ts
                ├── [FILE] s3.ts
                ├── [FILE] s4.ts
                ├── [FILE] s5.ts
                ├── [FILE] s6.ts
                ├── [FILE] s7.ts
            ├── [DIR] surface
                ├── [FILE] element.ts
                ├── [FILE] surface.ts
            ├── [DIR] transport
                ├── [FILE] send.ts
            ├── [FILE] types.ts
            ├── [DIR] utils
                ├── [FILE] device.ts
                ├── [FILE] publisher_domain.ts
                ├── [FILE] uuid.ts
        ├── [FILE] tsconfig.json
```

---

## Архитектура

### Два режима использования

**Режим 1 — Legacy Tag** (`@cpmind/tag`):

Используется тегом при размещении на странице издателя через `<script>` с атрибутами `data-cpmind-*`. Управляет сессией через прямой вызов `initS1`–`initS7`, `initPresence`, `attachUnloadHandlers`.

**Режим 2 — Hosted Creative** (`@cpmind/display-runtime`, `@cpmind/player`):

Использует высокоуровневый `MeasurementSession` API через `prepareMeasurementSession()`. Runtime создаёт сессию, вызывает `startMeasurement(renderConfirmedAt)` после подтверждения первого frame, передаёт `VideoMeasurementEvent` через `reportVideoEvent()`.

### Зависимости

```
@cpmind/shared ← @cpmind/sdk ← @cpmind/tag
                             ← @cpmind/display-runtime
                             ← @cpmind/player
```

SDK не зависит от DOM framework'ов — только нативные Web API.

---

## MeasurementSession API (`public_api.ts`)

Высокоуровневый фасад для hosted creative flow. Инкапсулирует полный lifecycle измерения.

### Жизненный цикл

```
prepareMeasurementSession({ creativeEl, meta, config })
    │  createSession()
    │  new MeasuredElement(creativeEl, onRemoved)
    │  new MeasurementSurface(creativeEl, session, config, meta)
    │  surface.init()  ← инициализирует S1–S7, presence, unload handlers
    │
    ▼ state: PREPARED

startMeasurement(renderConfirmedAt)
    │  state: PREPARED → MEASURING
    │  session.timestampStart = renderConfirmedAt (инвариант §17)
    │
    ▼ state: MEASURING

reportVideoEvent(event)  ← только в MEASURING
    │  инициализирует s6 при первом вызове
    │  роутит event → S6 accumulator функции
    │
    ▼

finalize(reason)
    │  state: MEASURING|PREPARED → FINALIZING → FINALIZED
    │  session.timestampEnd = Date.now()
    │  surface.finalize()  ← finalizeAndSend()
    │  measuredElement.dispose()
    │
    ▼ state: FINALIZED

destroy()
    │  если MEASURING/PREPARED → вызывает finalize('destroyed')
    │  state: DESTROYED
    │  surface.destroy()
    │  measuredElement.dispose()
```

### Состояния сессии

```
PREPARED → MEASURING → FINALIZING → FINALIZED → DESTROYED
                    ↗
          PREPARED ─────────────────────────────▶ DESTROYED
```

Переходы строго односторонние. Guard `if (this._state !== 'MEASURING') return` в `reportVideoEvent` — события после finalize молча игнорируются.

### Инвариант §17 — `renderConfirmedAt`

`startMeasurement(timestampMs)` устанавливает `session.timestampStart` только если он равен 0. S1 устанавливает его при первом viewport entry. Для instream creative (без IntersectionObserver) `timestampStart` остаётся 0 до явного вызова `startMeasurement` — что корректно, т.к. render confirmation приходит после `waitForFirstFrame`.

### `MeasuredElement` — детектор демонтажа

```typescript
new MeasurementSurface(creativeEl, () => this.finalize('creative_removed'))
```

`MutationObserver` на `document.documentElement` следит за `childList + subtree`. При `!creativeEl.isConnected` — вызывает `onRemoved` → `finalize('creative_removed')`. Корректно обрабатывает SPA-навигацию, когда creative удаляется из DOM без unload событий.

---

## Session (`session.ts`)

### Структура `Session`

Плоский объект — единое изменяемое состояние для всех сигналов одного сегмента:

```typescript
interface Session {
    impressionId: string;       // UUID, уникален для каждого сегмента
    sessionGroupId: string;     // UUID, постоянен для всех сегментов одного показа
    segmentIndex: number;       // 0, 1, 2... при presence idle

    // S1 — Time-in-View
    timeInViewSec: number;
    maxContinuousViewSec: number;
    visiblePixelsPct: number;
    mrcCompliant: boolean;
    viewStart: number | null;   // timestamp начала текущего visible-сегмента

    // S2–S7, F_Presence fields...
    s6: S6AccumulatorState | null;  // null для не-video creative
}
```

### `buildPayload` — финализация и сериализация

Вычисляет финальные значения сигналов без мутации session:

**S1:** если `viewStart !== null` (creative видна в момент финализации) — добавляет незакрытый сегмент к `timeInViewSec` и `maxContinuousViewSec`.

**MRC compliance:** `mrcCompliant = session.mrcCompliant || (maxContinuousViewSec >= 2.0 && visiblePixelsPct >= 75)` — 75% видимых пикселей в течение 2 секунд непрерывно. Это более строгий порог чем стандарт MRC (50%/1s) — намеренное решение для повышения качества данных.

**S4:** `tabTotalTimeMs` считается от `session.timestampStart`, не от загрузки страницы (правило P-05). `computeActiveTimeMsInRange` пересчитывает из `visibilityStateHistory` в диапазоне `[impressionStart, now]`.

**S5:** незавершённый hover (курсор над creative в момент финализации) добавляется без мутации session через локальную переменную `activeHoverDurationMs`.

**S7:** `page_height_total_px || document.documentElement.scrollHeight` — fallback если высота не была измерена.

### Сегментирование

При срабатывании presence idle timer (`startNewSegment`):
1. `finalizeAndSend(session, meta, config, false)` — отправляем текущий сегмент (`isFinal=false`)
2. `resetSessionForNewSegment(session)` — новый `impressionId`, `segmentIndex++`, сброс транспортных флагов
3. `resetSegmentS1..S7` — сброс накопленных данных каждого сигнала
4. Presence handle сбрасывается, idle timer перезапускается

`sessionGroupId` не сбрасывается — связывает все сегменты одного показа на backend.

---

## Сигналы

### S1 — Time-in-View (`signals/s1.ts`)

IntersectionObserver с `threshold: config.constants.S1_VIEWPORT_THRESHOLDS` (значения из TagConstants, калиброванные на backend).

**Логика:**

```
IntersectionObserver callback:
    entry.intersectionRatio >= 0.75:
        viewStart = now  (если был null)
        visiblePixelsPct = round(ratio * 100)
    
    entry.intersectionRatio < 0.75 && viewStart !== null:
        segmentSec = (now - viewStart) / 1000
        timeInViewSec += segmentSec
        maxContinuousViewSec = max(maxContinuousViewSec, segmentSec)
        
        if segmentSec >= 2.0 && visiblePixelsPct >= 75:
            mrcCompliant = true   ← наш критерий: 75% / 2s
        
        viewStart = null
```

**Первый viewport entry:** устанавливает `session.timestampStart` если ещё 0. Для display creative это момент начала измерения.

**Reset при новом сегменте:** `resetters` WeakMap хранит observer по `creativeEl`. При сбросе старый observer отключается, новый создаётся с теми же параметрами.

**MRC критерий системы:** `>= 75% пикселей` в течение `>= 2.0 секунд непрерывно` — строже стандартного MRC (50%/1s). Это намеренная бизнес-логика, не подлежащая изменению.

### S2 — Share of Screen

Периодический sampling (`S2_SAMPLE_INTERVAL_MS` из TagConstants) доли экрана занятой creative. Результат: `shareOfScreenSamples[]` → среднее и максимум в payload.

### S3 — Scroll Velocity

Измеряет паттерны прокрутки: средняя/максимальная скорость, паузы, стрики, direction changes, detection reading pattern. `null` в cross-domain iframe (нет доступа к `window.scrollY` родителя).

### S4 — Tab Activity

`document.visibilitychange` listener записывает `VisibilityEntry[]`. `computeActiveTimeMsInRange` вычисляет активное время в диапазоне `[impressionStart, now]`:

```typescript
for entry in history:
    if entry.state === 'visible':
        activeMs += min(nextEntry.timestamp, rangeEnd) - max(entry.timestamp, rangeStart)
```

Считается от начала impression, не от загрузки страницы.

### S5 — Interaction Events

Desktop: hover (count, duration, proximity, trajectory entropy, click latency), cursor proximity к creative. Mobile: tap count, touch delta, zoom, swipe count. Device-specific поля `null` для противоположного типа устройства.

### S6 — Video Engagement Accumulator (`signals/s6.ts`)

Наиболее сложный сигнал. Pure state machine без DOM-зависимостей — работает через явные вызовы функций от player/display-runtime.

#### Структура `S6AccumulatorState`

```typescript
{
    // Tracking state
    duration: number;           // длительность из loadedmetadata
    lastSeekTime: number;       // последняя позиция перед seeking
    isSeeking: boolean;
    videoEndedInSegment: boolean;
    audibleTimeStart: number | null;  // timestamp начала audible периода
    everMutedWhilePlaying: boolean;
    everUnmutedWhilePlaying: boolean;

    // Video Engagement metrics
    play_initiated, quartile_25/50/75, completion, completion_rate_pct,
    pause_initiated, skipped, replay_count,

    // Audibility metrics
    muted_status: 'muted' | 'unmuted' | 'mixed',
    volume_level: number,       // 0-100
    audio_connection: AudioConnection,
    audible_time_sec: number,
    audible_quartile_25/50/75/100: boolean,
    unmuted_by_user: boolean,
}
```

#### Функции accumulator

**`onS6Play(state, isMuted, volume)`**
- `play_initiated = true`
- Если `videoEndedInSegment` (replay после ended) → `replay_count++`, `videoEndedInSegment = false`
- Если audible (`!isMuted && volume > 0`) → стартует `audibleTimeStart`, `everUnmutedWhilePlaying = true`
- Иначе → `everMutedWhilePlaying = true`
- `updateMutedStatus()`

**`onS6Pause(state)`**
- `pause_initiated = true`
- `accumulateAudibleTime()` → `audible_time_sec += elapsed`, `audibleTimeStart = null`

**`onS6Ended(state, isMuted, volume)`**
- `completion = true`, `completion_rate_pct = 100`, `videoEndedInSegment = true`
- `accumulateAudibleTime()`
- Если audible в момент ended → `audible_quartile_100 = true`

**`onS6TimeUpdate(state, currentTime, isMuted, volume)`**
- `checkQuartiles(state, currentTime, isMuted, volume)` — проставляет quartile флаги по threshold'ам 25/50/75/100%
- `volume_level = round(volume * 100)`
- Если не seeking → `lastSeekTime = currentTime`

**`onS6VolumeChange(state, isMuted, volume, isPaused, isEnded, previouslyMuted)`**
- Если видео играет (!isPaused && !isEnded):
  - `nowAudible && !wasAudible` → стартует `audibleTimeStart`, `everUnmutedWhilePlaying = true`
  - `previouslyMuted && !isMuted` → `unmuted_by_user = true` (пользователь явно включил звук)
  - `!nowAudible && wasAudible` → `accumulateAudibleTime()`, `everMutedWhilePlaying = true`
- `updateMutedStatus()`

**`onS6Seeking(state)`** → `isSeeking = true`

**`onS6Seeked(state, newTime)`**
- `isSeeking = false`
- Если `newTime < lastSeekTime - 0.5` (seek назад более 0.5s) → `replay_count++`
- Если `videoEndedInSegment && newTime < duration - 0.5` → `videoEndedInSegment = false`

**`onS6Skip(state)`** → `skipped = true`

**`onS6AudioConnectionDetected(state, connection)`** → `audio_connection = connection`

#### `muted_status` — тернарная классификация

```
everMuted && everUnmuted → 'mixed'
!everMuted && everUnmuted → 'unmuted'
default → 'muted'
```

Отражает реальный паттерн пользовательского поведения, а не мгновенное состояние.

#### `getS6Data` — финализация без мутации

```typescript
// Добавляет незакрытый audible период без изменения state
let finalAudibleTimeSec = state.audible_time_sec;
if (state.audibleTimeStart !== null) {
    finalAudibleTimeSec += (Date.now() - state.audibleTimeStart) / 1000;
}

// muted_throughout: играло, но ни разу не было audible
const muted_throughout = state.play_initiated && !state.everUnmutedWhilePlaying;
```

#### `resetS6Accumulator` — сброс при новом сегменте

Вызывается при `startNewSegment`. Накапливает audible time перед сбросом (`accumulateAudibleTime`), затем сбрасывает все метрики. Если видео играет в момент сброса — корректно стартует новый audible период.

### S7 — Page Context

Геометрические характеристики страницы: позиция creative по Y, высота страницы, признак above the fold, количество конкурирующих рекламных блоков в viewport, `viewabilityPersistenceSamples[]` (периодические boolean-снимки видимости).

### F_Presence — Presence Detection

Отслеживает пользовательскую активность на странице для сегментирования показа. `initPresence` регистрирует 10 DOM событий на `document` (mousemove, mousedown, mouseup, touchstart, touchend, touchmove, keydown, keyup, scroll, click).

**Throttle 100ms:** события дедуплицируются. Между throttled событиями вычисляются интервалы (`eventIntervals[]`, max 50 записей — FIFO).

**Idle timer:** `PRESENCE_IDLE_TIMEOUT_MS` из TagConstants. При idle → `onIdle()` → `startNewSegment()`. После каждого события таймер перезапускается.

`click` регистрируется с `capture: true` — перехватывается до bubble, корректно работает с `preventDefault()` на дочерних элементах.

---

## Transport (`transport/send.ts`)

### Отправка impression payload

```typescript
function sendPayload(body: string, endpoint: string): void {
    // Приоритет 1: sendBeacon (гарантированная доставка при закрытии)
    const blob = new Blob([body], { type: 'application/json' });
    const queued = navigator.sendBeacon(endpoint, blob);
    if (queued) return;

    // Fallback: если sendBeacon вернул false (64KB shared queue overflow)
    fetchKeepalive(body, endpoint);
}

function fetchKeepalive(body: string, endpoint: string): void {
    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,  // доставка при закрытии страницы
    }).catch(() => {});
}
```

`sendBeacon` возвращает `false` при переполнении 64KB shared буфера. `fetch + keepalive` как fallback гарантирует доставку.

### Дедупликация финальных payload'ов

```typescript
const finalizedPayloads = new WeakMap<Session, string>();
```

При `isFinal=true` — сериализованный payload кешируется. Повторный вызов (например, при двойном `pagehide`) отправляет закешированный payload без пересериализации. `WeakMap` автоматически освобождает память при GC session объекта.

### Unload handlers

Три обработчика с `{ once: true }` — каждый срабатывает максимум один раз:

| Событие | Назначение |
|---|---|
| `click` на creativeEl (capture) | Mobile Safari: отправка до навигации по клику |
| `document.visibilitychange → hidden` | Фоновый таб, переключение вкладок |
| `window.pagehide` | bfcache, мобильные браузеры, закрытие вкладки |

При click дополнительно проверяется `[data-cpmind-skip]` — если нажата кнопка skip, вызывается `onS6Skip` перед финализацией.

### Delivery Events

```typescript
export async function sendDeliveryEvent(
    payload: DeliveryEventPayload,
    endpoint: string,
): Promise<void> {
    await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}
```

Delivery events (requested, asset_load_started, creative_ready, render_confirmed, creative_error, closed) отправляются на `/api/delivery/event` — отдельный endpoint от impression collect. Fire-and-forget в caller'ах через `.catch(() => {})`.

---

## MeasurementSurface — оркестратор сигналов (`surface/surface.ts`)

Инициализирует все сигналы в корректном порядке:

```typescript
init():
    initS1(creativeEl, session, config)   ← IntersectionObserver
    initS2(creativeEl, session, config)   ← sampling timer
    initS3(creativeEl, session, config)   ← scroll listeners
    initS4(session, config)               ← visibilitychange listener
    initS5(creativeEl, session, config)   ← interaction listeners
    initS7(creativeEl, session, config)   ← page context measurement
    
    presenceHandle = initPresence(session, config, () => handlePresenceIdle())
    
    collectFpHash() → session.fpHash      ← async, не блокирует init
    
    if (config.debug) new DebugOverlay(creativeEl, session)
    
    attachUnloadHandlers(creativeEl, session, meta, config, presenceHandle.cleanup)
```

`handlePresenceIdle()` → `startNewSegment()` — при idle отправляет текущий сегмент и начинает новый.

---

## Fingerprint (`signals/headless.ts`)

Необратимый отпечаток устройства для SIVT (Sophisticated Invalid Traffic) детекции. Компоненты:

1. **Canvas fingerprint** — рисует текст с заданными цветами, получает `toDataURL()`
2. **UserAgent** — обрезается до 256 символов
3. **Screen** — `widthxheightxcolorDepth`
4. **Timezone** — `getTimezoneOffset()`
5. **Language** — `navigator.language`

Хеш: SHA-256 через `crypto.subtle.digest`, возвращаются первые 32 hex-символа (128 бит).

При любой ошибке (блокировка браузером, отсутствие `crypto.subtle`) → `null`. Показ не отбрасывается — `fpHash` опционален в payload.

---

## `waitForFirstFrame` (`signals/frame.ts`)

Двухуровневая реализация для детекции первого видимого frame:

**Уровень 1:** `video.requestVideoFrameCallback` — точный callback при отрисовке frame. Поддерживается Chrome 83+, Safari 15.4+.

**Уровень 2 (fallback):** `timeupdate` event при `video.currentTime > 0` — менее точный, но универсальный. Поддерживается во всех браузерах.

Оба варианта поддерживают `AbortSignal` — при timeout из caller'а reject через `AbortError`.

---

## Runtime Config (`runtime_config.ts`)

Default timeout'ы (совпадают с backend seed `delivery_runtime_configs v1.0`):

| Timeout | Default | Назначение |
|---|---|---|
| `configRequestMs` | 5 000 | Запрос runtime config |
| `vastRequestMs` | 8 000 | VAST XML fetch |
| `mediaStartMs` | 15 000 | Начало воспроизведения |
| `firstFrameMs` | 10 000 | Первый video frame |
| `contentHandoffMs` | 5 000 | Передача управления content video |
| `adLoadTotalMs` | 30 000 | Полный цикл загрузки ad |

`applyServerRuntimeConfig(received)` применяет поверх defaults — защита от неполного ответа backend'а.

---

## Сборка и интеграция

SDK собирается через `tsc` (не esbuild):
- `outDir: ./dist` — JS + `.d.ts` declaration files
- `sideEffects: false` — tree-shaking безопасен
- `exports["."]` — единственная точка входа

Потребители инлайнят SDK в свои bundle'ы (esbuild `bundle: true`). В production не существует отдельного `sdk.js` на CDN — только как часть tag/display-runtime/player бандлов.

**Конфигурация сигналов** передаётся через `SdkSignalConfig.constants: TagConstantsValues` — не через esbuild define. Это позволяет обновлять константы без пересборки бандлов (через backend delivery config).

---

## Взаимодействие с другими пакетами

| Пакет | Использует SDK |
|---|---|
| `@cpmind/tag` | `createSession`, `initS1–S7`, `initPresence`, `finalizeAndSend`, `attachUnloadHandlers`, `DebugOverlay` |
| `@cpmind/display-runtime` | `prepareMeasurementSession`, `sendDeliveryEvent` |
| `@cpmind/player` | `prepareMeasurementSession`, S6 accumulator functions, `sendDeliveryEvent`, `waitForFirstFrame` |

Display-runtime и player не вызывают `initS1–S7` напрямую — всё инициализируется внутри `MeasurementSurface.init()` через `prepareMeasurementSession`.