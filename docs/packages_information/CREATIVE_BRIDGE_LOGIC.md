# CREATIVE_BRIDGE_LOGIC - `packages/creative-bridge`

## Обзор

`@cpmind/creative-bridge` — изолированный IIFE-бандл (~0.8 KB), встраиваемый в HTML5-креативы на стадии обработки media-worker'ом. Исполняется внутри sandbox iframe на `creative.cpmind.tech` и обеспечивает двустороннее взаимодействие между HTML5-креативом и display-runtime хоста через `postMessage`.

Пакет решает одну специфическую проблему: HTML5-креатив загружается в `<iframe sandbox="allow-scripts">` без `allow-same-origin` — у него нет доступа к DOM хоста, его `window.opener` недоступен, а `event.origin` всегда `'null'`. Стандартные механизмы межфреймового взаимодействия не работают. Creative Bridge реализует минимальный протокол поверх `postMessage`, не требующий совпадения origin.

---

## Структура пакета

```txt
    ├── [DIR] creative-bridge
        ├── [FILE] build.ts
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [FILE] index.ts
        ├── [FILE] tsconfig.json
```

---

## Архитектура

### Позиция в системе

```
creative.cpmind.tech        app.cpmind.tech / publisher site
┌─────────────────┐         ┌──────────────────────────────┐
│  HTML5 creative │         │  display-runtime (host)      │
│                 │         │                              │
│  creative-bridge│◀───────▶│  html5_bridge.ts             │
│  (IIFE, ~0.8KB) │postMsg  │                              │
└─────────────────┘         └──────────────────────────────┘
         ↑
   media-worker инжектирует
   bridge в HTML5 bundle
   при обработке
```

Media-worker инжектирует `<script src="cpmind-creative-bridge_v1.min.js">` в `<head>` HTML5-файла при обработке. Bridge исполняется при каждой загрузке iframe — не требует действий от разработчика креатива.

### Протокол обмена сообщениями

Протокол двусторонний, инициируется bridge (направление: creative → host):

```
Creative (bridge)                    Host (display-runtime)
      │                                      │
      │──── cpmind:ready ──────────────────▶│  bridge готов, запрос init
      │                                      │
      │◀─── cpmind:init ────────────────────│  clickUrl + bridgeVersion
      │                                      │
      │  (пользователь кликает)              │
      │──── cpmind:click ──────────────────▶│  href для перехода
      │                                      │
      │◀─── cpmind:destroy ─────────────────│  iframe демонтируется
      │                                      │
```

#### Типы сообщений

**Creative → Host (`CreativeToHostMessage`):**

| Тип | Поля | Когда |
|---|---|---|
| `cpmind:ready` | `version: string` | При инициализации bridge — до получения init |
| `cpmind:click` | `href: string` | При клике пользователя на ссылку |
| `cpmind:error` | `code: string`, `message: string` | При критической ошибке инициализации |

**Host → Creative (`HostToCreativeMessage`):**

| Тип | Поля | Когда |
|---|---|---|
| `cpmind:init` | `clickUrl: string \| null`, `bridgeVersion: string` | После получения `cpmind:ready` |
| `cpmind:destroy` | — | Перед демонтажем iframe |

---

## Реализация

### Инициализация и жизненный цикл

Bridge исполняется как IIFE при загрузке страницы. Точка входа — функция `init()`, обёрнутая в `try/catch` с отправкой `cpmind:error` при сбое.

```typescript
const BRIDGE_VERSION = '1';
let clickUrl: string | null = null;
let initialized = false;
const ac = new AbortController();
```

`initialized` — guard: клики не обрабатываются до получения `cpmind:init`. Предотвращает обработку кликов в момент когда `clickUrl` ещё не установлен.

`AbortController` — единый механизм cleanup: при получении `cpmind:destroy` `ac.abort()` снимает оба event listener'а (`click` и `message`) через опцию `{ signal }`.

### Handshake

При старте bridge немедленно отправляет `cpmind:ready` в `window.parent`:

```typescript
send({ type: 'cpmind:ready', version: BRIDGE_VERSION });
```

Host (display-runtime, `html5_bridge.ts`) ожидает это сообщение, проверяет `event.source === iframe.contentWindow` и отвечает `cpmind:init` с `clickUrl`.

### Валидация источника сообщений

```typescript
window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    // ...
});
```

`event.origin` в sandbox iframe без `allow-same-origin` всегда `'null'` — проверка origin не работает. Единственная надёжная валидация — `event.source === window.parent`. Это намеренное решение, задокументированное в коде.

### Обработка кликов

Bridge делегирует все клики внутри iframe хосту:

```typescript
document.addEventListener('click', (e: MouseEvent) => {
    if (!initialized) return;

    const target = (e.target as HTMLElement).closest('a');
    if (target === null) return;

    const href = target.getAttribute('href');
    if (href === null || href === '' || href === '#') return;

    e.preventDefault();

    const resolvedHref = clickUrl ?? href;
    send({ type: 'cpmind:click', href: resolvedHref });
}, { signal });
```

Логика разрешения `href`:
- Если `clickUrl` установлен (получен из `cpmind:init`) — использует его. Это позволяет хосту подменять URL клика на tracking URL placement'а.
- Если `clickUrl === null` — использует оригинальный `href` из HTML-кода креатива.

`e.preventDefault()` предотвращает стандартную навигацию в iframe. Хост (display-runtime) выполняет `window.open` с валидацией URL.

### Cleanup

При получении `cpmind:destroy`:

```typescript
if (msg.type === 'cpmind:destroy') {
    ac.abort();
    return;
}
```

`ac.abort()` снимает оба addEventListener через `{ signal }`. Нет утечек памяти при повторном монтировании iframe.

---

## Сборка

```typescript
{
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    platform: 'browser',
    target: [...TAG_BUILD_TARGETS],  // из @cpmind/shared
    format: 'iife',
    outfile: 'dist/cpmind-creative-bridge_v1.min.js',
}
```

- **IIFE формат** — исполняется немедленно при загрузке, не требует module loader'а
- **`TAG_BUILD_TARGETS`** — целевые браузеры из `@cpmind/shared`, синхронизированы с tag bundle
- **`legalComments: 'none'`** — минимальный размер бандла
- Нет внешних зависимостей — всё инлайнится, только стандартные Web API

Результирующий файл: `dist/cpmind-creative-bridge_v1.min.js`, ~0.8 KB.

---

## Безопасность

| Угроза | Защита |
|---|---|
| Спуфинг сообщений от постороннего фрейма | `event.source !== window.parent` → игнор |
| XSS через кастомный clickUrl | Валидация URL выполняется на стороне хоста в `click.ts` (`executeClickthrough`), bridge передаёт href как есть |
| Исходящие запросы из creative | `CSP: connect-src 'none'` на `creative.cpmind.tech` — сетевые запросы заблокированы на уровне браузера |
| Доступ к DOM хоста | `sandbox="allow-scripts"` без `allow-same-origin` — Same-Origin Policy изолирует iframe |
| Утечка состояния после демонтажа | `AbortController.abort()` снимает все listeners |