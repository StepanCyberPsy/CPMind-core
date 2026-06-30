# CPMind Backend — `packages/backend`

API-сервер на Fastify (Node.js). Принимает данные от тега, резолвит владельца и активную версию констант, проверяет корректность, рассчитывает CPMind Score, сохраняет в PostgreSQL. Также собирает runtime-бандлы тега через esbuild JS API по запросу администратора.

---

## Содержание

1. [Структура пакета](#структура-пакета)
2. [API — публичные эндпоинты](#api--публичные-эндпоинты)
3. [API — панель (requireAuth)](#api--панель-requireauth)
4. [API — admin-only (requireAdmin)](#api--admin-only-requireadmin)
5. [Pipeline обработки показа](#pipeline-обработки-показа)
6. [Сервисы](#сервисы)
7. [Многопользовательская модель](#многопользовательская-модель)
8. [Калибровка весов](#калибровка-весов)
9. [Версионирование констант тега](#версионирование-констант-тега)
10. [Фоновые задачи (jobs)](#фоновые-задачи-jobs)
11. [Безопасность](#безопасность)
12. [База данных — миграции и схема](#база-данных--миграции-и-схема)

---

## Структура пакета

```
packages/backend/
├── package.json
├── tsconfig.json
├── Dockerfile                        # multi-stage build, Node 20 LTS
└── src/
    ├── index.ts                      # точка входа: регистрация плагинов, маршрутов,
    │                                 # автоприменение миграций, запуск fоновых job
    ├── db/
    │   ├── index.ts                  # Drizzle + pg-pool соединение
    │   ├── schema.ts                 # Drizzle-схема всех таблиц
    │   └── migrations/               # SQL-файлы Drizzle Kit
    │       ├── 0000_sharp_mauler.sql # CREATE TABLE impressions
    │       ├── 0001_weight_configs.sql
    │       ├── 0002_users_tags.sql
    │       ├── 0003_calibration.sql
    │       └── 0004_tag_constants.sql
    ├── middleware/
    │   ├── requireAuth.ts            # JWT из httpOnly cookie -> request.authUser.
    │   │                             # Проверяет isActive пользователя из БД на
    │   │                             # каждый запрос — деактивация отзывает доступ
    │   │                             # немедленно, не при истечении токена
    │   └── requireAdmin.ts           # проверяет role === 'admin'
    ├── routes/
    │   ├── collect.ts                # POST /api/collect — публичный прием показов
    │   ├── auth.ts                   # POST /api/auth/login, /logout, GET /auth/me
    │   ├── impressions.ts            # GET /api/impressions, /export/csv, /:id
    │   ├── users.ts                  # GET/POST /api/users, PATCH /:userUuid,
    │   │                             # GET /api/users/stats
    │   ├── tags.ts                   # GET/POST /api/tags, PATCH /:tagUuid
    │   ├── weights_config.ts         # GET/POST /api/weights-config,
    │   │                             # POST /:id/activate, DELETE /:id
    │   ├── calibrations.ts           # POST/GET /api/calibrations,
    │   │                             # GET/POST /:batchId/approve,
    │   │                             # GET /:batchId/items,
    │   │                             # POST /:batchId/items/:itemId/approve,
    │   │                             # DELETE /:batchId
    │   └── tag_constants.ts          # GET/POST /api/tag-constants,
    │                                 # POST /:configId/activate, /deactivate
    ├── services/
    │   ├── collect.ts                # processImpression(): полный pipeline
    │   ├── impressions.ts            # listImpressionsForAdmin/User(),
    │   │                             # getImpressionForAdmin(),
    │                                 # buildWhereFromFilters(),
    │   │                             # NUMERIC_RANGE_COLUMNS, RangeFieldKey,
    │   │                             # RangeValue — декларативная карта
    │   │                             # диапазонной фильтрации по сигналам
    │   ├── auth.ts                   # verifyCredentials(), generateToken(),
    │   │                             # constant-time bcrypt.compare
    │   ├── users.ts                  # createUser() — транзакция user + tag,
    │   │                             # updateUserStatus(), bootstrapAdmin()
    │   ├── users_stats.ts            # getUsersWithStats() — LEFT JOIN +
    │   │                             # subquery primary tag (без декартова
    │   │                             # произведения), aggregates по кампаниям,
    │   │                             # креативам, импрешенам, avgScore
    │   ├── tags.ts                   # CRUD тегов, resolveActiveTagOwner()
    │   ├── weights_config.ts         # CRUD версий весов, getActiveWeightsConfig()
    │   │                             # с in-memory кэшем, invalidateWeightsCache()
    │   ├── calibrations.ts           # createCalibrationBatch(),
    │   │                             # processCalibrationBatch() (фоновая),
    │   │                             # resolveSelectionWhere() — AND с adminUserId
    │   │                             # во всех трёх режимах (ids/session_groups/filter),
    │   │                             # approveCalibrationItems() (optimistic concurrency),
    │   │                             # discardCalibrationBatch(),
    │   │                             # getLatestApprovedCalibrationForImpression()
    │   ├── tag_constants.ts          # CRUD версий констант, resolveTagConstants()
    │   └── tag_builder.ts            # buildTagBundle() — esbuild JS API runtime-сборка
    └── jobs/
        ├── retention.ts              # удаление impressions старше 90 дней, 03:00 UTC
        └── calibration_cleanup.ts    # истечение calibration_batches по TTL,
                                      # каждые 15 минут. Экспортирует
                                      # getDraftTtlMinutes() — единственный
                                      # источник TTL, используется также
                                      # services/calibrations.ts для expiresAt
```

---

## API — публичные эндпоинты

Доступны тегу с любого сайта, без авторизации.

### `POST /api/collect`

Прием данных показа от JS-тега. Основной публичный эндпоинт.

- Zod-валидация `ImpressionPayloadSchema`
- 422 при неизвестном или неактивном `tag_uuid` или `tag_constants_version`
- 202 при успехе (намеренно, не 200 — данные еще в обработке)
- `ON CONFLICT DO NOTHING` на `impression_id` — дедупликация повторных отправок
- Rate limit: 100 req/s с одного IP, burst 200 (настроен в NGINX, не в Fastify)
- CORS: `Access-Control-Allow-Origin: *` — работает с любого домена

### `GET /api/health`

Проверка работоспособности. Возвращает `200` если база данных доступна. Используется Docker healthcheck-цепочкой для правильного порядка старта контейнеров.

---

## API — панель (requireAuth)

Требуют JWT-токен в httpOnly cookie `cpmind_token`.

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/auth/me` | текущий пользователь из JWT |
| `POST` | `/api/auth/login` | bcrypt + выдача JWT cookie |
| `POST` | `/api/auth/logout` | очистка cookie |
| `GET` | `/api/impressions` | список с фильтрацией, пагинацией, сортировкой |
| `GET` | `/api/impressions/export/csv` | экспорт с UTF-8 BOM, батчинг 500 строк |
| `GET` | `/api/tags/mine` | собственные теги текущего пользователя |

**Ролевая фильтрация:** `admin` видит все показы всех пользователей (опциональный `?userUuid=X` для сужения до одного). `user` видит только свои, через `USER_VISIBLE_IMPRESSION_FIELDS` (единый whitelist полей для JSON и CSV).

---

## API — admin-only (requireAdmin)

Требуют `requireAuth` + `requireAdmin`.

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/impressions/:id` | полный детальный вид + `lastRecalibratedAt` |
| `GET/POST` | `/api/users` | список / создание пользователя |
| `PATCH` | `/api/users/:userUuid` | обновление статуса (активация/деактивация) |
| `GET` | `/api/users/stats` | агрегаты по всем пользователям |
| `GET/POST` | `/api/tags` | список / создание тега |
| `PATCH` | `/api/tags/:tagUuid` | обновление тега |
| `GET/POST` | `/api/weights-config` | список версий весов / создание |
| `POST` | `/api/weights-config/:id/activate` | активировать версию |
| `DELETE` | `/api/weights-config/:id` | удалить неактивную версию |
| `POST` | `/api/calibrations` | создать батч пересчета (202, фоновая обработка) |
| `GET` | `/api/calibrations` | список всех батчей |
| `GET` | `/api/calibrations/:batchId` | статус и прогресс батча |
| `GET` | `/api/calibrations/:batchId/items` | постраничный превью "было/будет" |
| `POST` | `/api/calibrations/:batchId/approve` | массовое подтверждение |
| `POST` | `/api/calibrations/:batchId/items/:itemId/approve` | подтверждение одного элемента |
| `DELETE` | `/api/calibrations/:batchId` | отмена батча |
| `GET/POST` | `/api/tag-constants` | список / создание версии констант |
| `POST` | `/api/tag-constants/:configId/activate` | активировать версию |
| `POST` | `/api/tag-constants/:configId/deactivate` | деактивировать версию |

---

## Pipeline обработки показа

`services/collect.ts`, вызывается из `POST /api/collect`.

```
1. Zod-валидация ImpressionPayloadSchema
   → 422 при ошибке

2. resolveActiveTagOwner(tag_uuid)
   → JOIN tags+users, оба isActive проверяются
   → 422 если тег неизвестен или неактивен, или владелец неактивен

3. resolveTagConstants(tag_constants_version)
   → PRESENCE_IDLE_TIMEOUT_MS для F_Presence
   → 422 если версия неизвестна или неактивна (жёсткая блокировка)

4. getActiveWeightsConfig()
   → in-memory кэш, инвалидируется при смене версии

5. applyAnomalyCapping(payload)
   → кэппинг аномальных значений по таблице §6.3
   → structuredClone — не мутирует входной payload

6. normalizeAll(capped)
   → нормализация S1–S7 по формулам §4.1–4.6

7. computeScore(normalized, presenceThreshold, weights)
   → computeEffectiveWeights() — перераспределение при S3=null
   → F_Presence по скользящему окну
   → CPMind Score

8. Флаги подозрительности (no_events, tab_mostly_hidden, anomaly_duration, is_suspicious)

9. INSERT в impressions
   → tag_id, user_id, tag_constants_version, weights_version денормализованы
   → signals_raw включает presence (был пробел — исправлен)
   → ON CONFLICT DO NOTHING на impression_id

10. Ответ 202 Accepted
```

---

## Сервисы

### `services/impressions.ts`

**Ключевые функции:**

- `listImpressionsForAdmin(params, targetUserId?)` — серверная пагинация, сортировка, фильтрация. `targetUserId` опционально сужает до конкретного владельца.
- `listImpressionsForUser(params, userId)` — только свои показы, `USER_VISIBLE_IMPRESSION_FIELDS`.
- `getImpressionForAdmin(id)` — полный детальный вид, включая вызов `getLatestApprovedCalibrationForImpression()` для поля `lastRecalibratedAt`.
- `buildWhereFromFilters(filters)` — Drizzle SQL из `ListFilters`. Включает `ranges?: Partial<Record<RangeFieldKey, RangeValue>>` — декларативная карта по `NUMERIC_RANGE_COLUMNS`.

**`NUMERIC_RANGE_COLUMNS`** — единственное место, где сигнал сопоставлен с колонкой БД для диапазонной фильтрации. Если добавится S8 — правка только здесь:

```typescript
export const NUMERIC_RANGE_COLUMNS = {
  score: impressions.scoreFinal,
  s1: impressions.s1Normalized,
  s2: impressions.s2Normalized,
  s3: impressions.s3Normalized,
  s4: impressions.s4Normalized,
  s5: impressions.s5Normalized,
  s7: impressions.s7Normalized,
} as const;
```

**`SortField`** — расширен относительно исходной версии: `createdAt | scoreFinal | s1Normalized | s2Normalized | s3Normalized | s4Normalized | s5Normalized | s7Normalized`. `SORT_COLUMN_MAP` — та же идея, что `NUMERIC_RANGE_COLUMNS`: один источник истины для маппинга поля сортировки в колонку Drizzle.

**CSV-экспорт** (`buildWhereClause`, вызывается из `/export/csv`): расширен теми же `tagConstantsVersion`, `weightsVersion` и диапазонными параметрами через `parseNumericParam()`.

### `services/users_stats.ts`

`getUsersWithStats()` — одна публичная функция. LEFT JOIN impressions + подзапрос для первичного тега (через `min(tags.uuid)`), чтобы избежать декартова произведения (несколько тегов × несколько импрешенов у одного юзера). GROUP BY users.id. Возвращает `tagUuid`, `campaignsCount`, `creativesCount`, `impressionsCount`, `avgScore` (nullable при отсутствии показов).

### `services/weights_config.ts`

`getActiveWeightsConfig()` — in-memory кэш (`cache: WeightsValues | null`). Fallback на `DEFAULT_WEIGHTS` если таблица пуста. `invalidateWeightsCache()` вызывается из `activateWeightsConfig()` после успешной транзакции смены активной версии.

### `services/calibrations.ts`

Ключевые архитектурные решения, принятые в этой версии:

**`resolveSelectionWhere(selection, adminUserId)`** — ownership принудительно AND'ится во всех трёх режимах (`ids`, `session_groups`, `filter`). Ранее режимы `ids`/`session_groups` не проверяли владельца — IDOR-уязвимость, позволявшая пересчитать чужие данные, передав чужой `impression_id` в payload. Закрыта в этой сессии. Тест: два id (свой + чужой) в одном запросе → `totalItems: 1`.

**`processCalibrationBatch(batchId, selection, weights, adminUserId)`** — асинхронная, без await (`void processCalibrationBatch(...)`). Обрабатывает выборку чанками по 500 строк. `recomputeScoreFromNormalized()` пересчитывает только `score_final` — нормализованные сигналы, F_Presence, флаги не затрагиваются (не зависят от весов формульно).

**`approveCalibrationItems()`** — каждый элемент в отдельной транзакции. UPDATE impressions WHERE `score_final = previousScoreFinal` — optimistic concurrency, защита от перезаписи изменившихся данных. Конфликт → 409 по конкретному элементу, без блокировки остальных.

**`getLatestApprovedCalibrationForImpression(impressionId)`** — SELECT из `calibration_items` с `status='approved'`, ORDER BY `approved_at DESC`, LIMIT 1. Используется в `getImpressionForAdmin()` для поля `lastRecalibratedAt` в ответе API.

**`toApiBatch()`** — вычисляет `expiresAt` из `createdAt + getDraftTtlMinutes() * 60_000`. `getDraftTtlMinutes()` импортирован из `jobs/calibration_cleanup.ts` — единственный источник TTL, не дублируется.

### `services/tag_builder.ts`

`buildTagBundle(constants, version, outputPath)` — esbuild JS API. Подставляет `define: { __CPMIND_CONSTANTS__: JSON.stringify(constants), __CPMIND_TAG_VERSION__: JSON.stringify(version) }`. Пишет результат в `outputPath` (Docker volume `tag_dist`). Вызывается из `services/tag_constants.ts` при создании/активации версии. Провал сборки откатывает запись в БД — нет версии без файла.

---

## Многопользовательская модель

- `requireAuth` проверяет `users.isActive` из БД на **каждый** запрос — деактивация немедленно отзывает доступ, не при истечении 7-дневного JWT.
- `resolveActiveTagOwner()` проверяет `isActive` и тега, и пользователя-владельца — деактивация блокирует прием новых данных по всем тегам деактивированного пользователя.
- `POST /api/users` создает пользователя + первый тег в одной транзакции.
- `bootstrapAdmin()` — идемпотентно создает первого admin из `ADMIN_LOGIN`/`ADMIN_PASSWORD_HASH` при пустой таблице пользователей.
- Backfill: при первой миграции существующие impressions (без `user_id`) привязываются к admin — история не теряется.
- IDOR-защита: `request.authUser` из JWT как источник владельца для всех проверок, не URL/query-параметры. Чужой `/:id` → 404, не 403.

---

## Калибровка весов

Полное описание механики — в `docs/ARCHITECTURE.md`. Специфика реализации:

**Ownership enforcement** — скоуп калибровки всегда привязан к вызывающему администратору. Режим `filter` без явного `userUuid` в payload берет владельца из `adminUserId` (параметр сервиса из `request.authUser.id`). Режимы `ids`/`session_groups` принудительно AND'ят `eq(impressions.userId, adminUserId)` независимо от переданных идентификаторов.

**`CalibrationFilterSchema`** (в `@cpmind/shared`) расширен относительно изначальной версии:
- Убрано поле `userUuid` (скоуп через JWT, не payload)
- Добавлены: `tagConstantsVersion`, `weightsVersion`, `scoreMin/Max`, `s1Min/Max`...`s7Min/Max`
- `expiresAt: z.string().nullable()` добавлен в `CalibrationBatchSchema`
- `deviceType`, `s1Normalized`...`s7Normalized` добавлены в `CalibrationItemSchema`

**`buildRangesFromFilters(filters)`** внутри `calibrations.ts` — конвертирует поля `scoreMin/Max`...`s7Min/Max` из `CalibrationFilters` в `ListFilters.ranges` формат, переиспользуя `buildWhereFromFilters()` из `impressions.ts`.

---

## Версионирование констант тега

- `tag_constants_configs` — много одновременно активных версий (в отличие от `weight_configs`).
- Runtime-сборка через `services/tag_builder.ts`, без Docker-сервиса.
- Деактивация = удаление физического файла + жёсткая блокировка `POST /api/collect` для этой версии.
- Bootstrap `v0` из `DEFAULT_TAG_CONSTANTS` при пустой таблице.
- `PRESENCE_IDLE_TIMEOUT_MS` синхронизирован с backend через резолв активной версии констант в `/api/collect` — не дублируется.

---

## Фоновые задачи (jobs)

### `jobs/retention.ts`

Ежедневно 03:00 UTC. Удаляет `impressions` старше 90 дней. Связанные `calibration_items` удаляются каскадно (`ON DELETE CASCADE`).

### `jobs/calibration_cleanup.ts`

Каждые 15 минут. Удаляет `pending` черновики из батчей с `status='ready'` и `created_at < now() - TTL`. Обновляет статус на `expired`. `approved` элементы не трогает никогда.

Экспортирует `getDraftTtlMinutes()` — читает `CALIBRATION_DRAFT_TTL_MINUTES` из env, дефолт 60. Единственный источник TTL для всего проекта (`services/calibrations.ts` импортирует оттуда, а не дублирует константу).

**Известное ограничение:** батчи с `status='processing'` (зависшие, если backend упал в процессе) cleanup не подхватывает — только `ready`. Технический долг.

---

## Безопасность

- **JWT:** httpOnly cookie `cpmind_token`, 7 дней. Payload `{uuid, id, role}`.
- **bcrypt:** rounds=10. Constant-time сравнение даже при несуществующем логине (dummy-хэш, защита от timing-атаки user enumeration).
- **CORS:** wildcard только для `/api/collect`. Все остальные — reflect origin + credentials.
- **Security headers:** `@fastify/helmet` на уровне backend, дополнительные на уровне NGINX.
- **IDOR:** владелец из JWT, не из URL. Несуществующий или чужой ресурс → 404.
- **Нераскрытый пробел (MVP):** `tag_uuid` виден в HTML-разметке страницы клиента. Отправка показов под чужим `tag_uuid` физически возможна — засоряет данные владельца, не даёт доступа к чтению. Принятый риск, не закрыт.

---

## База данных — миграции и схема

Drizzle ORM. Миграции применяются автоматически при старте (`db/index.ts`). При ошибке — явный лог и завершение процесса.

### Индексы

`impressions`: `impression_id` (UNIQUE), `session_group_id`, `created_at`, `campaign_id`, `creative_id`, `device_type`, `is_suspicious`, `score_final`, `tag_id`, `user_id`, составной `(user_id, created_at)`, `tag_constants_version`.

`calibration_batches`: составной `(status, created_at)`, `created_by`. `calibration_items`: уникальный составной `(batch_id, impression_id)`, составной `(batch_id, status)`, `impression_id`.

`weight_configs`: `is_active`. `users`: `uuid` (UNIQUE), `login` (UNIQUE), `role`. `tags`: `uuid` (UNIQUE), `user_id`. `tag_constants_configs`: `is_active`.

### Retention

- `impressions`: 90 дней → retention job 03:00 UTC
- `calibration_items`: ON DELETE CASCADE с `impressions` (аудит удаляется вместе с данными)
- `calibration_items (pending)`: по TTL cleanup job каждые 15 минут
- `weight_configs`, `users`, `tags`, `tag_constants_configs`: не удаляются автоматически
- Бэкапы pg_dump: 04:00 UTC, ротация 30 дней