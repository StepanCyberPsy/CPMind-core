import { AdSessionIdSchema } from '@cpmind/shared';
import type {
    AdSessionId,
    AdSessionIdentity,
    AdSessionDeliveryEventType,
    AdSessionPlayerErrorCode,
    DeliveryEventPayload,
    MeasurementFinalizationReason,
} from '@cpmind/shared';
import {
    prepareMeasurementSession,
    sendDeliveryEvent,
    type MeasurementSession,
    type SessionPayloadMeta,
    type SdkSignalConfig,
} from '@cpmind/sdk';
import type { DisplayQueueEntry } from './types.js';

export interface DisplaySessionContext {
    adSessionId: AdSessionId;
    meta: SessionPayloadMeta;
    config: SdkSignalConfig;
    measurementSession: MeasurementSession | null;
    deliveryEventEndpoint: string;
    bridgeCleanup: (() => void) | null;
}

// Создаёт контекст без measurement session — вызывать до render confirmation
export function createDisplaySessionContext(
    entry: DisplayQueueEntry,
): DisplaySessionContext {
    const adSessionId = AdSessionIdSchema.parse(entry.adSessionId);

    const adSessionIdentity: AdSessionIdentity = {
        adSessionId,
        placementUuid: entry.placementUuid,
        creativeVersionUuid: entry.creativeVersionUuid,
        creativeType: entry.creativeType,
        deliveryMode: entry.deliveryMode,
        measurementMode: 'full_direct_display',
    };

    const meta: SessionPayloadMeta = {
        tagUuid: entry.tagUuid,
        tagConstantsVersion: entry.tagConstantsVersion,
        campaignId: entry.campaignId,
        creativeId: entry.creativeId,
        creativeType: entry.creativeType,
        skippable: entry.skippable,
        endpoint: entry.collectEndpoint,
        adSessionIdentity,
    };

    const config: SdkSignalConfig = {
        debug: window.location.search.includes('cpmind_debug=1'),
        constants: entry.tagConstants,
    };

    return {
        adSessionId,
        meta,
        config,
        measurementSession: null,
        deliveryEventEndpoint: entry.deliveryEventEndpoint,
        bridgeCleanup: null,
    };
}

// Инициализирует SDK measurement session — вызывать строго после render confirmation
export function prepareDisplayMeasurement(
    ctx: DisplaySessionContext,
    creativeEl: HTMLElement,
): void {
    if (ctx.measurementSession !== null) return;
    ctx.measurementSession = prepareMeasurementSession({
        creativeEl,
        meta: ctx.meta,
        config: ctx.config,
    });
}

// Запускает измерение — session.timestampStart = renderConfirmedAt (инвариант §17)
export function startDisplayMeasurement(
    ctx: DisplaySessionContext,
    renderConfirmedAt: number,
): void {
    ctx.measurementSession?.startMeasurement(renderConfirmedAt);
}

export function finalizeDisplaySession(
    ctx: DisplaySessionContext,
    reason: MeasurementFinalizationReason,
): void {
    ctx.measurementSession?.finalize(reason);
}

export function destroyDisplaySession(
    ctx: DisplaySessionContext,
    reason: MeasurementFinalizationReason = 'destroyed',
): void {
    finalizeDisplaySession(ctx, reason);
    ctx.bridgeCleanup?.();
    ctx.bridgeCleanup = null;
}

// Fire-and-forget: доставка событий не блокирует measurement flow
export function sendDisplayEvent(
    ctx: DisplaySessionContext,
    eventType: AdSessionDeliveryEventType,
    errorCode?: AdSessionPlayerErrorCode,
): void {
    const payload: DeliveryEventPayload = {
        adSessionId: ctx.adSessionId,
        eventType,
        timestampMs: Date.now(),
        ...(errorCode !== undefined && { errorCode }),
    };
    void sendDeliveryEvent(payload, ctx.deliveryEventEndpoint).catch(() => {
        // Delivery events — best-effort, не блокируют measurement
    });
}