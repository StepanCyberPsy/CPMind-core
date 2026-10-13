# КАРТА ИСПРАВЛЕНИЙ

Отложенные дефекты: две ad-сессии на показ у VAST, measurement_mode: legacy_tag в impressions, пустой measurement_started_at, нестабильный s6_completion_rate_pct, asset_gc без прав на удаление, отсутствие архивирования оригиналов, allowedDomains без enforcement, резолвинг upstream в nginx.

# Итоговый реестр неисправностей

| # | Неисправность | Приоритет | Доказательство |
|---|---|---|---|
| **K** | Развёрнутый `nginx.conf` не совпадает с файлом в репозитории | **P0 / блокирует работы** | `/e/` отвечает набором заголовков блока `location /` |
| **J** | `Cross-Origin-Resource-Policy: same-origin` на `delivery.cpmind.tech` блокирует загрузку embed-скрипта с домена издателя | **P0** | Замер `/e/`: единственный CORP-заголовок, значение `same-origin` |
| **B** | Префикс `runtime/` в delivery-бакете пуст: loader, display, player, creative-bridge отсутствуют | **P0** | 404 на loader и player; ни один Dockerfile не собирает эти пакеты; шага публикации нет ни в одном компоненте |
| **A** | `/tag/cpmind-tag_v4.min.js` → 404; `tag_dist` пуст | **P0** | Volume создан `2026-09-08T16:31:23Z`, файлы `v1`–`v4` собирались 15–17.08 на прежнем томе; `v0` не собиралась никогда (bootstrap в обход `buildTagBundle`); стартовой сверки БД↔том нет |
| **C** | `creative.cpmind.tech` → 403 на любой объект | **P0** | `GET /health/cdn-test.txt` → 403 через nginx, 200 через CDN. Bucket policy: `Allow` только для CDN-подсетей; IP сервера не покрыт |
| **F** | `banner_html5`: `iframe.src` получает URL ZIP-архива | **P0** | `html5.ts:98–112` — единственный публикуемый ассет `extension: 'zip'`; шага распаковки нет нигде |
| **E** | Снипет на странице издателя не соответствует ни legacy-, ни hosted-контракту | **P0** | Legacy-URL тега + обращение к `CPMindPlayer`; тег экспонирует `CPMindTag` |
| **I** | Дублирование security-заголовков helmet ↔ nginx | **P1** | HSTS: обрабатывается только первый → `preload` и `max-age=31536000` не применяются. XFO: конфликт `SAMEORIGIN`/`DENY` |
| **C′** | `Cache-Control: public, max-age=31536000, immutable` навешивается на 403/404 от `creative.*` | **P1** | Замер: заголовок присутствует в 403-ответе |
| **L** | `cpmind-source-assets` пуст после трёх успешных job'ов | **P1** | Листинг бакета; документация заявляет архивирование оригиналов |
| **M** | `media-worker` не может удалять объекты из staging (403) | **P2** | Логи: `AccessDenied` на `DeleteObject` ×3; роль `storage.uploader` не включает DELETE |
| **N** | CORS staging-бакета: origin `app.cpmind.tech` без схемы | **P2** | Консоль Y.Cloud; сравнение с `http://localhost:3000` в том же списке |
| **O** | `infra/` (Terraform) никогда не применялся; действующая bucket policy в коде отсутствует | **P1** | Нет state-бакета, нет Terraform на сервере; политика существует только в консоли |
| **P** | `frontend`: `public/` создаётся пустым и не по тому пути | **P3** | Dockerfile: `mkdir -p ./public` при `WORKDIR /app`, рантайм — `/app/packages/frontend` |

**Работоспособно и вмешательства не требует:** DNS всех четырёх доменов, TLS, шесть контейнеров, панель, presigned-загрузка, media-pipeline обработки (3 успешных job'а), CDN-раздача ассетов (200 + `immutable` + `accept-ranges`), CORS на всех измеренных эндпоинтах, scoring pipeline, десять фоновых задач, превью.

---

# ЧАСТЬ III. План работ

Принципы: каждый шаг имеет однозначный критерий приёмки; шаги упорядочены по зависимостям; ничего не меняется в компоненте, чей фактический код не сверен с репозиторием.

---

## ФАЗА 0 — Восстановление доверия к источникам истины

Без этой фазы любые правки конфигурации непредсказуемы.

### Шаг 0.1 — Сверка развёрнутого nginx с репозиторием (K)

```bash
cd /opt/cpmind
docker compose -f docker-compose.prod.yml exec nginx nginx -T > /tmp/nginx-deployed.conf
sed -n '/http {/,$p' /tmp/nginx-deployed.conf > /tmp/deployed-http.conf
diff -u nginx/nginx.conf /tmp/deployed-http.conf
git log --oneline -5 -- nginx/nginx.conf
git status --porcelain nginx/
```

**Разбор результата:**
- Если diff непустой — на сервере смонтирован файл, отличный от коммита. Привести в соответствие: определить, какая версия корректна, зафиксировать в git, передеплоить.
- Если diff пустой — значит `location ~ ^/e/` есть в рабочем конфиге, но не срабатывает. Тогда проверить порядок и наличие конфликтующих регулярных location выше по файлу и повторить замер с `-v`.

**Критерий приёмки:** `curl -sSI https://delivery.cpmind.tech/e/TEST.js` возвращает заголовки, однозначно идентифицирующие блок `~ ^/e/` (наличие `Cross-Origin-Resource-Policy` от nginx).

### Шаг 0.2 — Инвентаризация процесса сборки и деплоя

```bash
ls -la .github/workflows/ 2>/dev/null || echo "NO CI"
cat package.json | grep -A30 '"scripts"'
ls -la packages/embed/dist packages/player/dist packages/display-runtime/dist packages/creative-bridge/dist 2>&1
cat packages/embed/build.ts packages/display-runtime/build.ts
git log --oneline -10
```

**Цель:** зафиксировать, существует ли CI, какие есть скрипты сборки, и точные `outfile`/`define` каждого из четырёх IIFE-пакетов. Эти значения нужны на шаге 1.1 и не могут быть взяты из документации (в `INFRA_LOGIC.md` и `EMBED_LOGIC.md` имена бандлов расходятся).

### Шаг 0.3 — Проверка загрузки source-ассетов (L)

```bash
grep -rn "SOURCE_BUCKET\|sourceBucket" packages/media-worker/src/
```

**Цель:** определить, реализована ли вообще запись в `cpmind-source-assets`. Бакет пуст после трёх успешных job'ов — либо кода нет, либо он не вызывается. От ответа зависит объём шага 3.3.

---

## ФАЗА 1 — Восстановление плоскости раздачи runtime (B)

Самая объёмная часть. Без неё не работает ничего в hosted-flow.

### Шаг 1.1 — Сборка четырёх IIFE-бандлов в Docker

Создать `packages/runtime-publisher/Dockerfile` (или добавить стадию в существующий образ — решение зависит от результата 0.2):

Стадия `builder` должна:
1. Установить зависимости для `@cpmind/embed`, `@cpmind/display-runtime`, `@cpmind/player`, `@cpmind/creative-bridge` (`pnpm install --frozen-lockfile --filter ...`).
2. Собрать `@cpmind/shared` и `@cpmind/sdk` (оба инлайнятся в бандлы).
3. Выполнить сборку каждого пакета, передав в окружение сборки **ровно те же значения**, что использует backend в рантайме:
   - `CDN_BASE_URL` — baked-in в `embed` через esbuild `define` (`EMBED_LOGIC.md`);
   - `CDN_HOSTNAME` — baked-in в `player` для `assertTrustedMediaUrl` (`PLAYER_LOGIC.md`);
   - `DISPLAY_RUNTIME_VERSION`, `PLAYER_RUNTIME_VERSION` — определяют имена `cpmind-display_v{N}.min.js` и `cpmind-player_v{N}.min.js`.

**Критично:** если `CDN_BASE_URL` при сборке `embed` разойдётся с `CDN_BASE_URL` в `.env` backend'а, loader будет запрашивать runtime по одному адресу, а backend генерировать ссылку на loader по другому. Значения обязаны браться из одного `.env`.

**Критерий приёмки:** в образе присутствуют четыре файла; `grep -o 'https://[a-z.]*cpmind[a-z.]*' dist/cpmind-loader_v1.min.js` возвращает `https://cdn.cpmind.tech`.

### Шаг 1.2 — Публикация бандлов в delivery-бакет

Добавить в `docker-compose.prod.yml` одноразовый сервис `runtime-publisher`:

- `restart: "no"` — выполняется при каждом `up -d --build` и завершается;
- окружение: `BUCKET_WORKER_KEY_ID`, `BUCKET_WORKER_SECRET`, `DELIVERY_BUCKET`, `CDN_BASE_URL`, `DISPLAY_RUNTIME_VERSION`, `PLAYER_RUNTIME_VERSION`;
- `nginx.depends_on` дополнить `runtime-publisher: { condition: service_completed_successfully }`.

**IAM не требует изменений.** Сервисный аккаунт `cpmind-media-worker` уже имеет `storage.uploader` на `cpmind-delivery-assets`, и правило 3 действующей bucket policy явно разрешает ему `PutObject` на `cpmind-delivery-assets/*`. Ключи `YC_WORKER_*` уже есть в `.env`.

Скрипт публикации (`@aws-sdk/client-s3`, уже в зависимостях монорепо) выполняет `PutObject` для каждого файла:

| Ключ | ContentType | CacheControl |
|---|---|---|
| `runtime/cpmind-loader_v1.min.js` | `application/javascript; charset=utf-8` | `public, max-age=31536000, immutable` |
| `runtime/cpmind-display_v{N}.min.js` | `application/javascript; charset=utf-8` | `public, max-age=31536000, immutable` |
| `runtime/cpmind-player_v{N}.min.js` | `application/javascript; charset=utf-8` | `public, max-age=31536000, immutable` |
| `runtime/cpmind-creative-bridge_v1.min.js` | `application/javascript; charset=utf-8` | `public, max-age=31536000, immutable` |

`ContentType` обязателен: CDN сконфигурирован в режиме «скрыть все заголовки источника, кроме указанных», и `Content-Type` в whitelist есть — но это означает, что клиент получит **именно то**, что вернёт бакет. Без явного `ContentType` объект получит `binary/octet-stream`, и при `X-Content-Type-Options: nosniff` от CDN браузер откажется исполнять бандл — воспроизведётся та же ошибка, что сейчас на `/tag/`.

Скрипт завершается с ненулевым кодом при любой ошибке PUT — тогда `nginx` не стартует, и деплой падает явно, а не тихо.

**Критерий приёмки:**
```bash
for f in cpmind-loader_v1 cpmind-display_v1 cpmind-player_v1 cpmind-creative-bridge_v1; do
  curl -sSI https://cdn.cpmind.tech/runtime/$f.min.js | head -4
done
```
Все четыре — `200`, `content-type: application/javascript; charset=utf-8`.

### Шаг 1.3 — Политика версионирования

Имена содержат версию, объекты иммутабельны, `Cache-Control` — год. При повышении `DISPLAY_RUNTIME_VERSION` / `PLAYER_RUNTIME_VERSION` в `.env` публикуется новый ключ, backend начинает выдавать новую версию в `DeliveryRuntimeConfig`, старая остаётся доступной для уже закешированных страниц. Инвалидация кеша CDN не требуется и не должна применяться.

`cpmind-loader_v1` и `cpmind-creative-bridge_v1` версионируются вручную в коде пакетов — при их изменении версия в имени файла должна увеличиваться, иначе перезапись иммутабельного ключа не дойдёт до клиентов из-за годового кеша. Зафиксировать это правило в `INFRA_LOGIC.md`.

---

## ФАЗА 2 — Восстановление legacy-тега (A)

### Шаг 2.1 — Стартовая сверка `tag_dist` с БД

Сборщик находится в backend — это подтверждено:
```
packages/backend/dist/services/tag/tag_builder.js:12: // fallback в packages/tag/dist ...
packages/backend/dist/services/tag/tag_builder.js:21: // ... packages/tag/src/constants.ts ...
```
Образ содержит `packages/tag/src` и `packages/tag/node_modules/.bin/esbuild`. **Инструментов достаточно, менять Dockerfile не нужно.**

Добавить в `packages/backend/src/services/tag/tag_builder.ts` функцию `reconcileTagBundles()`:
1. `SELECT version FROM tag_constants_configs WHERE is_active = true`
2. Для каждой версии проверить наличие `${TAG_DIST_DIR}/cpmind-tag_v{version}.min.js`
3. При отсутствии — загрузить `constants` этой версии из БД и вызвать `buildTagBundle(constants, version, outputPath)`
4. Залогировать сводку: сколько версий активно, сколько собрано, сколько уже присутствовало

Вызвать её в `index.ts` в bootstrap-последовательности, **после** `bootstrapTagConstants()` и **до** `Server listening`. Ошибка сборки — `process.exit(1)` по тому же паттерну, что остальные bootstrap-функции.

Это одновременно закрывает оба случая: потерю тома (`v4`) и версию, созданную в обход сборщика (`v0`).

**Критерий приёмки:**
```bash
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml exec backend ls -la /tag_dist
curl -sSI https://app.cpmind.tech/tag/cpmind-tag_v4.min.js
```
В `/tag_dist` два файла (`v0`, `v4`); curl → `200`, `content-type: text/javascript` или `application/javascript`.

### Шаг 2.2 — Согласование деактивации

`BACKEND_LOGIC.md`: «Деактивация = удаление физического файла». Проверить, что `reconcileTagBundles()` не восстанавливает файлы деактивированных версий (`v1`–`v3`) — сверка идёт строго по `is_active = true`. Это уже заложено в шаге 2.1, но подлежит проверке тестом: после деактивации `v4` и рестарта backend файл `cpmind-tag_v4.min.js` не должен появиться.

---

## ФАЗА 3 — HTML5-креативы (F)

### Шаг 3.1 — Публикация распакованного бандла

Изменить `packages/media-worker/src/processing/html5.ts`. Текущая последовательность заканчивается `repackZip(extractDir, outputPath)` и публикацией единственного ZIP.

Новая последовательность после `injectBridgeScript()` + `writeFile('index.html')`:

1. Вычислить `bundleSha` — SHA-256 детерминированной свёртки распакованного дерева (сортированный список `relativePath + '\0' + fileSha256`). Это даёт content-addressed идентификатор бандла и сохраняет дедупликацию.
2. Для каждого файла в `extractDir` выполнить `PutObject` в `DELIVERY_BUCKET` по ключу `html5/{bundleSha}/{relativePath}` с `ContentType`, определённым по расширению (обязателен — иначе `.js` и `.css` не будут исполнены/применены), и `CacheControl: public, max-age=31536000, immutable`.
3. Вернуть **один** `ProcessedFile` с:
   - `storageKey = html5/{bundleSha}/index.html`
   - `assetClass: 'html_file'` (значение уже есть в `AssetClassSchema`)
   - `role: 'source'`
   - `extension: 'html'`

Один зарегистрированный ассет сохраняет инвариант `assertProcessingResult()` («ровно 1 source asset») — изменения в media-worker'е ограничиваются одним файлом. Остальные распакованные файлы существуют в бакете, но не регистрируются в таблице `assets`; они иммутабельны и адресуются только через `bundleSha`.

`repackZip()` для delivery-плоскости больше не нужен.

**Побочный эффект:** `jobs/asset_gc.ts` удаляет ассеты без FK-ссылок, работая по таблице `assets`. Незарегистрированные файлы бандла им не затрагиваются — при удалении креатива остаётся «сирота». Внести в `asset_gc.ts` удаление префикса `html5/{bundleSha}/` при удалении ассета с `assetClass = 'html_file'`.

### Шаг 3.2 — Проверка backend

Изменения в backend **не требуются**: `buildCreativeUrl(storageKey)` для `banner_html5` уже формирует `https://creative.cpmind.tech/{storageKey}`, а `storageKey` теперь указывает на `index.html`. `display-runtime` присвоит `iframe.src` корректный URL без изменений.

Подлежит проверке одним grep'ом, что `buildCreativeUrl` не содержит хардкода префикса `assets/`.

### Шаг 3.3 — Архивирование оригинала (L)

По результату шага 0.3: если запись в `SOURCE_BUCKET` не реализована — реализовать (исходный загруженный файл, ключ `assets/sha256/{xx}/{yy}/{sha}.{ext}`, тот же паттерн). Если реализована, но не вызывается — включить вызов. Бакет `cpmind-source-assets` имеет KMS-шифрование и права `cpmind-media-worker`, дополнительной настройки не требует.

**Критерий приёмки фазы:** загрузить тестовый HTML5-ZIP через панель; после `status: ready` проверить
```bash
curl -sSI https://creative.cpmind.tech/html5/{bundleSha}/index.html
```
→ `200`, `content-type: text/html`.

---

## ФАЗА 4 — Доступ к `creative.cpmind.tech` (C, C′)

Выполняется после фазы 3 (до неё проверять нечего) и **обязательно** до сдачи HTML5-формата.

### Шаг 4.1 — Исправление bucket policy

Действующее правило `AllowCloudCDNRead` использует ключ `sourceip`, что в API соответствует `aws:sourceip`. По официальной документации Object Storage этот ключ сравнивает не только IP отправителя, но и адреса обратных прокси, переданные, например, в заголовке `X-Forwarded-For`.

Это имеет два следствия:

1. **Функциональное:** запрос от nginx приходит с `51.250.120.191`, не покрытого ни одним `Allow`-правилом → отказ.
2. **Безопасность:** nginx в блоке `creative.cpmind.tech` не переопределяет `X-Forwarded-For`, а nginx по умолчанию передаёт клиентские заголовки в upstream. Клиент, отправив `X-Forwarded-For: 188.72.103.4`, попадёт под `AllowCloudCDNRead` и получит прямой доступ к бакету в обход CDN. **Это активная уязвимость обхода политики.**

Правильное исправление — обе части одновременно:

**4.1a. Заменить ключ на `yc:originip`.** Документация: «В отличие от условия `aws:sourceip`, не учитываются IP-адреса обратных прокси-серверов… Используйте условие `yc:originip` для обеспечения более высокого уровня безопасности доступа.»

Консоль Y.Cloud не предлагает `yc:originip` в выпадающем списке ключей — это ограничение UI, не сервиса. Политика применяется через S3 API (`PutBucketPolicy`), CLI или Terraform. Учитывая, что на сервере нет ни `yc`, ни `aws` CLI, а устанавливать их на production-хост нежелательно, выполнить однократно из контейнера:

```bash
docker run --rm -it \
  -e AWS_ACCESS_KEY_ID=$BUCKET_WORKER_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY=$BUCKET_WORKER_SECRET \
  -v /opt/cpmind/policy.json:/policy.json:ro \
  amazon/aws-cli s3api put-bucket-policy \
    --endpoint-url https://storage.yandexcloud.net \
    --region ru-central1 \
    --bucket cpmind-delivery-assets \
    --policy file:///policy.json
```

Роль `storage.configurer` для применения политики у `cpmind-media-worker` уже есть.

Состав новой политики (все правила `Effect: Allow`, `Principal: "*"`, `Action: s3:GetObject`, `Resource: arn:aws:s3:::cpmind-delivery-assets/*`), в дополнение к сохраняемым правилам для `cpmind-media-worker` и `AllowAWSServices`:
- `AllowCloudCDNRead` — условие `IpAddress` / `yc:originip` / восемь текущих CDN-подсетей;
- `AllowCreativeOriginRead` — условие `IpAddress` / `yc:originip` / `51.250.120.191/32`.

**4.1b. Снять клиентские заголовки прокси в nginx.** В блоке `creative.cpmind.tech`, `location /` добавить:
```nginx
proxy_set_header X-Forwarded-For "";
proxy_set_header Forwarded "";
```
Это защита в глубину: даже при возврате к `aws:sourceip` подмена станет невозможной.

**Критерий приёмки:**
```bash
curl -sSI https://creative.cpmind.tech/health/cdn-test.txt                       # → 200
curl -sSI -H "X-Forwarded-For: 188.72.103.4" \
     https://cpmind-delivery-assets.storage.yandexcloud.net/health/cdn-test.txt  # → 403
curl -sSI https://cdn.cpmind.tech/health/cdn-test.txt                            # → 200 (не сломали CDN)
```

### Шаг 4.2 — Кеширование ошибок (C′)

`add_header Cache-Control "public, max-age=31536000, immutable" always` применяется и к `403`/`404`, что закрепляет ошибку доступа в браузерах и промежуточных прокси на год. Заменить на условный заголовок:

```nginx
# уровень http
map $upstream_status $creative_cache_control {
    default "";
    200     "public, max-age=31536000, immutable";
    206     "public, max-age=31536000, immutable";
    304     "public, max-age=31536000, immutable";
}
```
в `location /` блока `creative.cpmind.tech` заменить статический `add_header Cache-Control` на `add_header Cache-Control $creative_cache_control always;` — nginx не выводит заголовок с пустым значением.

**Обязательное действие после исправления 4.1:** объекты, уже отданные с 403 и годовым `Cache-Control`, останутся в кешах клиентов. Для тестовых стендов очистить кеш браузера; для production — учесть, что затронуты только те URL, которые уже запрашивались, а рабочих HTML5-размещений пока нет.

---

## ФАЗА 5 — Заголовки безопасности (J, I)

Выполняется только после шага 0.1.

### Шаг 5.1 — Разграничение ответственности helmet и nginx

Текущая проблема системная: `@fastify/helmet` и nginx выставляют пересекающиеся наборы, `add_header` в nginx добавляет, а не заменяет. Результат — дубли и конфликты, из которых один (**J**) блокирующий, один (HSTS) снимает `preload`.

Принять правило: **edge (nginx) владеет транспортными и фреймовыми заголовками; helmet владеет только тем, что nginx не выставляет.**

Конфигурация `@fastify/helmet` в backend:
```
contentSecurityPolicy: false
crossOriginResourcePolicy: false
crossOriginOpenerPolicy: false
frameguard: false
hsts: false
referrerPolicy: false
noSniff: false
```
Остаются под управлением helmet и не дублируются nginx: `x-dns-prefetch-control`, `x-download-options`, `x-permitted-cross-domain-policies`, `origin-agent-cluster`, `x-xss-protection`.

Это устраняет **J** (единственным CORP-заголовком станет тот, что задаёт nginx), **I** (HSTS `preload` начнёт применяться, конфликт XFO исчезнет) и делает поведение детерминированным вместо зависящего от порядка склейки заголовков.

### Шаг 5.2 — Дополнение nginx

В блоке `delivery.cpmind.tech` добавить `Cross-Origin-Resource-Policy: cross-origin` во **все три** location (`~ ^/e/`, `~ ^/t/`, `/`), а не только в `/e/`: VAST запрашивается в режиме CORS, но tracking-пиксели плеера идут `mode: 'no-cors'`, и после отключения helmet у них не останется CORP вовсе — что допустимо, но лучше задать явно.

В блоке `~ ^/e/` убрать `X-Frame-Options: DENY` — embed-эндпоинт отдаёт JavaScript, заголовок бессмысленен и создаёт шум.

**Критерий приёмки:**
```bash
curl -sSI -H "Origin: https://example.com" https://delivery.cpmind.tech/e/TEST.js
```
Ровно один `cross-origin-resource-policy: cross-origin`, ровно один `strict-transport-security`, ровно один `x-frame-options` (или его отсутствие), ровно один `access-control-allow-origin`.

Финальная проверка — загрузка `<script src="https://delivery.cpmind.tech/e/{token}.js">` со стороннего домена без ошибок в консоли.

---

## ФАЗА 6 — Интеграция на стороне издателя (E)

### Шаг 6.1 — Получение delivery token

В панели: создать campaign → creative (загрузить ассет) → placement с нужным `mode` (`outstream` / `instream_preroll` / `display`). `GET /api/placements/:uuid` возвращает `deliveryToken` (32 символа base64url) и готовый `embedCode`.

### Шаг 6.2 — Замена снипета

Удалить со страницы издателя оба фрагмента: `<script src="https://app.cpmind.tech/tag/cpmind-tag_v4.min.js">` и инлайн-код, обращающийся к `CPMindPlayer`. Установить единственный тег:

```html
<script async src="https://delivery.cpmind.tech/e/{deliveryToken}.js"></script>
```

Всё остальное — создание контейнера, загрузка loader'а, выбор runtime, вызов `CPMindPlayer.mountOutstream`, измерение — выполняется системой.

**Учесть ограничение размещения:** embed-скрипт создаёт `div` и монтирует его через `document.body.appendChild(el)` — то есть в конец `<body>`, без возможности указать точку вставки. Для интеграции внутри рекламного слота AdFox (что и есть текущий случай — на странице присутствуют `ads.adfox.ru` и IMA SDK) это корректно: скрипт исполняется внутри iframe креатива, и `document.body` — это тело слота. Для прямого встраивания в произвольное место страницы такой возможности сейчас нет. Если это требуется — потребуется доработка `services/delivery/embed.ts` (поддержка `data-cpmind-slot` с поиском существующего контейнера по id). Вынести в бэклог, к текущему кейсу не относится.

### Шаг 6.3 — Заполнение `allowedDomains`

Поле placement уже существует в БД и API, но принудительная проверка при резолвинге embed-скрипта, по `BACKEND_LOGIC.md`, «в дорожной карте». Реализовать в `services/delivery/embed.ts`: если `allowedDomains` непусто и `extractPublisherDomain(referer)` не входит в список — вернуть пустую строку по тому же паттерну, что для неактивного placement. Это единственный механизм, ограничивающий использование delivery-токена после его утечки.

---

## ФАЗА 7 — Приведение инфраструктурного кода в соответствие (O, M, N, P)

### Шаг 7.1 — Terraform: импорт вместо пересоздания (O)

Сейчас `infra/*.tf` — декларация намерений, расходящаяся с реальностью по IAM, CORS, CDN-заголовкам и DNS, а действующая bucket policy в коде отсутствует вовсе. Применение `terraform apply` к текущему состоянию **расширило бы права** (роли в коде выданы на уровне folder, в консоли — на уровне бакетов).

Порядок:
1. Создать бакет `cpmind-terraform-state` (вручную, один раз).
2. `terraform init` с ключами `infra-deployer`.
3. Привести `.tf` в соответствие с фактической конфигурацией: IAM на уровне бакетов, CORS staging с двумя origins, CDN options по данным консоли, DNS-записи `app`/`creative` (сейчас управляются в ISPmanager и в коде отсутствуют).
4. **Добавить отсутствующий ресурс `yandex_storage_bucket_policy`** для `cpmind-delivery-assets` с политикой из шага 4.1.
5. `terraform import` для каждого существующего ресурса.
6. `terraform plan` — обязан показать **нулевой diff**. Ненулевой diff означает, что код всё ещё расходится с реальностью; применять `apply` до достижения нулевого diff запрещено.

До получения нулевого diff `infra/` остаётся документацией, и все изменения делаются в консоли с последующим отражением в коде.

### Шаг 7.2 — Права media-worker на удаление из staging (M)

В консоли Y.Cloud: бакету `cpmind-upload-staging` добавить сервисному аккаунту `cpmind-media-worker` роль `storage.editor`. Отразить в `infra/iam.tf`.

**Критерий приёмки:** после загрузки нового креатива в логах media-worker отсутствует `Staging object cleanup failed`; объект исчезает из `staging/` немедленно, а не через 2 дня.

### Шаг 7.3 — CORS staging-бакета (N)

Заменить origin `app.cpmind.tech` на `https://app.cpmind.tech` (сравнение origin строгое посимвольное, заголовок `Origin` всегда содержит схему). Удалить `http://localhost:3000` из production-бакета — для локальной разработки использовать отдельный бакет.

**Критерий приёмки:** preflight `OPTIONS` на presigned URL с `Origin: https://app.cpmind.tech` возвращает `Access-Control-Allow-Origin: https://app.cpmind.tech`.

### Шаг 7.4 — Директория `public` во frontend (P)

В `packages/frontend/Dockerfile` заменить создание пустой директории на копирование реального содержимого по корректному пути:
```dockerfile
COPY --from=builder --chown=cpmind:cpmind /app/packages/frontend/public ./packages/frontend/public
```
Рантайм-`WORKDIR` — `/app/packages/frontend`, поэтому текущий `mkdir -p ./public` при `WORKDIR /app` создаёт директорию не там, где Next.js её ищет.

### Шаг 7.5 — Синхронизация документации

Обновить, приведя в соответствие с источниками истины: Node 20 → 22 во всех документах; SSL-раздел `ARCHITECTURE.md` (certbot и `scripts/renew-certs.sh` отсутствуют — описать фактическую схему выпуска сертификатов); CI/CD (убрать GitHub Actions либо реализовать); CORS-раздел `BACKEND_LOGIC.md`; путь `services/tag/tag_builder.ts`; ключ ассетов в `MEDIA_WORKER_LOGIC.md`; URL creative-bridge в `MEDIA_WORKER_LOGIC.md` и `CREATIVE_BRIDGE_LOGIC.md`; `measurementMode` для `banner_html5` (три несовпадающих утверждения).

---

# ЧАСТЬ IV. Порядок выполнения и зависимости

```
ФАЗА 0  ─ Сверка nginx.conf ────────────────────┐  блокирует 5
        └ Инвентаризация сборки ────────────────┤  блокирует 1
        └ Проверка source-загрузки ─────────────┤  блокирует 3.3
                                                │
ФАЗА 1  ─ Сборка + публикация runtime ──────────┤  независима, самая длинная
ФАЗА 2  ─ reconcileTagBundles ──────────────────┤  независима, самая короткая
                                                │
ФАЗА 3  ─ Распаковка HTML5 ─────────────────────┤
ФАЗА 4  ─ bucket policy + XFF + кеш ошибок ─────┤  проверяется через 3
ФАЗА 5  ─ helmet / nginx заголовки ─────────────┤  требует 0.1
                                                │
ФАЗА 6  ─ Снипет издателя ──────────────────────┘  требует 1, 5
ФАЗА 7  ─ Terraform, IAM, CORS, docs               параллельно, не блокирует
```

**Рекомендуемая последовательность:** 0 → 2 → 1 → 5 → 6 (даёт работающий `banner_static`/`banner_gif`/`video_creative` и восстановленный legacy-тег) → 3 → 4 (добавляет `banner_html5`) → 7.

**Контрольная точка после 6:** страница с одним embed-тегом должна показать креатив и в консоли не иметь ошибок; в `ad_sessions` должны появиться `requestedAt`, `assetLoadStartedAt`, `creativeReadyAt`, `renderConfirmedAt`; в `impressions` — запись после `pagehide`.

**Контрольная точка после 4:** то же для `banner_html5`, плюс успешный handshake `cpmind:ready` → `cpmind:init` в консоли iframe.

---

# ЧАСТЬ V. Требуют твоего решения перед стартом

1. **Результат шага 0.1.** Если развёрнутый nginx отличается от репозитория — какая версия считается эталонной. Все правки в фазах 4 и 5 идут в неё.
2. **Способ сборки runtime-бандлов (шаг 1.1):** отдельный сервис `runtime-publisher` в Compose (работает с текущим процессом `git pull` + `up -d --build`, не требует CI) либо job в GitHub Actions (требует настроенного CI, которого в предоставленных материалах нет). Я исхожу из первого варианта.
3. **Значения `DISPLAY_RUNTIME_VERSION` / `PLAYER_RUNTIME_VERSION`** на момент первой публикации — оставляем `1` из `.env` или начинаем с другой отметки.
4. **`http://localhost:3000` в CORS production-бакета** (шаг 7.3) — удаляем сейчас или после того, как будет поднят отдельный dev-бакет.
5. **Судьба `infra/`** — импортируем существующее (фаза 7.1, требует создания state-бакета и ключей `infra-deployer`) либо удаляем каталог, оставив консоль единственным источником. Промежуточное состояние — расходящийся код без применения — хуже обоих вариантов.

---

# ПРОВЕРКА

# Анализ: build-контур, nginx как источник истины, требования к инфраструктуре

---

# ЧАСТЬ I. Ответы на твои вопросы

## 1.1 CORS staging-бакета — снимаю замечание N

Ты подтвердил, что в консоли указан полный `https://app.cpmind.tech` со схемой. Моё замечание было основано на твоём первоначальном описании, где схема отсутствовала (`app.cpmind.tech`), тогда как рядом стоял `http://localhost:3000` со схемой. **Замечание N отзываю — конфигурация корректна.**

## 1.2 Почему `http://localhost:3000` можно оставить

Отвечаю прямо: **можно, инфраструктура от этого не ломается, и функционально это ни на что не влияет.** Моя формулировка «удалить» была преждевременной, и приоритет P2 был завышен.

Разбор по существу. CORS — это не механизм авторизации. Он управляет тем, какому origin браузер разрешит **прочитать ответ** кросс-доменного запроса. Авторизацией в вашем upload-контуре занимается presigned URL: подпись SigV4, выпущенная бэкендом под JWT-сессией, с TTL. Без presigned URL наличие origin в CORS-списке не даёт ничего — запрос будет отвергнут самим Object Storage на уровне подписи.

Что реально меняет наличие `http://localhost:3000`:

- Расширяется поверхность **только** для сценария, где presigned URL уже утёк, и одновременно жертва открывает страницу на `http://localhost:3000`, контролируемую атакующим (локально запущенный вредоносный dev-сервер, вредоносный npm-пакет с `postinstall`-сервером). Сценарий требует двух независимых компрометаций.
- Production-бакет получает конфигурацию, зависящую от окружения разработчика. Это аудиторская претензия, а не техническая.

Практический вывод: **оставляй до подтверждения работоспособности локального контура.** Это не блокирует ни одну из фаз плана. Удалить — на этапе финальной подготовки к go-live, вместе с переносом локальной разработки на отдельный dev-бакет.

## 1.3 Версии рантаймов

Принято: `DISPLAY_RUNTIME_VERSION=1`, `PLAYER_RUNTIME_VERSION=1` на момент первой публикации. Ключи в бакете: `runtime/cpmind-display_v1.min.js`, `runtime/cpmind-player_v1.min.js`.

---

# ЧАСТЬ II. Анализ build-контура: что реально собирается

## 2.1 Главный факт

**Скрипты сборки существуют, работают и покрывают все нужные пакеты. Отсутствует только их вызов в контуре деплоя.**

Корневой `package.json`:

```
"build": "pnpm --filter @cpmind/shared build
       && pnpm --filter @cpmind/sdk build
       && pnpm --filter @cpmind/tag build
       && pnpm --filter @cpmind/display-runtime build
       && pnpm --filter @cpmind/player build
       && pnpm --filter @cpmind/embed build
       && pnpm --filter @cpmind/creative-bridge build
       && pnpm --filter @cpmind/backend build"
```

Этот скрипт собирает **все четыре** IIFE-бандла в правильном порядке. Он **не вызывается ни в одном из трёх Dockerfile**. Ни один Dockerfile не копирует исходники `embed`, `display-runtime`, `player`, `creative-bridge`, и ни один не копирует их `package.json` в deps-стадию.

То есть неисправность B — не отсутствие сборки как таковой, а **отсутствие связки «сборка → артефакт → бакет»**. Это существенно упрощает работу: писать build-скрипты не нужно.

## 2.2 Что копирует каждый Dockerfile (deps-стадия)

| Dockerfile | `package.json` в deps | `--filter` | Собирает |
|---|---|---|---|
| `backend` | shared, backend, sdk, tag | `@cpmind/backend...`, `@cpmind/sdk...`, `@cpmind/tag` | shared, sdk, backend |
| `frontend` | shared, frontend | `@cpmind/frontend...` | shared, frontend |
| `media-worker` | shared, media-worker | `@cpmind/media-worker...` | shared, media-worker |

`packages/embed`, `packages/display-runtime`, `packages/player`, `packages/creative-bridge` не фигурируют нигде. Их `package.json` не попадает даже в deps-стадию, поэтому внутри любого из текущих образов эти пакеты для pnpm не существуют.

Побочное наблюдение: `backend` в deps-стадии копирует `packages/tag/package.json` и ставит `--filter @cpmind/tag` (без `...`), но не собирает tag — и это правильно, потому что сборка тега происходит в рантайме бэкендом. Проверка на сервере подтверждает, что devDependencies при этом устанавливаются:

```
packages/tag/node_modules/.bin/{esbuild, tsc, tsserver, tsx}
```

## 2.3 Ограничения порядка сборки, выведенные из `build.ts`

Все пять `build.ts` начинаются одинаково:

```typescript
import { TAG_BUILD_TARGETS } from '@cpmind/shared';
```

Это **top-level import, исполняемый `tsx` при запуске самого build-скрипта**. `@cpmind/shared` имеет `"main": "./dist/index.js"`. Следовательно:

1. **`packages/shared/dist` обязан существовать до запуска любого IIFE-билда.** Корневой скрипт это соблюдает.
2. **`tsx` обязан быть установлен.** Он в `devDependencies` каждого IIFE-пакета → образ сборки не может использовать `--prod`.
3. `display-runtime` дополнительно имеет `@cpmind/sdk` в **dependencies**, `player` и `tag` — тоже. `embed` и `creative-bridge` не зависят от sdk вовсе (только `@cpmind/shared` в devDependencies, для типов и `TAG_BUILD_TARGETS`).

Итоговый минимально достаточный порядок: `shared` → `sdk` → {`display-runtime`, `player`} параллельно с {`embed`, `creative-bridge`}.

## 2.4 Baked-in константы — критическая таблица консистентности

| Пакет | `define` | Источник значения | Default в `build.ts` | Есть в `.env`? |
|---|---|---|---|---|
| `embed` | `CDN_BASE_URL` | `process.env['CDN_BASE_URL']` | `https://cdn.cpmind.tech` | **да** |
| `player` | `CDN_HOSTNAME` | `process.env['CDN_HOSTNAME']` | `cdn.cpmind.tech` | **НЕТ** |
| `player` | `PLAYER_RUNTIME_VERSION` | `process.env['PLAYER_RUNTIME_VERSION']` | `'1'` | да |
| `display-runtime` | — (версия только в имени файла) | `process.env.DISPLAY_RUNTIME_VERSION` | `'1'` | да |
| `creative-bridge` | — | — | имя файла захардкожено `_v1` | — |
| `tag` | `__CPMIND_CONSTANTS__`, `__CPMIND_TAG_VERSION__` | из БД в рантайме | `DEFAULT_TAG_CONSTANTS`, `'dev'` | — |

**Новое замечание: `CDN_HOSTNAME` отсутствует в `.env`.** Сейчас `player/build.ts` подставит дефолт `cdn.cpmind.tech`, который случайно совпадает с фактическим доменом. Но это скрытая связь: при смене CDN-домена `CDN_BASE_URL` в `.env` изменится, а `CDN_HOSTNAME` — нет, и `assertTrustedMediaUrl` в плеере начнёт отклонять все MediaFile из VAST с ошибкой `NO_SUPPORTED_MEDIA`. Для enterprise-контура `CDN_HOSTNAME` обязан либо явно присутствовать в `.env`, либо детерминированно выводиться из `CDN_BASE_URL` в момент сборки.

## 2.5 Разрозненность версий creative-bridge и loader

Значение версии bridge существует в **трёх независимых местах** без единого источника:

| Место | Форма |
|---|---|
| `packages/creative-bridge/src/index.ts` | `const BRIDGE_VERSION = '1'` — значение в handshake `cpmind:ready` |
| `packages/creative-bridge/build.ts` | `outfile = 'dist/cpmind-creative-bridge_v1.min.js'` — захардкожено |
| `packages/media-worker/src/processing/html5.ts:17` | `${cdnBaseUrl}/runtime/cpmind-creative-bridge_${BRIDGE_VERSION}.min.js` |

Аналогично для loader: `packages/embed/build.ts` захардкоживает `cpmind-loader_v1.min.js`, и backend (`services/delivery/embed.ts`) независимо генерирует ту же строку в теле embed-скрипта.

При годовом `Cache-Control: immutable` рассогласование любой из этих точек означает, что клиенты продолжат исполнять старый бандл, а система будет считать, что раскатан новый. Это подлежит централизации в `@cpmind/shared` (константы `LOADER_RUNTIME_VERSION`, `BRIDGE_VERSION`) — тем более что `TAG_BUILD_TARGETS` уже там и служит именно этой цели.

## 2.6 Подтверждение имён артефактов

`build.ts` — источник истины. Окончательно:

```
dist/cpmind-loader_v1.min.js            (@cpmind/embed)
dist/cpmind-display_v1.min.js           (@cpmind/display-runtime)
dist/cpmind-player_v1.min.js            (@cpmind/player)
dist/cpmind-creative-bridge_v1.min.js   (@cpmind/creative-bridge)
dist/cpmind-tag.min.js                  (@cpmind/tag, CLI, version='dev')
```

Имя `cpmind-display-runtime_v1.min.js` из `INFRA_LOGIC.md` — ошибка документации. `EMBED_LOGIC.md` (`cpmind-display_v{version}`) верен.

Также подтверждено: `tag/build.ts` использует `globalName: 'CPMindTag'`. Глобал `CPMindPlayer` объявляется исключительно пакетом `player`. Неисправность **E** зафиксирована окончательно на уровне кода сборки.

## 2.7 Новое: build-скрипты спроектированы под программный вызов

Каждый `build.ts` экспортирует пару функций перед CLI-обёрткой:

```typescript
export async function buildLoaderBundle(outfile: string): Promise<number>
export async function watchLoaderBundle(outfile: string): Promise<void>
```

То же в `display-runtime`, `player`, `creative-bridge` и `tag` (там — `buildTagBundle(opts)` с параметризацией констант и версии).

Это означает, что publisher-скрипт может вызывать сборку либо через CLI (`pnpm --filter ... build`), либо программно. Первое проще и не требует настройки `exports` в `package.json` этих пакетов (сейчас его нет ни у одного из четырёх — они `private`, без `main`/`exports`, поэтому программный импорт извне пакета потребует явного пути к файлу).

Отмечу, что backend **не импортирует** `packages/tag/build.ts` — он содержит собственную реализацию в `services/tag/tag_builder.ts` (подтверждено grep'ом по dist, где есть комментарий про fallback в `packages/tag/dist`). То есть в системе уже есть прецедент дублирования esbuild-конфигурации между `build.ts` пакета и сервисом бэкенда. Это второй кандидат на централизацию.

---

# ЧАСТЬ III. Ответ на ключевой вопрос: publisher в Compose или GitHub Actions

## 3.1 Разделение двух задач

Задача распадается на две независимые:

1. **Сборка** четырёх IIFE-бандлов — скрипты готовы, нужна среда с `pnpm install` (включая devDeps) и собранным `shared`.
2. **Публикация** в `cpmind-delivery-assets` под префиксом `runtime/` с корректными `Content-Type` и `Cache-Control`.

## 3.2 Решающий аргумент против GitHub Actions

`embed` запекает `CDN_BASE_URL`, `player` запекает `CDN_HOSTNAME` и `PLAYER_RUNTIME_VERSION`, имя файла `display-runtime` определяется `DISPLAY_RUNTIME_VERSION`.

**Все эти значения живут в `/opt/cpmind/.env` на сервере. Этого файла нет в git и он недоступен CI.**

Если сборку выполняет GitHub Actions, значения придётся продублировать в secrets/variables репозитория. Возникают два источника истины для одних и тех же констант, между которыми нет механизма сверки. Расхождение проявится не ошибкой сборки, а тем, что loader будет запрашивать рантайм по одному хосту, а backend генерировать ссылку на loader по другому — то есть тихим отказом доставки в проде, диагностируемым только по консоли браузера на площадке издателя. Для enterprise-контура это неприемлемый класс отказа.

Дополнительно: текущая процедура деплоя — `git pull` + пересборка на сервере. CI, публикующий артефакты независимо от деплоя, вводит рассинхронизацию «код бэкенда на сервере vs бандлы в бакете», которую ничто не контролирует.

**Вывод: публикация рантайм-бандлов должна происходить на сервере, из того же `.env`, что читает backend, в рамках той же операции деплоя.**

GitHub Actions остаётся уместным и полезным — но для другого: `lint`, `tsc --noEmit`, `pnpm --filter @cpmind/shared test` (vitest уже подключён), проверка `pnpm-lock.yaml`. То есть quality gate до мержа, а не публикация артефактов.

## 3.3 Где именно выполнять публикацию: два варианта с обоснованием

### Вариант A — отдельный одноразовый сервис в Compose

Новый `packages/runtime-publisher/Dockerfile` + сервис с `restart: "no"`; `nginx.depends_on` дополняется `service_completed_successfully`.

**За:**
- Рантайм-бандлы — это **build-артефакты**, а не состояние приложения. Их место в деплой-конвейере, а не в жизненном цикле API-процесса.
- Готовность API не начинает зависеть от доступности Object Storage. Сейчас backend поднимается без единого обращения к S3 — это правильное свойство, и его стоит сохранить.
- Образ backend не разрастается на четыре пакета с их `node_modules`.
- Отказ публикации останавливает деплой явно (nginx не стартует), а не деградирует систему тихо.

**Против:**
- +1 Dockerfile, +1 сервис, +1 стадия сборки при каждом `up -d --build`.

### Вариант B — публикация при старте backend

Backend уже имеет `esbuild` **в production-зависимостях** и `@aws-sdk/client-s3` — технически всё есть.

**За:**
- Ни одного нового образа; симметрия с `reconcileTagBundles()`, который в любом случае нужен для неисправности A.

**Против:**
- В runner-образ backend придётся добавить `src` и `node_modules` четырёх пакетов — это ломает принцип минимального рантайм-образа.
- Старт API становится зависим от S3: недоступность Object Storage будет валить бэкенд, который в остальном полностью работоспособен без него.
- Каждый рестарт backend (`restart: always`) повторяет сборку и загрузку — при рестарт-цикле это шторм PUT-запросов.

### Принципиальное различие, определяющее выбор

Сборка **тега** обязана принадлежать бэкенду: артефакт производен от состояния БД (`tag_constants_configs`), его набор должен сходиться с активными версиями, и сверка возможна только там, где есть доступ к БД.

Сборка **рантайм-бандлов** производна от кода и `.env`, а не от БД. Ей место в деплой-шаге.

**Рекомендация: вариант A.** Тег остаётся за бэкендом (`reconcileTagBundles` при старте), рантаймы — за одноразовым сервисом деплоя.

## 3.4 Обязательные свойства publisher'а для enterprise-контура

1. **Идемпотентность с защитой иммутабельности.** Перед PUT: вычислить SHA-256 локального артефакта, выполнить `HeadObject`. Если ключ существует и содержимое отличается — **прервать деплой с ненулевым кодом** и сообщением о необходимости поднять версию. Молчаливая перезапись ключа с `Cache-Control: immutable, max-age=31536000` создаёт неустранимое расхождение между тем, что лежит в бакете, и тем, что исполняют браузеры в течение года.
2. **Явный `ContentType: application/javascript; charset=utf-8`.** CDN настроен в режиме «скрывать все заголовки источника, кроме указанных», `Content-Type` в whitelist есть — значит клиент получает ровно то, что вернул бакет. Без явного `ContentType` объект получит `binary/octet-stream`, и при `X-Content-Type-Options: nosniff` от CDN браузер откажется исполнять бандл. Это воспроизведёт ровно ту ошибку, что сейчас наблюдается на `/tag/`.
3. **Fail-fast.** Любая ошибка PUT → ненулевой код выхода → nginx не стартует.
4. **IAM без изменений.** `cpmind-media-worker` уже имеет `storage.uploader` на `cpmind-delivery-assets`, и правило 3 действующей bucket policy явно разрешает ему `PutObject` на `cpmind-delivery-assets/*`. Ключи `YC_WORKER_*` уже в `.env`. Новых сервисных аккаунтов не требуется.
5. **Единый `.env`.** Сервис получает `CDN_BASE_URL`, `CDN_HOSTNAME`, `DISPLAY_RUNTIME_VERSION`, `PLAYER_RUNTIME_VERSION`, `DELIVERY_BUCKET`, `YC_WORKER_*` из того же файла, что backend.

---

# ЧАСТЬ IV. `nginx.conf` как источник истины — что подтверждено и что подлежит правке

## 4.1 Нерешённое противоречие остаётся

Присланная финальная версия содержит в блоке `location ~ ^/e/` семь `add_header`, включая:

```nginx
add_header Cross-Origin-Resource-Policy "cross-origin" always;
add_header Access-Control-Allow-Origin "*" always;
```

Измерение `GET https://delivery.cpmind.tech/e/TESTTOKEN.js` возвращает **ни того, ни другого**: единственный CORP-заголовок — `same-origin` от helmet, единственный ACAO — `*` от backend. Присутствуют ровно пять заголовков, соответствующих блоку `location /`.

Механизм nginx это объяснить не может: регулярные location имеют приоритет над префиксными, `^/e/` соответствует URI, у всех `add_header` стоит `always` (то есть они применяются к любому коду ответа), а ответ имеет код 200.

**Вывод неизменен: смонтированный в контейнер файл отличается от присланного.** `INFRA_LOGIC.md` упоминает наличие в каталоге `nginx/` файлов `nginx_v1.conf`, `nginx_v2.conf`, `nginx_v3.conf` — вероятный источник расхождения.

`docker compose exec nginx nginx -T` до начала любых правок в nginx остаётся обязательным. Работать «вслепую» с файлом, чьё соответствие развёрнутому не подтверждено, для production-контура недопустимо.

## 4.2 Каталог дефектов в присланном файле

Фиксирую все найденные, с указанием, чем именно они плохи. Правки — в этот файл, после сверки 4.1.

**Блокирующие после устранения A–F:**

1. **`X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy` дублируются с helmet.** `add_header` добавляет, а не заменяет upstream-заголовок. HSTS: по RFC 6797 обрабатывается только первый заголовок — им оказывается helmet'овский `max-age=15552000` без `preload`, то есть директива `preload` из nginx не применяется никогда. XFO: конфликт `SAMEORIGIN` (helmet) и `DENY` (nginx). Устраняется на стороне backend отключением соответствующих модулей helmet, а не правкой nginx.

2. **`delivery`, `location /`: отсутствует `Cross-Origin-Resource-Policy`.** Сейчас его подставляет helmet значением `same-origin`. После отключения helmet-модуля CORP исчезнет вовсе. Для `/vast/` это безразлично (запрос в режиме CORS), но `location ~ ^/t/` тоже не имеет CORP, а VAST-tracking выполняется плеером в режиме `mode: 'no-cors'` — этому пути CORP нужен явно.

3. **`creative`, `location /`: клиентский `X-Forwarded-For` проксируется в Object Storage.** Блок переопределяет `Host` и `X-Real-IP`, но не `X-Forwarded-For`. nginx по умолчанию передаёт клиентские заголовки в upstream. Действующее правило bucket policy использует ключ `sourceip` (= `aws:sourceip`), который по документации Object Storage учитывает адреса обратных прокси из `X-Forwarded-For`. Клиент, отправивший `X-Forwarded-For: 188.72.103.4`, попадёт под `AllowCloudCDNRead`. **Это активный обход политики доступа**, и он существует независимо от того, будет ли добавлен IP сервера в разрешённые.

4. **`creative`, `location /`: `Cache-Control: public, max-age=31536000, immutable` со флагом `always`** навешивается на ответы `403` и `404`. Подтверждено измерением. Ошибка доступа закрепляется в браузерах и промежуточных кешах на год.

**Проявятся после Фазы 3 (распакованные HTML5-бандлы):**

5. **`limit_req zone=delivery burst=60 nodelay` в `creative`, `location /`.** Зона `delivery` — 60 r/s на IP. HTML5-бандл после распаковки будет отдаваться пофайлово: `index.html` + скрипты + стили + изображения + шрифты. Ограничение media-worker'а — до 500 записей в архиве. Загрузка бандла из нескольких десятков файлов в один момент времени с одного клиента превысит burst и получит `429` на часть ресурсов, то есть креатив отрендерится некорректно. **Для домена статических иммутабельных ассетов эта зона неприменима по своей природе** и требует отдельной зоны с существенно большими лимитами либо снятия ограничения в пользу `limit_conn`.

**Функциональные и гигиенические:**

6. **`gzip_types` не включает `text/html`, `text/css`, `image/svg+xml`.** `text/html` gzip-ится nginx всегда по умолчанию; `text/css` и `image/svg+xml` — нет. После Фазы 3 через `creative.cpmind.tech` пойдут CSS и SVG из HTML5-бандлов без компрессии.

7. **`location ~ \.\.` в `creative`** — регулярка сопоставляется с уже нормализованным URI, из которого nginx удалил сегменты `..`. Защита в значительной мере декоративна; реальную защиту даёт то, что запрос уходит в S3, где ключ — это плоская строка, а не путь в ФС.

8. **`location /tag/`: `add_header Cache-Control "public, max-age=3600"` без `always`.** Единственный `add_header` в блоке без этого флага — непоследовательно, хотя функционально безвредно (на 200 применяется).

9. **`proxy_pass https://cpmind-delivery-assets.storage.yandexcloud.net`** с литеральным именем резолвится однократно при загрузке конфигурации. Директива `resolver 127.0.0.11` для этого случая не задействуется. При смене IP endpoint'а Object Storage nginx продолжит обращаться к устаревшему адресу до перезагрузки конфигурации. Для внешнего upstream в production это подлежит устранению через переменную в `proxy_pass`.

10. **`ssl_stapling` закомментирован**; `ssl_stapling_verify` — тоже. Для enterprise-конфигурации OCSP stapling — стандартное требование.

11. **Отсутствует `location` для ACME-challenge.** `ARCHITECTURE.md` заявляет certbot и `scripts/renew-certs.sh`; в конфигурации нет ни `/.well-known/acme-challenge/`, ни соответствующего сервиса в Compose. Механизм продления сертификата не описан ни одним источником истины. Это отдельный вопрос, требующий выяснения до go-live.

12. **`client_max_body_size 1m` на `creative`** — блок обслуживает только GET-проксирование, директива не имеет смысла. Косметика.

---

# ЧАСТЬ V. Требования к инфраструктуре как коду

## 5.1 Целевое состояние

Единственный источник истины по инфраструктуре — код в `infra/`; консоль используется только для чтения и аварийных действий. Критерий достижения: **`terraform plan` на неизменённом коде даёт нулевой diff.** Пока он не достигнут, `infra/` остаётся документацией, а не управлением, и `apply` запускать нельзя — текущий код выдал бы роли уровня folder там, где в консоли они выданы на бакеты, то есть расширил бы права.

## 5.2 Что подлежит переносу в код

| Объект | Ресурс провайдера | Сейчас в `infra/` |
|---|---|---|
| Три бакета, lifecycle, CORS, anonymous access | `yandex_storage_bucket` | есть, расходится с консолью |
| **Bucket policy delivery-бакета (4 правила)** | `yandex_storage_bucket_policy` | **отсутствует** |
| Права SA на бакеты | `yandex_storage_bucket_iam_binding` | нет (в коде — folder-level `yandex_resourcemanager_folder_iam_member`) |
| KMS-ключи staging и source | `yandex_kms_symmetric_key` | **отсутствуют** |
| Логирование в `cpmind-object-storage-logs` | `logging` блок в `yandex_storage_bucket` | **отсутствует** |
| Бакет логов `cpmind-object-storage-logs` | `yandex_storage_bucket` | **отсутствует** |
| Сервисные аккаунты и статические ключи | `yandex_iam_service_account`, `..._static_access_key` | есть |
| CDN origin group и resource | `yandex_cdn_origin_group`, `yandex_cdn_resource` | есть, расходится |
| Сертификат `cdn.cpmind.tech` | `yandex_cm_certificate` | **отсутствует** |
| DNS-записи | `yandex_dns_recordset` | есть, но зона в Yandex DNS отсутствует |

## 5.3 Ограничения консоли Y.Cloud, которые обязывают перейти на код

Это ключевой аргумент в пользу IaC в вашем случае — не абстрактная «правильность», а конкретные вещи, которые из консоли сделать нельзя:

1. **Ключ условия `yc:originip` не предлагается в выпадающем списке консоли.** Ты это наблюдал сам — доступны только `sourceip`, `PrincipalIsAWSService`, `x-amz-server-side-encryption-aws-kms-key-id` и подобные. Между тем документация Object Storage прямо рекомендует `yc:originip` для более высокого уровня безопасности доступа, поскольку он, в отличие от `aws:sourceip`, не учитывает адреса обратных прокси. Единственный способ его задать — S3 API, CLI или Terraform.

2. **Bucket policy в консоли редактируется поправилам через формы.** Она не диффится, не ревьюится, не версионируется. Для объекта, который в вашей системе является единственным барьером между публичным интернетом и delivery-бакетом, это неприемлемо.

3. **Настройки CDN, заданные в консоли, не имеют истории изменений.** Расхождение между `cdn.tf` и консолью (отсутствующий `Cache-Control`, `Referrer-Policy`, различия в `browser_cache_settings`) обнаружилось только измерением.

## 5.4 Ограничения Terraform-провайдера, которые надо учесть

1. **Версия провайдера.** `backend.tf` пинит `~> 0.140`. Ресурсы `yandex_storage_bucket_policy`, `yandex_storage_bucket_iam_binding`, `yandex_storage_bucket_grant` выделены в отдельные сущности в актуальных версиях (текущая линейка — 0.216+). Без апгрейда пина политику бакета в коде выразить не получится.

2. **`yandex_storage_bucket_iam_binding` авторитативен для роли.** Провайдер явно предупреждает: ресурс управляет полным набором участников для указанной роли и при изменении или удалении может снять роль с субъектов, выданных вне Terraform — через консоль, CLI или `*_iam_member`. Эти субъекты не отслеживаются в state и не видны в `terraform plan`. Практическое следствие: при импорте нужно перечислить **всех** текущих участников каждой роли на каждом бакете, включая администратора, иначе первый же `apply` отзовёт доступ.

3. **Покрытие CDN-опций провайдером требует проверки.** Настройка «скрывать все заголовки источника, кроме перечисленных», применённая у вас в консоли, может не иметь соответствия в `yandex_cdn_resource.options`. Если соответствия нет — это фиксируется как задокументированный разрыв (настройка остаётся консольной, в коде помечается комментарием), либо от неё отказываются в пользу явного whitelist на стороне бакета. Замалчивать разрыв нельзя: он даст ненулевой diff.

4. **S3-backend для state.** Блок в `backend.tf` использует `endpoint`, `force_path_style`, `skip_region_validation` — синтаксис, устаревший в S3-бэкенде Terraform 1.6+ (`endpoints.s3`, `use_path_style`) и требующий дополнительно `skip_requesting_account_id`. Кроме того, бакет `cpmind-terraform-state` не существует.

5. **`yandex_storage_object` для рантайм-бандлов использовать нельзя.** Build-артефактам не место в Terraform state: state начнёт меняться при каждой пересборке, а сам он хранится в S3 и содержит секретные ключи в открытом виде. Рантайм-бандлами владеет publisher, а не Terraform.

## 5.5 Два решения, которые нужно принять до написания кода

**Решение 1 — DNS.** Сейчас все четыре записи созданы вручную в ISPmanager, при этом `infra/dns.tf` описывает `yandex_dns_recordset` в зоне Yandex Cloud DNS, идентификатор которой передаётся через `var.dns_zone_id`. Такой зоны, судя по всему, не существует. Варианты:
- перенести зону `cpmind.tech` в Yandex Cloud DNS — тогда `dns.tf` становится рабочим, а DNS попадает под IaC;
- оставить DNS в ISPmanager — тогда `dns.tf` удаляется, а зависимость документируется как внешняя.

Промежуточного состояния быть не должно: `dns.tf`, ссылающийся на несуществующую зону, будет валить `plan`.

**Решение 2 — секреты.** Статические ключи сервисных аккаунтов сейчас являются outputs Terraform и вручную переносятся в `.env`. Помимо ручной операции, это означает, что state-файл содержит секретные ключи в открытом виде. Для enterprise-контура минимально необходимое: state-бакет с включённым versioning и KMS-шифрованием, с запретом публичного доступа. Целевое: `yandex_lockbox_secret` с генерацией `.env` на этапе деплоя.

## 5.6 Что можно удалить из `infra/` с обоснованием

- `outputs.tf` в текущем виде выводит четыре секрета с `sensitive = true`. При переходе на Lockbox эти outputs теряют смысл и подлежат удалению — сейчас они существуют только для ручного копирования в `.env`.
- `dns.tf` — по результату решения 1.

Всё остальное подлежит не удалению, а приведению в соответствие с фактическим состоянием.

---

# ЧАСТЬ VI. Что требуется до перехода к детализации

**Обязательные проверки:**

1. `docker compose -f docker-compose.prod.yml exec nginx nginx -T` + `ls -la nginx/` + `git log -- nginx/` — сверка развёрнутого конфига (§4.1). Блокирует всю работу по nginx.

2. **Практическая проверка `buildTagBundle`.** В runner-образе backend присутствуют `packages/shared`, `packages/sdk/dist`, `packages/tag/src`, `packages/tag/node_modules`, `/app/node_modules`, но **не** `packages/sdk/node_modules`. При бандлинге `packages/tag/src/index.ts` esbuild пойдёт по цепочке `tag → @cpmind/sdk → @cpmind/shared`, и разрешение `@cpmind/shared` из скомпилированного `packages/sdk/dist/*.js` пойдёт вверх по дереву: `packages/sdk/node_modules` (отсутствует) → `/app/node_modules/@cpmind/shared` (в pnpm-workspace корневой `node_modules` не содержит workspace-пакеты, если они не являются зависимостями корня — а корневой `package.json` имеет только `typescript`).

   Пройдёт это или нет, зависит от того, остались ли в `packages/sdk/dist` runtime-импорты из `@cpmind/shared` или только стёртые type-only импорты. Определить это рассуждением нельзя — нужен эксперимент. **Самый прямой тест: создать новую версию констант тега через панель** (`POST /api/tag-constants`) и проверить, появился ли файл в `/tag_dist`. Это одновременно проверяет весь рантайм-контур сборки тега и даёт ответ, потребуется ли правка `backend/Dockerfile`.

3. `ls -la .github/workflows/` — есть ли CI, определяет объём работ по §3.2.

4. `cat pnpm-workspace.yaml` — состав workspace; нужен для корректного `deps`-стейджа publisher-образа.

**Решения:**

5. DNS: Yandex Cloud DNS или ISPmanager (§5.5, решение 1).
6. Секреты: минимальный вариант (защищённый state-бакет) или целевой (Lockbox) (§5.5, решение 2).
7. Подтверждение варианта A для publisher'а (§3.3).

После этих семи пунктов у меня будет достаточно, чтобы детализировать каждую фазу до уровня конкретных изменений в файлах: `Dockerfile` publisher'а, изменения `docker-compose.prod.yml`, диффы `nginx.conf`, конфигурация helmet, `reconcileTagBundles()`, изменения `html5.ts` и `asset_gc.ts`, JSON bucket policy и структура `infra/`.

---

## Ключевой факт, который определяет всё остальное

`CreatePlacementForm.tsx` не отправляет `allowedDomains` вообще. Поле в БД у всех размещений — `NULL`. То есть мы проектируем с нуля, обратной совместимости обеспечивать не нужно.

И второе, более важное: **в вашей текущей интеграции `Referer` не содержит домен издателя.**

Креатив крутится через AdFox. Тег `<script src="https://delivery.cpmind.tech/e/{token}.js">` исполняется внутри iframe рекламного слота. `Referer` для этого запроса — это URL документа, содержащего тег, то есть документа AdFox, а не страницы издателя. При `srcdoc`/`about:blank` заголовок может отсутствовать вовсе.

Значит любая схема, которая блокирует по несовпадению `Referer` сразу после включения, **отрежет ваш единственный работающий канал доставки.** Это не гипотеза — это следствие того, как устроена ваша фактическая интеграция.

---

## Целевая архитектура

### 1. Политика вместо булева флага

Единственный список доменов без режима — это то, что нельзя безопасно включить в проде. Стандартная практика — три состояния:

| Политика | Поведение | Назначение |
|---|---|---|
| `monitor` | никогда не блокирует, записывает вердикт | обязательный первый этап на любой площадке |
| `enforce` | блокирует несовпадение, пропускает неопределённость | рабочий режим |
| `strict` | блокирует несовпадение и неопределённость | площадки с подтверждённой передачей `Referer` |

Пустой либо `NULL` в `allowed_domains` означает «проверка выключена» независимо от политики. Это снимает вопрос семантики пустого массива, который я задавал: пустой массив = выключено, ровно как `NULL`.

Порядок ввода в эксплуатацию: размещение создаётся с `monitor`, вы неделю смотрите на распределение вердиктов в панели, и только увидев, что `verified_allowed` доминирует, переводите в `enforce`.

### 2. Трёхзначный вердикт вместо булева результата

```
verified_allowed   — Referer есть, домен в списке
verified_blocked   — Referer есть, домена в списке нет
unverified         — Referer отсутствует или невалиден
```

Вердикт пишется в `ad_sessions` независимо от того, заблокирован запрос или нет. Это даёт наблюдаемость: без неё вы не отличите «токен утёк» от «издатель поставил `Referrer-Policy: no-referrer`».

### 3. Семантика сопоставления

Запись `example.com` покрывает `example.com` и любой поддомен `*.example.com`. Точное совпадение отдельным синтаксисом не нужно — на практике оно никому не требуется и порождает ошибки поддержки.

Реализация — суффиксное сравнение по границе метки:

```
host === entry  ||  host.endsWith('.' + entry)
```

Это намеренно **не** требует Public Suffix List. PSL нужен, когда домен выводится из данных (eTLD+1 из произвольного хоста). Здесь запись задаёт человек явно, поэтому `co.uk` в списке — это его осознанное решение, а не результат неверного вывода. Тянуть PSL в зависимости ради этого — лишняя поверхность обновлений.

### 4. Нормализация на записи, не на чтении

Проверка выполняется на каждом показе. Нормализовать список в горячем пути — это работа, которую можно сделать один раз при сохранении размещения.

Нормализация: разбор через `new URL('https://' + input)` (даёт бесплатный punycode для IDN и отсечение порта/пути), приведение к нижнему регистру, снятие завершающей точки, отклонение IP-литералов и `localhost`. Дубликаты схлопываются, лимит на количество записей.

Хранится нормализованное значение — то же, что придёт из `extractPublisherDomain`, который тоже читает `hostname` из `URL`. Обе стороны сравнения проходят через одну нормализацию — это устраняет целый класс расхождений.

### 5. Точка применения — до создания сессии

Сейчас `createAdSession` вызывается внутри `resolveEmbedScript` после резолва контекста. Проверка обязана стоять **между** ними: заблокированный запрос не должен порождать строку в `ad_sessions`, иначе список размещений покажет тысячи «показов», которых не было.

Ответ при блокировке — пустой скрипт с кодом 200. Ровно то же, что сейчас отдаётся при неизвестном токене. Обоснование: страница издателя не должна ломаться, и по коду ответа не должно быть видно, валиден токен или нет.

То же в `resolveVastContext` — иначе видео обойдёт проверку через прямой запрос VAST.

### 6. Второй источник домена — клиентский

Серверная проверка по `Referer` принципиально не видит вложенность в iframe. Runtime на странице способен определить верхний домен точнее:

- `window.location.ancestorOrigins` — есть в Chrome и Safari, нет в Firefox
- `document.referrer`
- `window.top.location.hostname` — только при same-origin

Собранное значение отправляется вместе с delivery-событиями и используется **только для детекции**, не для блокировки: клиентские данные подделываемы, и строить на них enforcement бессмысленно. Но для ответа на вопрос «почему у нас 100% `unverified`» они дают то, чего сервер дать не может.

Это отдельный этап после того, как серверная часть заработает.

---

## Что это даёт против угрозы

Реальная угроза — утечка `delivery_token` (192 бита энтропии, но он виден в HTML страницы издателя). Кто-то ставит ваш креатив на свой сайт, генерирует показы, портит вам данные и статистику кампании.

`enforce` закрывает наивный сценарий полностью. Не закрывает подмену `Referer` при серверном запросе — но такой запрос не породит показ, потому что показ требует исполнения runtime в браузере с реальными сигналами S1–S7, а IVT-контур это ловит отдельно.

Сочетание «домен-аллоулист + IVT-классификация + непредсказуемый токен» — это ровно тот уровень, который даёт enterprise-адсервинг. Отдельно отмечу, что `ads.txt`/`app-ads.txt` из стандартов IAB решает другую задачу — авторизацию продавцов инвентаря — и к вашему случаю не относится.

---

## Объём работ

| Компонент | Что меняется |
|---|---|
| `shared/src/schemas/placement.ts` | `DomainPolicySchema`, валидация `allowedDomains`, нормализатор |
| миграция drizzle | `placements.domain_policy`, `ad_sessions.domain_verdict` |
| `db/schema.ts` | две колонки, enum |
| `services/delivery/embed.ts` | `allowedDomains` и `domainPolicy` в выборку, проверка до `createAdSession` в обеих функциях |
| `services/delivery/sessions.ts` | вердикт в `createAdSession` |
| `services/placements.ts` | нормализация при создании и обновлении |
| `routes/placements.ts` | приём полей |
| `CreatePlacementForm.tsx` | поле ввода доменов |
| `placements/[uuid]/page.tsx` | отображение и редактирование |

Ни один пункт не относится к текущему коммиту.

## Что прислать

1. `packages/shared/src/schemas/placement.ts`
2. `packages/backend/src/services/placements.ts`
3. `packages/backend/src/routes/placements.ts`
4. `packages/backend/src/services/delivery/sessions.ts`
5. `packages/frontend/src/app/(workspace)/placements/[uuid]/page.tsx`
6. `packages/frontend/src/app/(workspace)/placements/PlacementActions.tsx`
7. Фрагмент `packages/frontend/src/lib/admin/api.ts` — сигнатуры `createPlacement` и функции обновления размещения, если она есть

Плюс подтверди: `packages/sdk/src/utils/publisher_domain.ts` понадобится на втором этапе, сейчас не нужен.

---

Предлагаю порядок: сначала выкатить текущий коммит и убедиться, что доставка заработала. Аллоулист доменов на неработающей доставке проверить невозможно — вы не отличите блокировку по домену от любого из шести отказов, которые мы чиним.

---

## Состояние bucket policy

**Что защищено.** Прямой анонимный доступ к `cpmind-delivery-assets` закрыт: без совпадения по IP запрос отклоняется. Подтверждено замером с MacBook — `403` без заголовка и `403` с произвольным `X-Forwarded-For: 1.2.3.4`. Запись в бакет доступна только сервисному аккаунту `cpmind-media-worker` по подписи. `cpmind-backend-signer` прав на этот бакет не имеет вовсе.

**Что не защищено.** Ключ `aws:sourceip` по документации учитывает адреса из `X-Forwarded-For`. Подстановка любого адреса из восьми разрешённых подсетей CDN даёт доступ к origin напрямую — подтверждено замером с `188.72.103.4`.

**Оценка ущерба от этого обхода.** Содержимое delivery-бакета — рантайм-бандлы и обработанные креативы — публично раздаётся через `cdn.cpmind.tech` любому желающему by design. Обход даёт доступ к тому же контенту, минуя CDN. Конфиденциальных данных за этим барьером нет. Реальное последствие — исходящий трафик Object Storage вместо кеша edge, то есть стоимость и нагрузка на origin, а не утечка.

Правку nginx (`proxy_set_header X-Forwarded-For ""`) оставляем: без неё `creative.cpmind.tech` работал бы как открытый прокси, через который клиент подставлял бы заголовок в проксируемый запрос.

**Правильное решение — не IP-аллоулист.** Yandex CDN поддерживает защищённые ссылки с подписью: origin закрывается полностью, доступ только по подписанным CDN-URL с ограниченным сроком. Это устраняет класс проблемы целиком, а не конкретный вектор. Требует изменения формирования всех URL ассетов в `services/creatives.ts`, `services/delivery/embed.ts` и `services/vast/inline.ts`. Отдельная задача.

**Второй структурный риск.** Восемь подсетей CDN захардкожены. Yandex может изменить диапазоны без уведомления — раздача сломается молча, как только edge выйдет за пределы списка. Мониторинга на это нет.

**Вывод: конфигурация рабочая и не раскрывает ничего чувствительного, но SOTA не является.** Целевое состояние — secure token.

## Состояние `nginx.conf`

**Закрыто и подтверждено замерами:** дублирование security-заголовков между helmet и nginx устранено (`preload` в HSTS теперь применяется, конфликт `X-Frame-Options` снят); CORP на `/e/` и `/t/` выставлен в `cross-origin` — embed-скрипт грузится с домена издателя; `Cache-Control: immutable` больше не навешивается на ошибки Object Storage; клиентские `X-Forwarded-For` и `Forwarded` не проходят в бакет; отдельная rate-limit зона для `creative.cpmind.tech` под пофайловую раздачу HTML5-бандлов.

**Что остаётся незакрытым в nginx:**

- `ssl_stapling` закомментирован. Для enterprise-конфигурации OCSP stapling — стандартное требование.
- Отсутствует location для ACME-challenge. Механизм продления сертификата в системе не обнаружен: нет certbot в compose, нет задания в `backup/crontab`. Сертификат истекает **7 декабря 2026**. Продление придётся делать вручную либо реализовать автоматику — это ближайший по срокам операционный риск.
- `proxy_pass` на `storage.yandexcloud.net` с литеральным именем резолвится однократно при загрузке конфигурации. При смене IP endpoint'а nginx будет обращаться к устаревшему адресу до перезагрузки.

Ни один из трёх не блокирует работу сейчас.