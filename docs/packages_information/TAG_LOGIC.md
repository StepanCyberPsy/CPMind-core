# CPMind Tag — `packages/tag`

JS-тег для встраивания в произвольную HTML-страницу с рекламным баннером. Собирается в один минифицированный файл (~31 КБ) через esbuild. Не импортирует `@cpmind/shared` в runtime — только браузерные API. Зависимость от `@cpmind/shared` — `devDependency` исключительно для типизации `TagConstantsValues` на этапе сборки; компилятор вытирает её из выходного бандла.

---

## Содержание

1. [Структура пакета](#структура-пакета)
2. [Сборка — два режима](#сборка--два-режима)
3. [Встраивание на страницу клиента](#встраивание-на-страницу-клиента)
4. [Жизненный цикл показа](#жизненный-цикл-показа)
5. [Сегментация показа при простое](#сегментация-показа-при-простое)
6. [Модули тега](#модули-тега)
7. [Сбор сигналов — детали реализации](#сбор-сигналов--детали-реализации)
8. [Транспорт и гарантия доставки](#транспорт-и-гарантия-доставки)
9. [Debug-режим](#debug-режим)
10. [Браузерная совместимость](#браузерная-совместимость)
11. [Важные архитектурные решения](#важные-архитектурные-решения)

---

## Структура пакета

```
packages/tag/
├── package.json              # devDep: @cpmind/shared (типизация, не runtime)
│                             # devDep: esbuild (сборка)
├── tsconfig.json
├── build.ts                  # esbuild конфиг + CLI entry point.
│                             # Локальная сборка: DEFAULT_TAG_CONSTANTS из @cpmind/shared,
│                             # version='dev'. Экспортирует buildTagBundle() и
│                             # watchTagBundle() — переиспользуются backend-ом
│                             # (services/tag_builder.ts) для runtime-сборки версий.
│                             # TAG_BUILD_TARGETS — общий источник с backend:
│                             # Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
├── dist/                     # НЕ коммитится в git
│   └── cpmind-tag.min.js     # только локальная dev-сборка (CLI), version='dev'
└── src/
    ├── index.ts              # entry point: IIFE-обёртка + глобальный try/catch
    ├── constants.ts          # чтение констант из esbuild define
    ├── types.ts              # TypeScript-типы состояния сессии
    │                         # (обновлен: TagConfig.publisherDomain?,
    │                         # TagConfig.skippable?, Session.publisherDomain)
    ├── config.ts             # parseConfig(): data-атрибуты контейнера
    │                         # (обновлен: data-publisher-domain, data-skippable)
    ├── session.ts            # управление состоянием сессии
    │                         # (обновлен: getPublisherDomain() при createSession,
    │                         # publisher_domain + skippable в buildPayload)
    ├── segment.ts            # оркестратор разрыва показа
    ├── signals/
    │   ├── s1.ts             # Time-in-View (IntersectionObserver)
    │   │                     # (обновлен: порог 0.5→0.75, таймер 1.0s→2.0s,
    │   │                     # mrcCompliant ≥2.0s && ≥75%)
    │   ├── s2.ts             # Share of Screen (сэмплирование)
    │   ├── s3.ts             # Scroll Velocity (rAF + Welford)
    │   ├── s4.ts             # Tab Activity (visibilitychange)
    │   ├── s5.ts             # Interaction Events (click/touch/hover)
    │   ├── s6.ts             # Video Engagement + Audibility
    │   │                     # (обновлен: completion_rate_pct числовой,
    │   │                     # duration_sec из loadedmetadata,
    │   │                     # skippable из TagConfig в S6RawData)
    │   ├── s7.ts             # Page Context (позиция, конкуренция)
    │   ├── presence.ts       # F_Presence (таймер активности пользователя)
    │   └── headless.ts       # collectFpHash() — device fingerprint для IVT
    ├── transport/
    │   └── send.ts           # finalizeAndSend(), sendPayload(), attachUnloadHandlers()
    ├── utils/
    │   ├── uuid.ts           # generateUUID() + Safari 14 polyfill
    │   ├── device.ts         # detectDeviceType()
    │   └── publisher_domain.ts  # NEW: getPublisherDomain(), isValidPublisherDomain(),
    │                            # djb2Hash() — определение домена площадки
    └── debug/
        └── overlay.ts        # DOM-оверлей для ?cpmind_debug=1
                              # (обновлен: label ≥75% viewport, publisherDomain в footer)
```

---

## Сборка — два режима

### Dev (локальная CLI-сборка)

```bash
pnpm --filter @cpmind/tag build
```

Выходной файл: `packages/tag/dist/cpmind-tag.min.js`, version='dev'. Подставляет `DEFAULT_TAG_CONSTANTS` из `@cpmind/shared` через esbuild `define`. Используется для локальной отладки через `test/banner-test.html`.

### Production (runtime-сборка backend-ом)

При создании версии констант тега через `POST /api/tag-constants` backend вызывает `buildTagBundle()` из `packages/tag/build.ts` через esbuild JS API — не CLI, не отдельный Docker-сервис. Подставляет конкретный набор 19 констант и версию через `define`. Артефакт пишется в Docker volume `tag_dist`, откуда NGINX раздаёт его по адресу:

```
https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js
```

**Провал сборки → компенсирующий откат** записи в `tag_constants_configs`. Не SQL-транзакция (esbuild не откатывается транзакцией БД), но нет версии без файла.

Несколько версий существуют на диске одновременно. `packages/tag/Dockerfile` и сервис `tag-builder` упразднены.

---

## Встраивание на страницу клиента

Два фрагмента HTML на странице с баннером:

```html
<!-- 1. Контейнер баннера -->
<div
  data-cpmind-creative
  data-tag-uuid="UUID_вашего_тега"
  data-campaign-id="название_кампании"
  data-creative-id="название_баннера"
  data-creative-type="banner_static"
  data-endpoint="https://app.cpmind.tech/api/collect"
  data-publisher-domain="yoursite.com"
  style="width: 728px; height: 90px;"
>
  <a href="https://ваш-сайт.ru">
    <img src="баннер.jpg" width="728" height="90" />
  </a>
</div>

<!-- 2. Скрипт тега (один раз в конце страницы) -->
<script async src="https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js"></script>
```

Для `video_creative` с поддержкой skip-кнопки:

```html
<div
  data-cpmind-creative
  data-tag-uuid="UUID_вашего_тега"
  data-campaign-id="campaign_01"
  data-creative-id="preroll_v2"
  data-creative-type="video_creative"
  data-skippable="true"
  data-publisher-domain="yoursite.com"
  data-endpoint="https://app.cpmind.tech/api/collect"
>
  <video src="preroll.mp4" width="640" height="360"></video>
  <button data-cpmind-skip>Пропустить</button>
</div>
```

**`data-tag-uuid`** — единственный идентификатор, по которому backend привязывает показ к владельцу. Версия тега и 19 констант зашиты в конкретный файл через esbuild `define` — не передаются через data-атрибуты.

**`data-publisher-domain`** (опционально) — явное указание домена площадки. Если не задан, тег определяет домен автоматически через `getPublisherDomain()` из `utils/publisher_domain.ts`. Используется для аналитики по площадкам в backend.

**`data-skippable`** (опционально, только для `video_creative`) — `"true"` если видео-ролик может быть пропущен пользователем. Влияет на сегментный ключ S6: `skippable` vs `non_skippable`. Определяет характер пользовательского поведения (пользователь под давлением "досмотреть или пропустить" — принципиально иная модель вовлечённости).

**Перевод на новую версию** — ручная замена `<script src>`. Обновление констант на уже размещённом теге не происходит автоматически при создании новой версии.

**Поддерживаемые типы креативов:** `banner_static`, `banner_gif`, `banner_html5`, `video_creative`.

Для `video_creative`: тег ищет `<video>` элемент внутри `[data-cpmind-creative]`. Кнопка пропуска помечается атрибутом `[data-cpmind-skip]` — тег слушает click на ней.

**Что НЕ нужно:**
- Устанавливать код на сервер клиента
- Менять существующий HTML баннера
- Согласие пользователя по 152-ФЗ (нет cookie, нет персональных данных, нет IP)

---

## Жизненный цикл показа

```
1. Загрузка страницы
   └── <script async src="cpmind-tag_v{N}.min.js">
       └── IIFE выполняется немедленно после загрузки

2. Инициализация
   └── querySelectorAll('[data-cpmind-creative]')
       └── Для каждого баннера (независимая сессия):
           ├── parseConfig() — data-атрибуты + tag_uuid из cfg
           ├── createSession() — impression_id (UUID v4), session_group_id
           ├── collectFpHash() — fire-and-forget async, результат → session.fpHash
           ├── initS1(), initS2(), initS3(), initS4(), initS5(), initS6(), initS7()
           ├── initPresence()
           └── attachUnloadHandlers()

3. Сбор сигналов (параллельно, пока пользователь на странице)
   ├── S1: IntersectionObserver — время видимости
   ├── S2: сэмплирование каждые 500 мс — доля экрана
   ├── S3: rAF-throttled scroll — паттерн скролла
   ├── S4: visibilitychange — активность вкладки
   ├── S5: click/touch/hover — взаимодействие
   ├── S6: video event listeners (только video_creative, null если нет <video>)
   ├── S7: позиция + сэмплирование каждые 1000 мс
   └── presence: 10 типов событий, таймер простоя

4. Отправка (один из трёх триггеров)
   ├── click (capture) — Mobile Safari fix, до навигации
   ├── visibilitychange → hidden — вкладка ушла в фон
   └── pagehide — закрытие/переход

5. finalizeAndSend(session, cfg, isFinal=true)
   ├── buildPayload() — сборка ImpressionPayload, включает:
   │   ├── publisher_domain: session.publisherDomain
   │   ├── skippable: cfg.skippable ?? false  (только для video_creative)
   │   ├── fp_hash: session.fpHash ?? undefined (null → поле опускается)
   │   └── presence.event_intervals_ms: session.eventIntervals (если непустой)
   ├── sendBeacon(endpoint, payload)  ← основной
   └── fetch keepalive (payload)      ← fallback

6. Cleanup
   └── снятие всех 10 presence-обработчиков с document
```

**Несколько баннеров на одной странице:** `querySelectorAll` находит все элементы `data-cpmind-creative`, для каждого создаётся независимая сессия с собственным `impression_id` и `session_group_id`. Ошибка в одной сессии не ломает остальные.

---

## Сегментация показа при простое

При непрерывном простое ≥ `PRESENCE_IDLE_TIMEOUT_MS` (дефолт 60 сек) показ разрывается на сегменты вместо того, чтобы засчитывать простой как единый непрерывный просмотр.

**Алгоритм разрыва (`segment.ts → startNewSegment()`):**

1. `finalizeAndSend(session, cfg, isFinal=false)` — отправить текущий сегмент
2. `resetSessionForNewSegment()` — сброс полей сессии in-place (без пересоздания объекта, без потери event-листенеров). Сбрасывает `lastThrottledEventTimestamp` и `eventIntervals`. `fpHash` **не сбрасывается** — fingerprint устройства одинаков для всех сегментов одной сессии.
3. `resetSegmentS1()` — пересоздание IntersectionObserver (свежий callback для нового сегмента)
4. `resetSegmentS2()` — очистка накопленных сэмплов
5. `resetSegmentS3()` — сброс running stats, таймеров пауз, `pauseCheckInterval`
6. `resetSegmentS4()` — сброс `visibility_state_history`, счётчиков переключений
7. `resetSegmentS5()` — сброс счётчиков взаимодействия, приватных замыканий
8. `resetSegmentS6()` — сброс всех accumulator-полей in-place; video element ref и event listeners сохраняются; при воспроизводящемся видео инициализирует состояние нового сегмента от текущего положения
9. `resetSegmentS7()` — сброс persistence-сэмплов (`is_above_the_fold` **не сбрасывается** — свойство загрузки страницы, не сегмента)
9. `session.segmentIndex++` — следующий сегмент получает тот же `session_group_id`, новый `segment_index`, новый `impression_id`

**Ключевое свойство `isFinal=false`:** `session.sent` не залипает — следующий сегмент тоже будет отправлен. При `isFinal=true` (`session.sent = true`) дальнейшие вызовы `finalizeAndSend` идемпотентны.

**Ограничение:** если вкладка хотя бы раз ушла в фон (`visibilitychange → hidden`), сегментация по простою для этой страницы отключается — остаётся только финальная отправка при закрытии/уходе. Принятое ограничение, не дефект.

---

## Модули тега

### `src/index.ts` — entry point

IIFE-обёртка: `(function() { ... })()` — не загрязняет глобальное пространство имён страницы. Глобальный `try/catch` на весь код тега — ошибка внутри тега не ломает страницу и не блокирует навигацию по кликовой ссылке баннера.

### `src/constants.ts` — калибруемые константы

Единственная точка чтения 19 констант из ambient-идентификаторов `__CPMIND_CONSTANTS__` и `__CPMIND_TAG_VERSION__`, подставляемых esbuild через `define` при сборке. В runtime — это просто `const constants = { ... }` с конкретными числами, вшитыми в бандл.

### `src/types.ts` — типы состояния сессии

- `TagConfig` — конфигурация из data-атрибутов + `tagUuid` + `tagConstantsVersion`; `creativeType` расширен `'video_creative'`. Новые поля в текущей сессии:
  - `publisherDomain?: string` — явный домен из `data-publisher-domain` (опционально; если не задан, `getPublisherDomain()` определяет автоматически)
  - `skippable?: boolean` — из `data-skippable="true"` для video_creative; `exactOptionalPropertyTypes`-safe через conditional spread `...(val !== undefined && { skippable: val })`
- `Session` — полное состояние одной сессии показа; добавлено `s6: SignalsS6State | null` между S5 и S7. Новые поля:
  - `publisherDomain: string` — вычисленный домен площадки (никогда не null — всегда есть значение, минимум `unknown_{hash}`)
  IVT-поля: `lastThrottledEventTimestamp: number | null`, `eventIntervals: number[]` (cap 50). Служебное поле: `fpHash: string | null`.
- `VisibilityEntry` — запись истории состояний видимости вкладки (для S4)
- `SignalsS3State` — состояние Welford-аккумулятора для S3
- `SignalsS6State` — внутренний tracking state: `videoEl`, `duration`, `lastSeekTime`, `isSeeking`, `videoEndedInSegment`, `audibleTimeStart`, `everMuted/UnmutedWhilePlaying` + payload-поля (без `muted_throughout` — вычисляется в `getS6Data`). Новые поля в текущей сессии: `completionRatePct: number | null` (текущий числовой % досмотра)
- `S6RawData` — финальный объект для payload. Новые поля: `completion_rate_pct: number | null`, `duration_sec: number | null`, `skippable: boolean`

### `src/config.ts` — `parseConfig()`

Читает data-атрибуты контейнера. Обязательные: `data-tag-uuid` (regex-валидация формата UUID), `data-campaign-id`, `data-creative-id`, `data-creative-type`, `data-endpoint`. `VALID_CREATIVE_TYPES` включает `'video_creative'`. `tagConstantsVersion` — из `constants.ts`, не из data-атрибута: версия "знает себя" из сборки.

**Новые атрибуты (текущая сессия):**

`data-publisher-domain` (опционально) — читается через `el.dataset.publisherDomain`. Передаётся в `TagConfig.publisherDomain` через `exactOptionalPropertyTypes`-safe spread:
```typescript
...(publisherDomain !== undefined && { publisherDomain })
```
Прямое `cfg.publisherDomain = publisherDomain` запрещено при `exactOptionalPropertyTypes: true` — опциональное поле не может быть присвоено через `undefined` явно.

`data-skippable` (опционально, только для `video_creative`) — читается как `el.dataset.skippable === 'true'`. Аналогичный `exactOptionalPropertyTypes`-safe conditional spread в результат `parseConfig()`.

### `src/session.ts`

- `createSession(cfg)` — начальное состояние: генерация `impression_id` (UUID v4), `session_group_id` (тот же формат, неизменен на всё время жизни тега на странице), `segment_index = 0`. IVT-поля: `fpHash: null`, `lastThrottledEventTimestamp: null`, `eventIntervals: []`. **Новое (текущая сессия):** `publisherDomain: getPublisherDomain(cfg.publisherDomain)` — вызывается при создании сессии, результат сохраняется в `session.publisherDomain`. Домен вычисляется один раз на момент инициализации.
- `buildPayload()` — сборка `ImpressionPayload` для отправки. Включает `tag_uuid` и `tag_constants_version` из `cfg`. IVT-поля: `fp_hash: session.fpHash ?? undefined` (undefined → поле не сериализуется), `presence.event_intervals_ms: session.eventIntervals.length > 0 ? session.eventIntervals : undefined`. **Новое (текущая сессия):**
  - `publisher_domain: session.publisherDomain`
  - `skippable: cfg.skippable ?? false`
- `resetSessionForNewSegment()` — сбрасывает `lastThrottledEventTimestamp: null`, `eventIntervals: []`. `fpHash` не сбрасывается. `publisherDomain` не сбрасывается — домен площадки постоянен для всей сессии.
- `computeActiveTimeMsInRange()` — пересчёт S4 active time строго в границах `[timestamp_start, timestamp_end]` из `visibility_state_history`. **Фикс P-05:** старый `Math.min(activeTimeMs, totalDuration)` маскировал рассинхрон таймеров через потолок, не устранял его.
- `resetSessionForNewSegment()` — обнуление полей сессии in-place при разрыве показа

### `src/segment.ts` — `startNewSegment()`

Оркестратор разрыва показа. Вызывается из `onIdle()` callback в `presence.ts`. Последовательно: финализация текущего сегмента → сброс сессии → сброс каждого сигнала → инкремент `segmentIndex`.

### `src/utils/publisher_domain.ts` (новый)

Определение домена площадки размещения баннера.

**`getPublisherDomain(configDomain?: string): string`** — fallback цепочка:

```
1. configDomain (из data-publisher-domain) → если валиден
2. new URL(document.referrer).hostname     → если referrer не пустой и парсится
3. window.location.hostname                → hostname текущей страницы
4. `unknown_${djb2Hash(window.location.href + navigator.userAgent)}` → абсолютный fallback
```

Каждый шаг проходит через `isValidPublisherDomain()`. При невалидном значении — следующий fallback.

**`isValidPublisherDomain(domain: string): boolean`**:
- Не пустая строка
- Длина ≤ 253 символа
- Не начинается/заканчивается точкой
- Не является `localhost` или числовым IP (упрощённая эвристика)
- Соответствует RFC 1123 hostname-паттерну

**`djb2Hash(str: string): string`** — детерминированный хэш для `unknown_*` fallback:

```typescript
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;  // unsigned 32-bit
  }
  // 6 hex chars + length suffix для защиты от анаграммных коллизий
  return hash.toString(16).padStart(6, '0').slice(0, 6) + str.length.toString(16);
}
```

Суффикс длины строки в hex защищает от коллизий между анаграммами: `"abc"` и `"bca"` могут давать одинаковый djb2-хэш, но имеют одинаковую длину — суффикс не помогает в этом крайнем случае, но значительно снижает вероятность ложного совпадения в практических сценариях.

**Почему не `crypto.randomUUID()`:** fallback должен быть детерминированным — один и тот же клиент при повторном показе без `document.referrer` должен давать одинаковый `publisher_domain`, иначе аналитика по площадкам будет засорена уникальными значениями.

### `src/utils/uuid.ts`

`generateUUID()`: `crypto.randomUUID()` как основной метод + `crypto.getRandomValues()` polyfill для Safari 14 (не поддерживал `randomUUID` в ранних версиях).

### `src/utils/device.ts`

`detectDeviceType()`: `'desktop' | 'mobile' | 'tablet'`. Используется в S5 для маршрутизации между desktop и mobile обработчиками событий.

---

## Сбор сигналов — детали реализации

### S1 (`signals/s1.ts`) — Time-in-View

`IntersectionObserver` с порогами из `S1_VIEWPORT_THRESHOLDS` (текущее значение `[0, 0.75, 1.0]`, было `[0, 0.5, 1.0]`). При пересечении порога **0.75** запускается таймер видимости. При выходе — таймер останавливается, время добавляется к `time_in_view_sec`.

**Порог видимости изменён в текущей сессии:** 50% (0.5) → **75% (0.75)**, минимальное непрерывное время 1.0s → **2.0s**. Основание: Zhang & Chen 2015, Uhl et al. 2020 (n=350k+ показов) — пользователи, действительно воспринявшие баннер, в среднем держат ≥75% видимости ≥2 секунды. MRC-стандарт 50%/1s недооценивает реальную планку восприятия.

**`mrcCompliant`** — пересчитан: `time_in_view_sec >= 2.0 && visible_pixels_pct >= 75`. Значение хранится в `session.s1.mrc_compliant` и включается в payload для аналитики.

`resetSegmentS1()` — **пересоздание** `IntersectionObserver`, не просто обнуление счётчиков. Гарантирует свежий intersection-callback для нового сегмента.

Накапливает: `time_in_view_sec`, `max_continuous_view_sec`, `visible_pixels_pct`, `mrc_compliant`.

### S2 (`signals/s2.ts`) — Share of Screen

Сэмплирование через `setInterval` с интервалом `S2_SAMPLE_INTERVAL_MS` (дефолт 500 мс). В каждом тике: `getBoundingClientRect()` → видимая область пересечения с viewport → `visible_area / viewport_area × 100`. Среднее по всем тикам.

Прекращает накопление после `session.sent = true` — предотвращает учёт времени после отправки.

`resetSegmentS2()` — очистка массива накопленных сэмплов (новый интервал наполнит заново).

### S3 (`signals/s3.ts`) — Scroll Velocity

rAF-throttled обработчик `scroll`. Зона наблюдения: ±`SCROLL_ZONE_PX` пикселей от баннера (дефолт 300 px).

**Welford's online algorithm** для `mean` и `std_dev` скорости скролла без накопления истории. Обновляется на каждое событие.

7 калибруемых порогов: `PAUSE_THRESHOLD_MS`, `STREAK_WINDOW_MS`, `STREAK_MIN_EVENTS`, `STREAK_MIN_SPEED`, `READING_SPEED_MAX`, `READING_TIME_MIN`, `SCROLL_ZONE_PX`.

**Cross-domain iframe:** если баннер внутри iframe с другим доменом — scroll-события недоступны. Тег детектирует это состояние и устанавливает `session.s3 = null`. Backend обрабатывает `null` через перераспределение весов (`computeEffectiveWeights`).

`resetSegmentS3()` — сброс Welford running stats, таймеров пауз, `pauseCheckInterval`.

### S4 (`signals/s4.ts`) — Tab Activity

`document.visibilitychange` listener. Ведёт `visibility_state_history` — массив записей `{ state, timestamp }`. При финализации показа `computeActiveTimeMsInRange()` (из `session.ts`) вычисляет суммарное время в состоянии `visible` строго в пределах `[timestamp_start, timestamp_end]`.

`resetSegmentS4()` — сброс истории и счётчика `tab_switches_count`.

### S5 (`signals/s5.ts`) — Interaction Events

Маршрутизация по `device_type`:

**Desktop события:**
- `click` → `clicked = true`, уровень 100
- `mouseenter/leave` → начало/конец наведения, учёт длительности
- `mousemove` с дедупликацией (`MOUSE_MOVE_DEDUP_PX`) → proximity + trajectory entropy
- Энтропия траектории: дисперсия углов движения → `ENTROPY_ANGLE_THRESHOLD` → детект случайного vs. целенаправленного движения

**Mobile события:**
- `touchstart/end/move` → tapping (`TAP_MAX_OFFSET_PX`, `TAP_MAX_DURATION_MS`), swiping (`SWIPE_MIN_DISTANCE_PX`, поднят с 30 до 60 по итогам P-18)
- `gesturechange` + `GESTURE_SCALE_DELTA_MIN` → zoom. Порог добавлен по итогам P-18: без него любое `gesturechange` без реального масштабирования засчитывалось как zoom

8 констант калибруемы. `EVENT_TYPES` и `AD_SELECTORS` (s7.ts) — **не** калибруются, захардкожены.

`resetSegmentS5()` — сброс счётчиков, приватных замыканий (trajectory state, touch state).

### S6 (`signals/s6.ts`) — Video Engagement + Audibility

`initS6(creativeEl, session, cfg)` — ищет `creativeEl.querySelector('video')`. Если не найден — `session.s6 = null`, модуль не активируется. При обнаружении инициализирует `SignalsS6State` и вешает event listeners. Принимает `cfg` для доступа к `cfg.skippable`.

**Event listeners:** `loadedmetadata` (duration — **теперь сохраняется как `state.duration`** для `duration_sec` в payload), `play` (play_initiated, replay detection при videoEndedInSegment, audible state), `pause` (pause_initiated, accumulateAudibleTime), `ended` (completion, audible_quartile_100, вычисляет `completion_rate_pct = 100`), `timeupdate` (quartile detection, volume_level, **вычисляет текущий `completionRatePct = (currentTime / duration) * 100` в реальном времени**), `volumechange` (audibility tracking, unmuted_by_user detection через previousMuted closure), `seeking`/`seeked` (isSeeking flag, rewind detection при currentTime < lastSeekTime − 0.5с), click на `[data-cpmind-skip]` (skipped).

**Новые поля в текущей сессии:**
- `completionRatePct: number | null` в `SignalsS6State` — текущий % досмотра, обновляется в `timeupdate`. При `ended` принудительно 100. При `skipped` — фиксируется на момент skip.
- `duration_sec` в `S6RawData` — из `state.duration` (загружается в `loadedmetadata`). `null` если видео не загрузилось до отправки.
- `skippable: boolean` в `S6RawData` — из `cfg.skippable ?? false`. Не отслеживается в state — просто копируется при `getS6Data()`.

**Audibility:** `isAudible(video)` = `!video.muted && video.volume > 0`. `accumulateAudibleTime()` — финализирует накопленное audible время в state. `audibleTimeStart` — timestamp начала текущего audible-периода.

**`detectAudioConnection()`** — async, через `navigator.mediaDevices.enumerateDevices()` только при наличии выданного разрешения (без проактивного запроса). Определяет bluetooth → headphones → speaker по label устройства. Fallback: `'unknown'`.

**`resetSegmentS6(session)`** — аккумулирует оставшееся audible время, сбрасывает все поля кроме `videoEl`, `audio_connection`, `duration`. Не пересоздаёт event listeners. Инициализирует начальное состояние нового сегмента от текущего состояния видео. `completionRatePct` сбрасывается в `null`.

**`getS6Data(state, cfg)`** — вычисляет финальный `S6RawData`: финализирует `audible_time_sec`, вычисляет `muted_throughout` (play_initiated && !everUnmutedWhilePlaying) и `muted_status` из everMuted/Unmuted флагов. Копирует `completion_rate_pct: state.completionRatePct`, `duration_sec: state.duration ?? null`, `skippable: cfg.skippable ?? false`. Вызывается из `buildPayload()`.

### S7 (`signals/s7.ts`) — Page Context

**Статические поля при инициализации** (вычисляются один раз):
- `creative_position_y_px` — позиция баннера на странице
- `page_height_total_px` — высота страницы
- `is_above_the_fold` — виден ли баннер без прокрутки

**Динамическое сэмплирование** каждые `S7_SAMPLE_INTERVAL_MS` (дефолт 1000 мс, отдельная константа от `S2_SAMPLE_INTERVAL_MS`):
- `competing_ads_visible` — подсчёт конкурирующих баннеров в viewport (эвристика AdTech-доменов + CSS-селекторы `AD_SELECTORS`, захардкожены)
- `viewability_persistence_pct` — доля тиков, когда баннер был виден

`resetSegmentS7()` — сброс persistence-сэмплов. `is_above_the_fold` **не сбрасывается** — это свойство загрузки страницы, не текущего сегмента.

### Presence (`signals/presence.ts`) — F_Presence

Отслеживает 10 типов пользовательских событий на `document`:
`mousemove`, `mousedown`, `mouseup`, `click`, `touchstart`, `touchend`, `keydown`, `keyup`, `scroll`, `wheel`.

Throttle 100 мс для обновления `last_user_event_timestamp`. В том же throttle-блоке: вычисляется дельта `now - session.lastThrottledEventTimestamp` и добавляется в `session.eventIntervals` (cap 50 через `shift()` при превышении). `lastThrottledEventTimestamp` обновляется после записи интервала. Без throttle для `events_count_during_impression`.

`resetSegment()` — сбрасывает `lastThrottledEventTimestamp: null` и `eventIntervals: []` наряду с существующими полями.

Таймер простоя (`PRESENCE_IDLE_TIMEOUT_MS`): при отсутствии событий в течение порога запускается `onIdle()` callback — `startNewSegment()` для разрыва показа.

**Синхронизация с backend:** `PRESENCE_IDLE_TIMEOUT_MS` — тот же источник (`constants.ts` → `DEFAULT_TAG_CONSTANTS` или конкретная версия), что backend резолвит из `tag_constants_version` в payload. Единственный источник истины, не два независимых значения.

Возвращает `{ cleanup, resetSegment }` — не одну `cleanup`-функцию (изменение по итогам P-15 для поддержки сброса сегмента без снятия обработчиков).

### GIVT & SIVT (`signals/headless.ts`) — Device Fingerprint для IVT

`collectFpHash(): Promise<string | null>` — вычисляет необратимый отпечаток устройства для IVT-детекции частотных аномалий.

**Компоненты хэша:**
1. Canvas fingerprint (200×50, специфичный текст + заливки — различает GPU-рендерер)
2. `navigator.userAgent`
3. `screen.width × screen.height × screen.colorDepth`
4. `new Date().getTimezoneOffset()`
5. `navigator.language`

Компоненты объединяются через `|`, хэшируются `crypto.subtle.digest('SHA-256', ...)`, берутся первые 32 символа hex-строки (16 байт / 128 бит).

**Обёртка `try/catch`:** любая ошибка → `null`. Типичные причины: `crypto.subtle` недоступен на HTTP (только HTTPS), canvas заблокирован браузерным расширением, приватный режим. Показ не отбрасывается — `fp_hash` просто отсутствует в payload.

**Fire-and-forget:** вызывается в `index.ts` через `void collectFpHash().then(hash => { session.fpHash = hash; })`. Не блокирует инициализацию S1–S7. SHA-256 через `crypto.subtle` завершается за <5 мс — до первого unload trigger `fp_hash` гарантированно вычислен в подавляющем большинстве случаев.

**`FP_COMPONENTS_MAX_LENGTH = 256`** — UA-строки могут достигать 500+ символов. Truncate перед хэшированием защищает от payload-bloat при сохранении достаточной энтропии.

**Юридический статус:** PII не передаётся и не хранится. Компоненты не покидают браузер — только итоговый хэш. Необратим. Не является персональными данными по 152-ФЗ/GDPR.

---

## Транспорт и гарантия доставки

### `transport/send.ts`

**`finalizeAndSend(session, cfg, isFinal)`:**

- При `isFinal=true`: устанавливает `session.sent = true` — идемпотентность, повторные вызовы игнорируются
- При `isFinal=false` (промежуточный сегмент): `session.sent` не залипает → следующий сегмент тоже отправится
- Вызывает `buildPayload()` → `sendPayload()`

**`sendPayload(endpoint, payload)`:**

```
1. sendBeacon(endpoint, JSON + Content-Type: application/json)
   ↓ если sendBeacon недоступен или вернул false
2. fetch(endpoint, { method: 'POST', body: JSON, keepalive: true })
```

`keepalive: true` гарантирует доставку даже при закрытии страницы (аналог `sendBeacon`).

**`attachUnloadHandlers()`** — три обработчика:

1. **`click` (capture=true)** — Mobile Safari fix. При клике по баннеру iOS Safari начинает навигацию немедленно. `sendBeacon` в обработчике click с `capture:true` вызывается **до** начала навигации — единственный надёжный способ доставки данных при переходе по ссылке в iOS Safari. Дополнительно: если `session.s6 !== null` и `e.target.closest('[data-cpmind-skip]') !== null` — устанавливает `session.s6.skipped = true` **до** вызова `finalizeAndSend`. Порядок гарантирован: `capture=true` обрабатывает event до того, как он доходит до skip-кнопки нативно.
2. **`visibilitychange`** — когда вкладка уходит в фон
3. **`pagehide`** — при закрытии вкладки или переходе

При любом из трёх событий: `finalizeAndSend(session, cfg, isFinal=true)` + `cleanupPresence()` (снятие всех 10 presence-обработчиков с `document`).

---

## Debug-режим

Активируется через URL-параметр `?cpmind_debug=1` или `data-debug="true"` на контейнере.

`src/debug/overlay.ts` — DOM-оверлей в правом нижнем углу страницы. Обновляется каждые 250 мс. Показывает в реальном времени: `time_in_view` (с меткой **≥75% visible**, было ≥50%), `share_of_screen`, `scroll_speed`, `tab_active`, `top_event`, S6-секция (для video_creative: `play`, `completion%`, `muted`, `audible_sec`, `replays`), `Presence events`, `FP hash` (первые 8 символов + `...`, или `null`), `Intervals n` (размер буфера `eventIntervals`), `session_group_id`, `device_type`. **Новое (текущая сессия):** в footer оверлея отображается `publisher_domain` — текущее вычисленное значение домена площадки из `session.publisherDomain`.

**Не влияет на логику сбора данных** — только визуализация. Предназначен для отладки командой CPMind, не для клиентов.

**`test/banner-test.html`** — тестовая страница для локальной отладки.

```bash
# Запуск локального сервера из корня монорепо
python3 -m http.server 8080
# Открыть в браузере:
# http://localhost:8080/test/banner-test.html?cpmind_debug=1
```

При открытии через `file://` Safari ненадёжно стреляет `visibilitychange` и `pagehide` — показ записывается надёжно только при клике по баннеру. На реальных HTTPS-страницах все три триггера работают корректно в любом браузере.

---

## Браузерная совместимость

| Браузер | Версия |
|---|---|
| Chrome | 90+ |
| Firefox | 90+ |
| Safari | 14+ |
| Edge | 90+ |

**Использованные API:**
- `IntersectionObserver` — S1
- `getBoundingClientRect` — S2
- `requestAnimationFrame` — S3
- `document.visibilityState` / `visibilitychange` — S4
- `PointerEvent` / `TouchEvent` / `GestureEvent` — S5
- `HTMLVideoElement` events (`play`, `pause`, `ended`, `timeupdate`, `volumechange`, `seeking`, `seeked`, `loadedmetadata`) — S6
- `navigator.mediaDevices.enumerateDevices()` — S6 audio connection (опционально, без запроса разрешения)
- `sendBeacon` + `fetch keepalive` — транспорт
- `crypto.randomUUID()` + `crypto.getRandomValues()` polyfill — UUID
- `crypto.subtle.digest('SHA-256', ...)` — device fingerprint (только HTTPS; null fallback на HTTP)
- `HTMLCanvasElement.getContext('2d').toDataURL()` — canvas fingerprint компонент
- `querySelectorAll` — поддержка нескольких баннеров

---

## Важные архитектурные решения

**IIFE-изоляция.** Весь код завёрнут в `(function() { ... })()`. Никаких глобальных переменных. Ошибка внутри тега не достигает `window.onerror` страницы клиента и не блокирует кликовую ссылку баннера.

**Нет коммита артефакта.** `dist/` в `.gitignore`. Версионированные файлы генерируются backend-ом в runtime и живут в Docker volume, а не в git-репозитории.

**`@cpmind/shared` — devDependency.** Типы используются только при компиляции. После `esbuild` в выходном бандле нет никаких следов shared-пакета — только браузерный JS.

**Константы через `define`, не через HTTP.** `tag_uuid` и 19 констант вшиты в конкретный файл при сборке. Нет сетевого запроса при инициализации, нет зависимости от доступности сервера в момент загрузки тега.

**Сброс сегмента in-place.** `resetSessionForNewSegment()` мутирует объект сессии, не создаёт новый. Это позволяет сохранить все event-листенеры (S1–S7, presence, unload handlers) неизменными между сегментами — не нужно пересоздавать их при каждом разрыве.

**`computeActiveTimeMsInRange()` из истории состояний.** P-05: правильный подход — вычислять active time из `visibility_state_history`, а не хранить накапливающийся счётчик, который может рассинхронизироваться с таймерами при скрытии/показе вкладки.

**`S7_SAMPLE_INTERVAL_MS` vs `S2_SAMPLE_INTERVAL_MS`.** Две разные константы для двух разных сигналов, хотя дефолтные значения исторически совпадали.

**S6 event listeners не пересоздаются при сегментации.** `resetSegmentS6()` мутирует state in-place, сохраняя ссылку на `<video>` элемент и все навешенные listeners — по аналогии с S1–S5. Исключение: IntersectionObserver для S1 пересоздаётся явно, для S6 аналогичной необходимости нет.

**`muted_throughout` — вычисляемое поле.** Не хранится в `SignalsS6State`, вычисляется в `getS6Data()` как `play_initiated && !everUnmutedWhilePlaying` — единственный источник истины, без риска рассинхронизации при сегментации.

**`skippable` из `TagConfig`, не из `SignalsS6Schema`.** Это атрибут размещения (знает издатель при размещении тега), а не атрибут поведения видео (который менялся бы в runtime). Поэтому `skippable` живёт в `TagConfig` и `ImpressionPayloadSchema` на top-level, а не внутри `s6`. Не входит в `SignalsS6Schema` — нет смысла дублировать статичное поле конфигурации в динамически накапливаемые данные S6.

**`completion_rate_pct` — числовое поле, не выводится из булевых.** Quartile-флаги (`quartile_25/50/75`, `completion`) сохранены для обратной совместимости. `completion_rate_pct` — отдельный числовой % досмотра, обновляемый в `timeupdate` из `currentTime / duration`. Логистическая модель S6 использует его как основной непрерывный признак, более информативный чем дискретные квартили.

**`publisher_domain` — детерминированный fallback, не случайный.** При отсутствии всех источников (`referrer`, `location.hostname`) используется `djb2Hash` от URL + UA. Детерминированность критична: один и тот же клиент на одной и той же странице без `document.referrer` должен давать одинаковый `publisher_domain` во всех показах — иначе аналитика по площадкам будет засорена уникальными `unknown_*` значениями. Суффикс длины строки защищает от наиболее вероятных анаграммных коллизий.

**Replay vs rewind.** `replay_count` инкрементируется в двух случаях: видео дошло до `ended` и снова запустилось (повторный просмотр), либо `seeked` с `currentTime < lastSeekTime − 0.5с` (перемотка назад). Порог 0.5с исключает float-погрешности `currentTime`. Разделены явно, чтобы калибровка одного не ломала другой.

**`collectFpHash()` — fire-and-forget, не блокирует инициализацию.** `void collectFpHash().then(hash => session.fpHash = hash)` запускается сразу после `createSession()` до `initS1`–`initS7`. Async не блокирует event-листенеры. При закрытии вкладки за первые ~100 мс хэш может не успеть вычислиться — `fp_hash` будет `null` в payload. Принятый trade-off: не задерживать инициализацию ради IVT-сигнала.

**`eventIntervals` — кольцевой буфер cap 50.** `Array.shift()` при превышении cap — O(n) на каждый сдвиг, но при cap=50 это 50 операций — пренебрежимо. `Infinity` возвращается из `stdDev()` при менее 2 элементах — SIVT-правило не срабатывает при недостаточной выборке.

**`fpHash` не сбрасывается при сегментации.** В отличие от всех сигнальных полей, fingerprint устройства постоянен в рамках одной страницы. Все сегменты одного показа несут один и тот же `fp_hash` — это корректно для cross-session частотного анализа в batch-job.

---

## Изменения, внесённые в сессию bug-fixing / signal modifications

| Файл | Изменение |
|---|---|
| `src/utils/publisher_domain.ts` | **NEW** — `getPublisherDomain(configDomain?)`, `isValidPublisherDomain()`, `djb2Hash()`. Fallback цепочка: config → referrer → location.hostname → unknown_{hash} |
| `src/types.ts` | `TagConfig.publisherDomain?: string` (опционально, exactOptionalPropertyTypes-safe); `TagConfig.skippable?: boolean`; `Session.publisherDomain: string`; `SignalsS6State.completionRatePct: number | null`; `S6RawData.completion_rate_pct`, `S6RawData.duration_sec`, `S6RawData.skippable` |
| `src/config.ts` | Чтение `data-publisher-domain` через `el.dataset.publisherDomain` → `TagConfig.publisherDomain`; чтение `data-skippable` → `TagConfig.skippable`; оба через conditional spread |
| `src/session.ts` | `createSession(cfg)` вычисляет `publisherDomain: getPublisherDomain(cfg.publisherDomain)`; `buildPayload()` включает `publisher_domain` и `skippable: cfg.skippable ?? false`; `publisherDomain` не сбрасывается в `resetSessionForNewSegment()` |
| `src/signals/s1.ts` | `IntersectionObserver` threshold `0.5` → `0.75`; таймер видимости `>= 1.0s` → `>= 2.0s`; `mrcCompliant: time_in_view_sec >= 2.0 && visible_pixels_pct >= 75` |
| `src/signals/s6.ts` | `initS6` принимает `cfg`; `loadedmetadata` сохраняет `state.duration`; `timeupdate` вычисляет `completionRatePct`; `ended` устанавливает `completionRatePct = 100`; `getS6Data(state, cfg)` возвращает `completion_rate_pct`, `duration_sec`, `skippable`; `resetSegmentS6` сбрасывает `completionRatePct`, сохраняет `duration` |
| `src/debug/overlay.ts` | Метка видимости "≥75% visible" (было ≥50%); `publisher_domain` в footer оверлея |