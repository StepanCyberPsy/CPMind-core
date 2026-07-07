# CPMind Frontend — `packages/frontend`

Панель аналитики на Next.js 14 App Router. Доступна по адресу `https://app.cpmind.tech` после авторизации. Отображаемый функционал, маршруты и доступные действия полностью определяются ролью JWT-токена.

---

## Содержание

1. [Структура пакета](#структура-пакета)
2. [Роутинг и ролевая архитектура](#роутинг-и-ролевая-архитектура)
3. [Авторизация и middleware](#авторизация-и-middleware)
4. [Lib-слой](#lib-слой)
5. [Admin-панель — страницы](#admin-панель--страницы)
6. [Admin-панель — компоненты](#admin-панель--компоненты)
7. [Shared компоненты](#shared-компоненты)
8. [Стили](#стили)
9. [Паттерны и решения, применяемые в проекте](#паттерны-и-решения-применяемые-в-проекте)
10. [TypeScript-конфигурация](#typescript-конфигурация)
11. [Известные ограничения и технический долг](#известные-ограничения-и-технический-долг)

---

## Структура пакета

```
packages/frontend/
├── package.json
├── tsconfig.json               # exactOptionalPropertyTypes, noUncheckedIndexedAccess
├── next.config.mjs             # output: standalone для Docker
├── Dockerfile                  # multi-stage build, Next.js standalone output
└── src/
    ├── middleware.ts            # edge middleware: ролевые редиректы
    ├── app/
    │   ├── layout.tsx           # root layout
    │   ├── page.tsx             # redirect по роли
    │   ├── login/page.tsx       # страница логина
    │   ├── admin/
    │   │   ├── layout.tsx       # guard роли admin
    │   │   ├── users_panel/page.tsx
    │   │   ├── impressions/
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── weights/
    │   │   │   ├── page.tsx
    │   │   │   └── recalculate/page.tsx
    │   │   ├── tag_constants/
    │   │   │   └── page.tsx
    │   │   └── ivt/
    │   │       └── page.tsx     # IVT — управление GIVT-списками и SIVT-порогами
    │   └── user/
    │       ├── layout.tsx
    │       ├── panel/
    │       │   ├── page.tsx
    │       └── impressions/
    │       │   └── page.tsx
    ├── components/
    │   ├── shared/
    │   │   ├── LoginForm.tsx
    │   │   ├── Combobox.tsx
    │   │   └── ComboboxDatePicker.tsx
    │   ├── admin/
    │   │   ├── Filters.tsx
    │   │   ├── ImpressionsTable.tsx
    │   │   ├── SignalFilterModal.tsx
    │   │   ├── ImpressionDetail.tsx
    │   │   ├── ExportButton.tsx
    │   │   ├── WeightsConfigPanel.tsx
    │   │   ├── UsersPanelTable.tsx
    │   │   ├── UserActionsMenu.tsx
    │   │   ├── CreateUserForm.tsx
    │   │   ├── WeightVersionPicker.tsx
    │   │   ├── RecalibrationWorkspace.tsx
    │   │   ├── RecalibrationTable.tsx
    │   │   ├── TagConstantsPanel.tsx
    │   │   ├── RecalibrationActionBar.tsx
    │   │   └── IvtPanel.tsx
    │   └── user/
    │       ├── Filters.tsx
    │       ├── ImpressionsTable.tsx
    │       ├── TagBuilderModal.tsx
    │       ├── SignalFilterModal.tsx
    │       ├── UserCampaignsTable.tsx
    │       └── ExportButton.tsx
    ├── lib/
    │   ├── shared/
    │   │   ├── auth.ts          # decodeTokenRole(), decodeTokenUuid()
    │   │   ├── env.ts           # requireEnv(), getBackendUrl(), getPublicBackendUrl()
    │   │   ├── types.ts         # SortField, SortParams, PaginationProps
    │   │   ├── date.ts          # утилиты для ComboboxDatePicker
    │   │   ├── tag-builder.ts   # единый контракт генератора тега
    │   │   └── use-popover.ts   # единый хук позиционирования поповеров
    │   ├── admin/
    │   │   ├── api.ts           # все функции обращения к backend API
    │   │   ├── types.ts         # интерфейсы пропсов компонентов
    │   │   ├── signals-meta.ts  # SIGNALS_META, getSignalMeta()
    │   │   ├── segment-color.ts # buildSegmentColorMap()
    │   │   └── searchParams.ts  # parseListSearchParams()
    │   └── user/
    │   │   ├── api.ts
    │   │   ├── types.ts
    │   │   ├── signals-meta.ts
    │   │   └── searchParams.ts
    └── styles/
        ├── globals.css
        ├── impressions.module.css
        ├── detail.module.css
        ├── detail-page.module.css
        ├── filters.module.css
        ├── table.module.css
        ├── weights.module.css
        ├── weights-panel.module.css
        ├── users_panel.module.css
        ├── combobox.module.css
        ├── signal-filter-modal.module.css
        ├── recalibration.module.css
        ├── tag-builder-modal.module.css
        ├── user_panel.module.css
        ├── tag-builder-modal.module.css
        ├── create-user-form.module.css
        ├── ivt.module.css
        └── ivt-panel.module.css
```

---

## Роутинг и ролевая архитектура

Маршруты строго разделены по ролям:

| Путь | Роль | Статус |
|---|---|---|
| `/` | любая (redirect) | реализовано |
| `/login` | публичный | реализовано |
| `/admin/users_panel` | admin | реализовано |
| `/admin/impressions` | admin | реализовано |
| `/admin/impressions/[id]` | admin | реализовано |
| `/admin/weights` | admin | реализовано |
| `/admin/weights/recalculate` | admin | реализовано |
| `/admin/tag_constants` | admin | реализовано |
| `/admin/ivt` | admin | реализовано |
| `/user/panel` | user | реализован |

**`src/app/page.tsx`** — redirect по роли: `admin` → `/admin/users_panel`, `user` → `/user/panel`.

**`src/app/admin/layout.tsx`** — серверный guard: проверяет наличие токена и роль `admin` (через `decodeTokenRole()`). При несоответствии — `redirect('/login')`.

**`src/app/user/layout.tsx`** — аналогичный guard для роли `user`. Сам `/user/panel`.

---

## Авторизация и middleware

### `src/middleware.ts`

Next.js edge middleware. Перехватывает все запросы, проверяет наличие `cpmind_token` cookie. При отсутствии — redirect на `/login`. Пути `/login`, `/api/*` исключены из проверки (`PUBLIC_PATHS`). `/api/*` не включён намеренно — весь API-трафик идёт напрямую через NGINX, не через Next.js.

### `src/lib/shared/auth.ts`

**`decodeTokenRole(token)`** — декодирует `role` из payload JWT без проверки подписи. Используется только для UX-роутинга (куда редиректить). Реальная граница безопасности — `requireAuth`/`requireAdmin` на backend.

**`decodeTokenUuid(token)`** — декодирует `uuid` из payload JWT. Используется для:
- Отображения кнопок калибровки только в собственном контексте (`/admin/impressions?userUuid=<ownUuid>`)
- Скрытия меню действий у собственной строки в таблице пользователей
- Скоупирования страницы `/admin/weights/recalculate` на собственные данные

Обе функции — `atob` + JSON.parse, без внешних зависимостей. Работают и в Edge Runtime (middleware), и в Node (Server Components).

### Cookie forwarding

Server Components не могут использовать `credentials: 'include'` (нет браузера). Вместо этого: `cookies()` из `next/headers` → `cpmind_token=${value}` → `headers: { Cookie: '...' }` в `fetch`. Паттерн используется во всех серверных fetch-функциях (`fetchImpressions`, `fetchImpressionById`, `fetchWeightsConfigs`, etc.).

---

## Lib-слой

### `src/lib/shared/env.ts`

- `requireEnv(name)` — server-only, бросает при отсутствии переменной
- `getBackendUrl()` — `BACKEND_URL` (server-side: `http://backend:3001` в prod, `http://localhost:3001` в dev)
- `getPublicBackendUrl()` — `NEXT_PUBLIC_BACKEND_URL` (client-side: `""` в prod → относительные пути через NGINX, `http://localhost:3001` в dev)

### `src/lib/shared/types.ts`

```typescript
type SortField = 'createdAt' | 'scoreFinal' | 's1Normalized' | 's2Normalized'
               | 's3Normalized' | 's4Normalized' | 's5Normalized' | 's6Normalized'
               | 's7Normalized'
```

Расширен в эту сессию: добавлены `s1Normalized`...`s7Normalized` при переносе сортировки по сигналам на backend.

### `src/lib/shared/use-popover.ts`

Единый хук позиционирования всех поповеров в проекте. Ключевое архитектурное решение: `position: fixed` + `getBoundingClientRect()`, не `position: absolute` и не CSS Anchor Positioning.

**Почему `position: fixed`:** абсолютно позиционированные элементы внутри `overflow-x: auto` контейнеров (горизонтально скроллящихся таблиц) расширяют `scrollWidth` родителя — появляется лишний горизонтальный скролл и поповер обрезается. `position: fixed` не участвует в `scrollWidth` родителя.

**Почему не CSS Anchor Positioning:** технология протестирована и откатана в ходе разработки. При множественных одновременных анкорах с общим именем (`anchor-scope: all`) наблюдалось полное зависание вкладки браузера (синхронная блокировка главного потока, не ошибка JS). Технология слишком нова (Baseline 2026) для продакшена.

Хук возвращает `{ open, setOpen, triggerRef, panelRef, coords }`. `coords` — `{ top, left }` из `getBoundingClientRect()` триггера, вычисляется в `useLayoutEffect` при открытии. При переполнении вьюпорта вправо — смещает панель влево (`triggerRect.right - panelWidth`).

### `src/lib/admin/api.ts`

Все функции обращения к backend API. Разделены на две категории:

**Server-side** (cookie forwarding, для Server Components):
- `fetchImpressions(params, cookie?)` — список импрешенов
- `fetchImpressionById(id, cookie?)` — детальный вид
- `fetchWeightsConfigs(cookie?)`, `fetchTagConstantsConfigs(cookie?)`, `fetchUsersStats(cookie?)`

**Client-side** (`credentials: 'include'`, для Client Components):
- `updateUserStatus(userUuid, isActive)`
- `createUser(body)`
- `createWeightsConfig(body)`, `activateWeightsConfig(id)`, `deleteWeightsConfig(id)`
- `createTagConstantsConfig(payload)`, `activateTagConstantsConfig(id)`, `deactivateTagConstantsConfig(id)` — мутирующие операции над версиями констант тега; обработка ошибок покрывает оба формата ответа backend (`err.error ?? err.message`)
- `createCalibrationBatch(targetWeightsConfigId, selection)`
- `fetchCalibrationBatch(batchId)`, `fetchCalibrationBatchItems(batchId, page, limit)`
- `approveCalibrationBatch(batchId, itemIds?)`, `discardCalibrationBatch(batchId)`
- `buildCsvUrl(params)` — строит URL для CSV-экспорта (без fetch, ссылка для `<a download>`)

**`ListParams`** — интерфейс параметров запроса `GET /api/impressions`. Содержит: `tagConstantsVersion`, `weightsVersion`, 16 диапазонных параметров (`scoreMin/Max`, `s1Min/Max`...`s6Min/Max`, `s7Min/Max`), `sortBy: SortField`, `ivtVerdict?: IvtVerdict`.

**IVT API-функции (client-side):**
- `fetchIvtListConfigs(cookie?)` — список версий GIVT-списков (server-side с cookie forwarding)
- `createIvtListConfig(body)` — загрузка CSV-списка; возвращает `{ id, version, entriesCount, parseErrors? }`; частичный успех возможен — невалидные строки пропускаются с описанием в `parseErrors`
- `activateIvtListConfig(id)` — активировать версию списка
- `deactivateIvtListConfig(id)` — деактивировать (частичная реализация, логика уточняется)
- `deleteIvtListConfig(id)` — удалить неактивную версию
- `fetchIvtThresholdsConfigs(cookie?)` — список версий порогов (server-side)
- `createIvtThresholdsConfig(body)` — создать конфигурацию порогов (`version`, `thresholds: IvtThresholds`, `description?`)
- `activateIvtThresholdsConfig(id)` — активировать
- `deactivateIvtThresholdsConfig(id)` — деактивировать (частичная реализация, логика уточняется)
- `deleteIvtThresholdsConfig(id)` — удалить неактивную версию Функция `createWeightsConfig` расширена: добавлены `configType: 'banner' | 'video'` и `s6: number` в объект весов.

**`buildQuery(params)`** — собирает `URLSearchParams` из `ListParams`. Числовые параметры диапазонов проверяются на `undefined` через явный guard, не `if (params.scoreMin)` — потому что `0` является валидным значением.

### `src/lib/admin/searchParams.ts`

**`parseListSearchParams(searchParams, forceUserUuid?)`** — единственная точка разбора URL query-параметров в `ListParams`. Используется в двух местах: `/admin/impressions/page.tsx` и `/admin/weights/recalculate/page.tsx`.

`forceUserUuid` — для страницы рекалибровки, где скоуп всегда = собственный UUID администратора из токена, независимо от URL.

`ivtVerdict` — парсится из `searchParams.ivtVerdict`, приводится к `IvtVerdict` через явный cast. Передаётся в `ListParams` условным spread.

`numericParam(v)` — внутренняя функция, конвертирует строку в `number | undefined` с `NaN`-защитой. Все 14 диапазонных параметров вычисляются через неё в отдельные константы **до** построения объекта `ListParams` — это обязательно для `exactOptionalPropertyTypes`: TypeScript сужает тип `number | undefined` через `!== undefined` для переменной, но не для повторного вызова функции.

### `src/lib/admin/signals-meta.ts`

**`SIGNALS_META`** — массив из 8 записей (Score + S1–S7 включая S6), содержит для каждого сигнала:
- `field: SignalField` — ключ поля в `ImpressionRow`
- `label` / `shortLabel` — для заголовков
- `urlParam` — префикс для URL-параметров (`score` → `scoreMin`/`scoreMax`)
- `sortValue: SortField` — значение `sortBy` для сортировки по этому сигналу
- `allowSort: boolean` — управляет видимостью блока сортировки в `SignalFilterModal`. S5 переведён в `allowSort: true` (ранее `false` — отсутствие сортировки было ошибкой). S6: `allowSort: true`, с `hint` "Только для video_creative. Для баннеров всегда null".

**`getSignalMeta(field)`** — безопасный поиск по `field`. Бросает при несуществующем поле (не возвращает `undefined`). Единственная точка использования метаданных — `ImpressionsTable`, `RecalibrationTable`, `SignalFilterModal`.

### `src/lib/admin/segment-color.ts`

**`buildSegmentColorMap(rows)`** — назначение цвета сегментам показа. Принципиальные решения:
- Цвет получают **только** группы с более чем одним видимым сегментом. Одиночный сегмент → нейтральный серый бейдж, без цвета (нечего визуально отличать).
- Назначение последовательное по первому вхождению в массиве `rows`, не по хэшу UUID. Гарантирует ноль коллизий, пока количество многосегментных групп не превышает размер палитры (8 цветов), вместо вероятностного распределения с неизбежными коллизиями.
- Цвет зависит от текущего набора видимых строк — при изменении фильтра цвет группы может измениться (осознанное решение, не баг).

---

## Admin-панель — страницы

### `/admin/users_panel` — `page.tsx`

Server Component. Фетчит `fetchUsersStats()`, декодирует собственный UUID из токена (`decodeTokenUuid`). Передаёт `initialUsers` и `currentUserUuid` в `UsersPanelTable`.

### `/admin/impressions` — `page.tsx`

Server Component. 4 параллельных фетча:
1. `fetchImpressions(params)` — основной список
2. `fetchWeightsConfigs()` — для дропдауна версий весов
3. `fetchTagConstantsConfigs()` — для дропдауна версий тега
4. `fetchImpressions(dropdownScopeParams)` — для опций Campaign ID / Creative ID (отдельный запрос с `limit:200` без активных фильтров, чтобы список не схлопывался при активной фильтрации)

**`isOwnScopeView`** — флаг видимости кнопок калибровки. `true` только когда `searchParams.userUuid === ownUuid`. Кнопки "Калибровка тега", "Калибровка весов" и "Управление IVT" не отображаются в глобальном виде ("Все импрешены") и при просмотре чужого пользователя.

### `/admin/impressions/[id]` — `page.tsx`

Server Component. `fetchImpressionById` + `fetchImpressions({ sessionGroupId })` для сегментов. Получает `searchParams.userUuid` для корректной обратной ссылки. `backUuid = searchParams.userUuid ?? ownUuid` — фоллбэк на собственный UUID только если пришли без параметра.

**Известное ограничение:** `onRowClick` в `ImpressionsTable` не передаёт `userUuid` при навигации на `/:id`, поэтому `searchParams.userUuid` на детальной странице всегда `undefined` — фоллбэк на `ownUuid` срабатывает постоянно. Технический долг.

### `/admin/ivt` — `page.tsx`

Server Component. Параллельный фетч: `fetchIvtListConfigs()` + `fetchIvtThresholdsConfigs()` через `Promise.all` с cookie forwarding. Обратная ссылка: `/admin/impressions?userUuid=<ownUuid>` (вычисляется через `decodeTokenUuid`). Передаёт `listConfigs` и `thresholdsConfigs` в `IvtPanel`.

### `/admin/weights` — `page.tsx`

Server Component. `fetchWeightsConfigs`. Обратная ссылка: `/admin/impressions?userUuid=<ownUuid>` (вычисляется через `decodeTokenUuid`). Danger Zone секция ссылается на `/admin/weights/recalculate` с `target="_blank"`.

### `/admin/weights/recalculate` — `page.tsx`

Server Component. Открывается в новой вкладке. Скоуп всегда = собственный UUID администратора (`forceUserUuid = ownUuid` в `parseListSearchParams`). Фетчит те же 4 источника, что `/admin/impressions`. Передаёт данные в `RecalibrationWorkspace`.

---

## Admin-панель — компоненты

### `Filters.tsx`

Client Component. URL-based state: все изменения фильтров пишутся в URL через `router.push` при нажатии "Применить" / "Сбросить".

Поля: Campaign ID, Creative ID (через `Combobox`), Tag Version, Weights Version (через `Combobox`), Device, Anomaly (через `Combobox`), Date From/To (через `ComboboxDatePicker`).

**Версии тега/весов** — локальное состояние в `Filters`, пишутся в URL при "Применить". Backend-фильтрация (не клиентская) — решение, принятое после многочасовой диагностики зависания фронтенда при клиентской фильтрации.

Баннер "режим сегментов" — отображается при активном `current.sessionGroupId`, не в форме фильтров. Кнопка "Выйти из режима сегментов" удаляет `sessionGroupId` из URL.

**path-agnostic:** пишет в `window.location`, не хардкодит `/admin/impressions`. Переиспользуется без изменений на `/admin/weights/recalculate`.

### `ImpressionsTable.tsx` (`ImpressionsTableClient`)

Client Component. TanStack Table v8, `manualSorting: true`, `getCoreRowModel()`. Серверная пагинация — навигация через URL (`router.push`).

**Сортировка:** только колонка "Дата" (`created_at`) имеет нативный TanStack-сорт (`enableSorting: true`). Score и S1–S7 (включая S6) — `enableSorting: false`, сортировка через `SignalFilterModal`. S6 добавлен в нормализованные колонки; в raw-панели добавлен `s6_raw_completion_rate` (% досмотра, null для баннеров). User-таблица отображает только нормализованные значения, S6 включён.

**Колонка "Валидность" (`ivt_verdict`):** badge-компонент, расположена перед "Аномалии". Три состояния: `valid` → зелёный badge "Валиден" (`.ivtValid`), `givt` → красный "GIVT-Нарушение" (`.ivtViolation`), `sivt_suspected`/`sivt_confirmed` → красный "SIVT-Нарушение" (`.ivtViolation`). Стили в `table.module.css`: `.ivtBadge`, `.ivtValid`, `.ivtViolation`.

**Цвет сегментов:** `buildSegmentColorMap(initialData)` в `useMemo`. Инлайн-стиль `{ borderColor, color, backgroundColor }` из палитры при наличии цвета; без стиля (нейтральный серый) при одиночном сегменте.

**Текущие параметры** (`currentParams: ListParams`) передаются в каждый `SignalFilterModal` — для корректного отображения активных фильтров и сброса через "Применить".

### `SignalFilterModal.tsx`

Client Component. Модальное окно воронки для диапазонной фильтрации и сортировки по одному сигналу. Открывается по клику на `▽` в заголовке колонки.

Два раздела: "Значение" (режим `gte` / `lte` / `range` + числовые инпуты) и "Сортировка" (выпадающий список "Не сортировать" / "Возрастание" / "Убывание").

**URL-интеграция:** при "Применить" пишет `{urlParam}Min`, `{urlParam}Max`, `sortBy`, `sortDir` в URL.

`getCurrentMin`/`getCurrentMax` — switch по `SignalField`, включает `s6_normalized` → `params.s6Min`/`params.s6Max`. S5 переведён в `allowSort: true` (был `false` — ошибка). При "Сбросить" — удаляет. `navigateTo` получается от родительского компонента (`ImpressionsTable` / `RecalibrationTable`).

`stopPropagation()` на кнопке-триггере — предотвращает всплытие клика до `<th>` (который мог бы переключить сортировку колонки при совмещении с TanStack-сортом).

Позиционирование: `usePopover()` → `position: fixed`, инлайн-стиль `{ top: coords.top, left: coords.left }`.

### `ImpressionDetail.tsx`

Client Component. Полный детальный вид импрешена. Все секции — сворачиваемые через `CollapsibleSection` (внутренний компонент с `useState(defaultOpen)`). SVG-иконка шеврона анимируется при раскрытии (`transform: rotate(180deg)`).

**Порядок секций и состояние по умолчанию:**
- Score block — всегда видим (не сворачивается)
- Баннер пересчёта — всегда видим
- Метаданные — скрыта по умолчанию
- IVT-вердикт — открыта по умолчанию; поля: `ivt_verdict`, `ivt_category`, `ivt_confidence`, `score_reliable`
- Таймлайн сегментов — всегда видим (не сворачивается, условный)
- Нормализованные сигналы (0–100) — открыта по умолчанию; включает S6 (`null` → "null (не видео)")
- F_Presence (raw) — открыта по умолчанию
- Флаги подозрительности — открыта по умолчанию
- S1–S7 raw (включая S6) — скрыты по умолчанию

**S6 секция** — отображается всегда; при `s6 === null` показывает одно поле "null — не видео-креатив"; при наличии данных — 19 полей Video Engagement + Audibility с подсветкой `completion`, `completion_rate_pct`, `play_initiated`, `unmuted_by_user`.

**Баннер пересчёта:** `imp.lastRecalibratedAt !== undefined` → зелёный баннер с датой и версией весов; иначе нейтральный "Не пересчитывался".

Таймлайн сегментов: видимый простой (`idleGapMs > 0`) между сегментами, переход через `Link`.

### `ExportButton.tsx`

Client Component. `credentials: 'include'`, blob download через `URL.createObjectURL`. Извлекает имя файла из заголовка `Content-Disposition`. `buildCsvUrl(params)` строит URL из текущих `ListParams` (включая все фильтры).

### `WeightsConfigPanel.tsx`

Client Component. Две таблицы версий весов (banner / video) с переключением через табы. Кнопка «+ Новая версия» открывает двухшаговый flow: шаг 1 — выбор типа креатива через карточки с SVG-иконками (баннер / видео); шаг 2 — форма с 7 весами (S1–S6–S7) и live-валидацией суммы (допуск 0.001). Хлебная крошка «← Назад» на шаге 2 возвращает к выбору типа. Дефолтные значения при открытии формы зависят от выбранного типа: `DEFAULT_BANNER_WEIGHTS` или `DEFAULT_VIDEO_WEIGHTS` из `@cpmind/shared`. Таблица показывает колонку S6 и фильтрует конфиги по активному табу (`cfg.configType === activeTab`). Активация/удаление через `createWeightsConfig`/`activateWeightsConfig`/`deleteWeightsConfig` + `router.refresh()`.

**`configType`** передаётся в `createWeightsConfig` и в backend. `activateWeightsConfig` на backend деактивирует только конфиги того же `configType` — banner и video активные версии независимы. Гарантировано partial unique index: `uidx_weight_configs_active_type ON (config_type) WHERE is_active = true`.

**Известный технический долг:** ошибки активации и удаления — через `alert()`. Форма создания — inline.

### `UsersPanelTable.tsx`

Client Component. Сортировка по колонкам (Кампании, Креативы, Импрешены, Средний Score) через `useState<SortState>`. Администратор всегда первой строкой (партиционирование: `admins` + `sortedUsers`, не сортировка по роли).

`null` в `avgScore` — в конец списка при любом направлении сортировки.

**Клик по логину** — навигация на `/admin/impressions?userUuid=X`. Остальные ячейки — не кликабельны (`cursor: pointer` убран с `<tr>`). Строка "Все импрешены" — отдельная кнопка над таблицей.

**`CopyableUuid`** — компонент с независимым `useState(copied)`. `navigator.clipboard.writeText()` + `stopPropagation()`. Показывает `▋` → `✓` на 1500 мс. Отдельный экземпляр на каждую строку — состояние не утекает между строками.

Две UUID-колонки: "User UUID" (для идентификации в URL `?userUuid=`) и "Tag UUID" (для передачи клиенту и вставки в `data-tag-uuid`). Данные `tagUuid` берутся из `UserStatsRow.tagUuid` (добавлено в эту сессию через подзапрос в `getUsersWithStats()`).

### `UserActionsMenu.tsx`

Client Component. Меню ⋮ для деактивации/реактивации пользователя. `usePopover()` для позиционирования. `stopPropagation()` на триггере и панели — предотвращает конфликт с clickable-строками таблицы.

Меню не отображается для строки с собственным UUID администратора (`user.uuid !== currentUserUuid`). Backend дополнительно защищён — `409` при попытке самодеактивации.

### `CreateUserForm.tsx`

Client Component. Поповер с формой создания пользователя. Кнопка "+ Создать пользователя" выровнена вправо над таблицей.

Клиентская валидация: `login.length >= 3`, `password.length >= 12` (минимальные длины, зеркало backend). Ошибки сервера (`err.error`) отображаются инлайн. После успеха — `router.refresh()`, без перезагрузки страницы.

Переключатель видимости пароля (`👁` / `🙈`): `type={passwordVisible ? 'text' : 'password'}`. Сбрасывается при каждом открытии формы.

### `WeightVersionPicker.tsx`

Client Component. Компактный список версий весов для страницы рекалибровки. Single-select. Конфиги группируются по `configType`: секция «БАННЕРЫ» и секция «ВИДЕО», разделённые горизонтальным разделителем. Показывает: `version` (mono), бейдж "активна", строку весов S1–S6–S7 (`s6 ?? 0` для исторических конфигов без поля). Наличие двух активных версий (banner + video) — ожидаемое поведение, визуально разграничено группами. Блокируется (`disabled`) при активном черновике пересчёта.

### `RecalibrationWorkspace.tsx`

Client Component. Оркестратор всего флоу пересчёта Score. Держит состояние:
- `selectedWeightsConfigId` — выбранная целевая версия весов
- `selectAllMode` / `manualSelectedIds` — режим выбора показов
- `mode: WorkspaceMode` — `'select' | 'processing' | 'ready' | 'success' | 'error'`
- `batch: CalibrationBatch | null` — текущий батч
- `previewItems` — элементы черновика для превью

**Поллинг:** при `processing` — каждые 4 секунды. При `ready` — каждые 20 секунд (для обнаружения авто-истечения без участия пользователя). Поллинг реализован через `setInterval` с `requestIdRef` для предотвращения race conditions.

**Скоуп владения:** фильтры калибровки строятся из `currentParams`, которые уже содержат `userUuid = ownUuid` (вставлен через `forceUserUuid` в `parseListSearchParams` на уровне `page.tsx`). На уровне backend ownership дополнительно принудительно AND'ится в `resolveSelectionWhere` — двойная защита.

**Режим "Выбрать все":**
- `selectAllMode = true` → payload `{ mode: 'filter', filters: buildCalibrationFilters(currentParams) }`
- `manualSelectedIds` → payload `{ mode: 'ids', impressionIds: [...] }`
- Нельзя одновременно — переключение режима сбрасывает другой

**`buildCalibrationFilters(params)`** — маппинг `ListParams` → `CalibrationFilters`. Не включает `page`, `limit`, `sortBy`, `sortDir`, `sessionGroupId`.

### `RecalibrationTable.tsx`

Client Component. Два режима:
- **`select`** — чекбоксы + заголовки Score/S1–S7 без `SignalFilterModal` (воронки убраны по требованию). Подсветка строки (`styles.selectedRow`) при отметке.
- **`preview`** — колонка Score показывает "было → стало" (`previousScoreFinal → newScoreFinal`), S1–S7 статичны. Обёртка с пунктирной рамкой (`border: 2px dashed var(--moderate)`).

Чекбоксы: `appearance: auto; -webkit-appearance: checkbox` + `accent-color: var(--accent)` — явный возврат нативного вида после глобального `appearance: none` в `globals.css`. Ячейка чекбокса `width: 40px !important` — `!important` обосновано: конкуренция специфичности с `table.module.css` из другого CSS Module файла.

### `RecalibrationActionBar.tsx`

Client Component. Sticky-панель (над таблицей, `top: 64px`). На мобильных — статичная (`position: static`).

### `TagConstantsPanel.tsx`

Client Component. Управление версиями калибруемых констант тега.

**Таблица** — 5 колонок: Версия (expand-триггер `▶`/`▼` + бейдж активности), Скрипт (`scriptPath` с кнопкой копирования в буфер / `—` при деактивированной), Размер (КБ / `—` при `fileSizeBytes=0`), Создана, Действия.

**Accordion** — `expandedId: string | null`, одна строка открыта в момент времени. Раскрытая строка рендерит `<tr colSpan={5}>` с 19 карточками констант в CSS Grid: 3 колонки (desktop) / 2 (≤1024px) / 1 (≤480px). `S1_VIEWPORT_THRESHOLDS` отображается как строка `"0, 0.5, 1"`.

**Кнопки действий:** «Активировать» (`ghostBtn`, `disabled` при `isActive=true`) + «Деактивировать» (`dangerBtn`, `disabled` при `isActive=false`). Раздельные `activatingId`/`deactivatingId` — спиннер только в нажатой кнопке, вторая остаётся видимой.

**Форма** — показывается ниже таблицы при `showForm=true`. Без поля версии (auto-assigned backend через sequence). 19 инпутов в CSS Grid: 3 колонки (desktop) / 2 (≤1024px) / 1 (≤480px). `S1_VIEWPORT_THRESHOLDS` — `type="text"`, остальные — `type="number"`.

**`CONSTANTS_META`** — массив из 19 записей `{ key, label, type, min?, minStrict?, max?, unit?, step? }`. Единственный источник истины для рендера таблицы, раскрытой строки, формы и валидации.

**Валидация** — touched-aware per-field через `FormState: Record<keyof TagConstantsValues, { value, touched, error }>`. Ошибка вычисляется при каждом `onChange`, красная граница через класс `inputError` при `touched && error !== null`, inline текст под полем. Кнопка «Создать» `disabled` при любом невалидном поле. При сабмите все поля принудительно помечаются `touched=true` перед проверкой. Дефолты полей — `DEFAULT_TAG_CONSTANTS` из `@cpmind/shared`.

**`validateField(meta, value)`** — `thresholds`: split по запятой → `number[]` → длина 1–10 → все в `[0,1]` → строго возрастающие. `integer`: `Number.isInteger` + min/max. `float`: `parseFloat` + min/minStrict/max.

Три кнопки всегда видны:
- "Пересчитать" — активна при `mode === 'select'`, выбрана версия весов, `selectedCount > 0`
- "Отменить" — активна только при `mode === 'ready'`
- "Сохранить" (danger) — активна только при `mode === 'ready'`

Таймер: `setInterval` каждую секунду при ненулевом `expiresAt`. `formatCountdown(ms)` → `мм:сс`. Точность ±15 минут от реального момента отмены (cleanup job запускается каждые 15 минут, не в момент истечения).

Баннер черновика: при `mode === 'ready'` — `actionBarDraft` класс (`--moderate` цвет), предупреждение с таймером.

---

## User-панель - дашборд

Главная страница пользователя отображает агрегированные кампании текущего пользователя.

Источник данных:

```
GET /api/user/campaigns
```

Отображаются:

* суммарное количество импрешенов;
* кнопка построения tracking tag (логика будет реализована отдельно);
* строка "Все импрешены";
* таблица кампаний.

Для каждой кампании отображаются:

* дата последнего импрешена;
* Campaign ID;
* количество креативов;
* количество импрешенов;
* средний CPMind Score;
* Device Ratio:

  * Desktop;
  * Mobile;
  * Tablet.

Клик по строке кампании открывает:

```
/user/impressions?campaignId=<campaignId>
```

Строка "Все импрешены" открывает:

```
/user/impressions
```

---

## User-панель - импрешены

Пользовательская таблица использует существующий backend endpoint:

```
GET /api/impressions
```

Backend автоматически ограничивает данные scope текущего пользователя.

Детальная страница импрешена отсутствует.

Таблица отображает:

Для общего списка:

* Дата;
* Campaign ID;
* Creative ID;
* Device;
* Валидность (ivt_verdict badge);
* Аномалии;
* CPMind Score;
* S1–S7.

Для конкретной кампании:

* Дата;
* Creative ID;
* Device;
* Аномалии;
* CPMind Score;
* S1–S7.

Campaign ID переносится в заголовок страницы.

---

## User-панель - фильтрация

Используются отдельные user-компоненты.

Доступны:

* Campaign ID;
* Creative ID;
* Device;
* Date From;
* Date To;
* Suspicious;
* IVT Verdict (ivtVerdict фильтр);
* диапазоны Score;
* диапазоны S1–S7.

Недоступны:

* User;
* Session Group;
* Tag Version;
* Weights Version.

---

## User-панель - экспорт

Используется отдельный компонент:

```
components/user/ExportButton.tsx
```

Экспорт выполняется через существующий backend endpoint.

Backend возвращает ограниченный CSV согласно роли пользователя.

---

## User-панель - генератор тега

`components/user/TagBuilderModal.tsx` — модальное окно сборки embed-кода тега для рекламодателя. Два шага: «Параметры» и «Код».

**Шаг «Параметры»:** Campaign ID, Creative ID, Тип креатива (`TAG_BUILDER_CREATIVE_TYPES`: `banner_static`, `banner_gif`, `banner_html5`, `video_creative`), ширина и высота. Валидация: `TAG_BUILDER_ID_PATTERN` (`/^[A-Za-zА-Яа-яЁё0-9_-]+$/`), целые числа 1–10000.

**Шаг «Код»:** платформа (HTML / Битрикс / WordPress / Tilda / React / Python) + формат (html/php/jsx/python). Генерируются два блока: контейнер и скрипт. Кнопка копирования с анимацией (SVG `✓` на 1500 мс).

**`video_creative`:** для всех форматов в контейнер добавляется опциональный комментарий с примером `data-cpmind-skip` на кнопке пропуска. Текст `instructionCard` адаптируется под тип.

**TD-01** (задокументированный долг): tag builder всегда генерирует ссылку на `v0` тега. Смена захардкоженного значения — отдельная задача после стабилизации константного профиля.

---

### `IvtPanel.tsx`

Client Component. Единый компонент управления IVT-конфигурацией. Паттерн WeightsConfigPanel: два таба (`GIVT-списки` / `SIVT-пороги`), переключение через `activeTab: 'lists' | 'thresholds'`.

**Таб GIVT-списки:**
- Таблица версий: версия (с бейджем "активна"), количество записей, описание, дата создания, действия
- Действия: Активировать (ghostBtn) / Деактивировать (ghostBtn) / Удалить (dangerBtn, disabled при активной)
- Форма загрузки: версия, описание, CSV-textarea. Формат CSV: `type,pattern,match_type,category,reason,source`. Подсказка формата над полем.
- `parseErrors` из ответа backend отображаются в предупреждающем блоке (`--moderate`) ниже таблицы — частичный успех, невалидные строки пропущены

**Таб SIVT-пороги:**
- Таблица версий: 7 колонок (версия + 6 полей порогов + дата + действия)
- Поле `click_without_hover` — boolean, отображается как "Включено" / "Отключено" / "—" (null)
- Форма создания: 6 полей с типами (`number` / boolean toggle). Пустое числовое поле = null = правило отключено. Boolean toggle: кнопка `toggleBtn` / `toggleActive`

**Общее:** `actionId: string | null` — спиннер только в нажатой кнопке. `router.refresh()` после любой успешной мутации. Кнопка "+ Загрузить список" / "+ Новая версия" в header меняется по активному табу.

---

## Shared компоненты

### `Combobox.tsx`

Client Component. Кастомный dropdown с поиском. `usePopover()` для позиционирования панели. Опции фильтруются по введённому тексту (без учёта регистра). Первая опция — всегда "Все" (значение `''`).

### `ComboboxDatePicker.tsx`

Client Component. Выбор даты через встроенный календарь. `usePopover()`. Формат вывода: `YYYY-MM-DD`. Навигация по месяцам.

**Известное расхождение:** `CalibrationFilterSchema` ожидает полный ISO datetime с offset (`YYYY-MM-DDTHH:mm:ssZ`), а `ComboboxDatePicker` отдаёт только дату. Для фильтров основной таблицы (`GET /api/impressions`) сравнение дат работает корректно (backend конвертирует строку через `new Date()`). Для фильтров калибровки — не тестировалось, потенциальное расхождение.

### `LoginForm.tsx`

Client Component. `POST /api/auth/login` с `credentials: 'include'`. После успеха — `router.push('/')`, роль-based redirect обрабатывает `page.tsx`. Переключатель видимости пароля.

---

## Стили

Все стили — CSS Modules. Нет CSS-in-JS, нет Tailwind.

**`globals.css`** — глобальные стили. Важная деталь: `input, select, textarea { appearance: none; ... }` — убирает нативную отрисовку всех контролов. Для чекбоксов в `RecalibrationTable` нужен явный override: `appearance: auto; -webkit-appearance: checkbox`.

**CSS-переменные** (из `globals.css`): `--bg-base`, `--bg-surface`, `--bg-hover`, `--bg-subtle`, `--accent`, `--accent-bg`, `--accent-dark`, `--negative`, `--negative-bg`, `--positive`, `--positive-bg`, `--moderate`, `--moderate-bg`, `--border`, `--border-strong`, `--text-primary`, `--text-secondary`, `--text-muted`, `--font-mono`, `--radius`, `--radius-sm`, `--radius-md`, `--shadow-md`.

**Отказ от CSS Anchor Positioning** — задокументирован в `use-popover.ts`. Все поповеры используют `position: fixed` + JS-координаты.

---

## Паттерны и решения, применяемые в проекте

### Server Component → Client Component граница

Стандартный паттерн: Server Component фетчит данные с cookie forwarding, передаёт как пропсы. Client Component принимает готовые данные, управляет интерактивностью, делает мутирующие запросы через `credentials: 'include'`.

### URL как источник состояния

Все фильтры, сортировка, пагинация живут в URL query-параметрах. `router.push(url.pathname + url.search)` → Next.js App Router пересобирает Server Component с новыми `searchParams`. Нет React-состояния для фильтров на уровне страницы.

### `navigateTo(params: Record<string, string>)`

Общий паттерн в `ImpressionsTable` и `RecalibrationTable`: строит новый URL из текущего `window.location.href`, применяя патч `params`. Пустая строка → `url.searchParams.delete(key)`. Не-пустая → `url.searchParams.set(key, value)`.

### `exactOptionalPropertyTypes` и условный spread

Вместо `{ key: value | undefined }` — `...(value !== undefined && { key: value })`. Это единственный способ корректно строить объекты с опциональными полями при `exactOptionalPropertyTypes: true`.

Числовые параметры (`scoreMin`, etc.) вычисляются в отдельные константы до построения объекта, чтобы TypeScript корректно сужал тип через `!== undefined`.

### Диагностика зависания — история

В ходе разработки обнаружен и устранён критический баг: бесконечный цикл рендеров в `ImpressionsTableClient`. Диагноз: `IntersectionObserver` пересоздавался при каждом изменении `filteredRows.length` (зависимость в `useEffect`), моментально срабатывал (sentinel сразу в viewport), вызывал `setVisibleCount`, что давало новый рендер — замкнутый цикл. Решение: `filteredRowsCountRef` для чтения актуальной длины внутри callback без пересоздания Observer, зависимость сужена до `[activeClientFiltering]`.

Параллельно обнаружена и устранена причина "фриза при выборе версии тега/весов" — клиентская фильтрация по версиям провоцировала тот же цикл и дополнительно запускала `useImpressionsDataSource`, промис которого никогда не резолвился (главный поток был занят). Решение: **вынос фильтрации по версиям тега/весов на backend** (те же `tagConstantsVersion`/`weightsVersion` параметры в `GET /api/impressions`). `useImpressionsDataSource`, `deep-filter.ts` и весь гибридный клиентский загрузчик удалены целиком.

---

## TypeScript-конфигурация

`tsconfig.json`:
- `exactOptionalPropertyTypes: true` — опциональное поле не может быть присвоено `undefined` явно; только отсутствовать. Приводит к паттерну условного spread по всему проекту.
- `noUncheckedIndexedAccess: true` — доступ по индексу массива возвращает `T | undefined`. Защита от `arr[0].field` без проверки.
- `ignoreDeprecations: "5.0"` — совместимость с TS 5.4.x, используемым в монорепо.

---

## Известные ограничения и технический долг

| Пункт | Описание |
|---|---|
| `onRowClick` без `userUuid` | При клике на строку импрешена `userUuid` не передаётся в URL детальной страницы — кнопка "Назад" всегда возвращает в собственный контекст, не в контекст просматриваемого чужого юзера |
| Опции Campaign/Creative | Строятся из отдельного запроса с `limit:200`. При >200 уникальных значений список будет неполным |
| `WeightsConfigPanel` ошибки | `alert()` вместо inline-ошибок |
| IVT деактивация | `deactivateIvtListConfig` / `deactivateIvtThresholdsConfig` реализованы в frontend и backend, но логика поведения после деактивации (fallback на `DEFAULT_IVT_THRESHOLDS`, поведение при отсутствии активного списка) требует уточнения и тестирования |
| Ручной выбор импрешенов на `/recalculate` | Сбрасывается при смене страницы пагинации |
| `ComboboxDatePicker` + CalibrationFilterSchema | Дата в формате `YYYY-MM-DD`, схема ожидает ISO datetime — не тестировалось для фильтрации в калибровке |
| Поплинг `processing`-батчей | Батчи, зависшие в `processing` (crash backend), не подхватываются cleanup job — только `ready` статус |
| Accessibility | Кастомные `Combobox`/`SignalFilterModal` не имеют полной keyboard-навигации, aria-live, focus-trap |

