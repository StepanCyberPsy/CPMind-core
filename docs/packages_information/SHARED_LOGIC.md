# CPMind Shared — `packages/shared`

Общая бизнес-логика, схемы и типы. Единственный источник истины для всех остальных пакетов — backend, frontend и тег. Никакой логики расчёта, валидации или типизации не дублируется в пакетах-потребителях.

Production-зависимость только одна — Zod. Всё остальное — TypeScript без runtime-зависимостей. Тег импортирует пакет только как `devDependency` (типизация на этапе сборки, не runtime).

---

## Содержание

1. [Структура пакета](#структура-пакета)
2. [Экспортный контракт](#экспортный-контракт)
3. [Схемы (schemas/)](#схемы-schemas)
4. [Скоринг (scoring/)](#скоринг-scoring)
5. [Контроль доступа (access/)](#контроль-доступа-access)
6. [Сигналы S1–S7 и F_Presence](#сигналы-s1s7-и-fpresence)
7. [Формулы нормализации](#формулы-нормализации)
8. [Формула CPMind Score](#формула-cpmind-score)
9. [IVT-классификация (scoring/ivt.ts)](#ivt-классификация-scoringіvtts)
10. [Изменения, внесённые в эту сессию](#изменения-внесённые-в-эту-сессию)

---

## Структура пакета

```
packages/shared/
├── package.json                  # devDependency для тега, production для backend/frontend
├── tsconfig.json
└── src/
    ├── index.ts                  # единственная точка экспорта публичного API:
    │                             # именованные Zod-схемы + export type * from ./types/index
    ├── schemas/
    │   ├── impression.ts         # ImpressionPayloadSchema — входящий payload от тега
    │   │                         # (обновлен: publisher_domain, skippable,
    │   │                         # s6_completion_rate_pct, s6_duration_sec в S6Schema)
    │   ├── auth.ts               # LoginSchema, MePayloadSchema
    │   ├── user.ts               # UserRoleSchema, UserUuidSchema, UserSchema,
    │   │                         # UserStatsRowSchema, CreateUserPayloadSchema,
    │   │                         # UpdateUserPayloadSchema
    │   ├── tag.ts                # TagUuidSchema, TagSchema, CreateTagPayloadSchema,
    │   │                         # UpdateTagPayloadSchema
    │   ├── api.ts                # ImpressionRowSchema, ImpressionDetailSchema,
    │   │                         # ImpressionListResponseSchema, WeightConfigRowSchema
    │   │                         # (обновлен: skippable, publisher_domain, s6 raw поля,
    │   │                         # все *_model_version поля в ImpressionRowSchema)
    │   ├── calibration.ts        # CalibrationSelectionSchema (discriminated union),
    │   │                         # CalibrationBatchSchema, CalibrationItemSchema,
    │   │                         # ApproveCalibrationResultSchema и сопутствующие
    │   ├── tag-constants.ts      # TagConstantsValuesSchema (19 полей),
    │   │                         # TagConstantsConfigSchema, DEFAULT_TAG_CONSTANTS
    │   │                         # (обновлен: S1_VIEWPORT_THRESHOLDS [0,0.75,1.0]),
    │   │                         # TAG_BUILD_TARGETS
    │   └── ivt.ts                # IvtVerdictSchema, IvtListEntrySchema,
    │                             # IvtThresholdsSchema, DEFAULT_IVT_THRESHOLDS,
    │                             # IvtListConfigRowSchema
    ├── scoring/
    │   ├── signal_defaults.ts    # NEW: интерфейсы и DEFAULT_* для всех параметрических
    │   │                         # моделей сигналов (WeibullParams, LogisticParams,
    │   │                         # S4Config, S5LogisticParams, S6LogisticParams,
    │   │                         # S7Thresholds + все DEFAULT_*)
    │   ├── weibull_mle_fit.ts    # NEW: fitWeibullMLE(samples) — Newton-Raphson MLE
    │   │                         # для S1 (используется backend recalibration jobs)
    │   ├── logistic_mle_fit.ts   # NEW: fitLogisticMLE(X, y) — IRLS алгоритм
    │   │                         # для S3/S5/S6 (используется backend recalibration jobs)
    │   ├── capping.ts            # applyAnomalyCapping()
    │   │                         # (обновлен: volume_level [0,100] для S6,
    │   │                         # s6_completion_rate_pct, s6_duration_sec cappings)
    │   ├── normalize.ts          # normalizeS1–S7(), normalizeAll(), getS5TopEventLabel()
    │   │                         # (полная замена формул S1,S3,S4,S5,S6,S7 на
    │   │                         # параметрические модели с инъекцией параметров)
    │   ├── weights.ts            # DEFAULT_WEIGHTS, WeightsValues, computeEffectiveWeights(),
    │   │                         # detectNullSignals()
    │   ├── score.ts              # computeScore(), recomputeScoreFromNormalized()
    │   │                         # (обновлен: принимает model params через normalizeAll,
    │   │                         # null-safe S6 обработка)
    │   └── ivt.ts                # classifyIvtSync() — GIVT/SIVT pure function
    │                             # (обновлен: viewWithoutActiveTab порог >0 → >3)
    ├── access/
    │   └── impression-fields.ts  # USER_VISIBLE_IMPRESSION_FIELDS, UserImpressionRowSchema
    └── types/
        └── index.ts              # re-export всех TypeScript-типов (export type)
                                  # (обновлен: WeibullParams, LogisticParams, S4Config,
                                  # S5LogisticParams, S6LogisticParams, S7Thresholds,
                                  # NormalizeAllParams + производные типы)
```

---

## Экспортный контракт

`src/index.ts` — единственная точка входа. Правило разделения именованных экспортов:

- **Zod-схемы** (runtime-объекты для валидации): перечисляются явно через `export { SchemaName }` из каждого `schemas/*.ts` файла. Новая схема — обязательно добавляется сюда.
- **TypeScript-типы** (`z.infer<>` и производные): экспортируются через `export type * from './types/index.js'`. Новый тип добавляется только в `types/index.ts`, `index.ts` не трогается.
- **Функции и константы** (scoring, access): перечисляются явно.

**Сборка перед использованием:** `pnpm --filter @cpmind/shared build` обязательна после любой правки `src/`. Backend и frontend потребляют скомпилированный `dist/`, а не живые исходники — несобранные изменения невидимы для `tsc` в соседних пакетах. Это системное следствие структуры монорепо, не разовый случай.

---

## Схемы (schemas/)

### `schemas/impression.ts` — `ImpressionPayloadSchema`

Входящий payload от JS-тега. Используется в:
- Backend: runtime-валидация в `POST /api/collect`
- Тег: типизация `buildPayload()` на этапе сборки (devDependency, не runtime)
- Frontend: типизация принимаемых данных

Ключевые особенности:
- `tag_uuid` — branded `TagUuid`, обязательное поле. Именно через него backend резолвит владельца.
- `tag_constants_version` — обязательное поле. Заявляет версию калибруемых констант, которой собран конкретный файл тега.
- Cross-field валидация: `timestamp_end >= timestamp_start`.
- `s3` nullable (`null` при cross-domain iframe) — специальный случай, обрабатывается перераспределением весов.
- `s6: SignalsS6Schema.nullable().optional()` — null для баннеров, отсутствие поля для старых бандлов тега; backend трактует оба случая одинаково.
- `creative_type` расширен значением `'video_creative'`.
- `skippable: z.boolean().optional()` — top-level поле payload (не внутри `s6`). `true` для skippable видео, `false`/отсутствует для non-skippable и баннеров. Определяет сегмент S6: `skippable` vs `non_skippable`. Передаётся из `TagConfig.skippable` при сборке тега.
- `publisher_domain: z.string().min(1).max(253)` — домен площадки размещения. Тег заполняет автоматически (fallback цепочка: `data-publisher-domain` атрибут → `document.referrer` hostname → `window.location.hostname` → `unknown_{djb2hash}`). Используется для аналитики по площадкам.
- `fp_hash: z.string().length(32).regex(FP_HASH_REGEX).optional()` — необратимый хэш устройства для IVT-детекции. Nullable и optional: отсутствие поля = тег не смог вычислить хэш (блокировка браузером, HTTP-окружение без `crypto.subtle`).
- `presence.event_intervals_ms: z.array(z.number().int().min(0)).max(50).optional()` — массив интервалов между последовательными throttled-событиями присутствия. Cap 50 записей. Используется `classifyIvtSync()` для детекции роботизированного тайминга.

**`SignalsS6Schema`** — обновлён:
- `completion_rate_pct: z.number().min(0).max(100).nullable().optional()` — числовой процент досмотра (0–100). `null` если видео не стартовало.
- `duration_sec: z.number().min(0).max(3600).nullable().optional()` — реальная длительность видео-ролика. Используется в S6 нормализации для `audibleRatio = audible_time_sec / duration_sec`. `null` если не определена.
- Оба поля nullable — корректно обрабатываются в `normalizeS6()` через null-guards.

### `schemas/user.ts`

- `UserUuid` — branded type. Не пересекается с `TagUuid` по TypeScript-типу, даже если значения UUID-строк формально одинаковы.
- Валидация пароля — по байтам UTF-8, не по символам (предел bcrypt 72 байта; многобайтовые символы при счёте символами маскируют превышение лимита).
- `UserStatsRowSchema` — включает `tagUuid: z.string().uuid().nullable()` (добавлено в эту сессию) — первичный тег пользователя из подзапроса в `getUsersWithStats()`.

**UserCampaignStatsRowSchema** - Контракт агрегированной статистики кампаний пользователя для user dashboard (`GET /api/user/campaigns`).

Поля:

- `campaignId`
- `impressionsCount`
- `creativesCount`
- `avgScore`
- `desktopRatioPct`
- `mobileRatioPct`
- `tabletRatioPct`
- `latestImpressionAt`

Используется исключительно пользовательской панелью. Не содержит данных других пользователей и не используется административным интерфейсом.

### `schemas/tag.ts`

- `TagUuid` — branded type, не пересекается с `UserUuid`.
- `CreateTagPayloadSchema` принимает `userUuid: UserUuid` — типосистема предотвращает случайную передачу `TagUuid` туда, где ожидается `UserUuid`.

### `schemas/api.ts`

Контракты ответов API для frontend и клиентов API.

**`ImpressionRowSchema`** — строка в таблице импрешенов. Обновлён в текущей сессии:
- `skippable: z.boolean().nullable()` — флаг skippable-видео
- `publisher_domain: z.string().nullable()` — домен площадки
- `s6_audible_time_sec: z.number().nullable()` — время аудируемого просмотра
- `s6_duration_sec: z.number().nullable()` — длительность видео-ролика
- `s6_skippable: z.boolean().nullable()` — дублирует `skippable` для S6-контекста (используется в CSV и детальном виде)
- `s1_model_version: z.string().nullable()` — UUID активного Weibull-конфига на момент показа, `'default'` при fallback
- `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version` — аналогично

Также содержит: все `s*_normalized`, `ivt_verdict: IvtVerdictSchema`, `ivt_category`, `ivt_confidence`, `score_reliable`, `tag_constants_version`, `weights_version`.

**`ImpressionDetailSchema`** — расширяет `ImpressionRowSchema`. Добавляет:
- `signals_raw: z.unknown()` — полный JSONB payload от тега
- `signals_normalized: z.unknown()` — нормализованные значения в JSONB
- `ivt_signals: z.unknown()` — сработавшие IVT-правила (admin-only, не в USER_VISIBLE_IMPRESSION_FIELDS)
- `lastRecalibratedAt?: z.string()` — дата последнего подтверждённого пересчёта
- `lastRecalibratedWeightsVersion?: z.string()` — версия весов при последнем пересчёте

**`WeightConfigRowSchema`** — версия конфигурации весов: `id`, `version`, `configType`, `weights` (объект `{s1, s2, s3, s4, s5, s6, s7}`), `description`, `isActive`, `createdAt`.

**`PublisherDomainAggregateSchema`** — контракт ответа `GET /api/impressions/domain_aggregate`. Поля: `impressions_count: z.number().int()`, `campaigns_count: z.number().int()`, `avg_score: z.number().nullable()`, `avg_s1`..`avg_s7: z.number().nullable()`. Используется frontend для отображения агрегированной сводной строки в режиме площадки (`domainView`). Экспортирован из `index.ts` как схема и из `types/index.ts` как тип `PublisherDomainAggregate`.

### `schemas/calibration.ts`

Контракты механизма пересчёта Score при смене весов.

**`CalibrationSelectionSchema`** — discriminated union по полю `mode`:
```
{ mode: 'ids', impressionIds: string[] }           — конкретные показы по PK
{ mode: 'session_groups', sessionGroupIds: string[] } — целые сегменты показа
{ mode: 'filter', filters: CalibrationFilterSchema }  — произвольный фильтр
```
Максимум 5000 id в режимах `ids`/`session_groups`.

**`CalibrationFilterSchema`** (вложенная, не экспортируется напрямую) — содержит те же фильтры, что `GET /api/impressions`, включая диапазонные параметры сигналов. Изменения в эту сессию:
- Убрано поле `userUuid` — скоуп теперь определяется JWT на уровне сервиса, не payload
- Добавлены: `tagConstantsVersion`, `weightsVersion`
- Добавлены: `scoreMin/Max`, `s1Min/Max`...`s7Min/Max`

Экспортирован тип `CalibrationFilters = z.infer<typeof CalibrationFilterSchema>` (добавлен в эту сессию, необходим backend-сервису).

**`CalibrationBatchSchema`** — состояние батча пересчёта. Добавлены в эту сессию:
- `expiresAt: z.string().nullable()` — момент авто-отмены черновика (`createdAt + TTL`), `null` для не-`ready` статусов

**`CalibrationItemSchema`** — элемент батча, один показ. Добавлены в эту сессию:
- `deviceType: z.string()`
- `s1Normalized`...`s7Normalized: z.number().nullable()` — нормализованные значения для контекстного отображения в таблице превью

**Статусы батча:** `processing → ready → (discarded | expired)` или `processing → failed`. `approved` — статус отдельного элемента, не батча.

### `schemas/tag-constants.ts`

**`DEFAULT_TAG_CONSTANTS`** — общий источник значений для:
- Backend: bootstrap версии `v0` при первом старте на пустой таблице
- Тег: CLI-сборка `pnpm --filter @cpmind/tag build` (версия `dev`)
- Frontend: дефолтные значения полей формы создания новой версии констант (`TagConstantsPanel`)

Никакого дублирования — одно определение, два потребителя.

**`TAG_BUILD_TARGETS`** — цели esbuild для сборки тега: Chrome 90+, Firefox 90+, Safari 14+, Edge 90+. Используется и в CLI (`packages/tag/build.ts`), и в backend (`services/tag_builder.ts`).

**19 калибруемых констант** (`TagConstantsValues`):

| Константа | Назначение |
|---|---|
| `SCROLL_ZONE_PX` | Зона наблюдения скролла вокруг баннера (S3) |
| `READING_TIME_MIN` | Минимальное время чтения для паттерна (S3) |
| `STREAK_MIN_SPEED` | Минимальная скорость "серии" скролла (S3) |
| `STREAK_WINDOW_MS` | Окно серии скролла (S3) |
| `READING_SPEED_MAX` | Максимальная скорость при чтении (S3) |
| `STREAK_MIN_EVENTS` | Минимум событий в серии (S3) |
| `TAP_MAX_OFFSET_PX` | Максимальное смещение тапа (S5, mobile) |
| `PAUSE_THRESHOLD_MS` | Порог паузы скролла (S3) |
| `PINCH_DELTA_MIN_PX` | Минимальная дельта pinch-жеста (S5, mobile) |
| `MOUSE_MOVE_DEDUP_PX` | Дедупликация движений мыши (S5) |
| `TAP_MAX_DURATION_MS` | Максимальная длительность тапа (S5, mobile) |
| `S2_SAMPLE_INTERVAL_MS` | Интервал сэмплирования доли экрана (S2) |
| `S7_SAMPLE_INTERVAL_MS` | Интервал сэмплирования контекста страницы (S7) |
| `SWIPE_MIN_DISTANCE_PX` | Минимальная дистанция свайпа (S5, mobile) — поднята с 30 до 60 по итогам P-18 |
| `S1_VIEWPORT_THRESHOLDS` | Пороги IntersectionObserver для S1 — **изменено в текущей сессии:** `[0, 0.75, 1.0]` вместо прежних `[0, 0.5, 1.0]`. Порог 75% вместо 50% (Zhang & Chen 2015, Uhl et al. 2020) |
| `ENTROPY_ANGLE_THRESHOLD` | Порог энтропии траектории мыши (S5) |
| `GESTURE_SCALE_DELTA_MIN` | Минимальная дельта масштаба gesturechange (S5, mobile) — добавлена по итогам P-18 |
| `PROXIMITY_TRACK_ZONE_PX` | Зона отслеживания близости курсора (S5) |
| `PRESENCE_IDLE_TIMEOUT_MS` | Порог простоя для F_Presence и сегментации показа |

`EVENT_TYPES` и `AD_SELECTORS` сознательно **не** калибруются и не входят в этот список.

---

## Скоринг (scoring/)

### `signal_defaults.ts` (новый) — интерфейсы и дефолтные параметры моделей

Единственный источник истины для типов и дефолтных параметров всех параметрических моделей. Используется в: `normalize.ts`, `score.ts`, всех backend-сервисах моделей, всех recalibration jobs.

```typescript
// S1 — Weibull CDF
interface WeibullParams { k: number; lambda: number }
const DEFAULT_WEIBULL_PARAMS: WeibullParams = { k: 1.0, lambda: 5.0 }

// S3 / S5 / S6 — логистические регрессии
interface LogisticParams {
  coefficients: number[];         // β-вектор
  featureMeans: number[];         // μ для z-score нормализации признаков
  featureStds: number[];          // σ для z-score нормализации признаков
}
const DEFAULT_LOGISTIC_PARAMS: LogisticParams = {
  coefficients: [0, 0, 0, 0, 0, 0, 0, 0],   // 8 коэф. (S3)
  featureMeans: [0, 0, 0, 0, 0, 0, 0],
  featureStds: [1, 1, 1, 1, 1, 1, 1]
}
// S5 имеет свои интерфейсы (S5LogisticParams, 5 коэф.)
// S6 имеет свои (S6LogisticParams, 9 коэф. + interaction term)

// S4 — нелинейная функция
interface S4Config { lambda: number; tRefMs: number }
const DEFAULT_S4_CONFIG: S4Config = { lambda: 0.08, tRefMs: 5000 }

// S5 — логистическая регрессия по device_type
interface S5LogisticParams { coefficients: number[] }  // 5 коэф.
const DEFAULT_S5_DESKTOP: S5LogisticParams = {
  coefficients: [-2.5, 3.8, 2.2, 0.8, 1.5]  // β0..β4
}
const DEFAULT_S5_MOBILE_TABLET: S5LogisticParams = {
  coefficients: [-2.0, 3.5, 2.8, 1.2, 0.9]  // β0..β4
}

// S6 — логистическая регрессия с interaction term
interface S6LogisticParams {
  coefficients: number[];    // 9 коэф. β0..β8
  featureMeans: number[];
  featureStds: number[];
}
const DEFAULT_S6_LOGISTIC_PARAMS: S6LogisticParams = {
  coefficients: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  featureMeans: [0, 0, 0, 0, 0],
  featureStds: [1, 1, 1, 1, 1]
}

// S7 — квантильные пороги
interface S7Thresholds {
  relativeYLow: number;    // p33 ATF-сегмента
  relativeYMid: number;    // p67 BTF-сегмента
  clutterMid: number;      // p50 clutter
  clutterHigh: number;     // p80 clutter
}
const DEFAULT_S7_THRESHOLDS: Record<string, S7Thresholds> = {
  desktop: { relativeYLow: 0.20, relativeYMid: 0.55, clutterMid: 3, clutterHigh: 6 },
  mobile:  { relativeYLow: 0.15, relativeYMid: 0.45, clutterMid: 2, clutterHigh: 5 },
  tablet:  { relativeYLow: 0.18, relativeYMid: 0.50, clutterMid: 3, clutterHigh: 6 }
}
```

**Архитектурный принцип:** `signal_defaults.ts` не содержит математики — только типы и константы. Математика — в `normalize.ts`. Fitting-алгоритмы — в `weibull_mle_fit.ts` и `logistic_mle_fit.ts`. Backend-сервисы — в `services/weibull_config.ts` и т.д.

### `weibull_mle_fit.ts` (новый) — MLE для S1

```typescript
fitWeibullMLE(samples: number[]): WeibullParams
```

Newton-Raphson итерация по log-likelihood Weibull-распределения. Входные данные: массив `time_in_view_sec` из `impressions` для конкретного сегмента. Стартовая точка: `k=1.0, λ=mean(samples)`. Условие сходимости: `|δk| < 1e-6 || |δλ| < 1e-6`, максимум 100 итераций. При расхождении (NaN/Inf) возвращает `DEFAULT_WEIBULL_PARAMS`.

Живёт в shared (а не только в backend), потому что может понадобиться в тестах и валидации — но используется runtime только в `jobs/s1_weibull_recalibration.ts`.

### `logistic_mle_fit.ts` (новый) — IRLS для S3/S5/S6

```typescript
fitLogisticMLE(X: number[][], y: number[]): number[]
```

IRLS (Iteratively Reweighted Least Squares) — численно стабильный алгоритм для логистической регрессии малой размерности. `X` — матрица признаков (уже нормализованных z-score), `y` — бинарные метки `0|1`. Возвращает вектор коэффициентов `β`. До 50 итераций, eps=1e-8. При расхождении — нулевые коэффициенты (→ `sigmoid(0)=0.5` → normalized=50).

Специфично для каждого сигнала:
- S3: 8 признаков, `tag_constants_version` фильтр при выборке данных
- S5: 5 признаков, раздельный fitting для `desktop` и `mobile_tablet`
- S6: 9 признаков + interaction term `completionZ × audibleZ` (предварительно вычисленный как 10-й признак перед вызовом IRLS)

### `capping.ts` — `applyAnomalyCapping()`

Обрезка экстремальных значений сигналов перед нормализацией. Вызывается **строго до** `normalizeAll()`. Не мутирует входной payload: `structuredClone` создаёт полную копию.

**Актуальная таблица кэппингов (включая изменения текущей сессии):**

| Сигнал | Поле | Ограничение |
|---|---|---|
| S1 | `time_in_view_sec` | `[0, 3600]`; при `> 3600` → `anomaly_duration = true` |
| S2 | `share_of_screen_avg_pct` | `[0, 100]` |
| S3 | `avg_scroll_speed`, `max_scroll_speed` | `[0, 50000]` |
| S3 | `std_dev`, счётчики пауз/возвратов/серий | `≥ 0` |
| S4 | `tab_active_time_ms`, `tab_total_time_ms` | `≥ 0` |
| S4 | `tab_switches_count` | `≥ 0` |
| S5 | `hover_duration_max_ms` | `≥ 0` |
| S5 | `cursor_proximity` | `≥ 0` |
| S5 | `cursor_trajectory_entropy` | `[0, 1]` |
| S6 | `completion_rate_pct` | `[0, 100]` |
| S6 | `audible_time_sec` | `[0, 3600]` |
| S6 | `duration_sec` | `[0, 3600]` |
| S6 | `replay_count` | `≥ 0` (floor 0) |
| S6 | `volume_level` | `[0, 100]` ← **добавлено в текущей сессии** |

### `normalize.ts` — параметрические модели нормализации

Все функции pure, без side effects. Принимают сырые значения **и параметры активной модели**, возвращают `[0, 100]`. Параметры инжектируются из backend-сервисов (не читаются из БД внутри функций — pure function инвариант).

**`normalizeS1(s1Raw, weibullParams: WeibullParams): number`**

Weibull CDF: `S1 = min(100, (1 − exp(−(t/λ)^k)) × 100)`, где `t = time_in_view_sec`. Параметры `{k, λ}` — из активного `s1_weibull_configs` для сегмента. Fallback: `DEFAULT_WEIBULL_PARAMS {k:1.0, λ:5.0}`. Calibrated range: при `k=1.5, λ=3.5` → 2s→~44, 5s→~81, 10s→~97.

Порог видимости: `≥ 75% пикселей / ≥ 2.0 секунды непрерывно` (от тега через `S1_VIEWPORT_THRESHOLDS = [0, 0.75, 1.0]`).

**`normalizeS2(s2Raw): number`** — без изменений:

```
S2 = min(100, sqrt(share_of_screen_avg_pct) × 10)
```

**`normalizeS3(s3Raw, logisticParams: LogisticParams): number | null`**

Логистическая регрессия: `S3 = min(100, sigmoid(β·x) × 100)`. Вектор признаков `x = [1, avg_speed_norm, max_speed_norm, pause_count_norm, return_count_norm, streak_count_norm, has_reading_flag, std_dev_norm]` (8 признаков). Z-score нормализация: `x_norm = (x − μ) / σ` по `featureMeans` / `featureStds` параметра. Возвращает `null` при `s3Raw === null` (cross-domain iframe).

**`normalizeS4(s4Raw, s4Config: S4Config): number`**

Нелинейная функция: `S4 = clamp(activeRatio × 100 × exp(−λ×n) × min(1, avgSession/T_ref), 0, 100)`, где:
- `activeRatio = tab_active_time_ms / tab_total_time_ms`
- `n = tab_switches_count`
- `avgSession = tab_active_time_ms / max(1, n+1)` (средняя длина активной сессии)
- `λ` — штрафной параметр за частоту переключений (из `s4Config.lambda`)
- `T_ref` — эталонная длина сессии в мс (из `s4Config.tRefMs`)

Fallback: `DEFAULT_S4_CONFIG {lambda: 0.08, tRefMs: 5000}`.

**`normalizeS5(s5Raw, s5Params: S5LogisticParams, deviceType: string): number`**

Логистическая регрессия с сегментацией по device_type. 2 сегмента: `desktop`, `mobile_tablet`.

Desktop-вектор: `x = [1, clicked, hoverDurationNorm, hoverCountNorm, proximityNorm]`
- `hoverDurationNorm = min(1, log(hover_duration_max_ms + 1) / log(10001))` — log-нормализация с clamp-guard (предотвращает выход >1 при аномальных значениях)

Mobile/tablet-вектор: `x = [1, clicked, zoom, tapCountNorm, swipeCountNorm]`
- `tapCountNorm = min(1, tap_count / 5)`, `swipeCountNorm = min(1, swipe_count / 3)`

`S5 = min(100, round(sigmoid(β·x) × 100))`. Fallback по сегменту: `DEFAULT_S5_DESKTOP` / `DEFAULT_S5_MOBILE_TABLET` (prior-коэффициенты, обоснованные экспертно).

**`normalizeS6(s6Raw: SignalsS6 | null, s6Params: S6LogisticParams | null): number | null`**

Возвращает `null` если `s6Raw === null` (баннер) — вне зависимости от `s6Params`. `s6Params = null` для баннеров (сигнал от `getActiveS6LogisticParams(null)`).

Для видео — логистическая регрессия с 9 коэффициентами + interaction term:
```
Вектор признаков (после z-score нормализации):
  completionZ   = znorm(completion_rate_pct ?? quartileToRate())
  audibleZ      = znorm(audibleRatio)         где audibleRatio = audible_time_sec / duration_sec
  quartileZ     = znorm(quartileOrdinal)      где quartileOrdinal ∈ {0,1,2,3,4}
  replayZ       = znorm(log(replay_count+1))
  interaction   = completionZ × audibleZ      (предвычисленный терм взаимодействия)

z = β0 + β1·completionZ + β2·audibleZ + β3·quartileZ + β4·replayZ
  + β5·play_initiated + β6·skipped + β7·unmuted_by_user + β8·interaction
S6 = min(100, sigmoid(z) × 100)
```
`audibleRatio`: `null`-safe — если `duration_sec` равно null или 0, `audibleRatio = 0`.

**`normalizeS7(s7Raw, deviceType: string, s7Thresholds: S7Thresholds): number`**

Квантильная калибровка (не ML — вес сигнала 0.05 не оправдывает overhead). Формула:
```
positionScore:
  if is_above_the_fold:
    relativeY < s7Thresholds.relativeYLow → 55, иначе 45
  else:
    relativeY < s7Thresholds.relativeYMid → 30, иначе 15

clutterPenalty:
  banners_in_viewport ≤ clutterMid → 0
  banners_in_viewport ≤ clutterHigh → -12
  иначе → -25

persistenceBonus:
  viewability_persistence_pct > 80 → +5
  viewability_persistence_pct < 20 → -5
  иначе → 0

S7 = clamp(positionScore + clutterPenalty + persistenceBonus, 0, 100)
```
Пороги `{relativeYLow, relativeYMid, clutterMid, clutterHigh}` — квантили реального трафика из `s7_quantile_configs`. Fallback: `DEFAULT_S7_THRESHOLDS[deviceType]`.

**`normalizeAll(capped, params: NormalizeAllParams): NormalizedSignals`**

Агрегатор. Принимает `NormalizeAllParams`:
```typescript
interface NormalizeAllParams {
  weibullParams: WeibullParams;
  s3LogisticParams: LogisticParams;
  s4Config: S4Config;
  s5Params: S5LogisticParams;
  s6Params: S6LogisticParams | null;   // null для баннеров
  s7Thresholds: S7Thresholds;
  deviceType: string;
}
```
Вызывает все семь функций. Возвращает `NormalizedSignals { s1, s2, s3, s4, s5, s6, s7 }` где `s3: number | null`, `s6: number | null`.

**`getS5TopEventLabel(s5)`** — без изменений. Текстовая метка наивысшего события для таблицы.

### `weights.ts` — веса и перераспределение

**`DEFAULT_BANNER_WEIGHTS`** — стартовые веса для баннеров `v1.0_uncalibrated`: s6: 0.00, сумма 1.0. S6 с нулевым весом не перераспределяется при null (добавляет 0 к availableSum).

**`DEFAULT_VIDEO_WEIGHTS`** — стартовые веса для видео `v1.0_uncalibrated`: s6: 0.40, s1: 0.15, s2: 0.10, s3: 0.10, s4: 0.10, s5: 0.10, s7: 0.05, сумма 1.0.

**`CreativeCategory`** = `'banner' | 'video'` — тип для per-creative-type routing.

**`WeightsValues`** и **`SignalKey`** расширены `s6`.

Используется как fallback в `getActiveWeightsConfig()`, если таблица `weight_configs` пуста. Не влияет на новые показы, пока в таблице есть хотя бы одна активная версия.

**`computeEffectiveWeights(nullSignals, weights)`** — перераспределение весов при `null`-сигналах (§6.2):

```
availableSum = сумма весов доступных сигналов (без nullSignals)
if availableSum === 0: все веса = 0 (edge case, Score будет 0)
effectiveWeight[key] = nullSet.has(key) ? 0 : weights[key] / availableSum
```

Сумма эффективных весов всегда равна 1.0. Единственный текущий `null`-сигнал — S3 при cross-domain iframe.

**`detectNullSignals(normalized)`** — возвращает массив ключей сигналов со значением `null`. Детектирует S3 (cross-domain iframe) и S6 (banner creative). Оба случая приводят к перераспределению весов через `computeEffectiveWeights()`.

### `score.ts` — расчёт Score

**`computeScore(normalized, presenceThresholdMs, weights)`**:
1. `computeEffectiveWeights(detectNullSignals(normalized), weights)` — перераспределение при null (S3 и/или S6)
2. Взвешенная сумма по всем 7 сигналам: `S1×w1 + S2×w2 + S3×w3 + S4×w4 + S5×w5 + S6×w6 + S7×w7`
3. `F_Presence`: 0 если `time_since_last_event_ms > presenceThresholdMs`, иначе 1
4. `Score = взвешенная_сумма × F_Presence`

`presenceThresholdMs` — параметр, не захардкоженная константа. Backend передаёт значение из активной версии констант тега (`PRESENCE_IDLE_TIMEOUT_MS`) — синхронизация через общий источник, не дублирование.

**`recomputeScoreFromNormalized(normalized, fPresence, weights)`** — упрощённый пересчёт для калибровки:
- Принимает уже нормализованные значения и уже вычисленный `fPresence` из базы данных
- **Не** повторяет кэппинг и нормализацию — они не зависят от весов и не изменились
- Возвращает только `{ score_final, weights_version }` — именно эти два поля обновляются при approve

Используется **только** в `services/calibrations.ts → processCalibrationBatch()`.

---

## Контроль доступа (access/)

### `access/impression-fields.ts`

**`USER_VISIBLE_IMPRESSION_FIELDS`** — единственный whitelist полей импрешена для роли `user`. Определён один раз, используется в двух местах:
- Backend: `GET /api/impressions` и `/export/csv` (фильтрация JSON-ключей в ответе)
- Frontend: типизация отображаемых полей

**`UserImpressionRowSchema`** — производный через `ImpressionRowSchema.pick(USER_VISIBLE_IMPRESSION_FIELDS)`. Не отдельно поддерживаемая копия — изменение whitelist автоматически меняет схему.

`signals_raw`, `signals_normalized`, детальные флаги (`no_events`, `tab_mostly_hidden`, `anomaly_duration`), `fp_hash`, `ivt_signals` — недоступны роли `user`. Доступны: основные метаданные, S1–S7 raw и normalized, `s6_normalized`, `score_final`, `is_suspicious`, `ivt_verdict`, `ivt_category`, `ivt_confidence`, `score_reliable`, `publisher_domain`.

---

## Сигналы S1–S7 и F_Presence

### S1 — Time-in-View (вес 0.30)

Суммарное время, в течение которого не менее **75%** пикселей баннера находилось в видимой области экрана. Порог видимости: ≥75% пикселей / ≥2.0 секунды непрерывно (Zhang & Chen 2015, Uhl et al. 2020 — n=350k+, обоснование повышения относительно MRC 50%/1s).

Реализация в теге: `IntersectionObserver` с порогами из `S1_VIEWPORT_THRESHOLDS = [0, 0.75, 1.0]`. Накапливает: `time_in_view_sec`, `max_continuous_view_sec`, `visible_pixels_pct`.

Нормализация: **Weibull CDF** с параметрами `{k, λ}` из `s1_weibull_configs` для сегмента `device×creative_group`.

### S2 — Share of Screen (вес 0.20)

Средняя доля видимой области экрана, которую занимал баннер во время показа. Один и тот же баннер 728×90 занимает разную долю экрана в зависимости от разрешения и DPI устройства.

Реализация: сэмплирование каждые `S2_SAMPLE_INTERVAL_MS` (дефолт 500 мс) через `getBoundingClientRect`.

### S3 — Scroll Velocity (вес 0.15)

Паттерн скролла в зоне ±`SCROLL_ZONE_PX` пикселей от баннера. Высокая скорость без пауз — механическое пролистывание. Медленный скролл с паузами и возвратами — чтение.

Реализация: rAF-throttled обработчик. Алгоритм Велфорда для бегущего mean/std_dev без накопления истории. 7 констант калибруемы.

Нормализация: **логистическая регрессия**, 9 сегментов `device×creative_group`, параметры из `s3_logistic_configs`.

**S3 = null** при cross-domain iframe. Вес перераспределяется через `computeEffectiveWeights()`.

### S4 — Tab Activity (вес 0.15)

Доля времени, когда вкладка с баннером была активна (не скрыта в фоне), с учётом штрафа за частые переключения и среднюю длину сессии.

Реализация: `document.visibilitychange`. История состояний (`visibility_state_history`) — единственный источник для пересчёта active time строго в границах показа.

Флаг `tab_mostly_hidden = true` если активность < 20%.

Нормализация: **нелинейная функция** `S4 = clamp(activeRatio × 100 × exp(−λ×n) × min(1, avgSession/T_ref), 0, 100)`. 5 сегментов, параметры из `s4_configs`.

### S5 — Interaction Events (вес 0.15)

Прямое поведенческое доказательство заинтересованности пользователя в баннере.

Desktop: click, mouseenter/leave/move, hover-длительность и количество, близость курсора, энтропия траектории. Mobile: touchstart/end/move, gesturechange + pinch.

Константы: `SWIPE_MIN_DISTANCE_PX` 30→60 (P-18). `GESTURE_SCALE_DELTA_MIN` добавлена (P-18).

Нормализация: **логистическая регрессия**, 2 сегмента (`desktop`, `mobile_tablet`), параметры из `s5_logistic_configs`. Прокси-метка обучения: `y=1` если `clicked=true ИЛИ hoverDurationMaxMs ≥ p75` по сегменту.

### S7 — Page Context (вес 0.05)

Контекст размещения баннера: позиция, высота страницы, конкурирующие баннеры, persistence видимости.

Реализация: статические поля при инициализации + динамическое сэмплирование каждые `S7_SAMPLE_INTERVAL_MS` (дефолт 1000 мс).

Нормализация: **квантильная калибровка** — `positionScore + clutterPenalty + persistenceBonus`, clamp `[0, 100]`. 3 сегмента по `device_type`, пороги из `s7_quantile_configs`.

### F_Presence — мультипликатор присутствия

Бинарный множитель (0 или 1). Обнуляет итоговый Score если пользователь перестал проявлять активность до конца показа.

**Условие F_Presence = 0:** `time_since_last_event_ms > PRESENCE_IDLE_TIMEOUT_MS` на момент финализации показа (сегмента). Скользящее окно — значение до простоя не учитывается; только факт простоя в конце.

**Синхронизация:** `PRESENCE_IDLE_TIMEOUT_MS` используется одновременно тегом (таймер разрыва сегмента) и backend (расчёт F_Presence). Backend резолвит значение из заявленной в payload версии констант — единый источник, не два независимых числа.

---

## Формулы нормализации

Все формулы — параметрические. Параметры инжектируются из backend-сервисов, дефолты определены в `signal_defaults.ts`.

### S1 — Weibull CDF

```
S1 = min(100, (1 − exp(−(t/λ)^k)) × 100)

где:
  t = time_in_view_sec  (видимость ≥ 75% пикселей / ≥ 2.0s непрерывно)
  k, λ — из s1_weibull_configs[segment]
  Fallback: k=1.0, λ=5.0

Ориентиры при k=1.5, λ=3.5:
  2s → ~44    5s → ~81    10s → ~97
```

### S2 — без изменений

```
S2 = min(100, sqrt(share_of_screen_avg_pct) × 10)
```

### S3 — логистическая регрессия

```
x = [1, avg_speed_norm, max_speed_norm, pause_count_norm,
     return_count_norm, streak_count_norm, has_reading, std_dev_norm]

x_norm = (x − featureMeans) / featureStds   (z-score)

S3 = min(100, sigmoid(β · x_norm) × 100)

где sigmoid(z) = 1 / (1 + exp(−z))
S3 = null при cross-domain iframe
```

### S4 — нелинейная функция

```
activeRatio = tab_active_time_ms / tab_total_time_ms
avgSession  = tab_active_time_ms / max(1, tab_switches_count + 1)

S4 = clamp(
  activeRatio × 100 × exp(−λ × tab_switches_count) × min(1, avgSession / T_ref),
  0, 100
)

где λ, T_ref — из s4_configs[segment]
Fallback: λ=0.08, T_ref=5000ms
```

### S5 — логистическая регрессия по device_type

```
Desktop:
  x = [1, clicked, hoverDurationNorm, hoverCountNorm, proximityNorm]
  hoverDurationNorm = min(1, log(hover_duration_max_ms + 1) / log(10001))
  hoverCountNorm    = min(1, hover_count / 20)
  proximityNorm     = min(1, (1 − cursor_proximity / PROXIMITY_TRACK_ZONE_PX))

Mobile/tablet:
  x = [1, clicked, zoom, tapCountNorm, swipeCountNorm]
  tapCountNorm   = min(1, tap_count / 5)
  swipeCountNorm = min(1, swipe_count / 3)

S5 = min(100, round(sigmoid(β · x) × 100))
```

### S6 — логистическая регрессия с interaction term

```
completionRate = completion_rate_pct ?? (quartile_75 ? 87.5 : quartile_50 ? 62.5 : ...)
audibleRatio   = audible_time_sec / max(1, duration_sec ?? 1)
quartileOrd    = 0|1|2|3|4  (none/25/50/75/100)

completionZ  = (completionRate − μ_c) / σ_c
audibleZ     = (audibleRatio  − μ_a) / σ_a
quartileZ    = (quartileOrd   − μ_q) / σ_q
replayZ      = (log(replay_count+1) − μ_r) / σ_r
interaction  = completionZ × audibleZ

z = β0 + β1·completionZ + β2·audibleZ + β3·quartileZ + β4·replayZ
  + β5·play_initiated + β6·skipped + β7·unmuted_by_user + β8·interaction

S6 = min(100, sigmoid(z) × 100)
S6 = null для баннерных креативов
```

### S7 — квантильная калибровка

```
positionScore:
  is_above_the_fold=true:
    relativeY < relativeYLow → 55, иначе 45
  is_above_the_fold=false:
    relativeY < relativeYMid → 30, иначе 15

clutterPenalty:
  banners_in_viewport ≤ clutterMid  → 0
  banners_in_viewport ≤ clutterHigh → -12
  иначе                             → -25

persistenceBonus:
  viewability_persistence_pct > 80 → +5
  viewability_persistence_pct < 20 → -5
  иначе                            → 0

S7 = clamp(positionScore + clutterPenalty + persistenceBonus, 0, 100)
```

---

## Формула CPMind Score

```
Score = (S1×w1 + S2×w2 + S3×w3 + S4×w4 + S5×w5 + S6×w6 + S7×w7) × F_Presence
```

Результат: `[0, 100]`. При F_Presence = 0 — итог всегда 0 независимо от сигналов.

При `S3 = null` (iframe) или `S6 = null` (баннер) — `computeEffectiveWeights()` перераспределяет их веса пропорционально между оставшимися сигналами.

---

## IVT-классификация (scoring/ivt.ts)

### `classifyIvtSync(payload, activeEntries, thresholds, userAgent)`

Pure function без side effects. Не обращается к БД. Детерминирована при одинаковых аргументах. Вызывается backend-ом в pipeline шаге 8.5.

**Аргументы:**
- `payload: ImpressionPayload` — валидированный payload от тега
- `activeEntries: IvtListEntry[] | null` — in-memory записи активной версии `ivt_list_configs`. `null` = список не загружен → GIVT-матчинг пропускается
- `thresholds: IvtThresholds | null` — активные пороги. `null` → все SIVT-правила пропускаются
- `userAgent: string` — из заголовка запроса

**Возвращает `IvtClassification`:**
- `ivt_verdict: IvtVerdict`
- `ivt_category: string | null`
- `ivt_confidence: number` [0..1]
- `score_reliable: boolean`
- `ivt_signals: IvtSignal[]`

### Логика выполнения

**GIVT early return.** UA-матчинг по списку — три режима (`exact | substring | regex`). При совпадении — немедленный возврат `givt`, SIVT-правила не проверяются. `confidence: 1`, `score_reliable: false`.

**SIVT-правила** (только при `thresholds !== null`):

| Правило | Функция | Порог | Категория | Confidence |
|---|---|---|---|---|
| Тайминговая регулярность | `checkRoboticTiming()` | `timing_variance_min_ms` | `robotic_timing` | 0.7 |
| Энтропия курсора | `checkSyntheticCursor()` | `cursor_entropy_min` | `synthetic_cursor` | 0.65 |
| Невозможные события | `checkImpossibleEvents()` | `click_without_hover` (bool) + `time_in_view_sec > 3` при `tab_active = 0` | `impossible_event_sequence` | 0.9 |

**Правило `viewWithoutActiveTab`:** порог изменён с `> 0` на `> 3` секунд. Причина: IntersectionObserver при `document.hidden=true` может зафиксировать до 2–3 секунд видимости до срабатывания `visibilitychange` (гонка событий при загрузке страницы в фоновой вкладке). Порог `> 3` исключает эти ложные срабатывания, сохраняя детекцию реального накрутчика.

`TIMING_MIN_SAMPLES = 10` — минимальный размер выборки `event_intervals_ms` для статистически значимого вывода. Алгоритмическая константа, не калибруемый порог.

**Confidence-агрегация** (вероятностное объединение):
```
P(A∪B) = 1 − (1−P(A)) × (1−P(B))
```
Исключает выход за [0,1] при нескольких сработавших правилах.

**Апгрейд до `sivt_confirmed`:** `confidence >= thresholds.confidence_confirm` (default 0.85 при null).

**`valid`-путь:** ни одно правило не сработало → `confidence: 0`, `score_reliable: true`, пустой `ivt_signals`.

### Схемы (`schemas/ivt.ts`)

**`IvtVerdictSchema`** — `z.enum(['valid', 'givt', 'sivt_suspected', 'sivt_confirmed'])`.

**`IvtListEntrySchema`** — одна запись списка паттернов:
```typescript
{
  type: 'ua' | 'ip',
  pattern: string,
  match_type: 'exact' | 'substring' | 'regex' | 'cidr',
  category: string,
  reason?: string,
  source?: 'iab' | 'arir' | 'own'
}
```
Refine: `type === 'ip'` ↔ `match_type === 'cidr'`.

**`IvtThresholdsSchema`** — 6 полей, все `nullable()`:
```typescript
{
  timing_variance_min_ms: number | null,
  cursor_entropy_min: number | null,
  click_without_hover: boolean | null,
  repeat_fp_window_min: number | null,
  repeat_fp_max_creatives: number | null,
  confidence_confirm: number | null
}
```
`DEFAULT_IVT_THRESHOLDS` — все поля `null`. Используется как fallback когда `ivt_thresholds_configs` пуст.

**`IvtListConfigRowSchema`** / **`IvtThresholdsConfigRowSchema`** — контракты ответов API для frontend (без поля `entries` в списке — только метаданные версии).

---

## Изменения, внесённые в сессию bug-fixing / signal modifications

| Файл | Изменение |
|---|---|
| `schemas/impression.ts` | `skippable: z.boolean().optional()` в `ImpressionPayloadSchema` (top-level, не в s6); `publisher_domain: z.string().min(1).max(253)` в `ImpressionPayloadSchema`; `completion_rate_pct` (nullable) и `duration_sec` (nullable) в `SignalsS6Schema` |
| `schemas/api.ts` | `skippable`, `publisher_domain`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`, `s1_model_version`..`s7_model_version` в `ImpressionRowSchema` |
| `schemas/tag-constants.ts` | `S1_VIEWPORT_THRESHOLDS` дефолт `[0, 0.5, 1.0]` → `[0, 0.75, 1.0]` |
| `scoring/signal_defaults.ts` | **NEW** — `WeibullParams`, `DEFAULT_WEIBULL_PARAMS`; `LogisticParams`, `DEFAULT_LOGISTIC_PARAMS`; `S4Config`, `DEFAULT_S4_CONFIG`; `S5LogisticParams`, `DEFAULT_S5_DESKTOP`, `DEFAULT_S5_MOBILE_TABLET`; `S6LogisticParams`, `DEFAULT_S6_LOGISTIC_PARAMS`; `S7Thresholds`, `DEFAULT_S7_THRESHOLDS` |
| `scoring/weibull_mle_fit.ts` | **NEW** — `fitWeibullMLE(samples)`, Newton-Raphson MLE для Weibull |
| `scoring/logistic_mle_fit.ts` | **NEW** — `fitLogisticMLE(X, y)`, IRLS для логистической регрессии |
| `scoring/normalize.ts` | `normalizeS1`: log → Weibull CDF, принимает `WeibullParams`; `normalizeS3`: эвристика → логистика, принимает `LogisticParams`; `normalizeS4`: линейное ratio → нелинейная функция, принимает `S4Config`; `normalizeS5`: иерархия → логистика, принимает `S5LogisticParams` + `deviceType`, добавлен `hoverDurationNorm` log-clamp guard; `normalizeS6`: иерархия → логистика с interaction term, принимает `S6LogisticParams \| null`; `normalizeS7`: эвристика → квантильная калибровка, принимает `S7Thresholds`; `normalizeAll` принимает `NormalizeAllParams` |
| `scoring/capping.ts` | `volume_level` добавлен в cap S6 `[0, 100]` |
| `scoring/score.ts` | `computeScore` обновлён под новую сигнатуру `normalizeAll`; null-safe S6 обработка при перераспределении весов |
| `scoring/ivt.ts` | `checkImpossibleEvents()`: `viewWithoutActiveTab` порог `> 0` → `> 3` секунд (FP-fix для IntersectionObserver race condition) |
| `types/index.ts` | Реэкспорт `WeibullParams`, `LogisticParams`, `S4Config`, `S5LogisticParams`, `S6LogisticParams`, `S7Thresholds`, `NormalizeAllParams` |
| `index.ts` | Экспорт `DEFAULT_WEIBULL_PARAMS`, `DEFAULT_LOGISTIC_PARAMS`, `DEFAULT_S4_CONFIG`, `DEFAULT_S5_DESKTOP`, `DEFAULT_S5_MOBILE_TABLET`, `DEFAULT_S6_LOGISTIC_PARAMS`, `DEFAULT_S7_THRESHOLDS`, `fitWeibullMLE`, `fitLogisticMLE` |

| Файл | Изменение |
|---|---|
| `schemas/impression.ts` | `SignalsS6Schema` (19 полей), `s6` в `ImpressionPayloadSchema`, `'video_creative'` в enum |
| `schemas/calibration.ts` | `s6Min/Max` в `CalibrationFilterSchema`, `s6Normalized` в `CalibrationItemSchema` |
| `schemas/api.ts` | `s6_raw_completion_rate`, `s6_normalized` в `ImpressionRowSchema`; `configType`, `s6` в `WeightConfigRowSchema` |
| `scoring/weights.ts` | `s6` в `WeightsValues`/`SignalKey`; `CreativeCategory`; `DEFAULT_WEIGHTS` → `DEFAULT_BANNER_WEIGHTS` + `DEFAULT_VIDEO_WEIGHTS`; `computeEffectiveWeights` и `detectNullSignals` обновлены |
| `scoring/normalize.ts` | `normalizeS6()`; `NormalizedSignals` расширён `s6: number \| null`; `normalizeAll` вызывает `normalizeS6` |
| `scoring/score.ts` | S6 в `weightedSum` обеих функций; `s6_raw_completion_rate` в `ScoreResult`; импорт `DEFAULT_WEIGHTS` удалён |
| `access/impression-fields.ts` | `s6_normalized` в `USER_VISIBLE_IMPRESSION_FIELDS` |
| `types/index.ts` | Реэкспорт `SignalsS6`, `CreativeCategory` |
| `index.ts` | `SignalsS6Schema`, `normalizeS6`, `DEFAULT_BANNER_WEIGHTS`, `DEFAULT_VIDEO_WEIGHTS`, `detectNullSignals`; `DEFAULT_WEIGHTS` удалён из экспорта |

## Изменения, внесённые в сессию GIVT/SIVT

| Файл | Изменение |
|---|---|
| `schemas/ivt.ts` | **NEW** — `IvtVerdictSchema`, `IvtListEntrySchema`, `IvtThresholdsSchema`, `DEFAULT_IVT_THRESHOLDS`, `IvtListConfigRowSchema`, `IvtThresholdsConfigRowSchema` |
| `schemas/impression.ts` | `FP_HASH_REGEX`; `fp_hash` optional в `ImpressionPayloadSchema`; `event_intervals_ms: z.array().max(50).optional()` в `PresenceSchema` |
| `schemas/api.ts` | `ivt_verdict`, `ivt_category`, `ivt_confidence`, `score_reliable` в `ImpressionRowSchema`; `ivt_signals: z.unknown()` в `ImpressionDetailSchema` |
| `scoring/ivt.ts` | **NEW** — `classifyIvtSync()`, `checkRoboticTiming()`, `checkSyntheticCursor()`, `checkImpossibleEvents()`, `aggregateConfidence()`. Типы: `IvtSignal`, `IvtClassification` |
| `access/impression-fields.ts` | `ivt_verdict`, `ivt_category`, `ivt_confidence`, `score_reliable` в `USER_VISIBLE_IMPRESSION_FIELDS` |
| `types/index.ts` | Реэкспорт `IvtVerdict`, `IvtListEntry`, `IvtThresholds`, `IvtListConfigRow`, `IvtListConfigListResponse`, `IvtThresholdsConfigRow`, `IvtThresholdsConfigListResponse`, `IvtSignal`, `IvtClassification` |
| `index.ts` | `IvtVerdictSchema`, `IvtListEntrySchema`, `IvtThresholdsSchema`, `IvtListConfigRowSchema`, `IvtListConfigListResponseSchema`, `IvtThresholdsConfigRowSchema`, `IvtThresholdsConfigListResponseSchema`, `DEFAULT_IVT_THRESHOLDS`, `classifyIvtSync` |

## Изменения, внесённые в текущую сессию (frontend + publisher domain)

| Файл | Изменение |
|---|---|
| `schemas/api.ts` | **NEW** `PublisherDomainAggregateSchema` — контракт агрегата по площадке: `impressions_count`, `campaigns_count`, `avg_score`, `avg_s1`..`avg_s7` |
| `access/impression-fields.ts` | `publisher_domain` добавлен в `USER_VISIBLE_IMPRESSION_FIELDS` — user-роль получает поле в JSON и CSV |
| `types/index.ts` | Реэкспорт `PublisherDomainAggregate` |
| `index.ts` | `PublisherDomainAggregateSchema` добавлен в экспорты схем |

## Изменения, внесённые в предыдущую сессию

| Файл | Изменение |
|---|---|
| `schemas/user.ts` | `UserStatsRowSchema` — добавлено `tagUuid: z.string().uuid().nullable()` |
| `schemas/api.ts` | `ImpressionDetailSchema` — добавлены `lastRecalibratedAt?` и `lastRecalibratedWeightsVersion?` |
| `schemas/calibration.ts` | `CalibrationFilterSchema` — убрано `userUuid`, добавлены версии тега/весов и все 14 диапазонных параметров |
| `schemas/calibration.ts` | `CalibrationBatchSchema` — добавлено `expiresAt: z.string().nullable()` |
| `schemas/calibration.ts` | `CalibrationItemSchema` — добавлены `deviceType`, `s1Normalized`...`s7Normalized` |
| `schemas/calibration.ts` | Экспортирован тип `CalibrationFilters` в `types/index.ts` |
| `types/index.ts` | Добавлен реэкспорт `CalibrationFilters`, `UserStatsRow` (с `tagUuid`), `UserCampaignStatsRow`, `UserCampaignStatsListResponse` |