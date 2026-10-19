# CPMIND HANDOFF-3

**Дата сессии:** 06–07 октября 2026
**Предыдущий handoff:** `CPMIND_HANDOFF-2.md` от 23.09.2026
**Статус кодовой базы:** все девять пакетов собираются без ошибок
**Статус прода:** изменения **не выкачены**, применены только локально

---

## 0. Как читать этот файл

Файл описывает состояние системы на конец сессии 07.10.2026 и служит точкой входа для следующего исполнителя.

**Иерархия источников истины, строго в этом порядке:**

1. Реализованный код в репозитории;
2. Состояние БД на проде и локально (SQL-проверки раздела 4);
3. Этот handoff;
4. `CPMIND_HANDOFF-2.md` от 23.09 — для истории предыдущей сессии;
5. Спецификации `S6_split_instream_outstream_spec.md` и `CPMind_TZ_S2_Share_of_Screen.md` — **постановка целей заказчика, а не описание текущего состояния**. Обе написаны от состояния до 23.09 и содержат фактические ошибки (раздел 8);
6. Пакетная документация `docs/packages_information/*.md`, `ARCHITECTURE.md`, `PLACEMENT.md` — устарела, годится только для понимания общей логики.

**Обязательно к исполнению:** `ENGINEERING_INSTRUCTIONS.md` — инженерный контракт. Прикладывается к каждой сессии, применяется в полном объёме, по памяти не восстанавливается.

---

## 1. Задачи сессии и их статус

| № | Задача | Статус |
|---|---|---|
| К1 | Баг S3: для всех показов возвращается 50 вместо калиброванного значения | **закрыт** |
| К2 | Модификация S6: разделение логики instream и outstream | **закрыт** |
| К3 | Калибровка S2 по образцу остальных сигналов | **закрыт** |
| М1 | Фронтенд: человекочитаемые названия кампаний и креативов вместо UUID | не начато (TSX) |

---

## 2. Что сделано: слои поставок

Работа велась слоями, последовательно, с подтверждением на каждом шаге.

| Слой | Содержание | Статус |
|---|---|---|
| **L0** | Предпроверки по коду, диагностика D6, D7, D8 | закрыт |
| **L1.1** | Идемпотентный посегментный bootstrap для S4, S5, S6, S7 | закрыт |
| **L1.2** | Обучение промежуточной ступени `{group}` в джобах S1 и S3 | закрыт |
| **L2.1** | Схема сегментов S6: 4 группы, 2 независимые цепочки, уровни режима | закрыт |
| **L2.2** | Две модели S6, дискриминант `mode`, кламп `audibleRatio` | закрыт |
| **L2.3** | Три профиля весов, исчерпывающая таблица дефолтов | закрыт |
| **L2.4a** | Признак `closed_by_user` | закрыт |
| **L2.4b-1** | Фокус окна, непрерывный уход из вкладки, тишина прокрутки | закрыт |
| **L2.4b-2** | Отсутствие поверхности во вьюпорте, парковка на кнопке пропуска | закрыт |
| **L2.5** | Два джоба S6, метка §5, подбор порогов §7, правило нулевой дисперсии §3.3 | закрыт |
| **S2.1** | Модель S2: тип, дефолт, `interpolateCdf`, таблица, миграция `0030` | закрыт |
| **S2.2** | Резолв, джоб калибровки, seed | закрыт |
| **S2.3** | Маршрут, регистрация, запись версии модели, Δt-взвешивание в SDK | закрыт |
| **L3** | `s2_model_version` в административном контракте и CSV | закрыт |
| **L4** | D8 — `tag/config.ts` | закрыт |
| **FE-API** | Контракты фронтенда: S2, параметры метки, формулы | закрыт |

---

## 3. Реестр дефектов

| # | Дефект | Статус |
|---|---|---|
| D1 | `bootstrap*` проверяет непустоту таблицы вместо наличия каждого сегмента | **исправлен** |
| D2 | Нулевые коэффициенты у S3 `global` и сегментов S6 | **признан корректным поведением**, см. 5.3 |
| D3 | S6 не различает instream и outstream в формуле, признаках и метке | **исправлен** |
| D4 | Fallback подписывает out-stream сегментом `{device}\|non_skippable` | **исправлен** через D1 |
| D5 | S2 вне контура калибровки | **исправлен** |
| D6 | S2: не фиксируется `Δt` между отсчётами | **исправлен** |
| D7 | `toDeliveryMode` теряет `pauseroll` и `sticky` | **отложен**, см. 9.3 |
| D8 | `tag/config.ts` дублирует перечень типов креатива и регекс UUID | **исправлен** |
| D9 | `impressions.creative_type` объявлен как `text`, не enum | **отложен**, см. 9.3 |
| D10 | `weight_configs` нужны три `config_type` вместо двух | **исправлен** |
| D11 | `audibleRatio` может превысить 1 | **исправлен** |
| D12 | `getActiveWeightsConfig` молча отдаст баннерные веса новым категориям | **исправлен** |
| D13 | Промежуточная ступень цепочки fallback не обучается | **исправлен** для S1, S2, S3, S6 |
| D14 | Недостижимая ветка в `s4_config.ts`; `global` S7 отсутствует | **признан корректным**, см. 5.3 |
| **D15** | `pause_duration_total_ms` в S3 считается дважды | **новый, не исправлен**, см. 9.4 |

### Снято с учёта по результатам анализа кода

| Пункт | Основание |
|---|---|
| S2 §4.2 ТЗ — обрезка по вьюпорту | **уже реализована корректно** в `sdk/src/signals/s2.ts`, совпадает с формулой ТЗ построчно |
| S2 §4.3 ТЗ — капинг `share_of_screen_max_pct` | **уже реализован** в `capping.ts` плюс защита на уровне Zod |
| S2 §4.1 ТЗ — фоновая вкладка | **уже обработана** через `document.visibilityState !== 'visible'` |
| `embed.ts` читает `mode` вместо `format` | **не подтвердилось** — читает `format`, `mode` только fallback при `format IS NULL` |
| `tag/src/signals/s2.ts` — отдельная реализация | **не существует** — тег делегирует сбор в SDK через `MeasurementSurface` |

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

Один UUID у всех комбинаций — строка сегмента `global`.

### 4.2 S3 — содержимое таблицы конфигов (вся таблица, 5 строк)

```
 segment_key   | tag_const | is_active | sample_size | fitted_at
---------------+-----------+-----------+-------------+------------------
 desktop|static| v0        | f         |        1238 | 2026-08-23 05:00
 desktop|static| v0        | t         |        1421 | 2026-08-16 05:00
 desktop|static| v0        | f         |        1396 | 2026-08-09 05:00
 desktop|static| v0        | f         |        1263 | 2026-08-04 12:56
 global        | v0        | t         |           0 |
```

Четыре прогона по воскресеньям в 05:00 UTC, затем тишина с 23.08. **Джоб работает, механизм исправен.**

### 4.3 S6 — распределение версий моделей (окно 7 дней)

```
 s6_model_version | format    | subtype | device  | skippable | cnt | avg_s6
------------------+-----------+---------+---------+-----------+-----+--------
 37f2e229-...     | outstream | sticky  | desktop | f         | 351 | 50.0000
 c1a7d4ba-...     | outstream | sticky  | mobile  | f         |  54 | 50.0000
 8eb73791-...     | instream  | preroll | desktop | t         |  18 | 50.0000
 de0f05b7-...     | outstream | sticky  | tablet  | f         |   6 | 50.0000
```

### 4.4 S6 — содержимое таблицы конфигов до правок (6 строк)

```
 desktop|non_skippable | v0 | t | 0
 desktop|skippable     | v0 | t | 0
 mobile|non_skippable  | v0 | t | 0
 mobile|skippable      | v0 | t | 0
 tablet|non_skippable  | v0 | t | 0
 tablet|skippable      | v0 | t | 0
```

**Ключевой факт:** `bootstrapS6Default` в коде перечислял 15 сегментов, в БД было 6. Девять новых не создались. Четыре UUID из 4.3 однозначно ложатся на четыре строки прежней схемы.

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

89% видеотрафика — `outstream/sticky`. Показов `outstream/inpage` ноль. 67 legacy-видеопоказов — тестовые прогоны, подтверждено заказчиком, сохраняются.

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

Подтверждён D7: `sticky` и `inpage` делят одно значение `mode = 'outstream'`. Обнаружены 2 плейсмента `standalone_video`, которых по словам заказчика быть не должно; показов у них нет.

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

Версия констант одна — `v4`. Ни один лист не достигает порога 1000. Агрегаты: `video` = 622, `animated` = 634, суммарно 1317.

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

### 4.9 Типы креативов для проверки D9 (вся история)

```
 creative_type  | count
----------------+-------
 banner_static  |  2191
 video_creative |  1446
 banner_gif     |  1413
 banner_html5   |   111
```

Четыре значения, все входят в `creativeTypeEnum`. Посторонних нет.

### 4.10 Проверка миграций (локальная БД)

Миграция `0030` — таблица `s2_configs`, колонка `impressions.s2_model_version`, два индекса. Запись журнала `id = 33`.

Миграция `0031` — `label_params` и `label_positive_rate` в `s5_logistic_configs` и `s6_logistic_configs`. Запись журнала `id = 34`.

Обе применены, все объекты на месте.

### 4.11 Сегменты S6 после применения правок (локальная БД, 37 строк)

Состав:

| Группа | Строк |
|---|---|
| Новая схема: группы размещения | 12 |
| Новая схема: уровни режима | 8 |
| Прежняя схема (legacy) | 6 |
| Промежуточная схема от 23.09 | 9 |
| Тестовые строки | 2 |

**Девять строк промежуточной схемы** (`{device}|instream_skippable`, `{device}|instream_non_skippable`, `{device}|outstream`) больше не запрашиваются: `resolveS6SegmentKeys` их не формирует. Безвредны, но засоряют панель активации. Удалять штатным механизмом `schedule-delete`, если потребуется.

---

## 5. Разбор дефектов: механика

### 5.1 S3 — почему возвращалось 50

Ключ сегмента строится в `routes/impressions.ts`:

```
banner_gif, banner_html5 → animated
video_creative           → video
остальное                → static
segmentKey = `${device_type}|${creativeGroup}`
```

Цепочка: `{device}|{group}` → `{group}` → `global` → `DEFAULT_LOGISTIC_PARAMS`.

Трафик — только `banner_gif` и `video_creative`, то есть группы `animated` и `video`. Единственная обученная модель — `desktop|static`, статических показов нет. Цепочка доходит до `global` с нулевыми β: `sigmoid(0) = 0.5` → **S3 = 50**.

**Корень:** изменился состав типов креативов → данные перестали поступать в сегменты, где есть модели → для новых сегментов моделей нет → fallback на нулевой `global`.

**Усугубляющий фактор (D13):** ступени `{group}` и `global` **никем не обучались**. Джоб писал только полные ключи, в `global` писал только bootstrap, и только нули. Трёхуровневая цепочка была фактически двухуровневой, а второй уровень — константа.

### 5.2 S6 — почему возвращалось 50

`bootstrapS6Default` выходил по раннему `return`, увидев 6 строк прежней схемы, и не вставлял 9 новых. Цепочка падала на второй уровень — сегмент прежней схемы `{device}|{skippable}` — и находила там нулевую модель.

**Цена:** у видео S6 весит 0.40, S3 — 0.10. Половина итогового Score формировалась двумя константами, при этом в панели у каждого показа стоял UUID модели — внешне неотличимо от работающей калибровки.

### 5.3 Решения, принятые после обсуждения с заказчиком

Зафиксировано, чтобы следующий исполнитель не предлагал заново:

| Предложение | Решение | Основание |
|---|---|---|
| Колонка `origin` (`seed`/`fitted`) | **отклонено** | Версионирование уже есть: `s*_model_version` хранит UUID строки, а `sample_size = 0` и `auc IS NULL` отличают seed от обученной модели |
| Экспертные приоры вместо нулей для S3 и S6 | **отклонено** | Нулевой старт — корректная логика калибровки: коэффициенты формируются по мере накопления данных сегмента |
| Калибровка уровня `global` | **отклонено** | Смешивает несопоставимое (скролл по странице с видео и с баннером). Противоречит смыслу сегментации |
| Калибровка промежуточного уровня `{group}` | **принято** | Однородно по типу креатива, различие устройств снимается z-score. Даёт плавную деградацию |
| Единый последовательный раннер калибровок | **отклонено** | Схема из шести cron-слотов работает. Для S2 и второго джоба S6 выделены отдельные слоты |
| `global` для S7 в bootstrap | **отклонено** | `DEFAULT_S7_THRESHOLDS` задаёт разные пороги для устройств; общего набора не существует, строка `global` перехватывала бы ступень |
| Уникальные индексы `(segment_key, tag_constants_version)` под `ON CONFLICT` | **отклонено** | Таблицы хранят историю обучения: у `desktop\|static` четыре строки с одной парой |
| `MIN_SAMPLE_SIZE` снизить под текущий трафик | **отклонено** | Стадия MVP, данные копятся. Логика строится под полную схему |
| Минимальный порог AUC для сохранения черновика | **отклонено** | Нужна истинная картина. Низкая точность — сигнал проверить формулы и сбор |
| Миграция профиля `video` → `video_instream` (ТЗ §6.1) | **отклонено** | `impressions.weights_version` у 948 видеопоказов и `calibration_items` ссылаются на существующую версию. Создан новый профиль, старый сохранён |
| Передавать режим показа в payload (ТЗ §8.1) | **отклонено** | Сервер знает режим из `ad_session`. Поле в payload было бы вторым источником истины, управляемым клиентом |
| Отдельный ключ `outstream_embedded` (ТЗ §6.3) | **отклонено** | `inpage` и есть встроенный формат: реализован, настроен, ждёт трафика |
| Zod-схемы в `tag/config.ts` | **отклонено** | Дало четырёхкратный рост бандла (54.4 → 223.9 КБ). Заменено на `Record<CreativeType, true>` |

---

## 6. Реализованные решения

### 6.1 Модель S2 — эмпирическая CDF по квантилям

**Было:** `S2 = min(100, sqrt(share_of_screen_avg_pct) × 10)` — параметров нет, калибровать нечего.

**Стало:** `S2 = 100 × F̂(share_of_screen_avg_pct)`, где `F̂` — эмпирическая функция распределения доли экрана в сегменте, заданная 11 опорными квантилями (p01, p10…p90, p99) с монотонной кусочно-линейной интерполяцией.

**Почему эта форма** (рассматривались степенная `a × x^b` и кусочно-постоянная по образцу S7):

1. **Соответствует смыслу сигнала.** Показ с 8% при медиане сегмента 3% — хороший; при медиане 15% — плохой. Абсолютное значение этого не выражает, перцентиль выражает;
2. **Решает проблему сжатия диапазона** из §4.5 ТЗ. В тестах `avg_pct` держался в коридоре 7.3–8.1%, что давало S2 в полосе 27.0–28.5 — сигнал с весом 0.20 не различал показы;
3. **Использует весь диапазон по построению.** У степенной формулы верх шкалы недостижим: баннер не занимает 100% экрана;
4. **Согласован с S1,** который реализован как `Weibull CDF × 100`;
5. **Устойчив на малых выборках** — квантили как порядковые статистики нечувствительны к выбросам.

**Обратная совместимость.** `DEFAULT_S2_PARAMS` рассчитан из тождества `100 × p = sqrt(x) × 10`, то есть `x = 100 × p²`. До первой калибровки нормализация воспроизводит прежнюю формулу: на опорных точках совпадение точное, между ними отклонение не более 0.7 пункта (при 50% — 70.00 против 70.71).

**Архитектурные детали:**

- колонки `tag_constants_version` у таблицы нет: после Δt-взвешивания величина инвариантна к `S2_SAMPLE_INTERVAL_MS`;
- сегментация `{device}|{creative_group}`, та же, что у S1, с обучением промежуточного уровня;
- отбор выборки `sdkOnly: true`: бандлы тега `v0`–`v4` у издателей продолжат слать невзвешенное среднее;
- отбраковка вырожденного распределения: разброс между крайними квантилями менее `MIN_SPREAD_PCT = 0.05` → черновик не сохраняется;
- защита от непригодной конфигурации: `rowToParams` возвращает `null` при неразобранном jsonb или несовпадении длин массивов, строка пропускается; `activateS2Config` отклоняет активацию с кодом `S2_CONFIG_QUANTILES_INVALID`.

### 6.2 Δt-взвешивание в SDK

**Было:** `shareOfScreenSamples: number[]`, среднее по количеству отсчётов.

**Стало:** два скаляра — `shareOfScreenWeightedSumPct` и `shareOfScreenWeightMs`, среднее как `Σ(share × Δt) / Σ(Δt)`.

Решение отличается от ТЗ §4.1 (там предлагался массив пар) по трём причинам: память O(1) вместо неограниченного роста (при капинге 3600 с и интервале 500 мс — 7200 элементов на сегмент); результат идентичен; нет промежуточного состояния для `buildPayload`.

**Обработка разрывов наблюдения.** Якорь привязки сбрасывается при трёх условиях: креатив вне поля зрения, скрытая вкладка, нулевая площадь вьюпорта. Без сброса 30 секунд скрытой вкладки были бы засчитаны последней наблюдённой доле. Задержка таймера под нагрузкой ограничена двумя штатными интервалами (`MAX_SAMPLE_GAP_FACTOR = 2`).

**Эквивалентность при равномерных тиках:** `Σ(share_i × Δ) / Σ(Δ) = Σ(share_i) / n` — прежнее среднее. Значения на корректно собранных показах не меняются.

### 6.3 Разделение S6 на две модели

**Схема сегментов:**

```
instream|{device}|{skippable}      — 6
outstream_sticky|{device}          — 3
outstream_inpage|{device}          — 3
```

Плюс уровни режима: `{mode}|{device}` — 6, `{mode}|global` — 2. Плюс 6 сегментов прежней схемы для показов тега.

**Цепочки независимы:** группа → `{mode}|{device}` → `{mode}|global` → сегмент прежней схемы. Показ in-stream никогда не получает модель, обученную на out-stream.

**Почему `sticky` и `inpage` разделены.** Подтверждено кодом плеера: `sticky.ts` не создаёт наблюдателей вьюпорта вообще («видна с момента монтирования и не зависит от прокрутки»), `outstream.ts` ставит показ на паузу при `onViewportExit`. У sticky досмотр высокий — окно не исчезает; у inpage фрагментарный — паузы рвут просмотр. Общий z-score исказил бы оба.

**Состав признаков (по 9 коэффициентов):**

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

Различие в одной позиции. Структура instream совпадает с прежней `normalizeS6` — существующие конфиги не переинтерпретируются.

**Почему `muted_throughout` остаётся в обеих моделях** (предлагалось убрать как коллинеарный, отклонено заказчиком):

| Признак | instream (старт со звуком) | outstream (старт без звука) |
|---|---|---|
| `muted_throughout = true` | зритель **заглушил** — негативный сигнал | зритель **не включил** — нейтральное состояние |
| `unmuted_by_user = true` | возврат звука после заглушения | зритель **включил** — сильный позитивный сигнал |

Один признак с противоположным смыслом — содержательная причина разделения моделей.

**Почему `play_initiated` и `start_muted` исключены:** определяются форматом, а не поведением зрителя. Instream стартует всегда; sticky — автоплей; inpage — по клику. Внутри каждого сегмента признак вырожден.

**Типовая защита.** Поле `mode` как дискриминант размеченного объединения: без него структурная типизация TypeScript пропустила бы передачу outstream-параметров в instream-функцию, и β7 читался бы как другой признак.

### 6.4 Метка обучения S6

Прежняя метка (`completion` + звук) нарушала критерий §9.3 ТЗ: `completion` входит в β1 и β2, `unmuted_by_user` — в β5, `muted_throughout` — в β4. Коэффициенты расходились бы.

**Новая метка** строится только на полях присутствия зрителя, не пересекающихся с признаками:

| Формат | Жёсткие условия |
|---|---|
| in-stream | вкладка активна, окно в фокусе, нет парковки на кнопке пропуска |
| outstream / sticky | вкладка активна, окно в фокусе, прокрутка остановлена ≥ порога |
| outstream / inpage | вкладка активна, окно в фокусе, поверхность не уходила из вьюпорта дольше порога |

**Предикат парковки.** Буквальная формулировка ТЗ §5.2 («курсор в зоне кнопки и нигде больше не двигался») не работает: условие выполняется и для внимательного зрителя, не трогающего мышь. Собираются две величины — `skip_zone_hover_ratio` и `skip_zone_moved_outside`; метка обнуляется при `ratio ≥ порога И moved_outside = false`.

**Подбор порогов (§7).** Джоб перебирает сетку, отбрасывает комбинации с долей `y=1` вне 20–60%, среди оставшихся выбирает минимальную неустойчивость коэффициентов между обучающей и отложенной частью. Отбор **не по точности** — она зависит от самой метки. Выбранная комбинация сохраняется в `label_params` вместе с коэффициентами.

**Дедупликация разметок.** Комбинации, дающие одинаковый вектор меток, обучаются один раз: сегмент `outstream_sticky` нечувствителен к `viewportAbsentMaxMs`, `inpage` — к `scrollQuietMinMs`.

### 6.5 Собираемые поля метки

| Поле | Сигнал | Источник |
|---|---|---|
| `tab_absent_max_ms` | S4 | выводится из `visibility_state_history` |
| `window_unfocused_max_ms` | S4 | новые обработчики `focus`/`blur` |
| `surface_absent_max_ms` | S4 | события `viewport_enter`/`viewport_exit` от плеера |
| `scroll_quiet_max_ms` | S3 | якорь паузы вынесен в сессию |
| `skip_zone_hover_ratio` | S5 | геометрия кнопки передаётся через `trackSkipZone` |
| `skip_zone_moved_outside` | S5 | то же |
| `closed_by_user` | S6 | событие `close` с источником действия |

Все поля `optional` — бандлы, собранные ранее, их не отправляют.

**Различение «нет данных» и «нуля».** `surface_absent_max_ms` остаётся `null`, пока рантайм не сообщил ни одного события наблюдения: для `sticky` и `instream` поле уйдёт как `null`, и джоб не примет его за нулевое отсутствие.

### 6.6 Три профиля весов

`banner`, `video`, `video_instream`, `video_outstream`. Миграция не потребовалась: `config_type` — `text` с partial unique индексом.

`DEFAULT_WEIGHTS_BY_CATEGORY` объявлен как `Record<CreativeCategory, WeightsValues>` — пропуск категории даёт ошибку компиляции. Прежний тернарник отправлял новые категории в баннерные веса молча (D12).

Значения `video_instream` и `video_outstream` пока совпадают — расхождение вносит заказчик через панель (§12 ТЗ).

### 6.7 D8 — `tag/config.ts`

Массив `CreativeType[]` заменён на `Record<CreativeType, true>`:

| Изменение в `CreativeTypeSchema` | Массив (было) | `Record` (стало) |
|---|---|---|
| Значение удалено | ошибка | ошибка |
| **Значение добавлено** | **молчит** | **ошибка** |

Двунаправленная защита без рантайм-зависимости. Добавлена диагностика отказа через `console.warn` под условием `debug`: прежде `parseConfig → null` не оставлял следа ни в консоли, ни в логах.

**Попытка использовать Zod-схемы отвергнута:** `import type` стирается при компиляции, поэтому `CreativeTypeSchema` как значение тянет рантайм Zod целиком — бандл тега вырос с 54.4 до 223.9 КБ. Текущий размер 55.3 КБ.

---

## 7. Cron-расписание

| Время (UTC) | Джоб | Статус |
|---|---|---|
| 03:00 ежедневно | retention — удаление показов старше 90 дней | работает |
| 03:30 ежедневно | asset_gc | работает |
| каждые 15 мин | scheduled_deletion (включая S2) + очистка черновиков калибровки | работает |
| каждые 30 мин | IVT-анализ частоты по `fp_hash` | работает |
| вс 04:00 | S1 Weibull | работает |
| вс 05:00 | S3 Logistic | работает |
| вс 06:00 | S5 Logistic | работает |
| вс 07:00 | **S6 Logistic instream** | новый |
| вс 08:00 | **S6 Logistic outstream** | новый |
| 1-е, 06:00 | S4 | работает |
| 1-е, 08:00 | S7 | работает |
| 1-е, 10:00 | **S2** | новый |

**Известный риск:** `cron.schedule` не блокирует повторный запуск. Если прогон не уложится в час, следующий джоб стартует параллельно. При текущих объёмах не проявляется.

---

## 8. Расхождения спецификаций с кодом

Обе спецификации написаны от состояния до 23.09. Зафиксировано, чтобы следующий исполнитель не реализовывал их буквально.

### 8.1 `S6_split_instream_outstream_spec.md`

| Пункт | Утверждение | Факт |
|---|---|---|
| §1 | «Сейчас S6 — одна модель, сегментация `device × skippable`, 6 сегментов» | Разделение по группам реализовано 23.09, формат ключа другой |
| §3.1 | «Набор признаков совпадает с текущим» | **Не совпадает.** Совпадают только β0, β1 и β8 |
| §10.1 | «В реализации нет `muted_throughout`, вместо него `play_initiated`» | **Инвертировано.** В коде `muted_throughout` стоит на β4, `play_initiated` в комбинации отсутствует |
| §2 | «Формат outstream сейчас только sticky» | По факту трафика верно, но `inpage` полностью реализован и настроен |
| §2 | «Режим берётся из `delivery_mode`» | Источник истины — `format`/`subtype`; `delivery_mode` не различает `sticky`/`inpage`/`pauseroll` |
| §3.3 | `quartileOrdinal ∈ {0,1,2,3,4}` | Шкала 100 / 75 / 50 / 25 / 10 / 0 |
| §5.2 усл. 4 | «Курсор в зоне кнопки и нигде больше не двигался» | Предикат переработан, см. 6.4 |
| §8.1 | «Передавать режим показа в payload» | **Отклонено**, см. 5.3 |
| §6.3 | «Заложить `outstream_embedded` на будущее» | `inpage` и есть этот формат |

### 8.2 `CPMind_TZ_S2_Share_of_Screen.md`

| Пункт | Утверждение | Факт |
|---|---|---|
| §4.4 | «Вариант A — ничего не менять» | **Отменено решением заказчика:** реализована параметрическая модель |
| §4.2 | «Потенциальный реальный баг — обрезка по вьюпорту» | Реализована корректно |
| §4.3 | «Капинг `max_pct` отсутствует» | Присутствует |
| §4.1 | «Проверить равномерность тиков» | Подтверждено частично: фоновая вкладка отсечена, `Δt` не фиксировался |

---

## 9. Что осталось сделать

### 9.1 Фронтенд (следующая сессия)

Контракты API готовы (`admin/api.ts`, `signal-formulas.ts`). Остались TSX-компоненты:

| № | Задача | Что сделать |
|---|---|---|
| 1 | **M1** | Человекочитаемые названия кампаний и креативов вместо UUID. Серверная часть готова: `campaign_name` и `creative_name` приходят в `ImpressionRow`, фильтр `campaignUuid` работает, колонки в CSV есть. Для legacy-показов имена `null` — показывать ключ |
| 2 | `s2_model_version` | Отобразить в детальном виде показа рядом с остальными версиями моделей |
| 3 | Вкладка S2 | Добавить в панель формул: определение готово в `signal-formulas.ts`, нужен рендер вкладки |
| 4 | Страница конфигов S2 | По образцу `s1-weibull`: список, активация, деактивация, отложенное удаление. API-функции готовы |
| 5 | Параметры метки S6 | Отобразить `labelParams` и `labelPositiveRate` в черновиках. Поля в контракте есть |
| 6 | Профили весов | Расширить выбор `configType` до четырёх значений в форме создания |

**Нужны компоненты:** таблица показов, детальный вид показа, страницы конфигов сигналов, страница весов, панель формул. Структура каталога — раздел 11.

### 9.2 Эксплуатация перед деплоем

1. **Поднять версии рантаймов** в `/opt/cpmind/.env`: `DISPLAY_RUNTIME_VERSION`, `PLAYER_RUNTIME_VERSION`, `LOADER_RUNTIME_VERSION`. При `RUNTIME_PUBLISH_ALLOW_OVERWRITE=false` бандлы с Δt-взвешиванием и новыми полями метки иначе не опубликуются;
2. **Применить миграции** `0030` и `0031` — автоматически при старте backend;
3. **Проверить bootstrap**: `s2_configs` должен получить строку `global`, `s6_logistic_configs` — новые сегменты;
4. **Первая калибровка S2 — не раньше 30 дней после выката SDK.** До этого окно обучения содержит невзвешенные значения; калибровать на них — закрепить артефакт.

### 9.3 Отложенные дефекты

| Дефект | Почему отложен |
|---|---|
| **D7** — снятие `delivery_mode` | Затрагивает `schema.ts`, три таблицы, миграцию с `DROP COLUMN`, `embed.ts`, `sessions.ts`, `impression_context.ts`, `delivery.ts`. Сейчас безвреден: все резолверы читают `format`/`subtype` |
| **D9** — `creative_type` как enum | `drizzle-kit` на смену типа колонки генерирует `DROP COLUMN` + `ADD COLUMN` — это уничтожит 5161 значение. Миграцию пришлось бы писать руками. Польза формальная |

### 9.4 Новый дефект D15

В `sdk/src/signals/s3.ts` поле `pause_duration_total_ms` считается дважды: `pauseCheckInterval` прибавляет 100 мс на тик, а `onScroll` при завершении паузы прибавляет весь прошедший интервал целиком.

Поле не входит в вектор признаков S3 — на Score не влияет, искажает только CSV и панель. Новое поле `scroll_quiet_max_ms` считается независимо и дефекта не наследует.

Требует отдельного решения: исправлять ли и пересчитывать ли исторические значения.

### 9.5 Пробел по §5.2 условие 3 ТЗ

Для in-stream уход плеера из области просмотра не отслеживается: `attachNative` не создаёт наблюдателя пересечения — реклама играет внутри content video издателя. Поле `surface_absent_max_ms` для in-stream приходит `null`, условие в метке реализовано, но всегда проходит.

Закрытие требует наблюдателя над контейнером оверлея в `attachNative`. **Решение заказчика не получено.**

### 9.6 Сетка подбора порогов не обоснована данными

Значения взяты из §5.4 ТЗ, которое само называет их инженерными допущениями. §11.5 выносит сетку в вопросы к исполнителю.

| Параметр | Сетка | Источник |
|---|---|---|
| `T_tab_absent` | 500, 1000, 2000 мс | ТЗ ±2× |
| `T_viewport_absent` | 1000, 2000, 4000 мс | ТЗ ±2× |
| `T_scroll_quiet` | 2000, 3000, 5000 мс | ТЗ ±2× |
| `P_skip_parking` | 0.60, 0.70, 0.85 | ТЗ ±0.10 |
| Доля `y=1` | 20–60% | §7.4 ТЗ |
| Допуск неустойчивости | 0.35 | **придумано исполнителем**, в ТЗ числа нет |

Конструкция устроена так, что неудачная сетка даёт **отсутствие модели, а не плохую модель**: комбинации вне границ отбрасываются до обучения, при отсутствии подходящих черновик не создаётся с записью причины в лог.

**Пересмотр после месяца сбора**, по квантилям реального трафика:

```sql
SELECT
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY (signals_raw->'s4'->>'tab_absent_max_ms')::numeric) AS p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY (signals_raw->'s4'->>'tab_absent_max_ms')::numeric) AS p75,
  percentile_cont(0.9)  WITHIN GROUP (ORDER BY (signals_raw->'s4'->>'tab_absent_max_ms')::numeric) AS p90
FROM impressions
WHERE creative_type = 'video_creative'
  AND signals_raw->'s4' ? 'tab_absent_max_ms';
```

### 9.7 `label_params` в `s5_logistic_configs`

Колонки добавлены миграцией `0031`, но джоб S5 их не пишет и резолвер не читает. Прокси-метка S5 (`clicked ИЛИ hover ≥ p75`) строится из данных показа, а не из порогов присутствия зрителя — перебирать там нечего.

**Требует решения:** реализовать подбор метки для S5 либо убрать колонки. Колонка без читающего и пишущего кода стареет и вводит в заблуждение. Заказчик отложил до деплоя.

---

## 10. Чек-лист перед деплоем

1. `pnpm build` в корне — проверить сборку всех пакетов;
2. `pnpm test` — 91 тест. Покрытия нет у player, display-runtime, embed, creative-bridge, media-worker, frontend;
3. Поднять версии рантаймов в `/opt/cpmind/.env`;
4. Применить миграции — автоматически при старте backend;
5. Проверить bootstrap S2:

```sql
SELECT segment_key, is_active, sample_size FROM s2_configs;
```

Ожидается строка `global` с `sample_size = 0`.

6. Проверить сегменты S6:

```sql
SELECT segment_key, is_active, sample_size, label_positive_rate
FROM s6_logistic_configs ORDER BY segment_key;
```

Ожидаются новые ключи `instream|{device}|{skippable}`, `outstream_sticky|{device}`, `outstream_inpage|{device}`, уровни режима и сегменты прежней схемы.

7. Проверить заполнение версии модели S2:

```sql
SELECT s2_model_version, COUNT(*), ROUND(AVG(s2_normalized)::numeric, 4)
FROM impressions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY 1;
```

8. Проверить атрибуцию S6 после выката:

```sql
SELECT s6_model_version, format, subtype, device_type, COUNT(*)
FROM impressions
WHERE created_at > NOW() - INTERVAL '1 day'
  AND creative_type = 'video_creative'
GROUP BY 1, 2, 3, 4;
```

Out-stream должен получить ключи `outstream_sticky|{device}`, а не `{device}|non_skippable`.

9. После первого воскресного прогона проверить черновики промежуточного уровня:

```sql
SELECT segment_key, sample_size, auc, fitted_at
FROM s3_logistic_configs WHERE sample_size > 0 ORDER BY fitted_at DESC;
```

Ожидаются ключи без разделителя — `animated`, `video`, `static`.

**Гарантии сохранности данных, соблюдённые во всех поставках сессии:** ни одного `UPDATE` и ни одного `DELETE` по существующим конфигам и показам. Все 4469 показов, 4 строки `desktop|static` включая активную от 16.08, 6 сегментов S6 прежней схемы, 9 сегментов промежуточной схемы и нулевой `global` S3 остаются без изменений. Миграции только добавляют объекты.

---

## 11. Структура пакета packages/frontend/

```
├── [FILE] .env.local
├── [FILE] Dockerfile
├── [FILE] next-env.d.ts
├── [FILE] next.config.mjs
├── [FILE] package.json
├── [DIR] src
    ├── [DIR] app
        ├── [DIR] (workspace)
            ├── [DIR] campaigns
                ├── [DIR] [uuid]
                    ├── [FILE] page.tsx
                    ├── [DIR] upload
                        ├── [FILE] UploadFlowClient.tsx
                        ├── [FILE] page.tsx
                ├── [FILE] page.tsx
            ├── [DIR] creatives
                ├── [DIR] [uuid]
                    ├── [FILE] page.tsx
                ├── [FILE] page.tsx
            ├── [FILE] layout.tsx
            ├── [DIR] placements
                ├── [DIR] [uuid]
                    ├── [FILE] PlacementActions.tsx
                    ├── [FILE] page.tsx
                ├── [FILE] page.tsx
            ├── [DIR] uploads
                ├── [FILE] page.tsx
        ├── [DIR] admin
            ├── [DIR] impressions
                ├── [DIR] [id]
                    ├── [FILE] page.tsx
                ├── [FILE] page.tsx
            ├── [DIR] ivt
                ├── [FILE] page.tsx
            ├── [FILE] layout.tsx
            ├── [DIR] signals
                ├── [FILE] page.tsx
            ├── [DIR] tag_constants
                ├── [FILE] page.tsx
            ├── [DIR] users_panel
                ├── [FILE] page.tsx
            ├── [DIR] weights
                ├── [FILE] page.tsx
                ├── [DIR] recalculate
                    ├── [FILE] page.tsx
        ├── [FILE] globals.css
        ├── [FILE] layout.tsx
        ├── [DIR] login
            ├── [FILE] page.tsx
        ├── [FILE] page.tsx
        ├── [DIR] user
            ├── [DIR] impressions
                ├── [FILE] page.tsx
            ├── [FILE] layout.tsx
            ├── [DIR] panel
                ├── [FILE] page.tsx
    ├── [DIR] components
        ├── [FILE] Pagination.tsx
        ├── [DIR] admin
            ├── [FILE] CreateUserForm.tsx
            ├── [FILE] ExportButton.tsx
            ├── [FILE] Filters.tsx
            ├── [FILE] FormulaCard.tsx
            ├── [FILE] ImpressionDetail.tsx
            ├── [FILE] ImpressionsTable.tsx
            ├── [FILE] IvtListEntriesModal.tsx
            ├── [FILE] IvtPanel.tsx
            ├── [FILE] LogoutButton.tsx
            ├── [FILE] RecalibrationActionBar.tsx
            ├── [FILE] RecalibrationTable.tsx
            ├── [FILE] RecalibrationWorkspace.tsx
            ├── [FILE] SignalFilterModal.tsx
            ├── [FILE] SignalModelsPanel.tsx
            ├── [FILE] TagConstantsPanel.tsx
            ├── [FILE] UserActionsMenu.tsx
            ├── [FILE] UsersPanelTable.tsx
            ├── [FILE] WeightVersionPicker.tsx
            ├── [FILE] WeightsConfigPanel.tsx
        ├── [DIR] shared
            ├── [FILE] CampaignCreateForm.tsx
            ├── [FILE] CampaignListClient.tsx
            ├── [FILE] CollapsiblePreview.tsx
            ├── [FILE] Combobox.tsx
            ├── [FILE] ComboboxDatePicker.tsx
            ├── [FILE] ConfirmationForm.tsx
            ├── [FILE] CopyableText.tsx
            ├── [FILE] CreativePlacementPanel.tsx
            ├── [FILE] CreativePreview.tsx
            ├── [FILE] CreativeStatusBadge.tsx
            ├── [FILE] InlinePlacementForm.tsx
            ├── [FILE] LoginForm.tsx
            ├── [FILE] LogoutButton.tsx
            ├── [FILE] PlacementCreativeSetEditor.tsx
            ├── [FILE] PlacementEmbedModal.tsx
            ├── [FILE] ProcessingPoller.tsx
            ├── [FILE] ProcessingRefresh.tsx
            ├── [FILE] UploadFlow.tsx
            ├── [FILE] WorkspaceNav.tsx
        ├── [DIR] user
            ├── [FILE] ExportButton.tsx
            ├── [FILE] Filters.tsx
            ├── [FILE] ImpressionsTable.tsx
            ├── [FILE] SignalFilterModal.tsx
            ├── [FILE] TagBuilderModal.tsx
            ├── [FILE] UserCampaignsTable.tsx
    ├── [DIR] lib
        ├── [DIR] admin
            ├── [FILE] api.ts
            ├── [FILE] search-params.ts
            ├── [FILE] segment-color.ts
            ├── [FILE] signal-formulas.ts
            ├── [FILE] types.ts
            ├── [FILE] upload-api.ts
        ├── [DIR] config
            ├── [FILE] index.ts
        ├── [DIR] shared
            ├── [FILE] auth.ts
            ├── [FILE] date.ts
            ├── [FILE] env.ts
            ├── [FILE] signals-meta.ts
            ├── [FILE] tag-builder.ts
            ├── [FILE] types.ts
            ├── [FILE] use-popover.ts
        ├── [DIR] user
            ├── [FILE] api.ts
            ├── [FILE] search-params.ts
            ├── [FILE] types.ts
    ├── [FILE] middleware.ts
    ├── [DIR] styles
        ├── [FILE] campaigns.module.css
        ├── [FILE] combobox.module.css
        ├── [FILE] components.module.css
        ├── [FILE] confirmation-form.module.css
        ├── [FILE] copyable-text.module.css
        ├── [FILE] create-user-form.module.css
        ├── [FILE] creative-detail.module.css
        ├── [FILE] creative-placement-panel.module.css
        ├── [FILE] creative-preview.module.css
        ├── [FILE] creative-status-badge.module.css
        ├── [FILE] creatives.module.css
        ├── [FILE] detail-page.module.css
        ├── [FILE] detail.module.css
        ├── [FILE] filters.module.css
        ├── [FILE] formula-card.module.css
        ├── [FILE] impressions.module.css
        ├── [FILE] inline-placement-form.module.css
        ├── [FILE] ivt-list-entries-modal.module.css
        ├── [FILE] ivt-panel.module.css
        ├── [FILE] ivt.module.css
        ├── [FILE] login.module.css
        ├── [FILE] logout-button.module.css
        ├── [FILE] pagination.module.css
        ├── [FILE] placement-creative-set.module.css
        ├── [FILE] placement-detail.module.css
        ├── [FILE] placement-embed-modal.module.css
        ├── [FILE] placements.module.css
        ├── [FILE] processing-poller.module.css
        ├── [FILE] recalibration.module.css
        ├── [FILE] signal-filter-modal.module.css
        ├── [FILE] signal-models.module.css
        ├── [FILE] signals.module.css
        ├── [FILE] table.module.css
        ├── [FILE] tag-builder-modal.module.css
        ├── [FILE] tag-constants.module.css
        ├── [FILE] upload-flow.module.css
        ├── [FILE] uploads.module.css
        ├── [FILE] user_panel.module.css
        ├── [FILE] users_panel.module.css
        ├── [FILE] weights-panel.module.css
        ├── [FILE] weights.module.css
        ├── [FILE] workspace-nav.module.css
    ├── [DIR] types
        ├── [FILE] css.d.ts
├── [FILE] tsconfig.json
├── [FILE] tsconfig.tsbuildinfo
```

---

## 12. Компоненты, которые понадобятся следующему исполнителю

### Для фронтенда (раздел 9.1)

```
packages/frontend/src/app/**                  — страницы и компоненты, ЗАПРОСИТЬ
packages/frontend/src/components/**           — ЗАПРОСИТЬ
packages/frontend/src/lib/shared/types.ts     — ЗАПРОСИТЬ
packages/frontend/src/lib/shared/env.ts       — ЗАПРОСИТЬ
```

### Уже в истории сессии (повторно запрашивать не нужно)

```
shared: index.ts, types/index.ts,
        schemas/{api,creative,delivery,impression,player,tag}.ts,
        scoring/{segments,signal_defaults,normalize,weights,score,capping}.ts
backend: db/schema.ts, index.ts, server.ts,
         services/bootstrap.ts, services/scoring.ts, services/csv.ts, services/impressions.ts,
         services/configs/{weibull,s2,logistic,s4,s5_logistic,s6_logistic,s7_quantile,weights}_config.ts,
         services/configs/s6_label.ts,
         services/calibration/{calibrations,calibrate_signals}.ts,
         services/delivery/{embed,impression_context,impression_context_rules}.ts,
         jobs/{s1_weibull,s3_logistic,s6_logistic}_recalibration.ts,
         jobs/{s2_calibration,recalibration_sample,logistic_quality,scheduled_deletion}.ts,
         routes/{impressions,calibrations,s1_weibull,s2_config,s3_logistic,s4_config,
                 s5_logistic,s6_logistic,s7_quantile,weights_config}.ts
sdk: types.ts, session.ts, public_api.ts, index.ts, surface/surface.ts, debug/overlay.ts,
     signals/{s2,s3,s4,s5,s6}.ts
player: player.ts, public_api.ts, index.ts, measurement/sdk_bridge.ts,
        lifecycle/{instream,outstream,sticky,viewport}.ts,
        controls/{controls,skip,close,play,seek,seek_buttons,volume,keyboard}.ts
tag: config.ts, constants.ts, types.ts
frontend: lib/admin/api.ts, lib/user/api.ts, lib/admin/signal-formulas.ts
migrations: 0026, 0028, 0029, 0030, 0031, meta/_journal.json
```

---

## 13. Открытые вопросы

| № | Вопрос | Кому |
|---|---|---|
| 1 | §5.2 условие 3: добавлять ли наблюдатель вьюпорта для in-stream в `attachNative`? | заказчик |
| 2 | `label_params` в S5: реализовать подбор метки или убрать колонки? | заказчик |
| 3 | D15: исправлять ли двойной счёт `pause_duration_total_ms` и пересчитывать ли историю? | заказчик |
| 4 | `inpage`: планируется к использованию или реализован на будущее? Показов ноль, 4 плейсмента настроены | заказчик |
| 5 | Два плейсмента `standalone_video` в БД при отсутствии категории в интерфейсе — остатки экспериментов? | заказчик |
| 6 | Значения весов профиля `video_outstream` (§12 ТЗ — вне объёма, определяет заказчик) | Степан |
| 7 | Девять сегментов S6 промежуточной схемы от 23.09 больше не используются — удалять через `schedule-delete`? | заказчик |
