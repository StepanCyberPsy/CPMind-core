# OMID_LOGIC.md — `packages/omid`

## Обзор

`@cpmind/omid` — браузерный IIFE-бандл скрипта верификации IAB Open Measurement (OMID 1.5). Исполняется плеером площадки из блока `<AdVerifications>` VAST-ответа CPMind. Это единственный стандартный путь измерить показ, когда на странице издателя нет кода CPMind: площадка ничего не устанавливает, а измерение инициирует сам плеер.

Пакет покрывает оба сценария VAST-доставки: CPMind оборачивает сторонний тег клиента своим Wrapper, либо выдаёт собственный InLine. В обоих случаях блок верификации один и тот же.

---

## Структура пакета

```txt
    ├── [DIR] omid
        ├── [FILE] build.ts
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [FILE] full.ts
            ├── [FILE] gate.ts
            ├── [FILE] global.ts
            ├── [FILE] index.ts
            ├── [FILE] limited.ts
            ├── [FILE] loader.ts
            ├── [FILE] omid-client.d.ts
            ├── [FILE] simid.ts
            ├── [DIR] simid
                ├── [FILE] accumulator.ts
                ├── [FILE] protocol.ts
                ├── [FILE] report.ts
            ├── [FILE] transport.ts
            ├── [FILE] types.ts
            ├── [FILE] vendor.ts
        ├── [DIR] tests
            ├── [FILE] browser_access.mjs
            ├── [FILE] entry_access.test.ts
            ├── [FILE] full_mapping.test.ts
            ├── [FILE] gate.test.ts
            ├── [FILE] limited.test.ts
            ├── [FILE] loader_contract.test.ts
            ├── [FILE] viewable_threshold.test.ts
        ├── [FILE] tsconfig.json
        ├── [FILE] tsconfig.test.json
```

---

## Архитектура

### Почему отдельный пакет

Скрипт исполняется в чужом окружении, которое мы не контролируем: внутри плеера площадки, рядом с чужим кодом, иногда в кросс-доменном iframe без доступа к странице. Собственного окружения у него нет — все значения времени сборки передаются через esbuild `define`, а все значения показа приходят в `<VerificationParameters>`.

Делить код с `@cpmind/display-runtime` или `@cpmind/player` нельзя: те рассчитывают на управляемую CPMind поверхность, которой здесь не существует.

### Зависимости

```
@cpmind/shared ← @cpmind/sdk ← @cpmind/omid
```

Ограниченная ветка не импортирует `@cpmind/shared` в бандл: импорт констант втянул бы Zod и весь слой схем. Значение порога видимости продублировано локально, а тест `viewable_threshold.test.ts` связывает дубль с общим источником — расхождение не пройдёт сборку.

### Рукопожатие

`bootstrap()` создаёт `OmidVerificationClient` из пакета `@iabtechlab-omsdk/open-measurement`, проверяет `isSupported()` и регистрирует наблюдателя:

```ts
client.registerSessionObserver(handler, CPMIND_OMID_VENDOR);
```

`CPMIND_OMID_VENDOR` — `cpmind.tech-omid`, формат `[domain]-[useCase]` по VAST 4.3 §3.17. Ключ вендора обязателен: параметры верификации доставляются только наблюдателю с совпавшим ключом.

События наблюдателя:

| Событие | Обработка |
|---|---|
| `sessionStart` | `startMeasurement` — разбор параметров, выбор ветки, подписки |
| `sessionFinish` | `finalize(event.timestamp)` |
| `sessionError` | `finalize(event.timestamp)` |

Весь `bootstrap()` обёрнут в `try/catch` с пустым обработчиком: ошибка измерения не должна прерывать воспроизведение рекламы.

---

## Уровень доступа (`gate.ts`)

The player must report `accessMode: full` before CPMind checks access to the top document. `friendlyToTop` is diagnostic metadata computed by IAB compliance/validation scripts; it is not guaranteed in the original `sessionStart` context. Missing metadata must not override a successful DOM check.

```ts
export function resolveAccessLevel(
    context: OmidContext | undefined,
    topWindow: Window | null,
): AccessLevel {
    if (context === undefined) return 'limited';
    if (context.accessMode === 'full') {
        return topWindow !== null ? 'full_page' : 'creative';
    }
    return 'limited';
}
```

| Уровень | Условие | Что доступно |
|---|---|---|
| `full_page` | Reported `full` and accessible top document | Eligible for page collectors, subject to successful element validation and initialization |
| `creative` | Reported `full`, but top document inaccessible | OMID events; no complete page measurement |
| `limited` | `accessMode: 'limited'` либо контекста нет | Только события OMID |

For reported `full` only, `getAccessibleTopWindow()` reads the actual top document and catches access errors. Other modes remain partial even when a DOM happens to be reachable. Accessibility does not change the verification script's current window.

**Уровень выдаёт плеер площадки, а не CPMind.** Это решение площадки, и повлиять на него со стороны тега невозможно.

---

## Две ветки измерения

### Ограниченная ветка (`limited.ts`)

Работает **всегда**, независимо от уровня доступа. Если догрузка полной ветки не состоится или опоздает, показ не теряется, а уходит с честной отметкой о неполноте.

Накопитель строится на двух потоках событий OMID:

| Источник | Сигналы |
|---|---|
| `geometryChange` | S1 (время в области видимости), S2 (доля экрана), S4 (активность вкладки) |
| `media` | S6 (видеововлечённость), S5 — только факт клика через `adUserInteraction` |

Ключевые договорённости повторяют основной SDK:

- Интервал между событиями относится к состоянию на момент **предыдущего** события: смена состояния не переписывает уже накопленное время задним числом. Та же конвенция принята в `signals/s1.ts` и `signals/s2.ts` SDK.
- Интервал больше `MAX_INTERVAL_MS` (равен `PRESENCE_IDLE_TIMEOUT_MS`) целиком отбрасывается в `droppedIntervalMs` и разрывает непрерывность: событий могло не быть из-за троттлинга фонового таба, и засчитывать такой разрыв как просмотр нельзя.
- Порог видимости `VIEWABLE_PERCENT` — 75 %, значение связано с общим источником тестом.

Чего в этой ветке нет по построению: **S3** (скорость прокрутки) и **S7** (контекст страницы) не существуют — прокрутки и окружения рекламы вне окна креатива не видно. Композитный Score не рассчитывается: веса предполагают полный набор.

### Полная ветка (`full.ts`, `loader.ts`, `global.ts`)

For `full_page`, `loadFullBranch(targetWindow)` loads the CDN bundle into the verified top document and reads the factory from that same window. Factories use `__cpmindOmidFullV1_<runtimeVersion>`; an old version or the legacy unversioned global is not reused. Concurrent callers share a bounded window/version load. Measurement ownership is separately managed by `full_sessions.ts`: delivery sid plus OMID session identity identifies a run; session-start time is the fallback when OMID identity is unavailable. Different genuine runs remain independent.

The full branch retains the exact element supplied by OMID. Before initializing the SDK it requires a connected element owned by its executing document, whose defaultView is the executing window. Missing or other-document elements stay partial; no arbitrary video search or frame-coordinate conversion is attempted. This keeps sticky geometry and page context in one coordinate system. Shared factory code does not merge state between creatives.

Startup callbacks are ignored after the run has finalized or been replaced; initialization exceptions retain partial fallback. Successful startup delegates finalization to the full branch, without sending an additional partial impression.

Only the first successful caller owns SDK event forwarding and finalization. Duplicate callers receive a non-null passive handle, avoiding both a second full measurement and an additional partial fallback. SDK finalization releases active references; completed identities are retained for 30 minutes, at most 1024 per document/runtime. Active owners are not evicted by that limit. This browser-only protection does not cover page reloads or duplicates after completed-record eviction. Media received while full loading is pending is buffered (maximum 256 events) and replayed once; overflow retains partial collection instead of starting incomplete full measurement.

OMID alone opts into `prepareMeasurementSession({ videoQuartileSource: 'events' })`. Received 25/50/75 reports set only their respective flags, independently of duration; duplicates retain the original audibility evidence. Completion does not fabricate missing quarter flags. Default SDK callers, including the async embed loader/player path, retain progress-based watched-frontier and seek protection. Initial audio mapping and duration-from-start handling are separate concerns.

Внутри — `prepareMeasurementSession` из `@cpmind/sdk`: показ собирается тем же рантаймом, что и при hosted-доставке, со всеми семью сигналами, и уходит полным payload'ом на штатную точку приёма `/api/collect`. Дублировать его частичной записью нельзя — получились бы два показа, поэтому `finalize()` при активной полной ветке только передаёт ей управление.

`resolveCreativeElement` определяет элемент через `nodeType === 1`, а не `instanceof HTMLElement`: элемент может принадлежать другому realm (окну плеера), и проверка через `instanceof` молча вернула бы ложь.

`toVideoEvent` приводит media-события OMID к `VideoMeasurementEvent[]` SDK с `source: 'unknown'` — источник действия (пользователь или плеер) OMID не сообщает.

---

## Доставка параметров

Значения показа неоткуда взять самостоятельно: скрипт не знает ни сессии, ни кампании. Они приходят в `<VerificationParameters>` — штатном канале OMID — JSON-строкой:

```json
{
  "sid": "...", "tag_uuid": "...", "tag_constants_version": "...",
  "campaign_id": "...", "creative_id": "...", "creative_type": "...",
  "placement_uuid": "...", "creative_version_uuid": "...",
  "delivery_kind": "inline | wrapper", "collect_endpoint": "...",
  "delivery_mode": "...", "tag_constants": { }
}
```

Складывать их в URL скрипта нельзя: уникальный адрес на каждый показ лишил бы бандл кэширования на CDN.

---

## Транспорт (`transport.ts`)

`sendMeasurement` — `navigator.sendBeacon` с запасным путём на `fetch` с `keepalive`, `mode: 'cors'`, `credentials: 'omit'`. Отказ отправки подавляется: воспроизведение рекламы важнее.

`buildPartialEndpoint(collectEndpoint)` приписывает `/omid` к адресу основной точки приёма. Приёмник частичных измерений отдельный: контракт `/api/collect` и его обработчик не затрагиваются.

Финализация вызывается из `sessionFinish`, `sessionError`, `pagehide` и `visibilitychange → hidden`; флаг `sent` гарантирует единственную отправку.

---

## Сборка и версионирование

Два независимых бандла IIFE — esbuild делит код только в формате `esm`, а загрузчик подключает вторую часть обычным тегом `script`:

| Бандл | Точка входа | Назначение |
|---|---|---|
| `cpmind-omid_v{N}.min.js` | `src/index.ts` | Загрузчик и ограниченная ветка |
| `cpmind-omid-full_v{N}.min.js` | `src/full.ts` | Коллекторы страницы |

Обе части версионируются совместно через `OMID_RUNTIME_VERSION`: собираются из одного пакета и публикуются одной версией. Ограниченные режимы — вероятное большинство показов — вторую часть не грузят.

Публикация — через `@cpmind/runtime-publisher` в префикс `runtime/` объектного хранилища; backend строит адрес как `${CDN_BASE_URL}/runtime/cpmind-omid_v${OMID_RUNTIME_VERSION}.min.js`.

---

## Задел: интерактивный креатив SIMID 1.2

**Статус: не подключён к продукту.** Точка входа `src/simid.ts` не входит в сборку (`build.ts`), схема отчёта `packages/shared/src/schemas/simid.ts` не входит в публичный экспорт пакета. Backend не выдаёт `<InteractiveCreativeFile>`, приёмника отчёта не существует. Код исполняется только в тестах.

Задел сохранён потому, что протокольная часть верна и переиспользуема, если площадки клиента начнут отдавать действительно интерактивные креативы. Тогда SIMID уместен как креативная технология, а измерение CPMind продолжает ехать через OMID, без связи с этим кодом.

### Почему не подключено

Разбор SIMID 1.2 показал, что механизм не предназначен для измерения и его применение по этому назначению упирается в три ограничения.

**1. Клик по рекламе.** SIMID 1.2 §4.3.10.1 и §6.9: плеер делает iframe креатива видимым, получив `resolve` на `SIMID:Player:startCreative`, и для видеорекламы обязан растянуть его на весь медиаэлемент — «position the iframe over media element at player's upper-left corner and set iframe dimensions to media's width and height». Кросс-доменный iframe перехватывает клик, и изнутри это не исправляется: `pointer-events: none` на границу iframe не действует. При этом §4.4.1 возлагает исполнение clickthrough на креатив: «SIMID delegates clickthrough execution to the creative, including redirecting the user to the landing page». Делегировать переход обратно плееру (`playerHandles: true`) разрешено только при `navigationSupport === 'playerHandles'`, а §4.4.12 прямо указывает: «In web environments, the creative manages navigation».

Отсюда два исхода, и оба неприемлемы для вендора измерений:

- ответить `resolve` и взять клик на себя — `window.open` из iframe зависит от атрибута `sandbox`, выставляемого плеером, а отказ недетектируем: `SIMID:Creative:clickThru` не имеет ответа, когда переход выполняет креатив (§4.4.1 — `resolve` приходит только если переход делает плеер). Revenue-критичный путь с молчаливыми отказами;
- не отвечать на `startCreative` — iframe остаётся скрытым, реклама не затронута, события `SIMID:Media:*` продолжают приходить (они зависят от `resolve` на `init`, а не на `startCreative`). Но спецификация нигде не обещает, что плеер продолжит их посылать креативу, не ответившему на обязательное сообщение, а §4.3.10.2 разрешает плееру выгрузить iframe при `reject` — конформная реализация вправе так же трактовать молчание. Плюс плеер по завершении медиа отправляет VAST error 1213 на каждом показе.

**2. Покрытие сценариев.** `<InteractiveCreativeFile>` находится в `<MediaFiles>` внутри `<InLine>`. В сценарии «CPMind оборачивает чужой тег» InLine нам не принадлежит, поэтому механизм работает только в сценарии «CPMind выдаёт свой тег» — половина требования.

**3. Приобретаемые сигналы.** Поверх OMID SIMID добавляет фактически один наблюдаемый сигнал: перемотку назад как свидетельство повторного просмотра (`replay_count`, сейчас записан нулём и задокументирован как ненаблюдаемый). Остальное — `timeupdate` мельче квартилей и `skippableState`; видимости, геометрии и окружения страницы SIMID не даёт вовсе.

### Состав задела

| Файл | Назначение |
|---|---|
| `src/simid/protocol.ts` | Транспорт §8.1.1: кадрирование сообщений, разбор входящих, `createSession` с криптостойким идентификатором (§8.4), `resolve`/`reject` |
| `src/simid/accumulator.ts` | Чистый накопитель состояния воспроизведения по позиции плейхеда. Интервал относится к состоянию звука на момент предыдущего события; приращение больше `MAX_FORWARD_DELTA_SEC` считается перемоткой, а не просмотром |
| `src/simid/report.ts` | Сборка отчёта в контракте `SimidReportSchema`; `-1` из SIMID («неизвестно») приводится к `null` |
| `src/simid.ts` | Клиент: рукопожатие, разбор `environmentData` и `adParameters`, подписка на `SIMID:Media:*`, отправка отчёта на завершении |

### Чего в заделе нет

Приёмника `POST /api/collect/simid`, колонок в `ad_sessions`, HTML-оболочки креатива, выдачи `<InteractiveCreativeFile>` и `<AdParameters>` из `inline.ts`, публикации бандла в `runtime-publisher`.

Отчёт SIMID по построению является диагностикой рекламной сессии и в показ не сворачивается: показ по тому же сеансу пишет ветка OMID, и объединение двух источников — самостоятельная задача со своими правилами приоритета.

### Инфраструктурное ограничение при подключении

HTML-оболочку креатива плеер загружает в iframe. Блок `location /` для `delivery.cpmind.tech` в `nginx/nginx.conf` отдаёт `X-Frame-Options: DENY`, поэтому оболочка, выданная backend'ом по этому хосту, во фрейм не встанет. Подключение задела требует либо отдельного `location` без этого заголовка, либо публикации оболочки как файла на CDN.

---

## Известные ограничения

| Ограничение | Описание |
|---|---|
| Полнота измерения | Full measurement requires reported `full`, accessible top DOM, the supplied element in that document, and successful SDK startup there. Missing diagnostic `friendlyToTop` is not a denial. Restricted or unsuccessful initialization retains partial signals without composite Score. CPMind does not bypass player/browser access restrictions. |
| S5 | Из доступных событий OMID фиксируется только факт клика. Наведение, жесты и прокрутка внутри креатива не наблюдаемы |
| `replay_count` | Не наблюдаем: повторный просмотр записывается нулём |
| CSP издателя | Догрузка ветки коллекторов — внедрение `script` в верхнее окно. Строгий `script-src` площадки её заблокирует; показ уходит с `page_collectors_loaded: false` |
| Исполнение скрипта | Плеер вправе вовсе не исполнить ресурс верификации. Отказ фиксируется через `verificationNotExecuted` в `ad_sessions` с кодом причины (VAST 4.3 §3.17.4), показа при этом не возникает |
| Калибровка | Показы с ограниченным доступом исключены из обучающих выборок всех семи сигналов: модели калибруются только на полных показах |
| Проверка на плеерах | Поведение AdFox, AdLook, AdRiver, Buzoola и Google IMA не проверялось эмпирически — реализация выполнена по спецификациям IAB |
