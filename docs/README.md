# CPMind MVP — Документация

Навигационный индекс всех технических документов проекта.

---

## Архитектура

### [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Системный обзор: как устроена система, как компоненты взаимодействуют, как данные движутся от показа баннера до панели аналитики. Содержит: схему системы, описание компонентов, полные конфигурационные JSON всех пакетов, многопользовательскую модель, поток данных, pipeline расчёта Score, формулу CPMind Score, механику калибровки и версионирования констант тега, схему БД с таблицами и индексами, Docker Compose, безопасность, ограничения MVP.

**Читать первым** при онбординге нового члена команды или возврате к проекту после перерыва.

---

## Пакеты — детали реализации

Глубокая документация каждого из четырёх пакетов монорепо. Читать после `ARCHITECTURE.md` при работе с конкретным пакетом.

### [`packages_information/BACKEND_LOGIC.md`](./packages_information/BACKEND_LOGIC.md)

Полная документация `packages/backend`: структура пакета, все API-эндпоинты по группам доступа (публичные / `requireAuth` / `requireAdmin`), pipeline обработки показа шаг за шагом, все сервисы с архитектурными решениями (`NUMERIC_RANGE_COLUMNS`, `resolveSelectionWhere` с ownership enforcement, `getDraftTtlMinutes` как единственный источник TTL), многопользовательская модель, механика калибровки весов, версионирование констант тега, фоновые задачи, безопасность, миграции и индексы.

### [`packages_information/SHARED_LOGIC.md`](./packages_information/SHARED_LOGIC.md)

Полная документация `packages/shared`: экспортный контракт (правило разделения Zod-схем и TypeScript-типов, обязательность пересборки), все схемы с актуальными изменениями (`UserStatsRowSchema`, `ImpressionDetailSchema`, `CalibrationFilterSchema`, `CalibrationBatchSchema`, `CalibrationItemSchema`), скоринг-слой (формулы S1–S7, `computeEffectiveWeights`, `recomputeScoreFromNormalized`), таблица всех 19 калибруемых констант тега, контроль доступа (`USER_VISIBLE_IMPRESSION_FIELDS`), F_Presence.

### [`packages_information/TAG_LOGIC.md`](./packages_information/TAG_LOGIC.md)

Полная документация `packages/tag`: два режима сборки (CLI dev / runtime backend), встраивание на страницу клиента, жизненный цикл показа, механика сегментации при простое (P-15), все сигнальные модули S1–S7 с деталями реализации (Welford, IntersectionObserver, rAF, visibility history), транспорт с Mobile Safari fix, debug-режим, браузерная совместимость, ключевые архитектурные решения (IIFE, `define`, сброс in-place, `computeActiveTimeMsInRange`).

### [`packages_information/FRONTEND_LOGIC.md`](./packages_information/FRONTEND_LOGIC.md)

Полная документация `packages/frontend`: ролевой роутинг и middleware, авторизация (cookie forwarding, `decodeTokenUuid`, `decodeTokenRole`), весь lib-слой (`use-popover` — почему `position: fixed` и почему не CSS Anchor Positioning, `parseListSearchParams`, `SIGNALS_META`, `buildSegmentColorMap`), все страницы и компоненты включая добавленные в эту сессию (`RecalibrationWorkspace`, `CreateUserForm`, `WeightVersionPicker` и др.), TypeScript-конфигурация (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), история диагностики зависания фронтенда, таблица технического долга.

---

## Интеграция и развёртывание

### [`TAG_INTEGRATION.md`](./TAG_INTEGRATION.md)

Инструкция по размещению тега на странице клиента: HTML-сниппет, описание всех `data`-атрибутов, что делать после размещения, что не нужно делать. Адресовано клиенту, не команде разработки.

### [`DEPLOYMENT.md`](./DEPLOYMENT.md)

Production-развёртывание: подготовка сервера, переменные окружения, первый запуск, обновление, SSL, бэкапы, мониторинг.

---

## Технический долг

### [`TECH_DEBT.md`](./TECH_DEBT.md)

Все открытые пункты технического долга с датами и источниками: незакрытые пункты клиентского тестирования (P-17, P-03, P-19), согласованные отступления от ТЗ, незакрытые cleanup-пути тега, мелкие улучшения backend/инфраструктуры, незавершённые страницы фронтенда (`/admin/tag_constants`, `/user/panel`), поведенческие ограничения, архитектурные ограничения MVP.

---

## История разработки

Отчёты по итогам клиентских тест-сессий. Содержат полный контекст: что нашли, что исправили, что отложили и почему.

### [`development_history/BUG_FIXING_V1.md`](./development_history/BUG_FIXING_V1.md)

Итерация 1 (21.06.2026). Исправлены: P-16 (зона скролла от центра вьюпорта, не верхней кромки), P-01/P-02 (двойной штраф streaks на медленном чтении и mobile-инерции), P-18 частично (scope `gesturechange` с `window` на `creativeEl`), P-14 (S4 читал мгновенный `visibilityState` вместо истории), P-06 (валидация формата `campaign_id`/`creative_id`, breaking change, согласовано с клиентом). Подтверждено как корректное поведение: P-19. В техдолге по итогам итерации: P-17, P-03, P-15 (ожидает решения клиента), P-18 калибровочная часть.

### [`development_history/BUG_FIXING_V2.md`](./development_history/BUG_FIXING_V2.md)

Итерация 2 (23.06.2026). Реализованы: P-18 полностью (`SWIPE_MIN_DISTANCE_PX` 30→60, `GESTURE_SCALE_DELTA_MIN` 0.15, именованные константы), P-15 (скользящее окно F_Presence + сегментация показа по простою: `segment.ts`, `resetSessionForNewSegment`, `resetSegmentSX` для каждого сигнала, новые поля `session_group_id`/`segment_index`, миграция `0002`), P-05 (`computeActiveTimeMsInRange` из `visibilityStateHistory`, фикс дебаг-оверлея), баг отсутствия `presence` в `signals_raw`. Открытые пункты: короткие пассивные показы (согласованное отступление), P-17/P-03 без изменений.