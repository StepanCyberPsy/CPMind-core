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
6. [Сигналы S1–S7 и F_Presence](#сигналы-s1s7-и-f_presence)
7. [Формулы нормализации](#формулы-нормализации)
8. [Формула CPMind Score](#формула-cpmind-score)
9. [IVT-классификация (scoring/ivt.ts)](#ivt-классификация-scoringivtts)
10. [Изменения, внесённые в сессию bug-fixing / signal modifications](#изменения-внесённые-в-сессию-bug-fixing--signal-modifications)

---

## Структура пакета

```txt
    ├── [DIR] shared
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [DIR] access
                ├── [FILE] impression-fields.ts
                ├── [FILE] measurement-level.ts
            ├── [FILE] index.ts
            ├── [DIR] schemas
                ├── [FILE] ad_session.ts
                ├── [FILE] api.ts
                ├── [FILE] asset.ts
                ├── [FILE] auth.ts
                ├── [FILE] calibration.ts
                ├── [FILE] creative.ts
                ├── [FILE] delivery.ts
                ├── [FILE] impression.ts
                ├── [FILE] ivt.ts
                ├── [FILE] omid.ts
                ├── [FILE] placement.ts
                ├── [FILE] player.ts
                ├── [FILE] simid.ts
                ├── [FILE] tag-constants.ts
                ├── [FILE] tag.ts
                ├── [FILE] upload.ts
                ├── [FILE] user.ts
                ├── [FILE] vast.ts
            ├── [DIR] scoring
                ├── [FILE] capping.ts
                ├── [FILE] ivt.ts
                ├── [FILE] logistic_mle_fit.ts
                ├── [FILE] normalize.ts
                ├── [FILE] score.ts
                ├── [FILE] segments.ts
                ├── [FILE] signal_defaults.ts
                ├── [FILE] weibull_mle_fit.ts
                ├── [FILE] weights.ts
            ├── [DIR] types
                ├── [FILE] index.ts
        ├── [FILE] tsconfig.json
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
- `skippable` — поле верхнего уровня. Для hosted-показа сервер использует значение из контекста размещения; для legacy-показа — значение payload. При выборе модели S6 дополнительно учитываются формат и подтип размещения.
- `publisher_domain` — домен площадки. SDK определяет его с учётом явно заданного домена, контекста верхнего окна, `ancestorOrigins`, `document.referrer` и резервного идентификатора `unknown_{hash}`. Для hosted-показа сервер дополнительно учитывает контекст рекламной сессии.
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
- `s2_model_version` — версия квантильной конфигурации S2
- `s3_model_version`, `s4_model_version`, `s5_model_version`, `s6_model_version`, `s7_model_version` — аналогично

- `measurement_mode: MeasurementModeSchema` — режим измерения показа
- `omid_access_mode: z.string().nullable()` — уровень доступа, фактически выданный плеером площадки показу `vast_omid`; пусто для остальных режимов
- `vast_delivery_kind: z.string().nullable()` — форма VAST-доставки: `inline` или `wrapper`

`score_final` и `f_presence` объявлены `.nullable()`: показ режима `vast_omid` с ограниченным доступом не имеет части сигналов, и композитная оценка для него не рассчитывается. Для всех остальных режимов значения обязательны — это гарантируют ограничения `chk_score_final_required` и `chk_f_presence_required` на уровне БД.

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

### `schemas/omid.ts`

Контракт показа, измеренного через OMID без доступа к странице издателя. Отдельная схема, а не расширение `ImpressionPayloadSchema`: основной путь приёма и его контракт остаются нетронутыми.

**`OmidPartialImpressionSchema`** — строгая схема с каноническими именами полей: `signals_raw` должен оставаться сопоставимым между режимами измерения. Содержит `omid_runtime_version`, `access_level`, `page_collectors_loaded`, идентификаторы показа и вложенный `signals` с S1, S2, S4, S5 и S6.

Набор сигналов здесь заведомо неполный: прокрутки, курсора и окружения рекламы в таких режимах не существует, поэтому S3, S5 в полном виде, S7 и присутствие отсутствуют **по построению, а не по ошибке**.

**`OmidAccessLevelSchema`** — уровень доступа, фактически выданный плеером: `full_page`, `creative`, `limited`, `not_executed`. `page_collectors_loaded: false` при полном уровне означает, что ветка коллекторов не догрузилась — такой показ не выдаётся за полное измерение.

### `schemas/simid.ts`

Контракт отчёта интерактивного креатива SIMID 1.2. **Не входит в публичный экспорт пакета** — задел не подключён к продукту, подробности в [`OMID_LOGIC.md`](./OMID_LOGIC.md).

---

## Скоринг (scoring/)

### `signal_defaults.ts` (новый) — интерфейсы и дефолтные параметры моделей

Единственный источник истины для типов и дефолтных параметров всех параметрических моделей. Используется в: `normalize.ts`, `score.ts`, всех backend-сервисах моделей, всех recalibration jobs.

```typescript
// S1 — Weibull CDF
interface WeibullParams { k: number; lambda: number }
const DEFAULT_WEIBULL_PARAMS: WeibullParams = { k: 1.0, lambda: 5.0 }

```

Параметры остальных моделей определены именованными полями, а не массивами:

- `WeibullParams`: `k`, `lambda`; резервное значение — `{ k: 1.0, lambda: 5.0 }`.
- `S2Params`: массивы `quantileLevels` и `quantileValues`; `DEFAULT_S2_PARAMS` задаёт опорные точки для кусочно-линейной CDF.
- `LogisticParams`: `beta0`…`beta7`, `featureMeans`, `featureStds`; нулевые коэффициенты дают S3 = 50.
- `S4Config`: `lambda`, `tRefMs`; `DEFAULT_S4_CONFIGS` содержит значения по сегментам и `default`.
- `S5LogisticParams`: `segmentKey`, `beta0`…`beta4`; отдельные стартовые параметры для `desktop` и `mobile_tablet`.
- `S6LogisticParams` — объединение `S6InstreamLogisticParams` и `S6OutstreamLogisticParams`, различаемых полем `mode`. Оба содержат `beta0`…`beta8`, средние и стандартные отклонения признаков. Резервные коэффициенты равны нулю.
- `S7Thresholds`: `relativeYLow`, `relativeYMid`, `clutterMid`, `clutterHigh`; значения по умолчанию заданы отдельно для desktop, mobile и tablet.

```typescript
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

Стартовые коэффициенты S5: desktop — `[-2.5, 3.8, 2.2, 0.8, 1.5]`, mobile/tablet — `[-2.0, 3.5, 2.8, 1.2, 0.9]`.

**Архитектурный принцип:** `signal_defaults.ts` не содержит математики — только типы и константы. Математика — в `normalize.ts`. Fitting-алгоритмы — в `weibull_mle_fit.ts` и `logistic_mle_fit.ts`. Backend-сервисы — в `services/weibull_config.ts` и т.д.

### `weibull_mle_fit.ts` (новый) — MLE для S1

```typescript
fitWeibullMLE(times: number[], tolerance = 1e-6, maxIterations = 100): WeibullFitResult
```

Newton-Raphson итерация по log-likelihood Weibull-распределения. Входные данные: массив `time_in_view_sec` из `impressions` для конкретного сегмента. Функция пробует стартовые значения `k` 0.1, 1 и 10 и выбирает результат с наибольшим log-likelihood. По умолчанию допускается до 100 итераций с точностью `1e-6`. Результат содержит `k`, `lambda`, `logLikelihood`, `sampleSize`, `converged`; при недостаточном числе положительных наблюдений или неудаче всех стартов выбрасывается ошибка.

Живёт в shared (а не только в backend), потому что может понадобиться в тестах и валидации — но используется runtime только в `jobs/s1_weibull_recalibration.ts`.

### `logistic_mle_fit.ts` (новый) — IRLS для S3/S5/S6

```typescript
fitLogisticMLE(X: number[][], y: number[], tolerance = 1e-6, maxIterations = 100, l2Lambda = 0): LogisticFitResult
```

IRLS (Iteratively Reweighted Least Squares) — численно стабильный алгоритм для логистической регрессии малой размерности. `X` — матрица признаков (уже нормализованных z-score), `y` — бинарные метки `0|1`. Результат включает коэффициенты `beta`, `logLikelihood`, `sampleSize`, `accuracy` и `converged`. По умолчанию выполняется до 100 итераций с точностью `1e-6`; доступен L2-штраф. Непригодные входные данные приводят к ошибке.

Специфично для каждого сигнала:
- S3: 8 признаков, `tag_constants_version` фильтр при выборке данных
- S5: 5 признаков, раздельный fitting для `desktop` и `mobile_tablet`
- S6: 9 компонентов вектора, включая свободный член и interaction term `completionZ × audibleZ`; признак отказа отличается для in-stream и out-stream.

### `capping.ts` — `applyAnomalyCapping()`

Обрезка экстремальных значений сигналов перед нормализацией. Вызывается **строго до** `normalizeAll()`. Не мутирует входной payload: копия создаётся через `JSON.parse(JSON.stringify(payload))`.

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

**`normalizeS2(s2Raw, params: S2Params): number`**

`S2 = 100 × F(share_of_screen_avg_pct)`, где `F` — кусочно-линейная интерполяция опорных квантилей. Результат ограничивается диапазоном `[0, 100]`. Если массивы параметров имеют разную длину или меньше двух точек, используется `DEFAULT_S2_PARAMS`. Резервные точки построены по прежней корневой зависимости; между точками применяется линейная интерполяция.

**`normalizeS3(s3Raw, logisticParams: LogisticParams): number | null`**

Логистическая регрессия: `S3 = min(100, sigmoid(β·x) × 100)`. Вектор признаков `x = [1, speedZ, stddevZ, pauseZ, directionZ, streakZ, reading, momentum]` (8 компонентов). Z-score нормализация: `x_norm = (x − μ) / σ` по `featureMeans` / `featureStds` параметра. Возвращает `null` при `s3Raw === null` (cross-domain iframe).

**`normalizeS4(s4Raw, s4Config: S4Config): number`**

Нелинейная функция: `S4 = clamp(activeRatio × 100 × exp(−λ×n) × min(1, avgSession/T_ref), 0, 100)`, где:
- `activeRatio = tab_active_time_ms / tab_total_time_ms`
- `n = tab_switches_count`
- `avgSession = tab_active_time_ms / max(1, n+1)` (средняя длина активной сессии)
- `λ` — штрафной параметр за частоту переключений (из `s4Config.lambda`)
- `T_ref` — эталонная длина сессии в мс (из `s4Config.tRefMs`)

Fallback: `DEFAULT_S4_CONFIGS.default = {lambda: 0.08, tRefMs: 5000}`.

**`normalizeS5(s5Raw, s5Params: S5LogisticParams): number`**

Логистическая регрессия с сегментацией по device_type. 2 сегмента: `desktop`, `mobile_tablet`.

Desktop-вектор: `x = [1, clicked, hoverDurationNorm, hoverCountNorm, proximityNorm]`
- `hoverDurationNorm = min(1, log(hover_duration_max_ms + 1) / log(10001))` — log-нормализация с clamp-guard (предотвращает выход >1 при аномальных значениях)

Mobile/tablet-вектор: `x = [1, clicked, zoom, tapCountNorm, swipeCountNorm]`
- `tapCountNorm = min(1, tap_count / 5)`, `swipeCountNorm = min(1, swipe_count / 3)`

`S5 = min(100, round(sigmoid(β·x) × 100))`. Fallback по сегменту: `DEFAULT_S5_DESKTOP` / `DEFAULT_S5_MOBILE_TABLET` (prior-коэффициенты, обоснованные экспертно).

**`normalizeS6(s6Raw: SignalsS6 | null, s6Params: S6LogisticParams): number | null`**

Для баннера при `s6Raw === null` возвращается `null`. Для видео выбирается функция по `params.mode`: `normalizeS6Instream` или `normalizeS6Outstream`. Общие признаки — нормализованные досмотр, достигнутый квартиль, доля времени со звуком и `log(1 + replay_count)`, а также `muted_throughout`, `unmuted_by_user` и взаимодействие `completionZ × audibleZ`. Коэффициент `beta7` учитывает `skipped` в in-stream и `closed_by_user` в out-stream. При отсутствии длительности доля времени со звуком равна нулю; иначе она ограничена `[0, 1]`.

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

**`normalizeAll(payload, weibullParams, s2Params, s3Params, s4Config, s5Params, s6Params, s7Thresholds): NormalizedSignals`**

Вызывает семь функций нормализации с переданными параметрами. В результате `s3` и `s6` могут быть `null`.

**`getS5TopEventLabel(s5)`** — без изменений. Текстовая метка наивысшего события для таблицы.

### `weights.ts` — веса и перераспределение

**`DEFAULT_BANNER_WEIGHTS`** — стартовые веса для баннеров `v1.0_uncalibrated_banner`: s6: 0.00, сумма 1.0. S6 с нулевым весом не перераспределяется при null (добавляет 0 к availableSum).

**`DEFAULT_VIDEO_WEIGHTS`** — стартовые веса для видео `v1.0_uncalibrated_video`: s6: 0.40, s1: 0.15, s2: 0.10, s3: 0.10, s4: 0.10, s5: 0.10, s7: 0.05, сумма 1.0.

**`CreativeCategory`** = `'banner' | 'video' | 'video_instream' | 'video_outstream'`. Для каждой категории задан отдельный профиль; стартовые значения трёх видеопрофилей совпадают.

**`WeightsValues`** и **`SignalKey`** расширены `s6`.

Используется как fallback в `getActiveWeightsConfig()`, если таблица `weight_configs` пуста. Не влияет на новые показы, пока в таблице есть хотя бы одна активная версия.

**`computeEffectiveWeights(nullSignals, weights)`** — перераспределение весов при `null`-сигналах (§6.2):

```
availableSum = сумма весов доступных сигналов (без nullSignals)
if availableSum === 0: все веса = 0 (edge case, Score будет 0)
effectiveWeight[key] = nullSet.has(key) ? 0 : weights[key] / availableSum
```

Сумма эффективных весов равна 1.0 при положительной сумме доступных весов; иначе все эффективные веса равны нулю. `null` допускается для S3 и S6.

**`detectNullSignals(normalized)`** — возвращает массив ключей сигналов со значением `null`. Детектирует S3 (cross-domain iframe) и S6 (banner creative). Оба случая приводят к перераспределению весов через `computeEffectiveWeights()`.

### `segments.ts` — сегменты S6

`resolveS6PlacementGroup` выделяет `instream_skippable`, `instream_non_skippable`, `outstream_sticky`, `outstream_inpage`. `resolveS6SegmentKeys` формирует порядок выбора: группа и устройство → режим и устройство → общий сегмент режима → совместимый прежний сегмент устройства и признака пропуска. Для legacy-показа без формата возвращается только прежний сегмент.

### `score.ts` — расчёт Score

**`computeScore(payload, weights, weibullParams, s2Params, s3Params, s4Config, s5Params, s6Params, s7Thresholds, presenceIdleThresholdMs)`**:
1. `computeEffectiveWeights(detectNullSignals(normalized), weights)` — перераспределение при null (S3 и/или S6)
2. Взвешенная сумма по всем 7 сигналам: `S1×w1 + S2×w2 + S3×w3 + S4×w4 + S5×w5 + S6×w6 + S7×w7`
3. `F_Presence`: 0 если `time_since_last_event_ms > presenceThresholdMs`, иначе 1
4. `Score = взвешенная_сумма × F_Presence`

`presenceThresholdMs` — параметр, не захардкоженная константа. Backend передаёт значение из активной версии констант тега (`PRESENCE_IDLE_TIMEOUT_MS`) — синхронизация через общий источник, не дублирование.

**`recomputeScoreFromNormalized(normalized, fPresence, fIvt, weights)`** — упрощённый пересчёт для калибровки:
- Принимает уже нормализованные значения и уже вычисленный `fPresence` из базы данных
- **Не** повторяет кэппинг и нормализацию — они не зависят от весов и не изменились
- Учитывает переданный `fIvt` и возвращает `{ score_final, effective_weights }`; версия весов обновляется вызывающим сервисом

Используется **только** в `services/calibrations.ts → processCalibrationBatch()`.

---

## Контроль доступа (access/)

### `access/impression-fields.ts`

**`USER_VISIBLE_IMPRESSION_FIELDS`** — единственный whitelist полей импрешена для роли `user`. Определён один раз, используется в двух местах:
- Backend: `GET /api/impressions` и `/export/csv` (фильтрация JSON-ключей в ответе)
- Frontend: типизация отображаемых полей

**`UserImpressionRowSchema`** — производный через `ImpressionRowSchema.pick(USER_VISIBLE_IMPRESSION_FIELDS)`. Не отдельно поддерживаемая копия — изменение whitelist автоматически меняет схему.

`signals_raw`, `signals_normalized`, детальные флаги (`no_events`, `tab_mostly_hidden`, `anomaly_duration`), `fp_hash`, `ivt_signals` — недоступны роли `user`. Доступны: основные метаданные, S1–S7 raw и normalized, `s6_normalized`, `score_final`, `is_suspicious`, `ivt_verdict`, `ivt_category`, `ivt_confidence`, `score_reliable`, `publisher_domain`.

### `access/measurement-level.ts`

**`resolveMeasurementLevel(row)`** — полнота измерения показа в терминах кабинета: `full` или `partial`.

Показ режима `vast_omid` существует в двух видах. Если плеер площадки выдал скрипту верификации полный доступ к странице и ветка коллекторов подключилась, показ собирается штатным рантаймом и приходит на основную точку приёма со всеми семью сигналами и композитным Score. Если доступ ограничен уровнем креатива или ниже, прокрутки и окружения рекламы на странице не существует, S3 и S7 не измеряются, а веса предполагают полный набор — композитный Score в таком показе не рассчитывается.

Дискриминатор — **наличие `score_final`, а не режим измерения**: ограничение `chk_score_final_required` допускает пустое значение исключительно для `vast_omid`, так что обратное невозможно. Выводить уровень из `measurement_mode` было бы неверно — один и тот же режим даёт оба исхода.

`MEASUREMENT_LEVEL_LABELS` и `MEASUREMENT_LEVEL_HINTS` — подписи и пояснения. Пояснение показывается рядом с пустыми значениями: иначе частичный показ неотличим от сбойного, пустые S3, S7 и Score выглядят как потеря данных.

Уровень выводится из `score_final`, которое уже входит в `USER_VISIBLE_IMPRESSION_FIELDS`, поэтому расширения пользовательского контракта не требуется. Диагностические поля `measurement_mode`, `omid_access_mode` и `vast_delivery_kind` в whitelist роли `user` намеренно не входят — внутренние идентификаторы режимов и уровней доступа OMID в кабинет не отдаются.

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

Нормализация: **логистическая регрессия**; для S3 все баннерные типы объединены в группу `static`, видео — в `video`. Параметры выбираются с учётом устройства и версии констант.

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

Нормализация: **логистическая регрессия**, 2 сегмента (`desktop`, `mobile_tablet`), параметры из `s5_logistic_configs`. Параметры метки обучения и показатели качества сохраняются вместе с конфигурацией модели.

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

### S2 — квантильная CDF

```
S2 = clamp(100 × F(share_of_screen_avg_pct), 0, 100)
```

`F` интерполирует опорные точки активной конфигурации `S2Params`; при непригодных массивах используются точки `DEFAULT_S2_PARAMS`.

### S3 — логистическая регрессия

```
x = [1, speedZ, stddevZ, pauseZ, directionZ, streakZ, reading, momentum]
S3 = min(100, sigmoid(β · x) × 100)
```

Количественные признаки нормализуются по среднему и стандартному отклонению модели; при нулевом отклонении соответствующее значение равно нулю. При `s3 = null` результат также `null`.

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
  hoverCountNorm    = min(hover_count, 10) / 10
  proximityNorm     = 1 − min(cursor_proximity_min_px, 200) / 200  (или 0 при null)

Mobile/tablet:
  x = [1, clicked, zoom, tapCountNorm, swipeCountNorm]
  tapCountNorm   = min(1, tap_count / 5)
  swipeCountNorm = min(1, swipe_count / 3)

S5 = min(100, round(sigmoid(β · x) × 100))
```

### S6 — логистические модели in-stream и out-stream

```
quartileOrd = 100 | 75 | 50 | 25 | 10 | 0
completion = completion_rate_pct ?? quartileOrd
audibleRatio = clamp(audible_time_sec / duration_sec, 0, 1)
replay = log(1 + replay_count)

z = β0 + β1·completionZ + β2·quartileZ + β3·audibleZ
  + β4·muted_throughout + β5·unmuted_by_user + β6·replayZ
  + β7·отказ + β8·completionZ·audibleZ
S6 = min(100, sigmoid(z) × 100)
```

При отсутствии положительной длительности `audibleRatio = 0`. Признак отказа — `skipped` для in-stream и `closed_by_user` для out-stream. При `s6 = null` результат равен `null`.

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

### `schemas/creative.ts`

Перечисления типов creative-объектов. Используются как общие зависимости для `impression.ts`, `delivery.ts`, `placement.ts`, `upload.ts`.

**`CreativeTypeSchema`** — `z.enum(['banner_static', 'banner_gif', 'banner_html5', 'video_creative'])`. Единственный источник истины для типов — используется в DB enum, Zod-валидации и TypeScript типизации.

**`CreativeStatusSchema`** — `z.enum(['draft', 'processing', 'ready', 'active', 'archived', 'failed'])`.

**`DeviceTypeSchema`** — `z.enum(['desktop', 'mobile', 'tablet'])`.

---

### `schemas/asset.ts`

Типы и схемы ассетов (обработанных медиафайлов).

**`AssetClassSchema`** — `z.enum(['source', 'image', 'animated_image', 'video', 'video_poster', 'html_file', 'svg'])`. Используется media-worker для классификации выходных файлов при обработке.

**`AssetStatusSchema`** — `z.enum(['pending', 'ready', 'failed'])`.

**`AudioConnectionSchema`** — `z.enum(['bluetooth', 'wired_headphones', 'built_in_speaker', 'external_speaker', 'unknown', 'none'])`. Используется в S6 accumulator для фиксации типа аудиовыхода. Детектируется через `navigator.mediaDevices.enumerateDevices()` в player и tag.

**`AssetRowSchema`** — полная схема ассета для API-ответа. Ключевые поля: `sha256` (char 64, content-addressed), `storage_key` (path в Object Storage), `asset_class`, `width/height/duration_sec/codec/bitrate_bps` (null для нерелевантных типов).

---

### `schemas/delivery.ts`

Контракты delivery-контура: режимы, идентификаторы, конфигурация runtime.

**`DeliveryModeSchema`** — `z.enum(['display', 'instream_preroll', 'instream_midroll', 'instream_postroll', 'outstream', 'standalone_video'])`. Соответствует полю `mode` в `placements`.

**`MeasurementModeSchema`** — `z.enum(['full_direct_display', 'full_cpmind_player', 'partial_embedded_iframe', 'vast_only', 'legacy_tag'])`. Определяет какой SDK-путь использовался при измерении. Устанавливается backend при генерации embed script, хранится в `ad_sessions` и `impressions`.

**`MeasurementFinalizationReasonSchema`** — `z.enum(['complete', 'skip', 'close', 'timeout', 'error', 'page_unload', 'idle', 'creative_removed', 'destroyed'])`. Причина завершения SDK measurement session. Маппинг из `PlayerTerminalOutcome` выполняется в `sdk_bridge.ts`.

**`AdSessionIdSchema`** — `z.string().uuid().brand<'AdSessionId'>()`. Идентификатор выдаётся сервером; в in-stream конфигурации `adSessionId` первоначально равен `null` и запрашивается при рекламной вставке.

**`PlayerTimeoutsSchema`** — объект с 6 таймаутами (все `z.number().int().positive()`):

| Поле | Default | Назначение |
|---|---|---|
| `configRequestMs` | 5 000 | Запрос runtime конфига |
| `vastRequestMs` | 8 000 | VAST XML fetch |
| `mediaStartMs` | 15 000 | Начало воспроизведения |
| `firstFrameMs` | 10 000 | Первый video frame |
| `contentHandoffMs` | 5 000 | Передача управления content video |
| `adLoadTotalMs` | 30 000 | Полный цикл загрузки ad |

Defaults совпадают с seed `delivery_runtime_configs v1.0` в БД и с `DEFAULT_PLAYER_TIMEOUTS` в `@cpmind/sdk`.

**`DeliveryRuntimeConfigSchema`** — полная конфигурация, передаваемая от backend через embed script в `window.__CPMIND_QUEUE__`. Используется display-runtime, player и embed loader. Ключевые поля:

- `adSessionId` — branded `AdSessionId` или `null` для отложенной выдачи in-stream
- `placementUuid`, `deliveryToken`, `creativeVersionUuid`, `creativeType`, `deliveryMode`
- `tagUuid`, `tagConstantsVersion`, `tagConstants` — для impression payload и S1–S7
- `collectEndpoint`, `deliveryEventEndpoint`, `sessionEndpoint`, `advanceEndpoint` — адреса сбора, событий, выдачи сессии и перехода к следующему ролику
- `format`, `subtype`, `slotId`, `videoSelector` и параметры sticky — конфигурация размещения
- `vastUrl` — URL для VAST fetch (null для display)
- `clickUrl`, `width`, `height`, `plcmt`, `autoplay`, `initialMuted`, `skippable`, `skipOffsetSec`
- `timeouts` — `PlayerTimeoutsSchema`

**`DeliveryTimingSchema`** — диагностические тайминги доставки (опционально в `ImpressionPayloadSchema`): `requested_at`, `creative_ready_at`, `render_confirmed_at`, `load_duration_ms`.

---

### `schemas/placement.ts`

Схемы для управления placement'ами через панель.

**`PlcmtSchema`** — `z.number().int().min(1).max(5)`. IAB OpenRTB значения: 1=In-Stream, 2=In-Banner, 3=In-Article, 4=In-Feed, 5=Interstitial.

**`AutoplayModeSchema`** — `z.enum(['autoplay', 'click_to_play'])`.

**`CreatePlacementPayloadSchema`** — обязательные: `campaignUuid`, `creativeUuid`, `mode`. Формат и подтип могут передаваться явно; `initialMuted` при отсутствии выводится сервером из режима, `skippable` по умолчанию равен `false`. `allowedDomains` содержит проверяемые домены длиной до 253 символов.

**`UpdatePlacementPayloadSchema`** — все поля опциональны; refine: хотя бы одно поле должно быть предоставлено. `PlacementCreativeSetSchema` допускает до 20 уникальных креативов с суммой весов 100% и погрешностью 0,01; пустой набор снимает ротацию. Доступны `weighted_random` и `sequential`, а для доменов — режимы `off`, `monitor`, `block`.

**`PlacementRowSchema`** — контракт детального ответа API. Включает `deliveryToken` (min 32), `embedCode`/`vastUrl` генерируются на сервере и не входят в схему (добавляются сервисом `placements.ts`).

---

### `schemas/upload.ts`

Схемы upload pipeline: создание сессии, presigned URLs, завершение.

**`MAX_UPLOAD_SIZE_BYTES`** — `2 * 1024 * 1024 * 1024` (2 GB). Константа — граница валидации `sizeBytes` при создании сессии и максимальный размер файла принимаемый media-worker.

**`CreateUploadPayloadSchema`** — `campaignUuid`, `creativeType`, `filename` (без путей, FILENAME_REGEX), `sizeBytes` (max `MAX_UPLOAD_SIZE_BYTES`), `mimeType` (MIME_TYPE_REGEX).

**`UploadSessionResponseSchema`** — discriminated union по `strategy`:
- `'single'`: `uploadId`, `uploadUrl`, `expiresAt`
- `'multipart'`: `uploadId`, `parts: UploadPartPresignedUrlSchema[]`, `expiresAt`

Порог переключения на multipart: `MULTIPART_THRESHOLD_BYTES = 100 MB` (определён в `services/storage/presign.ts`).

**`CompleteUploadPayloadSchema`** — `parts: CompleteMultipartPartSchema[]` (min 1). Для single upload тело пустое — валидация в route.

**`UploadSessionStatusSchema`** — ответ polling endpoint. `creativeVersionUuid` возвращается только при `status = 'ready' | 'failed'`.

---

### `schemas/ad_session.ts`

Схемы рекламных сессий (ad_sessions в БД) и delivery events.

**`AdSessionIdentitySchema`** — контекст идентификации сессии для SDK. Передаётся в `adSessionIdentity` поле `SessionPayloadMeta`. Поля: `adSessionId` (branded), `placementUuid`, `creativeVersionUuid` (nullable), `creativeType`, `deliveryMode`, `measurementMode`.

**`AdSessionPlayerErrorCodeSchema`** — enum кодов диагностики player:
```
CONFIG_FETCH_FAILED, VAST_FETCH_FAILED, VAST_XML_INVALID, VAST_STRUCTURE_UNSUPPORTED,
NO_SUPPORTED_MEDIA, MEDIA_LOAD_FAILED, MEDIA_PLAYBACK_BLOCKED, MEDIA_START_TIMEOUT,
FIRST_FRAME_TIMEOUT, CONTENT_BRIDGE_FAILED, CONTENT_RESUME_FAILED, PLAYER_DESTROYED
```

**`AdSessionDeliveryEventTypeSchema`** — события `requested`, `asset_load_started`, `creative_ready`, `render_confirmed`, `autoplay_resolved`, `measurement_started`, `creative_error`, `player_error`, `closed`.

**`DeliveryEventPayloadSchema`** — payload `POST /api/delivery/event`: идентификатор, тип, положительная метка времени и необязательные детали. Для `autoplay_resolved` обязательны `autoplayOutcome`, `startMuted`, `mutedByBrowser`; в других событиях эти поля запрещены. Причина финализации допустима только в терминальных событиях, код ошибки — только в событиях ошибки.

**`AdSessionPlaybackQualitySchema`** — `{ dropped_frames, total_frames }` с refine `dropped_frames <= total_frames`. Хранится в `ad_sessions.playback_quality` (JSONB).

**`AdSessionRowSchema`** — полная схема строки `ad_sessions` для API-ответа. Включает все timestamp-поля (`requestedAt`, `assetLoadStartedAt`, `creativeReadyAt`, `renderConfirmedAt`, `measurementStartedAt`, `measurementEndedAt`, VAST-тайминги, `errorAt`), `autoplayOutcome`, `publisherDomain`, `playerRuntimeVersion`, `sdkRuntimeVersion`.

---

### `schemas/player.ts`

Схемы для типизации Player и SDK measurement events. Используются в `@cpmind/player`, `@cpmind/sdk`, `@cpmind/display-runtime`.

**`PlayerActionSourceSchema`** — `z.enum(['user', 'player', 'browser', 'programmatic', 'unknown'])`. Источник действия для атрибуции в S6 accumulator.

**`PlayerLifecycleStateSchema`** — `z.enum(['idle', 'preparing', 'requesting_vast', 'loading_media', 'ready', 'playing', 'paused', 'completed', 'skipped', 'errored', 'handing_off', 'destroyed'])`.

**`PlayerTerminalOutcomeSchema`** — discriminated union по `type`:

| `type` | Доп. поля | Причина |
|---|---|---|
| `completed` | — | Видео досмотрено |
| `skipped` | `source` | Нажата skip кнопка |
| `closed` | `source` | Нажат close |
| `failed` | `errorCode` | Ошибка загрузки/воспроизведения |
| `timed_out` | `errorCode` | Timeout |
| `page_unloaded` | — | pagehide event |
| `creative_removed` | — | MutationObserver: creative удалён из DOM |
| `destroyed` | — | Явный вызов destroy() |

Все варианты `.strict()` — исключает лишние поля.

**`VideoMeasurementEventSchema`** — discriminated union по `type` для SDK `reportVideoEvent()`. Типы: `play`, `pause`, `resume`, `progress`, `seek`, `mute`, `unmute`, `volume`, `skip`, `close`, `complete`, `replay`, `duration_known`, `quartile`, `audio_connection`, `viewport_enter`, `viewport_exit`. Все с полем `timestampMs` (`performance.now()`, не `Date.now()`). Refine на `progress`: `currentTimeSec <= durationSec + 0.5`.

---

### `schemas/vast.ts`

Полный набор схем для VAST 4.3 InLine. Используется в player (парсинг), backend (генерация), frontend (типизация).

**Ключевые схемы:**

**`VastTrackingRequestSchema`** — нормализованный запрос к CPMind VAST tracking endpoint (`GET /t/vast/:event`): `event`, `sid` (branded `AdSessionId`), `code` (только для `error`). Refine: `code` обязателен для `error`, запрещён для остальных.

**`VastLinearTrackingEventTypeSchema`** — полный VAST 4.3 enum: `creativeView`, `start`, `firstQuartile`, `midpoint`, `thirdQuartile`, `complete`, `progress`, `pause`, `resume`, `rewind`, `mute`, `unmute`, `skip`, `closeLinear`, `fullscreen`, `exitFullscreen`, `playerExpand`, `playerCollapse`, `acceptInvitationLinear`, `otherAdInteraction`, `notUsed`.

**`VastErrorCodeSchema`** — IAB VAST 4.3 numeric error codes (100–901).

**`VastTimeOffsetSchema`** — discriminated union: `{ kind: 'seconds', value }` или `{ kind: 'percent', value }`. Используется для `skipoffset` и `progress` tracking offset.

**`VastTrackingResourceSchema`** — tracking event с refine: `progress` требует `offset !== null`, остальные требуют `offset === null`.

**`VastMediaFileSchema`** — полная схема MediaFile с refine: `minBitrateKbps` и `maxBitrateKbps` должны быть предоставлены вместе, `min <= max`.

**`VastParsedAdSchema`** — нормализованный InLine ad: `vastVersion: '4.3'`, `format: 'inline'`, `adType: 'video'`. Включает `adVerifications` (OMID, parsed but not executed in v1). Все поля `.strict()`.

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
| `ad_session_id` | `AdSessionIdSchema.optional()` | Ссылка на `ad_sessions` для hosted creative flow |
| `placement_uuid` | `z.string().uuid().optional()` | UUID placement для cross-referencing |
| `creative_version_uuid` | `z.string().uuid().optional()` | UUID creative version |
| `delivery_mode` | `DeliveryModeSchema.optional()` | Режим доставки |
| `measurement_mode` | `MeasurementModeSchema.optional()` | Режим измерения SDK |
| `delivery_timing` | `DeliveryTimingSchema.optional()` | Диагностические тайминги |
| `finalization_reason` | `MeasurementFinalizationReasonSchema.optional()` | Причина завершения сессии |

Все поля опциональны — backward совместимость с legacy tag payload (без hosted delivery контекста).

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

## Изменения, внесённые в сессию hosted creative delivery

| Файл | Изменение |
|---|---|
| `schemas/creative.ts` | **NEW** — `CreativeTypeSchema` (перенесён из impression.ts, добавлен как отдельный модуль), `CreativeStatusSchema`, `DeviceTypeSchema` |
| `schemas/asset.ts` | **NEW** — `AssetClassSchema`, `AssetStatusSchema`, `AudioConnectionSchema` (перенесён из scoring), `AssetRowSchema` |
| `schemas/delivery.ts` | **NEW** — `DeliveryModeSchema`, `MeasurementModeSchema`, `MeasurementFinalizationReasonSchema`, `AdSessionIdSchema` (branded UUID), `PlayerTimeoutsSchema`, `DeliveryRuntimeConfigSchema`, `DeliveryTimingSchema` |
| `schemas/placement.ts` | **NEW** — `PlcmtSchema`, `AutoplayModeSchema`, `PlacementRowSchema`, `CreatePlacementPayloadSchema` (defaults: `initialMuted=true`, `skippable=false`), `UpdatePlacementPayloadSchema` (refine: min 1 поле), `PlacementListResponseSchema`, `PlacementUuidParamSchema` |
| `schemas/upload.ts` | **NEW** — `MAX_UPLOAD_SIZE_BYTES` (2 GB), `UploadStatusSchema`, `UploadStrategySchema`, `CreateUploadPayloadSchema`, `UploadSessionResponseSchema` (discriminated union single/multipart), `CompleteMultipartPartSchema`, `CompleteUploadPayloadSchema`, `UploadSessionStatusSchema` |
| `schemas/ad_session.ts` | **NEW** — `AdSessionIdentitySchema`, `AdSessionAutoplayOutcomeSchema`, `AdSessionPlayerErrorCodeSchema`, `AdSessionPlaybackQualitySchema` (refine: dropped≤total), `AdSessionDeliveryEventTypeSchema`, `DeliveryEventPayloadSchema`, `AdSessionRowSchema` |
| `schemas/player.ts` | **NEW** — `PlayerActionSourceSchema`, `PlayerLifecycleStateSchema`, `PlayerTerminalOutcomeSchema` (discriminated union, 8 вариантов, все `.strict()`), `VideoMeasurementEventSchema` (discriminated union, 14 событий, refine на progress) |
| `schemas/vast.ts` | **NEW** — полный набор VAST 4.3 схем: `VastTrackingRequestSchema` (refine: code только для error), `VastTrackingResourceSchema` (refine: offset только для progress), `VastMediaFileSchema` (refine: min/maxBitrate парные), `VastTimeOffsetSchema` (seconds/percent), `VastParsedAdSchema`, `VastVerificationSchema` (OMID), `VastErrorCodeSchema` (IAB коды 100–901) |
| `schemas/impression.ts` | Добавлены опциональные поля hosted delivery context: `ad_session_id` (branded), `placement_uuid`, `creative_version_uuid`, `delivery_mode`, `measurement_mode`, `delivery_timing`, `finalization_reason` — backward совместимы (legacy tag payload проходит без них) |
| `types/index.ts` | Реэкспорт всех типов из новых 7 schema файлов + VAST типы |
| `index.ts` | Экспорт всех схем и констант из новых файлов, включая `MAX_UPLOAD_SIZE_BYTES` (не Zod-схема, но публичная константа) |

**Новые блоки экспорта из `index.ts`:**

- `schemas/creative.ts` → `CreativeTypeSchema`, `CreativeStatusSchema`, `DeviceTypeSchema`
- `schemas/asset.ts` → `AssetClassSchema`, `AssetStatusSchema`, `AudioConnectionSchema`, `AssetRowSchema`
- `schemas/delivery.ts` → `DeliveryModeSchema`, `MeasurementModeSchema`, `MeasurementFinalizationReasonSchema`, `AdSessionIdSchema`, `PlayerTimeoutsSchema`, `DeliveryRuntimeConfigSchema`, `DeliveryTimingSchema`
- `schemas/placement.ts` → `PlcmtSchema`, `AutoplayModeSchema`, `PlacementRowSchema`, `CreatePlacementPayloadSchema`, `UpdatePlacementPayloadSchema`, `PlacementListResponseSchema`, `PlacementUuidParamSchema`
- `schemas/upload.ts` → `MAX_UPLOAD_SIZE_BYTES`, `UploadStatusSchema`, `UploadStrategySchema`, `CreateUploadPayloadSchema`, `UploadPartPresignedUrlSchema`, `UploadSessionResponseSchema`, `CompleteMultipartPartSchema`, `CompleteUploadPayloadSchema`, `UploadSessionStatusSchema`
- `schemas/ad_session.ts` → `AdSessionIdentitySchema`, `AdSessionAutoplayOutcomeSchema`, `AdSessionPlayerErrorCodeSchema`, `AdSessionPlaybackQualitySchema`, `AdSessionDeliveryEventTypeSchema`, `DeliveryEventPayloadSchema`, `AdSessionRowSchema`
- `schemas/player.ts` → `PlayerActionSourceSchema`, `PlayerLifecycleStateSchema`, `PlayerTerminalOutcomeSchema`, `VideoMeasurementEventSchema`
- `schemas/vast.ts` → все VAST схемы (см. структуру пакета)

**Новые типы в `types/index.ts`:**

- `CreativeType`, `CreativeStatus`, `DeviceType` из `schemas/creative.ts`
- `AssetClass`, `AssetStatus`, `AudioConnection`, `AssetRow` из `schemas/asset.ts`
- `DeliveryMode`, `MeasurementMode`, `MeasurementFinalizationReason`, `AdSessionId`, `PlayerTimeouts`, `DeliveryRuntimeConfig`, `DeliveryTiming` из `schemas/delivery.ts`
- `Plcmt`, `AutoplayMode`, `PlacementRow`, `CreatePlacementPayload`, `UpdatePlacementPayload`, `PlacementListResponse`, `PlacementUuidParam` из `schemas/placement.ts`
- `UploadStatus`, `UploadStrategy`, `CreateUploadPayload`, `UploadPartPresignedUrl`, `UploadSessionResponse`, `CompleteMultipartPart`, `CompleteUploadPayload`, `UploadSessionStatus` из `schemas/upload.ts`
- `AdSessionIdentity`, `AdSessionAutoplayOutcome`, `AdSessionPlayerErrorCode`, `AdSessionPlaybackQuality`, `AdSessionDeliveryEventType`, `DeliveryEventPayload`, `AdSessionRow` из `schemas/ad_session.ts`
- `PlayerActionSource`, `PlayerLifecycleState`, `PlayerTerminalOutcome`, `VideoMeasurementEvent` из `schemas/player.ts`
- Все VAST типы из `schemas/vast.ts`