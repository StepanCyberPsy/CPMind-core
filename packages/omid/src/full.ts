import { prepareMeasurementSession } from '@cpmind/sdk';
import type { MeasurementSession, SessionPayloadMeta } from '@cpmind/sdk';
import type {
    AdSessionId,
    CreativeType,
    DeliveryMode,
    TagConstantsValues,
    VideoMeasurementEvent,
} from '@cpmind/shared';
import { publishFullBranch } from './global.js';
import type {
    CpmindOmidFullSession,
    CpmindVerificationParams,
    OmidContext,
    OmidMediaEvent,
} from './types.js';

declare const OMID_RUNTIME_VERSION: string;

/**
 * Ветка коллекторов страницы.
 *
 * Загружается вторым бандлом и только при подтверждённом доступе к верхнему
 * окну. Загрузчик размещает этот бандл в документе страницы: его window/document
 * должны совпадать с документом переданного рекламного элемента,
 * поэтому коллекторы @cpmind/sdk работают так же, как в hosted-доставке:
 * собирается полный набор S1–S7 и F_Presence, а показ уходит на штатную
 * точку приёма тем же payload, что у скрипта на странице.
 */

/**
 * Элемент, геометрию которого наблюдают коллекторы. В режиме full OMID передаёт
 * ссылку: videoElement для линейного видео, slotElement — когда элемента video нет.
 *
 * Проверка идёт по nodeType, а не через instanceof HTMLElement: конструкторы
 * привязаны к своему документу, и элемент из другого документа проверку
 * не прошёл бы. Молчаливый отказ при фактически выданном доступе хуже,
 * чем менее строгая проверка типа.
 */
export function resolveCreativeElement(context: OmidContext): HTMLElement | null {
    const ELEMENT_NODE = 1;

    for (const candidate of [context.videoElement, context.slotElement]) {
        if (candidate === undefined || candidate === null) continue;
        if ((candidate as Node).nodeType === ELEMENT_NODE) {
            return candidate as HTMLElement;
        }
    }

    return null;
}

function buildMeta(
    params: CpmindVerificationParams,
    skippable: boolean,
): SessionPayloadMeta {
    return {
        tagUuid: params.tag_uuid,
        tagConstantsVersion: params.tag_constants_version,
        campaignId: params.campaign_id,
        creativeId: params.creative_id,
        creativeType: params.creative_type as CreativeType,
        skippable,
        endpoint: params.collect_endpoint,
        adSessionIdentity: {
            // Идентификатор проверен сервером при выдаче VAST; на клиенте
            // остаётся только привести к фирменному типу
            adSessionId: params.sid as AdSessionId,
            placementUuid: params.placement_uuid,
            creativeVersionUuid: params.creative_version_uuid,
            creativeType: params.creative_type as CreativeType,
            deliveryMode: params.delivery_mode as DeliveryMode,
            measurementMode: 'vast_omid',
        },
    };
}

/**
 * Перевод медиасобытий OMID в словарь накопителя S6.
 *
 * Источник действия OMID не сообщает — везде проставляется "unknown".
 * Подменять его догадкой нельзя: источник участвует в обучении моделей,
 * и выдуманное значение исказило бы выборку.
 *
 * Неизвестные события отбрасываются, а не приводятся к ближайшему похожему.
 */
export function toVideoEvent(event: OmidMediaEvent): VideoMeasurementEvent[] {
    const timestampMs = event.timestamp;
    const volume = event.data?.mediaPlayerVolume ?? event.data?.videoPlayerVolume;

    switch (event.type) {
        case 'loaded': {
            const durationSec = event.data?.duration;
            if (typeof durationSec !== 'number' || durationSec <= 0) return [];
            return [{ type: 'duration_known', durationSec, timestampMs }];
        }
        case 'start': return [{ type: 'play', source: 'unknown', timestampMs }];
        case 'pause': return [{ type: 'pause', source: 'unknown', timestampMs }];
        case 'resume': return [{ type: 'resume', source: 'unknown', timestampMs }];
        case 'firstQuartile': return [{ type: 'quartile', value: 25, timestampMs }];
        case 'midpoint': return [{ type: 'quartile', value: 50, timestampMs }];
        case 'thirdQuartile': return [{ type: 'quartile', value: 75, timestampMs }];
        case 'complete': return [{ type: 'complete', timestampMs }];
        case 'skipped': return [{ type: 'skip', source: 'unknown', timestampMs }];
        case 'volumeChange': {
            if (typeof volume !== 'number') return [];

            // OMID сообщает одну величину громкости; накопителю нужны и признак
            // отключённого звука, и само значение
            return [
                { type: volume <= 0 ? 'mute' : 'unmute', source: 'unknown', timestampMs },
                { type: 'volume', volume, source: 'unknown', timestampMs },
            ];
        }
        default: return [];
    }
}

export function startFullMeasurement(input: {
    params: CpmindVerificationParams;
    context: OmidContext;
    startedAt: number;
}): CpmindOmidFullSession | null {
    let session: MeasurementSession;

    try {
        const creativeEl = resolveCreativeElement(input.context);
        if (creativeEl === null || !creativeEl.isConnected
            || creativeEl.ownerDocument !== document || document.defaultView !== window) {
            return null;
        }
        session = prepareMeasurementSession({
            creativeEl,
            meta: buildMeta(input.params, false),
            config: {
                debug: false,
                constants: input.params.tag_constants as unknown as TagConstantsValues,
                explicitStart: true,
            },
        });
    } catch {
        return null;
    }

    // Момент начала измерения — время события sessionStart, а не время загрузки
    // этой ветки: догрузка второго бандла не должна смещать отсчёт
    session.startMeasurement(input.startedAt);

    let finalized = false;

    return {
        reportMediaEvent(event: OmidMediaEvent): void {
            for (const videoEvent of toVideoEvent(event)) {
                session.reportVideoEvent(videoEvent);
            }
        },
        finalize(): void {
            if (finalized) return;
            finalized = true;
            session.finalize('complete');
        },
    };
}

publishFullBranch({ start: startFullMeasurement }, OMID_RUNTIME_VERSION);
