# DISPLAY_RUNTIME_LOGIC - `packages/display-runtime`

## Обзор

`@cpmind/display-runtime` — браузерный IIFE-бандл для рендеринга и измерения display-форматов рекламных креативов: `banner_static`, `banner_gif`, `banner_html5`. Загружается embed loader'ом когда `creativeType` относится к display-семейству. Инициализирует SDK measurement session, рендерит creative в контейнер издателя и отправляет delivery events в backend.

`video_creative` данным пакетом не обрабатывается — передаётся Player bundle.

---

## Структура пакета

```txt
    ├── [DIR] display-runtime
        ├── [FILE] build.ts
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [FILE] click.ts
            ├── [FILE] html5_bridge.ts
            ├── [FILE] iframe.ts
            ├── [FILE] index.ts
            ├── [FILE] mount.ts
            ├── [FILE] render.ts
            ├── [FILE] session.ts
            ├── [FILE] static.ts
            ├── [FILE] types.ts
        ├── [FILE] tsconfig.json
```

---

## Архитектура

### Позиция в системе

```
Publisher page
┌──────────────────────────────────────────────────────────┐
│  embed script (loader)                                   │
│      │                                                   │
│      ▼ определяет creativeType                           │
│  display-runtime IIFE bundle                             │
│      │                                                   │
│      ├─ banner_static / banner_gif ──▶ static.ts         │
│      │                                  (img + anchor)   │
│      │                                                   │
│      └─ banner_html5 ───────────────▶ iframe.ts          │
│                                         (sandbox iframe) │
│                                          + html5_bridge  │
│                                                          │
│  SDK (inline) ◀── session.ts ──▶ /api/delivery/event    │
│                                  /api/collect            │
└──────────────────────────────────────────────────────────┘
```

### Точка входа и GTM-паттерн

Display-runtime использует GTM-style async queue pattern:

```typescript
window.__CPMIND_QUEUE__ = window.__CPMIND_QUEUE__ || [];
```

Embed loader заполняет `__CPMIND_QUEUE__` до загрузки runtime. При загрузке runtime:
1. Обрабатывает накопленные записи из очереди
2. Перехватывает `queue.push` для обработки будущих записей

Это устраняет race condition между инициализацией контейнера и загрузкой JS-бандла.

---

## Типы и конфигурация

### `DisplayQueueEntry`

Расширяет `DeliveryRuntimeConfig` из `@cpmind/shared`. Содержит всё необходимое для рендеринга и измерения:

```typescript
interface DisplayQueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;    // DOM-элемент издателя
    campaignId: string;
    creativeId: string;
    assetUrl: string;          // CDN URL ассета
}
```

`DeliveryRuntimeConfig` включает: `adSessionId`, `placementUuid`, `creativeVersionUuid`, `creativeType`, `deliveryMode`, `tagUuid`, `tagConstantsVersion`, `collectEndpoint`, `deliveryEventEndpoint`, `tagConstants`, `timeouts`, `clickUrl`, `width`, `height`, `skippable`.

### Delivery events

Все события отправляются fire-and-forget через `sendDeliveryEvent` из SDK:

| Событие | Момент |
|---|---|
| `requested` | Начало обработки entry |
| `asset_load_started` | После монтирования контейнера |
| `creative_ready` | После загрузки ассета (до render confirmation) |
| `render_confirmed` | После `requestAnimationFrame` — первый отрисованный frame |
| `creative_error` | При любой ошибке flow |

---

## Flow рендеринга

### Общий flow (`index.ts`)

```
processEntry(entry)
    │
    ▼
createDisplaySessionContext()   ← создание контекста, adSessionId
    │
sendDisplayEvent('requested')
    │
mountSurface()                  ← подготовка контейнера
    │
sendDisplayEvent('asset_load_started')
    │
    ├─ banner_html5 ──▶ runHtml5Flow()
    │
    └─ banner_static/gif ──▶ runStaticFlow()
    │
    ▼
sendDisplayEvent('render_confirmed')
    │
prepareDisplayMeasurement()     ← инициализация SDK session
    │
startDisplayMeasurement(renderConfirmedAt)
```

Весь flow выполняется в `runDisplayFlowAsync()`. AbortController с timeout `entry.timeouts.adLoadTotalMs` — если creative не загрузился за отведённое время, отправляется `creative_error` с кодом `MEDIA_START_TIMEOUT`.

### Монтирование контейнера (`mount.ts`)

```typescript
container.style.position = 'relative';
container.style.overflow = 'hidden';
// Применяет width/height если заданы в placement config
// Очищает всё содержимое контейнера
```

Контейнер подготавливается до загрузки ассета: `position: relative` для корректного позиционирования дочерних элементов, `overflow: hidden` исключает выход creative за границы.

### Static/GIF flow (`static.ts`)

Создаёт DOM структуру: `<a>` (wrapper) → `<img>` (ассет).

```
container
└─ <a href=clickUrl target=_blank rel="noopener noreferrer">
   └─ <img src=assetUrl style="width:100%;height:100%">
```

**Валидация clickUrl:** `toSafeHref()` парсит URL и разрешает только `https:` и `http:`. `javascript:`, `data:`, `vbscript:` блокируются → `cursor: default`, клик не активен.

**Render confirmation:**
1. `waitForImageLoaded(img, signal)` — ждёт `img.complete && naturalWidth > 0` или событие `load`
2. `img.decode()` (если доступно) — ждёт полного декодирования
3. `waitForFramePainted()` — `requestAnimationFrame` → гарантия что браузер отрисовал frame
4. `Date.now()` → `renderConfirmedAt` (инвариант §17 SDK: timestamp начала измерения = момент первого видимого frame)

### HTML5 flow (`iframe.ts` + `html5_bridge.ts`)

Создаёт `<iframe sandbox="allow-scripts">` без `allow-same-origin`:

```typescript
iframe.sandbox.add('allow-scripts');
// allow-same-origin намеренно отсутствует — изоляция creative от host DOM
```

**Handshake sequence:**

```
iframe.ts                        html5_bridge.ts (в iframe)
    │                                    │
    │  устанавливаем message listener    │
    │                                    │  при load: send(cpmind:ready)
    │◀─────── cpmind:ready ─────────────│
    │                                    │
    │  postMessage(cpmind:init,          │
    │    clickUrl, bridgeVersion)        │
    │────────── cpmind:init ───────────▶│
    │                                    │  initialized = true
    │  sendDisplayEvent('creative_ready')│
    │  waitForFramePainted()             │
    │  → renderConfirmedAt              │
```

**Race condition prevention:** `iframe.src` устанавливается после регистрации `message` listener:
```typescript
window.addEventListener('message', onHandshake);
iframe.src = assetUrl;  // только после listener — иначе cpmind:ready может прийти раньше
```

**Cleanup:** `waitForHtml5Ready` возвращает `cleanup` функцию (снимает click message listener). Сохраняется в `ctx.bridgeCleanup` и вызывается при `destroyDisplaySession`.

При демонтаже iframe хост отправляет `cpmind:destroy` → bridge вызывает `ac.abort()` → снимает все listeners в iframe.

---

## Session и измерение (`session.ts`)

### Жизненный цикл сессии

```
createDisplaySessionContext()
    │  adSessionId (из DeliveryRuntimeConfig)
    │  meta (SessionPayloadMeta для SDK)
    │  config (SdkSignalConfig с tagConstants)
    │  measurementSession = null
    │
prepareDisplayMeasurement(ctx, container)
    │  создаёт MeasurementSession через SDK.prepareMeasurementSession()
    │  вызывается СТРОГО после render_confirmed
    │
startDisplayMeasurement(ctx, renderConfirmedAt)
    │  session.startMeasurement(renderConfirmedAt)
    │  запускает сигналы S1-S7 через SDK
    │
destroyDisplaySession(ctx, reason)
    │  finalize(reason) → отправляет финальный impression
    │  bridgeCleanup?.() → снимает HTML5 message listeners
```

**Инвариант:** `prepareDisplayMeasurement` вызывается строго после render confirmation. До этого момента `measurementSession === null`. Это гарантирует что S1 (time-in-view) начинает отсчёт с реального момента появления creative на экране.

### `measurementMode`

Display-runtime всегда устанавливает `measurementMode: 'full_direct_display'`. Это поле передаётся в backend для корреляции ad session и impression record.

---

## Clickthrough валидация (`click.ts`)

Все URL проходят через `isValidClickthroughUrl()`:

```typescript
function isValidClickthroughUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}
```

`executeClickthrough(href, fallbackUrl)` — логика приоритета:
1. Если `href` валиден → `window.open(href, '_blank', 'noopener,noreferrer')`
2. Если `href` невалиден, но `fallbackUrl` валиден → открывает `fallbackUrl`
3. Оба невалидны → ничего не происходит

Вызывается из `html5_bridge.ts` при получении `cpmind:click` от creative bridge.

---

## Сборка

```typescript
{
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    platform: 'browser',
    target: [...TAG_BUILD_TARGETS],
    format: 'iife',
    outfile: `dist/cpmind-display_v${version}.min.js`,
    define: { 'process.env.NODE_ENV': '"production"' },
}
```

- **Версия** из `DISPLAY_RUNTIME_VERSION` env (default `'1'`) → `cpmind-display_v1.min.js`
- SDK и shared инлайнятся в бандл — нет внешних зависимостей в runtime
- Runtime конфигурация не baked-in при сборке — читается из `window.__CPMIND_QUEUE__` в runtime

---

## Обработка ошибок

| Ситуация | Поведение |
|---|---|
| Timeout `adLoadTotalMs` | AbortController.abort() → `creative_error` / `MEDIA_START_TIMEOUT` |
| Ошибка загрузки img | `waitForImageLoaded` reject → `creative_error` / `MEDIA_LOAD_FAILED` |
| HTML5 bridge error | `cpmind:error` от bridge → `creative_error` / `MEDIA_LOAD_FAILED` |
| Неизвестный `creativeType` | `DISPLAY_TYPES.has()` → entry игнорируется (video → Player) |
| Исключение в `processEntry` | `.catch(() => {})` — ошибки одного creative не ломают другие |
| Ошибка инициализации runtime | outer `try/catch` в `index.ts` — не ломает страницу издателя |
| Невалидный clickUrl | `toSafeHref()` → `null`, clickthrough отключается |