# CPMind — Руководство по деплою

Документ описывает полный процесс развертывания CPMind на «чистом» сервере: от первого подключения по SSH до работающей системы в продакшне. Включает типичные ошибки и способы их устранения.

**Текущий продакшн:** https://app.cpmind.tech  
**Сервер:** GCP Compute Engine, Ubuntu 24.04 LTS

---

## Содержание

1. [Предварительные требования](#предварительные-требования)
2. [Подключение к серверу](#подключение-к-серверу)
3. [Обновление системы](#обновление-системы)
4. [Установка Docker](#установка-docker)
5. [Настройка DNS и домена](#настройка-dns-и-домена)
6. [Настройка доступа к репозиторию](#настройка-доступа-к-репозиторию)
7. [Клонирование репозитория](#клонирование-репозитория)
8. [SSL-сертификат](#ssl-сертификат)
9. [Настройка автообновления сертификата](#настройка-автообновления-сертификата)
10. [Конфигурация nginx](#конфигурация-nginx)
11. [Переменные окружения (.env)](#переменные-окружения-env)
12. [Запуск стека](#запуск-стека)
13. [Проверка работоспособности](#проверка-работоспособности)
14. [Просмотр логов](#просмотр-логов)
15. [Обновление продакшна](#обновление-продакшна)
16. [Типичные ошибки и решения](#типичные-ошибки-и-решения)
17. [Экстренные операции](#экстренные-операции)

---

## Предварительные требования

### Сервер
- Ubuntu 24.04 LTS (Noble Numbat)
- Минимум 2 GB RAM, 20 GB диск
- Публичный IPv4-адрес
- Открытые порты: 22 (SSH), 80 (HTTP), 443 (HTTPS)

### Домен
- Зарегистрированный домен (в нашем случае: `cpmind.tech`)
- Доступ к DNS-панели управления доменом
- Решение использовать поддомен: `app.cpmind.tech`

### Репозиторий
- GitHub-репозиторий с кодом проекта
- Права на добавление Deploy Keys в репозиторий (или на уровне организации — права должны быть включены)

### Локально (для подготовки)
- SSH-клиент
- Git

---

## Подключение к серверу

## Инструкция подключения к серверу по SSH на macOS

### Данные

```bash
Пользователь: admin-cpmind
IP сервера: 51.250.120.191
Путь к ключу (если в "Загрузки"): /Users/{user}/Downloads/ssh-key-cpmindtest/ssh-key-cpmindtest
```

`{user}` заменить на имя пользователя на Mac.

---

### Вариант 1. Подключение с ключом из папки Downloads - рекомендуется на старте

**1. Проверить, что ключ лежит по пути**

```bash
/Users/{user}/Downloads/ssh-key-cpmindtest/ssh-key-cpmindtest
```

**2. Выдать правильные права на ключ**

```bash
chmod 600 /Users/{user}/Downloads/ssh-key-cpmindtest/ssh-key-cpmindtest
```

**3. Подключиться к серверу**

```bash
ssh -i /Users/{user}/Downloads/ssh-key-cpmindtest/ssh-key-cpmindtest admin-cpmind@51.250.120.191
```

---

### Вариант 2. Перенос ключа в системную папку `.ssh`

**0. Проверить наличие папки `.ssh`**

```bash
ls -la ~/.ssh
```

**1. Создать папку `.ssh`, если ее нет**

```bash
mkdir -p ~/.ssh
```

**2. Скопировать ключ в `.ssh`**

```bash
cp /Users/{user}/Downloads/ssh-key-cpmindtest/ssh-key-cpmindtest ~/.ssh/ssh-key-cpmindtest
```

**3. Выдать правильные права**

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/ssh-key-cpmindtest
```

**4. Подключиться к серверу**

```bash
ssh -i ~/.ssh/ssh-key-cpmindtest admin-cpmind@51.250.120.191
```

---

### Если появится вопрос `Are you sure you want to continue connecting?`

Введите:

```bash
yes или y
```

Затем нажмите `Enter`.
Все последующие команды выполняются на сервере, если не указано иное.

**Важно о правах:** большинство команд требует `sudo`. Команды без `sudo` работают только в директориях, принадлежащих текущему пользователю.

---

## Обновление системы

```bash
# Без sudo — ошибка (Permission denied)
# Всегда используйте sudo для системных команд
sudo apt update && sudo apt upgrade -y
```

**Что происходит:**
- `apt update` — обновляет список пакетов
- `apt upgrade -y` — устанавливает все доступные обновления

**Нормальный вывод включает:**
```
7 packages can be upgraded.
6 upgraded, 2 newly installed, 0 to remove
```

После обновления возможно сообщение о необходимости перезапуска сервисов — это нормально, перезагрузка сервера не требуется.

---

## Установка Docker

### Шаг 1 — Установка зависимостей

```bash
sudo apt install -y ca-certificates curl gnupg
```

Если пакеты уже установлены — вывод: `0 upgraded, 0 newly installed`.

### Шаг 2 — Создание директории для ключей

```bash
sudo install -m 0755 -d /etc/apt/keyrings
```

### Шаг 3 — Добавление GPG-ключа Docker

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

**Критически важно:** `sudo` нужен на правой стороне пайпа (`sudo gpg`), иначе `gpg` запускается без прав и не может записать файл:

```bash
# НЕПРАВИЛЬНО — gpg без sudo, Permission denied:
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# ПРАВИЛЬНО — sudo на обеих командах:
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

### Шаг 4 — Установка прав на ключ

```bash
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

### Шаг 5 — Добавление репозитория Docker

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

**Критически важно:** редирект `>` не работает с `sudo`. Используйте `sudo tee` вместо `>`:

```bash
# НЕПРАВИЛЬНО — > без sudo, Permission denied:
echo "..." > /etc/apt/sources.list.d/docker.list

# ПРАВИЛЬНО — через sudo tee:
echo "..." | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### Шаг 6 — Установка Docker

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

**Ожидаемый вывод:** установка 7 пакетов (~99 MB), автоматический запуск Docker daemon.

### Шаг 7 — Проверка

```bash
docker --version
# Docker version 29.5.3, build d1c06ef

docker compose version
# Docker Compose version v5.1.4
```

### Шаг 8 — Добавление пользователя в группу docker

```bash
sudo usermod -aG docker admin-cpmind
newgrp docker
```

`newgrp docker` активирует группу в текущей сессии без перелогина. При следующем подключении по SSH группа будет активна автоматически.

---

## Настройка DNS и домена

### Добавление A-записи

В DNS-панели управления доменом добавить одну A-запись:

| Поле | Значение |
|---|---|
| Тип | A |
| Имя / Хост | `app` (только поддомен, без основного домена) |
| Значение / IP | Публичный IPv4 сервера |
| TTL | 3600 (или «Авто») |

**Результат:** `app.cpmind.tech` → IP сервера.

Основной домен `cpmind.tech` и `www.cpmind.tech` **не затрагиваются**.

### Проверка распространения DNS

Проверить на `https://dnschecker.org/#A/app.cpmind.tech`. Когда большинство точек на карте зеленые и показывают правильный IP — DNS обновился.

Обычно: 5–30 минут. Максимум: 24 часа.

```bash
# Проверить с сервера
nslookup app.cpmind.tech
# Ожидаем: Address: ВАШ_IP
```

---

## Настройка доступа к репозиторию

Используем Deploy Key — SSH-ключ, привязанный к конкретному репозиторию. Не требует хранения пароля на сервере.

### Шаг 1 — Генерация ключа

```bash
ssh-keygen -t ed25519 -C "cpmind-deploy" -f ~/.ssh/cpmind_deploy -N ""
```

- `-t ed25519` — современный алгоритм (быстрее и безопаснее RSA)
- `-C "cpmind-deploy"` — комментарий для идентификации
- `-f ~/.ssh/cpmind_deploy` — путь к файлу ключа
- `-N ""` — без passphrase (нужно для автоматизации)

Создаются два файла:
- `~/.ssh/cpmind_deploy` — приватный ключ (никуда не копировать)
- `~/.ssh/cpmind_deploy.pub` — публичный ключ (добавить в GitHub)

### Шаг 2 — Получить публичный ключ

```bash
cat ~/.ssh/cpmind_deploy.pub
# Вывод: ssh-ed25519 AAAA...xxxx cpmind-deploy
```

Скопировать весь вывод целиком (включая `ssh-ed25519` в начале и `cpmind-deploy` в конце).

### Шаг 3 — Добавить ключ в GitHub

Перейти в репозиторий → Settings → Deploy keys → Add deploy key.
- Title: `cpmind-server-deploy`
- Key: вставить публичный ключ
- Allow write access: **НЕ ставить** (только чтение достаточно)

**Если Deploy keys отключены на уровне организации:** Organization Settings → Third-party access → Enable deploy keys.

### Шаг 4 — Настройка SSH config

```bash
cat >> ~/.ssh/config << 'EOF'
Host github-cpmind
  HostName github.com
  User git
  IdentityFile ~/.ssh/cpmind_deploy
EOF
```

Это создает псевдоним `github-cpmind` для GitHub с нашим ключом.

### Шаг 5 — Проверка соединения

```bash
ssh -T github-cpmind
# Ожидаем: Hi org/repo! You've successfully authenticated, but GitHub does not provide shell access.
```

---

## Клонирование репозитория

### Создание директории

```bash
sudo mkdir -p /opt/cpmind
sudo chown -R admin-cpmind:admin-cpmind /opt/cpmind
```

**Почему `chown`:** директория создается через `sudo` и принадлежит `root`. Для работы без `sudo` при `git pull` нужно передать владение текущему пользователю.

### Клонирование

```bash
git clone git@github-cpmind:YOUR_ORG/cpmind-mvp.git /opt/cpmind
cd /opt/cpmind
```

Используем псевдоним `github-cpmind` из SSH config — без ввода пароля.

### Проверка структуры

```bash
ls -l /opt/cpmind
# Должны быть: README.md, docker-compose.prod.yml, packages/, nginx/, backup/ и др.
```

---

## SSL-сертификат

### Установка Certbot

```bash
sudo apt install -y certbot
```

### Получение сертификата

```bash
sudo certbot certonly --standalone -d app.cpmind.tech
```

- `--standalone` — certbot запускает временный HTTP-сервер на порту 80 для валидации
- **Порт 80 должен быть свободен** — Docker еще не запущен, поэтому все в порядке

При первом запуске Certbot запросит:
1. Email для уведомлений о продлении
2. Согласие с условиями использования Let's Encrypt

**Успешный результат:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/app.cpmind.tech/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/app.cpmind.tech/privkey.pem
This certificate expires on 2026-09-13.
```

### Копирование сертификатов

```bash
mkdir -p /opt/cpmind/nginx/certs

sudo cp /etc/letsencrypt/live/app.cpmind.tech/fullchain.pem /opt/cpmind/nginx/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/app.cpmind.tech/privkey.pem   /opt/cpmind/nginx/certs/privkey.pem

sudo chmod 644 /opt/cpmind/nginx/certs/fullchain.pem
sudo chmod 600 /opt/cpmind/nginx/certs/privkey.pem
```

**Почему `sudo cp`:** файлы в `/etc/letsencrypt/live/` принадлежат root и доступны только для чтения суперпользователем.

**Почему `sudo chmod`:** после копирования через `sudo` файлы принадлежат root — `chmod` без `sudo` вернет `Permission denied`.

Проверка:
```bash
ls -l /opt/cpmind/nginx/certs/
# -rw-r--r-- 1 root root 4812 fullchain.pem
# -rw------- 1 root root  241 privkey.pem
```

---

## Настройка автообновления сертификата

Let's Encrypt сертификаты действуют 90 дней. Certbot устанавливает systemd timer для автоматического обновления — но он не копирует обновленные файлы в `nginx/certs/`. Нужен дополнительный скрипт.

### Создание скрипта обновления

```bash
mkdir -p /opt/cpmind/scripts

cat > /opt/cpmind/scripts/renew-certs.sh << 'EOF'
#!/bin/bash
certbot renew --quiet
cp /etc/letsencrypt/live/app.cpmind.tech/fullchain.pem /opt/cpmind/nginx/certs/fullchain.pem
cp /etc/letsencrypt/live/app.cpmind.tech/privkey.pem   /opt/cpmind/nginx/certs/privkey.pem
docker exec cpmind-nginx-1 nginx -s reload
EOF

chmod +x /opt/cpmind/scripts/renew-certs.sh
```

**Почему нет `sudo` внутри скрипта:** cron запускает скрипт от имени `root` (см. ниже), `sudo` внутри избыточен.

### Добавление в cron

```bash
echo "30 3 * * * root /opt/cpmind/scripts/renew-certs.sh" | sudo tee /etc/cron.d/cpmind-certs
```

Запуск: ежедневно в 03:30 UTC.

### Проверка работы (dry-run)

```bash
sudo certbot renew --dry-run
# Ожидаем: Congratulations, all simulated renewals succeeded
```

---

## Конфигурация nginx

Файл `nginx/nginx.conf` хранится в репозитории. Перед деплоем убедитесь, что `server_name` указан правильно.

Должно быть:
```nginx
server_name app.cpmind.tech;
```

В обоих блоках `server {}` (HTTP и HTTPS).

Полный файл `nginx/nginx.conf`:

```nginx
events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  limit_req_zone $binary_remote_addr zone=tag_endpoint:10m rate=100r/s;

  server {
    listen 80;
    server_name app.cpmind.tech;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name app.cpmind.tech;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 1m;

    location /tag/ {
      alias /etc/nginx/tag/;
      add_header Access-Control-Allow-Origin *;
      add_header Cache-Control "public, max-age=3600";
    }

    location = /api/impressions {
      limit_req zone=tag_endpoint burst=200 nodelay;
      proxy_pass http://backend:3001;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 5s;
    }

    location /api/ {
      proxy_pass http://backend:3001;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Cookie $http_cookie;
      proxy_read_timeout 30s;
    }

    location / {
      proxy_pass http://frontend:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Cookie $http_cookie;
      proxy_read_timeout 30s;
    }
  }
}
```

**Критически важно:** блок `location /tag/` должен быть **внутри** блока `server { listen 443 ssl; }`. Если разместить снаружи — nginx не запустится (Directive not allowed here).

---

## Переменные окружения (.env)

### Что нужно в .env для production

В production `.env` нужны только секреты. Все остальное задано в `docker-compose.prod.yml`.

```bash
DB_PASSWORD=
JWT_SECRET=
COOKIE_SECRET=
ADMIN_LOGIN=
ADMIN_PASSWORD_HASH=
```

### Генерация секретов

Для генерации нужен Node.js. Установите временно:

```bash
sudo apt install -y nodejs npm
```

**DB_PASSWORD — случайный пароль:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**JWT_SECRET и COOKIE_SECRET — минимум 64 символа:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**ADMIN_PASSWORD_HASH — bcrypt-хэш пароля:**

```bash
# Запускать из директории /opt/cpmind
cd /opt/cpmind
npm install bcryptjs
node -e "require('bcryptjs').hash('ВАШ_ПАРОЛЬ', 10).then(console.log)"

# Убрать bcryptjs из корневого package.json и артефакты npm
git checkout package.json
rm -rf node_modules package-lock.json
```

**Важно:** `npm install bcryptjs` должен выполняться из директории с `package.json` (то есть из `/opt/cpmind`). Из `/` будет ошибка `Tracker "idealTree" already exists`.

### Создание .env файла

```bash
cat > /opt/cpmind/.env << 'EOF'
DB_PASSWORD=СГЕНЕРИРОВАННЫЙ_ПАРОЛЬ
JWT_SECRET=СГЕНЕРИРОВАННЫЙ_JWT_SECRET
COOKIE_SECRET=СГЕНЕРИРОВАННЫЙ_COOKIE_SECRET
ADMIN_LOGIN=admin
ADMIN_PASSWORD_HASH=СГЕНЕРИРОВАННЫЙ_HASH
EOF
```

**Важно:** bcrypt-хэши содержат символ `$` (например: `$2b$10$...`). Docker Compose интерпретирует `$` как начало переменной окружения. Для безопасной передачи экспортируйте переменные через shell:

```bash
export $(cat /opt/cpmind/.env | xargs)
```

Или передавайте через `export` вручную перед запуском `docker compose`.

---

## Запуск стека

### Создание директории для бэкапов

```bash
mkdir -p /opt/cpmind/backups
```

Эта директория не в репозитории (только `.gitkeep`). Docker создаст ее как root если не создать заранее — это вызовет ошибки прав при записи бэкапов.

### Первый запуск

```bash
cd /opt/cpmind
docker compose -f docker-compose.prod.yml up --build -d
```

`--build` — пересобрать образы (обязательно при первом запуске и при изменениях кода).
`-d` — запустить в фоне (detached mode).

**Первый запуск занимает 3–5 минут:** скачиваются базовые образы, собираются backend и frontend, устанавливаются зависимости через pnpm.

### Ожидаемый результат

```
✔ Image postgres:16-alpine       Pulled
✔ Image nginx:1.27-alpine        Pulled
✔ Image cpmind-backend           Built
✔ Image cpmind-frontend          Built
✔ Image cpmind-tag-builder       Built
✔ Container cpmind-postgres-1    Healthy
✔ Container cpmind-tag-builder-1 Exited      ← нормально, одноразовый контейнер
✔ Container cpmind-backend-1     Healthy
✔ Container cpmind-backup-1      Started
✔ Container cpmind-frontend-1    Healthy
✔ Container cpmind-nginx-1       Started
```

`cpmind-tag-builder-1` с состоянием `Exited` — это нормально. Он собирает тег, копирует в volume и завершает работу с кодом 0.

---

## Проверка работоспособности

### Уровень 1 — Health check API

```bash
curl https://app.cpmind.tech/api/health
# Ожидаем: {"ok":true,"db":"ok","ts":"..."}
```

### Уровень 2 — Тег доступен

```bash
curl -I https://app.cpmind.tech/tag/cpmind-tag.min.js
# Ожидаем: HTTP/2 200, Content-Type: application/javascript, Access-Control-Allow-Origin: *
```

### Уровень 3 — Панель аналитики

Открыть в браузере `https://app.cpmind.tech` — должен открыться редирект на `/login`.

### Уровень 4 — Отправка тестового импрешена

```bash
curl -X POST https://app.cpmind.tech/api/impressions \
  -H "Content-Type: application/json" \
  -d '{
    "impression_id": "00000000-0000-0000-0000-000000000001",
    "campaign_id": "deploy_test",
    "creative_id": "test_banner",
    "creative_type": "banner_static",
    "device_type": "desktop",
    "timestamp_start": 1718444000000,
    "timestamp_end": 1718444010000,
    "signals": {
      "s1": {"time_in_view_sec": 5.0, "mrc_compliant": true, "visible_pixels_pct": 80, "max_continuous_view_sec": 5.0},
      "s2": {"share_of_screen_avg_pct": 15.0, "share_of_screen_max_pct": 15.0},
      "s3": null,
      "s4": {"tab_active_time_ms": 9000, "tab_total_time_ms": 10000, "tab_switches_count": 0, "visibility_state_history": [{"state": "visible", "timestamp": 1718444000000}]},
      "s5": {"clicked": false, "hover_count": 0, "hover_duration_max_ms": 0, "hover_duration_total_ms": 0, "hover_to_click_latency_ms": null, "cursor_proximity_min_px": 500, "cursor_trajectory_entropy": 0, "tap_count": null, "touch_start_end_delta_ms": null, "zoom": null, "swipe_count": null},
      "s7": {"creative_position_y_px": 500, "page_height_total_px": 2000, "is_above_the_fold": false, "competing_ads_visible": 0, "viewability_persistence_pct": 80.0}
    },
    "presence": {"last_user_event_timestamp": 1718444009000, "time_since_last_event_ms": 1000, "events_count_during_impression": 10}
  }'
# Ожидаем: 202 {"ok":true}
```

### Уровень 5 — Запись в БД

```bash
docker exec -it cpmind-postgres-1 psql -U cpmind -d cpmind \
  -c "SELECT impression_id, campaign_id, score_final, created_at FROM impressions ORDER BY created_at DESC LIMIT 5;"
```

Должна появиться запись с `campaign_id = deploy_test`.

### Уровень 6 — Статус контейнеров

```bash
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
```

**Ожидаемое потребление памяти:**
- nginx: ~10 MB
- frontend: ~40 MB
- backend: ~30 MB
- postgres: ~40 MB
- backup: ~1 MB

---

## Просмотр логов

### Все сервисы

```bash
docker compose -f docker-compose.prod.yml logs -f
```

`-f` — следить за новыми логами в реальном времени (Ctrl+C для выхода).

### Конкретный сервис

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Последние N строк

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### Что смотреть в логах

**Backend — входящие запросы:**
```json
{"level":30,"reqId":"req-1","req":{"method":"POST","url":"/api/impressions"},"msg":"incoming request"}
{"level":30,"reqId":"req-1","res":{"statusCode":202},"responseTime":5.23,"msg":"request completed"}
```

**Backend — ошибки валидации:**
```json
{"level":30,"reqId":"req-2","res":{"statusCode":422},"msg":"request completed"}
```

**NGINX — входящий трафик:**
```
91.228.155.139 - - [15/Jun/2026:10:32:53 +0000] "GET /api/health HTTP/1.1" 200 53
```

**Postgres — нормальная работа:**
```
database system is ready to accept connections
checkpoint starting: time
```

---

## Обновление продакшна

### Стандартное обновление (код изменился)

```bash
cd /opt/cpmind
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Docker пересобирает только изменившиеся слои (кэширование). Если изменился только тег — пересоберется только `tag-builder`. Если только frontend — только `frontend`.

### Обновление без пересборки (конфиги)

Если изменился только `nginx.conf` или `.env`:

```bash
cd /opt/cpmind
git pull
docker compose -f docker-compose.prod.yml up -d
```

### Полная пересборка с нуля

```bash
cd /opt/cpmind
git pull
docker compose -f docker-compose.prod.yml down --volumes --remove-orphans
docker system prune -af --volumes
docker compose -f docker-compose.prod.yml up --build -d
```

**Внимание:** `--volumes` удаляет все данные PostgreSQL. Использовать только при наличии бэкапа или на тестовом окружении.

### Только перезапуск конкретного сервиса

```bash
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart nginx
```

---

## Типичные ошибки и решения

### Ошибка: Permission denied при apt

```
E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)
```

**Причина:** команда выполняется без `sudo`.

**Решение:**
```bash
sudo apt update && sudo apt upgrade -y
```

---

### Ошибка: gpg Permission denied при добавлении ключа Docker

```
gpg: can't create '/etc/apt/keyrings/docker.gpg': Permission denied
gpg: dearmoring failed: Permission denied
```

**Причина:** `gpg` в правой части пайпа запускается без `sudo`. Пайп не наследует `sudo` с левой стороны.

**Решение:** `sudo` нужен на обеих командах:
```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

---

### Ошибка: ERR_PNPM_OUTDATED_LOCKFILE при сборке Docker

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date
Failure reason: specifiers in the lockfile ({"typescript":"^5.4.0"}) don't match specs in package.json ({"typescript":"^5.4.0","bcryptjs":"^3.0.3"})
```

**Причина:** на сервере ранее запускался `npm install bcryptjs` из корневой директории, что добавило `bcryptjs` в корневой `package.json`.

**Решение:**
```bash
cd /opt/cpmind
git checkout package.json    # восстановить package.json из git
rm -rf node_modules package-lock.json   # удалить артефакты
docker compose -f docker-compose.prod.yml up --build -d
```

---

### Ошибка: HTTPS → HTTP (302 Preflight failed)

В DevTools браузера:
```
Preflight response is not successful. Status code: 302
Beacon API cannot load http://app.cpmind.tech/api/impressions
```

**Причина:** в `data-endpoint` тега указан `http://` вместо `https://`. NGINX редиректит на HTTPS, браузер считает preflight неуспешным.

**Решение:** проверить `data-endpoint` на тестовой странице:
```html
data-endpoint="https://app.cpmind.tech/api/impressions"
```

---

### Ошибка: location /tag/ не работает (nginx не стартует)

```
nginx: [emerg] "location" directive is not allowed here
```

**Причина:** блок `location /tag/ {}` размещен вне блока `server {}`.

**Решение:** переместить `location /tag/` **внутрь** блока `server { listen 443 ssl; }`:
```nginx
server {
    listen 443 ssl;
    server_name app.cpmind.tech;

    location /tag/ {     ← ЗДЕСЬ, внутри server {}
        alias /etc/nginx/tag/;
        ...
    }
    ...
}
```

---

### Ошибка: Content-Type: text/plain для тега (JS не выполняется)

```
curl -I https://app.cpmind.tech/tag/cpmind-tag.min.js
# Content-Type: text/plain  ← неправильно
```

**Причина:** в `nginx.conf` отсутствует `include /etc/nginx/mime.types;`.

**Решение:** добавить в начало блока `http {}`:
```nginx
http {
  include /etc/nginx/mime.types;
  ...
}
```

---

### Ошибка: chmod на сертификатах без sudo

```
chmod: changing permissions of '/opt/cpmind/nginx/certs/fullchain.pem': Operation not permitted
```

**Причина:** файлы скопированы через `sudo cp` и принадлежат root.

**Решение:**
```bash
sudo chmod 644 /opt/cpmind/nginx/certs/fullchain.pem
sudo chmod 600 /opt/cpmind/nginx/certs/privkey.pem
```

---

### Ошибка: npm install из неправильной директории

```
npm ERR! Tracker "idealTree" already exists
```

**Причина:** `npm install` запущен не из директории с проектом (например, из `/`).

**Решение:**
```bash
cd /opt/cpmind
npm install bcryptjs   # только отсюда
```

---

### Ошибка: тег не записывает импрешены при тестировании через file://

**Описание:** при открытии `test/banner-test.html` двойным кликом (протокол `file://`) без `?cpmind_debug=1` импрешены записываются только при клике по баннеру.

**Это не баг.** `file://` — ненастоящий HTTP origin. Safari из `file://` ненадежно обрабатывает события `visibilitychange` и `pagehide` без активного event loop. На реальных HTTPS-страницах все работает корректно.

**Для надежного тестирования:**
```bash
python3 -m http.server 8080
# Открыть: http://localhost:8080/test/banner-test.html?cpmind_debug=1
```

---

## Экстренные операции

### Ручной бэкап БД

```bash
docker exec cpmind-postgres-1 \
  pg_dump -U cpmind cpmind > /opt/cpmind/backups/manual_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановление из бэкапа

```bash
# Остановить backend чтобы не было новых записей
docker compose -f docker-compose.prod.yml stop backend

# Восстановить
cat /opt/cpmind/backups/manual_20260615_103952.sql | \
  docker exec -i cpmind-postgres-1 psql -U cpmind -d cpmind

# Запустить backend
docker compose -f docker-compose.prod.yml start backend
```

### Подключение к БД напрямую

```bash
docker exec -it cpmind-postgres-1 psql -U cpmind -d cpmind
```

Полезные команды psql:
```sql
\dt                    -- список таблиц
\d impressions         -- структура таблицы
SELECT COUNT(*) FROM impressions;
SELECT * FROM impressions ORDER BY created_at DESC LIMIT 5;
\q                     -- выход
```

### Перезагрузка nginx без остановки

```bash
docker exec cpmind-nginx-1 nginx -s reload
```

### Остановка всего стека

```bash
docker compose -f docker-compose.prod.yml down
```

### Просмотр использования диска

```bash
df -h
docker system df          # использование Docker (образы, volumes, контейнеры)
du -sh /opt/cpmind/backups/    # размер бэкапов
```