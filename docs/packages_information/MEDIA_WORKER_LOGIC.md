# MEDIA_WORKER_LOGIC.md — `packages/media-worker`

## Обзор

`@cpmind/media-worker` — автономный Node.js-сервис, реализующий асинхронный pipeline обработки загруженных рекламных креативов. Worker забирает задания из PostgreSQL очереди, скачивает файл из staging bucket, валидирует, транскодирует/обрабатывает по типу creative, загружает результаты в delivery bucket и обновляет статусы в БД. Не имеет HTTP-интерфейса — взаимодействует исключительно через БД и Object Storage.

---

## Структура пакета

```txt
    ├── [DIR] media-worker
        ├── [FILE] Dockerfile
        ├── [FILE] package.json
        ├── [DIR] src
            ├── [FILE] config.ts
            ├── [DIR] db
                ├── [FILE] index.ts
                ├── [FILE] queries.ts
            ├── [DIR] detection
                ├── [FILE] mime.ts
            ├── [DIR] hashing
                ├── [FILE] sha256.ts
            ├── [FILE] index.ts
            ├── [FILE] jobs.ts
            ├── [FILE] logger.ts
            ├── [DIR] processing
                ├── [FILE] gif.ts
                ├── [FILE] html5.ts
                ├── [FILE] static.ts
                ├── [FILE] svg.ts
                ├── [FILE] video.ts
            ├── [DIR] security
                ├── [FILE] archive.ts
                ├── [FILE] limits.ts
            ├── [DIR] storage
                ├── [FILE] assets.ts
                ├── [FILE] client.ts
                ├── [FILE] keys.ts
                ├── [FILE] staging.ts
            ├── [FILE] types.ts
            ├── [DIR] utils
                ├── [FILE] temp.ts
            ├── [DIR] video
                ├── [FILE] ffmpeg.ts
                ├── [FILE] ffprobe.ts
                ├── [FILE] profiles.ts
            ├── [FILE] worker.ts
        ├── [FILE] tsconfig.json
```

---

## Архитектура

### Позиция в системе

```
Backend API                    Media Worker                  Yandex Object Storage
┌─────────────┐               ┌─────────────────────┐       ┌──────────────────────┐
│ POST        │               │                     │       │                      │
│ /creative-  │──creates──▶   │  creative_processing │  ◀──  │  staging bucket      │
│ uploads/    │  job in DB    │  _jobs (PostgreSQL)  │       │  (uploaded file)     │
│ .../complete│               │         │           │       │                      │
└─────────────┘               │         ▼           │  ──▶  │  delivery bucket     │
                              │   SKIP LOCKED       │       │  (processed assets)  │
                              │   claim → process   │       │                      │
                              │   → publish → done  │       └──────────────────────┘
                              │                     │
                              └─────────────────────┘
                                        │
                                        ▼
                                  PostgreSQL
                              (upload_sessions,
                               creative_versions,
                               assets,
                               creative_version_assets)
```

### Модель параллелизма

Worker запускает `WORKER_CONCURRENCY` независимых slot'ов (default: 1) и один recovery loop — все через `Promise.all`. Каждый slot работает в цикле: claim job → process → wait(pollInterval) если нет работы.

```
runWorkerLoop(signal)
├── runWorkerSlot(0, signal)   ─┐
├── runWorkerSlot(1, signal)    ├── параллельно
├── ...                         │
└── runRecoveryLoop(signal)    ─┘
```

---

## Очередь заданий: SKIP LOCKED

Ключевой механизм распределённой обработки — PostgreSQL `FOR UPDATE SKIP LOCKED`. Позволяет нескольким worker-инстансам (или slot'ам) безопасно забирать задания без блокировки и дублирования.

### Claim запрос

```sql
WITH candidate AS (
    SELECT id
    FROM creative_processing_jobs
    WHERE status = 'pending'
      AND available_at <= NOW()
      AND attempts < max_attempts
    ORDER BY available_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE creative_processing_jobs AS job
SET
    status = 'processing',
    locked_at = NOW(),
    locked_by = $1,          -- workerId = hostname:pid:slotId:uuid
    lease_expires_at = NOW() + make_interval(secs => $2 / 1000.0),
    heartbeat_at = NOW(),
    attempts = job.attempts + 1
FROM candidate
WHERE job.id = candidate.id
RETURNING job.*
```

`SKIP LOCKED` — строки заблокированные другим worker'ом пропускаются (не ожидаются). Это даёт lock-free конкурентный доступ к очереди без race condition.

`workerId` формируется уникально для каждого вызова: `hostname:pid:slotId:uuid4()`. Позволяет точно идентифицировать owner'а lease.

### Lease и heartbeat

Каждый job имеет `lease_expires_at` — deadline за которым job считается «брошенным» и может быть переназначен. Worker обязан продлевать lease через регулярные heartbeat:

```
WORKER_HEARTBEAT_MS (default 30s) < WORKER_LEASE_MS (default 900s)
```

Инвариант: `HEARTBEAT_MS < LEASE_MS` проверяется при старте — если нарушен, worker падает с ошибкой.

Heartbeat loop работает параллельно с processing через отдельный `Promise` (`runLeaseHeartbeat`):

```typescript
// Каждые HEARTBEAT_MS:
UPDATE creative_processing_jobs
SET heartbeat_at = NOW(),
    lease_expires_at = NOW() + interval
WHERE id = $1 AND status = 'processing' AND locked_by = $2
  AND lease_expires_at > NOW()
```

Если renewal вернул 0 строк — lease потерян (другой worker мог забрать job). Processing прерывается через `AbortController`.

Если heartbeat падает с сетевой ошибкой — worker отслеживает время последнего успешного renewal. Если прошло более `LEASE_MS - HEARTBEAT_MS` без успешного renewal — lease считается ненадёжным, processing прерывается.

### Recovery loop

`runRecoveryLoop` запускается параллельно со slot'ами и периодически подбирает задания у которых истёк lease (worker упал или завис):

```sql
-- Requeue (attempts < max_attempts):
UPDATE creative_processing_jobs
SET status = 'pending',
    locked_at = NULL, locked_by = NULL,
    lease_expires_at = NULL, heartbeat_at = NULL,
    available_at = NOW(),
    last_error = 'PROCESSING_LEASE_EXPIRED'
WHERE status = 'processing'
  AND lease_expires_at <= NOW()
  AND attempts < max_attempts

-- Finalize failed (attempts >= max_attempts):
UPDATE creative_processing_jobs
SET status = 'failed', completed_at = NOW()
WHERE status = 'processing'
  AND lease_expires_at <= NOW()
  AND attempts >= max_attempts
```

`RECOVERY_INTERVAL_MS = max(30s, min(LEASE_MS/2, HEARTBEAT_MS*2))` — динамически рассчитывается из конфигурации.

---

## Pipeline обработки (`jobs.ts`)

### Полный flow

```
processJob(job, workerId, tempDir, signal)
│
├─ getUploadSession()           ← загружаем метаданные сессии из БД
├─ getProcessingCreativeVersion() ← проверяем что версия в статусе 'processing'
├─ assertCreativeIdConsistency()  ← creativeVersion.creativeId === session.creativeId
│
├─ setUploadSessionProcessing()  ← status: 'uploaded' → 'processing'
│
├─ downloadFromStaging()         ← GET из staging bucket → localPath в tempDir
│
├─ detectMime()                  ← magic bytes детекция (не доверяем declared MIME)
├─ isAllowedMime()               ← проверка whitelist
├─ assertCreativeTypeMatchesMime() ← соответствие creativeType и MIME
│
├─ computeFileSha256()           ← SHA-256 исходного файла (для логов)
│
├─ processor(localPath, tempDir, signal)  ← специализированный процессор
│    └─ возвращает ProcessingResult { sha256: '', files: ProcessedFile[] }
│
├─ assertProcessingResult()      ← валидация: ровно 1 source asset, нет дублей путей
│
├─ prepareProcessedFiles()       ← для каждого файла:
│    ├─ stat() → проверка существования и ненулевого размера
│    ├─ computeFileSha256()      ← content-addressed key
│    ├─ deliveryAssetKey(sha256, ext) ← storage key
│    ├─ findAssetBySha256()      ← проверка дедупликации
│    └─ uploadProcessedFile()    ← PUT в delivery bucket (если нет дубля)
│
├─ publishProcessedFiles()       ← транзакция:
│    ├─ createAsset() ON CONFLICT DO NOTHING  ← upsert по SHA-256
│    ├─ linkAssetToCreativeVersion()          ← связь версия ↔ ассет
│    ├─ setCreativeVersionReady()             ← status → 'ready'
│    ├─ setUploadSessionReady()              ← status → 'ready'
│    └─ setProcessingJobReady()              ← status → 'ready'
│
└─ deleteStagingBestEffort()     ← best-effort DELETE из staging (403 → WARN, не ошибка)
```

### Дедупликация ассетов

Ассеты хранятся content-addressed по SHA-256. Если файл с таким SHA-256 уже существует в `assets` таблице:

1. Проверяется совместимость существующего ассета (статус, размер, MIME)
2. Повторная загрузка в Object Storage пропускается
3. Существующий `storageKey` используется повторно

`createAsset` использует `ON CONFLICT (sha256) DO NOTHING` — конкурентные inserts безопасны.

### Транзакционная атомарность

`publishProcessedFiles` выполняется в единой транзакции: `creative_versions`, `upload_sessions`, `creative_processing_jobs` и `creative_version_assets` обновляются атомарно. Частичное состояние невозможно.

### Состояния upload_session

```
created → uploading → uploaded → processing → ready
                                            ↓
                                          failed
```

Worker переводит: `uploaded/processing → processing → ready/failed`.

---

## Retry и обработка ошибок

### Классификация ошибок

**Постоянные ошибки** (`ProcessingError`) — повторная попытка не поможет:

| Код | Причина |
|---|---|
| `CREATIVE_TYPE_MISMATCH` | Тип creative не соответствует MIME файла |
| `MIME_NOT_ALLOWED` | MIME не в whitelist |
| `HTML5_MISSING_INDEX` | ZIP не содержит `index.html` |
| `PROCESSING_SIZE_EXCEEDED` | Превышен лимит размера |
| `PROCESSING_DIMENSION_EXCEEDED` | Превышены максимальные размеры |
| `PROCESSING_DURATION_EXCEEDED` | Видео длиннее допустимого |
| `SECURITY_ZIP_*` | ZIP security violation |
| `ASSET_INTEGRITY_CONFLICT` | SHA-256 конфликт с существующим ассетом |
| `JOB_CONTEXT_MISMATCH` | Несоответствие creative_id |

При `ProcessingError`: немедленная финализация в `failed` без retry.

**Временные ошибки** (сетевые, S3 недоступен, DB timeout): retry с backoff.

### Exponential backoff с jitter

```typescript
function calculateRetryBackoffMs(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    const base = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
    const jitter = Math.floor(Math.random() * Math.max(1, base * 0.2));
    return Math.min(base + jitter, RETRY_MAX_MS);
}
```

Последовательность задержек (приблизительно): 1s → 2s → 4s → 8s → ... → 60s. Jitter 20% предотвращает thundering herd при одновременном сбое нескольких worker'ов.

`max_attempts` (из БД, обычно 3) — после исчерпания: `finalizeTerminalProcessingFailure`.

### Graceful shutdown

При `SIGTERM`/`SIGINT`:
1. `shutdownController.abort()` — AbortSignal propagates во все slot'ы
2. Текущие job'ы получают signal в `signal.throwIfAborted()` / `signal.addEventListener('abort')`
3. Если job не завершён и `attempts < maxAttempts` — `scheduleProcessingJobRetry` с `backoffMs=0` (немедленный retry другим инстансом)
4. `closeDb()` — корректное закрытие DB pool
5. `stop_grace_period: 60s` в Docker Compose даёт время на завершение

---

## Обнаружение MIME (`detection/mime.ts`)

Система не доверяет `declaredMime` от клиента. Используется двухуровневая детекция:

**SVG — специальный случай:** `fileTypeFromFile` не умеет надёжно детектировать SVG (текстовый формат без уникальных magic bytes). Для SVG используется чтение первых 512 байт и проверка сигнатур:

```typescript
const SVG_SIGNATURES = [
    Buffer.from('<?xml', 'utf8'),
    Buffer.from('<svg', 'utf8'),
    Buffer.from('\xEF\xBB\xBF<?xml', 'utf8'),  // UTF-8 BOM + <?xml
    Buffer.from('\xEF\xBB\xBF<svg', 'utf8'),   // UTF-8 BOM + <svg
];
```

Ведущие пробельные символы (tab, LF, CR, space) пропускаются перед проверкой сигнатуры.

**Все остальные типы:** `fileTypeFromFile` из библиотеки `file-type` — анализирует magic bytes (сигнатуры начала файла). MIME из содержимого, а не из расширения или заявленного типа.

Допустимые MIME (whitelist):
```
image/jpeg, image/png, image/webp, image/gif, image/svg+xml,
application/zip, video/mp4, video/quicktime, video/x-msvideo, video/webm
```

---

## Процессоры

### Static images (`processing/static.ts`)

Обрабатывает `image/jpeg`, `image/png`, `image/webp` через `sharp`. Нормализует формат, оптимизирует, сохраняет метаданные (width, height). Возвращает один файл с `role: 'source'`.

### GIF (`processing/gif.ts`)

Обрабатывает анимированные GIF через `sharp`. Сохраняет анимацию, нормализует размер.

### SVG (`processing/svg.ts`)

Валидирует и санитизирует SVG. Возвращает файл с `role: 'source'`, `assetClass: 'svg_file'`.

### HTML5 (`processing/html5.ts`)

Наиболее сложный процессор:

```
ZIP (входной файл)
│
├─ проверка сжатого размера (< 50 MB)
│
├─ extractZip() → /tempDir/extracted/  (с security валидацией)
│
├─ readFile('index.html')   ← обязателен, иначе HTML5_MISSING_INDEX
│
├─ injectBridgeScript()     ← вставка <script src="cpmind-creative-bridge_v1.min.js">
│    └─ перед </body> если есть, иначе в конец файла
│
├─ writeFile('index.html')  ← перезапись с инжектированным bridge
│
└─ repackZip()              ← архивирование extracted/ → bundle.zip (level 9)
```

Bridge injection — ключевая операция: каждый HTML5-креатив получает CPMind bridge при обработке, не требуя действий от разработчика.

### Video (`processing/video.ts`)

```
localPath (video file)
│
├─ probeVideo()              ← ffprobe: width, height, duration, bitrate, hasAudio
├─ валидация размеров (≤ 1920×1080) и длительности (≤ 300s)
│
├─ selectRenditions(width)   ← выбор профилей транскодирования по ширине источника
│
├─ для каждого профиля:
│    transcodeVideo() → {name}.mp4  ← FFmpeg H.264/AAC транскодирование
│    height пересчитывается с сохранением aspect ratio (выравнивание до чётного)
│
└─ generatePoster()          ← FFmpeg: jpeg-кадр из середины видео
     getPosterMetadata()      ← sharp: width/height постера
```

Результат: N видео-рендиций (разные разрешения) + 1 постер. Каждый файл — отдельная запись в `assets`.

---

## ZIP Security (`security/archive.ts`)

Многоуровневая защита от атак через вредоносные архивы:

| Атака | Защита |
|---|---|
| **ZIP Slip** (path traversal) | `resolve(destDir, entryPath)` проверяется: должен начинаться с `resolvedDest + '/'` |
| **Null byte injection** | `entryPath.includes('\0')` → ошибка |
| **Абсолютные пути** | `normalize(path).startsWith('/')` или Windows-путь → ошибка |
| **Symlink escape** | Проверка Unix-атрибутов: `(unixMode & 0xf000) === 0xa000` → ошибка |
| **ZIP bomb (статическая)** | `compressedSize > 0`: ratio = `decompressedSize / compressedSize > 50` → ошибка |
| **ZIP bomb (runtime)** | Stream: `bytesWritten / compressedSize > 50` → `stream.destroy()` |
| **ZIP bomb (общий размер)** | `totalDecompressedBytes > 100 MB` → `stream.destroy()` |
| **Слишком много файлов** | `directory.files.length > 500` → ошибка до extraction |

Проверка compression ratio выполняется дважды: статически (из заголовков ZIP) и динамически (в процессе чтения потока) — защита от архивов с некорректными заголовками.

---

## Лимиты обработки

| Тип | Лимит |
|---|---|
| Изображение (JPEG/PNG/WebP) | 20 MB |
| GIF | 20 MB |
| SVG | 1 MB |
| HTML5 ZIP (сжатый) | 50 MB |
| HTML5 ZIP (распакованный) | 100 MB |
| ZIP entries | 500 |
| ZIP compression ratio | 50:1 |
| Видео | 2 GB (upload), 1920×1080 (dimensions), 300s (duration) |
| Image dimension | 8192 px |

---

## Хранение результатов

### Ключи в Object Storage

`deliveryAssetKey(sha256, extension)` — content-addressed ключ. Формат: `assets/{sha256}.{ext}`. Иммутабельность гарантирована: один SHA-256 → один файл → один URL на CDN.

Источник (source) загружается в `SOURCE_BUCKET` (для архива), обработанные ассеты — в `DELIVERY_BUCKET` (для CDN раздачи).

### DB: таблица `assets`

`ON CONFLICT (sha256) DO NOTHING` — конкурентные inserts безопасны. Идентичные файлы (один и тот же изображение в разных creative) сохраняются один раз и переиспользуются через `creative_version_assets`.

---

## Конфигурация

Все параметры читаются из переменных окружения с валидацией диапазонов через `readBoundedInt`:

| Переменная | Default | Диапазон | Назначение |
|---|---|---|---|
| `WORKER_CONCURRENCY` | 1 | 1–32 | Параллельных slot'ов |
| `WORKER_LEASE_MS` | 900 000 | 30 000–3 600 000 | Lease на job (мс) |
| `WORKER_HEARTBEAT_MS` | 30 000 | 1 000–1 800 000 | Интервал heartbeat (мс) |
| `WORKER_POLL_INTERVAL_MS` | 5 000 | 100–60 000 | Опрос очереди при простое |
| `WORKER_TEMP_DIR` | `/tmp/cpmind-worker` | — | Рабочая директория |
| `WORKER_DB_POOL_MAX` | 5 | 1–50 | Соединений в DB pool |

Инвариант при старте: `HEARTBEAT_MS < LEASE_MS` — нарушение вызывает `throw` до запуска loop'а.

---

## Docker и окружение

**Трёхстадийная сборка:**
- `deps` — установка зависимостей через pnpm
- `builder` — TypeScript компиляция (`tsc`)
- `runner` — минимальный образ `node:20-alpine` + `ffmpeg` (из apk)

**Ключевые особенности runner stage:**
- `USER cpmind` — non-root пользователь
- `tmpfs: /tmp/cpmind-worker:size=10g` — RAM-диск для временных файлов (видео обработка требует места)
- `stop_grace_period: 60s` — время на graceful drain текущего job'а
- Нет `healthcheck` — worker самодиагностируется через heartbeat механизм в БД

**Зависимости:**
- `sharp` — обработка изображений (libvips)
- `file-type` — magic bytes детекция MIME
- `unzipper` / `archiver` — ZIP extraction и repacking
- `@aws-sdk/client-s3` — S3-совместимый API Yandex Object Storage
- `pg` — прямое подключение к PostgreSQL (не через ORM)
- FFmpeg — системный бинарный, устанавливается через `apk add ffmpeg`

---

## Операционные аспекты

### Мониторинг

Все критические события логируются через `pino` (JSON). Ключевые log events:

| Level | Event | Поля |
|---|---|---|
| INFO | Job claimed | jobId, workerId, uploadSessionId, attempt |
| INFO | Job completed | jobId, workerId |
| INFO | Pipeline completed | jobId, sourceSha256, assetCount |
| WARN | Heartbeat failed | jobId, workerId, err |
| WARN | Lease lost | jobId, workerId |
| WARN | Staging cleanup failed | jobId, err (403 — ожидаемо) |
| WARN | Expired jobs recovered | requeued, failed |
| ERROR | Job permanently failed | jobId, attempts, error |
| ERROR | Worker slot error | slotId, err |

### Известные ограничения

| Проблема | Описание | Решение |
|---|---|---|
| DELETE staging 403 | IAM роль `storage.uploader` не включает DELETE | Добавить `storage.editor` в `iam.tf` |
| Node.js ≥22 | AWS SDK требует Node 22 после 2027 | Обновить базовый образ |
| Последовательная транскодирование | Видео-профили обрабатываются последовательно, не параллельно | Параллелизация через Promise.all если CPU позволяет |