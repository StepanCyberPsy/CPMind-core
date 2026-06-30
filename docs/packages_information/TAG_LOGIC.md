# CPMind Tag — `packages/tag`

JS-тег для встраивания в произвольную HTML-страницу с рекламным баннером. Собирается в один минифицированный файл (~22–24 КБ) через esbuild. Не импортирует `@cpmind/shared` в runtime — только браузерные API. Зависимость от `@cpmind/shared` — `devDependency` исключительно для типизации `TagConstantsValues` на этапе сборки; компилятор вытирает её из выходного бандла.

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
    ├── config.ts             # parseConfig(): data-атрибуты контейнера
    ├── session.ts            # управление состоянием сессии
    ├── segment.ts            # оркестратор разрыва показа
    ├── signals/
    │   ├── s1.ts             # Time-in-View (IntersectionObserver)
    │   ├── s2.ts             # Share of Screen (сэмплирование)
    │   ├── s3.ts             # Scroll Velocity (rAF + Welford)
    │   ├── s4.ts             # Tab Activity (visibilitychange)
    │   ├── s5.ts             # Interaction Events (click/touch/hover)
    │   ├── s7.ts             # Page Context (позиция, конкуренция)
    │   └── presence.ts       # F_Presence (таймер активности пользователя)
    ├── transport/
    │   └── send.ts           # finalizeAndSend(), sendPayload(), attachUnloadHandlers()
    ├── utils/
    │   ├── uuid.ts           # generateUUID() + Safari 14 polyfill
    │   └── device.ts         # detectDeviceType()
    └── debug/
        └── overlay.ts        # DOM-оверлей для ?cpmind_debug=1
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
  style="width: 728px; height: 90px;"
>
  <a href="https://ваш-сайт.ru">
    <img src="баннер.jpg" width="728" height="90" />
  </a>
</div>

<!-- 2. Скрипт тега (один раз в конце страницы) -->
<script async src="https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js"></script>
```

**`data-tag-uuid`** — единственный идентификатор, по которому backend привязывает показ к владельцу. Версия тега и 19 констант зашиты в конкретный файл через esbuild `define` — не передаются через data-атрибуты.

**Перевод на новую версию** — ручная замена `<script src>`. Обновление констант на уже размещённом теге не происходит автоматически при создании новой версии.

**Поддерживаемые типы баннеров:** `banner_static`, `banner_gif`, `banner_html5`.

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
           ├── initS1(), initS2(), initS3(), initS4(), initS5(), initS7()
           ├── initPresence()
           └── attachUnloadHandlers()

3. Сбор сигналов (параллельно, пока пользователь на странице)
   ├── S1: IntersectionObserver — время видимости
   ├── S2: сэмплирование каждые 500 мс — доля экрана
   ├── S3: rAF-throttled scroll — паттерн скролла
   ├── S4: visibilitychange — активность вкладки
   ├── S5: click/touch/hover — взаимодействие
   ├── S7: позиция + сэмплирование каждые 1000 мс
   └── presence: 10 типов событий, таймер простоя

4. Отправка (один из трёх триггеров)
   ├── click (capture) — Mobile Safari fix, до навигации
   ├── visibilitychange → hidden — вкладка ушла в фон
   └── pagehide — закрытие/переход

5. finalizeAndSend(session, cfg, isFinal=true)
   ├── buildPayload() — сборка ImpressionPayload
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
2. `resetSessionForNewSegment()` — сброс полей сессии in-place (без пересоздания объекта, без потери event-листенеров)
3. `resetSegmentS1()` — пересоздание IntersectionObserver (свежий callback для нового сегмента)
4. `resetSegmentS2()` — очистка накопленных сэмплов
5. `resetSegmentS3()` — сброс running stats, таймеров пауз, `pauseCheckInterval`
6. `resetSegmentS4()` — сброс `visibility_state_history`, счётчиков переключений
7. `resetSegmentS5()` — сброс счётчиков взаимодействия, приватных замыканий
8. `resetSegmentS7()` — сброс persistence-сэмплов (`is_above_the_fold` **не сбрасывается** — свойство загрузки страницы, не сегмента)
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

- `TagConfig` — конфигурация из data-атрибутов + `tagUuid` + `tagConstantsVersion`
- `Session` — полное состояние одной сессии показа: все накопленные сигналы, `sessionGroupId` (неизменен при сбросе сегмента), `segmentIndex`, флаг `sent`
- `VisibilityEntry` — запись истории состояний видимости вкладки (для S4)
- `SignalsS3State` — состояние Welford-аккумулятора для S3

### `src/config.ts` — `parseConfig()`

Читает data-атрибуты контейнера. Обязательные: `data-tag-uuid` (regex-валидация формата UUID), `data-campaign-id`, `data-creative-id`, `data-creative-type`, `data-endpoint`. `tagConstantsVersion` — из `constants.ts`, не из data-атрибута: версия "знает себя" из сборки.

### `src/session.ts`

- `createSession()` — начальное состояние: генерация `impression_id` (UUID v4), `session_group_id` (тот же формат, неизменен на всё время жизни тега на странице), `segment_index = 0`
- `buildPayload()` — сборка `ImpressionPayload` для отправки. Включает `tag_uuid` и `tag_constants_version` из `cfg`
- `computeActiveTimeMsInRange()` — пересчёт S4 active time строго в границах `[timestamp_start, timestamp_end]` из `visibility_state_history`. **Фикс P-05:** старый `Math.min(activeTimeMs, totalDuration)` маскировал рассинхрон таймеров через потолок, не устранял его. Новый подход: ответ берётся из истории состояний, не из потенциально рассинхронизированных счётчиков
- `resetSessionForNewSegment()` — обнуление полей сессии in-place при разрыве показа

### `src/segment.ts` — `startNewSegment()`

Оркестратор разрыва показа. Вызывается из `onIdle()` callback в `presence.ts`. Последовательно: финализация текущего сегмента → сброс сессии → сброс каждого сигнала → инкремент `segmentIndex`.

### `src/utils/uuid.ts`

`generateUUID()`: `crypto.randomUUID()` как основной метод + `crypto.getRandomValues()` polyfill для Safari 14 (не поддерживал `randomUUID` в ранних версиях).

### `src/utils/device.ts`

`detectDeviceType()`: `'desktop' | 'mobile' | 'tablet'`. Используется в S5 для маршрутизации между desktop и mobile обработчиками событий.

---

## Сбор сигналов — детали реализации

### S1 (`signals/s1.ts`) — Time-in-View

`IntersectionObserver` с порогами из `S1_VIEWPORT_THRESHOLDS` (дефолт `[0, 0.5, 1.0]`). При пересечении порога 0.5 запускается таймер видимости. При выходе — таймер останавливается, время добавляется к `time_in_view_sec`.

**Стандарт MRC:** порог 50% (0.5) захардкожен в самой проверке видимости, отдельно от калибруемого массива threshold. Нарушение MRC не запрещает запись показа — только влияет на S1.

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

Throttle 100 мс для обновления `last_user_event_timestamp` — без throttle для `events_count_during_impression`.

Таймер простоя (`PRESENCE_IDLE_TIMEOUT_MS`): при отсутствии событий в течение порога запускается `onIdle()` callback — `startNewSegment()` для разрыва показа.

**Синхронизация с backend:** `PRESENCE_IDLE_TIMEOUT_MS` — тот же источник (`constants.ts` → `DEFAULT_TAG_CONSTANTS` или конкретная версия), что backend резолвит из `tag_constants_version` в payload. Единственный источник истины, не два независимых значения.

Возвращает `{ cleanup, resetSegment }` — не одну `cleanup`-функцию (изменение по итогам P-15 для поддержки сброса сегмента без снятия обработчиков).

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

1. **`click` (capture=true)** — Mobile Safari fix. При клике по баннеру iOS Safari начинает навигацию немедленно. `sendBeacon` в обработчике click с `capture:true` вызывается **до** начала навигации — единственный надёжный способ доставки данных при переходе по ссылке в iOS Safari
2. **`visibilitychange`** — когда вкладка уходит в фон
3. **`pagehide`** — при закрытии вкладки или переходе

При любом из трёх событий: `finalizeAndSend(session, cfg, isFinal=true)` + `cleanupPresence()` (снятие всех 10 presence-обработчиков с `document`).

---

## Debug-режим

Активируется через URL-параметр `?cpmind_debug=1` или `data-debug="true"` на контейнере.

`src/debug/overlay.ts` — DOM-оверлей в правом нижнем углу страницы. Обновляется каждые 250 мс. Показывает в реальном времени: `time_in_view`, `share_of_screen`, `scroll_speed`, `tab_active`, `top_event`, `score (preview)`, `session_group_id`, `segment_index`.

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
- `sendBeacon` + `fetch keepalive` — транспорт
- `crypto.randomUUID()` + `crypto.getRandomValues()` polyfill — UUID
- `querySelectorAll` — поддержка нескольких баннеров

---

## Важные архитектурные решения

**IIFE-изоляция.** Весь код завёрнут в `(function() { ... })()`. Никаких глобальных переменных. Ошибка внутри тега не достигает `window.onerror` страницы клиента и не блокирует кликовую ссылку баннера.

**Нет коммита артефакта.** `dist/` в `.gitignore`. Версионированные файлы генерируются backend-ом в runtime и живут в Docker volume, а не в git-репозитории.

**`@cpmind/shared` — devDependency.** Типы используются только при компиляции. После `esbuild` в выходном бандле нет никаких следов shared-пакета — только браузерный JS.

**Константы через `define`, не через HTTP.** `tag_uuid` и 19 констант вшиты в конкретный файл при сборке. Нет сетевого запроса при инициализации, нет зависимости от доступности сервера в момент загрузки тега.

**Сброс сегмента in-place.** `resetSessionForNewSegment()` мутирует объект сессии, не создаёт новый. Это позволяет сохранить все event-листенеры (S1–S7, presence, unload handlers) неизменными между сегментами — не нужно пересоздавать их при каждом разрыве.

**`computeActiveTimeMsInRange()` из истории состояний.** P-05: правильный подход — вычислять active time из `visibility_state_history`, а не хранить накапливающийся счётчик, который может рассинхронизироваться с таймерами при скрытии/показе вкладки.

**`S7_SAMPLE_INTERVAL_MS` vs `S2_SAMPLE_INTERVAL_MS`.** Две разные константы для двух разных сигналов, хотя дефолтные значения исторически совпадали. Разделены явно, чтобы калибровка одного не ломала другой.