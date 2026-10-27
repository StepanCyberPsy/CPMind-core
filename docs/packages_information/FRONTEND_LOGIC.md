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
    ├── [DIR] frontend
        ├── [FILE] .env.local
        ├── [FILE] Dockerfile
        ├── [FILE] next-env.d.ts
        ├── [FILE] next.config.mjs
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [DIR] app
                ├── [DIR] (workspace)
                    ├── [DIR] campaigns
                        ├── [FILE] page.tsx
                    ├── [DIR] creatives
                        ├── [FILE] page.tsx
                    ├── [FILE] layout.tsx
                    ├── [DIR] placements
                        ├── [FILE] CreatePlacementForm.tsx
                        ├── [DIR] [uuid]
                            ├── [FILE] PlacementActions.tsx
                            ├── [FILE] page.tsx
                        ├── [FILE] page.tsx
                    ├── [DIR] uploads
                        ├── [FILE] page.tsx
                ├── [DIR] admin
                    ├── [DIR] impressions
                        ├── [DIR] [id]
                            ├── [FILE] page.tsx
                        ├── [FILE] page.tsx
                    ├── [DIR] ivt
                        ├── [FILE] page.tsx
                    ├── [FILE] layout.tsx
                    ├── [DIR] signals
                        ├── [FILE] page.tsx
                    ├── [DIR] tag_constants
                        ├── [FILE] page.tsx
                    ├── [DIR] users_panel
                        ├── [FILE] page.tsx
                    ├── [DIR] weights
                        ├── [FILE] page.tsx
                        ├── [DIR] recalculate
                            ├── [FILE] page.tsx
                ├── [FILE] globals.css
                ├── [FILE] layout.tsx
                ├── [DIR] login
                    ├── [FILE] page.tsx
                ├── [FILE] page.tsx
                ├── [DIR] user
                    ├── [DIR] impressions
                        ├── [FILE] page.tsx
                    ├── [FILE] layout.tsx
                    ├── [DIR] panel
                        ├── [FILE] page.tsx
            ├── [DIR] components
                ├── [FILE] Pagination.tsx
                ├── [DIR] admin
                    ├── [FILE] CreateUserForm.tsx
                    ├── [FILE] ExportButton.tsx
                    ├── [FILE] Filters.tsx
                    ├── [FILE] FormulaCard.tsx
                    ├── [FILE] ImpressionDetail.tsx
                    ├── [FILE] ImpressionsTable.tsx
                    ├── [FILE] IvtListEntriesModal.tsx
                    ├── [FILE] IvtPanel.tsx
                    ├── [FILE] LogoutButton.tsx
                    ├── [FILE] RecalibrationActionBar.tsx
                    ├── [FILE] RecalibrationTable.tsx
                    ├── [FILE] RecalibrationWorkspace.tsx
                    ├── [FILE] SignalFilterModal.tsx
                    ├── [FILE] SignalModelsPanel.tsx
                    ├── [FILE] TagConstantsPanel.tsx
                    ├── [FILE] UserActionsMenu.tsx
                    ├── [FILE] UsersPanelTable.tsx
                    ├── [FILE] WeightVersionPicker.tsx
                    ├── [FILE] WeightsConfigPanel.tsx
                ├── [DIR] shared
                    ├── [FILE] CampaignCreateForm.tsx
                    ├── [FILE] Combobox.tsx
                    ├── [FILE] ComboboxDatePicker.tsx
                    ├── [FILE] ConfirmationForm.tsx
                    ├── [FILE] CreativeStatusBadge.tsx
                    ├── [FILE] LoginForm.tsx
                    ├── [FILE] PlacementEmbedModal.tsx
                    ├── [FILE] ProcessingPoller.tsx
                    ├── [FILE] UploadFlow.tsx
                    ├── [FILE] WorkspaceNav.tsx
                ├── [DIR] user
                    ├── [FILE] ExportButton.tsx
                    ├── [FILE] Filters.tsx
                    ├── [FILE] ImpressionsTable.tsx
                    ├── [FILE] SignalFilterModal.tsx
                    ├── [FILE] TagBuilderModal.tsx
                    ├── [FILE] UserCampaignsTable.tsx
            ├── [DIR] lib
                ├── [DIR] admin
                    ├── [FILE] api.ts
                    ├── [FILE] search-params.ts
                    ├── [FILE] segment-color.ts
                    ├── [FILE] signal-formulas.ts
                    ├── [FILE] types.ts
                    ├── [FILE] upload-api.ts
                ├── [DIR] shared
                    ├── [FILE] auth.ts
                    ├── [FILE] date.ts
                    ├── [FILE] env.ts
                    ├── [FILE] signals-meta.ts
                    ├── [FILE] tag-builder.ts
                    ├── [FILE] types.ts
                    ├── [FILE] use-popover.ts
                ├── [DIR] user
                    ├── [FILE] api.ts
                    ├── [FILE] search-params.ts
                    ├── [FILE] types.ts
            ├── [FILE] middleware.ts
            ├── [DIR] styles
                ├── [FILE] campaigns.module.css
                ├── [FILE] combobox.module.css
                ├── [FILE] components.module.css
                ├── [FILE] confirmation-form.module.css
                ├── [FILE] create-user-form.module.css
                ├── [FILE] creative-status-badge.module.css
                ├── [FILE] creatives.module.css
                ├── [FILE] detail-page.module.css
                ├── [FILE] detail.module.css
                ├── [FILE] filters.module.css
                ├── [FILE] formula-card.module.css
                ├── [FILE] impressions.module.css
                ├── [FILE] ivt-list-entries-modal.module.css
                ├── [FILE] ivt-panel.module.css
                ├── [FILE] ivt.module.css
                ├── [FILE] login.module.css
                ├── [FILE] logout-button.module.css
                ├── [FILE] pagination.module.css
                ├── [FILE] placement-detail.module.css
                ├── [FILE] placement-embed-modal.module.css
                ├── [FILE] placements.module.css
                ├── [FILE] processing-poller.module.css
                ├── [FILE] recalibration.module.css
                ├── [FILE] signal-filter-modal.module.css
                ├── [FILE] signal-models.module.css
                ├── [FILE] signals.module.css
                ├── [FILE] table.module.css
                ├── [FILE] tag-builder-modal.module.css
                ├── [FILE] tag-constants.module.css
                ├── [FILE] upload-flow.module.css
                ├── [FILE] uploads.module.css
                ├── [FILE] user_panel.module.css
                ├── [FILE] users_panel.module.css
                ├── [FILE] weights-panel.module.css
                ├── [FILE] weights.module.css
                ├── [FILE] workspace-nav.module.css
            ├── [DIR] types
                ├── [FILE] css.d.ts
        ├── [FILE] tsconfig.json
        ├── [FILE] tsconfig.tsbuildinfo
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
| `/admin/signals` | admin | реализовано |
| `/admin/ivt` | admin | реализовано |
| `/user/panel` | user | реализован |
| `/user/impressions` | user | реализован |
| `/campaigns` | user + admin | реализовано |
| `/campaigns/[uuid]` | user + admin | реализовано — детальная страница кампании |
| `/campaigns/[uuid]/upload` | user + admin | реализовано — upload wizard с предвыбранной кампанией |
| `/creatives` | user + admin | реализовано |
| `/creatives/[uuid]` | user + admin | реализовано — детальная страница creative |
| `/uploads` | user + admin | redirect → `/campaigns` |
| `/placements` | user + admin | redirect → `/campaigns` |
| `/placements/[uuid]` | user + admin | сохранён для прямых ссылок |

**`src/app/page.tsx`** — redirect по роли: `admin` → `/admin/users_panel`, `user` → `/user/panel`. Содержит `export const dynamic = 'force-dynamic'` — принудительный динамический рендер на каждый запрос. Без этого флага Next.js Full Route Cache может закэшировать redirect-ответ до авторизации, и повторное открытие домена в новой вкладке возвращает кэшированный `/login` даже при валидной сессии.

**`src/app/admin/layout.tsx`** — серверный guard: проверяет наличие токена и роль `admin` (через `decodeTokenRole()`). При несоответствии — `redirect('/login')`.

**`src/app/user/layout.tsx`** — аналогичный guard для роли `user`. Сам `/user/panel`.

**`src/app/(workspace)/layout.tsx`** — layout workspace pages. В текущей реализации не содержит ролевого guard'а — авторизация обеспечивается middleware (redirect на `/login` при отсутствии `cpmind_token`). Route group не ограничивает роль — страницы доступны и `admin`, и `user`.

**`(workspace)` route group** — Next.js App Router route group без сегмента URL. Все страницы внутри доступны по URL без `(workspace)/` префикса: `/campaigns`, `/creatives`, `/placements`, `/placements/[uuid]`, `/uploads`. Общий `layout.tsx` рендерит `WorkspaceNav` и `{children}`.

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

**Логаут (admin-only):** `POST /api/auth/logout` реализован на backend (очищает `cpmind_token` cookie). Фронтенд вызывает его через `LogoutButton` с подтверждением через `ConfirmDialog`. После успеха — `router.push('/login')`. Middleware при следующем запросе обнаруживает отсутствие cookie и редиректит на `/login` автоматически. Логаут реализован только для роли `admin`; для роли `user` сессия истекает по TTL токена (7 дней).

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

**`ListParams`** — интерфейс параметров запроса `GET /api/impressions`. Поддерживает фильтры `format`, `subtype`, `campaignUuid`, а также `tagConstantsVersion`, `weightsVersion`, `publisherDomain?: string` (фильтр по домену площадки), 16 диапазонных параметров (`scoreMin/Max`, `s1Min/Max`...`s6Min/Max`, `s7Min/Max`), `sortBy: SortField`, `ivtVerdict?: IvtVerdict`.

**`fetchPublisherDomainAggregate(creativeId, publisherDomain?, userUuid?, cookie?)`** — вызывает `GET /api/impressions/domain_aggregate`. При `publisherDomain = undefined` — агрегация по всем площадкам для данного creativeId. При наличии cookie — server-side запрос (из Server Component); без cookie — client-side с `credentials: 'include'`. Возвращает `PublisherDomainAggregate` из `@cpmind/shared`.

**Сигнальные модели S1–S7** — семь типов конфигураций, включая `S2ConfigRow`, и операции получения, активации, деактивации, планирования и отмены удаления для каждого сигнала. Fetch-функции — server-side с cookie forwarding. Мутирующие функции — client-side с `credentials: 'include'`. Для S3/S5/S6 поля `coefficients`, `featureMeans`, `featureStds` типизированы как `Record<string, number>` (Drizzle возвращает JSONB как именованные ключи `{beta0, beta1, ...}`, не массив).

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
- `deleteIvtThresholdsConfig(id)` — удалить неактивную версию

Функция `createWeightsConfig` принимает `CreativeCategory` и поле `s6` в объекте весов.
- `fetchIvtListConfig(id, cookie)` - список конфигурации для GIVT.

**`buildQuery(params)`** — собирает `URLSearchParams` из `ListParams`. Числовые параметры диапазонов проверяются на `undefined` через явный guard, не `if (params.scoreMin)` — потому что `0` является валидным значением.

**Логаут-запрос** (`POST /api/auth/logout`) не выносится в `api.ts` — выполняется inline в `LogoutButton` как единственный вызов без переиспользования: `fetch(\`${BACKEND}/api/auth/logout\`, { method: 'POST', credentials: 'include' })`.

**Новые интерфейсы и функции (workspace flow):**

**Интерфейсы:** `CampaignRow`, `AssetView`, `CreativeVersionView`, `CreativeListItem`, `CreativeDetail`, `PlacementListItem`, `PlacementDetail` — локальные TypeScript интерфейсы, зеркало ответов backend API. Не импортируются из `@cpmind/shared` (схемы Placement/Creative там есть, но интерфейсы ответов специфичны для frontend).

**Dual-mode fetch pattern** (`fetchCampaigns`, `fetchCreatives`, `fetchCreativeDetail`, `fetchPlacementDetail`):
```typescript
const backend = cookie ? getBackendUrl() : CLIENT_BACKEND;
...(cookie ? { headers: { Cookie: cookie } } : { credentials: 'include' })
```
Server Component передаёт `cookie` → запрос через внутреннюю Docker-сеть. Client Component не передаёт `cookie` → fetch с `credentials: 'include'` к `NEXT_PUBLIC_BACKEND_URL`.

**Upload-функции:**
- `createUploadSession(payload)` → `POST /api/creative-uploads` → `UploadSessionResponse` (presigned URL или part URLs)
- `completeUploadSession(uploadId, parts?)` → `POST /api/creative-uploads/:uuid/complete`
- `getUploadSessionStatus(uploadId)` → `GET /api/creative-uploads/:uuid` → `UploadSessionStatus`

**Campaign-функции:**
- `fetchCampaigns(cookie?)` — dual-mode, `GET /api/campaigns`
- `createCampaign(name)` — client-side, `POST /api/campaigns`

**Creative-функции:**
- `fetchCreatives(cookie?)` — dual-mode, `GET /api/creatives`
- `fetchCreativeDetail(uuid, cookie?)` — dual-mode, `GET /api/creatives/:uuid`; 404 → `null`
- `archiveCreative(uuid)` — client-side, `POST /api/creatives/:uuid/archive`

**Placement-функции:**
- `fetchPlacements(cookie?)` — server-side only (`getBackendUrl()` без fallback)
- `fetchPlacementDetail(uuid, cookie?)` — dual-mode; 404 → `null`
- `createPlacement(payload)` — client-side; `CreatePlacementPayload` из `@cpmind/shared`
- `updatePlacement(uuid, payload)` — client-side; `UpdatePlacementPayload` из `@cpmind/shared`
- `setPlacementActive(uuid, isActive)` — client-side; `POST /api/placements/:uuid/activate` или `/deactivate`

### `src/lib/admin/search-params.ts`

**`parseListSearchParams(searchParams, forceUserUuid?)`** — единственная точка разбора URL query-параметров в `ListParams`. Используется в двух местах: `/admin/impressions/page.tsx` и `/admin/weights/recalculate/page.tsx`.

`forceUserUuid` — для страницы рекалибровки, где скоуп всегда = собственный UUID администратора из токена, независимо от URL.

`ivtVerdict` — парсится из `searchParams.ivtVerdict`, приводится к `IvtVerdict` через явный cast. Передаётся в `ListParams` условным spread.

`publisherDomain` — парсится из `searchParams.publisherDomain` через conditional spread. Присутствует только в URL при активном domainView-режиме.

`domainView` — UI-only флаг режима площадки. Не входит в `ListParams` (не передаётся в backend как фильтр). Используется только page.tsx для определения режима рендера.

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

### `src/lib/admin/upload-api.ts`

Оркестратор загрузки файлов в Object Storage через presigned URLs. Весь upload выполняется с клиента напрямую в YC Object Storage — backend не проксирует бинарные данные.

**Ключевые решения:**

**XHR вместо fetch:** `fetch` API не предоставляет `upload.progress` событие — прогресс бар невозможен. Все PUT-запросы выполняются через `XMLHttpRequest` с обработчиком `xhr.upload.addEventListener('progress')`.

**`uploadChunkXhr(url, data, onProgress, signal)`** — XHR PUT одного blob с поддержкой `AbortSignal` и возвратом ETag из ответа. Object Storage возвращает ETag в кавычках — нормализуется через `raw.replace(/^"|"$/g, '')`.

**`uploadFileMultipart(parts, file, onProgress, signal)`** — параллельная загрузка частей с `PART_CONCURRENCY = 4`. Прогресс агрегируется по всем активным частям через `Map<partNumber, loaded>`. Части разбиваются через `file.slice(byteStart, byteEnd)`. Результат сортируется по `partNumber` — Object Storage требует строгого порядка при `CompleteMultipart`.

**`uploadFile(session, file, onProgress, signal)`** — публичный оркестратор. Определяет стратегию из `session.strategy`:
- `'multipart'` → `uploadFileMultipart`, возвращает `CompleteMultipartPart[]`
- `'single'` → `uploadFileSingle`, возвращает `null`

Возвращаемые части передаются в `completeUploadSession(uploadId, parts)`.

---

## Admin-панель — страницы

### `/admin/users_panel` — `page.tsx`

Server Component. Фетчит `fetchUsersStats()`, декодирует собственный UUID из токена (`decodeTokenUuid`). Передаёт `initialUsers` и `currentUserUuid` в `UsersPanelTable`.

### `/admin/impressions` — `page.tsx`

Server Component. До 6 параллельных фетчей:
1. `fetchImpressions(params)` — основной список
2. `fetchWeightsConfigs()` — для дропдауна версий весов
3. `fetchTagConstantsConfigs()` — для дропдауна версий тега
4. `fetchImpressions(dropdownScopeParams)` — для опций Campaign ID / Creative ID (`limit:200`)
5. `fetchImpressions(domainOptionsScopeParams)` — только в domainView-режиме: уникальные площадки для creativeId (limit:200, из поля `publisher_domain`)
6. `fetchPublisherDomainAggregate(creativeId, publisherDomain?)` — только в domainView-режиме: агрегированная строка над таблицей

**`isOwnScopeView`** — флаг видимости кнопок калибровки. `true` только когда `searchParams.userUuid === ownUuid`. Кнопки "Калибровка тега", "Калибровка весов", "Калибровка сигналов" и "Управление IVT" не отображаются в глобальном виде ("Все импрешены") и при просмотре чужого пользователя.

**`isDomainView`** — `searchParams.domainView === '1' && searchParams.creativeId !== undefined`. При активном режиме: таблица фильтруется по `creativeId`, баннер режима площадки отображается в `Filters`, агрегатная строка рендерится над таблицей через `PublisherDomainAggregateRow`, `ImpressionsTableClient` получает `isDomainView=true`.

**`domainOptions`** — уникальные `publisher_domain` из `domainOptionsScopeParams`-запроса. Передаются в `Filters` для Combobox выбора площадки внутри баннера режима.

### `/admin/impressions/[id]` — `page.tsx`

Server Component. `fetchImpressionById` + `fetchImpressions({ sessionGroupId })` для сегментов.

**`backHref`** — определяется из `searchParams.back` (URL-encoded строка полного пути с query-параметрами). При наличии: `decodeURIComponent(searchParams.back)` — возвращает точно туда, откуда пришли (обычный список, domainView-режим, recalibrate-страница). Fallback при отсутствии `back`: `ownUuid !== null ? /admin/impressions?userUuid=${ownUuid} : /admin/impressions`.

Навигация на детальную страницу всегда через `router.push` с явным `back=encodeURIComponent(window.location.pathname + window.location.search)` — формируется в `ImpressionsTableClient` при клике по меню «Детали импрешена» или по строке в domainView-режиме.

**Известное ограничение:** устранено для нового флоу (back-параметр). Прямые переходы (закладки, внешние ссылки) используют fallback на ownUuid — это ожидаемое поведение.

### `/admin/ivt` — `page.tsx`

Server Component. Параллельный фетч: `fetchIvtListConfigs()` + `fetchIvtThresholdsConfigs()` через `Promise.all` с cookie forwarding. Обратная ссылка: `/admin/impressions?userUuid=<ownUuid>` (вычисляется через `decodeTokenUuid`). Передаёт `listConfigs` и `thresholdsConfigs` в `IvtPanel`.

### `/admin/weights` — `page.tsx`

Server Component. `fetchWeightsConfigs`. Обратная ссылка: `/admin/impressions?userUuid=<ownUuid>` (вычисляется через `decodeTokenUuid`). Danger Zone секция ссылается на `/admin/weights/recalculate` с `target="_blank"`.

### `/admin/weights/recalculate` — `page.tsx`

Server Component. Открывается в новой вкладке. Скоуп всегда = собственный UUID администратора (`forceUserUuid = ownUuid` в `parseListSearchParams`). Фетчит те же 4 источника, что `/admin/impressions`. Передаёт данные в `RecalibrationWorkspace`.

---

## Workspace — страницы

### `/(workspace)/layout.tsx` — Workspace Layout

Server Component. Рендерит `<WorkspaceNav />` и `{children}`. Применяется ко всем workspace-страницам через route group.

### `/(workspace)/campaigns` — `page.tsx`

Server Component. `fetchCampaigns(cookie)`, `decodeTokenRole(token)` → `isAdmin`. Передаёт в `<CampaignListClient>`. Не содержит интерактивности — граница Server/Client.

### `/(workspace)/campaigns/[uuid]` — `page.tsx`

Server Component. `Promise.all([fetchCampaigns, fetchCreatives])` → фильтр `c.campaignUuid === params.uuid`. При отсутствии кампании — `notFound()`. Отображает список креативов кампании; ссылки → `/creatives/[uuid]`. Header содержит кнопку `+ Загрузить creative` → `/campaigns/[uuid]/upload`.

### `/(workspace)/campaigns/[uuid]/upload` — `page.tsx`

Server Component. `fetchCampaigns(cookie)` → ищет кампанию по `params.uuid`. `notFound()` при отсутствии. Передаёт одну кампанию в `<UploadFlowClient campaign={campaign}>`. Кампания зафиксирована — dropdown не отображается.

`UploadFlowClient.tsx` — Client Component-обёртка. Передаёт `campaigns={[campaign]}` в `<UploadFlow>`. После завершения `UploadFlow` выполняет навигацию на `/creatives/:creativeUuid` автоматически через `ProcessingPoller.onReady`.

### `/(workspace)/creatives` — `page.tsx`

Server Component. `fetchCreatives(cookie)`. Список creatives с `<CreativeStatusBadge>` по `status`. Ссылка на upload page для создания нового creative.

### `/(workspace)/creatives/[uuid]` — `page.tsx`

Server Component. `Promise.all([fetchCreativeDetail, fetchCampaigns, fetchPlacements])` + `fetchPlacementDetail` при наличии placement. Layout — двухколоночный grid: левая колонка (параметры + размещение), правая (превью с коллапсом).

Логика статуса: `currentStatus = latestVersion?.status ?? creative.status` — читает из `creative_versions`, не из `creatives`. Это исключает зависимость от синхронизации `creatives.status` при отображении актуального состояния.

При `isProcessing = true` монтирует `<ProcessingRefresh>` — client-side auto-refresh каждые 5 секунд.

### `/(workspace)/uploads` — `page.tsx`

`redirect('/campaigns')` — маршрут устарел. Upload инициируется из `/campaigns/[uuid]`.

### `/(workspace)/placements` — `page.tsx`

`redirect('/campaigns')` — маршрут устарел. Placements доступны из детальной страницы creative.

### `/(workspace)/placements/[uuid]` — `page.tsx`

Server Component. `fetchPlacementDetail(uuid, cookie)`. Детальный вид placement: режим, creative, embed code, VAST URL (null если version не ready). `<PlacementEmbedModal />` — модальное окно с embed кодом и copy-кнопкой. `<PlacementActions />` — Client Component для activate/deactivate/edit.

---

## Admin-панель — компоненты

### `Filters.tsx`

Client Component. URL-based state: все изменения фильтров пишутся в URL через `router.push` при нажатии "Применить" / "Сбросить".

Поля: Campaign ID, Creative ID (через `Combobox`), Tag Version, Weights Version (через `Combobox`), Device, Anomaly (через `Combobox`), Date From/To (через `ComboboxDatePicker`). Поле «Площадка размещения» отсутствует в обычном режиме — доступно только внутри domainView-баннера.

**Версии тега/весов** — локальное состояние в `Filters`, пишутся в URL при "Применить". Backend-фильтрация (не клиентская) — решение, принятое после многочасовой диагностики зависания фронтенда при клиентской фильтрации.

Баннер "режим сегментов" — отображается при активном `current.sessionGroupId`. Кнопка "Выйти из режима сегментов" удаляет `sessionGroupId` из URL.

Баннер "режим площадки" — отображается при `domainView=true` (пропс `domainView?: boolean`). Содержит: метку «Площадка размещения», `Combobox` с опциями площадок (`domainOptions?: string[]`) для выбора конкретного `publisher_domain`, кнопку «Выйти из режима площадки ×» выровненную вправо (`margin-left: auto`). `onDomainChange()` — при выборе площадки через Combobox немедленно записывает `publisherDomain` в URL без нажатия "Применить" (`router.push` напрямую). `exitDomainView()` — удаляет из URL `domainView`, `publisherDomain` и `creativeId`, возвращает к полному списку импрешенов.

**path-agnostic:** пишет в `window.location`, не хардкодит `/admin/impressions`. Переиспользуется без изменений на `/admin/weights/recalculate`.

### `ImpressionsTable.tsx` (`ImpressionsTableClient`)

Client Component. TanStack Table v8, `manualSorting: true`, `getCoreRowModel()`. Серверная пагинация — навигация через URL (`router.push`).

**Сортировка:** только колонка "Дата" (`created_at`) имеет нативный TanStack-сорт (`enableSorting: true`). Score и S1–S7 (включая S6) — `enableSorting: false`, сортировка через `SignalFilterModal`. S6 добавлен в нормализованные колонки; в raw-панели добавлен `s6_raw_completion_rate` (% досмотра, null для баннеров). User-таблица отображает только нормализованные значения, S6 включён.

**Колонка "Валидность" (`ivt_verdict`):** badge-компонент, расположена перед "Аномалии". Три состояния: `valid` → зелёный badge "Валиден" (`.ivtValid`), `givt` → красный "GIVT-Нарушение" (`.ivtViolation`), `sivt_suspected`/`sivt_confirmed` → красный "SIVT-Нарушение" (`.ivtViolation`). Стили в `table.module.css`: `.ivtBadge`, `.ivtValid`, `.ivtViolation`.

**Колонка "Действия" (`__actions__`):** `col.display` после `creative_id`. Содержит компонент `ImpressionActionsMenu` — меню `⋮` через `usePopover()`. Два пункта: «Детали импрешена» (навигация с `back`-параметром) и «Фильтр по площадке» (`navigateTo({ creativeId, domainView: '1', publisherDomain: '', page: '1' })`). Колонка скрыта в domainView-режиме (`display: none` на `th` и `td`) — используется единый `col.display` с условным рендером `null` для ячейки, что избегает нестабильности TanStack при динамическом изменении количества колонок.

**`isDomainView` пропс:** при `true` — строка становится кликабельной (`.trClickable`, `cursor: pointer`), клик открывает детальную страницу с `back`-параметром. При `false` — `cursor: default`, клик по строке не выполняет навигацию. Это инверсия прежнего поведения: раньше клик по строке всегда открывал детали; теперь детали открываются только через меню (вне domainView) или клик по строке (в domainView).

**`handleImpressionAction(row, action)`:** при `action === 'detail'` — `router.push(/admin/impressions/${row.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)})`. При `action === 'filterByDomain'` — `navigateTo({ creativeId, domainView: '1', publisherDomain: '', page: '1' })`.

**`PublisherDomainAggregateRow`:** рендерится над `<div className={styles.wrapper}>` только при `showAggregate = aggregate !== undefined`. Отображает: домен (из `currentParams.publisherDomain ?? 'Все площадки'`), количество кампаний и импрешенов, avg Score, divider, avg S1–S7. Стиль: левая акцентная граница (`border-left: 3px solid var(--accent)`), горизонтальный scroll для статистики на мобильных.

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
- Метаданные — скрыта по умолчанию; добавлено поле «Площадка размещения» (`imp.publisher_domain ?? 'Не определено'`, `mono=true`) после Creative Type
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

**Toolbar:** `<LogoutButton />` размещён левее `<CreateUserForm />` в блоке `.toolbar`. `.toolbar` получил `align-items: center` и `gap: 8px` для выравнивания кнопок. `LogoutButton` — серая кнопка (`--bg-subtle` + border), визуально отличается от синей «+ Создать пользователя».

**`CopyableUuid`** — компонент с независимым `useState(copied)`. `navigator.clipboard.writeText()` + `stopPropagation()`. Показывает `▋` → `✓` на 1500 мс. Отдельный экземпляр на каждую строку — состояние не утекает между строками.

Две UUID-колонки: "User UUID" (для идентификации в URL `?userUuid=`) и "Tag UUID" (для передачи клиенту и вставки в `data-tag-uuid`). Данные `tagUuid` берутся из `UserStatsRow.tagUuid` (добавлено в эту сессию через подзапрос в `getUsersWithStats()`).

### `UserActionsMenu.tsx`

Client Component. Меню ⋮ для деактивации/реактивации пользователя. `usePopover()` для позиционирования. `stopPropagation()` на триггере и панели — предотвращает конфликт с clickable-строками таблицы.

Меню не отображается для строки с собственным UUID администратора (`user.uuid !== currentUserUuid`). Backend дополнительно защищён — `409` при попытке самодеактивации.

### `CreateUserForm.tsx`

Client Component. Поповер с формой создания пользователя. Кнопка "+ Создать пользователя" выровнена вправо над таблицей.

Клиентская валидация: `login.length >= 3`, `password.length >= 12` (минимальные длины, зеркало backend). Ошибки сервера (`err.error`) отображаются инлайн. После успеха — `router.refresh()`, без перезагрузки страницы.

Переключатель видимости пароля (`👁` / `🙈`): `type={passwordVisible ? 'text' : 'password'}`. Сбрасывается при каждом открытии формы.

### `LogoutButton.tsx`

Client Component. Кнопка «Выйти» для admin-роли. При клике открывает `ConfirmDialog` с текстом «Вы уверены, что хотите выйти из аккаунта?». При подтверждении — `POST /api/auth/logout` + `router.push('/login')`. Состояния: `dialogOpen: boolean`, `loading: boolean`. В состоянии загрузки кнопка подтверждения в диалоге показывает `...`. После успешного логаута — редирект без явного `router.refresh()` (новая страница загружается с нуля). Только для admin; в user-панели не используется.

### `FormulaCard.tsx`

Client Component. Collapsible карточка с математическим описанием формулы нормализации активного сигнала.

**Структура:** header (название сигнала, вес, chevron ▾) + body (три секции: формулы, переменные, логика).

**KaTeX rendering:** `katex.renderToString(latex, { displayMode: true, throwOnError: false, output: 'html' })` → `dangerouslySetInnerHTML`. Display-mode для блочных формул. Inline-mode для символов в таблице переменных. `throwOnError: false` — при невалидном LaTeX рендерит fallback без краша.

**Таблица переменных:** три колонки — символ (KaTeX inline, `bg-subtle`, правая граница), описание (текст), источник (моно, `bg-subtle`, левая граница). Источник показывает имя таблицы БД (`s1_weibull_configs`) или `payload` / `вычисляется`.

**Данные:** `SIGNAL_FORMULAS: Record<SignalTab, FormulaDefinition>` из `lib/admin/signal-formulas.ts`. Полностью статические — правятся в data-файле, компонент не трогается.

**Адаптив:** `.formula` — горизонтальный скролл при переполнении на мобильных. Таблица переменных — горизонтальный скролл через `.tableWrapper`. На ≤640px padding уменьшен.

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

Три кнопки всегда видны:
- "Пересчитать" — активна при `mode === 'select'`, выбрана версия весов, `selectedCount > 0`
- "Отменить" — активна только при `mode === 'ready'`
- "Сохранить" (danger) — активна только при `mode === 'ready'`

Таймер: `setInterval` каждую секунду при ненулевом `expiresAt`. `formatCountdown(ms)` → `мм:сс`. Точность ±15 минут от реального момента отмены (cleanup job запускается каждые 15 минут, не в момент истечения).

Баннер черновика: при `mode === 'ready'` — `actionBarDraft` класс (`--moderate` цвет), предупреждение с таймером.

### `TagConstantsPanel.tsx`

Client Component. Управление версиями калибруемых констант тега.

**Таблица** — 6 колонок: Версия (раскрытие, активность и признак версии по умолчанию), Плейсменты (число закреплений), Скрипт, Размер, Создана, Действия.

**Accordion** — `expandedId: string | null`, одна строка открыта в момент времени. Раскрытая строка рендерит `<tr colSpan={6}>` с 19 карточками констант в CSS Grid: 3 колонки (desktop) / 2 (≤1024px) / 1 (≤480px). `S1_VIEWPORT_THRESHOLDS` отображается как строка `"0, 0.5, 1"`.

**Кнопки действий:** «Активировать», «Сделать по умолчанию» и «Деактивировать». Деактивация блокируется для версии по умолчанию и закреплённых версий; для назначения по умолчанию требуется активная версия. Раздельные `activatingId`/`deactivatingId` — спиннер только в нажатой кнопке, вторая остаётся видимой.

**Форма** — показывается ниже таблицы при `showForm=true`. Без поля версии (auto-assigned backend через sequence). 19 инпутов в CSS Grid: 3 колонки (desktop) / 2 (≤1024px) / 1 (≤480px). `S1_VIEWPORT_THRESHOLDS` — `type="text"`, остальные — `type="number"`.

**`CONSTANTS_META`** — массив из 19 записей `{ key, label, type, min?, minStrict?, max?, unit?, step? }`. Единственный источник истины для рендера таблицы, раскрытой строки, формы и валидации.

**Валидация** — touched-aware per-field через `FormState: Record<keyof TagConstantsValues, { value, touched, error }>`. Ошибка вычисляется при каждом `onChange`, красная граница через класс `inputError` при `touched && error !== null`, inline текст под полем. Кнопка «Создать» `disabled` при любом невалидном поле. При сабмите все поля принудительно помечаются `touched=true` перед проверкой. Дефолты полей — `DEFAULT_TAG_CONSTANTS` из `@cpmind/shared`.

**`validateField(meta, value)`** — `thresholds`: split по запятой → `number[]` → длина 1–10 → все в `[0,1]` → строго возрастающие. `integer`: `Number.isInteger` + min/max. `float`: `parseFloat` + min/minStrict/max.

### `/admin/signals` — `page.tsx`

Server Component. Семь параллельных запросов с cookie forwarding через `Promise.all`: `fetchS1WeibullConfigs`, `fetchS2Configs`, `fetchS3LogisticConfigs`, `fetchS4Configs`, `fetchS5LogisticConfigs`, `fetchS6LogisticConfigs`, `fetchS7QuantileConfigs`. Обратная ссылка: `/admin/impressions?userUuid=<ownUuid>`. Передаёт данные в `<SignalModelsPanel />`.

Навигация на страницу: кнопка «Калибровка сигналов» в header `/admin/impressions` (рядом с «Калибровка весов», видна только при `isOwnScopeView`).

### `SignalModelsPanel.tsx`

Client Component. Управление жизненным циклом конфигураций параметрических моделей сигналов S1–S7.

**Структура:** семь вкладок S1–S7, включая `S2 Quantile`. S4, S5, S6, S7 дополнительно имеют вторичные вкладки устройств:
- S4: «Базовая | Десктоп | Мобильные» (фильтрация сегментов: `default` / `desktop_*` / `mobile_*`)
- S5: «Десктоп | Мобильные» (`desktop` / `mobile_tablet`)
- S6: разделы in-stream, out-stream и прочие; для режимов доступны устройства и общий сегмент. `getS6SegmentPresentation` определяет раздел и устройство по ключу, исторические и неизвестные ключи остаются в разделе прочих
- S7: «Десктоп | Мобильные | Планшет» (по `device_type`)

**Группировка по сегментам:** `groupByKey()` — утилита группировки в `Map<string, Row[]>`. Порядок сегментов: `global` и `default` всегда первыми, остальные по алфавиту (`orderSegmentKeys()`). Заголовки сегментов (`SegmentHeader`) — кликабельны, сворачивают/разворачивают группу. `collapsedSegments: Set<string>` — ключ `${tab}:${segmentKey}`. При инициализации: `global` и `default` раскрыты, остальные свёрнуты.

**Сортировка внутри сегмента** (`sortConfigs()`): активная конфигурация — первой; конфиги с `deletion_scheduled_at` — вторыми (ближайшее удаление выше); остальные по дате убывания.

**Колонки таблиц** — специфичны для каждого сигнала, содержат только релевантные параметры:
- S1: Подобрана, k, λ, Выборка
- S2: уровни квантилей и соответствующие значения, сопоставленные по уровню между конфигурациями
- S3/S5: Подобрана, Коэффициенты β (grouped header + subcolumns), Средние признаков, Станд. откл. (S3), Точность, Выборка, Версия констант
- S4: Создана, Версия, λ, T_ref (мс), Выборка
- S6: коэффициенты, средние и отклонения, accuracy, AUC, доля положительных меток и пороги разметки
- S7: Вычислена, relY low, relY mid, Clutter mid, Clutter high, Выборка

Колонки `accuracy` и AUC отображаются для S3, S5 и S6. Для AUC ниже 0,6 компонент показывает визуальную подсказку; отсутствие значения отображается отдельно.

**TTL-таймер:** `deletion_scheduled_at !== null` → badge с обратным отсчётом (`formatCountdown`) в ячейке рядом с кнопкой `⋮`. `useEffect` с `setInterval(1000)` активируется только при наличии хотя бы одного конфига с `deletionScheduledAt !== null` среди всех сигналов (`hasScheduledDeletion`).

**`ConfigActionsMenu`:** меню `⋮` через `usePopover()`. 4 пункта с guard-блокировками:
- «Активировать» — `disabled` при `isActive=true` или `deletionScheduledAt !== null`
- «Деактивировать» — `disabled` при `isActive=false`
- «Запланировать удаление» — `disabled` при `isActive=true` или уже запланировано
- «Отменить удаление» (danger) — `disabled` при `deletionScheduledAt === null`

`actionId: string | null` в формате `${tab}:${id}:${action}` — спиннер локализован на конкретной кнопке конкретного конфига.

**`SIGNAL_ACTIONS`** — константная карта `Record<SignalTab, Record<SignalAction, (id) => Promise<void>>>`. Единственная точка привязки функций из `lib/admin/api.ts` к табу и действию. `handleAction` использует её для диспетчеризации без switch/if.

Формы создания отсутствуют принципиально — конфиги создаются исключительно cron-джобами (MLE/IRLS на реальных данных). Admin управляет только жизненным циклом.

**`FormulaCard`** — рендерится между `tabBar` и `deviceTabBar`/таблицей. Один экземпляр на активный таб (`<FormulaCard signal={activeTab} />`). Получает `signal: SignalTab`, находит данные в `SIGNAL_FORMULAS[signal]`, рендерит KaTeX-формулы в display-режиме. Collapsed/expanded state локален (`useState(true)` — раскрыт по умолчанию). Формула не меняется при переключении device-таба — меняются только параметры в таблице ниже.

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
* Площадка (publisher_domain + badge «Отфильтровать» — скрыта в domainView-режиме);
* Device;
* Валидность (ivt_verdict badge);
* Аномалии;
* CPMind Score;
* S1–S7.

Для конкретной кампании:

* Дата;
* Creative ID;
* Площадка (publisher_domain + badge «Отфильтровать» — скрыта в domainView-режиме);
* Device;
* Аномалии;
* CPMind Score;
* S1–S7.

Campaign ID переносится в заголовок страницы.

**Режим площадки (`domainView`):** аналогичен admin-реализации, с отличиями: нет детальной страницы импрешена, поэтому клик по строке в domainView — ничего не делает (нет навигации). Badge «Отфильтровать» на колонке площадки устанавливает `creativeId + domainView=1` в URL. В domainView-баннере — `Combobox` выбора площадки + кнопка выхода. Агрегатная строка над таблицей через `PublisherDomainAggregateRow` (идентична admin-версии). `fetchUserPublisherDomainAggregate` вызывает тот же `GET /api/impressions/domain_aggregate` — endpoint role-aware, автоматически ограничивает scoped по JWT.

**`useEffect` sync для `creativeId`:** при выходе из domainView-режима локальный стейт `creativeId` в `UserFilters` сбрасывается через `useEffect([current.creativeId])` → `setCreativeId(current.creativeId ?? '')`. Без этого после `exitDomainView()` фильтр Campaign ID оставался в поле формы несмотря на удаление из URL.

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

**Шаг «Параметры»:** Campaign ID, Creative ID, Тип креатива (`TAG_BUILDER_CREATIVE_TYPES`: `banner_static`, `banner_gif`, `banner_html5`, `video_creative`), **Домен площадки** (необязательное поле, `placeholder="news.example.com"`), ширина и высота. Валидация: `TAG_BUILDER_ID_PATTERN` (`/^[A-Za-zА-Яа-яЁё0-9_-]+$/`), целые числа 1–10000. Домен площадки — опциональный, при непустом значении валидируется через `isValidPublisherDomain()` (RFC 1123 hostname, ≤253 символа, не localhost, не IP). При пустом значении поле не включается в код тега (тег применит автодетект из `document.referrer` / `window.location.hostname`).

Текст `instructionCard` дополнен пояснением: «Домен площадки помогает понять, на каких сайтах реклама работает лучше — это нужно для аналитики по площадкам».

**Шаг «Код»:** платформа (HTML / Битрикс / WordPress / Tilda / React / Python) + формат (html/php/jsx/python). Генерируются два блока: контейнер и скрипт. Кнопка копирования с анимацией (SVG `✓` на 1500 мс).

**`video_creative`:** для всех форматов в контейнер добавляется опциональный комментарий с примером `data-cpmind-skip` на кнопке пропуска. Текст `instructionCard` адаптируется под тип.

**`data-publisher-domain`** — добавляется в контейнерный блок всех форматов (HTML, PHP/Битрикс, JSX, Python) при непустом `form.publisherDomain`. Атрибут вставляется после `data-endpoint` через `domainAttr = form.publisherDomain.trim() !== '' ? '\n  data-publisher-domain="..."' : ''`. При пустом значении атрибут полностью отсутствует в генерируемом коде — тег применяет автодетект.

**WordPress PHP fix:** `buildPhpContainer` использует раздельные escape-функции в зависимости от платформы: Битрикс (включая `bitrix_component`) — `<?=htmlspecialcharsbx('...')?>`, WordPress — `<?php echo esc_attr('...'); ?>`. `esc_attr` — нативная WordPress-функция, `htmlspecialcharsbx` — Битрикс-специфичная, в WordPress не существует.

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

### `ConfirmationForm.tsx`

Client Component. Переиспользуемый модальный диалог подтверждения. `ReactDOM.createPortal` в `document.body` — не зависит от z-index стека родителя. Монтируется только на клиенте (`useState(mounted)` + `useEffect`).

**Props:** `message: string`, `confirmLabel: string`, `cancelLabel: string`, `isLoading: boolean`, `onConfirm: () => void`, `onCancel: () => void`.

**Поведение:** клик по оверлею вызывает `onCancel`. Кнопки заблокированы при `isLoading=true`. `confirmBtn` — accent-цвет (синяя); `cancelBtn` — серая. Оба label передаются через props — компонент не знает контекста применения. Используется в `LogoutButton`; архитектурно готов к переиспользованию в любом другом confirm-флоу (деактивация, удаление и т.п.).

### `Combobox.tsx`

Client Component. Кастомный dropdown с поиском. `usePopover()` для позиционирования панели. Опции фильтруются по введённому тексту (без учёта регистра). Первая опция — всегда "Все" (значение `''`).

### `ComboboxDatePicker.tsx`

Client Component. Выбор даты через встроенный календарь. `usePopover()`. Формат вывода: `YYYY-MM-DD`. Навигация по месяцам.

**Известное расхождение:** `CalibrationFilterSchema` ожидает полный ISO datetime с offset (`YYYY-MM-DDTHH:mm:ssZ`), а `ComboboxDatePicker` отдаёт только дату. Для фильтров основной таблицы (`GET /api/impressions`) сравнение дат работает корректно (backend конвертирует строку через `new Date()`). Для фильтров калибровки — не тестировалось, потенциальное расхождение.

### `LoginForm.tsx`

Client Component. `POST /api/auth/login` с `credentials: 'include'`. После успеха — `router.push('/')`, роль-based redirect обрабатывает `page.tsx`. Переключатель видимости пароля.

### `lib/config/index.ts`

Централизованный конфиг-файл. Правило: константы и конфиги никогда не определяются внутри `.tsx`-компонентов — только импортируются из `config/`.

Содержит: `CREATIVE_TYPE_LABELS`, `DELIVERY_MODE_LABELS`, `CREATIVE_STATUS_LABELS` — словари человекочитаемых названий. `BANNER_CREATIVE_TYPES: ReadonlySet` — типы без выбора режима доставки. `VIDEO_DELIVERY_MODES` — опции для video_creative. `INSTREAM_MODES: ReadonlySet`. `CREATIVE_TYPE_CARD_LABELS`, `CREATIVE_TYPE_KEYS` — для отображения счётчиков на карточках кампаний. Хелперы: `formatCreativeType`, `formatDeliveryMode`, `formatCreativeStatus`, `formatDateTime`, `buildDefaultCreativeName`.

### `CopyableText.tsx`

Client Component. Кнопка копирования в буфер. Props: `text: string`, `truncate?: boolean`. При `truncate=true` отображает `text.slice(0, 8) + '…'`. `e.stopPropagation()` + `e.preventDefault()` предотвращают всплытие к родительскому `<Link>`. Визуальный feedback: иконка `⧉` → `✓` на 1500 мс. Стиль из `copyable-text.module.css`.

### `CampaignListClient.tsx`

Client Component. Инкапсулирует всю интерактивность страницы `/campaigns`: поиск (client-side фильтр по названию), toggle формы создания, grid карточек. Props: `campaigns: CampaignRow[]`, `isAdmin: boolean`. UUID кампании на карточке виден только при `isAdmin`. `CampaignCreateForm` получает `onSuccess/onCancel` callbacks.

### `CollapsiblePreview.tsx`

Client Component. Обёртка над `CreativePreview` с кнопкой `▾ Скрыть` / `▸ Показать`. `useState(false)` — по умолчанию раскрыт. `aria-expanded` на кнопке. Стиль из `creative-detail.module.css` (`.collapseBtn`).

### `CreativePreview.tsx`

Client Component. Рендерит превью по `creativeType` и `assets`. `video_creative`: нативный `<video controls playsInline preload="metadata" poster={...}>` с source-ассетом. `banner_static`/`banner_gif`: `<img>` по CDN URL ассета `role='source'`. `banner_html5`: статичный placeholder с иконкой. При отсутствии ассетов — placeholder с текстом. Стиль из `creative-preview.module.css`.

### `InlinePlacementForm.tsx`

Client Component. Форма учитывает тип креатива: для баннера выбирается формат `banner`, для видео — `instream` или `outstream` с подтипом. В зависимости от формата доступны параметры слота, селектора видео, sticky, звука, автозапуска и пропуска. Настраиваются домен площадки и режим проверки разрешённых доменов. После создания открывается `PlacementEmbedModal`; стиль — `inline-placement-form.module.css`.

### `PlacementCreativeSetEditor.tsx`

Редактор набора видеокреативов размещения. Позволяет выбрать ролики, задать доли и порядок, выбрать `weighted_random` или `sequential` и сохранить набор через API.

### `CreativeActivityBadge.tsx`

Отображает активность размещения как «Активно» или «Неактивно»; при отсутствии значения не выводится.

### `CreativePlacementPanel.tsx`

Client Component. Управление существующим placement: отображение режима, delivery token (через `CopyableText`), статус активности, кнопки Embed-код / Активировать / Деактивировать. `setPlacementActive` + `router.refresh()`. Стиль из `creative-placement-panel.module.css`.

### `ProcessingRefresh.tsx`

Client Component. Возвращает `null`. При монтировании запускает `setInterval(() => router.refresh(), 5000)`. Монтируется на `/creatives/[uuid]` при `isProcessing=true`. Автоматически обновляет Server Component без ручного polling на фронтенде.

### `ProcessingPoller.tsx`

`onReady` принимает `{ creativeUuid: string; creativeVersionUuid: string }`. Срабатывает при `result.status === 'ready' && result.creativeUuid !== null && result.creativeVersionUuid !== null`.

### `WorkspaceNav.tsx`

Server или Client Component. Навигационная панель workspace. Ссылки: Кампании (`/campaigns`), Креативы (`/creatives`), Загрузить (`/uploads`), Плейсменты (`/placements`). Активная ссылка определяется через `usePathname()`.

Убраны: `'use client'`, `LogoutButton`, nav-табы (`NAV_LINKS`), `usePathname`, `divider`. Стал Server Component. Содержит только логотип-ссылку `/campaigns` и `backLink` вправо. Метки: `admin` → `← К пользователям` (href: `/admin/users_panel`), `user` → `← Импрешены` (href: `/user/impressions`).

### `CampaignCreateForm.tsx`

Client Component. Добавлены props `onSuccess: () => void` и `onCancel: () => void` — компонент больше не управляет открытием/закрытием самостоятельно. После успешного создания: `router.refresh()` + `onSuccess()`.

### `CreativeStatusBadge.tsx`

Client Component. Badge статуса creative: `processing` → amber, `ready` → зелёный, `failed` → красный, остальные → нейтральный. Используется в списке creatives и при выборе creative в форме placement.

### `PlacementEmbedModal.tsx`

Client Component. Окно показывает embed-код и, для видео при наличии, VAST URL; пояснения зависят от формата, подтипа, слота и селектора. Есть копирование, сведения для диагностики и закрытие кнопкой, Escape или нажатием на подложку. Если версия не готова, вместо кода показывается предупреждение.

### `ProcessingPoller.tsx`

Client Component. Polling `GET /api/creative-uploads/:uuid` через `setInterval`. Останавливается при `status === 'ready' || status === 'failed'`. Показывает spinner во время processing. При `ready` вызывает `onReady` с идентификаторами креатива и версии. При `failed` — отображает `processingError`.

### `UploadFlow.tsx`

Client Component. Полный upload flow:
1. Выбор кампании и файла (drag-and-drop + file input)
2. `createUploadSession(payload)` → получение presigned URL
3. `uploadFile(session, file, onProgress, signal)` → прогресс-бар
4. `completeUploadSession(uploadId, parts?)` → триггер processing job
5. `<ProcessingPoller />` → ожидание ready/failed

AbortController для отмены upload. `onProgress` callback обновляет процент (`0–100`) в локальном state. Ошибки отображаются inline без `alert()`.

Добавлено поле **«Название creative»** — отображается после выбора файла. Дефолт вычисляется через `buildDefaultCreativeName(campaignName, detectedType)` из `config/`. Имя передаётся в backend через поле `filename` (`${trimmedName}${ext}`) — backend применяет `creativeNameFromFilename()`. При `campaigns.length === 1` dropdown кампании заменяется на read-only отображение (`.campaignDisplay`) с пометкой «зафиксирована». `onDone` callback упрощён — навигация на `/creatives/:creativeUuid` выполняется внутри `handlePollerReady` автоматически. Props: `campaigns: CampaignRow[]`, `onDone?: (creativeUuid: string) => void` (опциональный).

---

## Стили

Все стили — CSS Modules. Нет CSS-in-JS, нет Tailwind.

**`globals.css`** — глобальные стили. Важная деталь: `input, select, textarea { appearance: none; ... }` — убирает нативную отрисовку всех контролов. Для чекбоксов в `RecalibrationTable` нужен явный override: `appearance: auto; -webkit-appearance: checkbox`.

**`katex/dist/katex.min.css`** — импортируется в `app/layout.tsx` первым, до `globals.css`. Подключается глобально через `node_modules` — единственный правильный способ для Next.js 14 App Router. Обеспечивает рендеринг KaTeX-формул в `FormulaCard`.

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
| `onRowClick` без `userUuid` | Устранено: навигация на детальную страницу теперь только через меню «Детали импрешена» с явным `back=<encoded>` — возврат всегда корректный |
| Опции Campaign/Creative | Строятся из отдельного запроса с `limit:200`. При >200 уникальных значений список будет неполным |
| `WeightsConfigPanel` ошибки | `alert()` вместо inline-ошибок |
| IVT деактивация | `deactivateIvtListConfig` / `deactivateIvtThresholdsConfig` реализованы в frontend и backend, но логика поведения после деактивации (fallback на `DEFAULT_IVT_THRESHOLDS`, поведение при отсутствии активного списка) требует уточнения и тестирования |
| Ручной выбор импрешенов на `/recalculate` | Сбрасывается при смене страницы пагинации |
| `ComboboxDatePicker` + CalibrationFilterSchema | Дата в формате `YYYY-MM-DD`, схема ожидает ISO datetime — не тестировалось для фильтрации в калибровке |
| Поплинг `processing`-батчей | Батчи, зависшие в `processing` (crash backend), не подхватываются cleanup job — только `ready` статус |
| Accessibility | Кастомные `Combobox`/`SignalFilterModal` не имеют полной keyboard-навигации, aria-live, focus-trap |
| Опции площадок в domainView | Строятся из отдельного запроса с `limit:200` по `creativeId`. При >200 уникальных площадок для одного creative список будет неполным |
| `TagConstantsPanel` — отображение `S1_VIEWPORT_THRESHOLDS` | Отображается как строка `"0, 0.5, 1"` (захардкожено в компоненте), тогда как актуальный дефолт изменён на `[0, 0.75, 1.0]`. Технический долг — строка отображения не синхронизирована с `DEFAULT_TAG_CONSTANTS` |

