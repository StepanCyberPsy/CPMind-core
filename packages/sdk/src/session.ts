import type {
    CreativeType,
    AdSessionIdentity,
    MeasurementFinalizationReason,
} from '@cpmind/shared';
import type {
    Session,
    SignalsS3State,
    VisibilityEntry,
} from './types.js';
import { generateUUID } from './utils/uuid.js';
import { detectDeviceType } from './utils/device.js';
import { getPublisherDomain } from './utils/publisher_domain.js';
import { getS6Data } from './signals/s6.js';

export interface CreateSessionInput {
    publisherDomain?: string;
}

export interface SessionPayloadMeta {
    tagUuid: string;
    tagConstantsVersion: string;
    campaignId: string;
    creativeId: string;
    creativeType: CreativeType;
    skippable: boolean;
    endpoint: string;
    adSessionIdentity?: AdSessionIdentity;
}

export function computeActiveTimeMsInRange(
    history: VisibilityEntry[],
    rangeStart: number,
    rangeEnd: number,
): number {
    let activeMs = 0;

    for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        if (entry === undefined) continue;

        const nextEntry = history[i + 1];
        const segmentStart = Math.max(entry.timestamp, rangeStart);
        const segmentEnd = Math.min(
            nextEntry !== undefined ? nextEntry.timestamp : rangeEnd,
            rangeEnd,
        );

        if (entry.state === 'visible' && segmentEnd > segmentStart) {
            activeMs += segmentEnd - segmentStart;
        }
    }

    return activeMs;
}

export function createSession(input: CreateSessionInput): Session {
    return {
        impressionId: generateUUID(),
        sessionGroupId: generateUUID(),
        segmentIndex: 0,
        deviceType: detectDeviceType(),
        timestampStart: 0,
        timestampEnd: 0,

        // S1
        timeInViewSec: 0,
        maxContinuousViewSec: 0,
        visiblePixelsPct: 0,
        mrcCompliant: false,
        viewStart: null,

        // S2
        shareOfScreenSamples: [],
        shareOfScreenMax: 0,

        // S3
        s3: {
            scroll_speed_avg_px_s: null,
            scroll_speed_max_px_s: null,
            scroll_speed_std_dev: null,
            pause_count: null,
            pause_duration_total_ms: null,
            scroll_streaks: null,
            direction_changes: null,
            reading_pattern_detected: null,
            is_momentum_scroll: null,
        } satisfies SignalsS3State,

        // S4
        tabActiveTimeMs: 0,
        tabTotalTimeMs: 0,
        tabSwitchesCount: 0,
        visibilityStateHistory: [],
        tabSessionStart: Date.now(),

        // S5
        clicked: false,
        hoverCount: 0,
        hoverDurationMaxMs: 0,
        hoverDurationTotalMs: 0,
        hoverToClickLatencyMs: null,
        cursorProximityMinPx: Infinity,
        cursorTrajectoryEntropy: 0,
        tapCount: 0,
        touchStartEndDeltaMs: null,
        zoom: false,
        swipeCount: 0,
        lastHoverStart: null,
        unconfirmedFrameEvents: 0,

        // S6
        s6: null,

        // S7
        creativePositionYPx: 0,
        pageHeightTotalPx: 0,
        isAboveTheFold: false,
        competingAdsVisible: 0,
        viewabilityPersistenceSamples: [],

        // F_Presence
        lastUserEventTimestamp: null,
        lastThrottledEventTimestamp: null,
        eventsDuringImpression: 0,
        eventIntervals: [],

        // Служебное
        sent: false,
        fpHash: null,
        publisherDomain: getPublisherDomain(input.publisherDomain),
    };
}

export function resetSessionForNewSegment(session: Session): void {
    session.impressionId = generateUUID();
    session.segmentIndex++;
    session.timestampEnd = 0;
    session.sent = false;
    session.lastThrottledEventTimestamp = null;
    session.eventIntervals = [];
}

// checkpoint — промежуточный снимок сегмента, перезаписывается следующей отправкой того же impression_id
export interface BuildPayloadOptions {
    checkpoint: boolean;
    finalizationReason: MeasurementFinalizationReason | null;
}

const DEFAULT_BUILD_PAYLOAD_OPTIONS: BuildPayloadOptions = {
    checkpoint: false,
    finalizationReason: null,
};

export function buildPayload(
    session: Session,
    meta: SessionPayloadMeta,
    options: BuildPayloadOptions = DEFAULT_BUILD_PAYLOAD_OPTIONS,
): object {
    const now = session.timestampEnd || Date.now();

    // S1: финализация незавершённого visible-сегмента
    let timeInViewSec = session.timeInViewSec;
    let maxContinuousViewSec = session.maxContinuousViewSec;

    if (session.viewStart !== null) {
        const lastSegment = (now - session.viewStart) / 1000;
        timeInViewSec += lastSegment;
        maxContinuousViewSec = Math.max(maxContinuousViewSec, lastSegment);
    }

    const mrcCompliant = session.mrcCompliant ||
        (maxContinuousViewSec >= 2.0 && session.visiblePixelsPct >= 75);

    // S2: среднее share of screen
    const samples = session.shareOfScreenSamples;
    const shareOfScreenAvgPct = samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : 0;

    // S4: пересчёт из visibilityStateHistory — не от загрузки страницы (P-05)
    const impressionStart = session.timestampStart || now;
    const tabTotalTimeMs = now - impressionStart;
    const tabActiveTimeMs = computeActiveTimeMsInRange(
        session.visibilityStateHistory,
        impressionStart,
        now,
    );

    // S7: viewability persistence
    const persistenceSamples = session.viewabilityPersistenceSamples;
    const viewabilityPersistencePct = persistenceSamples.length > 0
        ? (persistenceSamples.filter(Boolean).length / persistenceSamples.length) * 100
        : 0;

    // S5: незавершённый hover без мутации session
    const activeHoverDurationMs =
        session.deviceType === 'desktop' && session.lastHoverStart !== null
            ? Math.max(0, now - session.lastHoverStart)
            : 0;

    const hoverDurationTotalMs = session.hoverDurationTotalMs + activeHoverDurationMs;
    const hoverDurationMaxMs = Math.max(
        session.hoverDurationMaxMs,
        activeHoverDurationMs,
    );

    // F_Presence
    const timeSinceLastEventMs = session.lastUserEventTimestamp !== null
        ? Math.max(0, now - session.lastUserEventTimestamp)
        : Math.max(0, now - (session.timestampStart || now));

    return {
        impression_id: session.impressionId,
        session_group_id: session.sessionGroupId,
        segment_index: session.segmentIndex,
        tag_uuid: meta.tagUuid,
        tag_constants_version: meta.tagConstantsVersion,
        campaign_id: meta.campaignId,
        creative_id: meta.creativeId,
        creative_type: meta.creativeType,
        skippable: meta.skippable,
        device_type: session.deviceType,
        publisher_domain: session.publisherDomain,
        timestamp_start: session.timestampStart || now,
        timestamp_end: now,
        ...(meta.adSessionIdentity !== undefined && {
            ad_session_id: meta.adSessionIdentity.adSessionId,
            placement_uuid: meta.adSessionIdentity.placementUuid,
            delivery_mode: meta.adSessionIdentity.deliveryMode,
            measurement_mode: meta.adSessionIdentity.measurementMode,
        }),
        ...(meta.adSessionIdentity !== undefined && meta.adSessionIdentity.creativeVersionUuid !== null && {
            creative_version_uuid: meta.adSessionIdentity.creativeVersionUuid,
        }),
        ...(options.finalizationReason !== null && {
            finalization_reason: options.finalizationReason,
        }),
        ...(options.checkpoint && { checkpoint: true }),

        signals: {
            s1: {
                time_in_view_sec: Math.round(timeInViewSec * 1000) / 1000,
                mrc_compliant: mrcCompliant,
                visible_pixels_pct: session.visiblePixelsPct,
                max_continuous_view_sec: Math.round(maxContinuousViewSec * 1000) / 1000,
            },
            s2: {
                share_of_screen_avg_pct: Math.round(shareOfScreenAvgPct * 100) / 100,
                share_of_screen_max_pct: session.shareOfScreenMax,
            },
            s3: session.s3,
            s4: {
                tab_active_time_ms: Math.round(tabActiveTimeMs),
                tab_total_time_ms: Math.round(tabTotalTimeMs),
                tab_switches_count: session.tabSwitchesCount,
                visibility_state_history: session.visibilityStateHistory,
            },
            s5: {
                clicked: session.clicked,
                hover_count: session.deviceType === 'desktop'
                    ? session.hoverCount : null,
                hover_duration_max_ms: session.deviceType === 'desktop'
                    ? hoverDurationMaxMs : null,
                hover_duration_total_ms: session.deviceType === 'desktop'
                    ? hoverDurationTotalMs : null,
                hover_to_click_latency_ms: session.deviceType === 'desktop'
                    ? session.hoverToClickLatencyMs : null,
                cursor_proximity_min_px: session.deviceType === 'desktop'
                    ? (session.cursorProximityMinPx === Infinity
                        ? null
                        : session.cursorProximityMinPx)
                    : null,
                cursor_trajectory_entropy: session.deviceType === 'desktop'
                    ? session.cursorTrajectoryEntropy : null,
                tap_count: session.deviceType !== 'desktop'
                    ? session.tapCount : null,
                touch_start_end_delta_ms: session.deviceType !== 'desktop'
                    ? session.touchStartEndDeltaMs : null,
                zoom: session.deviceType !== 'desktop'
                    ? session.zoom : null,
                swipe_count: session.deviceType !== 'desktop'
                    ? session.swipeCount : null,
                ...(session.unconfirmedFrameEvents > 0 && {
                    unconfirmed_frame_events: session.unconfirmedFrameEvents,
                }),
            },
            s6: session.s6 !== null ? getS6Data(session.s6) : null,
            s7: {
                creative_position_y_px: session.creativePositionYPx,
                page_height_total_px: session.pageHeightTotalPx ||
                    document.documentElement.scrollHeight,
                is_above_the_fold: session.isAboveTheFold,
                competing_ads_visible: session.competingAdsVisible,
                viewability_persistence_pct:
                    Math.round(viewabilityPersistencePct * 100) / 100,
            },
        },

        presence: {
            last_user_event_timestamp: session.lastUserEventTimestamp,
            time_since_last_event_ms: Math.round(timeSinceLastEventMs),
            events_count_during_impression: session.eventsDuringImpression,
            event_intervals_ms: session.eventIntervals.length > 0
                ? session.eventIntervals
                : undefined,
        },

        fp_hash: session.fpHash ?? undefined,
    };
}