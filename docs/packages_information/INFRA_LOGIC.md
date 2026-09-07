# INFRA_LOGIC — Инфраструктура CPMind

## Обзор

Документ описывает производственную инфраструктуру CPMind: облачные ресурсы Yandex Cloud, управляемые через Terraform, конфигурацию NGINX как точки входа, оркестрацию сервисов через Docker Compose и модель безопасности на каждом уровне.

Инфраструктура обслуживает два независимых контура:
- **Панель управления** — аутентифицированный доступ администраторов и пользователей к аналитике и управлению креативами
- **Delivery-контур** — публичная раздача embed-скриптов, VAST, tracking-пикселей и HTML5-креативов издателям

---

## Структура пакета

```txt
├── [DIR] infra
    ├── [FILE] .gitignore
    ├── [FILE] backend.tf
    ├── [FILE] cdn.tf
    ├── [FILE] dns.tf
    ├── [FILE] iam.tf
    ├── [FILE] object-storage.tf
    ├── [FILE] outputs.tf
    ├── [FILE] variables.tf
├── [DIR] nginx
    ├── [DIR] certs
        ├── [FILE] .gitkeep
        ├── [FILE] fullchain.pem
        ├── [FILE] privkey.pem
    ├── [FILE] nginx.conf
    ├── [FILE] nginx_v1.conf
    ├── [FILE] nginx_v2.conf
    ├── [FILE] nginx_v3.conf
```

---

## Домены и сетевая топология

Система использует четыре домена, каждый со строго определённой ответственностью:

| Домен | Назначение | Точка входа |
|---|---|---|
| `app.cpmind.tech` | Панель управления: frontend (Next.js) + backend API | NGINX → backend:3001 / frontend:3000 |
| `delivery.cpmind.tech` | Delivery-контур: embed JS, VAST, tracking, delivery events | NGINX → backend:3001 |
| `creative.cpmind.tech` | Изолированный origin для HTML5-креативов в iframe | NGINX → Yandex Object Storage |
| `cdn.cpmind.tech` | CDN-раздача иммутабельных ассетов (JS-бандлы, обработанные файлы) | Yandex CDN → delivery bucket |

DNS-записи:
- `cdn.cpmind.tech` — CNAME на Yandex CDN edge (TTL 300)
- `delivery.cpmind.tech` — A-запись на IP production-сервера (TTL 300)
- `app.cpmind.tech` и `creative.cpmind.tech` — управляются отдельно, не в Terraform

Все четыре домена принимают трафик через один физический сервер. NGINX разделяет входящие соединения по `server_name` (SNI для HTTPS, Host для HTTP).

---

## Terraform инфраструктура

### Remote state

Terraform state хранится в Yandex Object Storage в бакете `cpmind-terraform-state`, созданном вручную до первого `terraform init`. Бакет не управляется Terraform (иначе возникает bootstrap-проблема курицы и яйца).

Credentials для доступа к state передаются через переменные окружения при инициализации:

```bash
AWS_ACCESS_KEY_ID=<static_key_id> \
AWS_SECRET_ACCESS_KEY=<static_key_secret> \
terraform init
```

Backend использует S3-совместимый протокол Yandex Object Storage с принудительным `force_path_style = true` и отключёнными AWS-специфичными проверками (`skip_credentials_validation`, `skip_metadata_api_check`, `skip_region_validation`).

### Object Storage — три бакета

Система использует три бакета с принципиально разными политиками доступа:

#### `cpmind-upload-staging` — приватный, временный

Назначение: промежуточное хранилище для файлов, загружаемых пользователями через presigned URL до их обработки media-worker'ом.

Ключевые свойства:
- ACL `private` — прямой публичный доступ запрещён
- Lifecycle rule `expire-staging-objects`: автоудаление объектов через 2 дня. Гарантирует очистку даже если media-worker не смог удалить файл после обработки (известное ограничение: IAM роль worker'а не включает `storage.editor`, поэтому DELETE возвращает 403; файлы удаляются только lifecycle rule)
- Lifecycle rule `abort-incomplete-multipart`: отмена незавершённых multipart-загрузок через 2 дня. Предотвращает накопление «мусора» от прерванных сессий
- CORS: разрешает только `PUT` с `https://app.cpmind.tech`. Браузер выполняет PUT напрямую на Object Storage через presigned URL — CORS необходим для preflight запроса

#### `cpmind-source-assets` — приватный, постоянный

Назначение: хранение оригинальных файлов после обработки media-worker'ом. Используется как архив и источник для возможной повторной обработки.

Ключевые свойства:
- ACL `private` — доступен только media-worker через IAM
- Нет lifecycle rules — файлы хранятся бессрочно
- Нет CORS — прямой браузерный доступ не предусмотрен

#### `cpmind-delivery-assets` — публичное чтение, CDN origin

Назначение: хранение обработанных ассетов для раздачи через CDN и прямого доступа с `creative.cpmind.tech`.

Ключевые свойства:
- `anonymous_access_flags.read = true` — публичное чтение без аутентификации
- `list = false`, `config_read = false` — листинг бакета запрещён
- CORS: разрешает `GET` и `HEAD` с любого origin (`*`), экспонирует `ETag`, `Content-Length`, `Content-Range`. Широкий CORS обоснован: ассеты загружаются издателями с произвольных доменов
- Является origin для Yandex CDN

### IAM — два сервисных аккаунта

Применяется принцип минимальных привилегий: каждый аккаунт имеет только необходимые для своей функции права.

#### `cpmind-backend-signer`

Генерирует presigned URL для загрузки файлов в staging bucket. Только эта операция — никакого доступа к source или delivery.

| Роль | Бакет | Назначение |
|---|---|---|
| `storage.uploader` | folder-level | Право на PUT в staging |

Статический ключ (`signer_key`) передаётся backend'у через `YC_SIGNER_KEY_ID` / `YC_SIGNER_SECRET`.

#### `cpmind-media-worker`

Читает файлы из staging, записывает обработанные ассеты в source и delivery.

| Роль | Бакет | Назначение |
|---|---|---|
| `storage.viewer` | folder-level | GET из staging |
| `storage.uploader` | folder-level | PUT в source и delivery |

Статический ключ (`worker_key`) передаётся media-worker'у через `YC_WORKER_KEY_ID` / `YC_WORKER_SECRET`.

**Известное ограничение:** роль `storage.uploader` не включает DELETE. Media-worker не может удалять объекты из staging после обработки — WARN в логах (`AccessDenied` на `DeleteObject`). Файлы удаляются lifecycle rule через 2 дня. Для устранения нужно добавить `storage.editor` в `iam.tf`.

### CDN

Yandex CDN настроен как прокси перед delivery bucket:

- Origin group `cpmind-delivery-origin` → `cpmind-delivery-assets.storage.yandexcloud.net`
- CNAME: `cdn.cpmind.tech`
- Cache TTL: 1 год (`browser_cache_settings = 31536000`)
- Заголовки: `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- CORS: `*` (наследуется от bucket)

CDN используется для раздачи JS-бандлов runtime'ов (`cpmind-display-runtime_v1.min.js`, `cpmind-player_v1.min.js`, `cpmind-loader_v1.min.js`) и обработанных медиаассетов. Иммутабельность обеспечивается версионированием в именах файлов — бакет не обновляет существующие объекты, только добавляет новые.

---

## NGINX

### Общая конфигурация

```
worker_processes auto;           # по числу CPU
worker_rlimit_nofile 65535;      # лимит файловых дескрипторов
worker_connections 4096;         # соединений на worker
```

Включены оптимизации для высоконагруженного TCP: `sendfile`, `tcp_nopush`, `tcp_nodelay`. Защита от Slowloris: `client_body_timeout 12s`, `client_header_timeout 12s`, `send_timeout 10s`.

Docker internal DNS resolver (`127.0.0.11`) необходим для разрешения имён сервисов (`backend`, `frontend`) внутри Docker-сети. `valid=30s` — TTL кеша резолвера.

Gzip-компрессия включена для JS, JSON, XML (уровень 6 — баланс CPU/сжатие).

### Rate limiting

Три зоны, каждая для своего типа трафика:

| Зона | Rate | Burst | Применение |
|---|---|---|---|
| `beacon` | 100 r/s | 200 | `POST /api/collect` — impression beacon |
| `api` | 30 r/s | 60 | Панельный API, аутентифицированные запросы |
| `delivery` | 60 r/s | 30–120 | Embed, VAST, tracking, creative |

Beacon zone настроена на наивысший throughput: 100 r/s базовый + burst 200 с `nodelay` — пики impression-трафика не должны дросселироваться. Tracking zone (`/t/`) имеет burst 120 — самый высокий, т.к. tracking пиксели fire-and-forget и не требуют гарантии доставки.

Connection limiting: `conn_per_ip` зона, `limit_conn_status 429`.

### TLS

- Протоколы: TLSv1.2 и TLSv1.3 (TLS 1.0/1.1 отключены)
- Cipher suites: ECDHE с AES-GCM и ChaCha20-Poly1305 — современный набор без уязвимых алгоритмов
- `ssl_prefer_server_ciphers off` — клиент выбирает cipher (рекомендация для TLS 1.3)
- Session cache: 10 МБ shared, TTL 1 день
- Session tickets: отключены (forward secrecy)
- OCSP stapling: закомментировано (требует настройки `ssl_trusted_certificate`)

Все домены используют один wildcard-сертификат (`fullchain.pem` / `privkey.pem`).

### Виртуальные хосты

#### Default — отклонение неизвестных запросов

```nginx
server {
  listen 80 default_server;
  server_name _;
  return 444;  # TCP RST без HTTP-ответа
}

server {
  listen 443 ssl default_server;
  ssl_reject_handshake on;  # обрыв TLS handshake
}
```

Запросы на неизвестный Host/SNI отклоняются на транспортном уровне — без утечки информации о сервере.

#### HTTP → HTTPS redirect

Единый server block для всех трёх доменов выполняет `301` redirect. Не обрабатывает ACME challenges — предполагается что сертификаты управляются отдельно (certbot вне Docker или wildcard от Yandex Certificate Manager).

#### `app.cpmind.tech` — панель управления

`client_max_body_size 1m` — загрузка файлов через presigned URL происходит напрямую в Object Storage, не через NGINX.

Security headers (применяются ко всем location без собственных `add_header`):
- `HSTS: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — панель не может быть встроена в iframe
- `Referrer-Policy: strict-origin-when-cross-origin`
- `CSP`: ограниченная политика, разрешает только self + Google Fonts
- `Permissions-Policy`: отключены camera, microphone, geolocation

**Важное свойство NGINX:** если location блок содержит собственные `add_header`, он **не наследует** `add_header` из родительского server блока. Поэтому `/tag/` и location'ы в delivery/creative серверах повторяют security headers явно.

Location блоки `app.cpmind.tech`:

| Location | Зона | Proxy | Примечание |
|---|---|---|---|
| `= /api/collect` | beacon, burst 200 | backend:3001 | Нет Cookie forwarding — публичный endpoint |
| `= /api/creative-uploads` | api, burst 10 | backend:3001 | С Cookie — JWT-protected |
| `/api/` | api, burst 60 | backend:3001 | `proxy_buffering off` для CSV streaming |
| `/` | — | frontend:3000 | С Cookie — SSR Next.js |
| `/tag/` | — | static alias | Статические JS-файлы тега из volume |

`/tag/` использует `alias` из Docker volume `tag_dist` (readonly). Security headers повторены явно + `Access-Control-Allow-Origin: *` (тег загружается с издательских сайтов).

#### `delivery.cpmind.tech` — delivery-контур

`limit_conn conn_per_ip 100` — вдвое больше чем у app (delivery трафик анонимный, выше параллелизм).

| Location | Зона | Cache-Control | Примечание |
|---|---|---|---|
| `~ ^/e/` | delivery, burst 30 | `no-store` | Embed JS — динамический, нельзя кешировать |
| `~ ^/t/` | delivery, burst 120 | `no-store` | Tracking — `CORS: *`, нет X-Frame-Options |
| `/` | delivery, burst 60 | `no-store` | VAST, delivery events |

Все responses `no-store` — delivery контент персонализирован по placement token, кеширование на уровне браузера или промежуточных прокси недопустимо.

#### `creative.cpmind.tech` — изолированный HTML5 origin

Назначение: служить отдельным origin для HTML5-креативов, загружаемых в iframe. Браузерная Same-Origin Policy изолирует iframe от родительской страницы.

Принципиальные отличия от других vhost'ов:
- **Нет `X-Frame-Options`** — страница должна открываться в iframe
- **`Content-Security-Policy: connect-src 'none'`** — HTML5-креатив не может делать исходящие сетевые запросы
- **`frame-ancestors *`** — iframe разрешён с любого сайта издателя
- **`Referrer-Policy: no-referrer`** — не передаём URL издателя в запросах ассетов
- **`Cache-Control: public, max-age=31536000, immutable`** — HTML5-ассеты иммутабельны

Блокировка path traversal: `location ~ \.\. { return 400; }` — дополнительная защита от `../../etc/passwd`-стиля атак.

Проксирование на `cpmind-delivery-assets.storage.yandexcloud.net` через HTTPS с верификацией сертификата (`proxy_ssl_verify on`). Скрытие S3-заголовков: `x-amz-request-id`, `x-amz-id-2`, `Set-Cookie` — не раскрываем детали Object Storage.

**Важное свойство:** location `~ \.\.` наследует server-level `add_header`, но location `/` — нет (содержит собственные). Поэтому в `/` все security headers повторены явно.

---

## Docker Compose (production)

### Топология сервисов

```
                    ┌─────────────────────────────┐
         internet   │         nginx               │
    ──────────────▶ │  :80 (redirect), :443 (TLS) │
                    └──────┬──────────┬────────────┘
                           │          │
                    ┌──────▼──┐  ┌────▼──────┐
                    │ backend │  │ frontend  │
                    │  :3001  │  │   :3000   │
                    └──────┬──┘  └───────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼───┐  ┌─────▼────┐  ┌───▼────────┐
        │postgres │  │  backup  │  │media-worker│
        │  :5432  │  │ (crond)  │  │  (worker)  │
        └─────────┘  └──────────┘  └────────────┘
```

Все сервисы находятся в изолированной Docker-сети `internal` (bridge driver). NGINX — единственная точка входа извне, экспонирует порты 80 и 443. Остальные сервисы используют `expose` (только внутри Docker-сети, не на хосте).

### Сервисы

#### `nginx`

- Образ: `nginx:1.27-alpine` (фиксированная версия)
- Volumes:
  - `nginx/nginx.conf` → `/etc/nginx/nginx.conf:ro`
  - `nginx/certs` → `/etc/nginx/certs:ro` (TLS сертификаты)
  - `tag_dist` → `/etc/nginx/tag:ro` (JS-файлы тега, shared volume с backend)
- Depends on: `backend` (healthy) + `frontend` (healthy) — NGINX стартует только после готовности upstream'ов

#### `backend`

- Dockerfile: `packages/backend/Dockerfile`
- Expose: 3001
- Переменные окружения: полный набор (DB, JWT, YC credentials, bucket names, delivery URLs)
- Volume `tag_dist:/tag_dist` — backend записывает собранный тег в этот volume, NGINX читает его для раздачи через `/tag/`
- Healthcheck: `fetch('http://localhost:3001/api/health')` каждые 10s, start_period 60s (время на миграции и инициализацию)

#### `frontend`

- Dockerfile: `packages/frontend/Dockerfile` с `ARG NEXT_PUBLIC_BACKEND_URL=""`
- `NEXT_PUBLIC_BACKEND_URL` передаётся пустой строкой при build — в production frontend работает на том же домене что и API (`app.cpmind.tech`), NGINX проксирует `/api/` на backend. Клиентские fetch-запросы идут на relative URL или на `app.cpmind.tech`
- `BACKEND_URL=http://backend:3001` — для SSR Server Components, доступ к backend через внутреннюю Docker-сеть
- Healthcheck: `fetch('http://localhost:3000/')` каждые 10s, start_period 30s

#### `postgres`

- Образ: `postgres:16-alpine`
- Volume `postgres_data` — персистентное хранилище данных
- Healthcheck: `pg_isready -U cpmind` каждые 10s
- Expose: 5432 (только внутри Docker-сети)

#### `backup`

- Образ: `postgres:16-alpine` (содержит `pg_dump`)
- Запускает `crond` на основе `backup/crontab` (монтируется как `/etc/crontabs/root`)
- Volume `./backups:/backups` — директория на хосте для хранения дампов
- Depends on: `postgres` (healthy)
- Не имеет healthcheck — фоновый сервис

#### `media-worker`

- Dockerfile: `packages/media-worker/Dockerfile` (включает FFmpeg)
- `stop_grace_period: 60s` — при остановке контейнера worker получает SIGTERM и имеет 60 секунд на завершение текущего job'а (lease 15 минут, но graceful shutdown должен успеть за 60s)
- `tmpfs: /tmp/cpmind-worker:size=10g` — временная файловая система в RAM для промежуточных файлов при обработке медиа. Размер 10GB достаточен для крупных видеофайлов (max upload 2GB с запасом на промежуточные форматы)
- Нет healthcheck — worker самодиагностируется через heartbeat механизм в БД

### Volumes

| Volume | Тип | Используется |
|---|---|---|
| `postgres_data` | named | postgres (rw) |
| `tag_dist` | named | backend (rw), nginx (ro) |

`tag_dist` — ключевой shared volume: backend при старте или пересборке тега записывает JS-файл, NGINX раздаёт его статически через `/tag/` с CORS для издательских сайтов.

### Порядок запуска

```
postgres (healthy)
    ↓
backend (healthy) + media-worker
    ↓
frontend (healthy)
    ↓
nginx
```

Media-worker стартует параллельно с backend (оба зависят от postgres). Frontend ждёт backend (SSR-запросы на старте). NGINX ждёт оба application-сервиса.

---

## Переменные окружения

### Обязательные (без дефолтов)

| Переменная | Сервис | Назначение |
|---|---|---|
| `DATABASE_URL` | backend, media-worker | PostgreSQL connection string |
| `DB_PASSWORD` | postgres, backup | Пароль БД |
| `JWT_SECRET` | backend | Подпись JWT токенов |
| `COOKIE_SECRET` | backend | Подпись cookie (@fastify/cookie) |
| `ADMIN_LOGIN` | backend | Логин admin-аккаунта (seed) |
| `ADMIN_PASSWORD_HASH` | backend | bcrypt-хеш пароля admin (seed) |
| `YC_SIGNER_KEY_ID` / `YC_SIGNER_SECRET` | backend | IAM ключ для presigned URLs |
| `YC_WORKER_KEY_ID` / `YC_WORKER_SECRET` | media-worker | IAM ключ для чтения/записи ассетов |
| `STAGING_BUCKET` | backend, media-worker | Имя staging bucket |
| `SOURCE_BUCKET` | media-worker | Имя source bucket |
| `DELIVERY_BUCKET` | backend, media-worker | Имя delivery bucket |
| `CDN_BASE_URL` | backend, media-worker | `https://cdn.cpmind.tech` |
| `DELIVERY_BASE_URL` | backend | `https://delivery.cpmind.tech` |
| `CREATIVE_BASE_URL` | backend | `https://creative.cpmind.tech` |
| `COLLECT_ENDPOINT` | backend | `https://app.cpmind.tech/api/collect` |

### С дефолтами

| Переменная | Дефолт | Назначение |
|---|---|---|
| `DISPLAY_RUNTIME_VERSION` | `1` | Версия display runtime бандла |
| `PLAYER_RUNTIME_VERSION` | `1` | Версия player runtime бандла |
| `CALIBRATION_DRAFT_TTL_MINUTES` | `60` | TTL draft калибровок |
| `LOG_LEVEL` | `info` | Уровень логирования (pino) |
| `WORKER_CONCURRENCY` | `1` | Параллельных job'ов у worker'а |
| `WORKER_LEASE_MS` | `900000` | Lease на job (15 минут) |
| `WORKER_HEARTBEAT_MS` | `30000` | Интервал heartbeat (30 секунд) |
| `WORKER_POLL_INTERVAL_MS` | `5000` | Интервал опроса очереди |
| `BACKEND_DB_POOL_MAX` | `20` | Макс. соединений в пуле backend |
| `WORKER_DB_POOL_MAX` | `5` | Макс. соединений в пуле worker'а |

---

## Матрица прав доступа к Object Storage

| Операция | `backend-signer` | `media-worker` | anonymous |
|---|---|---|---|
| PUT staging | ✓ | ✓ | — |
| GET staging | — | ✓ | — |
| DELETE staging | — | ✗ (403) | — |
| PUT source | — | ✓ | — |
| GET source | — | ✓ | — |
| PUT delivery | — | ✓ | — |
| GET delivery | — | ✓ | ✓ |
| LIST любого bucket | — | — | — |

`backend-signer` генерирует presigned PUT URL для staging — браузер выполняет PUT напрямую, используя временные credentials из presigned URL (не IAM ключ signer'а).

---

## Безопасность

### CORS-политики по бакетам

| Bucket | Origins | Methods | Назначение |
|---|---|---|---|
| `cpmind-upload-staging` | `https://app.cpmind.tech` | `PUT` | Браузерная загрузка через presigned URL |
| `cpmind-delivery-assets` | `*` | `GET`, `HEAD` | Загрузка ассетов с издательских сайтов |

**Локальная разработка:** staging bucket требует добавления `http://localhost:3000` в `allowed_origins` через Terraform или YC Console. После добавления необходимо обновить `object-storage.tf` для синхронизации состояния.

### Security headers по доменам

| Header | app | delivery | creative |
|---|---|---|---|
| HSTS | ✓ | ✓ | ✓ |
| X-Content-Type-Options | ✓ | ✓ | ✓ |
| X-Frame-Options: DENY | ✓ | `/e/`, `/` | — |
| CSP | ✓ (strict) | — | ✓ (connect-src: none) |
| Referrer-Policy | strict-origin | strict-origin | no-referrer |
| Permissions-Policy | ✓ | — | — |
| Access-Control-Allow-Origin | — | `/t/` only | — |

`creative.cpmind.tech` намеренно не имеет `X-Frame-Options` — HTML5-креативы должны загружаться в iframe.

### Изоляция сети

Все сервисы находятся в `internal` Docker-сети. PostgreSQL, backend, frontend недоступны с хоста — только через NGINX. Это исключает прямые атаки на API в обход NGINX rate limiting и security headers.

---

## Операционные процедуры

### Первичный деплой

```bash
# 1. Инициализация Terraform state
AWS_ACCESS_KEY_ID=<key> AWS_SECRET_ACCESS_KEY=<secret> terraform -chdir=infra init

# 2. Применение инфраструктуры
terraform -chdir=infra apply

# 3. Получение IAM ключей из outputs
terraform -chdir=infra output -raw signer_key_id
terraform -chdir=infra output -raw signer_secret
terraform -chdir=infra output -raw worker_key_id
terraform -chdir=infra output -raw worker_secret

# 4. Заполнение .env на сервере

# 5. Запуск Docker Compose
docker compose -f docker-compose.prod.yml up -d

# 6. Миграции БД (выполняются автоматически при старте backend)
```

### Обновление

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Ротация IAM ключей

При компрометации ключей: удалить `yandex_iam_service_account_static_access_key` ресурс в Terraform, применить изменения (создаётся новый ключ), обновить `.env` на сервере, перезапустить сервисы.

---

## Известные ограничения и TODO

| Проблема | Описание | Решение |
|---|---|---|
| DELETE staging 403 | `media-worker` не может удалять файлы из staging | Добавить `storage.editor` роль в `iam.tf` |
| OCSP stapling | Закомментировано в nginx.conf | Настроить `ssl_trusted_certificate` и включить |
| `app.cpmind.tech` DNS | Не управляется Terraform | Добавить A-запись в `dns.tf` |
| `creative.cpmind.tech` DNS | Не управляется Terraform | Добавить CNAME/A-запись в `dns.tf` |
| Node.js ≥22 | AWS SDK v3 требует Node 22 после января 2027 | Обновить базовые образы с `node:20` на `node:22` |
| Локальная разработка | staging CORS не включает localhost | Добавлять `http://localhost:3000` в `allowed_origins` при локальной разработке |