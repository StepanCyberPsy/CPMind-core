import type {
    OmidPartialImpression,
    SignalsS1,
    SignalsS2,
    SignalsS4,
    SignalsS5,
    SignalsS6,
} from '@cpmind/shared';

/**
 * Приведение частичного набора к каноническим формам сигналов.
 *
 * Нужно, чтобы нормализация выполнялась теми же функциями и теми же
 * конфигурациями, что и для показов со скриптом: иначе значения в кабинете
 * были бы получены по другим правилам и перестали быть сопоставимыми.
 *
 * Не измеренные подполя заполняются null там, где схема это допускает.
 * Там, где не допускает, стоит нейтральное значение с пояснением — выдумывать
 * наблюдения нельзя, но и ломать контракт нормализации тоже.
 */

export function toCanonicalS1(payload: OmidPartialImpression): SignalsS1 {
    const { s1 } = payload.signals;

    return {
        time_in_view_sec: s1.time_in_view_sec,
        max_continuous_view_sec: s1.max_continuous_view_sec,
        visible_pixels_pct: s1.visible_pixels_pct,

        // Критерий MRC выводится по тому же правилу, что в SDK:
        // непрерывный просмотр от двух секунд при видимости от 75%
        mrc_compliant: s1.max_continuous_view_sec >= 2 && s1.visible_pixels_pct >= 75,
    };
}

export function toCanonicalS2(payload: OmidPartialImpression): SignalsS2 {
    return { ...payload.signals.s2 };
}

export function toCanonicalS4(payload: OmidPartialImpression): SignalsS4 {
    const { s4 } = payload.signals;

    return {
        tab_active_time_ms: s4.tab_active_time_ms,
        tab_total_time_ms: s4.tab_total_time_ms,
        tab_switches_count: s4.tab_switches_count,

        // История переключений видимости недоступна: OMID сообщает состояние
        // причинами невидимости, а не последовательностью событий
        visibility_state_history: [],
    };
}

/**
 * S5 без доступа к странице наблюдается единственным признаком — фактом клика.
 * Остальные признаки модели (наведение, близость курсора, жесты) в этих режимах
 * не просто отсутствуют — они не наблюдаемы, поэтому передаются как null.
 * Значение получится заниженным относительно показа со скриптом; это учтено
 * тем, что такие показы исключены из обучающей выборки по уровню доступа.
 */
export function toCanonicalS5(payload: OmidPartialImpression): SignalsS5 {
    return {
        clicked: payload.signals.s5.clicked,
        hover_count: null,
        hover_duration_max_ms: null,
        hover_duration_total_ms: null,
        hover_to_click_latency_ms: null,
        cursor_proximity_min_px: null,
        cursor_trajectory_entropy: null,
        tap_count: null,
        touch_start_end_delta_ms: null,
        zoom: null,
        swipe_count: null,
    };
}

export function toCanonicalS6(payload: OmidPartialImpression): SignalsS6 {
    const { s6 } = payload.signals;

    const audibleQuartile = (reached: boolean): boolean =>
        reached && s6.muted_status !== 'muted';

    return {
        play_initiated: s6.play_initiated,
        quartile_25: s6.quartile_25,
        quartile_50: s6.quartile_50,
        quartile_75: s6.quartile_75,
        completion: s6.completion,

        // Непрерывный процент досмотра OMID не сообщает. null — предусмотренное
        // схемой значение: нормализация откатывается на порядковый квартиль
        completion_rate_pct: null,

        pause_initiated: s6.pause_initiated,
        skipped: s6.skipped,

        // Повторы не наблюдаемы: события перемотки в OMID нет
        replay_count: 0,

        muted_status: s6.muted_status,
        volume_level: s6.volume_level,
        audio_connection: s6.no_output_device ? 'none' : 'unknown',
        audible_time_sec: s6.audible_time_sec,
        duration_sec: s6.duration_sec,

        audible_quartile_25: audibleQuartile(s6.quartile_25),
        audible_quartile_50: audibleQuartile(s6.quartile_50),
        audible_quartile_75: audibleQuartile(s6.quartile_75),
        audible_quartile_100: audibleQuartile(s6.completion),

        muted_throughout: s6.muted_status === 'muted',
        unmuted_by_user: s6.muted_status === 'unmuted',
    };
}
