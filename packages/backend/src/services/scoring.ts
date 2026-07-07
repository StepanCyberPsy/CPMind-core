import { computeScore, getS5TopEventLabel, classifyIvtSync } from '@cpmind/shared';
import type { ImpressionPayload, WeightsValues } from '@cpmind/shared';
import type { ImpressionInsert } from '../db/schema.js';
import type { ActiveTagOwner } from './tags.js';
import type { IvtListEntry, IvtThresholds } from '@cpmind/shared';

/**
 * Запускает полный pipeline расчета CPMind Score для одного импрессена.
 * Принимает активную конфигурацию весов из weights_config.ts, владельца,
 * полученного через resolveActiveTagOwner(), и presence-порог активной версии
 * констант тега (resolveActiveTagConstantsVersion в tag_constants.ts) — все три
 * резолвятся до вызова этой функции, сама processImpression не обращается к БД.
 */
export function processImpression(
  payload: ImpressionPayload,
  config: WeightsValues,
  owner: ActiveTagOwner,
  presenceIdleThresholdMs: number,
  ivtList: IvtListEntry[] | null,
  ivtThresholds: IvtThresholds,
  userAgent: string,
): ImpressionInsert {
  const result = computeScore(payload, config, presenceIdleThresholdMs);
  const ivt = classifyIvtSync(payload, ivtList, ivtThresholds, userAgent);

  return {
    impressionId: payload.impression_id,
    sessionGroupId: payload.session_group_id ?? payload.impression_id,
    segmentIndex: payload.segment_index ?? 0,
    tagId: owner.tagId,
    userId: owner.userId,
    tagConstantsVersion: payload.tag_constants_version,
    campaignId: payload.campaign_id,
    creativeId: payload.creative_id,
    creativeType: payload.creative_type,
    deviceType: payload.device_type,
    timestampStart: payload.timestamp_start,
    timestampEnd: payload.timestamp_end,

    signalsRaw: {
      ...payload.signals,
      presence: payload.presence
    } as unknown as Record<string, unknown>,
    signalsNormalized: result.normalized as unknown as Record<string, unknown>,

    s1RawTimeInView: payload.signals.s1.time_in_view_sec,
    s2RawShareOfScreen: payload.signals.s2.share_of_screen_avg_pct,
    s3RawScrollSpeed: payload.signals.s3?.scroll_speed_avg_px_s ?? null,
    s4RawActiveTimePct: payload.signals.s4.tab_total_time_ms > 0
      ? (payload.signals.s4.tab_active_time_ms / payload.signals.s4.tab_total_time_ms) * 100
      : 0,
    s5RawTopEvent: getS5TopEventLabel(payload.signals.s5),
    s6RawCompletionRate: result.s6_raw_completion_rate,
    s7RawPersistence: payload.signals.s7.viewability_persistence_pct,

    s1Normalized: result.normalized.s1,
    s2Normalized: result.normalized.s2,
    s3Normalized: result.normalized.s3,
    s4Normalized: result.normalized.s4,
    s5Normalized: result.normalized.s5,
    s6Normalized: result.normalized.s6,
    s7Normalized: result.normalized.s7,

    fPresence: result.f_presence,
    scoreFinal: result.score_final,
    weightsVersion: result.weights_version,

    noEvents: result.no_events,
    tabMostlyHidden: result.tab_mostly_hidden,
    anomalyDuration: result.anomaly_duration,
    isSuspicious: result.is_suspicious,

    ivtVerdict: ivt.ivt_verdict,
    ivtCategory: ivt.ivt_category,
    ivtConfidence: ivt.ivt_confidence,
    scoreReliable: ivt.score_reliable,
    fpHash: payload.fp_hash ?? null,
    ivtSignals: ivt.ivt_signals.length > 0
      ? ivt.ivt_signals as unknown as Record<string, unknown>[]
      : null,
  };
}