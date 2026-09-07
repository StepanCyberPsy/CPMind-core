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

```txt
    ├── [DIR] backend
        ├── [FILE] Dockerfile
        ├── [DIR] drizzle
        ├── [FILE] drizzle.config.ts
            ├── [DIR] migrations
                ├── [FILE] 0000_initial.sql
                ├── [FILE] 0000_sharp_mauler.sql
                ├── [FILE] 0001_secret_whiplash.sql
                ├── [FILE] 0002_elite_puppet_master.sql
                ├── [FILE] 0003_f_presence_check_guarded.sql
                ├── [FILE] 0004_public_thunderbolts.sql
                ├── [FILE] 0005_familiar_zodiak.sql
                ├── [FILE] 0006_thick_robin_chapel.sql
                ├── [FILE] 0007_workable_rachel_grey.sql
                ├── [FILE] 0008_fair_chimera.sql
                ├── [FILE] 0009_slippery_marten_broadcloak.sql
                ├── [FILE] 0010_sloppy_luke_cage.sql
                ├── [FILE] 0011_green_kitty_pryde.sql
                ├── [FILE] 0012_seed_s1_s3_defaults.sql
                ├── [FILE] 0013_pretty_xorn.sql
                ├── [FILE] 0014_dapper_purifiers.sql
                ├── [FILE] 0015_many_peter_quill.sql
                ├── [FILE] 0016_wild_goblin_queen.sql
                ├── [FILE] 0017_dear_jubilee.sql
                ├── [FILE] 0018_dapper_karnak.sql
                ├── [FILE] 0019_seed_default_weights.sql
                ├── [FILE] 0020_wide_marauders.sql
                ├── [FILE] 0021_aromatic_silver_samurai.sql
                ├── [DIR] meta
                    ├── [FILE] 0000_snapshot.json
                    ├── [FILE] 0001_snapshot.json
                    ├── [FILE] 0002_snapshot.json
                    ├── [FILE] 0003_snapshot.json
                    ├── [FILE] 0004_snapshot.json
                    ├── [FILE] 0005_snapshot.json
                    ├── [FILE] 0006_snapshot.json
                    ├── [FILE] 0007_snapshot.json
                    ├── [FILE] 0008_snapshot.json
                    ├── [FILE] 0009_snapshot.json
                    ├── [FILE] 0010_snapshot.json
                    ├── [FILE] 0011_snapshot.json
                    ├── [FILE] 0013_snapshot.json
                    ├── [FILE] 0014_snapshot.json
                    ├── [FILE] 0015_snapshot.json
                    ├── [FILE] 0016_snapshot.json
                    ├── [FILE] 0017_snapshot.json
                    ├── [FILE] 0018_snapshot.json
                    ├── [FILE] 0020_snapshot.json
                    ├── [FILE] 0021_snapshot.json
                    ├── [FILE] _journal.json
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [DIR] db
                ├── [FILE] index.ts
                ├── [FILE] schema.ts
            ├── [FILE] index.ts
            ├── [DIR] jobs
                ├── [FILE] asset_gc.ts
                ├── [FILE] calibration_cleanup.ts
                ├── [FILE] ivt_frequency.ts
                ├── [FILE] retention.ts
                ├── [FILE] s1_weibull_recalibration.ts
                ├── [FILE] s3_logistic_recalibration.ts
                ├── [FILE] s4_calibration.ts
                ├── [FILE] s5_logistic_recalibration.ts
                ├── [FILE] s6_logistic_recalibration.ts
                ├── [FILE] s7_quantile_recalibration.ts
                ├── [FILE] scheduled_deletion.ts
            ├── [DIR] lib
                ├── [FILE] env.ts
            ├── [DIR] middleware
                ├── [FILE] requireAdmin.ts
                ├── [FILE] requireAuth.ts
            ├── [DIR] routes
                ├── [FILE] auth.ts
                ├── [FILE] calibrations.ts
                ├── [FILE] campaigns.ts
                ├── [FILE] creatives.ts
                ├── [FILE] delivery.ts
                ├── [FILE] health.ts
                ├── [FILE] impressions.ts
                ├── [FILE] ivt_lists.ts
                ├── [FILE] ivt_thresholds.ts
                ├── [FILE] placements.ts
                ├── [FILE] s1_weibull.ts
                ├── [FILE] s3_logistic.ts
                ├── [FILE] s4_config.ts
                ├── [FILE] s5_logistic.ts
                ├── [FILE] s6_logistic.ts
                ├── [FILE] s7_quantile.ts
                ├── [FILE] tag_constants.ts
                ├── [FILE] tags.ts
                ├── [FILE] uploads.ts
                ├── [FILE] users.ts
                ├── [FILE] vast.ts
                ├── [FILE] weights_config.ts
            ├── [FILE] server.ts
            ├── [DIR] services
                ├── [FILE] auth.ts
                ├── [FILE] bootstrap.ts
                ├── [DIR] calibration
                    ├── [FILE] calibrate_signals.ts
                    ├── [FILE] calibrations.ts
                ├── [FILE] campaigns.ts
                ├── [DIR] configs
                    ├── [FILE] logistic_config.ts
                    ├── [FILE] s4_config.ts
                    ├── [FILE] s4_fit.ts
                    ├── [FILE] s5_logistic_config.ts
                    ├── [FILE] s6_logistic_config.ts
                    ├── [FILE] s7_quantile_config.ts
                    ├── [FILE] s7_quantile_fit.ts
                    ├── [FILE] weibull_config.ts
                    ├── [FILE] weights_config.ts
                ├── [FILE] creatives.ts
                ├── [FILE] csv.ts
                ├── [DIR] delivery
                    ├── [FILE] embed.ts
                    ├── [FILE] events.ts
                    ├── [FILE] publisher.ts
                    ├── [FILE] sessions.ts
                ├── [FILE] impressions.ts
                ├── [DIR] ivt
                    ├── [FILE] ivt_list.ts
                    ├── [FILE] ivt_thresholds.ts
                ├── [FILE] placements.ts
                ├── [FILE] scoring.ts
                ├── [DIR] storage
                    ├── [FILE] client.ts
                    ├── [FILE] keys.ts
                    ├── [FILE] multipart.ts
                    ├── [FILE] presign.ts
                ├── [DIR] tag
                    ├── [FILE] tag_builder.ts
                    ├── [FILE] tag_constants.ts
                    ├── [FILE] tags.ts
                ├── [DIR] uploads
                    ├── [FILE] multipart.ts
                    ├── [FILE] presign.ts
                    ├── [FILE] service.ts
                ├── [DIR] users
                    ├── [FILE] users.ts
                    ├── [FILE] users_stats.ts
                ├── [DIR] vast
                    ├── [FILE] inline.ts
                    ├── [FILE] tracking.ts
                    ├── [FILE] validator.ts
                    ├── [FILE] xml.ts
        ├── [FILE] tsconfig.json
```

---

## API — публичные эндпоинты

> Доступны без авторизации. Delivery-эндпоинты доступны с любого origin (`CORS: *`); `/api/collect` разрешает все origins с credentials.

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

### `GET /e/:token`

Генерация embed script для placement. Основной delivery-эндпоинт для hosted creative flow.

- `token` — `delivery_token` из таблицы `placements` (base64url 32 символа)
- `Cache-Control: no-store` — каждый запрос уникален (`adSessionId` генерируется при каждом вызове)
- CORS: `Access-Control-Allow-Origin: *`, `credentials: false`
- Возвращает пустую строку (не ошибку) при: неизвестном token, неактивном placement, отсутствии ready creative version, отсутствии primary asset

**Логика резолвинга версии:** используется закреплённая (`creativeVersionId` в placement) если она в статусе `ready`; иначе — последняя `ready` версия по `version DESC`. Если ни одной нет — пустая строка.

**Структура генерируемого JS:**
```javascript
(function() {
  'use strict';
  var el = document.createElement('div');
  el.style.width = '{width}px'; el.style.height = '{height}px';
  el.style.overflow = 'hidden';
  document.body.appendChild(el);
  window.__CPMIND_QUEUE__ = window.__CPMIND_QUEUE__ || [];
  var cfg = { /* DeliveryRuntimeConfig + displayRuntimeVersion + playerRuntimeVersion */ };
  cfg.container = el;
  window.__CPMIND_QUEUE__.push(cfg);
  if (!window.__CPMIND_LOADER__) {
    window.__CPMIND_LOADER__ = true;
    var s = document.createElement('script');
    s.src = '{CDN_BASE_URL}/runtime/cpmind-loader_v1.min.js';
    s.async = true;
    document.head.appendChild(s);
  }
})();
```

Контейнер `div` создаётся и монтируется в `document.body` embed script'ом — издатель вставляет только `<script>` тег. `__CPMIND_LOADER__` guard — один loader на страницу при нескольких placement'ах.

**`assetUrl`:** для `banner_html5` — `buildCreativeUrl(storageKey)` (`creative.cpmind.tech`), для всех остальных — `buildCdnUrl(storageKey)` (`cdn.cpmind.tech`).

**`measurementMode`** вычисляется на backend:

| `creativeType` | `measurementMode` |
|---|---|
| `video_creative` | `full_cpmind_player` |
| `banner_html5` | `partial_embedded_iframe` |
| остальные | `full_direct_display` |

**Создание `ad_session`:** вызов `createAdSession()` происходит при каждом `GET /e/:token` — до первого клиентского события. `adSessionId` генерируется сервером (`randomUUID()`), включается в `DeliveryRuntimeConfig` и передаётся в SDK через queue entry. Последующие delivery events от SDK приходят с этим id.

---

### `POST /api/delivery/event`

Приём SDK lifecycle событий. Обновляет временны́е метки в `ad_sessions`.

- Zod-валидация `DeliveryEventPayloadSchema` — 422 при ошибке
- 204 немедленно, запись в БД fire-and-forget
- CORS: `Access-Control-Allow-Origin: *`, `credentials: false`
- Идемпотентность через `COALESCE` — первое событие каждого типа авторитетно, повторные игнорируются

**Маппинг `eventType` → поле `ad_sessions`:**

| `eventType` | Поле |
|---|---|
| `asset_load_started` | `assetLoadStartedAt` |
| `creative_ready` | `creativeReadyAt` |
| `render_confirmed` | `renderConfirmedAt` |
| `creative_error`, `player_error` | `errorAt`, `errorCode` |
| `closed` | `measurementEndedAt` |
| `requested` | только `lastSeenAt` |

---

### `GET /vast/:token`

VAST 4.3 InLine XML для видео placement'а.

- `Cache-Control: no-store`
- `Content-Type: application/xml; charset=utf-8`
- CORS: `Access-Control-Allow-Origin: *`, `credentials: false`
- При неизвестном token, не-video creative, отсутствии renditions или невалидной длительности — возвращает `<VAST version="4.3" />` (empty VAST), HTTP 200. Никогда не 4xx — VAST-совместимые плееры ожидают XML, не ошибки

**Валидация медиа URL:** `assertTrustedMediaUrl` проверяет `protocol === 'https:'` и `hostname === CDN_HOSTNAME` (из `getCdnBaseUrl()`). Несовпадение → исключение → empty VAST. Предотвращает подстановку внешних URL в VAST.

**Tracking URLs** генерируются с паттерном `{DELIVERY_BASE_URL}/t/vast/{event}?sid={adSessionId}`. Для `error` — дополнительный параметр `&code=[ERRORCODE]` (IAB macro, заменяется плеером).

**Создание `ad_session`:** аналогично embed endpoint — новая сессия при каждом запросе.

---

### `GET /t/vast/:event`

VAST tracking pixel. Обновляет временны́е метки видео-событий в `ad_sessions`.

- 204 немедленно, запись fire-and-forget
- CORS: `Access-Control-Allow-Origin: *`, `credentials: false`
- Zod-валидация `VastTrackingRequestSchema` (query params `sid`, опционально `code`) — при ошибке просто return (не 422, tracking не должен ломать воспроизведение)
- Идемпотентность через `COALESCE` — первое событие авторитетно

**Маппинг `event` → поле `ad_sessions`:**

| `event` | Поле |
|---|---|
| `impression` | `vastImpressionAt` |
| `start` | `videoStartedAt` |
| `firstQuartile` | `firstQuartileAt` |
| `midpoint` | `midpointAt` |
| `thirdQuartile` | `thirdQuartileAt` |
| `complete` | `completedAt` |
| `skip` | `skippedAt` |
| `error` | `errorAt`, `errorCode` |
| остальные (pause, resume, mute, click...) | только `lastSeenAt` |

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
| `POST` | `/api/campaigns` | создать кампанию (`name`); retry на коллизию `campaign_key` (max 2) |
| `GET` | `/api/campaigns` | список активных кампаний текущего пользователя |
| `GET` | `/api/creatives` | список creatives, фильтр `notInArray(['draft','archived'])` |
| `GET` | `/api/creatives/:uuid` | детальный вид: версии DESC + ассеты по `priority ASC` с CDN URL |
| `POST` | `/api/creatives/:uuid/archive` | архивировать creative (только `status='active'`) |
| `POST` | `/api/creative-uploads` | создать upload session; возвращает presigned URL (single) или part URLs (multipart) |
| `POST` | `/api/creative-uploads/:uuid/complete` | завершить upload → атомарная транзакция: session+version+creative→processing, insert job |
| `GET` | `/api/creative-uploads/:uuid` | статус сессии; `creativeVersionUuid` возвращается при `ready` или `failed` |
| `POST` | `/api/placements` | создать placement; `ensureTagForUser`, `deliveryToken = randomBytes(24).base64url` |
| `GET` | `/api/placements` | список placements с creative info |
| `GET` | `/api/placements/:uuid` | детальный вид: `embedCode`/`vastUrl` (null если version не ready) |
| `PATCH` | `/api/placements/:uuid` | обновить параметры |
| `POST` | `/api/placements/:uuid/activate` | активировать |
| `POST` | `/api/placements/:uuid/deactivate` | деактивировать |

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

#### UPDATE

**Новые поля в `ADMIN_ONLY_COLUMNS`:** `skippable` (из `impressions.s6Skippable`), `publisher_domain`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`, `s1_model_version`, `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version`.

**`JoinedImpressionRow` interface** расширен соответственно: `skippable: boolean | null`, `publisher_domain: string | null`, `s6_audible_time_sec: number | null`, `s6_duration_sec: number | null`, `s6_skippable: boolean | null`, все `*_model_version: string | null`.

**`toAdminImpressionRow()`** маппит новые поля: `publisher_domain: row.publisher_domain ?? 'unknown'`, `skippable: row.skippable ?? false`.

**`USER_VISIBLE_COLUMNS`** расширен: добавлен `publisher_domain: impressions.publisherDomain`. Соответственно, `publisher_domain` добавлен в `USER_VISIBLE_IMPRESSION_FIELDS` в `@cpmind/shared` — user-роль получает поле в JSON и CSV.

**`UserVisibleRow` interface** расширен: `publisher_domain: string | null`.

**`toUserImpressionRow()`** деструктурирует `publisher_domain` явно и применяет fallback: `publisher_domain: publisher_domain ?? 'unknown'`.

**`getPublisherDomainAggregate(creativeId, publisherDomain?, targetUserId?)`** — новая функция. Агрегирует метрики по `creativeId` с опциональным фильтром по `publisherDomain`. При `publisherDomain = undefined` — агрегация по всем доменам для данного creative. Использует Drizzle `avg()` и `countDistinct()`. Возвращает `PublisherDomainAggregate` из `@cpmind/shared`. Используется эндпоинтом `GET /api/impressions/domain_aggregate`.

### `services/csv.ts`

`CSV_BATCH_SIZE`: 500 → **10 000**. Снижает количество round-trips к БД при больших экспортах.

`ADMIN_CSV_HEADER` дополнен после `device_type`: `skippable`, `publisher_domain`; после `weights_version`: `s1_model_version`, `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version`; после presence-полей: `s6_raw_completion_rate`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`.

`rowToAdminCsvLine()` маппит все новые поля из `JoinedImpressionDetailRow`.

### `services/users/users_stats.ts`

`getUsersWithStats()` — одна публичная функция. LEFT JOIN impressions + подзапрос для первичного тега (через `min(tags.uuid)`), чтобы избежать декартова произведения (несколько тегов × несколько импрешенов у одного юзера). GROUP BY users.id. Возвращает `tagUuid`, `campaignsCount`, `creativesCount`, `impressionsCount`, `avgScore` (nullable при отсутствии показов).

### `services/configs/weibull_config.ts`

`getActiveS1WeibullParams(segmentKey: string)` — in-memory кэш `Map<segmentKey, {params, modelVersion}>`. При отсутствии активного конфига для сегмента — fallback на global-сегмент, затем на `DEFAULT_WEIBULL_PARAMS {k:1.0, λ:5.0}`. `invalidateWeibullCache()` очищает весь Map. CRUD: `listS1WeibullConfigs()`, `activateS1WeibullConfig(id)`, `deactivateS1WeibullConfig(id)`, `scheduleS1WeibullDeletion(id)`, `cancelS1WeibullDeletion(id)`. Активация — транзакция: деактивировать другие конфиги того же `segment_key` → активировать целевой → инвалидировать кэш. `scheduleS1WeibullDeletion` — запрещён для активных конфигов (409 S1_WEIBULL_CONFIG_ACTIVE). `activateS1WeibullConfig` — запрещён при `deletion_scheduled_at IS NOT NULL` (409 S1_WEIBULL_CONFIG_DELETION_SCHEDULED).

### `services/configs/logistic_config.ts`

`getActiveS3LogisticParams(segmentKey: string)` — аналогичный паттерн для S3. Параметры модели: `{beta0..beta7, featureMeans, featureStds}`. Fallback: нулевые коэффициенты → `normalizeS3` возвращает `sigmoid(0)×100 = 50`. `logistic_config.ts` — переиспользуемый паттерн кэширования; S5 и S6 имеют собственные сервисы по той же схеме.

### `services/configs/s4_config.ts`

`getActiveS4Config(segmentKey: string)` — возвращает `S4ConfigResolution { config: S4Config, modelVersion: string }`. `S4Config: {lambda: number, tRefMs: number}`. 5 сегментов: `desktop_banner`, `mobile_banner`, `desktop_video`, `mobile_video`, `default`. Определение сегмента: `${deviceType}_${creativeCategory}`, fallback на `default`.

### `services/configs/s4_fit.ts`

`fitLambda(data)` — MLE для штрафного параметра λ (частота переключений). `fitTRef(data)` — эталонная длина сессии T_ref (медиана activeSessions). `fitS4Params(data)` — возвращает `{lambda, tRefMs}`. Живёт в backend (не shared) — fitting-логика используется только recalibration cron, не нормализацией.

### `services/configs/s5_logistic_config.ts`

`getActiveS5LogisticParams(segmentKey: string)` — 2 сегмента: `desktop`, `mobile_tablet`. Параметры: `{beta0..beta4}`. Fallback: `DEFAULT_S5_DESKTOP` / `DEFAULT_S5_MOBILE_TABLET`. Desktop prior: `{β0:-2.5, β1:3.8, β2:2.2, β3:0.8, β4:1.5}`. Mobile prior: `{β0:-2.0, β1:3.5, β2:2.8, β3:1.2, β4:0.9}`.

### `services/configs/s6_logistic_config.ts`

`getActiveS6LogisticParams(segmentKey: string | null)` — ключевая особенность: `segmentKey = null` для баннеров → возвращает `null` (не DEFAULT). Баннер не имеет S6 физически — нет смысла в параметрах. 6 сегментов: `{desktop|mobile|tablet}|{skippable|non_skippable}` (разделитель `|`). Параметры: `{beta0..beta8, featureMeans, featureStds}` — 9 коэффициентов включая терм взаимодействия `completionZ×audibleZ`.

### `services/configs/s7_quantile_config.ts`

`getActiveS7Thresholds(deviceType: string)` — возвращает `S7ThresholdsResolution { thresholds: S7Thresholds, modelVersion: string }`. `S7Thresholds: {relativeYLow, relativeYMid, clutterMid, clutterHigh}`. 3 сегмента по `device_type`. Fallback: `DEFAULT_S7_THRESHOLDS[deviceType]` (desktop/mobile/tablet — разные дефолты).

### `services/configs/s7_quantile_fit.ts`

`fitS7Quantiles(data: S7RawObservation[])` — вычисляет квантили позиции и кластеринга из исторических данных. `percentileContinuous(sorted, p)` — линейная интерполяция (эквивалент PostgreSQL `percentile_cont`). `S7RawObservation: {relativeY, clutter, isAboveTheFold, deviceType}`. Живёт в backend — используется только `jobs/s7_quantile_recalibration.ts`.

### `services/bootstrap.ts`

`bootstrapAll()` отсутствует — `index.ts` вызывает каждую функцию напрямую в строгой последовательности, каждая в собственном `try/catch` с `process.exit(1)` при ошибке. Функции:
- `bootstrapAdmin()` — идемпотентно (skip if exists)
- `bootstrapTagConstants()` — v0 из `DEFAULT_TAG_CONSTANTS`
- `bootstrapDefaultWeights()` — banner и video конфиги из `DEFAULT_BANNER_WEIGHTS` / `DEFAULT_VIDEO_WEIGHTS`
- `bootstrapS1WeibullDefault()` — глобальный сегмент `'global'` × `DEFAULT_WEIBULL_PARAMS`, `is_active=true`
- `bootstrapS3LogisticDefault()` — глобальный сегмент `'global'`, нулевые коэффициенты
- `bootstrapS4Default()` — 5 сегментов × дефолтные λ/T_ref
- `bootstrapS5Default()` — 2 сегмента × prior-коэффициенты
- `bootstrapS6Default()` — 6 сегментов, нулевые коэффициенты → S6=50
- `bootstrapS7Default()` — 3 сегмента × `DEFAULT_S7_THRESHOLDS`

Все `bootstrapS*` функции: `INSERT ... ON CONFLICT DO NOTHING` — idempotent при повторном старте.

### `services/configs/weights_config.ts`

`getActiveWeightsConfig(category: CreativeCategory)` — двухключевой in-memory кэш `{ banner: WeightsValues | null, video: WeightsValues | null }`. Запрос фильтруется по `configType = category`. Fallback на `DEFAULT_BANNER_WEIGHTS` / `DEFAULT_VIDEO_WEIGHTS` по категории. `s6: w['s6'] ?? 0` — страховка для исторических строк без S6 в JSONB. `invalidateWeightsCache()` инвалидирует оба ключа.

`createWeightsConfig()` — принимает `configType: CreativeCategory`, валидирует сумму 7 весов (включая s6) = 1.00.

`activateWeightsConfig()` — деактивирует только конфиги того же `configType` перед активацией. **Новый guard:** если `configType === 'banner'` и `weights.s6 !== 0` → 422 `WEIGHTS_BANNER_S6_NONZERO`. Баннеры не имеют видео-сигнала — ненулевой s6 вызвал бы тихое перераспределение веса при `normalizeS6(null)=null`. Database-enforced через partial unique index.

### `services/calibration/calibrations.ts`

Ключевые архитектурные решения, принятые в этой версии:

**`resolveSelectionWhere(selection, adminUserId)`** — ownership принудительно AND'ится во всех трёх режимах (`ids`, `session_groups`, `filter`). Ранее режимы `ids`/`session_groups` не проверяли владельца — IDOR-уязвимость, позволявшая пересчитать чужие данные, передав чужой `impression_id` в payload. Закрыта в этой сессии. Тест: два id (свой + чужой) в одном запросе → `totalItems: 1`.

**`processCalibrationBatch(batchId, selection, weights, adminUserId)`** — асинхронная, без await (`void processCalibrationBatch(...)`). Обрабатывает выборку чанками по 500 строк. `recomputeScoreFromNormalized()` пересчитывает только `score_final` — нормализованные сигналы, F_Presence, флаги не затрагиваются (не зависят от весов формульно).

**`approveCalibrationItems()`** — каждый элемент в отдельной транзакции. UPDATE impressions WHERE `score_final = previousScoreFinal` — optimistic concurrency, защита от перезаписи изменившихся данных. Конфликт → 409 по конкретному элементу, без блокировки остальных.

**`getLatestApprovedCalibrationForImpression(impressionId)`** — SELECT из `calibration_items` с `status='approved'`, ORDER BY `approved_at DESC`, LIMIT 1. Используется в `getImpressionForAdmin()` для поля `lastRecalibratedAt` в ответе API.

**`toApiBatch()`** — вычисляет `expiresAt` из `createdAt + getDraftTtlMinutes() * 60_000`. `getDraftTtlMinutes()` импортирован из `jobs/calibration_cleanup.ts` — единственный источник TTL, не дублируется.

### `services/tag/tag_builder.ts`

`buildTagBundle(constants, version, outputPath)` — esbuild JS API. Подставляет `define: { __CPMIND_CONSTANTS__: JSON.stringify(constants), __CPMIND_TAG_VERSION__: JSON.stringify(version) }`. Пишет результат в `outputPath` (Docker volume `tag_dist`). Вызывается из `services/tag_constants.ts` при создании/активации версии. Провал сборки откатывает запись в БД — нет версии без файла.

### `services/ivt/ivt_list.ts`

`getActiveIvtList()` — in-memory кэш активной версии `ivt_list_configs`. При отсутствии активной версии возвращает `null` (не пустой массив — различие семантически важно для `classifyIvtSync`). `invalidateIvtListCache()` инвалидирует при активации новой версии.

`parseIvtListCsv(csv)` — парсер CSV в массив `IvtListEntry[]`. Валидирует каждую строку через `IvtListEntrySchema`. Для `match_type='regex'` — компиляция паттерна с таймаутом (защита от катастрофического бэктрекинга). Для `match_type='cidr'` — валидация CIDR-нотации. Возвращает `{ entries, errors }` — частичный успех, невалидные строки пропускаются с описанием.

`createIvtListConfig()` / `activateIvtListConfig()` — CRUD по паттерну `weights_config.ts`. Активация в транзакции: деактивировать текущую → активировать целевую → `invalidateIvtListCache()`.

`getIvtListConfig()` - список конфигурации.

### `services/ivt/ivt_thresholds.ts`

`getActiveIvtThresholds()` — in-memory кэш. Fallback на `DEFAULT_IVT_THRESHOLDS` (все поля null) при отсутствии активной версии — SIVT-правила не срабатывают до первой калибровки. Валидирует JSONB через `IvtThresholdsSchema.safeParse()`.

`createIvtThresholdsConfig()` / `activateIvtThresholdsConfig()` — CRUD по тому же паттерну.

### `services/campaigns.ts`

`createCampaign(userId, name)` — генерирует уникальный `campaign_key` (16 hex символов из `randomUUID`). `ON CONFLICT DO NOTHING` + retry при коллизии ключа (max 2 попытки).

### `services/creatives.ts`

`listCreatives(userId)` — фильтрует `notInArray(creatives.status, ['draft', 'archived'])`. Возвращает `status` как строку — фронтенд отображает `processing`/`ready`/`active`/`failed`.

`getCreativeDetail(uuid, userId)` — возвращает все версии с ассетами. CDN URL строится через `buildCdnUrl(storageKey) = getCdnBaseUrl() + '/' + storageKey`. Версии упорядочены по `version DESC`, ассеты по `priority ASC`.

### `services/placements.ts`

`ensureTagForUser(userId)` — синтетический тег создаётся автоматически при первом placement пользователя (`label: 'cpmind-hosted'`). При наличии нескольких тегов берётся наиболее ранний по `id` (детерминированный выбор). Тег необходим для scoring pipeline: resolution `tag → owner`.

`createPlacement(payload, userId)` — проверяет принадлежность campaign и creative пользователю. `delivery_token = randomBytes(24).toString('base64url')`. `clickUrl: payload.clickUrl ?? creative.clickUrl ?? null` (override → creative default). `creativeVersionId` в placement = последняя ready версия на момент создания (или null).

`getPlacementDetail` — всегда берёт актуальный статус последней версии, не из `pinned creative_version_id`. `embedCode` и `vastUrl` генерируются только если `latestVersion.status === 'ready'`. `vastUrl` дополнительно проверяет `VIDEO_DELIVERY_MODES.has(mode)`.

### `services/delivery/embed.ts`

`resolveEmbedScript(token, publisherDomain)` — по `delivery_token` загружает placement + active creative version + assets + delivery_runtime_config. Генерирует JS скрипт с `window.__CPMIND_QUEUE__` содержащим полный `DeliveryRuntimeConfig`. Создаёт `ad_session` запись. Возвращает `null` при неактивном placement или отсутствии ready версии.

`resolveVastContext(token, publisherDomain)` — аналогично для VAST: загружает контекст, возвращает `VastInLineInput` или null.

### `services/delivery/events.ts`

`processDeliveryEvent(payload)` — маппинг `AdSessionDeliveryEventType` на timestamp-поля `ad_sessions`:

| Event type | Поле |
|---|---|
| `requested` | `requestedAt` |
| `asset_load_started` | `assetLoadStartedAt` |
| `creative_ready` | `creativeReadyAt` |
| `render_confirmed` | `renderConfirmedAt` |
| `closed` | `measurementEndedAt`, `finalizationReason` |
| `creative_error` | `errorAt`, `errorCode`, `finalizationReason` |

### `services/delivery/publisher.ts`

`extractPublisherDomain(referer)` — парсит `Referer` header через `new URL()`, возвращает hostname. При отсутствии или невалидном Referer — `null`. Используется для `publisherDomain` в `ad_sessions` и `impressions`.

### `services/storage/presign.ts`

| Константа | Значение | Назначение |
|---|---|---|
| `MULTIPART_THRESHOLD_BYTES` | 100 MB | Порог переключения на multipart |
| `PRESIGNED_TTL_SECONDS` | 3600 (1 час) | TTL presigned URL и upload session |
| `PART_SIZE_BYTES` | 10 MB | Размер части multipart upload |
| `MIN_PART_SIZE_BYTES` | 5 MB | Минимальный размер части (S3-ограничение) |

### `services/uploads/service.ts` — `completeUploadSession`

Транзакция включает все четыре операции атомарно: `upload_session → processing`, `creative_version → processing`, `creative → processing`, `INSERT creative_processing_jobs`. Processing job создаётся с `processingProfileVersion = 'v1.0'`.

`getUploadSessionStatus` возвращает `creativeVersionUuid` только при `status = 'ready' | 'failed'` — фронтенд останавливает polling в обоих случаях, не только при успехе.

### `services/vast/inline.ts`

`assertTrustedMediaUrl` вызывается для каждого rendition перед генерацией XML — CDN hostname берётся из `getCdnBaseUrl()` динамически. Несоответствие origin → `throw` → empty VAST в route handler. `formatDuration` конвертирует через целые миллисекунды (`Math.round(sec * 1000)`) — исключает carry-ошибку при `frac*1000 === 1000`.

### `services/vast/tracking.ts`

COALESCE-паттерн аналогичен `events.ts`. События без специфического поля (pause, resume, mute, unmute, rewind, click и др.) обновляют только `lastSeenAt`. `error` дополнительно записывает `errorCode` через COALESCE (первый код авторитетен).

### `services/vast/validator.ts`

Вызывает `xmllint --schema vast_4.2.xsd` через `execFile`. Файл записывается во временный путь с random suffix, удаляется в `finally`. Используется VAST 4.2 XSD как ближайшая доступная схема (IAB не опубликовал XSD для 4.3). Только для admin-валидации при необходимости — не вызывается автоматически при каждом `GET /vast/:token`.

### `services/storage/keys.ts`

Staging: `staging/{uploadSessionId}/{filename}`.

Delivery: `assets/sha256/{sha256[0:2]}/{sha256[2:4]}/{sha256}.{extension}` — двухуровневый SHA-256 prefix sharding. Снижает количество объектов в одном «каталоге» Object Storage при большом числе ассетов.

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
| `30 3 * * *` | `asset_gc.ts` — GC ассетов без FK-ссылок |

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

Cron `0 4 * * 0` (еженедельно, воскресенье 04:00 UTC). Окно: последние 30 дней, фильтр `is_suspicious=false`. `MIN_SAMPLE_SIZE=1000` на сегмент. По каждому из 9 сегментов (`{device}×{creative_group}`): выборка `s1_raw_time_in_view` из `impressions` через `inArray(impressions.creativeType, matchingCreativeTypes)`, `fitWeibullMLE(samples)` из `@cpmind/shared`, INSERT нового конфига (inactive). Логирует `skipped — insufficient sample size` если выборка мала.

### `jobs/s3_logistic_recalibration.ts` (новый)

Cron `0 5 * * 0`. Окно 30d. `MIN_SAMPLE_SIZE=1000`. 9 сегментов. Фильтр по `creative_type` через `inArray(impressions.creativeType, matchingCreativeTypes)`. Доминирующая `tag_constants_version` резолвится одним запросом перед сегментным циклом — только данные с этой версией констант попадают в обучение. Прокси-метка: `y=1` если `clicked=true ИЛИ time_in_view > медиана по сегменту`. `fitLogisticMLE(X, y)` из `@cpmind/shared` (IRLS). Hold-out 20% для оценки test accuracy.

### `jobs/s4_calibration.ts` (новый)

Cron `0 6 1 * *` (ежемесячно, 1-е число 06:00 UTC). Окно 30d. `MIN_SAMPLE_SIZE=1000`. 4 сегмента: `desktop_banner`, `mobile_banner`, `desktop_video`, `mobile_video` (сегмент `default` не калибруется автоматически — остаётся на bootstrap-значениях `v0`). Фильтр по `creative_type` и `device_type` через `inArray()`. `fitS4Params(data)` из `services/s4_fit.ts`. Версия конфига: `v_YYYY-MM-DD_auto`.

### `jobs/s5_logistic_recalibration.ts` (новый)

Cron `0 6 * * 0`. Окно 30d. `MIN_SAMPLE_SIZE=1000`. 2 сегмента. Прокси-метка: `y=1` если `clicked=true ИЛИ hover_duration_max_ms ≥ p75` по сегменту. `fitLogisticMLE` для desktop и mobile_tablet раздельно.

### `jobs/s6_logistic_recalibration.ts` (новый)

Cron `0 7 * * 0`. Окно 30d. `MIN_SAMPLE_SIZE=1000`. 6 сегментов `device×skippable`. Только `creative_type='video_creative'`, `s6_normalized IS NOT NULL`. Прокси-метка: `y=1` если `completion=true AND (unmuted_by_user OR NOT muted_throughout)`.

### `jobs/s7_quantile_recalibration.ts` (новый)

Cron `0 8 1 * *`. Окно **60 дней** (больше чем у остальных — квантилям нужен шире разброс данных, MIN_SAMPLE_SIZE=300 на сегмент). 3 сегмента по `device_type`. `fitS7Quantiles(data)` из `services/s7_quantile_fit.ts`. Вычисляет `relativeYLow` (p33 ATF), `relativeYMid` (p67 BTF), `clutterMid` (p50), `clutterHigh` (p80).

### `jobs/asset_gc.ts`

Ежедневно 03:30 UTC (`30 3 * * *`). Физически удаляет ассеты из Object Storage и таблицы `assets` если они: (а) старше 45 дней (`GC_GRACE_DAYS = 45`) и (б) не имеют FK-ссылок в `creative_version_assets`. Пакетная обработка по 100 записей (`GC_BATCH_SIZE = 100`). Bucket определяется по `asset_class`: `source` → `SOURCE_BUCKET`, остальные → `DELIVERY_BUCKET`. `NoSuchKey` на DELETE не является ошибкой (идемпотентность). Credentials: `cpmind-backend-signer` IAM ключ.

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
- **Delivery token:** `randomBytes(24).toString('base64url')` = 32 символа base64url = 192 бит энтропии. Непредсказуем, не является UUID (нет структурных атак). Единственный способ получить embed script или VAST — знать token, который выдаётся только аутентифицированному владельцу placement через `GET /api/placements/:uuid`.
- **`allowedDomains`:** поле placement для whitelist доменов. В текущей реализации хранится в БД и возвращается в API, принудительная проверка при embed script resolution — в дорожной карте.

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

### Дополнительные индексы

- `campaigns` — `uuid` (UNIQUE), составной UNIQUE `(user_id, campaign_key)`
- `creatives` — `uuid` (UNIQUE), `user_id`, `campaign_id`, составной UNIQUE `(campaign_id, creative_key)`, partial index по `status`
- `creative_versions` — `uuid` (UNIQUE), составной UNIQUE `(creative_id, version)`
- `creative_version_assets` — составной UNIQUE `(creative_version_id, asset_id, role)`
- `assets` — UNIQUE `sha256`, UNIQUE `storage_key`, index по `status`
- `upload_sessions` — `uuid` (UNIQUE), UNIQUE `staging_key`, indices по `status`, `expires_at`, `creative_id`
- `creative_processing_jobs` — UNIQUE `upload_session_id` (один job на сессию), UNIQUE `creative_version_id` (migration 0021), partial index `(available_at, created_at) WHERE status='pending'` (SKIP LOCKED), partial index `(lease_expires_at) WHERE status='processing'` (recovery)
- `placements` — `uuid` (UNIQUE), UNIQUE `delivery_token`, indices по `user_id`, `campaign_id`, `creative_id`
- `delivery_runtime_configs` — UNIQUE `version`, partial UNIQUE `(is_active) WHERE is_active=true`
- `ad_sessions` — PK `ad_session_id`, indices по `placement_id`, `user_id`, `created_at`, `measurement_mode`, `creative_version_id`, `tag_id`

**Новые поля `impressions` (migration 0020):**

`ad_session_id` (FK → ad_sessions, nullable), `campaign_ref_id`, `creative_ref_id`, `creative_version_id`, `placement_id`, `delivery_mode` (enum), `measurement_mode` (enum, DEFAULT `legacy_tag`), `finalization_reason`.

**Новые индексы `impressions`:** `ad_session_id WHERE NOT NULL`, `measurement_mode`, `creative_version_id WHERE NOT NULL`.

**Seed в migration 0020:** `delivery_runtime_configs` `v1.0` — timeout'ы совпадают с `DEFAULT_PLAYER_TIMEOUTS` из `@cpmind/sdk`.

**Migration 0021:** добавляет в `creative_processing_jobs`: `creative_version_id` (NOT NULL, FK, UNIQUE), `processing_profile_version` (NOT NULL), `lease_expires_at`, `heartbeat_at`. Пересоздаёт индексы для SKIP LOCKED паттерна.

**`measurement_mode` enum:**

| Значение | Контекст |
|---|---|
| `legacy_tag` | legacy tag flow, `adSessionIdentity` отсутствует |
| `full_direct_display` | display-runtime (banner_static/gif/html5) |
| `full_cpmind_player` | player (video_creative) |
| `partial_embedded_iframe` | HTML5 в iframe без полного SDK |
| `vast_only` | только VAST без SDK measurement |

### Коды миграций

#### 1. packages/backend/drizzle/migrations/0000_sharp_mauler.sql

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

#### 2. packages/backend/drizzle/migrations/0001_secret_whiplash.sql

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

#### 3. packages/backend/drizzle/migrations/0002_elite_puppet_master.sql

```sql
ALTER TABLE "impressions" ADD COLUMN "session_group_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "segment_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_group_id" ON "impressions" USING btree ("session_group_id");
```

#### 4. packages/backend/drizzle/migrations/0003_f_presence_check_guarded.sql

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

#### 5. packages/backend/drizzle/migrations/0004_public_thunderbolts.sql

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

#### 6. packages/backend/drizzle/migrations/0005_familiar_zodiak.sql

```sql
ALTER TABLE "impressions" ALTER COLUMN "tag_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ALTER COLUMN "user_id" SET NOT NULL;
```

#### 7. packages/backend/drizzle/migrations/0006_thick_robin_chapel.sql

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

#### 8. packages/backend/drizzle/migrations/0007_workable_rachel_grey.sql

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

#### 9. packages/backend/drizzle/migrations/0008_fair_chimera.sql

```sql
ALTER TABLE "impressions" ADD COLUMN "s6_raw_completion_rate" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_normalized" real;--> statement-breakpoint
ALTER TABLE "weight_configs" ADD COLUMN "config_type" text DEFAULT 'banner' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_s6_normalized" ON "impressions" USING btree ("s6_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_weight_configs_active_type" ON "weight_configs" USING btree ("config_type") WHERE "weight_configs"."is_active" = true;
UPDATE weight_configs SET config_type = 'banner' WHERE config_type IS NULL;
```

#### 10. packages/backend/drizzle/migrations/0009_slippery_marten_broadcloak.sql

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

#### 11. packages/backend/drizzle/migrations/0010_sloppy_luke_cage.sql

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

#### 12. packages/backend/drizzle/migrations/0011_green_kitty_pryde.sql

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

#### 13. packages/backend/drizzle/migrations/0012_seed_s1_s3_defaults.sql

Bootstrap seed данных для дефолтных конфигов S1 и S3 (9 сегментов каждый, `is_active=true`).

```sql
INSERT INTO s1_weibull_configs (segment_key, k, lambda, sample_size, is_active)
VALUES ('global', 1.0, 5.0, 0, true)
ON CONFLICT DO NOTHING;

INSERT INTO s3_logistic_configs (
  segment_key, tag_constants_version,
  coefficients, feature_means, feature_stds,
  sample_size, is_active
) VALUES (
  'global', 'v0',
  '{"beta0":0,"beta1":0,"beta2":0,"beta3":0,"beta4":0,"beta5":0,"beta6":0,"beta7":0}',
  '{"speed":0,"stddev":0,"pause":0,"direction":0,"streak":0}',
  '{"speed":1,"stddev":1,"pause":1,"direction":1,"streak":1}',
  0, true
)
ON CONFLICT DO NOTHING;
```

#### 14. packages/backend/drizzle/migrations/0013_pretty_xorn.sql

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

#### 15. packages/backend/drizzle/migrations/0014_dapper_purifiers.sql

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

#### 16. packages/backend/drizzle/migrations/0015_many_peter_quill.sql

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

#### 17. packages/backend/drizzle/migrations/0016_wild_goblin_queen.sql

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

#### 18. packages/backend/drizzle/migrations/0017_dear_jubilee.sql

```sql
ALTER TABLE "impressions" ADD COLUMN "publisher_domain" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_publisher_domain"
    ON "impressions" USING btree ("publisher_domain");
```

#### 19. packages/backend/drizzle/migrations/0018_dapper_karnak.sql** (фикс DEFAULT-весов для видео):

```sql
UPDATE "weight_configs"
SET
  "version" = 'v1.0_uncalibrated_banner',
  "description" = 'Стартовые экспертные веса для баннеров, не подтверждённые данными',
  "weights" = '{"s1":0.30,"s2":0.20,"s3":0.15,"s4":0.15,"s5":0.15,"s6":0.00,"s7":0.05}'
WHERE "version" = 'v1.0_uncalibrated';
--> statement-breakpoint
INSERT INTO "weight_configs" ("version", "config_type", "weights", "description", "is_active")
VALUES (
  'v1.0_uncalibrated_video',
  'video',
  '{"s1":0.15,"s2":0.10,"s3":0.10,"s4":0.10,"s5":0.10,"s6":0.40,"s7":0.05}',
  'Стартовые экспертные веса для видео, не подтверждённые данными',
  true
)
ON CONFLICT ("version") DO NOTHING;
```

#### 20. packages/backend/drizzle/migrations/0020_wide_marauders.sql

```sql
DO $$ BEGIN
 CREATE TYPE "public"."asset_class" AS ENUM('source', 'image', 'animated_image', 'video', 'video_poster', 'html_file', 'svg');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."autoplay_mode" AS ENUM('autoplay', 'click_to_play');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."autoplay_outcome" AS ENUM('started', 'blocked', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."campaign_status" AS ENUM('active', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."creative_status" AS ENUM('draft', 'processing', 'ready', 'active', 'archived', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."creative_type" AS ENUM('banner_static', 'banner_gif', 'banner_html5', 'video_creative');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."creative_version_status" AS ENUM('draft', 'processing', 'ready', 'archived', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."delivery_mode" AS ENUM('display', 'instream_preroll', 'instream_midroll', 'instream_postroll', 'outstream', 'standalone_video');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."measurement_mode" AS ENUM('full_direct_display', 'full_cpmind_player', 'partial_embedded_iframe', 'vast_only', 'legacy_tag');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."processing_job_status" AS ENUM('pending', 'processing', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."upload_status" AS ENUM('created', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_sessions" (
	"ad_session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_id" uuid NOT NULL,
	"creative_version_id" uuid,
	"user_id" bigint NOT NULL,
	"tag_id" bigint,
	"creative_type" "creative_type" NOT NULL,
	"delivery_mode" "delivery_mode" NOT NULL,
	"measurement_mode" "measurement_mode" DEFAULT 'legacy_tag' NOT NULL,
	"publisher_domain" text,
	"player_runtime_version" text,
	"sdk_runtime_version" text,
	"autoplay_requested" boolean,
	"initial_muted" boolean,
	"autoplay_outcome" "autoplay_outcome",
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_load_started_at" timestamp with time zone,
	"creative_ready_at" timestamp with time zone,
	"render_confirmed_at" timestamp with time zone,
	"measurement_started_at" timestamp with time zone,
	"measurement_ended_at" timestamp with time zone,
	"vast_requested_at" timestamp with time zone,
	"vast_impression_at" timestamp with time zone,
	"video_started_at" timestamp with time zone,
	"first_quartile_at" timestamp with time zone,
	"midpoint_at" timestamp with time zone,
	"third_quartile_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"error_at" timestamp with time zone,
	"error_code" text,
	"finalization_reason" text,
	"playback_quality" jsonb,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" char(64) NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" real,
	"codec" text,
	"bitrate_bps" bigint,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"processing_profile_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_key" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_session_id" uuid NOT NULL,
	"status" "processing_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_version_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_asset_id" uuid,
	"status" "creative_version_status" DEFAULT 'draft' NOT NULL,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_key" text NOT NULL,
	"creative_type" "creative_type" NOT NULL,
	"name" text NOT NULL,
	"click_url" text,
	"status" "creative_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_runtime_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"timeouts" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_id" uuid NOT NULL,
	"creative_version_id" uuid,
	"tag_id" bigint NOT NULL,
	"delivery_token" text NOT NULL,
	"mode" "delivery_mode" NOT NULL,
	"plcmt" integer,
	"width" integer,
	"height" integer,
	"autoplay_mode" "autoplay_mode",
	"initial_muted" boolean DEFAULT true NOT NULL,
	"skippable" boolean DEFAULT false NOT NULL,
	"skip_offset_sec" real,
	"allowed_domains" text[],
	"click_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_id" uuid,
	"creative_type" "creative_type" NOT NULL,
	"staging_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"declared_mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" "upload_status" DEFAULT 'created' NOT NULL,
	"multipart_upload_id" text,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ad_session_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "campaign_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "creative_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "creative_version_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "placement_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "delivery_mode" "delivery_mode";--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "measurement_mode" "measurement_mode" DEFAULT 'legacy_tag' NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "finalization_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_processing_jobs" ADD CONSTRAINT "creative_processing_jobs_upload_session_id_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "public"."upload_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_version_assets" ADD CONSTRAINT "creative_version_assets_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_version_assets" ADD CONSTRAINT "creative_version_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatives" ADD CONSTRAINT "creatives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatives" ADD CONSTRAINT "creatives_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_placement_id" ON "ad_sessions" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_user_id" ON "ad_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_created_at" ON "ad_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_measurement_mode" ON "ad_sessions" USING btree ("measurement_mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_creative_version_id" ON "ad_sessions" USING btree ("creative_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_tag_id" ON "ad_sessions" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_assets_sha256" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_assets_storage_key" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_status" ON "assets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_campaigns_uuid" ON "campaigns" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_user_id" ON "campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_campaigns_user_campaign_key" ON "campaigns" USING btree ("user_id","campaign_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_cpj_upload_session_id" ON "creative_processing_jobs" USING btree ("upload_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_status_available" ON "creative_processing_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_locked_at" ON "creative_processing_jobs" USING btree ("locked_at") WHERE "creative_processing_jobs"."locked_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_cva_creative_version_asset_role" ON "creative_version_assets" USING btree ("creative_version_id","asset_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cva_creative_version_id" ON "creative_version_assets" USING btree ("creative_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cva_asset_id" ON "creative_version_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creative_versions_uuid" ON "creative_versions" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creative_versions_creative_version" ON "creative_versions" USING btree ("creative_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creatives_uuid" ON "creatives" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creatives_user_id" ON "creatives" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creatives_campaign_id" ON "creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creatives_campaign_creative_key" ON "creatives" USING btree ("campaign_id","creative_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_delivery_runtime_configs_version" ON "delivery_runtime_configs" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_delivery_runtime_configs_active" ON "delivery_runtime_configs" USING btree ("is_active") WHERE "delivery_runtime_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_placements_uuid" ON "placements" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_placements_delivery_token" ON "placements" USING btree ("delivery_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_user_id" ON "placements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_campaign_id" ON "placements" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_creative_id" ON "placements" USING btree ("creative_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_upload_sessions_uuid" ON "upload_sessions" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_upload_sessions_staging_key" ON "upload_sessions" USING btree ("staging_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_user_id" ON "upload_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_status" ON "upload_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_expires_at" ON "upload_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_creative_id" ON "upload_sessions" USING btree ("creative_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_ad_session_id_ad_sessions_ad_session_id_fk" FOREIGN KEY ("ad_session_id") REFERENCES "public"."ad_sessions"("ad_session_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_campaign_ref_id_campaigns_id_fk" FOREIGN KEY ("campaign_ref_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_creative_ref_id_creatives_id_fk" FOREIGN KEY ("creative_ref_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_ad_session_id" ON "impressions" USING btree ("ad_session_id") WHERE "impressions"."ad_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_measurement_mode" ON "impressions" USING btree ("measurement_mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_creative_version_id" ON "impressions" USING btree ("creative_version_id") WHERE "impressions"."creative_version_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "delivery_runtime_configs" ("version", "timeouts", "is_active") VALUES (
    'v1.0',
    '{"configRequestMs":5000,"vastRequestMs":8000,"mediaStartMs":15000,"firstFrameMs":10000,"contentHandoffMs":5000,"adLoadTotalMs":30000}',
    true
);
```

#### 21. packages/backend/drizzle/migrations/meta/0021_aromatic_silver_samurai.json

```sql
DROP INDEX IF EXISTS "idx_cpj_status_available";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cpj_locked_at";--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "creative_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "processing_profile_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_processing_jobs" ADD CONSTRAINT "creative_processing_jobs_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_cpj_creative_version_id" ON "creative_processing_jobs" USING btree ("creative_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_pending_available" ON "creative_processing_jobs" USING btree ("available_at","created_at") WHERE "creative_processing_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_processing_lease_expires_at" ON "creative_processing_jobs" USING btree ("lease_expires_at") WHERE "creative_processing_jobs"."status" = 'processing' AND "creative_processing_jobs"."lease_expires_at" IS NOT NULL;
```

#### Журнал миграций packages/backend/drizzle/migrations/meta/_journal.json

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
      "when": 1783515963280,
      "tag": "0010_sloppy_luke_cage",
      "breakpoints": true
    },
    {
      "idx": 11,
      "version": "7",
      "when": 1783527609563,
      "tag": "0011_green_kitty_pryde",
      "breakpoints": true
    },
    {
      "idx": 12,
      "version": "7",
      "when": 1783530000000,
      "tag": "0012_seed_s1_s3_defaults",
      "breakpoints": true
    },
    {
      "idx": 13,
      "version": "7",
      "when": 1783587836500,
      "tag": "0013_pretty_xorn",
      "breakpoints": true
    },
    {
      "idx": 14,
      "version": "7",
      "when": 1783598462390,
      "tag": "0014_dapper_purifiers",
      "breakpoints": true
    },
    {
      "idx": 15,
      "version": "7",
      "when": 1783676126460,
      "tag": "0015_many_peter_quill",
      "breakpoints": true
    },
    {
      "idx": 16,
      "version": "7",
      "when": 1783683150582,
      "tag": "0016_wild_goblin_queen",
      "breakpoints": true
    },
    {
      "idx": 17,
      "version": "7",
      "when": 1783692693514,
      "tag": "0017_dear_jubilee",
      "breakpoints": true
    },
    {
      "idx": 18,
      "version": "7",
      "when": 1784112881585,
      "tag": "0018_dapper_karnak",
      "breakpoints": true
    },
    {
      "idx": 19,
      "version": "7",
      "when": 1784200000000,
      "tag": "0019_seed_default_weights",
      "breakpoints": true
    },
    {
      "idx": 20,
      "version": "7",
      "when": 1788016731935,
      "tag": "0020_wide_marauders",
      "breakpoints": true
    },
    {
      "idx": 21,
      "version": "7",
      "when": 1788083944523,
      "tag": "0021_aromatic_silver_samurai",
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