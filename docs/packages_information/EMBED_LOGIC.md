# EMBED_LOGIC - `packages/embed`

## Обзор

`@cpmind/embed` — легковесный IIFE-бандл (embed loader), генерируемый backend'ом как динамический embed script и загружаемый на странице издателя. Единственная ответственность loader'а — определить тип creative из очереди `__CPMIND_QUEUE__` и загрузить соответствующий runtime bundle (display-runtime или player) с CDN. Loader не рендерит creative сам — он делегирует это специализированным runtime'ам.

---

## Структура пакета

```txt
    ├── [DIR] embed
        ├── [FILE] build.ts
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [FILE] index.ts
            ├── [FILE] loader.ts
        ├── [FILE] tsconfig.json
```

---

## Архитектура

### Позиция в системе

```
Publisher page
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  <script async src="delivery.cpmind.tech/e/{token}.js">    │
│      │                                                      │
│      │ backend генерирует JS:                               │
│      │  1. Заполняет window.__CPMIND_QUEUE__                │
│      │  2. Загружает cpmind-loader_v1.min.js с CDN          │
│      │                                                      │
│      ▼                                                      │
│  cpmind-loader_v1.min.js (этот пакет)                      │
│      │                                                      │
│      ├─ banner_static/gif/html5 ──▶ cpmind-display_vN.min.js│
│      │                                 (display-runtime)    │
│      │                                                      │
│      └─ video_creative ─────────▶ cpmind-player_vN.min.js  │
│                                       (player)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                    cdn.cpmind.tech
               (Yandex CDN → delivery bucket)
```

### Двухступенчатая загрузка

Загрузка creative на странице издателя происходит в два этапа:

**Этап 1 — Embed script** (`delivery.cpmind.tech/e/{token}.js`):
Backend динамически генерирует JS для конкретного placement token. Скрипт заполняет `window.__CPMIND_QUEUE__` конфигурацией и загружает loader с CDN. Каждый запрос уникален — `Cache-Control: no-store`.

**Этап 2 — Loader** (`cdn.cpmind.tech/runtime/cpmind-loader_v1.min.js`):
Статический бандл этого пакета. Читает очередь, определяет нужный runtime по `creativeType` и загружает его с CDN. Кешируется на 1 год (`immutable`).

**Этап 3 — Runtime** (`cdn.cpmind.tech/runtime/cpmind-display_vN.min.js` или `cpmind-player_vN.min.js`):
Выполняет рендеринг и измерение. Также кешируется на 1 год.

Такое разделение позволяет кешировать тяжёлые runtime бандлы на стороне браузера и CDN, при этом сохраняя динамичность embed скрипта (уникальный для каждого placement).

---

## Реализация

### Точка входа (`index.ts`)

```typescript
try {
    initLoader();
} catch {
    // Loader failure must never break publisher page
}
```

Вся логика обёрнута в `try/catch` — сбой loader'а не должен ломать страницу издателя. Это первый уровень защиты.

### Guard от двойной инициализации

Backend генерирует код вида:

```javascript
if (!window.__CPMIND_LOADER__) {
    window.__CPMIND_LOADER__ = true;
    // загружаем loader
}
```

`__CPMIND_LOADER__` предотвращает повторную инициализацию если несколько placement'ов размещены на одной странице. Loader загружается один раз, обрабатывает все entries из очереди.

### Очередь `__CPMIND_QUEUE__`

```typescript
interface QueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;
    campaignId: string;
    creativeId: string;
    assetUrl: string;
    displayRuntimeVersion: string;
    playerRuntimeVersion: string;
}
```

Расширяет `DeliveryRuntimeConfig` из `@cpmind/shared` добавляя:
- `container` — DOM-элемент куда монтируется creative
- `campaignId`, `creativeId` — идентификаторы для measurement
- `assetUrl` — CDN URL ассета (изображение, HTML5 bundle)
- `displayRuntimeVersion`, `playerRuntimeVersion` — версии runtime бандлов (из env `DISPLAY_RUNTIME_VERSION`, `PLAYER_RUNTIME_VERSION` на backend)

### Определение runtime (`resolveRuntimeUrl`)

```typescript
function resolveRuntimeUrl(entry: QueueEntry): string | null {
    const { creativeType } = entry;

    if (
        creativeType === 'banner_static' ||
        creativeType === 'banner_gif' ||
        creativeType === 'banner_html5'
    ) {
        return buildDisplayUrl(entry.displayRuntimeVersion);
    }

    if (creativeType === 'video_creative') {
        return buildPlayerUrl(entry.playerRuntimeVersion);
    }

    return null;  // неизвестный тип — игнорируется
}
```

URL runtime бандлов:
- Display: `{CDN_BASE_URL}/runtime/cpmind-display_v{version}.min.js`
- Player: `{CDN_BASE_URL}/runtime/cpmind-player_v{version}.min.js`

`CDN_BASE_URL` baked-in при сборке через esbuild `define` из env переменной `CDN_BASE_URL` (default: `https://cdn.cpmind.tech`).

### Дедупликация загрузки скриптов

```typescript
// При инициализации — через Set
const urlsToLoad = new Set<string>();
for (const entry of queue) {
    const url = resolveRuntimeUrl(entry);
    if (url !== null) urlsToLoad.add(url);
}
```

```typescript
// При динамическом push — через DOM проверку
function loadScript(src: string): void {
    if (document.querySelector(`script[src="${src}"]`) !== null) return;
    // ...
}
```

Два механизма дедупликации:
1. `Set<string>` при начальной обработке очереди — каждый уникальный URL загружается один раз даже если несколько entries требуют одного runtime
2. DOM-проверка в `loadScript` — предотвращает дублирование при вызовах `push` после инициализации

### GTM-style перехват push

```typescript
window.__CPMIND_QUEUE__.push = function (
    this: QueueEntry[],
    ...entries: QueueEntry[]
): number {
    for (const entry of entries) {
        const url = resolveRuntimeUrl(entry);
        if (url !== null) loadScript(url);
    }
    return originalPush.apply(this, entries);
} as typeof Array.prototype.push;
```

После инициализации loader перехватывает `Array.prototype.push` на экземпляре очереди. Новые entries (если несколько placement'ов добавляются асинхронно) автоматически триггерят загрузку нужного runtime. `originalPush.apply` сохраняет стандартное поведение массива.

### Загрузка скрипта

```typescript
const s = document.createElement('script');
s.src = src;
s.async = true;
document.head.appendChild(s);
```

`async = true` — скрипт загружается параллельно, не блокирует парсинг HTML. Runtime самостоятельно инициализируется через `window.__CPMIND_QUEUE__` после загрузки.

---

## CDN_BASE_URL — baked-in константа

```typescript
declare const CDN_BASE_URL: string;
```

Константа инжектируется при сборке через esbuild `define`:

```typescript
define: {
    CDN_BASE_URL: JSON.stringify(cdnBaseUrl),
}
```

Значение берётся из `process.env.CDN_BASE_URL` при сборке (default `https://cdn.cpmind.tech`). В production бандл содержит захардкоженный CDN URL — в runtime обращений к env нет.

Это позволяет использовать один и тот же loader бандл без пересборки при деплое — CDN URL стабилен.

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
    outfile: 'dist/cpmind-loader_v1.min.js',
    define: {
        'process.env.NODE_ENV': '"production"',
        CDN_BASE_URL: JSON.stringify(cdnBaseUrl),
    },
}
```

- **IIFE формат** — исполняется немедленно при загрузке
- **`TAG_BUILD_TARGETS`** — целевые браузеры из `@cpmind/shared`
- **Нет внешних зависимостей** — только `@cpmind/shared` типы (инлайнятся при сборке)
- Результат: `dist/cpmind-loader_v1.min.js` — статический файл, деплоится на CDN

---

## Взаимодействие с backend (`embed.ts`)

Backend-сервис `services/delivery/embed.ts` генерирует JS для конкретного placement token (`GET /e/{token}.js`). Генерируемый скрипт:

1. Проверяет `__CPMIND_LOADER__` guard
2. Создаёт `window.__CPMIND_QUEUE__` с конфигурацией placement:
   - Все поля `DeliveryRuntimeConfig` (adSessionId, tagUuid, tagConstants и т.д.)
   - `container` — ссылка на DOM-элемент по ID
   - `assetUrl` — CDN URL обработанного ассета
   - `displayRuntimeVersion`, `playerRuntimeVersion` — из env backend'а
3. Загружает loader с CDN: `<script async src="{CDN_BASE_URL}/runtime/cpmind-loader_v1.min.js">`

Каждый вызов `GET /e/{token}.js` возвращает уникальный JS (`Cache-Control: no-store`) — adSessionId генерируется при каждом запросе для отслеживания уникальных показов.

---

## Обработка ошибок и устойчивость

| Ситуация | Поведение |
|---|---|
| Исключение в `initLoader` | `try/catch` в `index.ts` — страница издателя не ломается |
| Неизвестный `creativeType` | `resolveRuntimeUrl` возвращает `null` — entry игнорируется |
| Скрипт уже загружен | `document.querySelector` проверка — дублирование невозможно |
| CDN недоступен | Браузер получает сетевую ошибку — creative не отображается, остальная страница работает |
| Несколько placement'ов | `Set` + DOM-дедупликация — один runtime бандл на тип, не зависит от количества placement'ов |
| `__CPMIND_QUEUE__` не определён | `window.__CPMIND_QUEUE__ ?? []` — безопасный fallback |