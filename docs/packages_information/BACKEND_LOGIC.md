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
    │                                 # автоприменение миграций, запуск фоновых jobs,
    │                                 # вызов bootstrapAll() при старте
    ├── db/
    │   ├── index.ts                  # Drizzle + pg-pool соединение
    │   ├── schema.ts                 # Drizzle-схема всех таблиц (обновлена: +6 таблиц
    │   │                             # сигнальных конфигов, +model_version колонки,
    │   │                             # +s6 raw поля, +publisher_domain, +skippable)
    │   └── migrations/               # SQL-файлы Drizzle Kit (0000–0017)
    │       ├── 0000_sharp_mauler.sql        # CREATE TABLE impressions
    │       ├── 0001_secret_whiplash.sql     # weight_configs
    │       ├── 0002_elite_puppet_master.sql # session_group_id, segment_index
    │       ├── 0003_f_presence_check_guarded.sql
    │       ├── 0004_public_thunderbolts.sql # users, tags
    │       ├── 0005_familiar_zodiak.sql     # NOT NULL на tag_id, user_id
    │       ├── 0006_thick_robin_chapel.sql  # calibration_batches, calibration_items
    │       ├── 0007_workable_rachel_grey.sql # tag_constants_configs
    │       ├── 0008_fair_chimera.sql        # s6_raw_completion_rate, config_type
    │       ├── 0009_slippery_marten_broadcloak.sql # ivt_list_configs, ivt_thresholds_configs
    │       ├── 0010_sloppy_luke_cage.sql    # s1_weibull_configs, s1_model_version
    │       ├── 0011_green_kitty_pryde.sql   # s3_logistic_configs, s3_model_version
    │       ├── 0012_seed_s1_s3_defaults.sql # bootstrap seed данных
    │       ├── 0013_pretty_xorn.sql         # s4_configs
    │       ├── 0014_dapper_purifiers.sql    # s5_logistic_configs, s4_model_version,
    │       │                                # s5_model_version
    │       ├── 0015_many_peter_quill.sql    # s6_logistic_configs, s6_model_version,
    │       │                                # s6_completion_rate_pct, s6_audible_time_sec,
    │       │                                # s6_duration_sec, s6_skippable
    │       ├── 0016_wild_goblin_queen.sql   # s7_quantile_configs, s7_model_version
    │       └── 0017_dear_jubilee.sql        # publisher_domain, idx_publisher_domain
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
    │   │                             # (обновлен: Promise.all с 6 model resolutions,
    │   │                             # skippable, publisher_domain)
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
    │   │                             # POST /:id/activate, GET /:id
    │   ├── ivt_thresholds.ts         # GET/POST /api/ivt-thresholds,
    │   │                             # POST /:id/activate
    │   ├── s1_weibull.ts             # GET /api/s1-weibull
    │   │                             # POST /:id/activate, /deactivate,
    │   │                             # /schedule-delete, /cancel-delete
    │   ├── s3_logistic.ts            # GET /api/s3-logistic (те же 5 эндпоинтов)
    │   ├── s4_config.ts              # GET /api/s4-config (те же 5 эндпоинтов)
    │   ├── s5_logistic.ts            # GET /api/s5-logistic (те же 5 эндпоинтов)
    │   ├── s6_logistic.ts            # GET /api/s6-logistic (те же 5 эндпоинтов)
    │   └── s7_quantile.ts            # GET /api/s7-quantile (те же 5 эндпоинтов)
    ├── services/
    │   ├── scoring.ts                # processImpression(): полный pipeline
    │   │                             # (обновлен: Promise.all model params,
    │   │                             # publisher_domain, все model_version в INSERT)
    │   ├── impressions.ts            # listImpressionsForAdmin/User(),
    │   │                             # getImpressionForAdmin(),
    │   │                             # buildWhereFromFilters(),
    │   │                             # NUMERIC_RANGE_COLUMNS, RangeFieldKey,
    │   │                             # JoinedImpressionRow (обновлен: +publisher_domain,
    │   │                             # +skippable, +s6 raw поля, +model_version поля),
    │   │                             # ADMIN_ONLY_COLUMNS (обновлен аналогично),
    │   │                             # toAdminImpressionRow (обновлен)
    │   ├── csv.ts                    # buildCsvResponse() — экспорт CSV
    │   │                             # (обновлен: CSV_BATCH_SIZE 500→10000,
    │   │                             # ADMIN_CSV_HEADER +publisher_domain, +skippable,
    │   │                             # +model_versions, +s6 raw поля)
    │   ├── auth.ts                   # verifyCredentials(), generateToken(),
    │   │                             # constant-time bcrypt.compare
    │   ├── users.ts                  # createUser() — транзакция user + tag,
    │   │                             # updateUserStatus(), bootstrapAdmin()
    │   ├── users_stats.ts            # getUsersWithStats() — LEFT JOIN +
    │   │                             # subquery primary tag
    │   ├── tags.ts                   # CRUD тегов, resolveActiveTagOwner()
    │   ├── bootstrap.ts              # bootstrapAll(): bootstrapAdmin() +
    │   │                             # bootstrapDefaultTagConstants() +
    │   │                             # bootstrapDefaultWeights() +
    │   │                             # bootstrapS1WeibullDefault() +
    │   │                             # bootstrapS3LogisticDefault() +
    │   │                             # bootstrapS4Default() +
    │   │                             # bootstrapS5LogisticDefault() +
    │   │                             # bootstrapS6LogisticDefault() +
    │   │                             # bootstrapS7QuantileDefault()
    │   │                             # Все функции идемпотентны (skip if exists)
    │   ├── weibull_config.ts         # S1: getActiveS1WeibullParams(segmentKey),
    │   │                             # in-memory кэш Map<segmentKey, WeibullParams>,
    │   │                             # CRUD + deletion timer pattern
    │   ├── logistic_config.ts        # S3: getActiveS3LogisticParams(segmentKey),
    │   │                             # in-memory кэш, CRUD + deletion timer
    │   ├── s4_config.ts              # S4: getActiveS4Config(segmentKey),
    │   │                             # returns S4ConfigResolution {config, modelVersion}
    │   ├── s4_fit.ts                 # fitLambda(), fitTRef(), fitS4Params() —
    │   │                             # fitting алгоритмы S4 (не в shared — только backend)
    │   ├── s5_logistic_config.ts     # S5: getActiveS5LogisticParams(segmentKey),
    │   │                             # in-memory кэш, CRUD + deletion timer
    │   ├── s6_logistic_config.ts     # S6: getActiveS6LogisticParams(segmentKey | null),
    │   │                             # null для баннеров → возвращает null (не DEFAULT),
    │   │                             # in-memory кэш, CRUD + deletion timer
    │   ├── s7_quantile_config.ts     # S7: getActiveS7Thresholds(deviceType),
    │   │                             # returns S7ThresholdsResolution,
    │   │                             # CRUD + deletion timer
    │   ├── s7_quantile_fit.ts        # fitS7Quantiles(), percentileContinuous() —
    │   │                             # квантильный fitting S7 (не в shared)
    │   ├── weights_config.ts         # CRUD версий весов, getActiveWeightsConfig()
    │   │                             # с in-memory кэшем, invalidateWeightsCache()
    │   │                             # (обновлен: activateWeightsConfig проверяет
    │   │                             # weights.s6 === 0 для banner → 422)
    │   ├── calibrations.ts           # createCalibrationBatch(),
    │   │                             # processCalibrationBatch() (фоновая),
    │   │                             # resolveSelectionWhere() — AND с adminUserId,
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
        │                             # каждые 15 минут. Экспортирует
        │                             # getDraftTtlMinutes() — единственный
        │                             # источник TTL, используется также
        │                             # services/calibrations.ts для expiresAt
        ├── ivt_frequency.ts          # частотный анализ по fp_hash, каждые 30 минут
        ├── scheduled_deletion.ts     # физическое удаление конфигов сигналов по
        │                             # deletion_scheduled_at, каждые 15 минут.
        │                             # Promise.all по всем 6 таблицам конфигов.
        │                             # Совмещен с calibration_cleanup в одном cron-слоте
        ├── s1_weibull_recalibration.ts  # S1 MLE пересчёт, cron 0 4 * * 0 (Sunday)
        ├── s3_logistic_recalibration.ts # S3 IRLS пересчёт, cron 0 5 * * 0
        ├── s4_calibration.ts            # S4 λ/T_ref пересчёт, cron 0 6 1 * * (monthly)
        ├── s5_logistic_recalibration.ts # S5 IRLS пересчёт, cron 0 6 * * 0
        ├── s6_logistic_recalibration.ts # S6 IRLS пересчёт, cron 0 7 * * 0
        └── s7_quantile_recalibration.ts # S7 квантили, cron 0 8 1 * * (monthly)
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
| `GET` | `/api/impressions/domain_aggregate` | агрегат по `creativeId` + опциональный `publisherDomain`: avg Score, avg S1–S7, `impressionsCount`, `campaignsCount`. Для admin: скоуп опционально сужается через `userUuid`. Для user: автоматически ограничен `ownerId` из JWT |
| `GET` | `/api/impressions/export/csv` | экспорт с UTF-8 BOM, батчинг 10 000 строк |
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
| `GET` | `/api/s1-weibull` | список Weibull-конфигов S1 |
| `POST` | `/api/s1-weibull/:id/activate` | активировать конфиг S1 |
| `POST` | `/api/s1-weibull/:id/deactivate` | деактивировать конфиг S1 |
| `POST` | `/api/s1-weibull/:id/schedule-delete` | запланировать удаление (TTL 60 мин) |
| `POST` | `/api/s1-weibull/:id/cancel-delete` | отменить удаление |
| `GET` | `/api/s3-logistic` | список логистических конфигов S3 |
| `POST` | `/api/s3-logistic/:id/activate` | активировать конфиг S3 |
| `POST` | `/api/s3-logistic/:id/deactivate` | деактивировать конфиг S3 |
| `POST` | `/api/s3-logistic/:id/schedule-delete` | запланировать удаление |
| `POST` | `/api/s3-logistic/:id/cancel-delete` | отменить удаление |
| `GET` | `/api/s4-config` | список конфигов S4 |
| `POST` | `/api/s4-config/:id/activate` | активировать конфиг S4 |
| `POST` | `/api/s4-config/:id/deactivate` | деактивировать конфиг S4 |
| `POST` | `/api/s4-config/:id/schedule-delete` | запланировать удаление |
| `POST` | `/api/s4-config/:id/cancel-delete` | отменить удаление |
| `GET` | `/api/s5-logistic` | список логистических конфигов S5 |
| `POST` | `/api/s5-logistic/:id/activate` | активировать конфиг S5 |
| `POST` | `/api/s5-logistic/:id/deactivate` | деактивировать конфиг S5 |
| `POST` | `/api/s5-logistic/:id/schedule-delete` | запланировать удаление |
| `POST` | `/api/s5-logistic/:id/cancel-delete` | отменить удаление |
| `GET` | `/api/s6-logistic` | список логистических конфигов S6 |
| `POST` | `/api/s6-logistic/:id/activate` | активировать конфиг S6 |
| `POST` | `/api/s6-logistic/:id/deactivate` | деактивировать конфиг S6 |
| `POST` | `/api/s6-logistic/:id/schedule-delete` | запланировать удаление |
| `POST` | `/api/s6-logistic/:id/cancel-delete` | отменить удаление |
| `GET` | `/api/s7-quantile` | список квантильных конфигов S7 |
| `POST` | `/api/s7-quantile/:id/activate` | активировать конфиг S7 |
| `POST` | `/api/s7-quantile/:id/deactivate` | деактивировать конфиг S7 |
| `POST` | `/api/s7-quantile/:id/schedule-delete` | запланировать удаление |
| `POST` | `/api/s7-quantile/:id/cancel-delete` | отменить удаление |

---

## Pipeline обработки показа

`services/scoring.ts`, вызывается из `POST /api/collect` через `routes/impressions.ts`.

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
   → skippable: payload.skippable (top-level, не из signals.s6)
   → s6SegmentKey = `${deviceType}|${skippable ? 'skippable' : 'non_skippable'}` для video,
     null для banner

5. Promise.all — параллельная загрузка всех зависимостей:
   → getActiveWeightsConfig(category)
     двухключевой in-memory кэш { banner, video }
   → getActiveIvtList()          in-memory кэш, nullable
   → getActiveIvtThresholds()    in-memory кэш, fallback DEFAULT_IVT_THRESHOLDS
   → getActiveS1WeibullParams(segmentKey)
     segmentKey = `${deviceType}|${creativeGroup}`, fallback DEFAULT_WEIBULL_PARAMS
     возвращает { params: WeibullParams, modelVersion: string }
   → getActiveS3LogisticParams(segmentKey)
     9 сегментов device×creative_group, fallback DEFAULT_LOGISTIC_PARAMS
     возвращает { params: LogisticParams, modelVersion: string }
   → getActiveS4Config(segmentKey)
     5 сегментов (desktop_banner, mobile_banner, desktop_video, mobile_video, default)
     возвращает S4ConfigResolution { config: S4Config, modelVersion: string }
   → getActiveS5LogisticParams(segmentKey)
     2 сегмента (desktop, mobile_tablet), fallback DEFAULT_S5_*
     возвращает { params: S5LogisticParams, modelVersion: string }
   → getActiveS6LogisticParams(s6SegmentKey)
     s6SegmentKey = null для banner → возвращает null (не DEFAULT)
     6 сегментов device×skippable для video, fallback DEFAULT_S6_LOGISTIC_PARAMS
     возвращает { params: S6LogisticParams, modelVersion: string } | null
   → getActiveS7Thresholds(deviceType)
     3 сегмента (desktop, mobile, tablet), fallback DEFAULT_S7_THRESHOLDS[deviceType]
     возвращает S7ThresholdsResolution { thresholds: S7Thresholds, modelVersion: string }

6. applyAnomalyCapping(payload)
   → кэппинг аномальных значений:
     S1: time_in_view_sec [0, 3600], anomaly_duration при >3600
     S2: share_of_screen [0, 100]
     S3: scroll_speed [0, 50000], stddev/counts ≥ 0
     S4: tab_active_time_ms, tab_total_time_ms ≥ 0; tab_switches_count ≥ 0
     S5: hover_duration_max_ms ≥ 0; cursor_proximity ≥ 0; entropy [0,1]
     S6: completion_rate_pct [0,100]; audible_time_sec [0,3600];
         duration_sec [0,3600]; replay_count ≥ 0; volume_level [0,100]
   → structuredClone — не мутирует входной payload

7. normalizeAll(capped, modelParams)
   → normalizeS1(s1, weibullParams) — Weibull CDF, 9 сегментов
   → normalizeS2(s2) — sqrt(shareAvg × shareMax) / 100
   → normalizeS3(s3, logisticParams) — логистика, 9 сегментов; null для iframe
   → normalizeS4(s4, s4Config) — нелинейная функция λ/T_ref, 5 сегментов
   → normalizeS5(s5, s5Params, deviceType) — логистика, 2 сегмента
   → normalizeS6(s6, s6Params) — логистика с interaction term; null для banner
   → normalizeS7(s7, deviceType, s7Thresholds) — квантильная формула, 3 сегмента
   Pure-функции, без side effects

8. computeScore(normalized, presenceThreshold, weights)
   → computeEffectiveWeights() — перераспределение при S3=null или S6=null
   → F_Presence по скользящему окну (presenceThreshold из version констант)
   → CPMind Score ∈ [0, 100]

9. Флаги подозрительности
   → no_events, tab_mostly_hidden, anomaly_duration → is_suspicious

9.5. classifyIvtSync(payload, ivtList, ivtThresholds, userAgent)
   → pure function из @cpmind/shared, не обращается к БД
   → userAgent из request.headers['user-agent']
   → GIVT early return при совпадении UA-паттерна (SIVT не проверяется)
   → SIVT: robotic_timing, synthetic_cursor,
     impossible_event_sequence (viewWithoutActiveTab: time_in_view > 3s)
   → confidence-агрегация (вероятностное объединение P(A∪B))
   → Результат: ivt_verdict, ivt_category, ivt_confidence, score_reliable, ivt_signals

10. INSERT в impressions
    → tag_id, user_id, tag_constants_version, weights_version денормализованы
    → publisher_domain из payload.publisher_domain
    → skippable из payload.skippable (boolean)
    → s1_model_version, s3_model_version, s4_model_version,
      s5_model_version, s6_model_version, s7_model_version
      (UUID активного конфига или 'default' при fallback)
    → s6_completion_rate_pct, s6_audible_time_sec, s6_duration_sec,
      s6_skippable: null для баннеров
    → signals_raw включает presence
    → ivt_verdict (DEFAULT 'valid'), ivt_category, ivt_confidence, score_reliable,
      fp_hash (из payload, nullable), ivt_signals (null при пустом массиве)
    → ON CONFLICT DO NOTHING на impression_id

11. Ответ 202 Accepted
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

**`ListFilters.publisherDomain`** — опциональный фильтр по домену площадки размещения. Транслируется в `eq(impressions.publisherDomain, value)` в `buildWhereFromFilters()`. Добавлен в `ImpressionListQuerySchema` как `z.string().min(1).optional()`. Используется фронтендом в режиме площадки (`domainView=1`).

**CSV-экспорт** (`buildWhereClause`, вызывается из `/export/csv`): расширен теми же `tagConstantsVersion`, `weightsVersion`, `publisherDomain` и диапазонными параметрами через `parseNumericParam()`.

### `services/impressions.ts` (обновлён)

**Новые поля в `ADMIN_ONLY_COLUMNS`:** `skippable` (из `impressions.s6Skippable`), `publisher_domain`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`, `s1_model_version`, `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version`.

**`JoinedImpressionRow` interface** расширен соответственно: `skippable: boolean | null`, `publisher_domain: string | null`, `s6_audible_time_sec: number | null`, `s6_duration_sec: number | null`, `s6_skippable: boolean | null`, все `*_model_version: string | null`.

**`toAdminImpressionRow()`** маппит новые поля: `publisher_domain: row.publisher_domain ?? 'unknown'`, `skippable: row.skippable ?? false`.

**`USER_VISIBLE_COLUMNS`** расширен: добавлен `publisher_domain: impressions.publisherDomain`. Соответственно, `publisher_domain` добавлен в `USER_VISIBLE_IMPRESSION_FIELDS` в `@cpmind/shared` — user-роль получает поле в JSON и CSV.

**`UserVisibleRow` interface** расширен: `publisher_domain: string | null`.

**`toUserImpressionRow()`** деструктурирует `publisher_domain` явно и применяет fallback: `publisher_domain: publisher_domain ?? 'unknown'`.

**`getPublisherDomainAggregate(creativeId, publisherDomain?, targetUserId?)`** — новая функция. Агрегирует метрики по `creativeId` с опциональным фильтром по `publisherDomain`. При `publisherDomain = undefined` — агрегация по всем доменам для данного creative. Использует Drizzle `avg()` и `countDistinct()`. Возвращает `PublisherDomainAggregate` из `@cpmind/shared`. Используется эндпоинтом `GET /api/impressions/domain_aggregate`.

### `services/csv.ts` (обновлён)

`CSV_BATCH_SIZE`: 500 → **10 000**. Снижает количество round-trips к БД при больших экспортах.

`ADMIN_CSV_HEADER` дополнен после `device_type`: `skippable`, `publisher_domain`; после `weights_version`: `s1_model_version`, `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version`; после presence-полей: `s6_raw_completion_rate`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`.

`rowToAdminCsvLine()` маппит все новые поля из `JoinedImpressionDetailRow`.

### `services/users_stats.ts`

`getUsersWithStats()` — одна публичная функция. LEFT JOIN impressions + подзапрос для первичного тега (через `min(tags.uuid)`), чтобы избежать декартова произведения (несколько тегов × несколько импрешенов у одного юзера). GROUP BY users.id. Возвращает `tagUuid`, `campaignsCount`, `creativesCount`, `impressionsCount`, `avgScore` (nullable при отсутствии показов).

### `services/weibull_config.ts` (новый)

`getActiveS1WeibullParams(segmentKey: string)` — in-memory кэш `Map<segmentKey, {params, modelVersion}>`. При отсутствии активного конфига для сегмента — fallback на global-сегмент, затем на `DEFAULT_WEIBULL_PARAMS {k:1.0, λ:5.0}`. `invalidateWeibullCache()` очищает весь Map. CRUD: `listS1WeibullConfigs()`, `activateS1WeibullConfig(id)`, `deactivateS1WeibullConfig(id)`, `scheduleS1WeibullDeletion(id)`, `cancelS1WeibullDeletion(id)`. Активация — транзакция: деактивировать другие конфиги того же `segment_key` → активировать целевой → инвалидировать кэш. `scheduleS1WeibullDeletion` — запрещён для активных конфигов (409 S1_WEIBULL_CONFIG_ACTIVE). `activateS1WeibullConfig` — запрещён при `deletion_scheduled_at IS NOT NULL` (409 S1_WEIBULL_CONFIG_DELETION_SCHEDULED).

### `services/logistic_config.ts` (новый)

`getActiveS3LogisticParams(segmentKey: string)` — аналогичный паттерн для S3. Параметры модели: `{beta0..beta7, featureMeans, featureStds}`. Fallback: нулевые коэффициенты → `normalizeS3` возвращает `sigmoid(0)×100 = 50`. `logistic_config.ts` — переиспользуемый паттерн кэширования; S5 и S6 имеют собственные сервисы по той же схеме.

### `services/s4_config.ts` (новый)

`getActiveS4Config(segmentKey: string)` — возвращает `S4ConfigResolution { config: S4Config, modelVersion: string }`. `S4Config: {lambda: number, tRefMs: number}`. 5 сегментов: `desktop_banner`, `mobile_banner`, `desktop_video`, `mobile_video`, `default`. Определение сегмента: `${deviceType}_${creativeCategory}`, fallback на `default`.

### `services/s4_fit.ts` (новый)

`fitLambda(data)` — MLE для штрафного параметра λ (частота переключений). `fitTRef(data)` — эталонная длина сессии T_ref (медиана activeSessions). `fitS4Params(data)` — возвращает `{lambda, tRefMs}`. Живёт в backend (не shared) — fitting-логика используется только recalibration cron, не нормализацией.

### `services/s5_logistic_config.ts` (новый)

`getActiveS5LogisticParams(segmentKey: string)` — 2 сегмента: `desktop`, `mobile_tablet`. Параметры: `{beta0..beta4}`. Fallback: `DEFAULT_S5_DESKTOP` / `DEFAULT_S5_MOBILE_TABLET`. Desktop prior: `{β0:-2.5, β1:3.8, β2:2.2, β3:0.8, β4:1.5}`. Mobile prior: `{β0:-2.0, β1:3.5, β2:2.8, β3:1.2, β4:0.9}`.

### `services/s6_logistic_config.ts` (новый)

`getActiveS6LogisticParams(segmentKey: string | null)` — ключевая особенность: `segmentKey = null` для баннеров → возвращает `null` (не DEFAULT). Баннер не имеет S6 физически — нет смысла в параметрах. 6 сегментов: `{desktop|mobile|tablet}|{skippable|non_skippable}` (разделитель `|`). Параметры: `{beta0..beta8, featureMeans, featureStds}` — 9 коэффициентов включая терм взаимодействия `completionZ×audibleZ`.

### `services/s7_quantile_config.ts` (новый)

`getActiveS7Thresholds(deviceType: string)` — возвращает `S7ThresholdsResolution { thresholds: S7Thresholds, modelVersion: string }`. `S7Thresholds: {relativeYLow, relativeYMid, clutterMid, clutterHigh}`. 3 сегмента по `device_type`. Fallback: `DEFAULT_S7_THRESHOLDS[deviceType]` (desktop/mobile/tablet — разные дефолты).

### `services/s7_quantile_fit.ts` (новый)

`fitS7Quantiles(data: S7RawObservation[])` — вычисляет квантили позиции и кластеринга из исторических данных. `percentileContinuous(sorted, p)` — линейная интерполяция (эквивалент PostgreSQL `percentile_cont`). `S7RawObservation: {relativeY, clutter, isAboveTheFold, deviceType}`. Живёт в backend — используется только `jobs/s7_quantile_recalibration.ts`.

### `services/bootstrap.ts` (обновлён)

`bootstrapAll()` вызывается из `index.ts` при старте. Включает:
- `bootstrapAdmin()` — идемпотентно (skip if exists)
- `bootstrapDefaultTagConstants()` — v0 из `DEFAULT_TAG_CONSTANTS`
- `bootstrapDefaultWeights()` — banner и video конфиги из `DEFAULT_BANNER_WEIGHTS` / `DEFAULT_VIDEO_WEIGHTS`
- `bootstrapS1WeibullDefault()` — 9 сегментов × `DEFAULT_WEIBULL_PARAMS`, `is_active=true`
- `bootstrapS3LogisticDefault()` — 9 сегментов, нулевые коэффициенты
- `bootstrapS4Default()` — 5 сегментов × дефолтные λ/T_ref
- `bootstrapS5LogisticDefault()` — 2 сегмента × prior-коэффициенты
- `bootstrapS6LogisticDefault()` — 6 сегментов, нулевые коэффициенты → S6=50
- `bootstrapS7QuantileDefault()` — 3 сегмента × `DEFAULT_S7_THRESHOLDS`

Все `bootstrapS*` функции: `INSERT ... ON CONFLICT DO NOTHING` — idempotent при повторном старте.

### `services/weights_config.ts` (обновлён)

`getActiveWeightsConfig(category: CreativeCategory)` — двухключевой in-memory кэш `{ banner: WeightsValues | null, video: WeightsValues | null }`. Запрос фильтруется по `configType = category`. Fallback на `DEFAULT_BANNER_WEIGHTS` / `DEFAULT_VIDEO_WEIGHTS` по категории. `s6: w['s6'] ?? 0` — страховка для исторических строк без S6 в JSONB. `invalidateWeightsCache()` инвалидирует оба ключа.

`createWeightsConfig()` — принимает `configType: CreativeCategory`, валидирует сумму 7 весов (включая s6) = 1.00.

`activateWeightsConfig()` — деактивирует только конфиги того же `configType` перед активацией. **Новый guard:** если `configType === 'banner'` и `weights.s6 !== 0` → 422 `WEIGHTS_BANNER_S6_NONZERO`. Баннеры не имеют видео-сигнала — ненулевой s6 вызвал бы тихое перераспределение веса при `normalizeS6(null)=null`. Database-enforced через partial unique index.

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

`getIvtListConfig()` - список конфигурации.

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

### Сводное расписание cron (UTC, без конфликтов)

| Cron | Job |
|---|---|
| `0 2 * * *` | pg_dump бэкап |
| `0 3 * * *` | `retention.ts` — удаление impressions >90d |
| `*/15 * * * *` | `calibration_cleanup.ts` + `scheduled_deletion.ts` |
| `*/30 * * * *` | `ivt_frequency.ts` |
| `0 4 * * 0` | `s1_weibull_recalibration.ts` (Sunday) |
| `0 5 * * 0` | `s3_logistic_recalibration.ts` (Sunday) |
| `0 6 * * 0` | `s5_logistic_recalibration.ts` (Sunday) |
| `0 7 * * 0` | `s6_logistic_recalibration.ts` (Sunday) |
| `0 6 1 * *` | `s4_calibration.ts` (monthly 1st) |
| `0 8 1 * *` | `s7_quantile_recalibration.ts` (monthly 1st) |

### `jobs/retention.ts`

Ежедневно 03:00 UTC. Удаляет `impressions` старше 90 дней. Связанные `calibration_items` удаляются каскадно (`ON DELETE CASCADE`).

### `jobs/calibration_cleanup.ts`

Каждые 15 минут. Удаляет `pending` черновики из батчей с `status='ready'` и `created_at < now() - TTL`. Обновляет статус на `expired`. `approved` элементы не трогает никогда.

Экспортирует `getDraftTtlMinutes()` — читает `CALIBRATION_DRAFT_TTL_MINUTES` из env, дефолт 60. Единственный источник TTL для всего проекта (`services/calibrations.ts` импортирует оттуда, а не дублирует константу).

**Известное ограничение:** батчи с `status='processing'` (зависшие, если backend упал в процессе) cleanup не подхватывает — только `ready`. Технический долг.

### `jobs/scheduled_deletion.ts` (новый)

Каждые 15 минут (совмещён с `calibration_cleanup` в одном cron-слоте). Физически удаляет конфиги сигналов с истёкшим таймером:

```sql
DELETE FROM s*_configs
WHERE deletion_scheduled_at IS NOT NULL
  AND deletion_scheduled_at <= NOW()
```

`Promise.all` по всем 6 таблицам: `s1_weibull_configs`, `s3_logistic_configs`, `s4_configs`, `s5_logistic_configs`, `s6_logistic_configs`, `s7_quantile_configs`. После удаления инвалидирует соответствующие in-memory кэши.

**Инварианты:** активные конфиги (`is_active=true`) не могут иметь `deletion_scheduled_at` — guard в `scheduleS*Deletion()` возвращает 409. Физическое удаление не производится над активными конфигами (дополнительная защита в WHERE).

### `jobs/ivt_frequency.ts`

Каждые 30 минут (cron `*/30 * * * *`). Выполняет кросс-сессионный частотный анализ по `fp_hash`.

**Логика:** GROUP BY `fp_hash` в окне `repeat_fp_window_min` минут. Если количество уникальных `creative_id` от одного `fp_hash` превышает `repeat_fp_max_creatives` — обновляет `ivt_verdict` до `sivt_suspected` или `sivt_confirmed` (в зависимости от `confidence >= confidence_confirm`), категория `botnet_frequency`.

**Инварианты:** только `valid`-записи рассматриваются как кандидаты. `givt`-записи не перезаписываются (`ne(impressions.ivtVerdict, 'givt')`). Пороги читаются через `getActiveIvtThresholds()` — если `repeat_fp_window_min` или `repeat_fp_max_creatives` равны null, job пропускается.

### `jobs/s1_weibull_recalibration.ts` (новый)

Cron `0 4 * * 0` (еженедельно, воскресенье 04:00 UTC). Окно: последние 30 дней, фильтр `is_suspicious=false`. `MIN_SAMPLE_SIZE=1000` на сегмент. По каждому из 9 сегментов (`{device}×{creative_group}`): выборка `s1_raw_time_in_view` из `impressions`, `fitWeibullMLE(samples)` из `@cpmind/shared`, INSERT нового конфига (inactive). Логирует `skip: only N samples` если выборка мала.

### `jobs/s3_logistic_recalibration.ts` (новый)

Cron `0 5 * * 0`. Окно 30d. `MIN_SAMPLE_SIZE=1000`. 9 сегментов. Прокси-метка: `y=1` если `time_in_view > медиана S1 по сегменту AND NOT suspicious`. `fitLogisticMLE(X, y)` из `@cpmind/shared` (IRLS). Фильтрует по `tag_constants_version` — только данные с той же версией констант что у целевого сегмента.

### `jobs/s4_calibration.ts` (новый)

Cron `0 6 1 * *` (ежемесячно, 1-е число 06:00 UTC). Окно 30d. `MIN_SAMPLE_SIZE=1000`. 5 сегментов. `fitS4Params(data)` из `services/s4_fit.ts`.

### `jobs/s5_logistic_recalibration.ts` (новый)

Cron `0 6 * * 0`. Окно 30d. `MIN_SAMPLE_SIZE=1000`. 2 сегмента. Прокси-метка: `y=1` если `clicked=true ИЛИ hover_duration_max_ms ≥ p75` по сегменту. `fitLogisticMLE` для desktop и mobile_tablet раздельно.

### `jobs/s6_logistic_recalibration.ts` (новый)

Cron `0 7 * * 0`. Окно 30d. `MIN_SAMPLE_SIZE=1000`. 6 сегментов `device×skippable`. Только `creative_type='video_creative'`, `s6_normalized IS NOT NULL`. Прокси-метка: `y=1` если `completion=true AND (unmuted_by_user OR NOT muted_throughout)`.

### `jobs/s7_quantile_recalibration.ts` (новый)

Cron `0 8 1 * *`. Окно **60 дней** (больше чем у остальных — квантилям нужен шире разброс данных, MIN_SAMPLE_SIZE=300 на сегмент). 3 сегмента по `device_type`. `fitS7Quantiles(data)` из `services/s7_quantile_fit.ts`. Вычисляет `relativeYLow` (p33 ATF), `relativeYMid` (p67 BTF), `clutterMid` (p50), `clutterHigh` (p80).

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

`impressions`: `impression_id` (UNIQUE), `session_group_id`, `created_at`, `campaign_id`, `creative_id`, `device_type`, `is_suspicious`, `score_final`, `s6_normalized`, `publisher_domain`, `tag_id`, `user_id`, составной `(user_id, created_at)`, `tag_constants_version`, `ivt_verdict`, `fp_hash`.

`ivt_list_configs`: partial unique `(is_active) WHERE is_active = true`.
`ivt_thresholds_configs`: partial unique `(is_active) WHERE is_active = true`.

`calibration_batches`: составной `(status, created_at)`, `created_by`. `calibration_items`: уникальный составной `(batch_id, impression_id)`, составной `(batch_id, status)`, `impression_id`.

`weight_configs`: `is_active`, partial unique `(config_type) WHERE is_active = true`. `users`: `uuid` (UNIQUE), `login` (UNIQUE), `role`. `tags`: `uuid` (UNIQUE), `user_id`. `tag_constants_configs`: `is_active`.

Каждая таблица сигнальных конфигов (`s1_weibull_configs`, `s3_logistic_configs`, `s4_configs`, `s5_logistic_configs`, `s6_logistic_configs`, `s7_quantile_configs`) имеет:
- Partial unique index `(segment_key/device_type) WHERE is_active = true` — database-enforced инвариант единственного активного конфига на сегмент
- Index по `deletion_scheduled_at` — для эффективной выборки в `scheduled_deletion.ts`

### Retention

- `impressions`: 90 дней → retention job 03:00 UTC
- `calibration_items`: ON DELETE CASCADE с `impressions` (аудит удаляется вместе с данными)
- `calibration_items (pending)`: по TTL cleanup job каждые 15 минут
- `s1/s3/s4/s5/s6/s7_*_configs` (неактивные с `deletion_scheduled_at`): физическое удаление каждые 15 минут через `scheduled_deletion.ts`. TTL задаётся в `scheduleS*Deletion()` — по умолчанию +60 минут от момента вызова
- `weight_configs`, `users`, `tags`, `tag_constants_configs`: не удаляются автоматически
- Бэкапы pg_dump: 02:00 UTC, ротация 30 дней

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

10. **packages/backend/drizzle/migrations/0010_sloppy_luke_cage.sql**

```sql
CREATE TABLE IF NOT EXISTS "s1_weibull_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "segment_key" text NOT NULL,
    "k" real NOT NULL,
    "lambda" real NOT NULL,
    "sample_size" integer NOT NULL,
    "fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s1_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s1_weibull_active_segment"
    ON "s1_weibull_configs" ("segment_key") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s1_weibull_deletion_scheduled_at"
    ON "s1_weibull_configs" ("deletion_scheduled_at");
```

11. **packages/backend/drizzle/migrations/0011_green_kitty_pryde.sql**

```sql
CREATE TABLE IF NOT EXISTS "s3_logistic_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "segment_key" text NOT NULL,
    "tag_constants_version" text NOT NULL,
    "coefficients" jsonb NOT NULL,
    "feature_means" jsonb NOT NULL,
    "feature_stds" jsonb NOT NULL,
    "sample_size" integer NOT NULL,
    "accuracy" real,
    "fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s3_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s3_logistic_active_segment"
    ON "s3_logistic_configs" ("segment_key") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s3_logistic_deletion_scheduled_at"
    ON "s3_logistic_configs" ("deletion_scheduled_at");
```

12. **packages/backend/drizzle/migrations/0012_seed_s1_s3_defaults.sql**

Bootstrap seed данных для дефолтных конфигов S1 и S3 (9 сегментов каждый, `is_active=true`).

13. **packages/backend/drizzle/migrations/0013_pretty_xorn.sql**

```sql
CREATE TABLE IF NOT EXISTS "s4_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "segment_key" text NOT NULL,
    "version" text NOT NULL,
    "lambda" real NOT NULL,
    "t_ref_ms" integer NOT NULL,
    "sample_size" integer,
    "is_active" boolean DEFAULT false NOT NULL,
    "deletion_scheduled_at" timestamp with time zone,
    "fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s4_configs_active_segment"
    ON "s4_configs" ("segment_key") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s4_configs_deletion_scheduled_at"
    ON "s4_configs" ("deletion_scheduled_at");
```

14. **packages/backend/drizzle/migrations/0014_dapper_purifiers.sql**

```sql
CREATE TABLE IF NOT EXISTS "s5_logistic_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "segment_key" text NOT NULL,
    "tag_constants_version" text NOT NULL,
    "coefficients" jsonb NOT NULL,
    "sample_size" integer NOT NULL,
    "accuracy" real,
    "fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s4_model_version" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s5_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s5_logistic_active_segment"
    ON "s5_logistic_configs" ("segment_key") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s5_logistic_deletion_scheduled_at"
    ON "s5_logistic_configs" ("deletion_scheduled_at");
```

15. **packages/backend/drizzle/migrations/0015_many_peter_quill.sql**

```sql
CREATE TABLE IF NOT EXISTS "s6_logistic_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "segment_key" text NOT NULL,
    "tag_constants_version" text NOT NULL,
    "coefficients" jsonb NOT NULL,
    "feature_means" jsonb NOT NULL,
    "feature_stds" jsonb NOT NULL,
    "sample_size" integer NOT NULL,
    "accuracy" real,
    "fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_model_version" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_completion_rate_pct" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_audible_time_sec" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_duration_sec" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_skippable" boolean;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s6_logistic_active_segment"
    ON "s6_logistic_configs" ("segment_key") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s6_logistic_deletion_scheduled_at"
    ON "s6_logistic_configs" ("deletion_scheduled_at");
```

16. **packages/backend/drizzle/migrations/0016_wild_goblin_queen.sql**

```sql
CREATE TABLE IF NOT EXISTS "s7_quantile_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "device_type" text NOT NULL,
    "relative_y_low" real NOT NULL,
    "relative_y_mid" real NOT NULL,
    "clutter_mid" real NOT NULL,
    "clutter_high" real NOT NULL,
    "sample_size" integer NOT NULL,
    "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s7_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s7_quantile_active_device"
    ON "s7_quantile_configs" ("device_type") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s7_quantile_deletion_scheduled_at"
    ON "s7_quantile_configs" ("deletion_scheduled_at");
```

17. **packages/backend/drizzle/migrations/0017_dear_jubilee.sql**

```sql
ALTER TABLE "impressions" ADD COLUMN "publisher_domain" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_publisher_domain"
    ON "impressions" USING btree ("publisher_domain");
```

18. **packages/backend/drizzle/migrations/meta/_journal.json**

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
    },
    {
      "idx": 10,
      "version": "7",
      "when": 1783530000000,
      "tag": "0010_sloppy_luke_cage",
      "breakpoints": true
    },
    {
      "idx": 11,
      "version": "7",
      "when": 1783530060000,
      "tag": "0011_green_kitty_pryde",
      "breakpoints": true
    },
    {
      "idx": 12,
      "version": "7",
      "when": 1783530120000,
      "tag": "0012_seed_s1_s3_defaults",
      "breakpoints": true
    },
    {
      "idx": 13,
      "version": "7",
      "when": 1783530180000,
      "tag": "0013_pretty_xorn",
      "breakpoints": true
    },
    {
      "idx": 14,
      "version": "7",
      "when": 1783530240000,
      "tag": "0014_dapper_purifiers",
      "breakpoints": true
    },
    {
      "idx": 15,
      "version": "7",
      "when": 1783530300000,
      "tag": "0015_many_peter_quill",
      "breakpoints": true
    },
    {
      "idx": 16,
      "version": "7",
      "when": 1783530360000,
      "tag": "0016_wild_goblin_queen",
      "breakpoints": true
    },
    {
      "idx": 17,
      "version": "7",
      "when": 1783530420000,
      "tag": "0017_dear_jubilee",
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