# CPMind — Тестовые сценарии

Документ описывает сценарии тестирования системы CPMind: от проверки отдельных сигналов до нагрузочного тестирования. Каждый сценарий включает условия, ожидаемые результаты и инструкции по проверке.

---

## Содержание

1. [Подготовка к тестированию](#подготовка-к-тестированию)
2. [Сценарии тега (browser)](#сценарии-тега-browser)
3. [Сценарии API (curl)](#сценарии-api-curl)
4. [Сценарии панели аналитики](#сценарии-панели-аналитики)
5. [Сценарии БД](#сценарии-бд)
6. [Нагрузочное тестирование](#нагрузочное-тестирование)
7. [Сценарии безопасности](#сценарии-безопасности)
8. [Синтетические данные для проверки формул](#синтетические-данные-для-проверки-формул)

---

## Подготовка к тестированию

### Локальное окружение (Dev)

```bash
# Запустить все сервисы
pnpm dev:backend     # Terminal 1
pnpm dev:frontend    # Terminal 2
pnpm dev:tag         # Terminal 3
python3 -m http.server 8080  # Terminal 4 (из корня монорепо)
```

Тестовая страница **ПРОД**: `http://localhost:8080/test/banner-test.html?cpmind_debug=1`
Тестовая страница **ЛОКАЛЬНО**: `http://localhost:8080/test/banner-test_local.html?cpmind_debug=1`

### Production

Тестовая страница с тегом, указывающим на production:

```
data-endpoint="https://app.cpmind.tech/api/impressions"
<script async src="https://app.cpmind.tech/tag/cpmind-tag.min.js"></script>
```

### Проверка здоровья системы

```bash
# Dev
curl http://localhost:3001/api/health
# Production
curl https://app.cpmind.tech/api/health

# Ожидаемый ответ:
# {"ok":true,"db":"ok","ts":"2026-06-15T10:32:53.089Z"}
```

---

## Сценарии тега (browser)

### Сценарий T-01 — Базовый показ: просмотр и уход

**Цель:** проверить запись импрешена при стандартном поведении пользователя.

**Условия:**
- Открыть тестовую страницу с `?cpmind_debug=1`
- Проскроллить до первого баннера
- Задержаться на 5–7 секунд (наблюдать debug-оверлей: `S1 time_in_view` растет)
- Закрыть вкладку

**Ожидаемый результат:**
- В Network (DevTools) виден запрос типа «маячок» к `impressions`
- В БД появилась запись с `s1_raw_time_in_view ≈ 5–7 сек`
- `score_final > 30` (базовый показ без взаимодействия)
- `no_events = false` (был скролл = было событие)
- `is_suspicious = false`

---

### Сценарий T-02 — Взаимодействие с баннером: клик

**Цель:** проверить фиксацию клика и влияние S5 на Score.

**Условия:**
- Открыть тестовую страницу
- Прокрутить до баннера
- Кликнуть по баннеру (откроется новая вкладка или ссылка)

**Ожидаемый результат:**
- Импрешен записан немедленно при клике (до перехода по ссылке)
- `s5_raw_top_event = "clicked"`
- `s5_normalized = 100`
- `score_final` выше чем в T-01 при прочих равных

---

### Сценарий T-03 — Наведение курсора (hover)

**Цель:** проверить фиксацию hover-события.

**Условия:**
- Открыть тестовую страницу с `?cpmind_debug=1`
- Прокрутить до баннера
- Навести курсор на баннер и удержать 3+ секунды
- Убрать курсор
- Закрыть вкладку

**Ожидаемый результат:**
- В debug-оверлее: `S5 top_event: hover Xms` (X > 3000)
- В БД: `s5_raw_top_event = "hover_3000ms+"`
- `s5_normalized > 0`

---

### Сценарий T-04 — Быстрый скролл мимо баннера

**Цель:** проверить, что быстрый скролл дает низкий Score.

**Условия:**
- Открыть тестовую страницу
- Быстро прокрутить страницу сверху донизу (не задерживаясь у баннера)
- Закрыть вкладку

**Ожидаемый результат:**
- `s1_raw_time_in_view < 1 сек` (или 0 если баннер вообще не попал в viewport)
- `s3_raw_scroll_speed` — высокое значение (px/s)
- `score_final < 20`
- Если `time_in_view = 0`: `s1_normalized = 0`, импрешен может не записаться (баннер не вошел в viewport)

---

### Сценарий T-05 — Вкладка в фоне

**Цель:** проверить фиксацию переключения вкладки и флаг `tab_mostly_hidden`.

**Условия:**
- Открыть тестовую страницу с `?cpmind_debug=1`
- Прокрутить до баннера
- Немедленно переключиться на другую вкладку на 30+ секунд
- Вернуться, закрыть вкладку

**Ожидаемый результат:**
- В debug-оверлее: `S4 tab_active` — низкий процент
- `tab_mostly_hidden = true` (если активна < 20% времени)
- `is_suspicious = true`
- `score_final` ниже чем при активной вкладке

---

### Сценарий T-06 — Отсутствие активности пользователя (F_Presence = 0)

**Цель:** проверить мультипликатор присутствия.

**Условия (синтетически через API — см. Сценарий A-05):**
- Отправить payload с `last_user_event_timestamp: null` и `events_count_during_impression: 0`

**Ожидаемый результат:**
- `f_presence = 0`
- `score_final = 0`
- `no_events = true`

---

### Сценарий T-07 — Mobile: тап по баннеру

**Цель:** проверить обработку touch-событий.

**Условия:**
- Открыть тестовую страницу на мобильном устройстве (или в DevTools с эмуляцией мобильного)
- Тапнуть по баннеру

**Ожидаемый результат:**
- `device_type = "mobile"` или `"tablet"`
- `s5_raw_top_event` содержит упоминание tap или click
- Импрешен записан немедленно при тапе

---

### Сценарий T-08 — Два баннера на странице

**Цель:** проверить независимость отслеживания нескольких баннеров.

**Условия:**
- Открыть тестовую страницу (на ней два баннера: `demo_campaign_01` и `demo_campaign_02`)
- Прокрутить до первого баннера, задержаться
- Прокрутить до второго баннера, задержаться
- Закрыть вкладку

**Ожидаемый результат:**
- Две записи в БД: одна с `campaign_id = demo_campaign_01`, другая с `demo_campaign_02`
- Разные `impression_id`
- Разные значения `s1_raw_time_in_view` (в зависимости от времени просмотра каждого)

---

### Сценарий T-09 — Медленный осознанный скролл (reading pattern)

**Цель:** проверить детекцию паттерна чтения в S3.

**Условия:**
- Открыть тестовую страницу с `?cpmind_debug=1`
- Медленно прокручивать страницу (как при чтении статьи), делать паузы
- Закрыть вкладку

**Ожидаемый результат:**
- `s3_raw_scroll_speed` — низкое значение
- В `signals_raw`: `reading_pattern_detected = true`, `pause_count > 0`
- `s3_normalized` выше чем при быстром скролле

---

## Сценарии API (curl)

### Сценарий A-01 — Health check

```bash
curl https://app.cpmind.tech/api/health
```

**Ожидаемый ответ:** `200 OK`
```json
{"ok":true,"db":"ok","ts":"2026-06-15T10:32:53.089Z"}
```

---

### Сценарий A-02 — Отправка валидного payload

```bash
curl -X POST https://app.cpmind.tech/api/impressions \
  -H "Content-Type: application/json" \
  -d '{
    "impression_id": "550e8400-e29b-41d4-a716-446655440000",
    "campaign_id": "test_api_01",
    "creative_id": "banner_test",
    "creative_type": "banner_static",
    "device_type": "desktop",
    "timestamp_start": 1718444000000,
    "timestamp_end": 1718444010000,
    "signals": {
      "s1": {"time_in_view_sec": 5.0, "mrc_compliant": true, "visible_pixels_pct": 80, "max_continuous_view_sec": 5.0},
      "s2": {"share_of_screen_avg_pct": 15.0, "share_of_screen_max_pct": 15.0},
      "s3": {"scroll_speed_avg_px_s": 200, "scroll_speed_max_px_s": 400, "scroll_speed_std_dev": 50, "pause_count": 2, "pause_duration_total_ms": 1000, "scroll_streaks": 1, "direction_changes": 1, "reading_pattern_detected": false, "is_momentum_scroll": false},
      "s4": {"tab_active_time_ms": 9500, "tab_total_time_ms": 10000, "tab_switches_count": 0, "visibility_state_history": [{"state": "visible", "timestamp": 1718444000000}]},
      "s5": {"clicked": false, "hover_count": 1, "hover_duration_max_ms": 1500, "hover_duration_total_ms": 1500, "hover_to_click_latency_ms": null, "cursor_proximity_min_px": 0, "cursor_trajectory_entropy": 0.3, "tap_count": null, "touch_start_end_delta_ms": null, "zoom": null, "swipe_count": null},
      "s7": {"creative_position_y_px": 800, "page_height_total_px": 3000, "is_above_the_fold": false, "competing_ads_visible": 0, "viewability_persistence_pct": 90.0}
    },
    "presence": {
      "last_user_event_timestamp": 1718444009000,
      "time_since_last_event_ms": 1000,
      "events_count_during_impression": 25
    }
  }'
```

**Ожидаемый ответ:** `202 Accepted`
```json
{"ok":true}
```

---

### Сценарий A-03 — Невалидный payload (отсутствует обязательное поле)

```bash
curl -X POST https://app.cpmind.tech/api/impressions \
  -H "Content-Type: application/json" \
  -d '{"campaign_id": "test"}'
```

**Ожидаемый ответ:** `422 Unprocessable Entity`
```json
{
  "error": "Validation failed",
  "fieldErrors": {
    "impression_id": ["Required"],
    "creative_id": ["Required"],
    ...
  }
}
```

---

### Сценарий A-04 — Нарушение cross-field валидации (timestamp_end < timestamp_start)

```bash
curl -X POST https://app.cpmind.tech/api/impressions \
  -H "Content-Type: application/json" \
  -d '{
    ...,
    "timestamp_start": 1718444010000,
    "timestamp_end":   1718444000000
  }'
```

**Ожидаемый ответ:** `422`
```json
{
  "fieldErrors": {
    "timestamp_end": ["timestamp_end must be >= timestamp_start"]
  }
}
```

---

### Сценарий A-05 — F_Presence = 0 (нет активности пользователя)

Отправить payload где `events_count_during_impression = 0` и `last_user_event_timestamp = null`, а `time_since_last_event_ms > 60000`.

**Ожидаемый результат в БД:**
```sql
SELECT f_presence, score_final, no_events FROM impressions
WHERE impression_id = '...';
-- f_presence = 0, score_final = 0, no_events = true
```

---

### Сценарий A-06 — Дедупликация (повторная отправка)

Отправить один и тот же payload дважды (одинаковый `impression_id`).

**Ожидаемый результат:** оба запроса возвращают `202`, но в БД только одна запись.

```bash
# Отправить дважды с одинаковым impression_id
curl -X POST ... -d '{"impression_id": "SAME-UUID", ...}'
curl -X POST ... -d '{"impression_id": "SAME-UUID", ...}'

# Проверить
docker exec cpmind-postgres-1 psql -U cpmind -d cpmind \
  -c "SELECT COUNT(*) FROM impressions WHERE impression_id = 'SAME-UUID';"
# Ожидаем: count = 1
```

---

### Сценарий A-07 — Авторизация: верные данные

```bash
curl -X POST https://app.cpmind.tech/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"login": "ADMIN_LOGIN", "password": "ADMIN_PASSWORD"}'
```

**Ожидаемый ответ:** `200 OK`
```json
{"ok":true}
```

В файле `cookies.txt` сохранится `cpmind_token` — httpOnly cookie.

---

### Сценарий A-08 — Авторизация: неверные данные

```bash
curl -X POST https://app.cpmind.tech/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login": "admin", "password": "wrong_password"}'
```

**Ожидаемый ответ:** `401 Unauthorized`

---

### Сценарий A-09 — Защищенный эндпоинт без авторизации

```bash
curl https://app.cpmind.tech/api/impressions
```

**Ожидаемый ответ:** `401 Unauthorized`

---

### Сценарий A-10 — Защищенный эндпоинт с авторизацией

```bash
# Сначала авторизоваться (A-07), получить cookie
curl -X POST https://app.cpmind.tech/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"login": "ADMIN_LOGIN", "password": "ADMIN_PASSWORD"}'

# Получить список импрешенов
curl https://app.cpmind.tech/api/impressions \
  -b cookies.txt
```

**Ожидаемый ответ:** `200 OK` + JSON со списком импрешенов и `total`.

---

### Сценарий A-11 — Экспорт CSV

```bash
curl https://app.cpmind.tech/api/impressions/export/csv \
  -b cookies.txt \
  -o export.csv
```

**Ожидаемый результат:** файл `export.csv` с заголовком (54 колонки) и данными, кодировка UTF-8 с BOM.

---

### Сценарий A-12 — CORS для тега (OPTIONS preflight)

```bash
curl -X OPTIONS https://app.cpmind.tech/api/impressions \
  -H "Origin: https://client-site.ru" \
  -H "Access-Control-Request-Method: POST" \
  -I
```

**Ожидаемый ответ:**
```
HTTP/2 204
access-control-allow-origin: *
access-control-allow-methods: POST, OPTIONS
```

---

## Сценарии панели аналитики

### Сценарий P-01 — Редирект неавторизованного пользователя

Открыть `https://app.cpmind.tech` без авторизации.

**Ожидаемый результат:** автоматический редирект на `/login`.

---

### Сценарий P-02 — Авторизация

1. Открыть `https://app.cpmind.tech/login`
2. Ввести логин и пароль
3. Нажать «Войти»

**Ожидаемый результат:** редирект на `/impressions`, таблица с данными.

---

### Сценарий P-03 — Фильтрация по campaign_id

1. В поле фильтра Campaign ID ввести `demo_campaign_01`
2. Нажать «Применить»

**Ожидаемый результат:** в таблице только записи с `campaign_id = demo_campaign_01`. URL обновился — параметр фильтра виден в адресной строке.

---

### Сценарий P-04 — Фильтрация по дате

1. Установить диапазон дат
2. Применить

**Ожидаемый результат:** только записи из указанного диапазона.

---

### Сценарий P-05 — Сортировка по score

Кликнуть на заголовок колонки `score_final`.

**Ожидаемый результат:** сортировка по убыванию / возрастанию. URL обновился с параметром сортировки.

---

### Сценарий P-06 — Детальный вид

Кликнуть на строку таблицы.

**Ожидаемый результат:** открылась страница `/impressions/:id` с полными данными: все секции S1–S7 raw, нормализованные, F_Presence, флаги.

---

### Сценарий P-07 — Экспорт CSV с фильтрами

1. Установить фильтр по campaign_id
2. Нажать «Экспорт CSV»

**Ожидаемый результат:** скачался файл с данными только по выбранной кампании. 54 колонки, UTF-8 BOM (корректно открывается в Excel).

---

### Сценарий P-08 — Пагинация

При наличии > 50 записей:
1. Пролистать на следующую страницу
2. Вернуться назад

**Ожидаемый результат:** корректная смена страниц, URL обновляется.

---

## Сценарии БД

### Сценарий DB-01 — Подключение к БД и просмотр данных

```bash
docker exec -it cpmind-postgres-1 psql -U cpmind -d cpmind
```

```sql
-- Последние 10 импрешенов
SELECT impression_id, campaign_id, score_final, is_suspicious, created_at
FROM impressions
ORDER BY created_at DESC
LIMIT 10;

-- Подозрительные показы
SELECT impression_id, campaign_id, score_final, no_events, tab_mostly_hidden
FROM impressions
WHERE is_suspicious = true
ORDER BY created_at DESC;

-- Средний Score по кампании
SELECT campaign_id, 
       COUNT(*) as total,
       ROUND(AVG(score_final)::numeric, 2) as avg_score,
       ROUND(MIN(score_final)::numeric, 2) as min_score,
       ROUND(MAX(score_final)::numeric, 2) as max_score
FROM impressions
GROUP BY campaign_id;

-- Распределение по device_type
SELECT device_type, COUNT(*) as count
FROM impressions
GROUP BY device_type;
```

---

### Сценарий DB-02 — Проверка миграций

```sql
SELECT * FROM drizzle.__drizzle_migrations;
-- Должна быть одна запись: 0000_sharp_mauler.sql
```

---

### Сценарий DB-03 — Ручной бэкап и проверка

```bash
# Создать бэкап
docker exec cpmind-postgres-1 \
  pg_dump -U cpmind cpmind > /opt/cpmind/backups/manual_test.sql

# Проверить что файл создан и не пустой
ls -lh /opt/cpmind/backups/manual_test.sql
head -20 /opt/cpmind/backups/manual_test.sql
```

**Ожидаемый результат:** файл содержит корректный SQL с `CREATE TABLE impressions`.

---

## Нагрузочное тестирование

### Сценарий L-01 — 50 последовательных запросов

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    -X POST https://app.cpmind.tech/api/impressions \
    -H "Content-Type: application/json" \
    -d "{
      \"impression_id\": \"$(uuidgen | tr '[:upper:]' '[:lower:]')\",
      \"campaign_id\": \"load_test\",
      \"creative_id\": \"banner_load_$i\",
      \"creative_type\": \"banner_static\",
      \"device_type\": \"desktop\",
      \"timestamp_start\": $(($(date +%s%3N) - 5000)),
      \"timestamp_end\": $(date +%s%3N),
      \"signals\": {
        \"s1\": {\"time_in_view_sec\": 5.0, \"mrc_compliant\": true, \"visible_pixels_pct\": 80, \"max_continuous_view_sec\": 5.0},
        \"s2\": {\"share_of_screen_avg_pct\": 10.0, \"share_of_screen_max_pct\": 10.0},
        \"s3\": null,
        \"s4\": {\"tab_active_time_ms\": 4800, \"tab_total_time_ms\": 5000, \"tab_switches_count\": 0, \"visibility_state_history\": [{\"state\": \"visible\", \"timestamp\": $(date +%s%3N)}]},
        \"s5\": {\"clicked\": false, \"hover_count\": 0, \"hover_duration_max_ms\": 0, \"hover_duration_total_ms\": 0, \"hover_to_click_latency_ms\": null, \"cursor_proximity_min_px\": 500, \"cursor_trajectory_entropy\": 0, \"tap_count\": null, \"touch_start_end_delta_ms\": null, \"zoom\": null, \"swipe_count\": null},
        \"s7\": {\"creative_position_y_px\": 500, \"page_height_total_px\": 2000, \"is_above_the_fold\": false, \"competing_ads_visible\": 0, \"viewability_persistence_pct\": 80.0}
      },
      \"presence\": {\"last_user_event_timestamp\": $(date +%s%3N), \"time_since_last_event_ms\": 100, \"events_count_during_impression\": 10}
    }"
done
```

**Ожидаемый результат:** все 50 ответов `202`, время ответа < 200 мс.

```bash
# Проверить что все записаны
docker exec cpmind-postgres-1 psql -U cpmind -d cpmind \
  -c "SELECT COUNT(*) FROM impressions WHERE campaign_id = 'load_test';"
# Ожидаем: count = 50
```

---

### Сценарий L-02 — Rate limiting

Отправить 300 запросов подряд (превышение лимита 100/сек + burst 200).

**Ожидаемый результат:** часть запросов получает `503 Service Unavailable` с заголовком `X-RateLimit-*`.

---

## Сценарии безопасности

### Сценарий S-01 — Недоступность защищенных эндпоинтов без cookie

```bash
curl -I https://app.cpmind.tech/api/impressions
# Ожидаем: 401

curl -I https://app.cpmind.tech/api/impressions/export/csv
# Ожидаем: 401

curl -I https://app.cpmind.tech/api/impressions/some-uuid
# Ожидаем: 401
```

---

### Сценарий S-02 — HTTPS обязателен (HTTP редиректит)

```bash
curl -I http://app.cpmind.tech/api/health
# Ожидаем: 301 Moved Permanently
# Location: https://app.cpmind.tech/api/health
```

---

### Сценарий S-03 — Security headers

```bash
curl -I https://app.cpmind.tech/api/health
```

**Ожидаемые заголовки:**
```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: no-referrer
```

---

### Сценарий S-04 — Тег доступен с любого домена (CORS для /tag/)

```bash
curl -I https://app.cpmind.tech/tag/cpmind-tag.min.js
```

**Ожидаемые заголовки:**
```
HTTP/2 200
Content-Type: application/javascript
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=3600
```

---

## Синтетические данные для проверки формул

### Сценарий §10.2 #1 — 5 секунд просмотра, нет взаимодействий

```json
{
  "s1": {"time_in_view_sec": 5.0, "mrc_compliant": true, "visible_pixels_pct": 100, "max_continuous_view_sec": 5.0},
  "s2": {"share_of_screen_avg_pct": 15.0, "share_of_screen_max_pct": 15.0},
  "s3": {"scroll_speed_avg_px_s": 0, "scroll_speed_max_px_s": 0, "scroll_speed_std_dev": 0, "pause_count": 0, "pause_duration_total_ms": 0, "scroll_streaks": 0, "direction_changes": 0, "reading_pattern_detected": false, "is_momentum_scroll": false},
  "s4": {"tab_active_time_ms": 5000, "tab_total_time_ms": 5000, "tab_switches_count": 0, "visibility_state_history": [{"state": "visible", "timestamp": 0}]},
  "s5": {"clicked": false, "hover_count": 0, "hover_duration_max_ms": 0, "hover_duration_total_ms": 0, "hover_to_click_latency_ms": null, "cursor_proximity_min_px": 999, "cursor_trajectory_entropy": 0, "tap_count": null, "touch_start_end_delta_ms": null, "zoom": null, "swipe_count": null},
  "s7": {"creative_position_y_px": 1200, "page_height_total_px": 3000, "is_above_the_fold": false, "competing_ads_visible": 0, "viewability_persistence_pct": 100.0}
}
```

**Ожидаемые результаты:**

| Метрика | Ожидается |
|---|---|
| S1 normalized | ~74.9 |
| S2 normalized | ~38.7 |
| S3 normalized | 55.0 (нет скролла — base score) |
| S4 normalized | 100.0 |
| S5 normalized | 0.0 |
| S7 normalized | ~45.0 |
| F_Presence | 1 |
| score_final | ~55.7 |
| no_events | true |
| is_suspicious | true |

---

### Сценарий §10.2 #2 — Клик по баннеру

Аналогично #1, но `"clicked": true` в s5.

**Ожидаемые результаты:**

| Метрика | Ожидается |
|---|---|
| S5 normalized | 100.0 |
| score_final | ~70+ |
| is_suspicious | false |

---

### Сценарий §10.2 #3 — Вкладка неактивна 80% времени

```json
"s4": {
  "tab_active_time_ms": 3000,
  "tab_total_time_ms": 15000,
  "tab_switches_count": 1,
  ...
}
```

**Ожидаемые результаты:**

| Метрика | Ожидается |
|---|---|
| S4 normalized | 20.0 |
| tab_mostly_hidden | false (граничный: ровно 20%, не строго < 20%) |
| score_final | ~38.3 |

Для активации флага: `tab_active_time_ms = 2999` (19.99%).

---

### Сценарий §10.2 #4 — S3 = null (cross-domain iframe)

```json
"s3": null
```

**Ожидаемые результаты:**
- `s3_normalized = null` в БД
- Веса перераспределены: S1 ≈ 0.353, S2 ≈ 0.235, S4 ≈ 0.176, S5 ≈ 0.176, S7 ≈ 0.059
- `score_final` рассчитан без S3

---

### Сценарий §10.2 #5 — anomaly_duration флаг

Требует `time_in_view_sec > 3600` (один час).

```json
"s1": {"time_in_view_sec": 3601.0, ...}
```

**Ожидаемый результат:** `anomaly_duration = true`, `is_suspicious = true`.

*Примечание: в браузере не воспроизводится, только через прямой API-запрос.*