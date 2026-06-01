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

Система состоит из трёх логических компонентов:

```
Тестовая страница с баннером
        |
   [JS-тег] --- сбор сигналов S1-S7 + F_Presence
        |
        | sendBeacon / fetch keepalive
        v
   [Backend] --- валидация, нормализация, расчёт Score, хранение
        |
   [PostgreSQL] --- signals_raw (JSONB) + нормализованные колонки
        |
   [Панель аналитика] --- просмотр, фильтры, экспорт CSV
```

Каждый рекламный показ (импрешен) проходит через pipeline:

```
raw payload -> кэппинг аномалий -> нормализация S1-S7 ->
перераспределение весов (если S3=null) -> расчёт F_Presence ->
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
├── nginx/                          # конфиг NGINX (технический долг)
│   ├── nginx.conf
│   └── certs/.gitkeep
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

Общая бизнес-логика, схемы и типы. Единственный источник истины для всех трёх других пакетов. Не содержит runtime-зависимостей кроме Zod.

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
    │   │                           # (runtime-валидация), frontend (типизация)
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
    │   └── score.ts                # computeScore(): полный pipeline расчёта.
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
    ├── index.ts                    # entry point. IIFE-обёртка + глобальный try/catch.
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
    │   │                           # ведёт visibility_state_history
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
    │                               # для счётчика events_count
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

**Mobile Safari fix (критический):** при клике по баннеру `sendBeacon` вызывается синхронно в обработчике click (capture: true) до начала навигации браузера. Это единственный надёжный способ доставки данных при переходе по ссылке в iOS Safari.

---

### packages/backend (@cpmind/backend)

Fastify API-сервер. Принимает payload от тега, рассчитывает Score, хранит данные, отдаёт панели аналитики.

```
packages/backend/
├── package.json
├── tsconfig.json
├── drizzle.config.ts               # конфиг Drizzle Kit для генерации миграций
├── Dockerfile                      # multi-stage build (технический долг — см. ниже)
├── drizzle/
│   └── migrations/
│       └── 0000_sharp_mauler.sql   # первая миграция: CREATE TABLE impressions
│                                   # со всеми 30 колонками и 7 индексами
└── src/
    ├── index.ts                    # entry point. Применяет миграции при старте
    │                               # через drizzle-orm/node-postgres/migrator,
    │                               # затем запускает Fastify на PORT (default 3001)
    ├── server.ts                   # buildServer(): Fastify instance.
    │                               # Регистрирует плагины (@fastify/cookie, @fastify/cors),
    │                               # роуты, глобальный error handler, retention job
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
    │   │                           # Ответ 202 после подтверждённой записи.
    │   │                           # ON CONFLICT DO NOTHING по impression_id.
    │   │                           # GET /api/impressions — защищён JWT.
    │   │                           # Фильтры, пагинация, сортировка.
    │   │                           # GET /api/impressions/export/csv — защищён JWT.
    │   │                           # Стриминговый CSV батчами по 500 строк.
    │   │                           # GET /api/impressions/:id — защищён JWT.
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

Next.js 14 App Router. Минимальная панель аналитика, защищённая JWT-cookie.

```
packages/frontend/
├── package.json
├── tsconfig.json
├── next.config.mjs                 # output: standalone для Docker
├── Dockerfile                      # multi-stage build (технический долг)
└── src/
    ├── middleware.ts               # Next.js edge middleware: редирект на /login
    │                               # если нет cpmind_token cookie
    ├── app/
    │   ├── layout.tsx              # root layout, тёмная тема через inline styles
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
| Валидация | Zod | 3.23.x |
| ORM | Drizzle ORM | 0.31.x |
| База данных | PostgreSQL | 16 |
| Frontend | Next.js App Router | 14.2.x |
| Таблица | TanStack Table | v8.17.x |
| Авторизация | jsonwebtoken + bcryptjs | — |
| Логирование | Pino (встроен в Fastify) | — |
| Планировщик | node-cron | 3.0.x |

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

- POST /api/impressions: валидация Zod, расчёт Score, INSERT в БД, ответ 202
- Полный pipeline: кэппинг -> нормализация -> перераспределение весов -> Score -> флаги
- GET /api/impressions: фильтры, пагинация, сортировка (защищён JWT)
- GET /api/impressions/export/csv: UTF-8 BOM, все поля §7.2, батчинг 500 строк
- GET /api/impressions/:id: полный детальный вид с JSONB
- POST /api/auth/login / logout: bcrypt + JWT httpOnly cookie
- GET /api/health: проверка соединения с БД
- Автоматическое применение миграций при старте
- Retention job: удаление импрешенов старше 90 дней (03:00 UTC)
- Pino-логирование каждого принятого payload (в т.ч. при падении БД)

### Панель аналитика

- JWT-авторизация (один пользователь, без ролей)
- Таблица импрешенов с колонками: дата, campaign_id, creative_id, device_type, S1-S7 raw, score_final, is_suspicious
- Цветовая индикация: score (зелёный/жёлтый/красный), S4 активность, S5 событие
- Фильтры: campaign_id, creative_id, device_type, is_suspicious, dateFrom, dateTo
- Сортировка по дате и score_final (серверная)
- Серверная пагинация (TanStack Table v8, manualPagination)
- Детальный вид: все поля raw, normalized, score, флаги по секциям S1-S7
- CSV-экспорт с текущими фильтрами
- URL-based state: фильтры и сортировка синхронизированы с query params

### Инфраструктура (частично)

- pnpm monorepo с workspace-линковкой @cpmind/shared
- Drizzle миграции (0000_sharp_mauler.sql — CREATE TABLE impressions)
- .env.example с документацией всех переменных
- Dockerfile для backend и frontend (написаны, не протестированы)
- docker-compose.yml (dev — только PostgreSQL)
- docker-compose.prod.yml (написан, не протестирован)
- nginx/nginx.conf (написан, не протестирован)
- backup/crontab (pg_dump расписание)

---

## Технический долг

### Docker и production-деплой

Все конфигурационные файлы написаны и находятся в репозитории, но не были проверены в production-окружении. Требует выполнения:

**packages/backend/Dockerfile** — multi-stage build (deps -> builder -> runner). Собирается из корня монорепо командой `docker build -f packages/backend/Dockerfile .`.

**packages/frontend/Dockerfile** — multi-stage build, Next.js standalone output.

**docker-compose.prod.yml** — пять сервисов: nginx, backend, frontend, postgres, backup. PostgreSQL и backend не открыты наружу — только через NGINX.

**nginx/nginx.conf** — SSL termination, HTTP->HTTPS redirect, CORS для POST /api/impressions (тег приходит с произвольных доменов), rate limiting 100 req/s на endpoint тега, проксирование /api/* -> backend:3001, /* -> frontend:3000.

**backup/crontab** — pg_dump каждый день в 02:00 UTC через crond (не sleep-loop). Хранение 30 дней бэкапов.

Шаги для production-деплоя:

```
1. Заполнить .env на сервере (prod значения)
2. Положить SSL-сертификаты в nginx/certs/fullchain.pem + privkey.pem
3. docker-compose -f docker-compose.prod.yml up -d --build
4. curl https://api.cpmind.io/api/health -> {"ok":true,"db":"ok"}
```

### Документация

- docs/TAG_INTEGRATION.md — инструкция по интеграции тега для команды CPMind (1-2 стр.)
- docs/DEPLOYMENT.md — инструкция по деплою на сервер CPMind
- docs/ARCHITECTURE.md — архитектурный документ Day 0

### Drizzle Studio в dev

Запуск `pnpm db:studio` требует явной передачи DATABASE_URL

---

## Тестирование

Все тесты проводились локально

### Тест 1 — Верификация формул нормализации (синтетические данные)

**Сценарий §10.2 #1:** 5 секунд просмотра, нет взаимодействий, вкладка активна.

Входные данные:
```
time_in_view_sec:        5.0
share_of_screen_avg_pct: 15.0
scroll_speed_avg_px_s:   0 (нет скролла в зоне)
tab_active_time_ms:      5000, tab_total_time_ms: 5000
clicked: false, все S5 поля: 0
creative_position_y_px:  800, page_height_total_px: 3000
viewability_persistence_pct: 100.0
events_count_during_impression: 0
time_since_last_event_ms:       5000
```

Ожидаемые результаты по формулам ТЗ и фактические:

| Метрика | Ожидалось | Получено | Соответствие ТЗ |
|---|---|---|---|
| S1 normalized | ~74.9 | 74.722 | да |
| S2 normalized | ~38.7 | 38.730 | да |
| S3 normalized | 55 | 55.0 | да (no scroll -> base=55, §4.3) |
| S4 normalized | 100 | 100.0 | да |
| S5 normalized | 0 | 0.0 | да |
| S7 normalized | 45 | 45.0 | да (30+10+0+5=45) |
| F_Presence | 1 | 1 | да (time_since=5000 < 60000) |
| score_final | ~55.7 | 55.663 | да |
| no_events | true | true | да |
| is_suspicious | true | true | да |

Время ответа POST /api/impressions: **19 мс** (бюджет по ТЗ: < 200 мс).

---

**Сценарий §10.2 #3:** вкладка неактивна 80% времени показа.

Входные данные:
```
tab_active_time_ms:  3000
tab_total_time_ms:   15000
tab_switches_count:  1
```

| Метрика | Ожидалось | Получено | Соответствие ТЗ |
|---|---|---|---|
| S4 normalized | 20 | 20.0 | да |
| tab_mostly_hidden | true (при < 20%) | false (граничный случай) | граничный случай |
| score_final | ~38.3 | 38.340 | да |

Граничный случай: 3000/15000 = ровно 20.0% — не строго меньше 20%, поэтому флаг false. Условие ТЗ §5: "вкладка была неактивна более 80% времени" (эквивалентно: активна строго менее 20%). В реальных показах точная граница не воспроизводится.

---

**Проверка флага tab_mostly_hidden:** отправлен payload с tab_active_time_ms = 2999 (19.993%).

| Метрика | Ожидалось | Получено | Соответствие ТЗ |
|---|---|---|---|
| s4_raw_active_time_pct | 19.99% | 19.993% | да |
| tab_mostly_hidden | true | true | да |
| is_suspicious | true | true | да |

---

### Тест 2 — Реальный тег в браузере

Была протестирована тестовая страница страница: `http://localhost:8080/test/banner-test.html?cpmind_debug=1`

**Наблюдения в debug-оверлее (Скриншот 1 — баннер в viewport):**

```
viewport >= 50%:     true (зелёный)
time_in_view:        5.41s
mrc_compliant:       true
visible_pct:         100%
share_avg:           3.3%  (728x90 / 1920x1080 = ~3.1%, корректно)
scroll_speed:        0 px/s
Presence events:     55
device_type:         desktop
```

**Наблюдения (Скриншот 2 — проскроллили ниже баннера):**

```
viewport < 50%:      true (красный)
time_in_view:        15.25s (накопилось корректно)
max_continuous:      9.27s (обновился при выходе из viewport)
visible_pct:         0%
scroll_speed:        1395 px/s (быстрый скролл зафиксирован)
pauses:              3
direction_changes:   4
Presence events:     387
```

**Результат в БД после закрытия вкладки:**

```
impression_id:  419c7a01-dd05-4c73-9a76-6b3a29de08f0
s1_raw:         4.921 сек
s3_raw_speed:   1617.9 px/s
s5_raw:         hover_3000ms+ (hover 3694 мс)
s4_raw:         99.4% (вкладка почти всё время активна)
score_final:    56.21
is_suspicious:  false
```

Payload успешно доставлен через sendBeacon при закрытии вкладки. Время ответа: **15 мс**.

---

### Тест 3 — API endpoints

| Endpoint | Метод | Статус | Время ответа |
|---|---|---|---|
| /api/health | GET | 200 {"ok":true,"db":"ok"} | 8 мс |
| /api/impressions | POST (невалидный payload) | 422 + fieldErrors | 2 мс |
| /api/auth/login | POST (верные данные) | 200 {"ok":true} + cookie | 105 мс |
| /api/auth/login | POST (неверные данные) | 401 | — |
| /api/impressions | GET (без cookie) | 401 | — |
| /api/impressions | GET (с cookie) | 200 + список | 30-48 мс |
| /api/impressions/:id | GET | 200 + детальный вид | — |
| /api/impressions/export/csv | GET | 200 + CSV файл | — |

Все эндпоинты работают корректно. Zod-валидация возвращает структурированные ошибки по полям.

---

### Тест 4 — Панель аналитика

Проверено в браузере Chrome:

- Редирект `/` -> `/impressions` -> `/login` (без cookie): работает
- Логин с верными данными: успешно, cookie установлен
- Таблица импрешенов: 4 строки, все колонки заполнены корректно
- Цветовая индикация: score, S4, S5 top_event отображаются с правильными цветами
- Фильтр по campaign_id: работает
- Сортировка по score_final: работает
- Детальный вид клик по строке: все секции S1-S7 raw, normalized, флаги отображаются
- CSV-экспорт: файл скачан, все 54 колонки присутствуют

**CSV-файл:** содержит все обязательные поля §7.2 ТЗ в правильном порядке. UTF-8 с BOM. Разделитель — запятая.

---

### Тест 5 — Прямая проверка БД

```sql
SELECT impression_id, campaign_id, score_final, is_suspicious
FROM impressions
ORDER BY created_at DESC;

-- Результат:
-- 419c7a01-... | demo_campaign_01 | 56.20753  | f
-- 00000000-...-003 | demo_campaign_01 | 38.338856 | t
-- 00000000-...-002 | demo_campaign_01 | 38.339855 | f
-- 00000000-...-001 | demo_campaign_01 | 55.66262  | t
```

JSONB-поле `signals_raw` содержит полный payload от тега. JSONB-поле `signals_normalized` содержит нормализованные значения S1-S7. Отдельные колонки для фильтров и сортировки заполнены корректно.

---

### Соответствие критериям приёмки §10.3 ТЗ

| Критерий ТЗ | Результат |
|---|---|
| POST /api/impressions < 200 мс (p95) | 15-34 мс — выполнено |
| Тег не блокирует рендеринг | async загрузка, IIFE — выполнено |
| Тег не ломает страницу при ошибке | глобальный try/catch — реализовано, демо-проверка через error injection не проводилась |
| Формулы S1-S7 по ТЗ §4 | верифицированы по контрольным значениям — выполнено |
| no_events флаг | верифицирован — выполнено |
| tab_mostly_hidden флаг | верифицирован — выполнено |
| anomaly_duration флаг | реализован, синтетически не тестировался (требует time_in_view > 3600) |
| CSV со всеми полями §7.2 | выполнено |
| Хранение 90 дней | retention job реализован, cron-расписание настроено |
| Ежедневные бэкапы | backup/crontab написан, не запускался (нет Docker) |

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
# Создать БД и пользователя
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
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
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

# Генерация миграций (если схема изменилась)
pnpm db:generate

# Применение миграций вручную
pnpm db:migrate
```

### Проверка

```bash
curl http://localhost:3001/api/health
# -> {"ok":true,"db":"ok"}

# Панель аналитика
open http://localhost:3000
```

### Тестовая страница тега

```bash
# Поднять HTTP-сервер
python3 -m http.server 8080

# Открыть в браузере
open "http://localhost:8080/test/banner-test.html?cpmind_debug=1"
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
| BACKEND_URL | URL backend для Server Components Next.js | да |
| NEXT_PUBLIC_BACKEND_URL | URL backend для Client Components Next.js | да |

Важно: `NEXT_PUBLIC_BACKEND_URL` встраивается в JS-бандл на этапе сборки Next.js, а не в runtime. Для локальной разработки создать `packages/frontend/.env.local` с этой переменной.