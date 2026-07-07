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
10. [IVT — детекция невалидного трафика](#ivt--детекция-невалидного-трафика)
11. [Фоновые задачи (jobs)](#фоновые-задачи-jobs)
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
    │       ├── 0001_secret_whiplash.sql
    │       ├── 0002_elite_puppet_master.sql
    │       ├── 0003_f_presence_check_guarded.sql
    │       └── 0004_public_thunderbolts.sql
    │       ├── 0005_familiar_zodiak.sql
    │       ├── 0006_thick_robin_chapel.sql
    │       ├── 0007_workable_rachel_grey.sql
    │       └── 0008_fair_chimera.sql
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
    │   ├── tag_constants.ts          # GET/POST /api/tag-constants,
    │   │                             # POST /:configId/activate, /deactivate
    │   ├── ivt_lists.ts              # GET/POST /api/ivt-lists,
    │   │                             # POST /:id/activate
    │   └── ivt_thresholds.ts         # GET/POST /api/ivt-thresholds,
    │                                 # POST /:id/activate
    ├── services/
    │   ├── collect.ts                # processImpression(): полный pipeline
    │   ├── impressions.ts            # listImpressionsForAdmin/User(),
    │   │                             # getImpressionForAdmin(),
    │   │                             # buildWhereFromFilters(),
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
    │   ├── tag_builder.ts            # buildTagBundle() — esbuild JS API runtime-сборка
    │   ├── ivt_list.ts               # CRUD ivt_list_configs, parseIvtListCsv(),
    │   │                             # getActiveIvtList() с in-memory кэшем
    │   └── ivt_thresholds.ts         # CRUD ivt_thresholds_configs,
    │                                 # getActiveIvtThresholds() с in-memory кэшем
    └── jobs/
        ├── retention.ts              # удаление impressions старше 90 дней, 03:00 UTC
        ├── calibration_cleanup.ts    # истечение calibration_batches по TTL,
        │                             # каждые 15 минут
        └── ivt_frequency.ts          # частотный анализ по fp_hash, каждые 30 минут
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
| `GET/POST` | `/api/ivt-lists` | список версий GIVT-списков / загрузка CSV |
| `POST` | `/api/ivt-lists/:id/activate` | активировать версию списка |
| `GET/POST` | `/api/ivt-thresholds` | список версий порогов / создание |
| `POST` | `/api/ivt-thresholds/:id/activate` | активировать версию порогов |

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

4. creativeType → CreativeCategory
   → 'video_creative' = 'video', остальные = 'banner'

4. getActiveWeightsConfig(category)
   → двухключевой in-memory кэш { banner, video }, инвалидируется при смене версии

5. applyAnomalyCapping(payload)
   → кэппинг аномальных значений по таблице §6.3
   → structuredClone — не мутирует входной payload

6. normalizeAll(capped)
   → нормализация S1–S7 + normalizeS6() по формулам §4.1–4.6, §3.4
   → S6=null для баннеров, number|null передаётся в detectNullSignals

7. computeScore(normalized, presenceThreshold, weights)
   → computeEffectiveWeights() — перераспределение при S3=null
   → F_Presence по скользящему окну
   → CPMind Score

8. Флаги подозрительности (no_events, tab_mostly_hidden, anomaly_duration, is_suspicious)

8.5. classifyIvtSync(payload, ivtList, ivtThresholds, userAgent)
   → pure function из @cpmind/shared, не обращается к БД
   → ivtList и ivtThresholds загружаются параллельно с весами через Promise.all
   → userAgent из request.headers['user-agent']
   → GIVT early return при совпадении UA-паттерна (SIVT не проверяется)
   → SIVT: robotic_timing, synthetic_cursor, impossible_event_sequence
   → confidence-агрегация (вероятностное объединение P(A∪B))
   → Результат: ivt_verdict, ivt_category, ivt_confidence, score_reliable, ivt_signals

9. INSERT в impressions
   → tag_id, user_id, tag_constants_version, weights_version денормализованы
   → s6_raw_completion_rate, s6_normalized: null для баннеров
   → signals_raw включает presence
   → ivt_verdict (DEFAULT 'valid'), ivt_category, ivt_confidence, score_reliable,
     fp_hash (из payload, nullable), ivt_signals (null при пустом массиве)
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
  s6: impressions.s6Normalized,
  s7: impressions.s7Normalized,
} as const;
```

**`SortField`** — расширен относительно исходной версии: `createdAt | scoreFinal | s1Normalized | s2Normalized | s3Normalized | s4Normalized | s5Normalized | s6Normalized | s7Normalized`.

**`ListFilters.ivtVerdict`** — опциональный фильтр по IVT-вердикту (`valid | givt | sivt_suspected | sivt_confirmed`). Транслируется в `eq(impressions.ivtVerdict, value)` в `buildWhereFromFilters()`. Валидируется через `z.enum` в `ImpressionListQuerySchema`. `SORT_COLUMN_MAP` — та же идея, что `NUMERIC_RANGE_COLUMNS`: один источник истины для маппинга поля сортировки в колонку Drizzle.

**CSV-экспорт** (`buildWhereClause`, вызывается из `/export/csv`): расширен теми же `tagConstantsVersion`, `weightsVersion` и диапазонными параметрами через `parseNumericParam()`.

### `services/users_stats.ts`

`getUsersWithStats()` — одна публичная функция. LEFT JOIN impressions + подзапрос для первичного тега (через `min(tags.uuid)`), чтобы избежать декартова произведения (несколько тегов × несколько импрешенов у одного юзера). GROUP BY users.id. Возвращает `tagUuid`, `campaignsCount`, `creativesCount`, `impressionsCount`, `avgScore` (nullable при отсутствии показов).

### `services/weights_config.ts`

`getActiveWeightsConfig(category: CreativeCategory)` — двухключевой in-memory кэш `{ banner: WeightsValues | null, video: WeightsValues | null }`. Запрос фильтруется по `configType = category`. Fallback на `DEFAULT_BANNER_WEIGHTS` / `DEFAULT_VIDEO_WEIGHTS` по категории. `s6: w['s6'] ?? 0` — страховка для исторических строк без S6 в JSONB. `invalidateWeightsCache()` инвалидирует оба ключа.

`createWeightsConfig()` — принимает `configType: CreativeCategory`, валидирует сумму 7 весов (включая s6) = 1.00.

`activateWeightsConfig()` — деактивирует только конфиги того же `configType` перед активацией целевой версии. Banner-активная версия не затрагивается при активации video и наоборот. Database-enforced через partial unique index.

### `services/calibrations.ts`

Ключевые архитектурные решения, принятые в этой версии:

**`resolveSelectionWhere(selection, adminUserId)`** — ownership принудительно AND'ится во всех трёх режимах (`ids`, `session_groups`, `filter`). Ранее режимы `ids`/`session_groups` не проверяли владельца — IDOR-уязвимость, позволявшая пересчитать чужие данные, передав чужой `impression_id` в payload. Закрыта в этой сессии. Тест: два id (свой + чужой) в одном запросе → `totalItems: 1`.

**`processCalibrationBatch(batchId, selection, weights, adminUserId)`** — асинхронная, без await (`void processCalibrationBatch(...)`). Обрабатывает выборку чанками по 500 строк. `recomputeScoreFromNormalized()` пересчитывает только `score_final` — нормализованные сигналы, F_Presence, флаги не затрагиваются (не зависят от весов формульно).

**`approveCalibrationItems()`** — каждый элемент в отдельной транзакции. UPDATE impressions WHERE `score_final = previousScoreFinal` — optimistic concurrency, защита от перезаписи изменившихся данных. Конфликт → 409 по конкретному элементу, без блокировки остальных.

**`getLatestApprovedCalibrationForImpression(impressionId)`** — SELECT из `calibration_items` с `status='approved'`, ORDER BY `approved_at DESC`, LIMIT 1. Используется в `getImpressionForAdmin()` для поля `lastRecalibratedAt` в ответе API.

**`toApiBatch()`** — вычисляет `expiresAt` из `createdAt + getDraftTtlMinutes() * 60_000`. `getDraftTtlMinutes()` импортирован из `jobs/calibration_cleanup.ts` — единственный источник TTL, не дублируется.

### `services/tag_builder.ts`

`buildTagBundle(constants, version, outputPath)` — esbuild JS API. Подставляет `define: { __CPMIND_CONSTANTS__: JSON.stringify(constants), __CPMIND_TAG_VERSION__: JSON.stringify(version) }`. Пишет результат в `outputPath` (Docker volume `tag_dist`). Вызывается из `services/tag_constants.ts` при создании/активации версии. Провал сборки откатывает запись в БД — нет версии без файла.

### `services/ivt_list.ts`

`getActiveIvtList()` — in-memory кэш активной версии `ivt_list_configs`. При отсутствии активной версии возвращает `null` (не пустой массив — различие семантически важно для `classifyIvtSync`). `invalidateIvtListCache()` инвалидирует при активации новой версии.

`parseIvtListCsv(csv)` — парсер CSV в массив `IvtListEntry[]`. Валидирует каждую строку через `IvtListEntrySchema`. Для `match_type='regex'` — компиляция паттерна с таймаутом (защита от катастрофического бэктрекинга). Для `match_type='cidr'` — валидация CIDR-нотации. Возвращает `{ entries, errors }` — частичный успех, невалидные строки пропускаются с описанием.

`createIvtListConfig()` / `activateIvtListConfig()` — CRUD по паттерну `weights_config.ts`. Активация в транзакции: деактивировать текущую → активировать целевую → `invalidateIvtListCache()`.

### `services/ivt_thresholds.ts`

`getActiveIvtThresholds()` — in-memory кэш. Fallback на `DEFAULT_IVT_THRESHOLDS` (все поля null) при отсутствии активной версии — SIVT-правила не срабатывают до первой калибровки. Валидирует JSONB через `IvtThresholdsSchema.safeParse()`.

`createIvtThresholdsConfig()` / `activateIvtThresholdsConfig()` — CRUD по тому же паттерну.

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

### `jobs/ivt_frequency.ts`

Каждые 30 минут (cron `*/30 * * * *`). Выполняет кросс-сессионный частотный анализ по `fp_hash`.

**Логика:** GROUP BY `fp_hash` в окне `repeat_fp_window_min` минут. Если количество уникальных `creative_id` от одного `fp_hash` превышает `repeat_fp_max_creatives` — обновляет `ivt_verdict` до `sivt_suspected` или `sivt_confirmed` (в зависимости от `confidence >= confidence_confirm`), категория `botnet_frequency`.

**Инварианты:** только `valid`-записи рассматриваются как кандидаты. `givt`-записи не перезаписываются (`ne(impressions.ivtVerdict, 'givt')`). Пороги читаются через `getActiveIvtThresholds()` — если `repeat_fp_window_min` или `repeat_fp_max_creatives` равны null, job пропускается.

**Не блокирует приём.** Асинхронный batch-анализ, не участвует в синхронном pipeline `/api/collect`.

---

## IVT — детекция невалидного трафика

### Архитектурные принципы

- Детекция синхронна и встроена в pipeline шагом 8.5 — не отдельный сервис.
- `classifyIvtSync()` — pure function из `@cpmind/shared`. Детерминирована, покрыта юнит-тестами, не обращается к БД.
- Списки и пороги загружаются параллельно с весами через `Promise.all` — нулевой overhead к латентности pipeline.
- Кросс-сессионный анализ (`fp_hash` frequency) — batch-job, не realtime.

### Версионирование конфигурации

Оба конфига (`ivt_list_configs`, `ivt_thresholds_configs`) следуют паттерну `weight_configs`:
- Versioned snapshots, partial unique index `WHERE is_active = true`
- In-memory кэш с инвалидацией при активации
- Обновление без передеплоя

### Поведение при отсутствии конфигурации

- Нет активного списка (`getActiveIvtList()` → `null`) → GIVT UA-матчинг пропускается
- Нет активных порогов (`getActiveIvtThresholds()` → `DEFAULT_IVT_THRESHOLDS`) → все SIVT-пороги null → правила не срабатывают
- Оба случая → `ivt_verdict = 'valid'`, `score_reliable = true`

### `score_reliable`

`false` при любом `ivt_verdict != 'valid'`. Отображается пользователю и в CSV. Не обнуляет Score математически — помечает его как недостоверный.

### Стратегическая развилка

Path A (текущая реализация): поведенческая детекция + fp_hash. Path B (деферред): серверный `X-Real-IP` → CIDR-матчинг, UA vs device_type mismatch из заголовков. IP-тип в `IvtListEntrySchema` заведён, парсер пропускает IP-записи (`entry.type !== 'ua'`) до активации Path B.

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

`impressions`: `impression_id` (UNIQUE), `session_group_id`, `created_at`, `campaign_id`, `creative_id`, `device_type`, `is_suspicious`, `score_final`, `tag_id`, `user_id`, составной `(user_id, created_at)`, `tag_constants_version`, `ivt_verdict`, `fp_hash`.

`ivt_list_configs`: partial unique `(is_active) WHERE is_active = true`.
`ivt_thresholds_configs`: partial unique `(is_active) WHERE is_active = true`.

`calibration_batches`: составной `(status, created_at)`, `created_by`. `calibration_items`: уникальный составной `(batch_id, impression_id)`, составной `(batch_id, status)`, `impression_id`.

`weight_configs`: `is_active`. `users`: `uuid` (UNIQUE), `login` (UNIQUE), `role`. `tags`: `uuid` (UNIQUE), `user_id`. `tag_constants_configs`: `is_active`.

### Retention

- `impressions`: 90 дней → retention job 03:00 UTC
- `calibration_items`: ON DELETE CASCADE с `impressions` (аудит удаляется вместе с данными)
- `calibration_items (pending)`: по TTL cleanup job каждые 15 минут
- `weight_configs`, `users`, `tags`, `tag_constants_configs`: не удаляются автоматически, `config_type`** (`'banner'` и `'video'` независимы). Поле `config_type text NOT NULL DEFAULT 'banner'`. Partial unique index `(config_type) WHERE is_active = true` — database-enforced инвариант без транзакционной логики.
- Бэкапы pg_dump: 04:00 UTC, ротация 30 дней

### Коды миграций

0. **packages/backend/drizzle/migrations/0000_sharp_mauler.sql**

```sql
CREATE TABLE IF NOT EXISTS "impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"impression_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"creative_id" text NOT NULL,
	"creative_type" text NOT NULL,
	"device_type" text NOT NULL,
	"timestamp_start" bigint NOT NULL,
	"timestamp_end" bigint NOT NULL,
	"signals_raw" jsonb NOT NULL,
	"signals_normalized" jsonb NOT NULL,
	"s1_raw_time_in_view" real,
	"s2_raw_share_of_screen" real,
	"s3_raw_scroll_speed" real,
	"s4_raw_active_time_pct" real,
	"s5_raw_top_event" text NOT NULL,
	"s7_raw_persistence" real,
	"s1_normalized" real,
	"s2_normalized" real,
	"s3_normalized" real,
	"s4_normalized" real,
	"s5_normalized" real,
	"s7_normalized" real,
	"f_presence" smallint NOT NULL,
	"score_final" real NOT NULL,
	"weights_version" text DEFAULT 'v1.0_uncalibrated' NOT NULL,
	"no_events" boolean DEFAULT false NOT NULL,
	"tab_mostly_hidden" boolean DEFAULT false NOT NULL,
	"anomaly_duration" boolean DEFAULT false NOT NULL,
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_impression_id" ON "impressions" USING btree ("impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_created_at" ON "impressions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_id" ON "impressions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creative_id" ON "impressions" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_device_type" ON "impressions" USING btree ("device_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_is_suspicious" ON "impressions" USING btree ("is_suspicious");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_score_final" ON "impressions" USING btree ("score_final");
```

1. **packages/backend/drizzle/migrations/0001_secret_whiplash.sql**

```sql
CREATE TABLE IF NOT EXISTS "weight_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"weights" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_weight_configs_is_active" ON "weight_configs" USING btree ("is_active");
--> statement-breakpoint
INSERT INTO "weight_configs" ("version", "weights", "description", "is_active")
VALUES (
  'v1.0_uncalibrated',
  '{"s1":0.30,"s2":0.20,"s3":0.15,"s4":0.15,"s5":0.15,"s7":0.05}',
  'Стартовые экспертные веса, не подтверждённые данными',
  true
);
```

2. **packages/backend/drizzle/migrations/0002_elite_puppet_master.sql**

```sql
ALTER TABLE "impressions" ADD COLUMN "session_group_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "segment_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_group_id" ON "impressions" USING btree ("session_group_id");
```

3. **packages/backend/drizzle/migrations/0003_f_presence_check_guarded.sql**

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_f_presence_valid'
  ) THEN
    ALTER TABLE "impressions" ADD CONSTRAINT "chk_f_presence_valid" CHECK (f_presence IN (0, 1));
  END IF;
END $$;
```

4. **packages/backend/drizzle/migrations/0004_public_thunderbolts.sql**

```sql
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "tag_id" bigint;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "user_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_tags_uuid" ON "tags" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tags_user_id" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_users_uuid" ON "users" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_users_login" ON "users" USING btree ("login");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_tag_id" ON "impressions" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_user_id" ON "impressions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_user_id_created_at" ON "impressions" USING btree ("user_id","created_at");
```

5. **packages/backend/drizzle/migrations/0005_familiar_zodiak.sql**

```sql
ALTER TABLE "impressions" ALTER COLUMN "tag_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ALTER COLUMN "user_id" SET NOT NULL;
```

6. **packages/backend/drizzle/migrations/0006_thick_robin_chapel.sql**

```sql
DO $$ BEGIN
 CREATE TYPE "public"."calibration_batch_status" AS ENUM('processing', 'ready', 'expired', 'failed', 'discarded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."calibration_item_status" AS ENUM('pending', 'approved');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calibration_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_weights_config_id" uuid NOT NULL,
	"selection" jsonb NOT NULL,
	"status" "calibration_batch_status" DEFAULT 'processing' NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calibration_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"impression_id" uuid NOT NULL,
	"previous_score_final" real NOT NULL,
	"previous_weights_version" text NOT NULL,
	"new_score_final" real NOT NULL,
	"new_weights_version" text NOT NULL,
	"status" "calibration_item_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_batches" ADD CONSTRAINT "calibration_batches_target_weights_config_id_weight_configs_id_fk" FOREIGN KEY ("target_weights_config_id") REFERENCES "public"."weight_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_batches" ADD CONSTRAINT "calibration_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_batch_id_calibration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."calibration_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_impression_id_impressions_id_fk" FOREIGN KEY ("impression_id") REFERENCES "public"."impressions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_batches_status_created_at" ON "calibration_batches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_batches_created_by" ON "calibration_batches" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_calibration_items_batch_impression" ON "calibration_items" USING btree ("batch_id","impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_items_batch_status" ON "calibration_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_items_impression_id" ON "calibration_items" USING btree ("impression_id");
```

7. **packages/backend/drizzle/migrations/0007_workable_rachel_grey.sql**

```sql
CREATE SEQUENCE IF NOT EXISTS "tag_constants_version_seq" START WITH 0 MINVALUE 0 INCREMENT BY 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tag_constants_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"constants" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"script_path" text,
	"file_size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_constants_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "tag_constants_version" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tag_constants_configs_is_active" ON "tag_constants_configs" USING btree ("is_active");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_tag_constants_version_tag_constants_configs_version_fk" FOREIGN KEY ("tag_constants_version") REFERENCES "public"."tag_constants_configs"("version") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_tag_constants_version" ON "impressions" USING btree ("tag_constants_version");
```

8. **packages/backend/drizzle/migrations/0008_fair_chimera.sql**

```sql
ALTER TABLE "impressions" ADD COLUMN "s6_raw_completion_rate" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_normalized" real;--> statement-breakpoint
ALTER TABLE "weight_configs" ADD COLUMN "config_type" text DEFAULT 'banner' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_s6_normalized" ON "impressions" USING btree ("s6_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_weight_configs_active_type" ON "weight_configs" USING btree ("config_type") WHERE "weight_configs"."is_active" = true;
UPDATE weight_configs SET config_type = 'banner' WHERE config_type IS NULL;
```

9. **packages/backend/drizzle/migrations/0009_slippery_marten_broadcloak.sql**

```sql
CREATE TABLE IF NOT EXISTS "ivt_list_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"entries" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"entries_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ivt_list_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ivt_thresholds_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"thresholds" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ivt_thresholds_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_verdict" text DEFAULT 'valid' NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_category" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_confidence" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "score_reliable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "fp_hash" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_signals" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_ivt_list_active" ON "ivt_list_configs" USING btree ("is_active") WHERE "ivt_list_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_ivt_thresholds_active" ON "ivt_thresholds_configs" USING btree ("is_active") WHERE "ivt_thresholds_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_ivt_verdict" ON "impressions" USING btree ("ivt_verdict");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_fp_hash" ON "impressions" USING btree ("fp_hash");
ALTER TABLE "impressions" ADD CONSTRAINT "chk_ivt_verdict_valid"
  CHECK (ivt_verdict IN ('valid', 'givt', 'sivt_suspected', 'sivt_confirmed'))
```

10. **packages/backend/drizzle/migrations/meta/_journal.json**

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1780321902208,
      "tag": "0000_sharp_mauler",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "7",
      "when": 1781780685407,
      "tag": "0001_secret_whiplash",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "7",
      "when": 1782212148740,
      "tag": "0002_elite_puppet_master",
      "breakpoints": true
    },
    {
      "idx": 3,
      "version": "7",
      "when": 1782213644493,
      "tag": "0003_f_presence_check_guarded",
      "breakpoints": true
    },
    {
      "idx": 4,
      "version": "7",
      "when": 1782311150523,
      "tag": "0004_public_thunderbolts",
      "breakpoints": true
    },
    {
      "idx": 5,
      "version": "7",
      "when": 1782331543227,
      "tag": "0005_familiar_zodiak",
      "breakpoints": true
    },
    {
      "idx": 6,
      "version": "7",
      "when": 1782384579028,
      "tag": "0006_thick_robin_chapel",
      "breakpoints": true
    },
    {
      "idx": 7,
      "version": "7",
      "when": 1782391291714,
      "tag": "0007_workable_rachel_grey",
      "breakpoints": true
    },
    {
      "idx": 8,
      "version": "7",
      "when": 1783010233095,
      "tag": "0008_fair_chimera",
      "breakpoints": true
    },
    {
      "idx": 9,
      "version": "7",
      "when": 1783338013342,
      "tag": "0009_slippery_marten_broadcloak",
      "breakpoints": true
    }
  ]
}
```

---

### Панель юзера

`GET /api/user/campaigns` — user-only endpoint для панели кампаний.

Защита:
- `requireAuth`
- без `requireAdmin`
- owner scope берётся только из `request.authUser.id`
- `userUuid`, query/body params для выбора владельца не принимаются

Возвращает агрегаты по кампаниям текущего пользователя:
- `campaignId`
- `impressionsCount`
- `creativesCount`
- `avgScore`
- `desktopRatioPct`
- `mobileRatioPct`
- `tabletRatioPct`
- `latestImpressionAt`

Device ratio считается SQL-агрегатами:
`count(device_type = X) / count(*) * 100`.

Frontend не строит campaign dashboard из paginated `/api/impressions`, потому что это даёт неполные агрегаты.