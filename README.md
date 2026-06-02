# CPMind MVP

Система собирает поведенческие данные пользователей при взаимодействии с рекламными баннерами, рассчитывает единую метрику качества показа (CPMind Score, 0–100) и предоставляет аналитику с возможностью экспорта данных в CSV для ручной калибровки весов.

---

## Содержание

1. [Архитектура](#архитектура)
2. [Структура репозитория](#структура-репозитория)
3. [Технический стек](#технический-стек)
4. [Что реализовано](#что-реализовано)
5. [Технический долг](#технический-долг)
6. [Тестирование](#тестирование)
7. [Локальный запуск](#локальный-запуск)
8. [Переменные окружения](#переменные-окружения)

---

## Архитектура

Система состоит из трех логических компонентов:

```
Тестовая страница с баннером
        |
   [JS-тег] --- сбор сигналов S1-S7 + F_Presence
        |
        | sendBeacon / fetch keepalive
        v
   [Backend] --- валидация, нормализация, расчет Score, хранение
        |
   [PostgreSQL] --- signals_raw (JSONB) + нормализованные колонки
        |
   [Панель аналитика] --- просмотр, фильтры, экспорт CSV
```

Каждый рекламный показ (импрешен) проходит через pipeline:

```
raw payload -> кэппинг аномалий -> нормализация S1-S7 ->
перераспределение весов (если S3=null) -> расчет F_Presence ->
CPMind Score -> флаги подозрительности -> сохранение в БД
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
│   └── certs/.gitkeep              # SSL-сертификаты кладутся сюда на сервере
│
├── backup/
│   └── crontab                     # расписание pg_dump для Docker
│
├── docs/                           # документация (в разработке)
│   ├── ARCHITECTURE.md
│   ├── TAG_INTEGRATION.md
│   └── DEPLOYMENT.md
│
└── test/
    ├── banner-test.html            # тестовая страница для 5 сценариев ТЗ
    ├── banner-placeholder.html     # заглушка баннера 728x90
    └── SCENARIOS.md                # пошаговые инструкции 5 сценариев §10.2
```

---

### packages/shared (@cpmind/shared)

Общая бизнес-логика, схемы и типы. Единственный источник истины для всех трех других пакетов. Не содержит runtime-зависимостей кроме Zod.

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                    # единственная точка экспорта публичного API
    ├── schemas/
    │   ├── impression.ts           # Zod-схемы всех полей сигналов S1-S7,
    │   │                           # F_Presence и корневого ImpressionPayload.
    │   │                           # Используется в теге (типы), backend
    │   │                           # (runtime-валидация), frontend (типизация).
    │   │                           # Включает cross-field валидацию:
    │   │                           # timestamp_end >= timestamp_start
    │   ├── auth.ts                 # Zod-схема LoginPayload
    │   └── api.ts                  # Zod-схемы ответов API: ImpressionRow,
    │                               # ImpressionDetail, ImpressionListResponse
    ├── scoring/
    │   ├── capping.ts              # applyAnomalyCapping(): кэппинг аномальных
    │   │                           # значений согласно таблице §6.3 ТЗ.
    │   │                           # Вызывается строго ДО нормализации.
    │   │                           # Не мутирует входной payload (structuredClone)
    │   ├── normalize.ts            # normalizeS1-S7(): формулы нормализации §4.1-4.6.
    │   │                           # Все функции — pure, без side effects.
    │   │                           # normalizeAll(): агрегатор всех сигналов.
    │   │                           # getS5TopEventLabel(): текстовая метка для таблицы
    │   ├── weights.ts              # DEFAULT_WEIGHTS (v1.0_uncalibrated).
    │   │                           # computeEffectiveWeights(): перераспределение
    │   │                           # весов при null-сигналах §6.2.
    │   │                           # detectNullSignals(): определение null-сигналов
    │   └── score.ts                # computeScore(): полный pipeline расчета.
    │                               # Единственная функция которую вызывает backend:
    │                               # кэппинг -> нормализация -> F_Presence ->
    │                               # веса -> Score -> флаги подозрительности
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

JS-тег для встраивания в произвольную HTML-страницу с рекламным баннером. Собирается в один файл через esbuild. Не импортирует @cpmind/shared в runtime — только браузерные API.

**Выходной артефакт:** `dist/cpmind-tag.min.js` (19.2 KB, IIFE-формат)

```
packages/tag/
├── package.json
├── tsconfig.json
├── build.ts                        # esbuild конфиг. Целевые браузеры:
│                                   # Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
├── dist/
│   └── cpmind-tag.min.js           # единственный артефакт, подключается на страницу
└── src/
    ├── index.ts                    # entry point. IIFE-обертка + глобальный try/catch.
    │                               # Ошибка внутри тега не ломает страницу и не
    │                               # влияет на кликовую ссылку баннера
    ├── types.ts                    # TagConfig, Session, VisibilityEntry,
    │                               # SignalsS3State — полное состояние сессии показа
    ├── config.ts                   # parseConfig(): чтение data-атрибутов контейнера.
    │                               # Обязательные поля: campaign_id, creative_id,
    │                               # creative_type, endpoint
    ├── session.ts                  # createSession(): начальное состояние сессии.
    │                               # buildPayload(): сборка ImpressionPayload из
    │                               # накопленного состояния сессии для отправки
    ├── signals/
    │   ├── s1.ts                   # initS1(): IntersectionObserver с threshold [0, 0.5, 1.0].
    │   │                           # Аккумулирует time_in_view_sec, max_continuous_view_sec,
    │   │                           # visible_pixels_pct. Стандарт MRC: >=50% пикселей
    │   ├── s2.ts                   # initS2(): сэмплирование доли экрана каждые 500 мс.
    │   │                           # Вычисляет видимую область через getBoundingClientRect
    │   │                           # и размеры viewport
    │   ├── s3.ts                   # initS3(): rAF-throttled scroll tracking в зоне
    │   │                           # +-300px от баннера. Welford's online algorithm
    │   │                           # для running mean/std_dev. Детектирует cross-domain
    │   │                           # iframe -> session.s3 = null
    │   ├── s4.ts                   # initS4(): document.visibilitychange listener.
    │   │                           # Аккумулирует tab_active_time_ms по сегментам,
    │   │                           # ведет visibility_state_history
    │   ├── s5.ts                   # initS5(): роутинг по device_type.
    │   │                           # Desktop: click, mouseenter/leave/move, proximity,
    │   │                           # trajectory entropy. Mobile: touchstart/end/move
    │   │                           # (tap, swipe), gesturechange + pinch (zoom)
    │   ├── s7.ts                   # initS7(): статические поля при инициализации
    │   │                           # (position, page_height, above_the_fold).
    │   │                           # Динамический сэмплинг каждые 1000 мс:
    │   │                           # competing_ads (эвристика AdTech-доменов + CSS),
    │   │                           # viewability_persistence
    │   └── presence.ts             # initPresence(): отслеживание 10 типов событий
    │                               # (mouse, touch, key, scroll, click).
    │                               # Throttle 100 мс для timestamp, без throttle
    │                               # для счетчика events_count
    ├── transport/
    │   └── send.ts                 # finalizeAndSend(): идемпотентная финализация.
    │                               # sendPayload(): sendBeacon (основной) +
    │                               # fetch keepalive (fallback).
    │                               # attachUnloadHandlers(): три обработчика —
    │                               # click (capture, Mobile Safari fix),
    │                               # visibilitychange, pagehide
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
  data-campaign-id="camp_123"
  data-creative-id="creat_456"
  data-creative-type="banner_static"
  data-endpoint="https://api.cpmind.io/api/impressions"
  style="width: 728px; height: 90px;"
>
  <!-- баннер здесь — тег не модифицирует этот HTML -->
</div>
<script async src="cpmind-tag.min.js"></script>
```

**Mobile Safari fix (критический):** при клике по баннеру `sendBeacon` вызывается синхронно в обработчике click (capture: true) до начала навигации браузера. Это единственный надежный способ доставки данных при переходе по ссылке в iOS Safari.

---

### packages/backend (@cpmind/backend)

Fastify API-сервер. Принимает payload от тега, рассчитывает Score, хранит данные, отдает панели аналитики.

```
packages/backend/
├── package.json
├── tsconfig.json
├── drizzle.config.ts               # конфиг Drizzle Kit для генерации миграций
├── Dockerfile                      # multi-stage build: deps -> builder (pnpm deploy) -> runner
├── drizzle/
│   └── migrations/
│       └── 0000_sharp_mauler.sql   # первая миграция: CREATE TABLE impressions
│                                   # со всеми 30 колонками и 7 индексами
└── src/
    ├── index.ts                    # entry point. Применяет миграции при старте
    │                               # через drizzle-orm/node-postgres/migrator,
    │                               # затем запускает Fastify на PORT (default 3001).
    │                               # При ошибке миграции — явный лог + process.exit(1)
    ├── server.ts                   # buildServer(): Fastify instance.
    │                               # Регистрирует плагины: @fastify/helmet,
    │                               # @fastify/cookie, @fastify/cors (delegator).
    │                               # CORS: wildcard для /api/impressions (тег),
    │                               # reflect origin + credentials для панели.
    │                               # Единственная точка управления CORS — не в NGINX
    ├── db/
    │   ├── index.ts                # drizzle client (singleton), pg.Pool с max=20
    │   └── schema.ts               # таблица impressions: 30 колонок.
    │                               # JSONB: signals_raw, signals_normalized.
    │                               # Отдельные колонки для фильтров/сортировки:
    │                               # s1-s7 normalized, raw-поля для таблицы панели.
    │                               # Индексы: impression_id (UNIQUE), created_at,
    │                               # campaign_id, creative_id, device_type,
    │                               # is_suspicious, score_final
    ├── routes/
    │   ├── health.ts               # GET /api/health — проверка БД через SELECT 1.
    │   │                           # 200 если ok, 503 если БД недоступна
    │   ├── impressions.ts          # POST /api/impressions — публичный (тег, без auth).
    │   │                           # Zod-валидация -> processImpression() -> INSERT.
    │   │                           # Ответ 202 после подтвержденной записи.
    │   │                           # ON CONFLICT DO NOTHING по impression_id.
    │   │                           # GET /api/impressions — защищен JWT.
    │   │                           # Фильтры, пагинация, сортировка.
    │   │                           # GET /api/impressions/export/csv — защищен JWT.
    │   │                           # Стриминговый CSV батчами по 500 строк.
    │   │                           # GET /api/impressions/:id — защищен JWT.
    │   │                           # Полный детальный вид с JSONB-полями
    │   └── auth.ts                 # POST /api/auth/login — bcrypt.compare пароля,
    │                               # JWT в httpOnly cookie (7 дней).
    │                               # POST /api/auth/logout — clearCookie
    ├── services/
    │   ├── scoring.ts              # processImpression(): вызывает computeScore()
    │   │                           # из @cpmind/shared, формирует ImpressionInsert
    │   │                           # для вставки в БД
    │   ├── impressions.ts          # listImpressions(): параллельные запросы данных
    │   │                           # и COUNT через Promise.all. Explicit select —
    │   │                           # JSONB не тянется в список.
    │   │                           # getImpression(): полный объект по id.
    │   │                           # buildWhereClause(): Drizzle WHERE из query params
    │   ├── csv.ts                  # buildCsvResponse(): UTF-8 BOM, порядок колонок
    │   │                           # строго по §7.2 ТЗ, батчинг по 500 строк,
    │   │                           # экранирование спецсимволов
    │   └── auth.ts                 # verifyCredentials(): bcrypt.compare.
    │                               # signToken() / verifyToken(): jsonwebtoken
    ├── middleware/
    │   └── requireAuth.ts          # Fastify preHandler: проверка JWT из cookie.
    │                               # 401 если токен отсутствует или невалиден
    └── jobs/
        └── retention.ts            # node-cron: удаление импрешенов старше 90 дней.
                                    # Расписание: 0 3 * * * (03:00 UTC).
                                    # Логирует результат через pino
```

**Схема БД — таблица impressions:**

| Группа колонок | Колонки |
|---|---|
| Идентификаторы | id (PK), impression_id (UNIQUE) |
| Метаданные | campaign_id, creative_id, creative_type, device_type, timestamp_start, timestamp_end |
| Сигналы raw | signals_raw (JSONB) |
| Сигналы normalized | signals_normalized (JSONB) |
| Raw для таблицы | s1_raw_time_in_view, s2_raw_share_of_screen, s3_raw_scroll_speed, s4_raw_active_time_pct, s5_raw_top_event, s7_raw_persistence |
| Нормализованные | s1_normalized ... s7_normalized (real, отдельные колонки для ORDER BY) |
| Score | f_presence, score_final, weights_version |
| Флаги | no_events, tab_mostly_hidden, anomaly_duration, is_suspicious |
| Системное | created_at |

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
    │   ├── layout.tsx              # root layout, темная тема через inline styles
    │   ├── page.tsx                # redirect -> /impressions
    │   ├── login/
    │   │   └── page.tsx            # страница логина
    │   └── impressions/
    │       ├── page.tsx            # Server Component: fetchImpressions() на сервере,
    │       │                       # cookie forwarding в backend-запрос
    │       └── [id]/
    │           └── page.tsx        # Server Component: fetchImpressionById(),
    │                               # notFound() если 404
    ├── components/
    │   ├── LoginForm.tsx           # Client Component. POST /api/auth/login,
    │   │                           # credentials: include для JWT cookie.
    │   │                           # Обработка 401, сетевых ошибок
    │   ├── ImpressionsTable.tsx    # Client Component. TanStack Table v8,
    │   │                           # серверная пагинация (manualPagination: true),
    │   │                           # серверная сортировка (manualSorting: true).
    │   │                           # Состояние синхронизируется с URL через router.push.
    │   │                           # Клик по строке -> /impressions/:id
    │   ├── Filters.tsx             # Client Component. Фильтры: campaign_id, creative_id,
    │   │                           # device_type, is_suspicious, dateFrom, dateTo.
    │   │                           # Применение и сброс через URL query params
    │   ├── Pagination.tsx          # Client Component. Генерация номеров страниц
    │   │                           # с ellipsis (delta=2 вокруг текущей)
    │   ├── ExportButton.tsx        # Client Component. fetch с credentials: include,
    │   │                           # blob download через объектный URL
    │   └── ImpressionDetail.tsx    # Client Component. Полный детальный вид:
    │                               # все секции S1-S7 raw, normalized, F_Presence,
    │                               # флаги. Извлечение данных из JSONB signals_raw
    └── lib/
        ├── api.ts                  # fetchImpressions(), fetchImpressionById():
        │                           # Server-side fetch с cookie forwarding.
        │                           # buildCsvUrl(): формирование URL для экспорта
        │                           # с NEXT_PUBLIC_BACKEND_URL как base
        └── types.ts                # re-export типов из @cpmind/shared +
                                    # frontend-специфичные: SortParams, FilterValues,
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

## Что реализовано

### JS-тег

- Встраивается в произвольную HTML-страницу через data-атрибуты контейнера
- Не модифицирует HTML/CSS/JS рекламного креатива
- Асинхронная загрузка (`<script async>`), IIFE-изоляция, глобальный try/catch
- Сбор сигналов S1, S2, S3, S4, S5, S7 и полей F_Presence
- Генерация уникального impression_id (UUID v4, polyfill для Safari 14)
- Гарантированная доставка: sendBeacon (основной) + fetch keepalive (fallback)
- Mobile Safari fix: отправка в обработчике click до начала навигации
- Дедупликация на backend: ON CONFLICT DO NOTHING
- Debug-режим: консольное логирование + DOM-оверлей с метриками в реальном времени
- Поддержка браузеров: Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
- Без cookies, без localStorage пользовательских идентификаторов, без сбора IP

### Backend

- POST /api/impressions: валидация Zod, расчет Score, INSERT в БД, ответ 202
- Полный pipeline: кэппинг -> нормализация -> перераспределение весов -> Score -> флаги
- GET /api/impressions: фильтры, пагинация, сортировка (защищен JWT)
- GET /api/impressions/export/csv: UTF-8 BOM, все поля §7.2, батчинг 500 строк
- GET /api/impressions/:id: полный детальный вид с JSONB
- POST /api/auth/login / logout: bcrypt + JWT httpOnly cookie
- GET /api/health: проверка соединения с БД
- Автоматическое применение миграций при старте; при ошибке — явный лог + завершение
- Retention job: удаление импрешенов старше 90 дней (03:00 UTC)
- Pino-логирование каждого принятого payload (в т.ч. при падении БД)
- Security headers через @fastify/helmet (X-Content-Type-Options, X-Frame-Options, Referrer-Policy и др.)
- CORS: единственная точка управления в Fastify, не в NGINX

### Панель аналитика

- CSS-модули: globals.css + переменные дизайн-системы, module.css для каждого компонента
- Светлая тема: Editorial Data — нейтральная палитра, типографика Inter + IBM Plex Mono
- Адаптивная верстка: desktop / tablet (640–1024px) / mobile (<640px)
- JWT-авторизация (один пользователь, без ролей)
- Таблица импрешенов с колонками: дата, campaign_id, creative_id, device_type, S1-S7 raw, score_final, is_suspicious
- Цветовая индикация: score (зеленый/желтый/красный), S4 активность, S5 событие
- Фильтры: campaign_id, creative_id, device_type, is_suspicious, dateFrom, dateTo
- Сортировка по дате и score_final (серверная)
- Серверная пагинация (TanStack Table v8, manualPagination)
- Детальный вид: все поля raw, normalized, score, флаги по секциям S1-S7
- CSV-экспорт с текущими фильтрами
- URL-based state: фильтры и сортировка синхронизированы с query params

### Инфраструктура

- pnpm monorepo с workspace-линковкой @cpmind/shared
- Drizzle миграции (0000_sharp_mauler.sql — CREATE TABLE impressions)
- .env.example с документацией всех переменных
- packages/backend/Dockerfile — протестирован, production-ready
- packages/frontend/Dockerfile — протестирован, production-ready
- docker-compose.yml (dev — только PostgreSQL)
- docker-compose.prod.yml — протестирован, все 5 сервисов работают
- nginx/nginx.conf — протестирован, SSL termination, CORS, rate limiting
- backup/crontab — протестирован (pg_dump, ротация 30 дней)

---

## Технический долг

### Документация

- docs/TAG_INTEGRATION.md — инструкция по интеграции тега для команды CPMind (1-2 стр.)
- docs/DEPLOYMENT.md — инструкция по деплою на сервер CPMind
- docs/ARCHITECTURE.md — архитектурный документ Day 0

### Мелкие улучшения (не блокируют MVP)

- Drizzle Studio в dev: запуск `pnpm db:studio` требует явной передачи DATABASE_URL
- Query-параметры GET /api/impressions без Zod-валидации (только для авторизованных)
- `observer.disconnect()` не вызывается при финализации тега (некритично для статических страниц)
- `f_presence smallint` без CHECK constraint в БД (заполняется только через API)
- healthcheck interval: текущий 10s оптимален для старта, в production рекомендуется 30s

---

## Тестирование

Все тесты проводились локально.

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

### Тест 2 — Реальный тег в браузере

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

### Тест 3 — API endpoints

| Endpoint | Метод | Статус | Время ответа |
|---|---|---|---|
| /api/health | GET | 200 {"ok":true,"db":"ok"} | 8 мс |
| /api/impressions | POST (невалидный payload) | 422 + fieldErrors | 2 мс |
| /api/impressions | POST (timestamp_end < timestamp_start) | 422 + fieldErrors.timestamp_end | 2 мс |
| /api/auth/login | POST (верные данные) | 200 {"ok":true} + cookie | 105 мс |
| /api/auth/login | POST (неверные данные) | 401 | — |
| /api/impressions | GET (без cookie) | 401 | — |
| /api/impressions | GET (с cookie) | 200 + список | 30-48 мс |
| /api/impressions/:id | GET | 200 + детальный вид | — |
| /api/impressions/export/csv | GET | 200 + CSV файл | — |

---

### Тест 4 — CORS

| Сценарий | Ожидание | Результат |
|---|---|---|
| OPTIONS /api/impressions (произвольный origin) | origin: *, без credentials | ✅ |
| POST /api/impressions (произвольный origin) | origin: *, 202 | ✅ |
| GET /api/impressions (origin: localhost:3000) | reflect origin, credentials: true, 401 | ✅ |

---

### Тест 5 — Панель аналитика

- Редирект без cookie → /login (без параметра ?from=): ✅
- Логин с верными данными: ✅
- Таблица, фильтры, сортировка, детальный вид, CSV-экспорт (54 колонки): ✅

---

### Тест 6 — Нагрузка (50 последовательных запросов)

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    -X POST http://localhost:3001/api/impressions \
    -H "Content-Type: application/json" \
    -d '{...}'
done
```

Результат: все 202, latency **2-5 мс** (бюджет < 200 мс p95). 50 записей подтверждены в БД.

---

### Тест 7 — Docker production build

```bash
docker-compose -f docker-compose.prod.yml up --build
```

| Контейнер | Статус |
|---|---|
| postgres | healthy |
| backend | healthy |
| frontend | healthy |
| nginx | up, 0.0.0.0:80->80, 0.0.0.0:443->443 |
| backup | up |

```bash
curl -k https://localhost/api/health
# {"ok":true,"db":"ok","ts":"..."}

curl -k https://localhost/
# редирект на /login
```

Панель открыта в браузере через HTTPS, таблица рендерится, полный flow работает.

---

### Соответствие критериям приемки §10.3 ТЗ

| Критерий ТЗ | Результат |
|---|---|
| POST /api/impressions < 200 мс (p95) | 2-19 мс — выполнено |
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

## Локальный запуск

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
# Заполнить JWT_SECRET, COOKIE_SECRET, ADMIN_PASSWORD_HASH
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

## Переменные окружения

| Переменная | Описание | Обязательная |
|---|---|---|
| DATABASE_URL | PostgreSQL connection string | да |
| DB_PASSWORD | пароль БД (для Docker Compose) | да (prod) |
| JWT_SECRET | секрет для подписи JWT, min 64 символа | да |
| COOKIE_SECRET | секрет для подписи cookie | да |
| ADMIN_LOGIN | логин единственного пользователя панели | да |
| ADMIN_PASSWORD_HASH | bcrypt-хэш пароля (rounds=10) | да |
| NODE_ENV | development / production | нет (default: development) |
| LOG_LEVEL | info / debug / warn / error | нет (default: info) |
| PORT | порт backend | нет (default: 3001) |
| HOST | хост backend | нет (default: 0.0.0.0) |
| BACKEND_URL | URL backend для Server Components (внутренняя сеть Docker) | да (prod) |
| NEXT_PUBLIC_BACKEND_URL | URL backend для Client Components. Пустая строка в production — браузер использует относительные пути через NGINX. Для локальной разработки: packages/frontend/.env.local | да |

**Важно для production:** секреты передаются через `export` в shell, не через файл `.env`. Это исключает проблему интерпретации `$` в bcrypt-хэшах Docker Compose. Подробнее — см. `cpmind_deploy_plan.md`.