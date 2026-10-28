import { z } from 'zod';
import { AdSessionIdSchema } from './delivery.js';

/**
 * Отчёт интерактивного креатива SIMID 1.2.
 *
 * SIMID не является средством измерения: он даёт креативу канал связи с плеером.
 * Поэтому отчёт описывает только то, о чём плеер сообщает сам, — состояние
 * воспроизведения и параметры своего окружения. Видимости, прокрутки и окружения
 * страницы здесь нет по построению: креатив исполняется в кросс-доменном iframe
 * и о странице издателя не знает ничего. Источником S1-S7 остаётся OMID.
 *
 * Данные принимаются как диагностика рекламной сессии и в показ не сворачиваются:
 * показ по тому же сеансу пишет ветка OMID, и объединение двух источников —
 * отдельная задача со своими правилами приоритета.
 */

// Причина завершения. Сообщается плеером, кроме unload — выгрузки iframe,
// когда плеер завершил рекламу, не дождавшись обмена сообщениями
export const SimidEndReasonSchema = z.enum([
    'ended',
    'adStopped',
    'adSkipped',
    'fatalError',
    'unload',
]);

// SIMID 1.2 §4.3.7: состояние пропуска, которым управляет плеер или креатив
export const SimidSkippableStateSchema = z.enum([
    'playerHandles',
    'adHandles',
    'notSkippable',
]);

export const SimidPlaybackSchema = z.object({
    // Длительность по durationchange: плеер сообщает её не всегда
    duration_sec: z.number().min(0).nullable(),

    // Наибольшая достигнутая позиция плейхеда
    max_playhead_sec: z.number().min(0),

    // Сумма положительных приращений плейхеда: просмотр без перемоток и паузы
    playback_sec: z.number().min(0),

    // Та же сумма по интервалам, на которых звук был включён и громкость выше нуля
    audible_sec: z.number().min(0),

    pause_count: z.number().int().min(0),
    play_count: z.number().int().min(0),

    // Перемотка назад — единственное наблюдаемое свидетельство повторного просмотра
    forward_seek_count: z.number().int().min(0),
    backward_seek_count: z.number().int().min(0),

    stall_count: z.number().int().min(0),
    ended: z.boolean(),

    // Код ошибки HTMLMediaElement, переданный плеером
    media_error_code: z.number().int().min(0).nullable(),

    // Взаимодействия внутри нашего iframe. Событий вне него креатив не видит
    interaction_count: z.number().int().min(0),

    // Приращения, отброшенные как перемотка вперёд: показатель достоверности
    // остальных значений, а не самостоятельный сигнал
    dropped_delta_sec: z.number().min(0),
}).strict();

export const SimidEnvironmentSchema = z.object({
    // Версия SIMID, заявленная плеером
    simid_version: z.string().min(1).max(32).nullable(),

    muted_at_start: z.boolean().nullable(),
    volume_at_start: z.number().min(0).max(1).nullable(),
    fullscreen: z.boolean().nullable(),
    fullscreen_allowed: z.boolean().nullable(),
    skippable_state: SimidSkippableStateSchema.nullable(),

    // Размеры, которые плеер назначает медиаэлементу и нашему iframe.
    // SIMID 1.2 допускает -1 как «неизвестно», такие значения заменяются null
    video_width: z.number().int().min(0).nullable(),
    video_height: z.number().int().min(0).nullable(),
    creative_width: z.number().int().min(0).nullable(),
    creative_height: z.number().int().min(0).nullable(),
}).strict();

export const SimidReportSchema = z.object({
    sid: AdSessionIdSchema,
    simid_runtime_version: z.string().min(1).max(32),
    end_reason: SimidEndReasonSchema,

    timestamp_start: z.number().positive(),
    timestamp_end: z.number().positive(),

    playback: SimidPlaybackSchema,
    environment: SimidEnvironmentSchema,
}).strict().refine(
    (data) => data.timestamp_end >= data.timestamp_start,
    {
        path: ['timestamp_end'],
        message: 'timestamp_end must be greater than or equal to timestamp_start',
    },
);

export type SimidEndReason = z.infer<typeof SimidEndReasonSchema>;
export type SimidSkippableState = z.infer<typeof SimidSkippableStateSchema>;
export type SimidPlayback = z.infer<typeof SimidPlaybackSchema>;
export type SimidEnvironment = z.infer<typeof SimidEnvironmentSchema>;
export type SimidReport = z.infer<typeof SimidReportSchema>;
