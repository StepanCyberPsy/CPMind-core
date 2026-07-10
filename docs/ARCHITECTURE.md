# CPMind — Архитектура системы

Документ описывает устройство CPMind MVP: из чего состоит система, как компоненты взаимодействуют между собой, как данные движутся от момента показа баннера до отображения в панели аналитики. Детали реализации каждого пакета — в `docs/packages_information/`.

---

## Содержание

1. [Обзор системы](#обзор-системы)
2. [Компоненты](#компоненты)
3. [Технический стек и конфигурация](#технический-стек-и-конфигурация)
4. [Многопользовательская модель](#многопользовательская-модель)
5. [Поток данных](#поток-данных)
6. [Pipeline расчёта Score](#pipeline-расчёта-score)
7. [Формула CPMind Score](#формула-cpmind-score)
8. [Калибровка: пересчёт исторических импрешенов](#калибровка-пересчёт-исторических-импрешенов)
9. [Версионирование констант тега](#версионирование-констант-тега)
10. [IVT — детекция невалидного трафика](#ivt--детекция-невалидного-трафика)
11. [База данных](#база-данных)
11. [Инфраструктура](#инфраструктура)
12. [Безопасность](#безопасность)
13. [Ограничения MVP](#ограничения-mvp)

---

## Обзор системы

CPMind — система измерения качества рекламных показов. В отличие от стандартных метрик (количество показов, клики, viewability), CPMind измеряет **реальное поведение пользователя** во время показа баннера и превращает его в единое число от 0 до 100 — CPMind Score.

```
┌──────────────────────────────────────────────┐
│           Сайт клиента (любой)               │
│                                              │
│   [Баннер] ← обёрнут в контейнер тега        │
│   [JS-тег] ← tag_uuid + tag_constants_version│
│              зашиты в конкретный собранный   │
│              файл, следит за поведением      │
│       │                                      │
│       │  sendBeacon / fetch keepalive        │
└───────┼──────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│              app.cpmind.tech (сервер)             │
│                                                   │
│  [NGINX]  ← SSL, роутинг, раздача версий тега     │
│     │                                             │
│  [Backend] ← резолв владельца и версии констант,  │
│     │        валидация, расчёт Score, хранение,   │
│     │        runtime-сборка esbuild для тега      │
│  [PostgreSQL] ← users/tags (владение),            │
│     │           impressions, weight_configs,      │
│     │           tag_constants_configs,            │
│     │           calibration_batches/items,        │
│     │           ivt_list_configs,                 │
│     │           ivt_thresholds_configs,           │
│     │           s1_weibull_configs,               │
│     │           s3/s5/s6_logistic_configs,        │
│     │           s4_configs,                       │
│     │           s7_quantile_configs               │
│  [Frontend] ← панель аналитика (admin/user роли)  │
└───────────────────────────────────────────────────┘
```

**Поддерживаемые типы креативов:** `banner_static`, `banner_gif`, `banner_html5`, `video_creative`.

---

## Компоненты

### JS-тег (`packages/tag`)

~31 КБ, Vanilla TypeScript, IIFE-формат. Размещается на сайте клиента. Невидим, не изменяет внешний вид баннера, не блокирует загрузку страницы (`async`), не ломает страницу при ошибках (глобальный `try/catch`). Не собирает персональных данных, не использует cookie. Вычисляет необратимый SHA-256 хэш отпечатка устройства (`fp_hash`, 16 байт) для IVT-детекции частотных аномалий — PII не передаётся и не хранится. Дополнительно накапливает интервалы между событиями присутствия (`event_intervals_ms`, cap 50) для детекции роботизированного тайминга. Передаёт домен площадки размещения (`publisher_domain`) — явный или автоматически определённый из `document.referrer`/`window.location.hostname`, с детерминированным `unknown_{hash}` как fallback.

`tag_uuid` и `tag_constants_version` зашиты в конкретный собранный файл через esbuild `define` — не запрашиваются с сервера в runtime. Сборка происходит не при `docker build`, а в runtime backend-контейнера по запросу администратора. Несколько версий существуют на сервере одновременно.

Подробности реализации: `docs/packages_information/TAG_LOGIC.md`

### Backend (`packages/backend`)

Fastify API-сервер (Node.js 20). Принимает данные от тега, резолвит владельца и активную версию констант, рассчитывает Score, хранит в PostgreSQL. Собирает runtime-бандлы тега через esbuild JS API.

Подробности реализации: `docs/packages_information/BACKEND_LOGIC.md`

### Frontend (`packages/frontend`)

Next.js 14 App Router. Панель аналитики, защищённая JWT-cookie. Маршруты и функционал строго зависят от роли токена. `admin` видит все данные, управляет пользователями и тегами, калибрует веса и константы. `user` видит только свои импрешены с урезанным набором полей.

Подробности реализации: `docs/packages_information/FRONTEND_LOGIC.md`

### Shared (`packages/shared`)

Единственный источник истины для математики и контрактов. Используется в backend, frontend и теге (тег — только типизация, не runtime). Содержит: Zod-схемы валидации, формулы нормализации S1–S7, расчёт Score, калибровку весов, схемы пользователей/тегов/калибровки/констант тега, IVT-классификацию (`classifyIvtSync` — pure function, GIVT/SIVT детекция).

Подробности реализации: `docs/packages_information/SHARED_LOGIC.md`

### NGINX

Веб-сервер, стоящий перед backend и frontend. Отвечает за:
- SSL-терминация (HTTPS) + OCSP stapling
- HTTP → HTTPS редирект
- Роутинг: `/api/collect` → beacon endpoint (rate limit, 5s timeout), `/api/*` → backend (панель), `/` → frontend, `/tag/` → статические файлы тега (`alias`, отдает любой файл из директории — несколько версий одновременно без правок конфигурации)
- Rate limiting: не более 100 req/s с одного IP на `/api/collect`, burst 200, статус 429
- Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP
- Раздача файлов тега с заголовком `Access-Control-Allow-Origin: *`
- `proxy_buffering off` для `/api/` — корректный стриминг CSV-экспорта
- `worker_processes auto` — использование всех ядер сервера

Директория `/tag/` (volume `tag_dist`) монтируется в NGINX на чтение, в backend — на чтение-запись: backend пишет туда новые версионированные файлы при создании/активации констант тега.

### PostgreSQL

Реляционная база данных. Таблицы: `impressions` (один рекламный показ, включая привязку к владельцу и версии констант тега), `users`/`tags` (многопользовательская модель), `weight_configs` (версии конфигурации весов), `calibration_batches`/`calibration_items` (черновики пересчета Score), `tag_constants_configs` (версии калибруемых констант тега), `ivt_list_configs` (версионированные GIVT-списки паттернов), `ivt_thresholds_configs` (версионированные пороги SIVT-детекции), `s1_weibull_configs` (Weibull-параметры по сегментам), `s3_logistic_configs` / `s5_logistic_configs` / `s6_logistic_configs` (логистические параметры по сегментам), `s4_configs` (λ/T_ref по сегментам), `s7_quantile_configs` (квантильные пороги по device_type). Данные `impressions` хранятся 90 дней (автоматическое удаление старых записей в 03:00 UTC) — связанные `calibration_items` удаляются вместе с импрешеном (`ON DELETE CASCADE`).

---

## Технический стек и конфигурация

| Слой | Технология | Версия |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Package manager | pnpm workspaces | 9.15.2 |
| Language | TypeScript | 5.4.5 |
| JS-тег | Vanilla TS, esbuild | 0.21.x |
| Backend | Fastify | 4.28.x |
| Runtime-сборка тега | esbuild JS API | 0.21.x |
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

### Корневая конфигурация монорепо

**`tsconfig.base.json`** — базовый TypeScript-конфиг, наследуется всеми пакетами:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Ключевые флаги: `exactOptionalPropertyTypes` (опциональное поле не может быть присвоено `undefined` явно), `noUncheckedIndexedAccess` (индексация массива возвращает `T | undefined`). Оба влияют на стиль кода во всём проекте — условный spread `...(val !== undefined && { key: val })` вместо прямого присваивания.

**`package.json` (корень)** — workspace-скрипты:

```json
{
  "scripts": {
    "build": "pnpm --filter @cpmind/shared build && pnpm --filter @cpmind/tag build && pnpm --filter @cpmind/backend build",
    "dev:backend": "pnpm --filter @cpmind/backend dev",
    "dev:frontend": "pnpm --filter @cpmind/frontend dev",
    "dev:tag": "pnpm --filter @cpmind/tag dev",
    "test": "pnpm --filter @cpmind/shared test",
    "db:generate": "pnpm --filter @cpmind/backend drizzle-kit generate",
    "db:migrate": "pnpm --filter @cpmind/backend drizzle-kit migrate"
  },
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" }
}
```

Порядок `build` фиксирован: `shared` → `tag` → `backend`. Frontend собирается отдельно (`next build` в Docker). **Важно:** при любой правке `packages/shared/src/` нужно перезапускать `pnpm --filter @cpmind/shared build` — backend и frontend потребляют скомпилированный `dist/`, не живые исходники.

### Конфигурации пакетов

**`packages/shared/package.json`** — единственная production-зависимость Zod. `exports` обеспечивает корректный резолв и типов, и JS:
```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" }
  }
}
```

**`packages/backend/package.json`** — `"type": "module"` (ESM). `esbuild` — production-зависимость (runtime-сборка тега). `tsx` — devDependency (dev-запуск с `--env-file`). Drizzle Kit в devDependencies.

**`packages/frontend/package.json`** — Next.js 14, TanStack Table v8, `@cpmind/shared` как workspace-зависимость. `output: 'standalone'` в `next.config.mjs` — для Docker multi-stage build.

**`packages/tag/package.json`** — только devDependencies (включая `@cpmind/shared`). Нет production-зависимостей — выходной бандл содержит только браузерный JS.

**`packages/tag/tsconfig.json`** — отдельный конфиг для браузерного кода: `target: ES2017`, `lib: ["ES2017", "DOM", "DOM.Iterable"]`, `moduleResolution: Bundler`. `packages/tag/tsconfig.node.json` — для `build.ts` (Node.js среда).

**`packages/backend/drizzle.config.ts`** — Drizzle Kit конфиг, dialect `postgresql`, схема из `./src/db/schema.ts`, миграции в `./drizzle/migrations`.

---

## Многопользовательская модель

Две роли: `admin` и `user`. Самостоятельной регистрации нет — учётные записи создаёт администратор.

**Владение данными.** Каждый пользователь получает один или несколько тегов (таблица `tags`, связь 1:N). Каждый показ привязан к тегу через `tag_uuid` в payload — backend резолвит `tag_id` и `user_id` при приёме и денормализует оба значения в `impressions`. Запросы списков аналитики не требуют JOIN.

**`admin`:** видит все импрешены всех пользователей, управляет учётными записями/тегами, калибрует веса и константы тега, видит полный набор полей включая `signals_raw`.

**`user`:** только свои импрешены через единый whitelist `USER_VISIBLE_IMPRESSION_FIELDS` (определён в `@cpmind/shared`, применяется и к JSON, и к CSV). Видит `ivt_verdict`, `ivt_category`, `ivt_confidence`, `score_reliable`. Не видит `fp_hash`, `ivt_signals` (admin-only). Нет доступа к калибровке, управлению пользователями, детальному просмотру, управлению IVT-конфигурацией.

**IDOR-защита:** владелец данных всегда из подписанного JWT (`request.authUser`), не из URL/query. Запрос к чужому показу → 404, не 403. Детальный вид (`GET /api/impressions/:id`) — admin-only.

**Деактивация вместо удаления.** `is_active=false`. `requireAuth` проверяет `isActive` из БД на каждый запрос — деактивация немедленно отзывает доступ, не при истечении 7-дневного JWT. Деактивация пользователя блокирует приём новых данных по всем его тегам.

---

## Поток данных

### Шаг 1 — Загрузка тега

Браузер асинхронно загружает `cpmind-tag_v{N}.min.js`. `tag_uuid` и версия констант зашиты в файл. Тег находит `[data-cpmind-creative]`, проверяет формат `data-tag-uuid` и начинает наблюдение.

### Шаг 2 — Сбор сигналов

Параллельный сбор S1–S7 и F_Presence пока пользователь на странице. Параллельно — асинхронное вычисление `fp_hash` (canvas + UA + screen + timezone + language → SHA-256 → 16 байт, fire-and-forget, nullable).

### Шаг 3 — Отправка

Один из трёх триггеров: `click` (Mobile Safari fix — до навигации), `visibilitychange`, `pagehide`. Транспорт: `sendBeacon` (основной) → `fetch keepalive` (fallback).

При простое ≥60 сек — промежуточная отправка текущего сегмента, сброс сессии, новый сегмент с тем же `session_group_id`.

### Шаг 4 — Обработка на сервере (~5 мс)

1. Zod-валидация → 422 при ошибке
2. Резолв `tag_uuid` → `{tag_id, user_id}`, оба `isActive` → 422 при несоответствии
3. Резолв `tag_constants_version` → presence-порог → 422 при деактивированной версии
4. Загрузка активных весов из in-memory кэша
5. Кэппинг аномальных значений
6. Нормализация S1–S7
7. F_Presence по presence-порогу
8. CPMind Score
9. Флаги подозрительности
10. IVT-классификация (classifyIvtSync — GIVT/SIVT, шаг 8.5)
11. INSERT в `impressions`, ON CONFLICT DO NOTHING
12. Ответ 202 Accepted

### Шаг 5 — Просмотр в панели

`admin` видит таблицу всех импрешенов, фильтрует, сортирует, открывает детальный вид, экспортирует CSV, управляет пользователями/тегами, калибрует веса/константы. `user` — только свои данные.

---

## Pipeline расчёта Score

```
Входящий payload от тега
        │
        ▼
┌─────────────────────┐
│  Zod-валидация      │  Проверка типов, диапазонов, cross-field
│                     │  (timestamp_end >= timestamp_start и др.)
└────────┬────────────┘
         │ ошибка → 422 + описание ошибок
         │ ok ↓
┌─────────────────────┐
│  Резолв владельца   │  tag_uuid -> {tag_id, user_id} (tags.ts).
│  (resolveActiveTagOwner)│ JOIN tags+users, оба isActive проверяются
└────────┬────────────┘
         │ не найден/неактивен → 422
         │ ok ↓
┌─────────────────────┐
│  Резолв версии      │  tag_constants_version -> presence-порог
│  констант тега      │  (tag_constants.ts). Жесткая блокировка —
│  (resolveActiveTagConstantsVersion)│ деактивированная версия не принимается
└────────┬────────────┘
         │ не найдена/неактивна → 422
         │ ok ↓
┌─────────────────────┐
│  Кэппинг аномалий   │  Обрезка экстремальных значений по таблице §6.3
│  (capping.ts)       │  Не мутирует входной объект (structuredClone)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Резолв параметров  │  Promise.all: активные параметры всех моделей
│  моделей            │  из in-memory кэшей сервисов (с fallback на
│  (routes/           │  DEFAULT_*). S1: WeibullParams по сегменту
│   impressions.ts)   │  device×creative. S3: LogisticParams по сегменту.
│                     │  S4: S4Config (λ/T_ref) по сегменту. S5: S5LogisticParams
│                     │  по device_type. S6: S6LogisticParams по device×skippable
│                     │  (null для баннеров). S7: S7Thresholds по device_type.
│                     │  Каждый резолв возвращает {params, modelVersion}.
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Нормализация       │  Каждый сигнал → число [0, 100] по калиброванной
│  S1–S7              │  модели с переданными параметрами.
│  (normalize.ts)     │  Pure-функции без side effects.
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Загрузка весов     │  Активная конфигурация из weight_configs (БД).
│  (weights_config.ts)│  In-memory кэш. Fallback на DEFAULT_WEIGHTS.
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Перераспределение  │  Если S3=null (cross-domain iframe) —
│  весов              │  его вес пропорционально добавляется к остальным
│  (weights.ts)       │  Сумма весов всегда = 1.0
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  F_Presence         │  0 если последнее событие пользователя было
│  (score.ts)         │  > порога, резолвленного из активной версии
│                     │  констант тега. Иначе 1
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  CPMind Score       │  Взвешенная сумма сигналов * F_Presence
│                     │  Результат: число [0, 100]
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Флаги              │  no_events, tab_mostly_hidden,
│  подозрительности   │  anomaly_duration, is_suspicious
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  IVT-классификация  │  classifyIvtSync() — pure function из @cpmind/shared.
│  (scoring.ts шаг    │  GIVT: UA-матчинг по активному ivt_list_configs.
│   8.5)              │  SIVT: robotic_timing, synthetic_cursor,
│                     │  impossible_event_sequence.
│                     │  Результат: ivt_verdict, ivt_category,
│                     │  ivt_confidence, score_reliable, ivt_signals.
│                     │  Список и пороги — Promise.all с весами.
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  INSERT в БД        │  ON CONFLICT DO NOTHING по impression_id.
│                     │  Включает tag_id, user_id, tag_constants_version,
│                     │  IVT-поля, fp_hash.
└─────────────────────┘
```

## Сигналы S1–S7 и F_Presence

### S1 — Time-in-View (вес 0.30)

Суммарное время, в течение которого не менее 75% пикселей баннера находилось в видимой области экрана браузера. Порог видимости: ≥75% пикселей / ≥2 секунды непрерывно (на основе Zhang & Chen 2015, Uhl et al. 2020, n=350k+, показывающих что MRC-порог 50%/1s занижает планку реального восприятия).

**Модель нормализации:** Weibull CDF `F(t) = 1 − exp(−(t/λ)^k)`, параметры `{k, λ}` получены через MLE (Newton-Raphson). `S1 = min(100, F(t) × 100)`. 9 сегментов: `{desktop|mobile|tablet} × {static|animated|video}`. Параметры хранятся в `s1_weibull_configs`, пересчитываются еженедельно (cron `0 4 * * 0`). Fallback: `DEFAULT_WEIBULL_PARAMS {k:1.0, λ:5.0}`.

Реализация: `IntersectionObserver` с порогами 0, 0.75 и 1.0.

### S2 — Share of Screen (вес 0.20)

Средняя доля видимой области экрана, которую занимал баннер во время показа. Баннер на 728×90 занимает разную долю экрана в зависимости от разрешения устройства.

Реализация: сэмплирование каждые 500 мс через `getBoundingClientRect`.

### S3 — Scroll Velocity (вес 0.15)

Паттерн скролла в зоне ±300 пикселей от баннера. Высокая скорость без пауз — признак механического пролистывания. Медленный скролл с паузами и возвратами — признак чтения.

Накапливает: среднюю скорость, максимальную скорость, стандартное отклонение, количество пауз, возвратов, серий быстрого скролла, флаг чтения, флаг momentum-скролла.

Если баннер в cross-domain iframe — S3=null, вес перераспределяется.

**Модель нормализации:** логистическая регрессия `S3 = min(100, sigmoid(β·x) × 100)`, 8 коэффициентов β0..β7, z-score нормализация признаков. 9 сегментов: `{device} × {creative_group}`. Параметры хранятся в `s3_logistic_configs`, пересчитываются еженедельно (cron `0 5 * * 0`). Fallback: нулевые коэффициенты → S3=50.

Реализация: rAF-throttled обработчик, алгоритм Велфорда для бегущего среднего.

### S4 — Tab Activity (вес 0.15)

Доля времени, когда вкладка с баннером была активна (не скрыта), с учётом штрафа за частые переключения и длительность активных сессий.

Флаг `tab_mostly_hidden`: если вкладка была активна менее 20% времени показа.

**Модель нормализации:** нелинейная функция `S4 = clamp(activeRatio × 100 × exp(−λ×n) × min(1, avgSession/T_ref), 0, 100)`, где `n` — число переключений, `λ` — штраф за частоту, `T_ref` — эталонная длина сессии. 5 сегментов: `desktop_banner`, `mobile_banner`, `desktop_video`, `mobile_video`, `default`. Параметры хранятся в `s4_configs`, пересчитываются ежемесячно (cron `0 6 1 * *`). Fallback: `{λ:0.08, T_ref:5000ms}`.

Реализация: `document.visibilitychange`, `computeActiveTimeMsInRange` пересчитывает активное время строго в границах `[timestampStart, now]` из `visibilityStateHistory`.

### S5 — Interaction Events (вес 0.15)

Прямое поведенческое доказательство заинтересованности пользователя в баннере.

Desktop: клик, hover-длительность, число hover-событий, близость курсора.  
Mobile/tablet: клик, zoom, tap-count, swipe-count.

**Модель нормализации:** логистическая регрессия, сегментирована по device_type. 2 сегмента: `desktop`, `mobile_tablet`. Desktop: `z = β0 + β1·clicked + β2·hoverDurationNorm + β3·hoverCountNorm + β4·proximityNorm`. Mobile: `z = β0 + β1·clicked + β2·zoom + β3·tapCountNorm + β4·swipeCountNorm`. `S5 = min(100, round(sigmoid(z) × 100))`. Параметры хранятся в `s5_logistic_configs`, пересчитываются еженедельно (cron `0 6 * * 0`). Fallback: экспертные prior-коэффициенты.

Прокси-метка обучения: `y=1` если clicked=true ИЛИ hoverDurationMaxMs ≥ p75 по сегменту.

### S6 — Video Engagement + Audibility (вес 0.40 для video, 0.00 для banner)

Измеряет вовлечённость пользователя в видео-креатив: глубину просмотра и условия прослушивания (IAB/MRC Attention Measurement Guidelines, Nov 2025).

**Video Engagement (9 полей):** `play_initiated`, `quartile_25/50/75`, `completion`, `completion_rate_pct` (числовой % досмотра), `pause_initiated`, `skipped`, `replay_count`.

**Audibility (10 полей):** `muted_status` (muted/unmuted/mixed), `volume_level` (0–100), `audio_connection` (speaker/headphones/bluetooth/unknown), `audible_time_sec`, `duration_sec`, `audible_quartile_25/50/75/100`, `muted_throughout`, `unmuted_by_user`.

Сегментация по `skippable` (из `TagConfig`): skippable и non-skippable видео — принципиально разные пользовательские сценарии.

**Модель нормализации:** логистическая регрессия с 9 коэффициентами β0..β8, включая терм взаимодействия `completionZ × audibleZ`. 6 сегментов: `{desktop|mobile|tablet} × {skippable|non_skippable}`. Z-score нормализация по сегменту для `completionRate`, `quartileOrdinal`, `audibleRatio = audible_time_sec/duration_sec`, `replayLog`. `S6 = min(100, sigmoid(z) × 100)`. Параметры хранятся в `s6_logistic_configs`, пересчитываются еженедельно (cron `0 7 * * 0`). Fallback: нулевые коэффициенты → S6=50.

Прокси-метка обучения: `y=1` если `completion=true` И `(unmuted_by_user ИЛИ NOT muted_throughout)`.

Для баннерных креативов: S6=null, S6 не участвует в формуле, вес перераспределяется. Инвариант: при активации banner-конфига весов `weights.s6` обязан быть 0 (enforced в `activateWeightsConfig`).

Реализация: event listeners на `<video>` элементе внутри `[data-cpmind-creative]`. Skip-кнопка: `[data-cpmind-skip]`. Audio connection: `navigator.mediaDevices.enumerateDevices()` при наличии разрешения, fallback `'unknown'`.

### S7 — Page Context (вес 0.05)

Контекст размещения баннера на странице: позиция (выше/ниже fold), высота страницы, количество конкурирующих баннеров в viewport, persistence видимости.

**Модель нормализации:** квантильная калибровка (не MLE — вес сигнала 0.05 не оправдывает ML-инфраструктуру). Формула: `positionScore` (ATF: relativeY < relativeYLow → 55, иначе 45; BTF: relativeY < relativeYMid → 30, иначе 15) + `clutterPenalty` (≤clutterMid→0, ≤clutterHigh→-12, иначе-25) + `persistenceBonus` (>80%→+5, <20%→-5, иначе 0), clamp [0,100]. Пороги `relativeYLow` (p33 ATF), `relativeYMid` (p67 BTF), `clutterMid` (p50), `clutterHigh` (p80) — квантили реального трафика. 3 сегмента: `desktop`, `mobile`, `tablet`. Параметры хранятся в `s7_quantile_configs`, пересчитываются ежемесячно (cron `0 8 1 * *`). Fallback: `DEFAULT_S7_THRESHOLDS` per device_type.

Реализация: статические поля при инициализации + динамический сэмплинг каждые 1000 мс.

### F_Presence — мультипликатор присутствия

Бинарный множитель (0 или 1). Обнуляет Score если последнее событие пользователя было более N секунд назад на момент финализации показа (сегмента), где N — `PRESENCE_IDLE_TIMEOUT_MS` активной версии констант тега (дефолт 60 секунд) — скользящее окно, без учета количества событий до простоя. Защищает от накрутки показами на открытых но заброшенных вкладках. Значение синхронизировано между тегом (таймер разрыва сегмента, см. "Сегментация показа") и backend (расчет F_Presence) через одну и ту же версию констант — не два независимо поддерживаемых значения.

### Сегментация показа при простое (P-15)

Если в середине показа происходит непрерывный простой ≥60 секунд (пользователь отвлекся, не закрывая вкладку и не переключаясь), показ разрывается на отдельные сегменты вместо того, чтобы засчитывать простой как часть единого непрерывного просмотра.

При обнаружении простоя: текущий сегмент финализируется и отправляется (с собственным F_Presence и Score), сессия в браузере сбрасывается на месте — накопители S1, S2, S4, S5, S7 обнуляются, IntersectionObserver для S1 пересоздается. Новый сегмент получает новый `impression_id`, тот же `session_group_id` и `segment_index + 1`. `is_above_the_fold` (S7) не сбрасывается — свойство загрузки страницы, не сегмента.

Если вкладка хотя бы раз была свернута — сегментация по простою для этой страницы отключается, остается только финальная отправка при закрытии.

---

## Формула CPMind Score

```
Banner:
CPMind_Score = (S1×0.30 + S2×0.20 + S3×0.15 + S4×0.15 + S5×0.15 + S6×0.00 + S7×0.05) × F_Presence

Video:
CPMind_Score = (S1×0.15 + S2×0.10 + S3×0.10 + S4×0.10 + S5×0.10 + S6×0.40 + S7×0.05) × F_Presence

S6=null для баннерных креативов — вес перераспределяется между остальными сигналами по правилу §6.2.
```

Результат: `[0, 100]`. При F_Presence = 0 — итог всегда 0.

**Веса** хранятся в `weight_configs`. Каждая конфигурация имеет `config_type: 'banner' | 'video'`. Активная версия определяется по `creative_type` входящего payload — `video_creative` → video-конфиг, остальные → banner-конфиг. Database-enforced инвариант: не более одной активной версии на тип (`partial unique index WHERE is_active = true`). Banner и video конфиги активируются независимо. Исторические данные не пересчитываются автоматически при смене активной версии — только через явную калибровку.

**Перераспределение:** если S3=null (cross-domain iframe) — его вес пропорционально добавляется к остальным. Сумма весов всегда 1.0.

| Score | Интерпретация |
|---|---|
| 0–20 | Некачественный показ |
| 20–40 | Слабый показ |
| 40–60 | Средний показ |
| 60–80 | Хороший показ |
| 80–100 | Отличный показ |

---

## Калибровка: пересчёт исторических импрешенов

**Что пересчитывается.** Только `score_final` и `weights_version`. Сырые и нормализованные сигналы, F_Presence, флаги — не зависят от весов и не пересчитываются.

**Выбор данных.** Discriminated union трёх режимов: конкретные импрешены по `id`, целые сегменты по `session_group_id`, произвольный фильтр (те же параметры, что в основном списке, включая диапазоны сигналов). Ownership принудительно AND'ится во всех трёх режимах — нельзя пересчитать чужие данные независимо от переданных id.

**Асинхронная обработка.** `POST /api/calibrations` создаёт батч (статус `processing`) и немедленно возвращает `202`. Расчёт — в фоновой функции, чанками по 500. Статус опрашивается отдельно (`GET /api/calibrations/:batchId`).

**Черновик + подтверждение.** Результат расчёта — `calibration_items (pending)`, не изменение `impressions`. Каждый элемент — снимок "было/будет". Только явное подтверждение переносит значения в `impressions`.

**Optimistic concurrency.** Перед записью проверяется, что `score_final` не изменился с момента черновика. При расхождении — 409, без перезаписи.

**Отмена и TTL.** Явная отмена (`DELETE`, удаляет только `pending`) или автоистечение по `CALIBRATION_DRAFT_TTL_MINUTES` (default 60 мин, cleanup job каждые 15 минут). Подтверждённые элементы хранятся как аудит вечно.

**UI-флоу** (страница `/admin/weights/recalculate`): выбор версии весов → выбор импрешенов (ручной или "Выбрать все" = фильтр) → "Пересчитать" → превью с таймером и пунктирной рамкой → "Сохранить" или "Отменить". Открывается в новой вкладке из Danger Zone на `/admin/weights`. Кнопки "Отменить"/"Сохранить" видны всегда, активны только при статусе `ready`.

---

## Версионирование констант тега

19 пороговых констант (`SCROLL_ZONE_PX`, `SWIPE_MIN_DISTANCE_PX`, `PRESENCE_IDLE_TIMEOUT_MS` и др.) вынесены из захардкоженного кода в `tag_constants_configs`. Включает `S1_VIEWPORT_THRESHOLDS: [0, 0.75, 1.0]` — порог видимости для S1. `EVENT_TYPES` и `AD_SELECTORS` — не калибруются.

**Отличие от модели весов.** `weight_configs` — ровно одна активная версия. `tag_constants_configs` — множество активных версий одновременно (разные клиенты используют разные параллельно).

**Создание.** `POST /api/tag-constants` — полный набор 19 значений, автоматическая версия через Postgres sequence (`v0`, `v1`, ...), немедленная esbuild-сборка артефакта. Провал сборки откатывает запись.

**Деактивация — жёсткая блокировка.** Удаляет физический файл, 422 для любого показа с этой версией без grace-периода. Реактивация пересобирает файл из сохранённых значений.

**Синхронизация с backend.** `PRESENCE_IDLE_TIMEOUT_MS` — общее значение для тега (таймер сегментации) и backend (порог F_Presence). Backend резолвит из заявленной в payload версии констант — не два независимых значения.

---

## IVT — детекция невалидного трафика

Модуль классифицирует каждый входящий показ как валидный или невалидный трафик по двум классам: GIVT и SIVT. Вердикт записывается в `impressions` вместе с показом — отдельного pipeline нет, классификация синхронна и не добавляет латентность сверх одного `Promise.all` с загрузкой весов.

### Классы трафика

**GIVT (General Invalid Traffic)** — заведомо невалидный трафик: известные боты, краулеры, датацентровые IP. Детектируется по спискам UA-паттернов (`ivt_list_configs`). При совпадении — немедленный early return, SIVT-правила не проверяются.

**SIVT (Sophisticated Invalid Traffic)** — изощрённый невалидный трафик, имитирующий поведение человека. Детектируется по поведенческим аномалиям в собранных сигналах.

### Вердикты

| Вердикт | Значение |
|---|---|
| `valid` | Трафик прошёл все проверки |
| `givt` | Совпадение с UA-списком |
| `sivt_suspected` | Одно или несколько SIVT-правил сработали, уверенность < порога |
| `sivt_confirmed` | Агрегированная уверенность ≥ `confidence_confirm` |

### SIVT-правила (pure functions, `@cpmind/shared`)

| Правило | Сигнал | Категория |
|---|---|---|
| Тайминговая регулярность | std_dev `event_intervals_ms` < `timing_variance_min_ms` | `robotic_timing` |
| Энтропия курсора | `cursor_trajectory_entropy` < `cursor_entropy_min` при движениях | `synthetic_cursor` |
| Невозможные события | клик без hover/move (desktop), time_in_view > 3s при tab_active = 0 (порог 3s исключает ложные срабатывания на первый рендер IntersectionObserver при document.hidden=true) | `impossible_event_sequence` |

Все пороги nullable — правило отключено при null. До Фазы 0 (накопление baseline) пороги не задаются.

### Confidence-агрегация

Вероятностное объединение (не сумма): `P(A∪B) = 1 − (1−P(A)) × (1−P(B))`. Исключает выход за [0,1] при нескольких сигналах. Апгрейд до `sivt_confirmed` при `confidence >= confidence_confirm` (default 0.85).

### Batch-job частотного анализа

`jobs/ivt_frequency.ts` — cron каждые 30 минут. Группирует показы по `fp_hash` в окне `repeat_fp_window_min`. При превышении `repeat_fp_max_creatives` уникальных креативов от одного `fp_hash` — обновляет `ivt_verdict` до `sivt_suspected`/`sivt_confirmed`, категория `botnet_frequency`. Не блокирует приём показов — асинхронный анализ.

### Device fingerprint (`fp_hash`)

16 байт (128 бит), SHA-256 от canvas + UA + screen + timezone + language. Вычисляется в теге асинхронно (fire-and-forget), nullable. Юридически чист по 152-ФЗ/GDPR — необратимый хэш, не PII. Используется исключительно для частотного анализа, не для таргетинга.

### Конфигурация (версионированные конфиги, паттерн `tag_constants_configs`)

**`ivt_list_configs`** — GIVT-списки паттернов. CSV-формат: `type,pattern,match_type,category,reason,source`. IP — только CIDR. UA — `exact`/`substring`/`regex` (с валидацией regex при загрузке). Одна активная версия (partial unique index). Обновление без передеплоя — горячая замена через активацию новой версии.

**`ivt_thresholds_configs`** — пороги SIVT-правил. 6 полей: `timing_variance_min_ms`, `cursor_entropy_min`, `click_without_hover`, `repeat_fp_window_min`, `repeat_fp_max_creatives`, `confidence_confirm`. Все nullable. Одна активная версия.

### `score_reliable`

`false` при любом `ivt_verdict != 'valid'`. Отображается в панели и CSV для рекламодателя как явный индикатор недостоверности Score — не обнуляет Score, но помечает его.

### Стратегическая развилка §7

Текущая реализация — Path A: поведенческая детекция + fp_hash, без серверного IP-слоя. IP-записи в `ivt_list_configs` заведены в схему, но не активируются. Path B (серверный `X-Real-IP` → CIDR-матчинг, UA vs device_type mismatch) — деферред до накопления baseline данных Фазы 0.

---

## База данных

### Таблица `impressions`

Основная единица хранения. Один показ = одна строка, или несколько при разрыве по простою.

| Группа | Колонки | Назначение |
|---|---|---|
| Идентификаторы | `id` (PK), `impression_id` (UNIQUE) | Первичный ключ и дедупликация |
| Владение | `tag_id`, `user_id` (NOT NULL, FK) | Денормализовано при приёме по `tag_uuid` |
| Версия констант | `tag_constants_version` (nullable) | Nullable навсегда для данных до версионирования |
| Сегментация | `session_group_id`, `segment_index` | Связывает сегменты разорванного показа |
| Метаданные | `campaign_id`, `creative_id`, `creative_type`, `device_type`, `skippable`, `publisher_domain`, `timestamp_start`, `timestamp_end` | `skippable` — атрибут размещения видео; `publisher_domain` — домен площадки для аналитики по сайтам |
| Сырые сигналы | `signals_raw` (JSONB) | Полный payload включая presence |
| Нормализованные | `signals_normalized` (JSONB) | S1–S7 нормализованные |
| Raw для таблицы | `s1_raw_time_in_view`, `s2_raw_share_of_screen`, `s3_raw_scroll_speed`, `s4_raw_active_time_pct`, `s5_raw_top_event`, `s7_raw_persistence` | Отображение в панели |
| Нормализованные (колонки) | `s1_normalized`...`s7_normalized` (real) | Сортировка и диапазонная фильтрация |
| S6 raw | `s6_raw_completion_rate`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable` (nullable) | Отображение в панели; NULL для баннеров |
| Model versions | `s1_model_version`, `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version` (nullable text) | UUID активной конфигурации модели на момент показа; `'default'` при fallback на DEFAULT_* |
| Score | `f_presence`, `score_final`, `weights_version` | |
| Флаги | `no_events`, `tab_mostly_hidden`, `anomaly_duration`, `is_suspicious` | |
| IVT | `ivt_verdict` (DEFAULT 'valid'), `ivt_category`, `ivt_confidence`, `score_reliable`, `fp_hash`, `ivt_signals` (JSONB, admin-only) | CHECK constraint на ivt_verdict |
| Системное | `created_at` | Retention |

### Таблица `weight_configs`

| Колонка | Тип | Назначение |
|---|---|---|
| `id` | uuid PK | |
| `version` | text UNIQUE | например `v1.1_calibrated` |
| `config_type` | text | `'banner'` или `'video'` |
| `weights` | jsonb | `{s1, s2, s3, s4, s5, s6, s7}` |
| `is_active` | boolean | ровно одна `true` на каждый `config_type` одновременно |
| `description` | text | комментарий |
| `is_active` | boolean | ровно одна `true` в любой момент |
| `created_at` | timestamptz | |

### Таблицы `users` и `tags`

| Таблица | Колонка | Назначение |
|---|---|---|
| `users` | `id` (bigserial PK) | FK внутри backend, не покидает сервер |
| `users` | `uuid` (UNIQUE) | внешний идентификатор — API, URL, JWT |
| `users` | `login`, `password_hash`, `role`, `is_active` | |
| `tags` | `id`, `uuid`, `user_id` (FK), `label`, `is_active` | 1:N к пользователю |

### Таблицы `calibration_batches` и `calibration_items`

| Таблица | Колонка | Назначение |
|---|---|---|
| `calibration_batches` | `id`, `target_weights_config_id` (FK), `selection` (jsonb) | снимок выбора данных |
| `calibration_batches` | `status` (processing/ready/expired/failed/discarded) | |
| `calibration_batches` | `created_by` (FK → users.id) | владелец батча |
| `calibration_items` | `batch_id` (FK), `impression_id` (FK, ON DELETE CASCADE) | |
| `calibration_items` | `previous_score_final`, `new_score_final` | снимок "было/будет" |
| `calibration_items` | `status` (pending/approved) | approved хранится как аудит вечно |

### Таблица `tag_constants_configs`

| Колонка | Тип | Назначение |
|---|---|---|
| `id` | uuid PK | |
| `version` | text UNIQUE | `v0`, `v1`, ... — из Postgres sequence |
| `constants` | jsonb | 19 калибруемых полей |
| `is_active` | boolean | не "одна активная" — множество одновременно |
| `script_path`, `file_size_bytes` | text, integer (nullable) | путь к файлу, null без артефакта |

### Таблицы конфигураций сигнальных моделей

Все таблицы следуют единому паттерну: `id` (uuid PK), `segment_key`/`device_type`, параметры модели, `sample_size`, `fitted_at`/`computed_at`, `is_active` (partial unique index по сегменту WHERE is_active=true), `deletion_scheduled_at` (TTL 60 мин через `scheduled_deletion.ts`).

| Таблица | Сегментация | Параметры | Cron |
|---|---|---|---|
| `s1_weibull_configs` | 9 сегментов `device×creative_group` | `k`, `lambda` | `0 4 * * 0` (weekly) |
| `s3_logistic_configs` | 9 сегментов `device×creative_group` | `coefficients` (β0..β7), `feature_means`, `feature_stds` | `0 5 * * 0` (weekly) |
| `s4_configs` | 5 сегментов `device_creative` | `lambda`, `t_ref_ms` | `0 6 1 * *` (monthly) |
| `s5_logistic_configs` | 2 сегмента `desktop`, `mobile_tablet` | `coefficients` (β0..β4) | `0 6 * * 0` (weekly) |
| `s6_logistic_configs` | 6 сегментов `device×skippable` | `coefficients` (β0..β8), `feature_means`, `feature_stds` | `0 7 * * 0` (weekly) |
| `s7_quantile_configs` | 3 сегмента `desktop`, `mobile`, `tablet` | `relative_y_low`, `relative_y_mid`, `clutter_mid`, `clutter_high` | `0 8 1 * *` (monthly) |

### Индексы

`impressions`: `impression_id` (UNIQUE), `session_group_id`, `created_at`, `campaign_id`, `creative_id`, `device_type`, `is_suspicious`, `score_final`, `s6_normalized`, `publisher_domain`, `tag_id`, `user_id`, составной `(user_id, created_at)`, `tag_constants_version`, `ivt_verdict`, `fp_hash`.

`calibration_batches`: составной `(status, created_at)`, `created_by`. `calibration_items`: уникальный составной `(batch_id, impression_id)`, составной `(batch_id, status)`, `impression_id`.

`weight_configs`: `is_active`, partial unique `(config_type) WHERE is_active = true`. `users`: `uuid` (UNIQUE), `login` (UNIQUE), `role`. `tags`: `uuid` (UNIQUE), `user_id`. `tag_constants_configs`: `is_active`. Каждая таблица сигнальных конфигураций имеет partial unique index `(segment_key/device_type) WHERE is_active = true` и индекс по `deletion_scheduled_at`.

### Retention

- `impressions`: 90 дней, job 03:00 UTC. Связанные `calibration_items` — ON DELETE CASCADE.
- `calibration_items (pending)`: TTL-cleanup каждые 15 минут (`CALIBRATION_DRAFT_TTL_MINUTES`).
- `s1/s3/s4/s5/s6/s7_*_configs` (неактивные): мягкое удаление через `deletion_scheduled_at` — 60 минут после планирования. Job `scheduled_deletion.ts` каждые 15 минут. Активные конфиги не удаляются.
- `weight_configs`, `users`, `tags`, `tag_constants_configs`: не удаляются автоматически.
- pg_dump бэкапы: 02:00 UTC, ротация 30 дней.

---

## Инфраструктура

### Docker Compose (production)

5 контейнеров в изолированной Docker-сети `internal`. Сервис `tag-builder` упразднён — сборка тега перенесена в runtime backend-контейнера:

```
postgres   → БД (volume: postgres_data)
backend    → API + runtime-сборка тега esbuild
             (volume: tag_dist, read-write)
             зависит от postgres: healthy
frontend   → панель
             зависит от backend: healthy
nginx      → SSL, роутинг, раздача тега
             (volume: tag_dist, read-only)
             зависит от backend, frontend: healthy
backup     → pg_dump по crontab
             зависит от postgres: healthy
```

Healthcheck-цепочка: nginx стартует только когда backend и frontend прошли healthcheck. Точка монтирования `/tag_dist` в backend-образе создаётся с владельцем `cpmind:cpmind` заранее (`Dockerfile`) — Docker named volume иначе монтируется с владельцем `root`, runtime-пользователь не может писать.

### SSL

Let's Encrypt для `app.cpmind.tech`. Автообновление: systemd timer (certbot) + `scripts/renew-certs.sh` (03:30 UTC) копирует сертификаты в `nginx/certs/` и перезагружает nginx.

### Бэкапы

`backup/crontab` → `pg_dump` → `/opt/cpmind/backups/`. Ротация 30 дней. Полные SQL-файлы, восстанавливаемые через `psql`.

---

## Безопасность

**JWT:** httpOnly cookie `cpmind_token`, 7 дней. Payload `{uuid, id, role}`. `requireAuth` проверяет `isActive` из БД на каждый запрос.

**Пароли:** bcrypt (rounds=10). Constant-time `bcrypt.compare` даже при несуществующем логине (dummy-хэш) — защита от timing-атаки user enumeration.

**CORS:** wildcard `Access-Control-Allow-Origin: *` только для `POST /api/collect`. Все остальные эндпоинты — reflect origin + credentials.

**Rate limiting:** 100 req/s с одного IP на `/api/collect`, burst 200, статус 429 (NGINX).

**Security headers:** HSTS (`max-age=31536000`), X-Content-Type-Options, X-Frame-Options (DENY), Referrer-Policy, CSP — через NGINX. `@fastify/helmet` на уровне backend.

**Изоляция сети:** backend и frontend не доступны напрямую снаружи. Весь внешний трафик через NGINX.

**Данные пользователей:** тег не собирает персональных данных, не использует cookie, не хранит IP, не идентифицирует пользователей. `fp_hash` — необратимый хэш (SHA-256, 16 байт), компоненты не передаются и не хранятся, используется исключительно для fraud detection. Не является персональными данными по 152-ФЗ/GDPR.

**IDOR:** владелец данных из JWT. Чужой ресурс → 404.

**Известный непокрытый риск (MVP):** `tag_uuid` виден в HTML страницы клиента. Отправка показов под чужим `tag_uuid` физически возможна — засоряет данные владельца, не даёт доступа к чтению. Принятый риск MVP.

---

## Ограничения MVP

**Многопользовательская модель без полной мультитенантности.** Ролевое разграничение реализовано. Изолированных инстансов/доменов на клиента — нет. Один сервер, одна база данных.

**Один сервер.** Нет горизонтального масштабирования. При текущей нагрузке (тестирование + несколько клиентов) — запас по производительности значительный (latency 2–19 мс p95 на `/api/collect`).

**Нет очереди сообщений.** `/api/collect` обрабатывается синхронно. Калибровка — асинхронна, но без очереди (фоновая функция в процессе backend, чанками). При росте объёма данных или одновременных батчей — потребуется Kafka или аналог.

**Защита от подмены `tag_uuid` не реализована.** Принятый риск, задокументирован выше.