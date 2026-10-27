# CPMind

Платформа измерения качества рекламных показов. CPMind собирает поведенческие сигналы пользователя во время контакта с рекламным креативом и преобразует их в CPMind Score — единое число от 0 до 100, отражающее реальное качество показа.

## Что делает CPMind

- **Загружает и обрабатывает** рекламные материалы (баннеры, HTML5, видео) через встроенный media pipeline
- **Доставляет** креативы издателям через единый embed-скрипт без ручной верстки
- **Измеряет** показ через семь сигналов: время видимости, долю экрана, паттерн скролла, активность вкладки, взаимодействие, видеововлечённость, контекст страницы
- **Классифицирует** трафик: GIVT по UA-спискам, SIVT по поведенческим аномалиям
- **Калибрует** модели нормализации сигналов на реальных данных через ML-pipeline (Weibull MLE, логистическая регрессия, квантили)
- **Предоставляет** аналитическую панель с ролевым разграничением, экспортом CSV и инструментами калибровки весов

## Монорепо

```
packages/
├── shared          # Zod-схемы, формулы нормализации, IVT, типы — источник истины
├── sdk             # SDK измерения: S1–S7, MeasurementSession, transport
├── backend         # Fastify API, scoring pipeline, delivery, media upload
├── frontend        # Next.js панель аналитики (admin / user)
├── media-worker    # Обработка файлов: sharp, FFmpeg, ZIP, bridge injection
├── embed           # Loader bundle: маршрутизация по creative type → CDN
├── display-runtime # Рендеринг и измерение display-форматов (banner_*)
├── player          # VAST player + измерение video_creative
├── creative-bridge # postMessage bridge для HTML5 creatives в iframe
├── runtime-publisher # Публикация версионированных браузерных бандлов
└── tag             # Legacy JS-тег для прямого встраивания
```

## Требования

- Node.js ≥ 20.0.0
- pnpm ≥ 9.0.0
- Docker + Docker Compose
- PostgreSQL 16
- FFmpeg (для media-worker; устанавливается через `apk add ffmpeg` в Docker)

## Быстрый старт (локальная разработка)

```bash
# 1. Установить зависимости
pnpm install

# 2. Скопировать и заполнить переменные окружения
cp .env.example .env

# 3. Собрать shared
pnpm --filter @cpmind/shared build

# 4. Применить миграции БД
pnpm db:migrate

# 5. Запустить backend и frontend
pnpm dev:backend   # :3001
pnpm dev:frontend  # :3000
```

Для запуска media-worker локально: `pnpm --filter @cpmind/media-worker dev`.

## Production

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Подробности — в [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

## Документация

| Документ | Описание |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Системная архитектура, пакетный граф, все data flows, Mermaid-диаграммы |
| [`docs/PLACEMENT.md`](./docs/PLACEMENT.md) | Руководство по размещению: Tilda, WordPress, Битрикс, React/Next.js, PHP, Python |
| [`docs/packages_information/`](./docs/packages_information/) | Детальная документация по каждому пакету |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Production-развёртывание, SSL, бэкапы, мониторинг |
| [`docs/development_history/TECH_DEBT.md`](./docs/development_history/TECH_DEBT.md) | Открытые пункты технического долга |

## Ключевые технологии

TypeScript · Node.js 22 в Docker · Fastify · Next.js 14 · PostgreSQL 16 · Drizzle ORM · Zod · esbuild · FFmpeg · sharp · Docker · NGINX · Selectel Object Storage · pnpm workspaces