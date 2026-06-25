# CPMind MVP

Система собирает поведенческие данные пользователей при взаимодействии с рекламными баннерами, рассчитывает единую метрику качества показа (CPMind Score, 0–100) и предоставляет аналитику с возможностью экспорта данных в CSV для ручной калибровки весов.

**Продакшн:** https://app.cpmind.tech

---

## Содержание

1. [Архитектура](#архитектура)
2. [Структура репозитория](#структура-репозитория)
3. [Технический стек](#технический-стек)
4. [Многопользовательская модель и роли](#многопользовательская-модель-и-роли)
5. [Что реализовано](#что-реализовано)
6. [Технический долг](#технический-долг)
7. [Dev vs Prod — различия окружений](#dev-vs-prod--различия-окружений)
8. [Тестирование](#тестирование)
9. [Локальный запуск (Dev)](#локальный-запуск-dev)
10. [Production деплой](#production-деплой)
11. [Переменные окружения](#переменные-окружения)
12. [Калибровка весов](#калибровка-весов)
13. [Версионирование констант тега](#версионирование-констант-тега)
14. [Следующие шаги — интеграция тега на сайт клиента](#следующие-шаги--интеграция-тега-на-сайт-клиента)

---

## Архитектура

Система состоит из трех логических компонентов:

```
Страница клиента с баннером
        |
   [JS-тег] --- сбор сигналов S1-S7 + F_Presence
        |       tag_uuid + tag_constants_version зашиты в конкретный
        |       собранный файл тега, идентифицируют владельца и
        |       версию калибруемых констант сбора сигналов
        |
        | sendBeacon / fetch keepalive
        v
   [Backend] --- резолв владельца (tag_uuid -> user), резолв версии
        |        констант (tag_constants_version), валидация,
        |        нормализация, расчет Score, хранение
        |
   [PostgreSQL] --- users/tags (владение) + impressions (signals_raw
        |           JSONB + нормализованные колонки) + weight_configs +
        |           tag_constants_configs + calibration_batches/items
        |
   [Панель аналитика] --- просмотр (с учетом роли admin/user), фильтры,
                           экспорт CSV, калибровка весов и констант тега
```

Каждый рекламный показ (импрешен) проходит через pipeline:

```
raw payload -> резолв tag_uuid (владелец: tag_id, user_id) ->
резолв tag_constants_version (presence-порог) -> кэппинг аномалий ->
нормализация S1-S7 -> перераспределение весов (если S3=null) ->
расчет F_Presence -> CPMind Score -> флаги подозрительности ->
сохранение в БД

Активная конфигурация весов загружается из таблицы weight_configs (БД)
при каждом импрешене. Изменение весов через панель не требует редеплоя.
Неизвестный либо неактивный tag_uuid/tag_constants_version -> 422,
запись не создается.
```

---

## Структура репозитория

Монорепо на основе pnpm workspaces. Четыре пакета с явными границами ответственности.

```
cpmind-mvp/
├── package.json                    # pnpm workspace root, общие скрипты
├── pnpm-workspace.yaml             # объявление workspace-пакетов
├── pnpm-lock.yaml                  # lockfile, коммитится
├── tsconfig.base.json              # базовый TypeScript-конфиг для всех пакетов
├── docker-compose.prod.yml         # 5 сервисов: nginx, backend, frontend, postgres, backup
│                                   # (tag-builder упразднен — сборка тега перенесена
│                                   # в backend, см. packages/backend/src/services/tag_builder.ts)
├── .env.example                    # шаблон переменных окружения
├── .gitignore
│
├── packages/
│   ├── shared/                     # @cpmind/shared
│   ├── tag/                        # @cpmind/tag
│   ├── backend/                    # @cpmind/backend
│   └── frontend/                   # @cpmind/frontend
│
├── nginx/                          # конфиг NGINX
│   ├── nginx.conf
│   ├── certs/.gitkeep              # SSL-сертификаты кладутся сюда на сервере
│   └── tag/                        # несколько одновременно существующих версионированных
│                                   # файлов cpmind-tag_v{N}.min.js, пишутся backend-ом
│                                   # в общий Docker volume tag_dist
│
├── backup/
│   └── crontab                     # расписание pg_dump для Docker
│
├── backups/                        # директория для pg_dump дампов (создается на сервере)
│
├── scripts/
│   └── renew-certs.sh              # скрипт обновления SSL-сертификатов + перезагрузка nginx
│
├── docs/                           # документация (дополняется в процессе)
│   ├── ARCHITECTURE.md
│   ├── TAG_INTEGRATION.md
│   ├── DEPLOYMENT.md
│   └── development_history/        # отчеты по итогам клиентского тестирования
│       ├── BUG_FIXING_V1.md        # итерация 1 (21.06.2026)
│       └── BUG_FIXING_V2.md        # итерация 2 (23.06.2026) — P-15, P-18, P-05
│
└── test/
    ├── banner-test.html            # тестовая страница (для локальной отладки тега)
    ├── banner-test_local.html      # тестовая страница для Docker-окружения (https://localhost)
    ├── banner-placeholder.html     # заглушка баннера 728x90
    └── SCENARIOS.md                # пошаговые инструкции 5 сценариев §10.2
```

---

### packages/shared (@cpmind/shared)

Общая бизнес-логика, схемы и типы. Единственный источник истины для всех остальных пакетов. Production-зависимость только Zod.

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                    # единственная точка экспорта публичного API
    ├── schemas/
    │   ├── impression.ts           # Zod-схемы всех полей сигналов S1-S7,
    │   │                           # F_Presence и корневого ImpressionPayload.
    │   │                           # tag_uuid (branded TagUuid) и tag_constants_version —
    │   │                           # обязательные поля. Используется в теге (типы),
    │   │                           # backend (runtime-валидация), frontend (типизация).
    │   │                           # Включает cross-field валидацию:
    │   │                           # timestamp_end >= timestamp_start
    │   ├── auth.ts                 # Zod-схемы LoginPayload, MePayload (GET /auth/me)
    │   ├── user.ts                 # UserRole, branded UserUuid, User, CreateUserPayload,
    │   │                           # UpdateUserPayload. Пароль валидируется по байтам
    │   │                           # UTF-8 (предел bcrypt — 72 байта, не символов)
    │   ├── tag.ts                  # branded TagUuid, Tag, CreateTagPayload (userUuid:
    │   │                           # UserUuid, не пересекается по типу с TagUuid),
    │   │                           # UpdateTagPayload
    │   ├── calibration.ts          # CalibrationSelection (discriminated union: ids /
    │   │                           # session_groups / filter), CalibrationBatch,
    │   │                           # CalibrationItem, ApproveCalibrationResult —
    │   │                           # контракты пересчета Score при смене весов
    │   ├── tag-constants.ts        # TagConstantsValues (19 калибруемых констант тега),
    │   │                           # TagConstantsConfig, CreateTagConstantsPayload,
    │   │                           # DEFAULT_TAG_CONSTANTS и TAG_BUILD_TARGETS —
    │   │                           # общий источник для backend bootstrap и CLI-сборки тега
    │   └── api.ts                  # Zod-схемы ответов API: ImpressionRow (включая
    │                               # tag_uuid, user_uuid, tag_label, user_login,
    │                               # tag_constants_version), ImpressionDetail,
    │                               # ImpressionListResponse, WeightConfigRow
    ├── access/
    │   └── impression-fields.ts    # USER_VISIBLE_IMPRESSION_FIELDS — единый whitelist
    │                               # полей импрешена для роли user. UserImpressionRowSchema —
    │                               # производный pick() от полного ImpressionRowSchema,
    │                               # не отдельно поддерживаемая копия
    ├── scoring/
    │   ├── capping.ts              # applyAnomalyCapping(): кэппинг аномальных
    │   │                           # значений согласно таблице §6.3 ТЗ.
    │   │                           # Вызывается строго ДО нормализации.
    │   │                           # Не мутирует входной payload (structuredClone)
    │   ├── normalize.ts            # normalizeS1-S7(): формулы нормализации §4.1-4.6.
    │   │                           # Все функции — pure, без side effects.
    │   │                           # normalizeAll(): агрегатор всех сигналов.
    │   │                           # getS5TopEventLabel(): текстовая метка для таблицы
    │   ├── weights.ts              # DEFAULT_WEIGHTS (v1.0_uncalibrated) — fallback.
    │   │                           # WeightsValues interface — тип для конфигурации
    │   │                           # из БД и DEFAULT_WEIGHTS.
    │   │                           # computeEffectiveWeights(): перераспределение
    │   │                           # весов при null-сигналах §6.2.
    │   │                           # detectNullSignals(): определение null-сигналов
    │   └── score.ts                # computeScore(): полный pipeline расчета, принимает
    │                               # presence-порог параметром (не константа — синхронизирован
    │                               # с активной версией констант тега, не дублируется).
    │                               # recomputeScoreFromNormalized(): пересчет Score на новых
    │                               # весах из уже сохраненных normalized-значений — используется
    │                               # только калибровкой, не повторяет кэппинг/нормализацию
    └── types/
        └── index.ts                # re-export всех TypeScript-типов
```

**Ключевые формулы (реализованы в normalize.ts):**

```
S1 = min(100, ln(time_in_view_sec + 1) / ln(11) * 100)
S2 = min(100, sqrt(share_of_screen_avg_pct) * 10)
S3 = base_speed_score + pause_bonus + return_bonus + reading_bonus - streak_penalty
S4 = (tab_active_time_ms / tab_total_time_ms) * 100
S5 = наивысший достигнутый уровень взаимодействия (0-100)
S7 = base_position + position_bonus + clutter_penalty + persistence_bonus

CPMind_Score = (S1*0.30 + S2*0.20 + S3*0.15 + S4*0.15 + S5*0.15 + S7*0.05) * F_Presence
```

---

### packages/tag (@cpmind/tag)

JS-тег для встраивания в произвольную HTML-страницу с рекламным баннером. Собирается в один файл через esbuild. Не импортирует @cpmind/shared в runtime — только браузерные API (зависимость devDependency, используется исключительно для типизации `TagConstantsValues` на этапе сборки, вытирается компилятором).

**Выходной артефакт:** `dist/cpmind-tag_v{N}.min.js` (~22-24 KB, IIFE-формат, размер зависит от набора констант версии). Версия и 19 калибруемых констант (см. [Версионирование констант тега](#версионирование-констант-тега)) подставляются esbuild через `define` на этапе сборки конкретного файла.

**Важно:** артефакт тега не коммитится в git. `packages/tag/Dockerfile` упразднен — сборка происходит не на этапе `docker build`, а в runtime внутри backend-контейнера через esbuild JS API (`packages/backend/src/services/tag_builder.ts`), по запросу администратора через `POST /api/tag-constants`. Несколько версий тега существуют одновременно на сервере — обновление поведения требует осознанной замены `<script src>` на странице клиента, не происходит автоматически.

```
packages/tag/
├── package.json
├── tsconfig.json
├── build.ts                        # esbuild конфиг + CLI entry point (локальная сборка
│                                   # с DEFAULT_TAG_CONSTANTS, version='dev').
│                                   # Экспортирует buildTagBundle()/watchTagBundle() —
│                                   # переиспользуются backend-ом для runtime-сборки
│                                   # конкретных версий (services/tag_builder.ts).
│                                   # TAG_BUILD_TARGETS (общий источник с backend):
│                                   # Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
├── dist/                           # НЕ коммитится в git — генерируется при сборке
│   └── cpmind-tag.min.js           # локальная dev-сборка (CLI), version='dev'
└── src/
    ├── index.ts                    # entry point. IIFE-обертка + глобальный try/catch.
    │                               # Поддержка нескольких баннеров на одной странице
    │                               # (querySelectorAll). Ошибка внутри тега не ломает
    │                               # страницу и не влияет на кликовую ссылку баннера
    ├── constants.ts                # Единая точка чтения 19 калибруемых констант
    │                               # из __CPMIND_CONSTANTS__/__CPMIND_TAG_VERSION__ —
    │                               # ambient-идентификаторы, подставляемые esbuild define
    │                               # при сборке конкретной версии
    ├── types.ts                    # TagConfig (включая tagUuid, tagConstantsVersion),
    │                               # Session, VisibilityEntry,
    │                               # SignalsS3State — полное состояние сессии показа.
    │                               # sessionGroupId — сквозной id показа, неизменен
    │                               # при сбросе сегмента. segmentIndex — порядковый
    │                               # номер сегмента внутри показа (P-15)
    ├── config.ts                   # parseConfig(): чтение data-атрибутов контейнера.
    │                               # Обязательные поля: data-tag-uuid (формат-валидация
    │                               # regex, привязка показа к владельцу), campaign_id,
    │                               # creative_id, creative_type, endpoint.
    │                               # tagConstantsVersion берется из constants.ts, не из
    │                               # data-атрибута — версия "знает себя" из сборки
    ├── session.ts                  # createSession(): начальное состояние сессии.
    │                               # buildPayload(): сборка ImpressionPayload из
    │                               # накопленного состояния сессии для отправки —
    │                               # включает tag_uuid и tag_constants_version из cfg.
    │                               # computeActiveTimeMsInRange(): пересчет S4 active
    │                               # time строго в границах показа из истории
    │                               # visibilityStateHistory — фикс P-05 (старый Math.min
    │                               # маскировал рассинхрон таймеров, не устранял его).
    │                               # resetSessionForNewSegment(): сброс полей сессии
    │                               # in-place при разрыве показа по простою (P-15)
    ├── segment.ts                  # startNewSegment(): оркестратор разрыва показа —
    │                               # финализация и отправка текущего сегмента (isFinal=false),
    │                               # сброс сессии, вызов resetSegmentSX() каждого сигнала.
    │                               # Вызывается из onIdle() callback в presence.ts (P-15)
    ├── signals/
    │   ├── s1.ts                   # initS1(): IntersectionObserver с threshold из
    │   │                           # S1_VIEWPORT_THRESHOLDS (constants.ts, дефолт [0, 0.5, 1.0]).
    │   │                           # Аккумулирует time_in_view_sec, max_continuous_view_sec,
    │   │                           # visible_pixels_pct. Стандарт MRC: >=50% пикселей
    │   │                           # (порог 0.5 захардкожен в самой проверке видимости,
    │   │                           # отдельно от калибруемого массива threshold).
    │   │                           # resetSegmentS1(): пересоздает observer при сбросе
    │   │                           # сегмента — гарантирует свежий intersection-callback
    │   │                           # для нового сегмента (P-15)
    │   ├── s2.ts                   # initS2(): сэмплирование доли экрана с интервалом
    │   │                           # S2_SAMPLE_INTERVAL_MS (constants.ts, дефолт 500 мс).
    │   │                           # Прекращает накопление после session.sent = true.
    │   │                           # Вычисляет видимую область через getBoundingClientRect
    │   │                           # и размеры viewport.
    │   │                           # resetSegmentS2(): очистка накопленных сэмплов
    │   │                           # при разрыве показа — sampler сам наполнит заново
    │   ├── s3.ts                   # initS3(): rAF-throttled scroll tracking в зоне
    │   │                           # +-SCROLL_ZONE_PX от баннера (constants.ts, дефолт
    │   │                           # 300px). 7 порогов калибруемы: PAUSE_THRESHOLD_MS,
    │   │                           # STREAK_WINDOW_MS, STREAK_MIN_EVENTS, STREAK_MIN_SPEED,
    │   │                           # READING_SPEED_MAX, READING_TIME_MIN, SCROLL_ZONE_PX.
    │   │                           # Welford's online algorithm для running mean/std_dev.
    │   │                           # Детектирует cross-domain iframe -> session.s3 = null.
    │   │                           # resetSegmentS3(): сброс running stats, таймеров
    │   │                           # пауз и pauseCheckInterval при разрыве показа (P-15)
    │   ├── s4.ts                   # initS4(): document.visibilitychange listener.
    │   │                           # Ведет visibility_state_history — единственный
    │   │                           # источник для пересчета active time (см. session.ts).
    │   │                           # resetSegmentS4(): сброс истории и счетчиков
    │   │                           # переключений при разрыве показа (P-15)
    │   ├── s5.ts                   # initS5(): роутинг по device_type.
    │   │                           # Desktop: click, mouseenter/leave/move, proximity,
    │   │                           # trajectory entropy. Mobile: touchstart/end/move
    │   │                           # (tap, swipe), gesturechange + pinch (zoom).
    │   │                           # 8 порогов детекции калибруемы через constants.ts:
    │   │                           # SWIPE_MIN_DISTANCE_PX (дефолт 60, поднят с 30, P-18),
    │   │                           # ENTROPY_ANGLE_THRESHOLD, PROXIMITY_TRACK_ZONE_PX,
    │   │                           # PINCH_DELTA_MIN_PX, GESTURE_SCALE_DELTA_MIN (добавлен
    │   │                           # против срабатывания gesturechange без порога, P-18),
    │   │                           # TAP_MAX_OFFSET_PX, TAP_MAX_DURATION_MS,
    │   │                           # MOUSE_MOVE_DEDUP_PX. EVENT_TYPES и AD_SELECTORS
    │   │                           # (s7.ts) сознательно не калибруются.
    │   │                           # resetSegmentS5(): сброс счетчиков взаимодействия
    │   │                           # и приватных замыканий (траектория, touch-state) (P-15)
    │   ├── s7.ts                   # initS7(): статические поля при инициализации
    │   │                           # (position, page_height, above_the_fold).
    │   │                           # Динамический сэмплинг с интервалом S7_SAMPLE_INTERVAL_MS
    │   │                           # (constants.ts, дефолт 1000 мс — отдельная константа
    │   │                           # от S2_SAMPLE_INTERVAL_MS, ранее было совпадение имен):
    │   │                           # competing_ads (эвристика AdTech-доменов + CSS,
    │   │                           # AD_SELECTORS захардкожен, не калибруется),
    │   │                           # viewability_persistence.
    │   │                           # resetSegmentS7(): сброс persistence-сэмплов при
    │   │                           # разрыве показа (is_above_the_fold не сбрасывается —
    │   │                           # свойство загрузки страницы, не сегмента)
    │   └── presence.ts             # initPresence(): отслеживание 10 типов событий
    │                               # (mouse, touch, key, scroll, click).
    │                               # Throttle 100 мс для timestamp, без throttle
    │                               # для счетчика events_count.
    │                               # Таймер простоя — PRESENCE_IDLE_TIMEOUT_MS из
    │                               # constants.ts. Полностью синхронизирован с presence-
    │                               # порогом, который backend резолвит по той же активной
    │                               # версии констант — рассинхронизация двух копий значения
    │                               # устранена структурно.
    │                               # Возвращает { cleanup, resetSegment } вместо
    │                               # одной cleanup-функции
    ├── transport/
    │   └── send.ts                 # finalizeAndSend(session, cfg, isFinal): идемпотентная
    │                               # финализация. isFinal=true (click/visibilitychange/
    │                               # pagehide) — session.sent залипает навсегда.
    │                               # isFinal=false (вызов из segment.ts при простое) —
    │                               # session.sent не залипает, следующий сегмент
    │                               # тоже отправится (P-15).
    │                               # sendPayload(): sendBeacon (основной) +
    │                               # fetch keepalive (fallback).
    │                               # attachUnloadHandlers(): три обработчика —
    │                               # click (capture, Mobile Safari fix),
    │                               # visibilitychange, pagehide.
    │                               # При unload вызывает cleanupPresence()
    ├── utils/
    │   ├── uuid.ts                 # generateUUID(): crypto.randomUUID() с polyfill
    │   │                           # через crypto.getRandomValues() для Safari 14
    │   └── device.ts               # detectDeviceType(): desktop / mobile / tablet
    └── debug/
        └── overlay.ts              # DebugOverlay: DOM-оверлей в правом нижнем углу.
                                    # Обновляется каждые 250 мс. Активируется через
                                    # URL-параметр ?cpmind_debug=1 или data-debug="true"
```

**Интеграция тега на страницу:**

```html
<div
  data-cpmind-creative
  data-tag-uuid="UUID_вашего_тега"
  data-campaign-id="camp_123"
  data-creative-id="creat_456"
  data-creative-type="banner_static"
  data-endpoint="https://app.cpmind.tech/api/collect"
  style="width: 728px; height: 90px;"
>
  <!-- баннер здесь — тег не модифицирует этот HTML -->
</div>
<script async src="https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js"></script>
```

**Mobile Safari fix (критический):** при клике по баннеру `sendBeacon` вызывается синхронно в обработчике click (capture: true) до начала навигации браузера. Это единственный надежный способ доставки данных при переходе по ссылке в iOS Safari.

---

### packages/backend (@cpmind/backend)

Fastify API-сервер. Принимает payload от тега, резолвит владельца и версию констант, рассчитывает Score, хранит данные, отдает панели аналитики. Также собирает runtime esbuild-бандлы тега по запросу администратора (services/tag_builder.ts).

```
packages/backend/
├── package.json                    # esbuild — production-зависимость (runtime-сборка тега)
├── tsconfig.json
├── drizzle.config.ts               # конфиг Drizzle Kit для генерации миграций
├── Dockerfile                      # multi-stage: deps -> builder -> runner. runner копирует
│                                   # полный node_modules (не pnpm deploy --prod — изолированный
│                                   # поднабор ненадежен при наличии второго workspace-пакета,
│                                   # packages/tag, со своими зависимостями esbuild/@cpmind/shared),
│                                   # исходники packages/tag/src (entry point для esbuild),
│                                   # точка монтирования /tag_dist создается с владельцем
│                                   # cpmind:cpmind заранее (иначе Docker named volume
│                                   # монтируется от root, runtime-пользователь не может писать)
├── drizzle/
│   └── migrations/
│       ├── 0000_sharp_mauler.sql   # первая миграция: CREATE TABLE impressions
│       │                           # со всеми 30 колонками и 7 индексами
│       ├── 0001_weight_configs.sql # вторая миграция: CREATE TABLE weight_configs
│       │                           # + seed v1.0_uncalibrated (is_active=true)
│       ├── 0002_elite_puppet_master.sql # ADD COLUMN session_group_id, segment_index
│       │                           # + idx_session_group_id (P-15)
│       ├── 0003_f_presence_check_guarded.sql # CHECK (f_presence IN (0,1))
│       ├── 0004_public_thunderbolts.sql # CREATE TYPE user_role, CREATE TABLE users,
│       │                           # CREATE TABLE tags, ADD COLUMN impressions.tag_id/user_id
│       │                           # (nullable — backfill на admin выполняется bootstrap-ом
│       │                           # при старте, не в самой миграции)
│       ├── 0005_familiar_zodiak.sql # ALTER COLUMN tag_id/user_id SET NOT NULL —
│       │                           # отдельным шагом, после подтвержденного backfill
│       ├── 0006_thick_robin_chapel.sql # CREATE TYPE calibration_batch_status,
│       │                           # calibration_item_status, CREATE TABLE
│       │                           # calibration_batches/calibration_items
│       └── 0007_workable_rachel_grey.sql # CREATE SEQUENCE tag_constants_version_seq
│                                   # (добавлена вручную — pgSequence недоступен в
│                                   # установленной версии drizzle-orm, используется
│                                   # напрямую через SQL nextval()), CREATE TABLE
│                                   # tag_constants_configs, ADD COLUMN
│                                   # impressions.tag_constants_version (nullable навсегда —
│                                   # исторические данные до версионирования, без backfill)
└── src/
    ├── index.ts                    # entry point. Применяет миграции, затем bootstrapAdmin()
    │                               # (создание admin из ADMIN_LOGIN/ADMIN_PASSWORD_HASH при
    │                               # пустой таблице users, backfill старых impressions),
    │                               # затем bootstrapTagConstants() (создание v0 с дефолтными
    │                               # константами при пустой таблице, реальная esbuild-сборка) —
    │                               # оба критичны, process.exit(1) при провале.
    │                               # recoverStuckCalibrationBatches(): батчи, зависшие в
    │                               # processing при крахе сервера, помечаются failed —
    │                               # не блокирует старт при провале.
    │                               # Затем запускает Fastify на PORT (default 3001)
    ├── server.ts                   # buildServer(): Fastify instance.
    │                               # Регистрирует плагины: @fastify/helmet,
    │                               # @fastify/cookie, @fastify/cors (delegator,
    │                               # методы включают PATCH для /users, /tags).
    │                               # decorateRequest('authUser', null) — типизированный
    │                               # контекст авторизации, заполняется requireAuth.
    │                               # Регистрирует все роуты + запускает retention
    │                               # и calibration-cleanup jobs после app.ready()
    ├── db/
    │   ├── index.ts                # drizzle client (singleton), pg.Pool с max=20
    │   └── schema.ts                # impressions: +tag_id/user_id (NOT NULL, FK на
    │                               # tags/users), +tag_constants_version (nullable,
    │                               # FK на tag_constants_configs.version).
    │                               # users: id (bigserial, внутренний), uuid (внешний,
    │                               # никогда не покидает backend как id), login, password_hash,
    │                               # role (enum admin/user), is_active.
    │                               # tags: id, uuid, user_id (FK), label, is_active —
    │                               # 1:N пользователь-теги с самого начала схемы.
    │                               # calibration_batches/calibration_items: черновики
    │                               # пересчета Score, approved-элементы хранятся вечно
    │                               # (аудит), pending — удаляются по TTL.
    │                               # tag_constants_configs: версии калибруемых констант
    │                               # тега, неизменяемы после создания, isActive управляет
    │                               # распространением (наличием файла), не "одна активная"
    │                               # как у weight_configs — допускает множество активных
    │                               # одновременно
    ├── routes/
    │   ├── health.ts               # GET /api/health — проверка БД через SELECT 1
    │   ├── impressions.ts          # POST /api/collect — публичный. Резолв tag_uuid
    │   │                           # (resolveActiveTagOwner, 422 при unknown/inactive) ->
    │   │                           # резолв tag_constants_version (422 при unknown/inactive,
    │   │                           # жесткая блокировка — деактивация edge-case, не
    │   │                           # рутинная операция) -> getActiveWeightsConfig() ->
    │   │                           # processImpression() -> INSERT.
    │   │                           # GET /api/impressions — роль admin видит все
    │   │                           # (с owner-полями через JOIN), роль user — только
    │   │                           # свои, урезанный набор полей по whitelist.
    │   │                           # GET /api/impressions/export/csv — то же разделение.
    │   │                           # GET /api/impressions/:id — полностью admin-only
    │   ├── weights_config.ts       # GET/POST /api/weights-config, POST .../activate,
    │   │                           # DELETE /api/weights-config/:id — все admin-only
    │   │                           # (requireAdmin добавлен — был пробелом до калибровки).
    │   │                           # DELETE перехватывает FK-violation (конфигурация
    │   │                           # использовалась в calibration_batches) -> 409,
    │   │                           # не неразличимый 500
    │   ├── auth.ts                 # POST /api/auth/login — verifyCredentials из БД
    │   │                           # (не process.env), constant-time bcrypt.compare даже
    │   │                           # при несуществующем логине (защита от user enumeration
    │   │                           # через timing-атаку). POST /api/auth/logout.
    │   │                           # GET /api/auth/me — {uuid, login, role} из JWT + БД
    │   ├── users.ts                # POST /api/users — создание пользователя + авто-
    │   │                           # создание одного тега в транзакции (admin-only).
    │   │                           # GET /api/users — список (admin-only).
    │   │                           # PATCH /api/users/:userUuid — деактивация/смена пароля
    │   │                           # (admin-only, запрещена самодеактивация — 409)
    │   ├── tags.ts                 # POST/GET /api/tags, PATCH /api/tags/:tagUuid —
    │   │                           # admin-only. GET /api/tags/mine — собственные теги
    │   │                           # авторизованного пользователя, владелец строго из JWT
    │   ├── calibrations.ts         # POST /api/calibrations — создание батча пересчета
    │   │                           # (selection: ids/session_groups/filter), 202 +
    │   │                           # асинхронная фоновая обработка чанками по 500.
    │   │                           # GET .../:batchId, .../:batchId/items — превью
    │   │                           # "было/будет". POST .../items/:itemId/approve,
    │   │                           # POST .../:batchId/approve — подтверждение с проверкой
    │   │                           # optimistic concurrency (409 при изменившемся score_final
    │   │                           # с момента черновика). DELETE .../:batchId — discard,
    │   │                           # approved-элементы не трогает. Все admin-only
    │   └── tag_constants.ts        # POST /api/tag-constants — создание версии + реальная
    │                               # esbuild-сборка, откат записи при провале сборки.
    │                               # GET (список/детально), POST .../activate (пересборка),
    │                               # POST .../deactivate (удаление физического файла) —
    │                               # без PATCH/DELETE содержимого — версии неизменяемы.
    │                               # Все admin-only
    ├── services/
    │   ├── scoring.ts              # processImpression(): принимает WeightsValues, owner
    │   │                           # (ActiveTagOwner — tagId/userId), presenceIdleThresholdMs
    │   │                           # (резолвится из активной версии констант, не константа) —
    │   │                           # формирует ImpressionInsert
    │   ├── weights_config.ts       # getActiveWeightsConfig(), кэш + invalidateWeightsCache().
    │   │                           # listWeightsConfigs(), createWeightsConfig(),
    │   │                           # activateWeightsConfig(), deleteWeightsConfig()
    │   │                           # (ловит FK-violation от calibration_batches)
    │   ├── impressions.ts          # listImpressionsForAdmin()/listImpressionsForUser() —
    │   │                           # раздельные функции, не одна с веткой внутри.
    │   │                           # USER_VISIBLE_COLUMNS / ADMIN_LIST_COLUMNS — explicit
    │   │                           # column select по ролям, satisfies-проверка против
    │   │                           # USER_VISIBLE_IMPRESSION_FIELDS (shared). leftJoin на
    │   │                           # tags/users для owner-полей. getImpressionForAdmin() —
    │   │                           # admin-only детальный вид. buildWhereFromFilters()
    │   │                           # экспортирован — переиспользуется calibrations.ts
    │   ├── csv.ts                  # buildAdminCsvBody()/buildUserCsvBody() — раздельная
    │   │                           # генерация по ролям, общий батчинг через collectCsvBody<T>()
    │   ├── auth.ts                 # verifyCredentials(): SELECT из users + constant-time
    │   │                           # bcrypt.compare (DUMMY_PASSWORD_HASH — случайный bcrypt-
    │   │                           # хэш, генерируется один раз при старте процесса, не секрет,
    │   │                           # защита от timing-атаки user enumeration).
    │   │                           # signToken()/verifyToken(): JWT payload {uuid, id, role}
    │   ├── users.ts                # createUser(): транзакция INSERT users + INSERT tags
    │   │                           # (один тег автоматически). Уникальность login защищена
    │   │                           # constraint БД (23505), не только предварительным SELECT.
    │   │                           # listUsers(), updateUserByUuid() — внутренний id никогда
    │   │                           # не покидает сервис
    │   ├── tags.ts                 # insertTagForUser() — единственная точка вставки,
    │   │                           # переиспользуется и при автосоздании в createUser().
    │   │                           # resolveActiveTagOwner(): JOIN tags+users, оба isActive —
    │   │                           # деактивация пользователя блокирует прием по всем его тегам.
    │   │                           # createAdditionalTag(), listAllTags(), listMyTags(),
    │   │                           # updateTagByUuid()
    │   ├── calibrations.ts         # createCalibrationBatch(): резолв selection в SQL WHERE
    │   │                           # (переиспользует buildWhereFromFilters), асинхронная
    │   │                           # фоновая обработка без await — 202 не дожидается расчета.
    │   │                           # recomputeScoreFromNormalized() из @cpmind/shared на каждую
    │   │                           # строку. approveCalibrationItems(): цикл с отдельной
    │   │                           # транзакцией на элемент — UPDATE impressions только если
    │   │                           # score_final все еще равен снимку черновика (optimistic
    │   │                           # concurrency). discardCalibrationBatch(): удаляет только
    │   │                           # pending, approved — никогда
    │   ├── tag_constants.ts        # getNextVersion(): nextval('tag_constants_version_seq')
    │   │                           # через db.execute (.rows[0], не деструктуризация —
    │   │                           # node-postgres адаптер возвращает QueryResult, не массив).
    │   │                           # createTagConstantsConfig(): INSERT + buildTagArtifact(),
    │   │                           # откат записи при провале сборки (компенсирующий, не SQL-
    │   │                           # транзакция — esbuild не откатывается транзакцией БД).
    │   │                           # activateTagConstantsConfig(): пересборка из сохраненных
    │   │                           # constants — детерминированно восстанавливает тот же
    │   │                           # артефакт. deactivateTagConstantsConfig(): удаление файла.
    │   │                           # resolveActiveTagConstantsVersion(): presence-порог
    │   │                           # именно той версии, что заявил показ
    │   ├── tag_builder.ts          # buildTagArtifact(): esbuild JS API (не CLI) — entry point
    │   │                           # packages/tag/src/index.ts, define подставляет
    │   │                           # __CPMIND_CONSTANTS__/__CPMIND_TAG_VERSION__.
    │   │                           # TAG_DIST_DIR (env) — путь к общему volume с NGINX,
    │   │                           # fallback на локальный packages/tag/dist для dev без Docker.
    │   │                           # removeTagArtifact(): удаление файла при деактивации
    │   └── bootstrap.ts            # bootstrapAdmin(): идемпотентно создает admin из env +
    │                               # backfill старых impressions (tag_id/user_id на admin).
    │                               # bootstrapTagConstants(): идемпотентно создает v0 из
    │                               # DEFAULT_TAG_CONSTANTS (@cpmind/shared — общий источник
    │                               # с CLI-сборкой тега, не дублируется)
    ├── middleware/
    │   ├── requireAuth.ts          # Fastify preHandler: проверка JWT + SELECT isActive из
    │   │                           # БД на каждый запрос (не только при логине) — деактивация
    │   │                           # отзывает доступ немедленно, не ждет истечения 7-дневного
    │   │                           # токена. Декорирует request.authUser {uuid, id, role, login}
    │   └── requireAdmin.ts         # Fastify preHandler: requireAuth.authUser.role === 'admin',
    │                               # иначе 403. Всегда после requireAuth в preHandler-массиве
    └── jobs/
        ├── retention.ts            # node-cron: удаление импрешенов старше 90 дней (03:00 UTC).
        │                           # calibration_items на удаляемые импрешены — ON DELETE
        │                           # CASCADE (аудит калибровки не может пережить сам показ)
        └── calibration_cleanup.ts  # node-cron, каждые 15 минут: удаление pending-элементов
                                    # батчей старше CALIBRATION_DRAFT_TTL_MINUTES (env, default
                                    # 60), батч -> status expired. approved — никогда не трогает
```

**Схема БД**

Таблица `impressions`:

| Группа колонок | Колонки |
|---|---|
| Идентификаторы | id (PK), impression_id (UNIQUE) |
| Сегментация показа | session_group_id, segment_index — разрыв показа на сегменты при простое ≥60 сек (P-15) |
| Метаданные | campaign_id, creative_id, creative_type, device_type, timestamp_start, timestamp_end |
| Сигналы raw | signals_raw (JSONB, включает presence) |
| Сигналы normalized | signals_normalized (JSONB) |
| Raw для таблицы | s1_raw_time_in_view, s2_raw_share_of_screen, s3_raw_scroll_speed, s4_raw_active_time_pct, s5_raw_top_event, s7_raw_persistence |
| Нормализованные | s1_normalized ... s7_normalized (real, отдельные колонки для ORDER BY) |
| Score | f_presence, score_final, weights_version |
| Флаги | no_events, tab_mostly_hidden, anomaly_duration, is_suspicious |
| Системное | created_at |

Таблица `weight_configs`:

| Колонка | Тип | Описание |
|---|---|---|
| id | uuid PK | первичный ключ |
| version | text UNIQUE | название версии, например v1.1_calibrated |
| weights | jsonb | объект {s1, s2, s3, s4, s5, s7} |
| description | text | комментарий аналитика (необязательно) |
| is_active | boolean | ровно одна запись true в любой момент |
| created_at | timestamptz | дата создания |

---

### packages/frontend (@cpmind/frontend)

Next.js 14 App Router. Минимальная панель аналитика, защищенная JWT-cookie.

```
packages/frontend/
├── package.json
├── tsconfig.json                   # ignoreDeprecations: "5.0" (совместимо с TS 5.4.x)
├── next.config.mjs                 # output: standalone для Docker
├── Dockerfile                      # multi-stage build, Next.js standalone output
└── src/
    ├── middleware.ts               # Next.js edge middleware: редирект на /login
    │                               # если нет cpmind_token cookie.
    │                               # /api/* не включен в PUBLIC_PATHS —
    │                               # весь API трафик идет напрямую через NGINX
    ├── app/
    │   ├── layout.tsx              # root layout
    │   ├── page.tsx                # redirect -> /impressions
    │   ├── login/
    │   │   └── page.tsx            # страница логина
    │   ├── impressions/
    │   │   ├── page.tsx            # Server Component: fetchImpressions() на сервере,
    │   │   │                       # cookie forwarding в backend-запрос.
    │   │   │                       # Header содержит кнопку перехода на /weights
    │   │   └── [id]/
    │   │       └── page.tsx        # Server Component: fetchImpressionById(),
    │   │                           # notFound() если 404
    │   └── weights/
    │       └── page.tsx            # Server Component: fetchWeightsConfigs() на сервере,
    │                               # cookie forwarding в backend-запрос.
    │                               # Передает данные в WeightsConfigPanel
    ├── components/
    │   ├── LoginForm.tsx           # Client Component. POST /api/auth/login,
    │   │                           # credentials: include для JWT cookie.
    │   │                           # Обработка 401, сетевых ошибок
    │   ├── ImpressionsTable.tsx    # Client Component. TanStack Table v8,
    │   │                           # серверная пагинация (manualPagination: true),
    │   │                           # серверная сортировка (manualSorting: true).
    │   │                           # Состояние синхронизируется с URL через router.push.
    │   │                           # Колонка "Сегмент" — кликабельный бейдж,
    │   │                           # фильтрует список по session_group_id (P-15).
    │   │                           # Клик по строке -> /impressions/:id
    │   ├── Filters.tsx             # Client Component. Фильтры: sessionGroupId,
    │   │                           # campaign_id, creative_id, device_type,
    │   │                           # is_suspicious, dateFrom, dateTo.
    │   │                           # Контекстный баннер "режим сегментов" с выходом,
    │   │                           # когда sessionGroupId активен.
    │   │                           # Применение и сброс через URL query params
    │   ├── Pagination.tsx          # Client Component. Генерация номеров страниц
    │   │                           # с ellipsis (delta=2 вокруг текущей)
    │   ├── ExportButton.tsx        # Client Component. fetch с credentials: include,
    │   │                           # blob download через объектный URL
    │   ├── ImpressionDetail.tsx    # Client Component. Полный детальный вид:
    │   │                           # все секции S1-S7 raw, normalized, F_Presence,
    │   │                           # флаги. Извлечение данных из JSONB signals_raw.
    │   │                           # Таймлайн сегментов показа с видимым простоем
    │   │                           # между ними, переход между сегментами (P-15)
    │   └── WeightsConfigPanel.tsx  # Client Component. Таблица версий конфигурации
    │                               # весов. Форма создания новой версии с live-валидацией
    │                               # суммы весов. Активация/удаление через клиентский
    │                               # fetch + router.refresh()
    └── lib/
        ├── api.ts                  # fetchImpressions(), fetchImpressionById():
        │                           # Server-side fetch с cookie forwarding.
        │                           # fetchWeightsConfigs(): Server-side fetch.
        │                           # createWeightsConfig(), activateWeightsConfig(),
        │                           # deleteWeightsConfig(): Client-side fetch через
        │                           # CLIENT_BACKEND (NEXT_PUBLIC_BACKEND_URL).
        │                           # buildCsvUrl(): формирование URL для экспорта
        └── types.ts                # re-export типов из @cpmind/shared включая
                                    # WeightConfigRow. Frontend-специфичные:
                                    # SortParams, FilterValues, WeightsConfigPanelProps,
                                    # пропсы компонентов
```

---

## Технический стек

| Слой | Технология | Версия |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Package manager | pnpm workspaces | 9.15.2 |
| Language | TypeScript | 5.4.5 |
| JS-тег | Vanilla TS, esbuild | 0.21.x |
| Backend | Fastify | 4.28.x |
| Backend: runtime-сборка тега | esbuild (JS API) | 0.21.x |
| Security headers | @fastify/helmet | 11.x |
| Валидация | Zod | 3.23.x |
| ORM | Drizzle ORM | 0.31.x |
| База данных | PostgreSQL | 16 |
| Frontend | Next.js App Router | 14.2.x |
| Таблица | TanStack Table | v8.17.x |
| Авторизация | jsonwebtoken + bcryptjs | — |
| Логирование | Pino (встроен в Fastify) | — |
| Планировщик | node-cron | 3.0.x |
| Контейнеризация | Docker + Docker Compose | — |
| Веб-сервер | NGINX | 1.27-alpine |

---

## Многопользовательская модель и роли

Система поддерживает множество пользователей с двумя ролями: `admin` и `user`. Учетные записи создает администратор вручную — самостоятельной регистрации нет.

**Привязка данных к владельцу.** Каждый пользователь получает один или несколько тегов (`tags`, 1:N с самого начала схемы). Каждый показ привязан к конкретному тегу через `tag_uuid` в payload — backend резолвит владельца (`tag_id`, `user_id`) при приеме и денормализует его в `impressions` для производительности списков аналитики без JOIN на каждый запрос.

**Роль `admin`:** видит все импрешены всех пользователей, управляет учетными записями и тегами, калибрует веса и константы тега, видит полный набор полей по каждому показу (включая `signals_raw`).

**Роль `user`:** видит только импрешены, привязанные к его собственным тегам. Урезанный набор полей (`USER_VISIBLE_IMPRESSION_FIELDS`, единый whitelist в `@cpmind/shared` для JSON-ответа и CSV-экспорта) — без сырых сигналов, без детальных флагов. Нет доступа к калибровке весов, константам тега, управлению пользователями.

**IDOR-защита:** владелец данных всегда берется из подписанного JWT (`request.authUser`), никогда из URL/query. Запрос к чужому импрешену по id возвращает 404, не 403. Детальный просмотр (`GET /api/impressions/:id`) полностью admin-only.

**Деактивация вместо удаления.** Пользователи и теги не удаляются — `is_active=false`. Деактивация пользователя немедленно отзывает доступ (проверка `isActive` на каждый запрос, не только при логине) и блокирует прием новых данных по всем его тегам. Жесткое удаление данных конкретного пользователя — не через API, только прямой доступ к БД.

**Известное ограничение MVP:** это многопользовательская модель с ролевым разграничением, не полная мультитенантность — один сервер, одна база данных, без изолированных инстансов/доменов на клиента.

---

## Что реализовано

### JS-тег

- Встраивается в произвольную HTML-страницу через data-атрибуты контейнера
- Не модифицирует HTML/CSS/JS рекламного креатива
- Асинхронная загрузка (`<script async>`), IIFE-изоляция, глобальный try/catch
- Поддержка нескольких баннеров на одной странице (`querySelectorAll`, независимые сессии)
- Сбор сигналов S1, S2, S3, S4, S5, S7 и полей F_Presence
- Генерация уникального impression_id (UUID v4, polyfill для Safari 14)
- Гарантированная доставка: sendBeacon (основной) + fetch keepalive (fallback)
- Mobile Safari fix: отправка в обработчике click до начала навигации
- Корректная финализация S2 после отправки (прекращает накопление сэмплов)
- Корректная финализация S4: active time пересчитывается из visibility_state_history строго в границах показа — устраняет рассинхрон таймеров, не просто маскирует его потолком (P-05)
- Разрыв показа на сегменты при непрерывном простое ≥60 сек: финализация текущего сегмента, сброс накопителей S1-S7 in-place (без потери event-листенеров), новый сегмент с тем же session_group_id (P-15)
- Cleanup presence-слушателей при unload (снятие всех 10 обработчиков с document)
- Дедупликация на backend: ON CONFLICT DO NOTHING
- Debug-режим: консольное логирование + DOM-оверлей с метриками в реальном времени
- Поддержка браузеров: Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
- Без cookies, без localStorage пользовательских идентификаторов, без сбора IP
- tag_uuid и tag_constants_version зашиты в конкретный собранный файл — привязка к владельцу и версии калибровки констант без участия HTML-разметки клиента кроме data-tag-uuid
- 19 пороговых констант сбора сигналов калибруемы через версионирование (см. раздел "Версионирование констант тега"); EVENT_TYPES и AD_SELECTORS сознательно не калибруются
- Раздается через NGINX: `https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js` (несколько версий одновременно)
- CORS заголовок `Access-Control-Allow-Origin: *` — работает с любого домена

### Backend

- POST /api/collect: валидация Zod, загрузка активных весов, расчет Score, INSERT в БД, ответ 202
- Полный pipeline: кэппинг -> нормализация -> перераспределение весов -> Score -> флаги
- Веса загружаются из weight_configs (БД) через in-memory кэш; инвалидация при активации новой версии
- GET /api/impressions: фильтры, пагинация, сортировка (защищен JWT)
- GET /api/impressions/export/csv: UTF-8 BOM, все поля §7.2, батчинг 500 строк
- GET /api/impressions/:id: полный детальный вид с JSONB
- GET /api/weights-config: список всех версий конфигурации весов (защищен JWT)
- POST /api/weights-config: создать новую версию, валидация суммы весов = 1.00 (защищен JWT)
- POST /api/weights-config/:id/activate: активировать версию, транзакция + инвалидация кэша (защищен JWT)
- DELETE /api/weights-config/:id: удалить неактивную версию (защищен JWT)
- POST /api/auth/login / logout: bcrypt + JWT httpOnly cookie
- GET /api/health: проверка соединения с БД
- Автоматическое применение миграций при старте; при ошибке — явный лог + завершение
- Retention job: удаление импрешенов старше 90 дней (03:00 UTC)
- Pino-логирование каждого принятого payload
- Security headers через @fastify/helmet
- CORS: wildcard для /api/collect, reflect origin + credentials для панели
- signals_raw включает presence (ранее отсутствовал в JSONB — баг найден и закрыт)
- F_Presence: скользящее окно — обнуление по факту простоя ≥60 сек независимо от количества событий до него, согласовано с клиентом
- Фильтр по session_group_id в GET /api/impressions и CSV-экспорте

### Multi-user backend и привязка тега

- Таблицы users (роли admin/user, bcrypt, soft-delete) и tags (1:N к пользователю, branded uuid)
- POST /api/users: создание пользователя + автосоздание одного тега в транзакции
- Полный CRUD пользователей и тегов, все admin-only, с IDOR-защитой (владелец строго из JWT)
- requireAuth проверяет isActive на каждый запрос — деактивация отзывает доступ немедленно
- Ролевая фильтрация GET /api/impressions, /:id, /export/csv — admin видит все, user только свои
- USER_VISIBLE_IMPRESSION_FIELDS — единый whitelist полей для роли user (JSON + CSV)
- tag_uuid обязателен в ImpressionPayload — резолв владельца в POST /api/collect, 422 при unknown/inactive tag
- Constant-time bcrypt.compare при логине — защита от timing-атаки user enumeration
- Bootstrap admin из ADMIN_LOGIN/ADMIN_PASSWORD_HASH (.env) при пустой таблице users, идемпотентно
- Backfill существующих impressions на admin при первой миграции — без потери истории

### Калибровка весов: пересчет исторических impressions (P-10 закрыт)

- POST /api/calibrations: выбор импрешенов (конкретные id, session_group_id целиком, или фильтр — включая по конкретному пользователю), асинхронная фоновая обработка
- Draft/approve флоу: пересчет не перезаписывает БД сразу — создается черновик (calibration_items) с "было/будет" по каждому показу
- recomputeScoreFromNormalized(): пересчет только score_final и weights_version — signals_raw, signals_normalized, F_Presence и флаги подозрительности не пересчитываются (не зависят от весов)
- Optimistic concurrency: подтверждение проверяет, что score_final не изменился с момента черновика — иначе 409, без перезаписи
- Массовое подтверждение с частичным успехом (conflicted не блокирует approved)
- Discard батча удаляет только pending-черновики, approved хранится вечно как аудит
- TTL-очистка непросмотренных черновиков (CALIBRATION_DRAFT_TTL_MINUTES, default 60 мин)
- weights-config теперь admin-only (requireAdmin — закрытый пробел в авторизации)

### Версионирование констант тега

- 19 калибруемых констант сбора сигналов (SCROLL_ZONE_PX, PAUSE_THRESHOLD_MS, SWIPE_MIN_DISTANCE_PX и др.) — вынесены из захардкоженных значений в tag_constants_configs
- Runtime-сборка esbuild внутри backend по запросу администратора — packages/tag/Dockerfile и сервис tag-builder упразднены
- Множественная одновременная активность версий (в отличие от weight_configs — не "одна активная")
- Деактивация удаляет физический файл тега с диска и жестко блокирует прием новых показов с этой версией (422) — обновление поведения на уже размещенном у клиента теге требует осознанной замены <script src>
- PRESENCE_IDLE_TIMEOUT_MS синхронизирован между тегом и backend через активную версию констант — устранено ручное дублирование значения в двух местах
- Bootstrap v0 с исходными значениями при первом старте — обратная совместимость с уже размещенными тегами не нарушена

### Панель аналитика

- JWT-авторизация (один пользователь, без ролей)
- Таблица импрешенов с колонками: дата, campaign_id, creative_id, device_type, S1-S7 raw, score_final, is_suspicious
- Цветовая индикация: score (зеленый/желтый/красный), S4 активность, S5 событие
- Фильтры: campaign_id, creative_id, device_type, is_suspicious, dateFrom, dateTo
- Сортировка по дате и score_final (серверная)
- Серверная пагинация (TanStack Table v8, manualPagination)
- Детальный вид: все поля raw, normalized, score, флаги по секциям S1-S7
- Просмотр сегментов одного показа: бейдж в таблице, фильтр по session_group_id, таймлайн с видимым простоем в детальном виде
- CSV-экспорт с текущими фильтрами
- URL-based state: фильтры и сортировка синхронизированы с query params
- Страница калибровки весов (/weights): таблица версий конфигурации, создание новой версии,
  активация, удаление. Изменение весов без редеплоя — мгновенно применяется к новым импрешенам

### Инфраструктура

- pnpm monorepo с workspace-линковкой @cpmind/shared
- Drizzle миграции (0000_sharp_mauler.sql — CREATE TABLE impressions,
  0001_weight_configs.sql — CREATE TABLE weight_configs + seed v1.0_uncalibrated)
- packages/tag/Dockerfile — multi-stage сборка тега, артефакт в Docker volume
- packages/backend/Dockerfile — протестирован, production-ready
- packages/frontend/Dockerfile — протестирован, production-ready
- docker-compose.yml (dev — только PostgreSQL)
- docker-compose.prod.yml — 6 сервисов: tag-builder, nginx, backend, frontend, postgres, backup
- nginx/nginx.conf — SSL termination, security headers, CORS, rate limiting (429),
  раздача тега `/tag/`, разделение beacon /api/collect и панельного /api/
- backup/crontab — pg_dump, ротация 30 дней
- scripts/renew-certs.sh — автообновление SSL-сертификатов Let's Encrypt + перезагрузка nginx
- Cron задача: `/etc/cron.d/cpmind-certs` (03:30 UTC ежедневно)

---

## Технический долг

Ни один из перечисленных пунктов **не блокирует MVP и не влияет на корректность сбора данных**.

См. также `docs/development_history/BUG_FIXING_V1.md` (итерация 1, 21.06.2026) и `docs/development_history/BUG_FIXING_V2.md` (итерация 2, 23.06.2026) — список доработок по итогам клиентского тестирования и реализации P-15.

### Мелкие улучшения тега

- `IntersectionObserver.disconnect()` не вызывается при финализации тега — некритично для статических страниц; для SPA-клиентов потребуется при следующей итерации
- Слушатели S2/S3/S7 (интервалы и scroll-обработчик) не снимаются явно при финализации — для одноразового показа на статической странице не проблема

### Мелкие улучшения backend/инфраструктуры

- Drizzle Studio в dev: запуск `pnpm db:studio` требует явной передачи DATABASE_URL
- Валидация переменных окружения: вынести в `packages/frontend/src/lib/env.ts` с явным `requireEnv()` — актуально при переходе к мультитенантности
- Мониторинг успешности cron-бэкапов: контейнер backup остается alive при сбое крона

### По итогам клиентского тестирования

- P-17 (баннер крупнее вьюпорта): обнаружено по сценарию B05b. Логика видимости признана корректной — нужен предупреждающий флаг для рекламодателя, не правка измерения. Отложено до согласования семантики флага и объема миграции БД
- P-03 (mobile S5 — нет аналога hover): `touch_start_end_delta_ms` собирается тегом, но не используется в иерархии нормализации S5. Требует новой шкалы уровней — запланировано на вторую итерацию калибровки
- P-19 (`competing_ads_visible` = 0 на стенде "теснота"): не баг, ограничение тестового стенда — подробности в `docs/development_history/BUG_FIXING_V1.md`
- Короткие полностью пассивные показы (длительность < 60 сек, событий 0): не обнуляются текущей формулой F_Presence. Оставлено без отдельного условия, согласовано с клиентом. Подробности — `docs/development_history/BUG_FIXING_V2.md`

### Архитектурные ограничения MVP (целевые для следующей итерации)

- Множественные пользователи с ролями (admin/user) реализованы; полная мультитенантность (изолированные инстансы/домены на клиента) — нет
- Один сервер без горизонтального масштабирования
- Нет очереди сообщений (Kafka/RabbitMQ) — асинхронная обработка калибровки реализована без очереди, чанками в фоновой функции; при росте объема данных может потребоваться пересмотр

---

## Dev vs Prod — различия окружений

### Файл окружения (.env)

**Dev** — файл `.env` в корне репозитория, все переменные включая `DATABASE_URL`, `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`. Не коммитится в git (в `.gitignore`). Используется локально через `tsx --env-file`.

**Prod** — файл `.env` содержит только пять секретов. Все остальное задано в `docker-compose.prod.yml`:

```bash
# Prod .env — только секреты
DB_PASSWORD=
JWT_SECRET=
COOKIE_SECRET=
ADMIN_LOGIN=
ADMIN_PASSWORD_HASH=
```

Переменные `NODE_ENV`, `PORT`, `HOST`, `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `DATABASE_URL` — жестко заданы в `docker-compose.prod.yml` и в `.env` не нужны.

**Важно для prod:** секреты экспортируются через `export` в shell перед запуском Compose, чтобы избежать проблем с интерпретацией `$` в bcrypt-хэшах.

### База данных

**Dev** — PostgreSQL запускается локально (Postgres.app или `docker-compose.yml`). Создается вручную через `psql`.

**Prod** — PostgreSQL запускается как контейнер в `docker-compose.prod.yml`. База и пользователь создаются автоматически при первом запуске. Данные хранятся в Docker volume `cpmind_postgres_data`. Миграции применяются автоматически при старте backend.

### Тег

**Dev** — тег собирается локально командой `pnpm --filter @cpmind/tag build` (CLI-режим, version='dev', DEFAULT_TAG_CONSTANTS из @cpmind/shared) и подключается напрямую из файловой системы через `python3 -m http.server`.

**Prod** — тег собирается backend-ом в runtime через esbuild JS API (`services/tag_builder.ts`), по запросу администратора (`POST /api/tag-constants`), не при `docker build`. Сервис `tag-builder` и `packages/tag/Dockerfile` упразднены. Каждая версия пишется в Docker volume `tag_dist` (`cpmind-tag_v{N}.min.js`), откуда NGINX раздает ее по адресу `https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js` с заголовком `Access-Control-Allow-Origin: *`. Несколько версий существуют на диске одновременно.

### BACKEND_URL / NEXT_PUBLIC_BACKEND_URL

**Dev** — `BACKEND_URL=http://localhost:3001`, `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` (прямое обращение к backend порту).

**Prod** — `BACKEND_URL=http://backend:3001` (внутренняя Docker-сеть для Server Components), `NEXT_PUBLIC_BACKEND_URL=""` (пустая строка — браузер использует относительные пути `/api/...` через NGINX).

### data-endpoint в теге

**Dev (локальное тестирование)** — `data-endpoint="http://localhost:3001/api/collect"`

**Prod (на страницах клиента)** — `data-endpoint="https://app.cpmind.tech/api/collect"`

### Docker Compose файлы

| | Dev | Prod |
|---|---|---|
| Файл | `docker-compose.yml` | `docker-compose.prod.yml` |
| Сервисы | только postgres | tag-builder, nginx, backend, frontend, postgres, backup |
| SSL | нет | Let's Encrypt, `nginx/certs/` |
| Тег | локальная сборка | Docker volume через tag-builder |
| Бэкапы | нет | pg_dump по crontab |

---

## Тестирование

### О параметре ?cpmind_debug=1 и локальном тестировании

Файл `test/banner-test.html` предназначен для **локальной отладки тега командой CPMind**, не для клиента. При открытии через `file://` (двойной клик на файле) поведение браузера имеет ограничения:

- **С параметром `?cpmind_debug=1`:** активируется DOM-оверлей, обновляющийся каждые 250 мс. Impression записывается всегда.
- **Без параметра `?cpmind_debug=1` из `file://`:** Safari ненадежно стреляет события `visibilitychange` и `pagehide` при закрытии вкладки без активного event loop. Impression записывается надежно только при клике по баннеру.

**Это не баг тега и не проблема продакшна.** На реальных HTTPS-страницах клиента все три триггера отправки (клик, visibilitychange, pagehide) работают корректно в любом браузере независимо от наличия debug-режима. Debug-оверлей в `?cpmind_debug=1` предназначен исключительно для визуальной проверки сбора сигналов командой CPMind — он не влияет на логику сбора данных.

Для чистого тестирования без артефактов `file://` — открывайте тестовую страницу через HTTP-сервер:

```bash
# из корня монорепо
python3 -m http.server 8080
# затем: http://localhost:8080/test/banner-test.html?cpmind_debug=1
```

---

### Тест 1 — Верификация формул нормализации (синтетические данные)

**Сценарий §10.2 #1:** 5 секунд просмотра, нет взаимодействий, вкладка активна.

| Метрика | Ожидалось | Получено | Соответствие ТЗ |
|---|---|---|---|
| S1 normalized | ~74.9 | 74.722 | да |
| S2 normalized | ~38.7 | 38.730 | да |
| S3 normalized | 55 | 55.0 | да (no scroll -> base=55, §4.3) |
| S4 normalized | 100 | 100.0 | да |
| S5 normalized | 0 | 0.0 | да |
| S7 normalized | 45 | 45.0 | да (30+10+0+5=45) |
| F_Presence | 1 | 1 | да |
| score_final | ~55.7 | 55.663 | да |
| no_events | true | true | да |
| is_suspicious | true | true | да |

Время ответа POST /api/impressions: **19 мс** (бюджет по ТЗ: < 200 мс).

**Сценарий §10.2 #3:** вкладка неактивна 80% времени показа.

| Метрика | Ожидалось | Получено | Соответствие ТЗ |
|---|---|---|---|
| S4 normalized | 20 | 20.0 | да |
| tab_mostly_hidden | true (при < 20%) | false (граничный случай) | граничный случай |
| score_final | ~38.3 | 38.340 | да |

Граничный случай: 3000/15000 = ровно 20.0% — не строго меньше 20%, флаг false. В реальных показах точная граница не воспроизводится.

**Проверка флага tab_mostly_hidden:** payload с tab_active_time_ms = 2999 (19.993%).

| Метрика | Ожидалось | Получено | Соответствие ТЗ |
|---|---|---|---|
| s4_raw_active_time_pct | 19.99% | 19.993% | да |
| tab_mostly_hidden | true | true | да |
| is_suspicious | true | true | да |

---

### Тест 2 — Реальный тег в браузере (локально)

Тестовая страница: `http://localhost:8080/test/banner-test.html?cpmind_debug=1`

Запуск сервера — из корня монорепо:
```bash
python3 -m http.server 8080
```

**Результат в БД после закрытия вкладки:**

```
impression_id:  419c7a01-dd05-4c73-9a76-6b3a29de08f0
s1_raw:         4.921 сек
s3_raw_speed:   1617.9 px/s
s5_raw:         hover_3000ms+
s4_raw:         99.4%
score_final:    56.21
is_suspicious:  false
```

Payload доставлен через sendBeacon при закрытии вкладки. Время ответа: **15 мс**.

---

### Тест 3 — Реальный тег в браузере (production)

Тег размещен на `https://app.cpmind.tech/tag/cpmind-tag.min.js`.

Проверка доступности:
```bash
curl -I https://app.cpmind.tech/tag/cpmind-tag.min.js
# HTTP/1.1 200 OK
# Content-Type: application/javascript
# Access-Control-Allow-Origin: *
# Cache-Control: public, max-age=3600
```

Результат в БД (production):
```
impression_id:  814b06e8-597b-49fb-9d21-05ded347163b
campaign_id:    demo_campaign_01
score_final:    49.306
created_at:     2026-06-15 12:29:28
```

---

### Тест 4 — API endpoints

| Endpoint | Метод | Статус | Время ответа |
|---|---|---|---|
| /api/health | GET | 200 {"ok":true,"db":"ok"} | 8 мс |
| /api/collect | POST (невалидный payload) | 422 + fieldErrors | 2 мс |
| /api/collect | POST (timestamp_end < timestamp_start) | 422 + fieldErrors.timestamp_end | 2 мс |
| /api/auth/login | POST (верные данные) | 200 {"ok":true} + cookie | 105 мс |
| /api/auth/login | POST (неверные данные) | 401 | — |
| /api/impressions | GET (без cookie) | 401 | — |
| /api/impressions | GET (с cookie) | 200 + список | 30-48 мс |
| /api/impressions/:id | GET | 200 + детальный вид | — |
| /api/impressions/export/csv | GET | 200 + CSV файл | — |

---

### Тест 5 — CORS

| Сценарий | Ожидание | Результат |
|---|---|---|
| OPTIONS /api/collect (произвольный origin) | origin: *, без credentials | ✅ |
| POST /api/collect (произвольный origin) | origin: *, 202 | ✅ |
| GET /api/impressions (origin: localhost:3000) | reflect origin, credentials: true, 401 | ✅ |

---

### Тест 6 — Панель аналитика

- Редирект без cookie → /login: ✅
- Логин с верными данными: ✅
- Таблица, фильтры, сортировка, детальный вид, CSV-экспорт (54 колонки): ✅

---

### Тест 7 — Нагрузка (50 последовательных запросов)

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    -X POST http://localhost:3001/api/collect \
    -H "Content-Type: application/json" \
    -d '{...}'
done
```

Результат: все 202, latency **2-5 мс** (бюджет < 200 мс p95). 50 записей подтверждены в БД.

---

### Тест 8 — Docker production build

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

| Контейнер | Статус |
|---|---|
| cpmind-tag-builder-1 | Exited (0) — выполнил задачу и завершился штатно |
| cpmind-postgres-1 | Healthy |
| cpmind-backend-1 | Healthy |
| cpmind-frontend-1 | Healthy |
| cpmind-nginx-1 | Started (80, 443) |
| cpmind-backup-1 | Started |

```bash
curl https://app.cpmind.tech/api/health
# {"ok":true,"db":"ok","ts":"2026-06-15T10:32:53.089Z"}
```

---

### Соответствие критериям приемки §10.3 ТЗ

| Критерий ТЗ | Результат |
|---|---|
| POST /api/collect < 200 мс (p95) | 2-19 мс — выполнено |
| Тег не блокирует рендеринг | async загрузка, IIFE — выполнено |
| Тег не ломает страницу при ошибке | глобальный try/catch — реализовано |
| Формулы S1-S7 по ТЗ §4 | верифицированы по контрольным значениям — выполнено |
| no_events флаг | верифицирован — выполнено |
| tab_mostly_hidden флаг | верифицирован — выполнено |
| anomaly_duration флаг | реализован, синтетически не тестировался (требует time_in_view > 3600) |
| CSV со всеми полями §7.2 | выполнено |
| Хранение 90 дней | retention job реализован и настроен |
| Ежедневные бэкапы | backup/crontab протестирован в Docker |
| Production Docker build | протестирован полностью — все сервисы healthy |

---

## Локальный запуск (Dev)

### Требования

```
Node.js:    20 LTS
pnpm:       9.x
PostgreSQL: 16 (Postgres.app или Docker)
```

### Установка

```bash
git clone <repo>
cd cpmind-mvp
pnpm install
```

### База данных

```bash
psql -U postgres
CREATE DATABASE cpmind;
CREATE USER cpmind WITH PASSWORD 'devpassword';
GRANT ALL PRIVILEGES ON DATABASE cpmind TO cpmind;
GRANT ALL ON SCHEMA public TO cpmind;
\q
```

### Переменные окружения

```bash
cp .env.example .env
# Заполнить все переменные
```

Генерация секретов:
```bash
# JWT_SECRET и COOKIE_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ADMIN_PASSWORD_HASH — запускать из packages/backend/
cd packages/backend
node -e "require('bcryptjs').hash('YOUR_PASSWORD', 10).then(console.log)"
```

### Запуск

```bash
# Terminal 1: backend
pnpm dev:backend

# Terminal 2: frontend
pnpm dev:frontend

# Terminal 3: тег (watch)
pnpm dev:tag

# Terminal 4: HTTP-сервер для тестовой страницы (из корня монорепо)
python3 -m http.server 8080
# URL: http://localhost:8080/test/banner-test.html?cpmind_debug=1
```

### Проверка

```bash
curl http://localhost:3001/api/health
# -> {"ok":true,"db":"ok"}

# Панель аналитика
open http://localhost:3000
```

---

## Production деплой

### Текущее состояние

Продакшн развернут на сервере GCP по адресу **https://app.cpmind.tech**.

SSL-сертификат Let's Encrypt действителен до 2026-09-13. Автообновление настроено через systemd timer (certbot) и cron-скрипт `scripts/renew-certs.sh` (03:30 UTC).

### Обновление продакшна

```bash
cd /opt/cpmind
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Изменения исходников тега (`packages/tag/src/`) попадают в новые версии только при следующей runtime-сборке через `POST /api/tag-constants` — обычный `git pull` + пересборка backend-образа сам по себе не создает новых версионированных файлов тега, он лишь обновляет исходники, которые backend использует при следующей runtime-сборке.

### Полная пересборка с нуля (при необходимости)

```bash
cd /opt/cpmind
docker compose -f docker-compose.prod.yml down --volumes --remove-orphans
docker system prune -af --volumes
docker compose -f docker-compose.prod.yml up --build -d
```

**Внимание:** `--volumes` удалит данные PostgreSQL. Использовать только при наличии бэкапа или если данные не нужны.

### Ручной бэкап БД

```bash
docker exec cpmind-postgres-1 \
  pg_dump -U cpmind cpmind > /opt/cpmind/backups/manual_$(date +%Y%m%d_%H%M%S).sql
```

### Просмотр логов

```bash
# Все сервисы
docker compose -f docker-compose.prod.yml logs -f

# Конкретный сервис
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
```

### Проверка состояния контейнеров

```bash
docker compose -f docker-compose.prod.yml ps
docker stats
```

---

## Переменные окружения

| Переменная | Описание | Dev | Prod |
|---|---|---|---|
| DATABASE_URL | PostgreSQL connection string | нужна в .env | не нужна (задана в Compose) |
| DB_PASSWORD | пароль БД | нужна в .env | нужна в .env |
| JWT_SECRET | секрет JWT, min 64 символа | нужна в .env | нужна в .env |
| COOKIE_SECRET | секрет cookie | нужна в .env | нужна в .env |
| ADMIN_LOGIN | логин пользователя панели | нужна в .env | нужна в .env |
| ADMIN_PASSWORD_HASH | bcrypt-хэш пароля (rounds=10) | нужна в .env | нужна в .env |
| NODE_ENV | development / production | нужна в .env | задана в Compose |
| LOG_LEVEL | info / debug / warn / error | нужна в .env | задана в Compose |
| PORT | порт backend | нужна в .env | задана в Compose |
| HOST | хост backend | нужна в .env | задана в Compose |
| BACKEND_URL | URL backend для Server Components | нужна в .env | задана в Compose |
| NEXT_PUBLIC_BACKEND_URL | URL backend для Client Components | нужна в .env | задана в Compose ("") |
| CALIBRATION_DRAFT_TTL_MINUTES | TTL непросмотренных черновиков калибровки в минутах | необязательна, default 60 | задана в Compose (default 60) |
| TAG_DIST_DIR | путь к volume с собранными файлами тега | не нужна (fallback на packages/tag/dist) | задана в Compose (/tag_dist) |

**Важно для production:** секреты передаются через `export` в shell, не через файл `.env`. Это исключает проблему интерпретации `$` в bcrypt-хэшах Docker Compose.

---

## Калибровка весов

### Что такое веса и зачем их калибровать

CPMind Score рассчитывается по формуле с весами для каждого сигнала:

```
CPMind_Score = (S1*w1 + S2*w2 + S3*w3 + S4*w4 + S5*w5 + S7*w7) * F_Presence
```

Стартовые веса (`v1.0_uncalibrated`) — экспертные гипотезы, не подтвержденные данными. После накопления реальных импрешенов веса калибруются вручную на основе CSV-экспорта и повторно деплоятся.

Текущие веса (`packages/shared/src/scoring/weights.ts`):

```typescript
export const DEFAULT_WEIGHTS = {
  version: 'v1.0_uncalibrated',
  s1: 0.30,   // Time-in-View — основной вес
  s2: 0.20,   // Share of Screen
  s3: 0.15,   // Scroll Velocity
  s4: 0.15,   // Tab Activity
  s5: 0.15,   // Interaction Events
  s7: 0.05,   // Page Context
} as const;
```

Сумма весов всегда равна 1.00. При недоступном сигнале (S3=null в cross-domain iframe) веса автоматически перераспределяются через `computeEffectiveWeights()` — вес недоступного сигнала пропорционально раздается остальным.

Стартовые веса (`v1.0_uncalibrated`) — экспертные гипотезы, не подтвержденные данными. После накопления реальных импрешенов веса калибруются через панель аналитики без редеплоя.

Веса хранятся в таблице `weight_configs`. В любой момент ровно одна версия активна (`is_active=true`). Каждый импрешен записывается с полем `weights_version` — история сохраняется при смене весов.

`DEFAULT_WEIGHTS` в `packages/shared/src/scoring/weights.ts` — аварийный fallback если таблица недоступна. В штатном режиме не используется.

### Процесс калибровки (калибровка через UI, создание версий весов)

**Шаг 1 — экспорт данных**

В панели аналитики (`https://app.cpmind.tech`): применить нужные фильтры → нажать "Экспорт CSV". CSV содержит все raw-сигналы, нормализованные значения, итоговый score, флаги.

**Шаг 2 — анализ**

Открыть CSV в Excel/Google Sheets. Ключевые вопросы:
- Какие сигналы коррелируют с качественными показами (высокий S5, нет флага is_suspicious)?
- Какие сигналы имеют низкую дисперсию и не различают хорошие/плохие показы?
- Соответствует ли итоговый score интуитивной оценке качества показа?

**Шаг 3 — создать новую версию весов**

В панели аналитики перейти на страницу "Калибровка весов" (`https://app.cpmind.tech/weights`):
- Нажать "+ Новая версия"
- Указать название версии (например, `v1.1_calibrated`)
- Ввести значения весов S1-S7 (сумма должна равняться 1.00 — проверяется автоматически)
- Добавить описание (необязательно)
- Нажать "Создать"

**Шаг 4 — активировать версию**

В таблице версий нажать "Активировать" напротив новой версии. Изменение применяется немедленно — следующий импрешен будет записан с новыми весами. Редеплой не требуется.

**Требование:** сумма `s1 + s2 + s3 + s4 + s5 + s7` должна равняться `1.00`. Проверяется на клиенте (live) и на сервере (при сохранении).

#### Версионирование

Все версии конфигурации хранятся в БД. Старые импрешены сохраняют `weights_version` на момент записи — история не переписывается при создании/активации новой версии. Неактивные версии можно удалить через панель (активную удалить нельзя; версию, использованную ранее как цель пересчета в calibration_batches, тоже нельзя — 409, защита FK).

#### Пересчет исторических импрешенов на новую версию весов

Активация новой версии весов влияет только на **новые** показы. Старые импрешены сохраняют свой `score_final`, рассчитанный на той версии, что была активна в момент их записи. Чтобы пересчитать уже накопленные данные на новые веса:

**Шаг 1 — выбор данных.** Можно выбрать: один конкретный импрешен, один или несколько сегментов показа целиком (`session_group_id`), произвольную выборку через те же фильтры, что в основной таблице (включая выбор всех показов конкретного пользователя), либо весь массив данных.

**Шаг 2 — создание батча.** `POST /api/calibrations` создает батч и запускает асинхронный пересчет (без очереди — фоновая функция, чанками по 500 строк). Пересчитываются только `score_final` и `weights_version` — сырые и нормализованные сигналы, `F_Presence`, флаги подозрительности не зависят от весов и не трогаются.

**Шаг 3 — превью "было/будет".** Ни одна запись в `impressions` не перезаписывается на этом шаге. Результат расчета хранится как черновик (`calibration_items`). Администратор просматривает список или каждый показ отдельно, видит `previousScoreFinal`/`newScoreFinal` рядом.

**Шаг 4 — подтверждение.** Только по явному действию — подтвердить один показ или весь батч — данные реально перезаписываются в `impressions`. Перед записью проверяется, что `score_final` показа не изменился с момента создания черновика (если изменился — `409`, нужен новый расчет, не перезапись поверх). Подтвержденные элементы сохраняются как аудит-история вечно; подтверждение нельзя отменить.

**Шаг 5 — отмена.** Непросмотренные черновики можно явно отменить (`DELETE /api/calibrations/:batchId`) или они автоматически истекают по таймауту (`CALIBRATION_DRAFT_TTL_MINUTES`, по умолчанию 60 минут) — в обоих случаях удаляются только неподтвержденные элементы черновика.

### Процесс калибровки (ручная калибровка, перекалибровка дефолтов)

**Шаг 1 — экспорт данных**

В панели аналитики (`https://app.cpmind.tech`): применить нужные фильтры → нажать "Экспорт CSV". CSV содержит 54 колонки: все raw-сигналы, нормализованные значения, итоговый score, флаги.

**Шаг 2 — анализ**

Открыть CSV в Excel/Google Sheets. Ключевые вопросы:
- Какие сигналы коррелируют с качественными показами (высокий S5, нет флага is_suspicious)?
- Какие сигналы имеют низкую дисперсию и не различают хорошие/плохие показы?
- Соответствует ли итоговый score интуитивной оценке качества показа?

**Шаг 3 — правка весов**

Открыть файл `packages/shared/src/scoring/weights.ts`. Изменить значения `DEFAULT_WEIGHTS` и увеличить версию:

```typescript
export const DEFAULT_WEIGHTS = {
  version: 'v1.1_calibrated',   // обновить версию
  s1: 0.35,   // увеличили — time-in-view оказался важнее
  s2: 0.15,   // уменьшили
  s3: 0.15,
  s4: 0.15,
  s5: 0.15,
  s7: 0.05,
} as const;
```

**Требование:** сумма `s1 + s2 + s3 + s4 + s5 + s7` должна равняться `1.00`.

**Шаг 4 — локальная проверка**

```bash
pnpm test  # запуск unit-тестов @cpmind/shared
```

Убедиться, что контрольные значения сценариев §10.2 по-прежнему в допустимых пределах.

**Шаг 5 — деплой**

```bash
git add packages/shared/src/scoring/weights.ts
git commit -m "calibrate: weights v1.1 — increase S1, decrease S2"
git push
```

На сервере:
```bash
cd /opt/cpmind
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Новые импрешены будут записываться с полем `weights_version = 'v1.1_calibrated'`. Старые импрешены остаются с исходной версией — история сохраняется.

---

## Версионирование констант тега

### Что это и зачем

У тега 19 пороговых констант, определяющих интерпретацию сырых событий браузера в сигналы S1–S7 (`SCROLL_ZONE_PX`, `SWIPE_MIN_DISTANCE_PX`, `PRESENCE_IDLE_TIMEOUT_MS` и др.). Раньше эти значения требовали ручной правки кода тега и пересборки. Теперь они калибруются через API, версионируются в БД и собираются в готовый файл автоматически. `EVENT_TYPES` и `AD_SELECTORS` сознательно не калибруются.

### Отличие от модели весов

В отличие от `weight_configs` (ровно одна активная версия), версии констант тега могут быть активны **одновременно в любом количестве** — разные клиенты используют разные версии параллельно.

### Создание версии

`POST /api/tag-constants` (admin-only), полный набор 19 значений. Версия присваивается автоматически (`v0`, `v1`, ... через Postgres sequence) и **неизменяема после создания**. При создании сразу выполняется реальная esbuild-сборка; провал сборки откатывает запись о версии.

### Активация и деактивация

Деактивация удаляет физический файл версии с диска и **жестко блокирует** `POST /api/collect` для любого показа с этой версией, независимо от момента отправки. Реактивация пересобирает файл заново из сохраненных в БД значений.

### Привязка на странице клиента

`<script src>` указывает на конкретную версию (`cpmind-tag_v{N}.min.js`). Версия и константы "зашиты" esbuild-сборкой, не передаются через `data`-атрибуты. Перевод размещенного тега на новую версию — ручная замена `<script src>`.

### Синхронизация с backend

`PRESENCE_IDLE_TIMEOUT_MS` используется и тегом, и backend-ом (порог обнуления `F_Presence`). Backend резолвит значение из той версии констант, что заявил конкретный показ (`tag_constants_version` в payload) — ручное дублирование значения в двух местах устранено.
```

## 23. Следующие шаги — HTML-сниппет и таблица
**Before:**
```html
<div
  data-cpmind-creative
  data-campaign-id="название_кампании"
  data-creative-id="название_баннера"
  data-creative-type="banner_static"
  data-endpoint="https://app.cpmind.tech/api/collect"
  style="width: 728px; height: 90px;"
>
  <!-- ваш баннер или ссылка на него здесь -->
  <a href="https://ваш-сайт.ru">
    <img src="баннер.jpg" width="728" height="90" />
  </a>
</div>
```

Второй — подключение тега (один раз в конце страницы):

```html
<script async src="https://app.cpmind.tech/tag/cpmind-tag.min.js"></script>
```
```
**After:**
```html
<div
  data-cpmind-creative
  data-tag-uuid="UUID_вашего_тега_выдается_командой_CPMind"
  data-campaign-id="название_кампании"
  data-creative-id="название_баннера"
  data-creative-type="banner_static"
  data-endpoint="https://app.cpmind.tech/api/collect"
  style="width: 728px; height: 90px;"
>
  <!-- ваш баннер или ссылка на него здесь -->
  <a href="https://ваш-сайт.ru">
    <img src="баннер.jpg" width="728" height="90" />
  </a>
</div>
```

Второй — подключение тега (один раз в конце страницы). Адрес содержит версию — выдается командой CPMind вместе с `data-tag-uuid`:

```html
<script async src="https://app.cpmind.tech/tag/cpmind-tag_v{N}.min.js"></script>
```

---

## Следующие шаги — интеграция тега на сайт клиента

### Для клиента: что нужно сделать

Система готова к приему реальных данных. Для начала сбора данных на вашем сайте нужно:

**1. Подготовить рекламный креатив**

Рекламный баннер — это любой HTML/изображение/анимация размером 728×90 px (или другого стандартного размера). Тег CPMind не требует изменений в самом баннере и не влияет на его внешний вид. Баннер размещается внутри контейнера тега как обычно.

**2. Разместить тег на странице**

На любой странице вашего сайта, где должен показываться баннер, добавить два фрагмента HTML.

Первый — контейнер баннера с параметрами:

```html
<div
  data-cpmind-creative
  data-campaign-id="название_кампании"
  data-creative-id="название_баннера"
  data-creative-type="banner_static"
  data-endpoint="https://app.cpmind.tech/api/collect"
  style="width: 728px; height: 90px;"
>
  <!-- ваш баннер или ссылка на него здесь -->
  <a href="https://ваш-сайт.ru">
    <img src="баннер.jpg" width="728" height="90" />
  </a>
</div>
```

Второй — подключение тега (один раз в конце страницы):

```html
<script async src="https://app.cpmind.tech/tag/cpmind-tag.min.js"></script>
```

**3. Проверить, что данные поступают**

После размещения тега на странице — открыть страницу в браузере, посмотреть на баннер, закрыть вкладку. Затем войти в панель аналитики (`https://app.cpmind.tech`) и убедиться, что в таблице появилась новая запись с вашим `campaign_id`.

**Параметры data-атрибутов:**

| Атрибут | Что писать |
|---|---|
| data-tag-uuid | выдается командой CPMind для вашего аккаунта, привязывает показы к вашим данным в панели |
| data-campaign-id | произвольное название кампании, например `autumn_sale_2026` |
| data-creative-id | произвольное название баннера, например `banner_728x90_v1` |
| data-creative-type | тип баннера: `banner_static`, `banner_gif` или `banner_html5` |
| data-endpoint | всегда `https://app.cpmind.tech/api/collect` |

**Что НЕ нужно делать:**
- Не нужно устанавливать никакой код на сервер
- Не нужно регистрироваться или создавать аккаунты
- Не нужно менять существующий код баннеров
- Тег не собирает персональные данные пользователей, не использует cookie и не требует согласия по 152-ФЗ в части идентификации

**Доступ к панели аналитики:**

Адрес: `https://app.cpmind.tech`  
Логин и пароль предоставляются командой CPMind.

В панели доступны: просмотр всех импрешенов, фильтрация по кампании и дате, просмотр детальных данных каждого показа, экспорт в CSV для анализа.