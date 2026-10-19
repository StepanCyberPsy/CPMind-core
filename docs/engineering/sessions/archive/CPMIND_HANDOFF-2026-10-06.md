# CPMIND HANDOFF-3

**Дата сессии:** 06 октября 2026
**Предыдущий handoff:** `CPMIND_HANDOFF-2.md` от 23.09.2026
**Статус кодовой базы на конец сессии:** backend **не собирается** — см. раздел 2.1

---

## 0. Как читать этот файл

Файл описывает состояние системы на конец сессии 06.10.2026 и служит точкой входа для следующего исполнителя.

**Иерархия источников истины, строго в этом порядке:**

1. Реализованный код в репозитории;
2. Состояние БД на проде и локально (SQL-проверки раздела 4);
3. Этот handoff;
4. `CPMIND_HANDOFF-2.md` от 23.09 — для истории предыдущей сессии;
5. Спецификации `S6_split_instream_outstream_spec.md` и `CPMind_TZ_S2_Share_of_Screen.md` — **постановка целей заказчика, а не описание текущего состояния**. Обе написаны от состояния системы до 23.09 и содержат фактические ошибки (раздел 8);
6. Пакетная документация `docs/packages_information/*.md`, `ARCHITECTURE.md`, `PLACEMENT.md` — устарела, годится только для понимания общей логики.

**Обязательно к исполнению:** `ENGINEERING_INSTRUCTIONS.md` — инженерный контракт. Прикладывается к каждой сессии, применяется в полном объёме, по памяти не восстанавливается.

---

## 1. Задачи сессии

Поставлены заказчиком в начале сессии:

| № | Задача | Статус |
|---|---|---|
| К1 | Баг S3: для всех показов возвращается значение 50 вместо калиброванного | диагностирован, частично исправлен |
| К2 | Модификация S6: разделение логики instream и outstream | спроектирован, не реализован |
| К3 | Калибровка S2 по образцу остальных сигналов | реализовано ~60% |
| М1 | Фронтенд: человекочитаемые названия кампаний и креативов вместо UUID | не начато |

---

## 2. Критическое состояние на конец сессии

### 2.1 Backend не собирается

`computeScore` и `normalizeAll` в `@cpmind/shared` получили обязательный параметр `s2Params`, но `packages/backend/src/services/scoring.ts` не обновлён — вызов `computeScore` передаёт прежний набор аргументов.

**Первое действие следующей сессии — закрыть раздел 6.1 (остаток S2).** До этого backend не компилируется и не запускается. Пакет `@cpmind/shared` собирается самостоятельно.

### 2.2 Ничего не выкачено на прод

Все изменения сессии применены **локально**. На проде состояние прежнее. Миграция `0030` применена только к локальной БД.

---

## 3. Реестр дефектов

| # | Дефект | Слой | Статус |
|---|---|---|---|
| D1 | `bootstrap*` проверяет непустоту таблицы вместо наличия каждого сегмента | L1 | **исправлен** |
| D2 | Нулевые коэффициенты активны у S3 `global` и 6 сегментов S6 | L1 | **признан корректным поведением**, см. 5.2 |
| D3 | S6 не различает instream и outstream в формуле, признаках и метке | L2 | не исправлен |
| D4 | Fallback подписывает out-stream сегментом `{device}\|non_skippable` | L1 | **исправлен** через D1 |
| D5 | S2 вне контура калибровки | L3 | исправляется, ~60% |
| D6 | S2: не фиксируется `Δt` между отсчётами | L3 | не исправлен |
| D7 | `toDeliveryMode` теряет `pauseroll` и `sticky` | L4 | не исправлен, не критичен |
| D8 | `tag/config.ts` дублирует enum креативов и UUID-регекс | L4 | не исправлен |
| D9 | `impressions.creative_type` объявлен как `text`, не enum | L4 | не исправлен |
| D10 | `weight_configs` нужны три `config_type` вместо двух | L2 | не исправлен |
| D11 | `audibleRatio` может превысить 1 | L2 | не исправлен |
| D12 | `getActiveWeightsConfig` молча отдаст баннерные веса новым категориям | L2 | не исправлен |
| D13 | Промежуточная ступень цепочки fallback не обучается ни одним джобом | L1 | **исправлен для S1 и S3**; для S6 перенесён в L2 |
| D14 | Недостижимая ветка в `s4_config.ts`; `global` S7 отсутствует в bootstrap | L1 | **признан корректным поведением**, см. 5.3 |

### Снято с учёта по результатам анализа кода

| Пункт | Основание |
|---|---|
| S2 §4.2 ТЗ — обрезка по вьюпорту | **уже реализована корректно** в `sdk/src/signals/s2.ts`, совпадает с формулой ТЗ построчно |
| S2 §4.3 ТЗ — капинг `share_of_screen_max_pct` | **уже реализован** в `capping.ts`, плюс защита на уровне `SignalsS2Schema` |
| S2 §4.1 ТЗ — фоновая вкладка | **уже обработана** через `document.visibilityState !== 'visible'`, осознанное решение с комментарием |
| `embed.ts` читает `mode` вместо `format` | **не подтвердилось** — читает `format`, `mode` только fallback при `format IS NULL` |

---

## 4. Диагностика: SQL-проверки и результаты

Все запросы выполнены на проде `compute-vm-cpmind-test`, если не указано иное.

### 4.1 S3 — распределение версий моделей (окно 7 дней)

```
 s3_model_version | creative_type  | device_type | tag_const | cnt | avg_s3
------------------+----------------+-------------+-----------+-----+--------
 e5f5d4f5-...     | video_creative | desktop     | v4        | 364 | 50.0000
 e5f5d4f5-...     | banner_gif     | desktop     | v4        | 311 | 50.0000
 e5f5d4f5-...     | banner_gif     | mobile      | v4        | 112 | 50.0000
 e5f5d4f5-...     | video_creative | mobile      | v4        |  54 | 50.0000
 e5f5d4f5-...     | banner_gif     | tablet      | v4        |   8 | 50.0000
 e5f5d4f5-...     | video_creative | tablet      | v4        |   6 | 50.0000
```

Один и тот же UUID у всех комбинаций — это строка сегмента `global`.

### 4.2 S3 — содержимое таблицы конфигов (вся таблица, 5 строк)

```
 segment_key   | tag_const | is_active | sample_size | auc | fitted_at
---------------+-----------+-----------+-------------+-----+---------------------
 desktop|static| v0        | f         |        1238 |     | 2026-08-23 05:00
 desktop|static| v0        | t         |        1421 |     | 2026-08-16 05:00
 desktop|static| v0        | f         |        1396 |     | 2026-08-09 05:00
 desktop|static| v0        | f         |        1263 |     | 2026-08-04 12:56
 global        | v0        | t         |           0 |     |
```

**Вывод:** обучена ровно одна модель — `desktop|static`. Четыре прогона по воскресеньям в 05:00 UTC, затем тишина с 23.08. Джоб работает, механизм исправен.

### 4.3 S6 — распределение версий моделей (окно 7 дней)

```
 s6_model_version | format    | subtype | device  | skippable | cnt | avg_s6
------------------+-----------+---------+---------+-----------+-----+--------
 37f2e229-...     | outstream | sticky  | desktop | f         | 351 | 50.0000
 c1a7d4ba-...     | outstream | sticky  | mobile  | f         |  54 | 50.0000
 8eb73791-...     | instream  | preroll | desktop | t         |  18 | 50.0000
 de0f05b7-...     | outstream | sticky  | tablet  | f         |   6 | 50.0000
```

### 4.4 S6 — содержимое таблицы конфигов (вся таблица, 6 строк)

```
 segment_key          | tag_const | is_active | sample_size | auc
----------------------+-----------+-----------+-------------+-----
 desktop|non_skippable| v0        | t         |           0 |
 desktop|skippable    | v0        | t         |           0 |
 mobile|non_skippable | v0        | t         |           0 |
 mobile|skippable     | v0        | t         |           0 |
 tablet|non_skippable | v0        | t         |           0 |
 tablet|skippable     | v0        | t         |           0 |
```

**Вывод, ключевой для D1:** в коде `bootstrapS6Default` перечисляет 15 сегментов — 9 новых по группам размещения плюс 6 прежней схемы. В БД только 6. Четыре UUID из 4.3 однозначно ложатся на четыре строки прежней схемы. Новая сегментация существовала только в коде.

### 4.5 Видеопоказы по форматам (окно 30 дней)

```
 format    | subtype | device  | skippable | measurement_mode   | cnt
-----------+---------+---------+-----------+--------------------+-----
 outstream | sticky  | desktop | f         | full_cpmind_player | 825
 outstream | sticky  | mobile  | f         | full_cpmind_player |  68
 instream  | preroll | desktop | t         | full_cpmind_player |  40
 (null)    | (null)  | desktop | t         | legacy_tag         |  37
 (null)    | (null)  | desktop | f         | legacy_tag         |  25
 outstream | sticky  | tablet  | f         | full_cpmind_player |  14
 (null)    | (null)  | mobile  | t         | legacy_tag         |   4
 (null)    | (null)  | mobile  | f         | legacy_tag         |   1
 instream  | preroll | mobile  | t         | full_cpmind_player |   1
```

**Выводы:** 89% видеотрафика — `outstream/sticky`. Показов `outstream/inpage` ноль. 67 legacy-видеопоказов за 30 дней — тестовые прогоны, подтверждено заказчиком, сохраняются.

### 4.6 Плейсменты и соответствие `delivery_mode`

```
 mode              | format    | subtype  | count
-------------------+-----------+----------+-------
 display           | banner    |          |    14
 instream_preroll  | instream  | preroll  |     7
 outstream         | outstream | sticky   |     2
 outstream         | outstream | inpage   |     2
 standalone_video  | outstream | inpage   |     2
 instream_postroll | instream  | postroll |     1
```

**Выводы:** подтверждён D7 — `sticky` и `inpage` делят одно значение `mode = 'outstream'`, колонка физически не способна их различить. Также обнаружены 2 плейсмента `standalone_video`, которых по словам заказчика быть не должно; показов у них нет, миграция 0026 отнесла их веткой `ELSE` к `outstream/inpage`.

### 4.7 Пригодные для обучения S3 показы по сегментам (окно 30 дней)

```
 device  | creative_group | tag_const | trainable
---------+----------------+-----------+-----------
 desktop | video          | v4        |       586
 desktop | animated       | v4        |       570
 desktop | static         | v4        |        54
 mobile  | animated       | v4        |        51
 mobile  | video          | v4        |        27
 tablet  | animated       | v4        |        13
 tablet  | video          | v4        |         9
 mobile  | static         | v4        |         7
```

**Выводы:**
- версия констант в окне одна — `v4`, смешивания нет;
- ни один лист не достигает порога 1000;
- агрегаты: `video` = 622, `animated` = 634, суммарно 1317.

### 4.8 Общее распределение показов (вся история)

```
 measurement_mode    | creative_type  | format    | cnt
---------------------+----------------+-----------+------
 legacy_tag          | banner_static  |           | 2179
 full_direct_display | banner_gif     | banner    |  967
 full_cpmind_player  | video_creative | outstream |  907
 legacy_tag          | banner_gif     |           |  137
 legacy_tag          | video_creative |           |  115
 legacy_tag          | banner_html5   |           |  110
 full_cpmind_player  | video_creative | instream  |   41
 full_direct_display | banner_static  | banner    |   12
 full_direct_display | banner_html5   | banner    |    1
```

Всего 4469 показов.

### 4.9 Проверка миграции 0030 (локальная БД)

Все четыре объекта созданы, запись в журнале `id = 33`:

```
  kind   |                 name                 | present
---------+--------------------------------------+---------
 table   | s2_configs                           | t
 column  | impressions.s2_model_version         | t
 index   | uidx_s2_configs_active_segment       | t
 index   | idx_s2_configs_deletion_scheduled_at | t
 journal | 0030_sharp_miracleman                | t
```

---

## 5. Разбор дефектов: механика

### 5.1 S3 — почему возвращается 50

Ключ сегмента строится в `routes/impressions.ts`:

```
banner_gif, banner_html5 → animated
video_creative           → video
остальное                → static
segmentKey = `${device_type}|${creativeGroup}`
```

Цепочка `getActiveS3LogisticParams`: `{device}|{group}` → `{group}` → `global` → `DEFAULT_LOGISTIC_PARAMS`.

Трафик сейчас — только `banner_gif` и `video_creative`, то есть группы `animated` и `video`. Единственная обученная модель — `desktop|static`, статических показов нет. Разворот для десктопного `animated`:

| Шаг | Ключ | Результат |
|---|---|---|
| 1 | `desktop\|animated` | нет записи |
| 2 | `animated` | нет записи |
| 3 | `global` | найдено, все β = 0 → `sigmoid(0) = 0.5` → **S3 = 50** |

**Корень проблемы:** изменился состав типов креативов → данные перестали поступать в сегменты, где есть модели → для новых сегментов моделей нет → цепочка доходит до нулевого `global`.

**Дополнительный фактор, ранее не учтённый:** ступени `{group}` и `global` **никем не обучаются**. Джоб пишет только полные ключи `{device}|{group}`, в `global` пишет только bootstrap, и только нули. То есть трёхуровневая цепочка фактически двухуровневая, а второй уровень — константа. Это D13.

**Блокировка по версии констант:** модели обучены на `v0`, показы идут на `v4`. Джоб берёт доминирующую версию окна (`v4`) и обучает только на ней. Для `desktop|static` данных `v4` нет — модель на `v4` не появится, пока не пойдут статические показы. Вторая ветка резолвера (поиск без учёта версии) позволяет применить модель `v0`, но промах здесь по сегменту, а не по версии.

### 5.2 S6 — почему возвращается 50

`bootstrapS6Default` вышел по раннему `return`, увидев 6 строк прежней схемы, и не вставил 9 новых. Цепочка `resolveS6SegmentKeys` падает на второй уровень — сегмент прежней схемы `{device}|{skippable}` — и находит там нулевую модель. Результат 50, атрибуция ложная (out-stream подписан как `non_skippable`).

**Цена:** у видео S6 весит 0.40, S3 — 0.10. Половина итогового Score формировалась двумя константами, при этом в панели у каждого показа стоял UUID модели — внешне неотличимо от работающей калибровки.

### 5.3 Решения, принятые после обсуждения с заказчиком

Зафиксировано, чтобы следующий исполнитель не предлагал заново:

| Предложение | Решение | Основание |
|---|---|---|
| Колонка `origin` (`seed`/`fitted`) в таблицах конфигов | **отклонено** | Версионирование уже есть: `s*_model_version` хранит UUID строки, а `sample_size = 0` и `auc IS NULL` отличают seed от обученной модели. Колонка избыточна |
| Экспертные приоры вместо нулей для S3 и S6 | **отклонено** | Нулевой старт — корректная логика калибровки: коэффициенты формируются по мере накопления данных сегмента. S5 с приорами — исключение, там признаки интерпретируемы напрямую (клик, наведение); у S3 и S6 z-score-признаки такой интерпретации не имеют |
| Калибровка уровня `global` | **отклонено** | Смешивает несопоставимое — скролл по странице с видео и с баннером. Противоречит смыслу сегментации. `global` остаётся нулевым fallback |
| Калибровка промежуточного уровня `{group}` | **принято** | Однородно по типу креатива, различие устройств снимается z-score. Даёт плавную деградацию: точный сегмент → группа → нули |
| Единый последовательный раннер калибровок с advisory lock | **отклонено** | Схема из шести cron-слотов работает, менять не требуется. Для S2 выделяется отдельный слот |
| `global` для S7 в bootstrap | **отклонено** | `DEFAULT_S7_THRESHOLDS` задаёт разные пороги для desktop, mobile, tablet; общего набора не существует. Строка `global` перехватила бы ступень и выдала чужие пороги. Bootstrap всегда создаёт все три устройства, ступень `global` недостижима и безвредна |
| Уникальные индексы `(segment_key, tag_constants_version)` под `ON CONFLICT` | **отклонено** | Таблицы хранят историю обучения: у `desktop\|static` четыре строки с одной парой. Полный уникальный индекс сломал бы историю. Идемпотентность достигается проверкой наличия сегмента перед вставкой |
| `MIN_SAMPLE_SIZE` снизить под текущий трафик | **отклонено** | Стадия MVP, данные копятся. Логика строится под полную схему |
| Минимальный порог AUC для сохранения черновика | **отклонено** | Нужна истинная картина. Низкая точность — сигнал проверить формулы, реализацию или сбор |

---

## 6. Что реализовано в этой сессии

### Поставка L1.1 — идемпотентный bootstrap

**Файл:** `packages/backend/src/services/bootstrap.ts`

- Добавлен хелпер `toSegmentSet(rows)`;
- `bootstrapS4Default`, `bootstrapS5Default`, `bootstrapS6Default`, `bootstrapS7Default` переведены с guard «таблица непуста» на посегментную проверку с `onConflictDoNothing()`;
- `bootstrapS4Default` теперь итерируется по `DEFAULT_S4_CONFIGS` вместо дублированного литерала, утверждения `!` устранены;
- `bootstrapS5Default` итерируется по массиву дефолтов, `segmentKey` берётся из самих параметров;
- `bootstrapS1WeibullDefault` и `bootstrapS3LogisticDefault` **не изменялись** — их guard уже посегментный;
- `bootstrapDefaultWeights` **не изменялся** — был единственным корректным, служил образцом.

**Эффект при ближайшем старте:** вставятся 9 отсутствующих сегментов S6. `score_final` не изменится — коэффициенты нулевые, как и у сегментов прежней схемы. Изменится `s6_model_version`: out-stream перестанет подписываться `non_skippable` (D4).

### Поставка L1.2 — обучение промежуточного уровня

**Файлы:** `packages/backend/src/jobs/s1_weibull_recalibration.ts`, `s3_logistic_recalibration.ts`

- Тело цикла вынесено в `fitAndSaveSegment(segmentKey, baseWhere[, tagConstantsVersion])`;
- Порядок обхода изменён с «устройство → группа» на «группа → устройство»;
- После трёх листовых сегментов обучается родительский уровень `{group}` на объединённой выборке;
- Добавлен импорт `type SQL` из `drizzle-orm`;
- Все проверки, пороги, формулы и тексты логов перенесены дословно; `continue` заменён на `return` при выносе в функцию.

**S6 сознательно исключён:** его промежуточная ступень `{skippable}` будет переписана в L2 вместе с новой схемой сегментов.

### Поставка S2.1 — контракт модели

| Файл | Изменение |
|---|---|
| `shared/src/scoring/signal_defaults.ts` | тип `S2Params`, константа `DEFAULT_S2_PARAMS` (11 опорных квантилей) |
| `shared/src/scoring/normalize.ts` | функция `interpolateCdf`, `normalizeS2(s2, params)`, новый аргумент `s2Params` в `normalizeAll` |
| `shared/src/scoring/score.ts` | новый аргумент `s2Params` в `computeScore` |
| `backend/src/db/schema.ts` | колонка `s2ModelVersion` в `impressions`, таблица `s2Configs`, типы `S2ConfigInsert` / `S2ConfigSelect` |
| `backend/drizzle/migrations/0030_sharp_miracleman.sql` | сгенерирована, применена локально, проверена |

### Поставка S2.2 — резолв, калибровка, seed

| Файл | Изменение |
|---|---|
| `shared/src/index.ts` | экспорт `DEFAULT_S2_PARAMS` |
| `shared/src/types/index.ts` | экспорт типа `S2Params` |
| `backend/src/services/configs/s2_config.ts` | **новый** — резолв с кэшем, цепочка fallback, активация, отложенное удаление |
| `backend/src/jobs/s2_calibration.ts` | **новый** — расчёт квантилей, два уровня сегментации, cron `0 10 1 * *` |
| `backend/src/services/bootstrap.ts` | `bootstrapS2Default()` |

---

## 7. Модель S2 — проектное решение

### 7.1 Что было

```
S2 = min(100, sqrt(share_of_screen_avg_pct) × 10)
```

Параметров нет, калибровать нечего. `parseCalibrationTarget` отвергал `'s2'` явным исключением.

### 7.2 Что стало

```
S2 = 100 × F̂(share_of_screen_avg_pct)
```

`F̂` — эмпирическая функция распределения доли экрана в сегменте, заданная 11 опорными квантилями (p01, p10…p90, p99) с монотонной кусочно-линейной интерполяцией.

**Почему эта форма выбрана** (рассматривались также степенная `a × x^b` и квантильная кусочно-постоянная по образцу S7):

1. **Соответствует смыслу сигнала.** S2 измеряет, насколько экспозиция лучше типичной для сегмента. Показ с 8% при медиане 3% — хороший; при медиане 15% — плохой. Абсолютное значение этого не выражает, перцентиль выражает;
2. **Решает проблему сжатия диапазона** из §4.5 ТЗ. В тестах `avg_pct` держался в коридоре 7.3–8.1%, что давало S2 в полосе 27.0–28.5 — сигнал с весом 0.20 не различал показы. CDF растягивает фактический диапазон сегмента на всю шкалу;
3. **Использует весь диапазон по построению.** У степенной формулы верх шкалы недостижим: баннер не занимает 100% экрана;
4. **Согласован с S1,** который реализован как `Weibull CDF × 100`. Два сигнала одного класса получают одну математическую природу;
5. **Устойчив на малых выборках** — квантили как порядковые статистики почти не чувствительны к выбросам.

### 7.3 Обратная совместимость

`DEFAULT_S2_PARAMS` рассчитан из тождества `100 × p = sqrt(x) × 10`, то есть `x = 100 × p²`. До первой калибровки нормализация воспроизводит прежнюю формулу: на опорных точках совпадение точное, между ними максимальное отклонение 0.7 пункта (при 50% — 70.00 против 70.71).

Контрольные сверки: 25% → ровно 50; 15% → 38.18 против 38.73; 5% → 21.67 против 22.36; 99% → 99.50 против 99.50.

### 7.4 Архитектурные детали

- **Колонки `tag_constants_version` у таблицы нет.** После перехода на Δt-взвешивание измеряемая величина становится инвариантной к `S2_SAMPLE_INTERVAL_MS`. Соответствует S1;
- **Сегментация** `{device}|{creative_group}` — та же, что у S1, с обучением промежуточного уровня;
- **Отбор выборки** `sdkOnly: true`. Бандлы тега `v0`–`v4` уже у издателей и продолжат слать невзвешенное среднее после правки SDK; hosted-рантаймы пересобираются при деплое;
- **Сетка уровней** `QUANTILE_LEVELS` заимствована из `DEFAULT_S2_PARAMS` — интерполяция обученной и дефолтной конфигурации выполняется на одних позициях;
- **Отбраковка вырожденного распределения:** если разброс между крайними квантилями меньше `MIN_SPREAD_PCT = 0.05`, черновик не сохраняется. Аналог проверки баланса классов у логистических сигналов;
- **Защита от непригодной конфигурации:** `rowToParams` возвращает `null` при неразобранном jsonb, длине меньше 2 или несовпадении длин массивов — строка пропускается, выбор продолжается по цепочке. `activateS2Config` отклоняет активацию такой строки с кодом `S2_CONFIG_QUANTILES_INVALID`.

---

## 8. Расхождения спецификаций с кодом

Обе спецификации написаны от состояния до 23.09. Зафиксировано, чтобы следующий исполнитель не реализовывал их буквально.

### 8.1 `S6_split_instream_outstream_spec.md`

| Пункт ТЗ | Утверждение | Факт |
|---|---|---|
| §1 | «Сейчас S6 — одна модель, сегментация `device × skippable`, 6 сегментов» | Разделение по группам размещения реализовано 23.09: `segments.ts` даёт 9 сегментов, джоб обучает по ним. Формат ключа другой — `{device}\|{группа}` против `instream\|{device}\|{skippable}` в ТЗ |
| §3.1 | «Набор признаков совпадает с текущим» | **Не совпадает.** Совпадают только β0, β1 и β8. Порядок признаков в ТЗ отличается от реализации на позициях β2–β7 |
| §10.1 | «В реализации нет `muted_throughout`, вместо него `play_initiated`» | **Инвертировано.** В `normalize.ts` стоит `const muted = s6.muted_throughout ? 1 : 0;` на позиции β4; `play_initiated` в линейной комбинации отсутствует, используется только внутри `quartileOrdinal` как уровень «10» |
| §2 | «Формат outstream сейчас только sticky» | По факту трафика верно (показов `inpage` ноль), но `inpage` полностью реализован: есть в `FORMAT_SUBTYPES`, во всех трёх CHECK миграции 0026, настроены 4 плейсмента, у плеера отдельный жизненный цикл |
| §2 | «Режим берётся из `delivery_mode`» | Источник истины — `format`/`subtype`. `delivery_mode` подлежит снятию и физически не различает `sticky`/`inpage`/`pauseroll` |
| §8.1 | «Передавать режим показа в payload» | **Отклонено.** Сервер знает режим из `ad_session` через `deliveryContext.format`. Поле в payload было бы вторым источником истины, управляемым клиентом |

### 8.2 `CPMind_TZ_S2_Share_of_Screen.md`

| Пункт ТЗ | Утверждение | Факт |
|---|---|---|
| §4.4 | «Вариант A — ничего не менять» | **Отменено решением заказчика:** реализуется параметрическая модель и калибровка |
| §4.2 | «Потенциальный реальный баг — обрезка по вьюпорту» | Реализована корректно, совпадает с формулой ТЗ построчно |
| §4.3 | «Капинг `max_pct` отсутствует» | Присутствует в `capping.ts`, плюс защита на уровне Zod |
| §4.1 | «Проверить равномерность тиков» | Подтверждено частично: фоновая вкладка отсечена корректно, но `Δt` не фиксируется — остаётся троттлинг при нагрузке CPU |

---

## 9. Что осталось сделать

### 9.1 S2 — остаток (блокирует сборку, делать первым)

| Файл | Что сделать |
|---|---|
| `backend/src/services/scoring.ts` | параметр `s2Params` в `processImpression`, проброс в `computeScore`, запись `s2ModelVersion` |
| `backend/src/routes/impressions.ts` | резолв `getActiveS2Params(segmentKey)`, добавить в `Promise.all`, передать в `processImpression` |
| `backend/src/routes/s2_config.ts` | **новый** — маршрут по образцу `s1_weibull.ts` |
| `backend/src/server.ts` | регистрация `s2ConfigRoute`, вызов `startS2CalibrationJob()` |
| `backend/src/index.ts` | вызов `bootstrapS2Default()` |
| `backend/src/jobs/scheduled_deletion.ts` | подключить `deleteScheduledS2Configs()` |
| `backend/src/services/calibration/calibrate_signals.ts` | снять запрет на `'s2'`, добавить в `CALIBRATABLE_SIGNALS` и в `CALIBRATION_RUNNERS` |

### 9.2 S2 — Δt-взвешивание (D6)

| Файл | Что сделать |
|---|---|
| `sdk/src/types.ts` | заменить `shareOfScreenSamples: number[]` на массив пар `{ share, dt }` |
| `sdk/src/signals/s2.ts` | фиксировать фактический интервал между отсчётами |
| построитель payload | среднее как `Σ(share × dt) / Σ(dt)` |

**Порядок важен:** сначала SDK, затем накопление данных на исправленном сборе, только потом первая калибровка. Калибровать на старых данных — закреплять артефакт. `share_of_screen_max_pct` не меняется — максимум не зависит от весов.

### 9.3 L2 — разделение S6 (основная задача следующих сессий)

**Согласованная схема сегментов:**

```
instream|{device}|{skippable}      — 6 сегментов
outstream_sticky|{device}          — 3
outstream_inpage|{device}          — 3
outstream_embedded|{device}        — 3, задел под §6.3 ТЗ, не используется
```

Цепочка fallback: `outstream_sticky|desktop` → `outstream|desktop` → `outstream|global` → `DEFAULT`. Промежуточный уровень `outstream|{device}` агрегирует оба подтипа и получит данные раньше каждого подтипа по отдельности.

**Обоснование раздельных сегментов `sticky` и `inpage`:** различаются не только метка, но и распределения признаков. `sticky` всегда виден → досмотр высокий; `inpage` уезжает из вьюпорта и ставится на паузу → досмотр фрагментарный. Общий z-score по объединённой выборке исказил бы оба.

**Согласованный состав признаков (по 9 коэффициентов):**

| β | instream | outstream |
|---|---|---|
| 0 | intercept | intercept |
| 1 | completionZ | completionZ |
| 2 | quartileZ | quartileZ |
| 3 | audibleZ | audibleZ |
| 4 | `muted_throughout` | `muted_throughout` |
| 5 | `unmuted_by_user` | `unmuted_by_user` |
| 6 | replayZ | replayZ |
| 7 | **`skipped`** | **`closed_by_user`** |
| 8 | completionZ × audibleZ | completionZ × audibleZ |

Различие ровно в одной позиции. Структура совпадает с текущей `normalizeS6`, поэтому существующие конфиги не переинтерпретируются.

**Почему `muted_throughout` остаётся в обеих моделях** (ранее предлагалось убрать как коллинеарный — отклонено заказчиком):

| Признак | instream (старт со звуком) | outstream (старт без звука) |
|---|---|---|
| `muted_throughout = true` | зритель **заглушил** — негативный сигнал | зритель **не включил** — нейтральное состояние |
| `unmuted_by_user = true` | возврат звука после заглушения | зритель **включил** — сильный позитивный сигнал |

Один признак с противоположным смыслом в двух режимах — содержательная причина разделения моделей.

**Почему `play_initiated` и `start_muted` исключены:** определяются форматом, а не поведением зрителя. Instream стартует всегда; sticky — автоплей; inpage — по клику; звук на старте задан форматом. Внутри каждого сегмента признак вырожден и будет исключён правилом нулевой дисперсии из §3.3 ТЗ.

**Прочее по L2:**

- Метка обучения по разделу 5 ТЗ: жёсткие условия плюс подтверждение присутствия, параметры в конфиге;
- Подбор параметров метки перебором сетки по §7 ТЗ;
- Три `config_type` в `weight_configs`: `banner`, `video_instream`, `video_outstream` (D10). Миграция типа не нужна — колонка `text` с partial unique индексом;
- D12: в `getActiveWeightsConfig` тернарник `category === 'video' ? ... : DEFAULT_BANNER_WEIGHTS` молча отдаст баннерные веса новым категориям, то есть `s6 = 0.00`. Компилятор не поймает;
- D12-смежное: `CreateWeightsConfigSchema` в `routes/weights_config.ts` содержит литеральный `z.enum(['banner', 'video'])` — не выведен из типа, не обновится автоматически;
- D11: кламп `audibleRatio` в `[0, 1]` в `normalizeS6` и в джобе;
- Разделение джоба на два: вс 07:00 UTC — instream, вс 08:00 UTC — outstream;
- Сегменты прежней схемы `{device}|{skippable}` **сохраняются** — обслуживают 115 legacy-видеопоказов, уход от тега постепенный.

### 9.4 L4 — гигиена

| Дефект | Что сделать |
|---|---|
| D8 | `tag/config.ts`: вывести `VALID_CREATIVE_TYPES` из `CreativeTypeSchema`, `UUID_REGEX` из `TagUuidSchema`, добавить диагностику при отказе. Сейчас списки синхронны, активного бага нет; дефект структурный — аннотация `CreativeType[]` ловит удаление значения из enum, но не добавление, а `parseConfig → null` не оставляет следа в логе |
| D7 | Снятие `delivery_mode` со схемы (шаг 4.6 из handoff-2) |
| D9 | `impressions.creative_type` → `creativeTypeEnum` |
| М1 | Фронтенд: колонки `campaign_name`, `creative_name`. **Серверная часть готова** — джойн по `campaign_ref_id` / `creative_ref_id` реализован в блоке 2 прошлой сессии, фильтр `campaignUuid` и колонки в CSV работают. Для legacy-показов имена `null`, показывается ключ |

---

## 10. Cron-расписание

| Время (UTC) | Джоб | Статус |
|---|---|---|
| 03:00 ежедневно | retention — удаление показов старше 90 дней | работает |
| 03:30 ежедневно | asset_gc | работает |
| каждые 15 мин | scheduled_deletion + очистка черновиков калибровки | работает, **S2 не подключён** |
| каждые 30 мин | IVT-анализ частоты по `fp_hash` | работает |
| вс 04:00 | S1 Weibull | работает |
| вс 05:00 | S3 Logistic | работает |
| вс 06:00 | S5 Logistic | работает |
| вс 07:00 | S6 Logistic | работает, **будет разделён** |
| вс 08:00 | S6 outstream | **запланирован** |
| 1-е, 06:00 | S4 | работает |
| 1-е, 08:00 | S7 | работает |
| 1-е, 10:00 | **S2** | **реализован, не зарегистрирован** |

Бэкап в 02:00 — отдельный контейнер.

**Известный риск:** `cron.schedule` не блокирует повторный запуск. Если прогон не уложится в час, следующий джоб стартует параллельно. При текущих объёмах не проявляется.

---

## 11. Компоненты, которые понадобятся следующему исполнителю

### Для завершения S2 (раздел 9.1)

```
packages/backend/src/services/scoring.ts            — есть в истории сессии
packages/backend/src/routes/impressions.ts          — есть в истории сессии
packages/backend/src/server.ts                      — есть в истории сессии
packages/backend/src/index.ts                       — есть в истории сессии
packages/backend/src/jobs/scheduled_deletion.ts     — есть в истории сессии
packages/backend/src/services/calibration/calibrate_signals.ts — есть в истории сессии
packages/backend/src/routes/s1_weibull.ts           — образец для нового маршрута
```

### Для Δt-взвешивания (раздел 9.2)

```
packages/sdk/src/types.ts                — есть в истории сессии
packages/sdk/src/signals/s2.ts           — есть в истории сессии
packages/sdk/src/session.ts              — ЗАПРОСИТЬ (построитель payload)
packages/sdk/src/public_api.ts           — ЗАПРОСИТЬ
packages/tag/src/signals/s2.ts           — ЗАПРОСИТЬ, если реализация отдельная
```

### Для L2 — разделение S6 (раздел 9.3)

```
packages/sdk/src/signals/s6.ts                      — ЗАПРОСИТЬ
packages/sdk/src/signals/s3.ts                      — ЗАПРОСИТЬ
packages/sdk/src/signals/s4.ts                      — ЗАПРОСИТЬ
packages/sdk/src/signals/s5.ts                      — ЗАПРОСИТЬ
packages/player/src/lifecycle/outstream.ts          — ЗАПРОСИТЬ
packages/player/src/lifecycle/sticky.ts             — ЗАПРОСИТЬ
packages/player/src/lifecycle/instream.ts           — ЗАПРОСИТЬ
packages/player/src/measurement/sdk_bridge.ts       — ЗАПРОСИТЬ
packages/player/src/controls/skip.ts                — ЗАПРОСИТЬ
packages/backend/src/services/delivery/impression_context.ts        — ЗАПРОСИТЬ
packages/backend/src/services/delivery/impression_context_rules.ts  — ЗАПРОСИТЬ
packages/backend/src/jobs/sample_split.ts           — ЗАПРОСИТЬ
packages/shared/src/scoring/logistic_mle_fit.ts     — ЗАПРОСИТЬ
```

### Уже в истории сессии (повторно запрашивать не нужно)

```
shared: index.ts, types/index.ts, schemas/{delivery,impression,creative}.ts,
        scoring/{segments,signal_defaults,normalize,weights,score,capping}.ts
backend: db/schema.ts, services/bootstrap.ts, services/scoring.ts,
         services/configs/{weibull,logistic,s4,s5_logistic,s6_logistic,s7_quantile,weights,s2}_config.ts,
         services/calibration/{calibrations,calibrate_signals}.ts,
         services/delivery/embed.ts,
         jobs/{s1_weibull,s3_logistic,s6_logistic}_recalibration.ts,
         jobs/{s2_calibration,recalibration_sample,logistic_quality,scheduled_deletion}.ts,
         routes/{impressions,calibrations,s1_weibull,s3_logistic,s4_config,s5_logistic,s6_logistic,s7_quantile,weights_config}.ts,
         index.ts, server.ts
sdk: types.ts, signals/s2.ts
tag: config.ts, constants.ts
migrations: 0026, 0028, 0029, 0030, meta/_journal.json
```

### Нужны и для ключевых вопросов открытыми

```
packages/player/src/lifecycle/sticky.ts   — различает ли плеер закрытие зрителем
packages/player/src/lifecycle/outstream.ts  от штатного завершения ролика (closed_by_user)
```

---

## 12. Открытые вопросы

| № | Вопрос | Кому |
|---|---|---|
| 1 | `closed_by_user` — отличает ли текущая реализация нажатие крестика от штатного завершения? В delivery-событиях есть `closed` с `finalizationReason`, но различение видно только в коде плеера | разработчик, нужен код плеера |
| 2 | `inpage` — планируется к использованию или реализован на будущее? Показов ноль, 4 плейсмента настроены. От ответа зависит приоритет сегментов `outstream_inpage` | заказчик |
| 3 | Два плейсмента `standalone_video` в БД при отсутствии такой категории в интерфейсе — остатки экспериментов? Влияет на снятие `delivery_mode` | заказчик |
| 4 | Сетка значений и границы доли `y=1` для подбора параметров метки S6 (§7 ТЗ) | определяется по данным при реализации L2 |
| 5 | Значения весов профиля `video_outstream` (§12 ТЗ — вне объёма, определяет заказчик) | заказчик |

---

## 13. Чек-лист перед деплоем на прод

1. Завершить раздел 9.1 — без него backend не собирается;
2. `pnpm build` в корне — проверить сборку всех пакетов;
3. `pnpm test` — 91 тест должен проходить. Покрытия нет у player, display-runtime, embed, creative-bridge, media-worker, frontend (нет DOM-окружения);
4. Применить миграцию `0030` — выполняется автоматически при старте backend через `migrate()`;
5. Проверить, что `bootstrapS2Default` создал строку `global` в `s2_configs`;
6. Проверить, что `bootstrapS6Default` добавил 9 сегментов — ожидается 15 строк вместо 6:

```sql
SELECT segment_key, is_active, sample_size
FROM s6_logistic_configs ORDER BY segment_key;
```

7. Проверить, что `s2_model_version` заполняется у новых показов:

```sql
SELECT s2_model_version, COUNT(*), ROUND(AVG(s2_normalized)::numeric, 4)
FROM impressions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY 1;
```

8. После ближайшего воскресного прогона проверить появление черновиков промежуточного уровня:

```sql
SELECT segment_key, sample_size, auc, fitted_at
FROM s3_logistic_configs
WHERE sample_size > 0 ORDER BY fitted_at DESC;
```

Ожидаются ключи без разделителя `|` — `animated`, `video`, `static`.

**Гарантии сохранности данных, соблюдённые во всех поставках сессии:** ни одного `UPDATE` и ни одного `DELETE` по существующим конфигам и показам. Все 4469 показов, 4 строки `desktop|static` включая активную от 16.08, 6 сегментов S6 прежней схемы и нулевой `global` S3 остаются без изменений. Миграция только добавляет объекты.
