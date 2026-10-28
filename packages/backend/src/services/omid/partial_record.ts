import type { OmidPartialImpression } from '@cpmind/shared';
import {
    toCanonicalS1,
    toCanonicalS2,
    toCanonicalS4,
    toCanonicalS5,
    toCanonicalS6,
} from './partial_signals.js';
import type { ImpressionInsert } from '../../db/schema.js';
import type { ImpressionDeliveryContext } from '../delivery/impression_context_rules.js';
import type { ActiveTagOwner } from '../tag/tags.js';

/**
 * Запись показа, измеренного через OMID без доступа к странице издателя.
 *
 * Нормализованные значения рассчитываются теми же функциями и теми же активными
 * конфигурациями, что и для показов со скриптом: в кабинете пользователю видны
 * только они, и считать их по другим правилам нельзя. Сигналы, которые в этих
 * режимах не измеряются вовсе — S3 и S7, — остаются пустыми и в сыром, и в
 * нормализованном виде, как S3 у показа в кросс-доменном iframe.
 *
 * Композитный Score не рассчитывается: веса предполагают полный набор, а здесь
 * его нет. score_final и f_presence остаются пустыми — ограничения
 * chk_score_final_required и chk_f_presence_required допускают это
 * исключительно для режима vast_omid.
 */

// Нормализованные значения, рассчитанные вызывающей стороной: доступ
// к активным конфигурациям требует обращения к БД, а сборщик записи остаётся
// чистой функцией, как processImpression
export interface PartialNormalizedSignals {
    s1: number;
    s2: number;
    s4: number;
    s5: number;
    s6: number | null;
    modelVersions: {
        s1: string;
        s2: string;
        s4: string;
        s5: string;
        s6: string;
    };
}
export function buildPartialImpressionRecord(
    payload: OmidPartialImpression,
    context: ImpressionDeliveryContext,
    owner: ActiveTagOwner,
    normalized: PartialNormalizedSignals,
): ImpressionInsert {
    const { signals } = payload;

    // Сырые сигналы хранятся в канонической форме: панель администратора
    // читает их теми же путями, что и у показов со скриптом
    const canonicalRaw = {
        s1: toCanonicalS1(payload),
        s2: toCanonicalS2(payload),
        s3: null,
        s4: toCanonicalS4(payload),
        s5: toCanonicalS5(payload),
        s6: toCanonicalS6(payload),
        s7: null,
    };

    return {
        impressionId: payload.sid,
        tagId: owner.tagId,
        userId: owner.userId,
        tagConstantsVersion: payload.tag_constants_version,

        campaignId: context.campaignLabel,
        creativeId: context.creativeLabel,
        creativeType: context.creativeType,
        deviceType: payload.device_type,
        publisherDomain: context.publisherDomain,
        timestampStart: payload.timestamp_start,
        timestampEnd: payload.timestamp_end,

        signalsRaw: canonicalRaw,
        signalsNormalized: {
            s1: normalized.s1,
            s2: normalized.s2,
            s3: null,
            s4: normalized.s4,
            s5: normalized.s5,
            s6: normalized.s6,
            s7: null,
        },

        s1Normalized: normalized.s1,
        s2Normalized: normalized.s2,
        s3Normalized: null,
        s4Normalized: normalized.s4,
        s5Normalized: normalized.s5,
        s6Normalized: normalized.s6,
        s7Normalized: null,

        s1ModelVersion: normalized.modelVersions.s1,
        s2ModelVersion: normalized.modelVersions.s2,
        s4ModelVersion: normalized.modelVersions.s4,
        s5ModelVersion: normalized.modelVersions.s5,
        s6ModelVersion: normalized.modelVersions.s6,

        // Поля панели: заполняются только тем, что измерено
        s1RawTimeInView: signals.s1.time_in_view_sec,
        s2RawShareOfScreen: signals.s2.share_of_screen_avg_pct,
        s4RawActiveTimePct: signals.s4.tab_total_time_ms > 0
            ? (signals.s4.tab_active_time_ms / signals.s4.tab_total_time_ms) * 100
            : null,
        s5RawTopEvent: signals.s5.clicked ? 'clicked' : 'none',
        s6RawCompletionRate: signals.s6.completion ? 100 : null,
        s6AudibleTimeSec: signals.s6.audible_time_sec,
        s6DurationSec: signals.s6.duration_sec,
        s6Skippable: context.skippable,

        fPresence: null,
        scoreFinal: null,
        weightsVersion: `omid:${payload.omid_runtime_version}`,

        adSessionId: context.adSessionId,
        campaignRefId: context.campaignRefId,
        creativeRefId: context.creativeRefId,
        creativeVersionId: context.creativeVersionId,
        placementId: context.placementId,
        deliveryMode: context.deliveryMode,
        format: context.format,
        subtype: context.subtype,
        videoShowIndex: context.videoShowIndex,
        sdkRuntimeVersion: `omid_v${payload.omid_runtime_version}`,
        measurementMode: 'vast_omid',

        // Уровень доступа — единственный признак, по которому такой показ
        // отличается от полного измерения во всех дальнейших выборках
        omidAccessMode: payload.page_collectors_loaded
            ? payload.access_level
            : downgradeWhenCollectorsMissing(payload.access_level),
        vastDeliveryKind: payload.delivery_kind,

        ...(context.contextViolations.length > 0 && {
            contextViolations: context.contextViolations,
        }),
    };
}

/**
 * Полный уровень доступа без загруженной ветки коллекторов — не полное измерение.
 * Записывать его как full_page значило бы выдать неполный набор за полный,
 * и такой показ попал бы в обучающую выборку моделей.
 */
function downgradeWhenCollectorsMissing(level: OmidPartialImpression['access_level']): string {
    return level === 'full_page' ? 'creative' : level;
}
