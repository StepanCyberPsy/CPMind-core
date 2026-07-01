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
9. [Изменения, внесённые в эту сессию](#изменения-внесённые-в-эту-сессию)

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
    │   ├── auth.ts               # LoginSchema, MePayloadSchema
    │   ├── user.ts               # UserRoleSchema, UserUuidSchema, UserSchema,
    │   │                         # UserStatsRowSchema, CreateUserPayloadSchema,
    │   │                         # UpdateUserPayloadSchema
    │   ├── tag.ts                # TagUuidSchema, TagSchema, CreateTagPayloadSchema,
    │   │                         # UpdateTagPayloadSchema
    │   ├── api.ts                # ImpressionRowSchema, ImpressionDetailSchema,
    │   │                         # ImpressionListResponseSchema, WeightConfigRowSchema
    │   ├── calibration.ts        # CalibrationSelectionSchema (discriminated union),
    │   │                         # CalibrationBatchSchema, CalibrationItemSchema,
    │   │                         # ApproveCalibrationResultSchema и сопутствующие
    │   └── tag-constants.ts      # TagConstantsValuesSchema (19 полей),
    │                             # TagConstantsConfigSchema, DEFAULT_TAG_CONSTANTS,
    │                             # TAG_BUILD_TARGETS
    ├── scoring/
    │   ├── capping.ts            # applyAnomalyCapping()
    │   ├── normalize.ts          # normalizeS1–S7(), normalizeAll(), getS5TopEventLabel()
    │   ├── weights.ts            # DEFAULT_WEIGHTS, WeightsValues, computeEffectiveWeights(),
    │   │                         # detectNullSignals()
    │   └── score.ts              # computeScore(), recomputeScoreFromNormalized()
    ├── access/
    │   └── impression-fields.ts  # USER_VISIBLE_IMPRESSION_FIELDS, UserImpressionRowSchema
    └── types/
        └── index.ts              # re-export всех TypeScript-типов (export type)
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

**`ImpressionRowSchema`** — строка в таблице импрешенов. Содержит все поля для отображения в таблице, включая денормализованные `tag_uuid`, `user_uuid`, `tag_label`, `user_login`, `tag_constants_version`. Добавлены в эту сессию относительно исходной версии: `tag_constants_version`, `weights_version`, `s1_normalized`...`s7_normalized` как отдельные числовые колонки (для сортировки и фильтрации по диапазону без парсинга JSONB).

**`ImpressionDetailSchema`** — расширяет `ImpressionRowSchema`. Добавляет:
- `signals_raw: z.unknown()` — полный JSONB payload от тега
- `signals_normalized: z.unknown()` — нормализованные значения в JSONB
- `lastRecalibratedAt?: z.string()` — дата последнего подтверждённого пересчёта (опциональная, добавлена в эту сессию)
- `lastRecalibratedWeightsVersion?: z.string()` — версия весов при последнем пересчёте (опциональная, добавлена в эту сессию)

**`WeightConfigRowSchema`** — версия конфигурации весов: `id`, `version`, `weights` (объект `{s1, s2, s3, s4, s5, s7}`), `description`, `isActive`, `createdAt`.

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
| `S1_VIEWPORT_THRESHOLDS` | Пороги IntersectionObserver для S1 |
| `ENTROPY_ANGLE_THRESHOLD` | Порог энтропии траектории мыши (S5) |
| `GESTURE_SCALE_DELTA_MIN` | Минимальная дельта масштаба gesturechange (S5, mobile) — добавлена по итогам P-18 |
| `PROXIMITY_TRACK_ZONE_PX` | Зона отслеживания близости курсора (S5) |
| `PRESENCE_IDLE_TIMEOUT_MS` | Порог простоя для F_Presence и сегментации показа |

`EVENT_TYPES` и `AD_SELECTORS` сознательно **не** калибруются и не входят в этот список.

---

## Скоринг (scoring/)

### `capping.ts` — `applyAnomalyCapping()`

Обрезка экстремальных значений сигналов перед нормализацией (§6.3 ТЗ). Вызывается **строго до** `normalizeAll()`. Не мутирует входной payload: `structuredClone` создаёт полную копию.

### `normalize.ts` — формулы нормализации

Все функции pure, без side effects. Принимают сырые значения, возвращают нормализованные `[0, 100]`.

```
normalizeS1(time_in_view_sec):
  min(100, ln(time_in_view_sec + 1) / ln(11) * 100)

normalizeS2(share_of_screen_avg_pct):
  min(100, sqrt(share_of_screen_avg_pct) * 10)

normalizeS3(s3_raw): base_speed_score + pause_bonus + return_bonus
                     + reading_bonus - streak_penalty
  (возвращает null при s3_raw === null — cross-domain iframe)

normalizeS4(tab_active_time_ms, tab_total_time_ms):
  (tab_active_time_ms / tab_total_time_ms) * 100

normalizeS5(s5_raw): наивысший уровень взаимодействия (0-100)
  clicked=100, zoom=80, swipe=70, tap=60,
  hover_500ms=30, hover=20, proximity=10, none=0

normalizeS7(s7_raw): base_position + position_bonus
                     + clutter_penalty + persistence_bonus
```

`normalizeAll(capped)` — агрегатор: вызывает все шесть функций, возвращает `NormalizedSignals`.

`getS5TopEventLabel(s5)` — текстовая метка наивысшего события для отображения в таблице (`'clicked' | 'zoom' | 'swipe' | 'tap' | 'hover_500ms' | 'hover' | 'proximity' | 'none'`).

### `weights.ts` — веса и перераспределение

**`DEFAULT_WEIGHTS`** — стартовые веса `v1.0_uncalibrated`:

```
{ version: 'v1.0_uncalibrated', s1: 0.30, s2: 0.20, s3: 0.15, s4: 0.15, s5: 0.15, s7: 0.05 }
```

Используется как fallback в `getActiveWeightsConfig()`, если таблица `weight_configs` пуста. Не влияет на новые показы, пока в таблице есть хотя бы одна активная версия.

**`computeEffectiveWeights(nullSignals, weights)`** — перераспределение весов при `null`-сигналах (§6.2):

```
availableSum = сумма весов доступных сигналов (без nullSignals)
if availableSum === 0: все веса = 0 (edge case, Score будет 0)
effectiveWeight[key] = nullSet.has(key) ? 0 : weights[key] / availableSum
```

Сумма эффективных весов всегда равна 1.0. Единственный текущий `null`-сигнал — S3 при cross-domain iframe.

**`detectNullSignals(normalized)`** — возвращает массив ключей сигналов со значением `null`. На данный момент детектирует только S3.

### `score.ts` — расчёт Score

**`computeScore(normalized, presenceThresholdMs, weights)`**:
1. `computeEffectiveWeights(detectNullSignals(normalized), weights)`
2. Взвешенная сумма: `S1×w1 + S2×w2 + S3×w3 + S4×w4 + S5×w5 + S7×w7`
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

`signals_raw`, `signals_normalized`, детальные флаги (`no_events`, `tab_mostly_hidden`, `anomaly_duration`) — недоступны роли `user`. Доступны: основные метаданные, S1–S7 raw и normalized, `score_final`, `is_suspicious`.

---

## Сигналы S1–S7 и F_Presence

### S1 — Time-in-View (вес 0.30)

Суммарное время, в течение которого не менее 50% пикселей баннера находилось в видимой области экрана. Стандарт MRC: показ засчитывается при ≥1 секунды и ≥50% пикселей в viewport.

Реализация в теге: `IntersectionObserver` с порогами из `S1_VIEWPORT_THRESHOLDS` (дефолт `[0, 0.5, 1.0]`). Порог 50% для MRC-проверки захардкожен в логике, не калибруется. Накапливает: `time_in_view_sec`, `max_continuous_view_sec`, `visible_pixels_pct`.

### S2 — Share of Screen (вес 0.20)

Средняя доля видимой области экрана, которую занимал баннер во время показа. Один и тот же баннер 728×90 занимает разную долю экрана в зависимости от разрешения и DPI устройства.

Реализация: сэмплирование каждые `S2_SAMPLE_INTERVAL_MS` (дефолт 500 мс) через `getBoundingClientRect`.

### S3 — Scroll Velocity (вес 0.15)

Паттерн скролла в зоне ±`SCROLL_ZONE_PX` пикселей от баннера. Высокая скорость без пауз — механическое пролистывание. Медленный скролл с паузами и возвратами — чтение.

Реализация: rAF-throttled обработчик. Алгоритм Велфорда для бегущего mean/std_dev без накопления истории. 7 констант калибруемы.

**S3 = null** при cross-domain iframe (нет доступа к scroll-событиям). Вес перераспределяется через `computeEffectiveWeights()`.

### S4 — Tab Activity (вес 0.15)

Доля времени, когда вкладка с баннером была активна (не скрыта в фоне).

Реализация: `document.visibilitychange`. История состояний (`visibility_state_history`) — единственный источник для пересчёта active time строго в границах показа (фикс P-05: старый `Math.min` маскировал рассинхрон таймеров, не устранял его).

Флаг `tab_mostly_hidden = true` если активность < 20%.

### S5 — Interaction Events (вес 0.15)

Наивысший уровень взаимодействия пользователя с баннером. Иерархия (от высшего к низшему):
- `clicked` (100) — клик/тап по баннеру
- `zoom` (80) — масштабирование жестами (mobile)
- `swipe` (70) — свайп (mobile)
- `tap` (60) — тап без клика (mobile)
- `hover_500ms` (30) — наведение дольше 500 мс (desktop)
- `hover` (20) — любое наведение (desktop)
- `proximity` (10) — курсор в зоне `PROXIMITY_TRACK_ZONE_PX` (desktop)
- `none` (0) — нет взаимодействия

Desktop: click, mouseenter/leave/move, энтропия траектории. Mobile: touchstart/end/move, gesturechange + pinch.

Константы: `SWIPE_MIN_DISTANCE_PX` поднята с 30 до 60 по итогам P-18 (ложные срабатывания на случайных касаниях). `GESTURE_SCALE_DELTA_MIN` добавлена по итогам P-18 (срабатывание gesturechange без порога).

### S7 — Page Context (вес 0.05)

Контекст размещения баннера: позиция, высота страницы, конкурирующие баннеры, persistence видимости.

Формула: `base_position + position_bonus + clutter_penalty + persistence_bonus`.

Реализация: статические поля при инициализации + динамическое сэмплирование каждые `S7_SAMPLE_INTERVAL_MS` (дефолт 1000 мс).

### F_Presence — мультипликатор присутствия

Бинарный множитель (0 или 1). Обнуляет итоговый Score если пользователь перестал проявлять активность до конца показа.

**Условие F_Presence = 0:** `time_since_last_event_ms > PRESENCE_IDLE_TIMEOUT_MS` на момент финализации показа (сегмента). Скользящее окно — значение до простоя не учитывается; только факт простоя в конце.

**Синхронизация:** `PRESENCE_IDLE_TIMEOUT_MS` используется одновременно тегом (таймер разрыва сегмента) и backend (расчёт F_Presence). Backend резолвит значение из заявленной в payload версии констант — единый источник, не два независимых числа.

---

## Формулы нормализации

### S1

```
S1 = min(100, ln(t + 1) / ln(11) × 100)
```
где `t = time_in_view_sec`. Логарифмическая шкала: 0 сек → 0, 1 сек → ~47, 5 сек → ~83, 10 сек → 100.

### S2

```
S2 = min(100, sqrt(share_pct) × 10)
```
где `share_pct = share_of_screen_avg_pct`. Квадратный корень: 0% → 0, 1% → 10, 25% → 50, 100% → 100.

### S3

```
S3 = base_speed_score + pause_bonus + return_bonus + reading_bonus - streak_penalty
```
- `base_speed_score`: убывает при скоростях выше порога чтения
- `pause_bonus`: за паузы (признак чтения/рассматривания)
- `return_bonus`: за возврат к баннеру
- `reading_bonus`: за паттерн медленного скролла + паузы + время
- `streak_penalty`: за серии быстрого скролла

### S4

```
S4 = (tab_active_time_ms / tab_total_time_ms) × 100
```
Прямая линейная зависимость: 0% активности → 0, 100% активности → 100.

### S5

Переключатель иерархии (см. выше), возвращает значение из фиксированного набора `{0, 10, 20, 30, 60, 70, 80, 100}`.

### S7

```
S7 = base_position + position_bonus + clutter_penalty + persistence_bonus
```
- `base_position`: 30 если above-the-fold, 20 иначе
- `position_bonus`: бонус за верхнюю треть страницы
- `clutter_penalty`: штраф за каждый конкурирующий баннер в viewport
- `persistence_bonus`: за высокий `viewability_persistence_pct`

---

## Формула CPMind Score

```
Score = (S1×w1 + S2×w2 + S3×w3 + S4×w4 + S5×w5 + S7×w7) × F_Presence
```

Результат: `[0, 100]`. При F_Presence = 0 — итог всегда 0 независимо от сигналов.

**Веса v1.0_uncalibrated (стартовые):**

| Сигнал | Вес | Обоснование |
|---|---|---|
| S1 | 0.30 | Время видимости — ключевой МRC-показатель |
| S2 | 0.20 | Физический размер контакта |
| S3 | 0.15 | Поведенческий сигнал вовлечённости |
| S4 | 0.15 | Вкладка не в фоне |
| S5 | 0.15 | Явное взаимодействие |
| S7 | 0.05 | Контекст, не поведение |

Веса — экспертные гипотезы, **не подтверждённые данными**. Калибруются через панель `/admin/weights` без редеплоя.

---

## Изменения, внесённые в эту сессию

| Файл | Изменение |
|---|---|
| `schemas/user.ts` | `UserStatsRowSchema` — добавлено `tagUuid: z.string().uuid().nullable()` |
| `schemas/api.ts` | `ImpressionDetailSchema` — добавлены `lastRecalibratedAt?` и `lastRecalibratedWeightsVersion?` |
| `schemas/calibration.ts` | `CalibrationFilterSchema` — убрано `userUuid`, добавлены версии тега/весов и все 14 диапазонных параметров |
| `schemas/calibration.ts` | `CalibrationBatchSchema` — добавлено `expiresAt: z.string().nullable()` |
| `schemas/calibration.ts` | `CalibrationItemSchema` — добавлены `deviceType`, `s1Normalized`...`s7Normalized` |
| `schemas/calibration.ts` | Экспортирован тип `CalibrationFilters` в `types/index.ts` |
| `types/index.ts` | Добавлен реэкспорт `CalibrationFilters`, `UserStatsRow` (с `tagUuid`), `UserCampaignStatsRow`, `UserCampaignStatsListResponse` |