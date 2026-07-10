# Реализация сигнальных моделей и доработки — итерация 3

Источник: `CPMind_master_audit.md` (08.07.2026), master-документы S1–S7, сессия разработки 09–10.07.2026.  
Дата: 10.07.2026.

Цель итерации: полная замена эвристических формул нормализации S1–S7 на калиброванные модели согласно спецификациям; закрытие всех аудитных блокеров и критических замечаний до запуска 3M-калибровочной кампании.

---

## Реализовано в этой итерации

### S1 — Weibull CDF (замена логарифмической формулы)

**Причина:** as-is формула `min(100, ln(t+1)/ln(11) * 100)` насыщается на 10 секундах, не сегментирована, игнорирует реальное распределение времени просмотра.

**Модель:** `S1 = min(100, F(t) × 100)`, где `F(t) = 1 − exp(−(t/λ)^k)` — CDF Weibull, параметры `{k, λ}` получены через Newton-Raphson (MLE). 9 сегментов: `{desktop|mobile|tablet} × {static|animated|video}`.

**Изменение порога видимости (75%/2s):** на основе Zhang & Chen (2015) и Uhl et al. (2020, n=350k+), подтверждающих что MRC-порог 50%/1s занижает планку реального восприятия. Переход на 75% пикселей / 2 секунды непрерывно как более точный предиктор view-through эффекта.

**Файлы:**
- `packages/shared/src/scoring/signal_defaults.ts` — `WeibullParams`, `DEFAULT_WEIBULL_PARAMS {k:1.0, λ:5.0}`
- `packages/shared/src/scoring/weibull_mle_fit.ts` — новый: `fitWeibullMLE` (Newton-Raphson)
- `packages/shared/src/scoring/normalize.ts` — `normalizeS1(s1, params: WeibullParams)`
- `packages/shared/src/schemas/tag-constants.ts` — `S1_VIEWPORT_THRESHOLDS: [0, 0.75, 1.0]`, `DEFAULT_TAG_CONSTANTS` обновлён
- `packages/tag/src/signals/s1.ts` — `intersectionRatio >= 0.75`, `segmentSec >= 2.0 && visiblePixelsPct >= 75`
- `packages/tag/src/session.ts` — `mrcCompliant`: порог `2.0 && 75`
- `packages/backend/src/services/bootstrap.ts` — `bootstrapS1WeibullDefault` (global сегмент)
- `packages/backend/src/jobs/s1_weibull_recalibration.ts` — cron `0 4 * * 0`, окно 30d, MIN=1000
- `packages/backend/src/routes/s1_weibull.ts` — 5 эндпоинтов
- `packages/backend/src/db/schema.ts` — таблица `s1_weibull_configs`, `s1_model_version` в `impressions`

**Статус:** реализовано, тесты пройдены (9 фаз).

---

### S3 — Scroll Velocity: логистическая регрессия (замена waterfall)

**Причина:** as-is `baseSpeedScore` содержал баг — `speed == null || speed > 0 ? 55` возвращал 55 при `null` вместо `null`. Фиксированные пороги 300/800 px/s без эмпирической основы.

**Модель:** `S3 = min(100, sigmoid(β·x) × 100)`, 8 коэффициентов β0..β7, 9 сегментов `{device} × {creative_group}`, IRLS через `fitLogisticMLE`. z-score нормализация признаков с `featureMeans`/`featureStds`.

**Файлы:**
- `packages/shared/src/scoring/logistic_mle_fit.ts` — новый: `fitLogisticMLE` (IRLS, переиспользуется S3/S5/S6)
- `packages/shared/src/scoring/normalize.ts` — `normalizeS3(s3, params: LogisticParams)`
- `packages/backend/src/jobs/s3_logistic_recalibration.ts` — cron `0 5 * * 0`, окно 30d, MIN=1000
- `packages/backend/src/routes/s3_logistic.ts` — 5 эндпоинтов
- `packages/backend/src/db/schema.ts` — таблица `s3_logistic_configs`, `s3_model_version` в `impressions`

**Статус:** реализовано, тесты пройдены (9 фаз).

---

### S4 — Tab Activity: нелинейная функция с λ/T_ref (замена простого activeRatio)

**Причина:** as-is `min(100, tabActiveTimeMs/tabTotalTimeMs × 100)` не штрафует частые переключения вкладок и не учитывает длительность активных сессий.

**Модель:** `S4 = clamp(activeRatio × 100 × exp(−λ×n) × min(1, avgSession/T_ref), 0, 100)`. 5 сегментов: `desktop_banner`, `mobile_banner`, `desktop_video`, `mobile_video`, `default` (tablet → mobile).

**Исправление (ретроспективно):** обнаружено что `s4_model_version` не был добавлен в `impressions` при первоначальной реализации — добавлен в миграции 0014 вместе с `s5_model_version`.

**Файлы:**
- `packages/backend/src/services/s4_config.ts` — `S4ConfigResolution {config, modelVersion}`
- `packages/backend/src/services/s4_fit.ts` — `fitLambda`, `fitTRef`, `fitS4Params`
- `packages/backend/src/jobs/s4_calibration.ts` — cron `0 6 1 * *`, окно 30d, MIN=1000
- `packages/backend/src/routes/s4_config.ts` — 5 эндпоинтов
- `packages/backend/src/db/schema.ts` — таблица `s4_configs`, `s4_model_version` в `impressions`

**Статус:** реализовано, тесты пройдены (9 фаз).

---

### S5 — Interaction Events: логистическая регрессия по device_type (замена waterfall)

**Причина:** as-is waterfall (`clicked→100 / zoom+swipe→90 / hover3000→75…`) не сегментирован — мобильный пользователь получал ветки hover которые физически недостижимы. `hoverDurationNorm` по спеке выходил за [0,1] при `hoverMax > 10000ms`.

**Модель:** 2 сегмента `desktop` / `mobile_tablet`. Desktop: `z = β0 + β1·clicked + β2·hoverDurationNorm + β3·hoverCountNorm + β4·proximityNorm`. Mobile: `z = β0 + β1·clicked + β2·zoom + β3·tapCountNorm + β4·swipeCountNorm`. `S5 = min(100, round(sigmoid(z) × 100))`.

**Аудитный баг закрыт:** `hoverDurationNorm = Math.min(1, log(x+1)/log(10001))` — добавлен clamp `Math.min(1, ...)` защищающий от выхода за [0,1].

**Файлы:**
- `packages/shared/src/scoring/normalize.ts` — `normalizeS5(s5, params: S5LogisticParams)`, приватные `normDesktopFeatures`/`normMobileFeatures`
- `packages/backend/src/services/s5_logistic_config.ts` — fallback: segment → global → DEFAULT
- `packages/backend/src/jobs/s5_logistic_recalibration.ts` — cron `0 6 * * 0`, окно 30d, MIN=1000, прокси-метка P75 hover
- `packages/backend/src/routes/s5_logistic.ts` — 5 эндпоинтов
- `packages/backend/src/db/schema.ts` — таблица `s5_logistic_configs`, `s5_model_version` в `impressions`

**Статус:** реализовано, тесты пройдены (9 фаз).

---

### S6 — Video Engagement & Audibility: логистическая регрессия (замена waterfall+модификаторы)

**Причина:** as-is ступенчатая шкала (completion=85, quartile75=75…) + аддитивные модификаторы (audibilityModifier, replayBonus) не учитывает нелинейные взаимодействия completion × audibility. Штраф `muted_throughout=-15` одинаков для всех устройств, хотя на мобильных autoplay-muted — платформенная норма.

**Модель:** 9 коэффициентов β0..β8 + терм взаимодействия `completionZ × audibleZ`. 6 сегментов `{desktop|mobile|tablet} × {skippable|non_skippable}`. Z-score нормализация по сегменту для `completionRate`, `quartileOrdinal`, `audibleRatio`, `replayLog`.

**Архитектурное решение (Вариант B):** `skippable` берётся из `TagConfig` → payload верхний уровень, не из `SignalsS6Schema`. `device_type` из `payload.device_type`. Это избегает дублирования в теге и соответствует аудитной рекомендации.

**Аудитные баги закрыты:**
- `capping.ts`: добавлены `cap(completion_rate_pct, 0, 100)`, `cap(audible_time_sec, 0, 3600)`, `cap(duration_sec, 0, 3600)`, `floor0(replay_count)`, `cap(volume_level, 0, 100)`
- `impression.ts` `SignalsS6Schema`: добавлены `completion_rate_pct` (nullable), `duration_sec` (nullable)
- `tag/types.ts` `S6RawData`: добавлен `duration_sec: number | null`
- `tag/signals/s6.ts` `getS6Data`: возвращает `duration_sec: state.duration > 0 ? state.duration : null`
- `tag/types.ts` `TagConfig`: добавлен `skippable: boolean`
- `tag/session.ts` `buildPayload`: добавлен `skippable: cfg.skippable`

**Файлы:**
- `packages/shared/src/scoring/normalize.ts` — `normalizeS6(s6, params: S6LogisticParams)`, `quartileOrdinal` helper
- `packages/backend/src/services/s6_logistic_config.ts` — fallback: segment → skippable → global → DEFAULT; `getActiveS6LogisticParams(segmentKey: string | null)` — null для баннеров
- `packages/backend/src/jobs/s6_logistic_recalibration.ts` — cron `0 7 * * 0`, окно 30d, MIN=1000, weak-label: `completion && (unmuted || !mutedThroughout)`
- `packages/backend/src/routes/s6_logistic.ts` — 5 эндпоинтов
- `packages/backend/src/db/schema.ts` — таблица `s6_logistic_configs` (с `feature_means`, `feature_stds`), в `impressions`: `s6_model_version`, `s6_completion_rate_pct`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`

**Статус:** реализовано, тесты пройдены (9 фаз). Математическая верификация: `c6000004` → z=6.473 → sigmoid=0.9984 → S6=99.84 ✅

---

### S7 — Page Context: квантильная калибровка (замена аддитивной эвристики)

**Причина:** as-is формула содержала двойной счёт ATF+relativeY (оба штрафовали/бонусировали за одно физическое расположение), пороги 0.25/0.50/0.75 и 2/5 конкурентов выбраны экспертно без проверки на данных.

**Модель:**
```
positionScore: ATF ? (relativeY < relativeYLow→55, иначе→45) : (relativeY < relativeYMid→30, иначе→15)
clutterPenalty: ≤clutterMid→0, ≤clutterHigh→-12, иначе→-25
persistenceBonus: >80→+5, <20→-5, иначе→0
S7 = clamp(positionScore + clutterPenalty + persistenceBonus, 0, 100)
```

Пороги `relativeYLow` (p33 ATF), `relativeYMid` (p67 BTF), `clutterMid` (p50), `clutterHigh` (p80) — квантили реального трафика по `device_type`. 3 сегмента: `desktop`, `mobile`, `tablet`.

**Алгоритм:** `fitS7Quantiles` — линейная интерполяция между элементами отсортированного массива (эквивалент PostgreSQL `percentile_cont`). Живёт в `backend/services/s7_quantile_fit.ts` (не в shared — используется только backend-джобом, аналогично `s4_fit.ts`).

**Аудитное замечание закрыто:** `isAboveTheFold` в `tag/signals/s7.ts` — всегда boolean, путей с `undefined` нет (проверено).

**Файлы:**
- `packages/shared/src/scoring/normalize.ts` — `normalizeS7(s7, deviceType, thresholds: S7Thresholds)`
- `packages/backend/src/services/s7_quantile_fit.ts` — новый: `fitS7Quantiles`, `S7RawObservation`, `S7QuantileFitResult`
- `packages/backend/src/services/s7_quantile_config.ts` — fallback: device_type → global → DEFAULT_S7_THRESHOLDS[deviceType]
- `packages/backend/src/jobs/s7_quantile_recalibration.ts` — cron `0 8 1 * *` (ежемесячно 1-го числа 08:00 UTC), окно 60d, MIN=300
- `packages/backend/src/routes/s7_quantile.ts` — 5 эндпоинтов
- `packages/backend/src/db/schema.ts` — таблица `s7_quantile_configs`, `s7_model_version` в `impressions`

**DEFAULT_S7_THRESHOLDS:**
```
desktop: { relativeYLow:0.20, relativeYMid:0.55, clutterMid:3, clutterHigh:6 }
mobile:  { relativeYLow:0.15, relativeYMid:0.45, clutterMid:2, clutterHigh:5 }
tablet:  { relativeYLow:0.18, relativeYMid:0.50, clutterMid:3, clutterHigh:6 }
```

**Статус:** реализовано, тесты пройдены (9 фаз).

---

### Закрытые аудитные блокеры и замечания

#### IVT: ложные срабатывания `viewWithoutActiveTab`

**Причина:** `s1.time_in_view_sec > 0` срабатывал при первом рендере в некоторых браузерах даже при `document.hidden=true` из-за поведения IntersectionObserver.

**Исправление:** порог повышен до `> 3` секунд — исключает первый рендер, сохраняет детекцию реальных накруток.

**Файл:** `packages/shared/src/scoring/ivt.ts` — `checkImpossibleEvents`

---

#### Weights: инвариант s6=0 для баннеров

**Причина:** если администратор случайно создаёт banner-конфиг с `s6 > 0`, `normalizeS6(null)` вернёт null, вес перераспределится на остальные сигналы — тихое искажение скора без warning в логах.

**Исправление:** в `activateWeightsConfig` добавлена валидация: при `configType === 'banner'` и `weights.s6 !== 0` → 422 `WEIGHTS_BANNER_S6_NONZERO`.

**Файл:** `packages/backend/src/services/weights_config.ts`

---

#### S6 Capping: `volume_level` не каппировался

**Причина:** при добавлении S6 каппингов в предыдущей сессии `volume_level` был пропущен.

**Исправление:** добавлен `cap(volume_level, 0, 100)` в блок S6 `capping.ts`.

**Файл:** `packages/shared/src/scoring/capping.ts`

---

### Publisher Domain — новая функциональность

**Причина:** каждый показ должен нести домен площадки для аналитики и разбивки Score по сайтам. Один и тот же тег на разных площадках создаёт принципиально разные датасеты.

**Реализация:**
- `TagConfig.publisherDomain?: string` — опциональный, задаётся при размещении тега
- Цепочка fallback в теге: `configDomain` → `document.referrer` hostname → `window.location.hostname` → `unknown_{djb2hash}`
- Hash: djb2 от `href + referrer`, 6 hex-символов, с length-suffix для защиты от коллизий анаграмм
- `publisher_domain: z.string().min(1).max(253)` в `ImpressionPayloadSchema`
- `publisher_domain text` + `idx_impressions_publisher_domain` (B-tree) в `impressions`

**Аналитический эффект:** `GROUP BY publisher_domain` даёт разбивку Score по площадкам; `unknown_*` домены группируются по уникальному хэшу, не смешиваются между собой.

**Файлы:**
- `packages/tag/src/utils/publisher_domain.ts` — новый: `getPublisherDomain`, `isValidPublisherDomain`, `djb2Hash`
- `packages/tag/src/types.ts` — `TagConfig.publisherDomain?`, `Session.publisherDomain`
- `packages/tag/src/config.ts` — парсинг `data-publisher-domain`
- `packages/tag/src/session.ts` — `publisherDomain: getPublisherDomain(cfg.publisherDomain)` в `createSession`, `publisher_domain` в `buildPayload`
- `packages/shared/src/schemas/impression.ts` — `publisher_domain: z.string().min(1).max(253)`
- `packages/backend/src/services/scoring.ts` — `publisherDomain: payload.publisher_domain` в INSERT

**Статус:** реализовано, проверено (3 сценария: явный домен, unknown_hash, subdomain; валидация 422 на пустую строку; аналитический GROUP BY запрос).

---

### Инфраструктурные изменения

#### Cron-расписание (финальное, без конфликтов)

| Cron | Job |
|---|---|
| `0 2 * * *` | pgdump |
| `0 3 * * *` | retention (90d) |
| `*/15 * * * *` | calibration cleanup + scheduled deletion |
| `0 4 * * 0` | S1 Weibull (weekly Sunday) |
| `0 5 * * 0` | S3 Logistic (weekly Sunday) |
| `0 6 * * 0` | S5 Logistic (weekly Sunday) |
| `0 7 * * 0` | S6 Logistic (weekly Sunday) |
| `0 6 1 * *` | S4 Calibration (monthly 1st) |
| `0 8 1 * *` | S7 Quantile (monthly 1st) |

#### Shared `signal_defaults.ts` — единый источник дефолтных параметров

Добавлены интерфейсы и дефолты: `WeibullParams`, `LogisticParams`, `S4Config`, `S5LogisticParams`, `S6LogisticParams`, `S7Thresholds`. Все резолвятся через соответствующие сервисы (`getActiveS*`), не импортируются напрямую в `normalize.ts` или `routes/`.

#### API Schema (`packages/shared/src/schemas/api.ts`)

`ImpressionRowSchema` расширена: `skippable`, `publisher_domain`, `s1–s7_model_version`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`.

#### CSV Export (`packages/backend/src/services/csv.ts`)

`CSV_BATCH_SIZE`: 500 → 10 000. Добавлены колонки: `skippable`, `publisher_domain`, `s1–s7_model_version`, `s6_raw_completion_rate`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable`.

#### Миграции БД

| Миграция | Содержание |
|---|---|
| 0010 | `s1_weibull_configs`, `s1_model_version` |
| 0011 | `s3_logistic_configs`, `s3_model_version` |
| 0012 | `s4_configs` |
| 0013 | `weight_configs` unique partial index |
| 0014 | `s5_logistic_configs`, `s4_model_version`, `s5_model_version` |
| 0015 | `s6_logistic_configs`, `s6_model_version`, `s6_completion_rate_pct`, `s6_audible_time_sec`, `s6_duration_sec`, `s6_skippable` |
| 0016 | `s7_quantile_configs`, `s7_model_version` |
| 0017 | `publisher_domain`, `idx_impressions_publisher_domain` |

---

## Не реализовано — открытые пункты

### Unit-тесты (запланированы на следующую сессию)

18 тестов запланированы в `packages/shared/src/__tests__/`: `normalize.test.ts`, `scoring.test.ts`, `capping.test.ts`, `ivt.test.ts`, `publisher_domain.test.ts`, `schemas/impression.test.ts`. Покрывают 7 обязательных пунктов аудита §5 + 11 новых тестов по изменениям этой сессии.

### VAST-парсинг для `skippable` на бэкенде

Аудит §3.1 предлагает парсить VAST-manifest на бэкенде и хранить `skippable` в таблице `creatives`/`campaigns`. Текущее решение (TagConfig → payload) корректно для MVP. VAST-интеграция — следующий этап при появлении полноценной таблицы `creatives`.

### IP-матчинг в IVT

`checkUaList` обрабатывает только `type === 'ua'` записи. IP/CIDR записи из списка не матчатся против реального IP клиента — отсутствующая фича, не баг. Требует отдельного endpoint для получения IP из заголовков запроса.

### P-17, P-03, P-10

Без изменений — статус "отложено" по-прежнему, как в `BUG_FIXING_V2.md`.