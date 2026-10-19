import { AdSessionIdSchema } from '@cpmind/shared';
import type {
    AdSessionId,
    AdSessionIdentity,
    AdSessionDeliveryEventType,
    DeliveryEventDetails,
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
import type {
    DisplayQueueEntry,
    FrameInteractionSink,
} from './types.js';

export interface DisplaySessionContext {
    adSessionId: AdSessionId;
    meta: SessionPayloadMeta;
    config: SdkSignalConfig;
    measurementSession: MeasurementSession | null;
    deliveryEventEndpoint: string;
    bridgeCleanup: (() => void) | null;
    frameConnect: ((sink: FrameInteractionSink) => void) | null;
}

// Создаёт контекст без measurement session — вызывать до render confirmation.
// Режим измерения определяет сервер — runtime его не переопределяет
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
        measurementMode: entry.measurementMode,
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
        frameConnect: null,
    };
}

// Инициализирует SDK measurement session после render confirmation и входа в viewport.
// Взаимодействия HTML5-креатива передаются в сессию после её создания
export function prepareDisplayMeasurement(
    ctx: DisplaySessionContext,
    creativeEl: HTMLElement,
): void {
    if (ctx.measurementSession !== null) return;

    // Мост HTML5 освобождается при любом завершении измерения, включая удаление креатива из DOM
    const session = prepareMeasurementSession({
        creativeEl,
        meta: ctx.meta,
        config: ctx.config,
        onFinalized: (reason) => {
            sendDisplayEvent(ctx, 'closed', { finalizationReason: reason });
            ctx.bridgeCleanup?.();
            ctx.bridgeCleanup = null;
            ctx.frameConnect = null;
        },
    });

    ctx.measurementSession = session;
    ctx.frameConnect?.((kind, trust) => {
        session.reportFrameInteraction(kind, trust);
    });
}

// Время ожидания первого входа в viewport не входит в измерение.
export function startDisplayMeasurement(
    ctx: DisplaySessionContext,
    measurementStartedAt: number,
): void {
    const session = ctx.measurementSession;
    if (session === null || session.state !== 'PREPARED') return;

    session.startMeasurement(measurementStartedAt);
    sendDisplayEvent(ctx, 'measurement_started');
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
    ctx.frameConnect = null;
}

// Fire-and-forget: доставка событий не блокирует measurement flow
export function sendDisplayEvent(
    ctx: DisplaySessionContext,
    eventType: AdSessionDeliveryEventType,
    details: DeliveryEventDetails = {},
): void {
    const payload: DeliveryEventPayload = {
        adSessionId: ctx.adSessionId,
        eventType,
        timestampMs: Date.now(),
        ...details,
    };
    void sendDeliveryEvent(payload, ctx.deliveryEventEndpoint).catch(() => {
        // Delivery events — best-effort, не блокируют measurement
    });
}
