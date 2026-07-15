'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ImpressionDetail, ImpressionRow } from '@cpmind/shared';
import styles from '@/styles/detail.module.css';

interface Props {
  impression: ImpressionDetail;
  siblingSegments?: ImpressionRow[];
}

interface IvtSignalItem {
  rule: string;
  detail: string | null;
  confidence: string | null;
  metadata: string[];
}

function safeToIso(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  const d = new Date(n);
  if (isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function fmt(
  v: number | null | undefined,
  decimals = 2,
  suffix = '',
): string {
  if (v === null || v === undefined) return 'Нет данных';
  return v.toFixed(decimals) + suffix;
}

function fmtBool(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return 'Нет данных';
  return v ? 'true' : 'false';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyTechnicalValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getTechnicalValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => stringifyTechnicalValue(item))
    .filter((item): item is string => item !== null);
}

function fmtTechnicalInline(value: unknown): string {
  const values = getTechnicalValues(value);
  return values.length > 0 ? values.join(', ') : 'n/a';
}

function parseIvtSignal(
  value: unknown,
  index: number,
): IvtSignalItem | null {
  if (!isRecord(value)) {
    const rule = stringifyTechnicalValue(value);

    return rule === null
      ? null
      : {
        rule,
        detail: null,
        confidence: null,
        metadata: [],
      };
  }

  const rule = stringifyTechnicalValue(value['rule']) ?? `Сигнал ${index + 1}`;
  const detail = stringifyTechnicalValue(value['detail']);
  const confidence = stringifyTechnicalValue(value['confidence']);

  const metadata = Object.entries(value)
    .filter(([key]) => !['rule', 'detail', 'confidence'].includes(key))
    .map(([key, item]) => {
      const formatted = fmtTechnicalInline(item);
      return `${key}: ${formatted}`;
    });

  return {
    rule,
    detail,
    confidence,
    metadata,
  };
}

function normalizeIvtSignals(value: unknown): IvtSignalItem[] {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item, index) => parseIvtSignal(item, index))
    .filter((item): item is IvtSignalItem => item !== null);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 5l4 4 4-4" />
    </svg>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionToggle}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.sectionTitle}>{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className={styles.sectionContent}>{children}</div>}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  highlight = false,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={[
      styles.field,
      highlight ? styles.fieldHighlight : '',
      wide ? styles.fieldWide : '',
    ].join(' ')}>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={[
        styles.fieldValue,
        mono ? styles.fieldValueMono : '',
        highlight ? styles.fieldValueHighlight : '',
        (value === '—' || value === 'Нет данных') ? styles.fieldValueNull : '',
      ].join(' ')}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function IvtSignalsList({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const signals = normalizeIvtSignals(value);
  const visibleSignals = expanded ? signals : signals.slice(0, 3);
  const hiddenCount = signals.length - visibleSignals.length;

  if (signals.length === 0) {
    return (
      <span className={styles.ivtSignalsEmpty}>
        Сигналы отсутствуют
      </span>
    );
  }

  return (
    <div className={styles.ivtSignalsList}>
      {visibleSignals.map((signal, index) => (
        <div
          key={`${signal.rule}-${index}`}
          className={styles.ivtSignalItem}
        >
          <div className={styles.ivtSignalHeader}>
            <span className={styles.ivtSignalRule}>
              {signal.rule}
            </span>

            {signal.confidence !== null && (
              <span className={styles.ivtSignalConfidence}>
                confidence: {signal.confidence}
              </span>
            )}
          </div>

          {signal.detail !== null && (
            <div className={styles.ivtSignalDetail}>
              {signal.detail}
            </div>
          )}

          {signal.metadata.map((item) => (
            <div
              key={item}
              className={styles.ivtSignalMetadata}
            >
              {item}
            </div>
          ))}
        </div>
      ))}

      {signals.length > 3 && (
        <button
          type="button"
          className={styles.ivtSignalsToggle}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? 'Скрыть'
            : `Показать ещё ${hiddenCount}`}
        </button>
      )}
    </div>
  );
}

function Flag({ label, value }: { label: string; value: boolean }) {
  return (
    <div className={styles.flag}>
      <span className={styles.flagIcon}>{value ? '⚠' : '✓'}</span>
      <div>
        <div className={styles.flagLabel}>{label}</div>
        <div className={`${styles.flagValue} ${value ? styles.flagTrue : styles.flagFalse}`}>
          {value ? 'true' : 'false'}
        </div>
      </div>
    </div>
  );
}

export function ImpressionDetail({ impression: imp, siblingSegments }: Props) {
  const sortedSegments = siblingSegments
    ? [...siblingSegments].sort((a, b) => a.segment_index - b.segment_index)
    : [];

  const hasIvtSignals = normalizeIvtSignals(imp.ivt_signals).length > 0;

  const raw = imp.signals_raw as Record<string, Record<string, unknown>> | null;
  const s1 = raw?.['s1'] ?? {};
  const s2 = raw?.['s2'] ?? {};
  const s3 = raw?.['s3'] as Record<string, unknown> | null ?? null;
  const s4 = raw?.['s4'] ?? {};
  const s5 = raw?.['s5'] ?? {};
  const s6 = raw?.['s6'] as Record<string, unknown> | null ?? null;
  const s7 = raw?.['s7'] ?? {};
  const pr = raw?.['presence'] as Record<string, unknown> ?? {};

  const scoreColor =
    imp.score_final >= 70 ? styles.scorePositive :
      imp.score_final >= 40 ? styles.scoreModerate :
        styles.scoreNegative;

  const scoreBlockColor =
    imp.score_final >= 70 ? styles.scoreBlockPositive :
      imp.score_final >= 40 ? styles.scoreBlockModerate :
        styles.scoreBlockNegative;

  return (
    <div className={styles.container}>

      <div className={`${styles.scoreBlock} ${scoreBlockColor}`}>
        <div>
          <div className={styles.scoreMetaLabel}>CPMind Score</div>
          <div className={`${styles.scoreValue} ${scoreColor}`}>
            {imp.score_final.toFixed(1)}
          </div>
        </div>
        <div className={styles.scoreMeta}>
          <div className={styles.scoreMetaRow}>
            F_Presence:{' '}
            <span className={imp.f_presence === 1 ? styles.fPresenceValid : styles.fPresenceInvalid}>
              {imp.f_presence === 1 ? '✓ 1 (валиден)' : '✗ 0 (невалиден)'}
            </span>
          </div>
          <div className={styles.scoreMetaRow}>
            Weights:{' '}
            <span className={styles.weightsVersion}>{imp.weights_version}</span>
          </div>
          <div className={styles.scoreMetaRow}>
            Tag constants:{' '}
            <span className={styles.weightsVersion}>
              {imp.tag_constants_version ?? 'Нет данных'}
            </span>
          </div>
        </div>
        <div className={styles.scoreDate}>{fmtDate(imp.created_at)}</div>
      </div>

      <div className={styles.recalibrationBanner}>
        {imp.lastRecalibratedAt !== undefined ? (
          <>
            <span className={styles.recalibrationIcon}>✓</span>
            <span>
              Пересчитан {fmtDate(imp.lastRecalibratedAt)}, версия весов:{' '}
              <span className={styles.recalibrationVersion}>{imp.lastRecalibratedWeightsVersion}</span>
            </span>
          </>
        ) : (
          <span className={styles.recalibrationNeutral}>Не пересчитывался</span>
        )}
      </div>

      {/* Метаданные — скрыта по умолчанию */}
      <CollapsibleSection title="Метаданные импрешена" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field label="Impression ID" value={imp.impression_id} mono />
          <Field label="Campaign ID" value={imp.campaign_id} mono />
          <Field label="Creative ID" value={imp.creative_id} mono />
          <Field label="Creative Type" value={imp.creative_type} />
          <Field label="Площадка размещения" value={imp.publisher_domain ?? 'Не определено'} mono />
          <Field label="Device Type" value={imp.device_type} />
          <Field label="Timestamp Start" value={safeToIso(imp.timestamp_start)} mono />
          <Field label="Timestamp End" value={safeToIso(imp.timestamp_end)} mono />
          <Field label="Session Group ID" value={imp.session_group_id} mono />
          <Field
            label="Segment Index"
            value={String(imp.segment_index)}
            highlight={imp.segment_index > 0}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="IVT-вердикт" defaultOpen={true}>
        <div className={styles.fieldGrid}>
          <Field
            label="ivt_verdict"
            value={imp.ivt_verdict}
            highlight={imp.ivt_verdict !== 'valid'}
          />
          <Field
            label="ivt_category"
            value={imp.ivt_category ?? '—'}
          />
          <Field
            label="ivt_signals"
            value={<IvtSignalsList value={imp.ivt_signals} />}
            wide={hasIvtSignals}
          />
          <Field
            label="ivt_confidence"
            value={imp.ivt_confidence !== undefined ? imp.ivt_confidence.toFixed(3) : '0.000'}
          />
          <Field
            label="score_reliable"
            value={String(imp.score_reliable)}
            highlight={!imp.score_reliable}
          />
        </div>
      </CollapsibleSection>

      {sortedSegments.length > 1 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Сегменты показа ({sortedSegments.length})
          </div>
          <div className={styles.segmentsTimeline}>
            {sortedSegments.map((seg, i) => {
              const isCurrent = seg.id === imp.id;
              const prev = sortedSegments[i - 1];
              const idleGapMs = prev ? seg.timestamp_start - prev.timestamp_end : null;
              return (
                <div key={seg.id} className={styles.segmentTimelineItem}>
                  {idleGapMs !== null && idleGapMs > 0 && (
                    <div className={styles.segmentGap}>
                      простой {(idleGapMs / 1000).toFixed(0)} сек
                    </div>
                  )}
                  <Link
                    href={`/admin/impressions/${seg.id}`}
                    className={`${styles.segmentCard} ${isCurrent ? styles.segmentCardCurrent : ''}`}
                  >
                    <div className={styles.segmentCardIndex}>
                      Сегмент {seg.segment_index + 1}
                    </div>
                    <div className={styles.segmentCardScore}>
                      {seg.score_final.toFixed(1)}
                    </div>
                    <div className={styles.segmentCardDate}>{fmtDate(seg.created_at)}</div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Нормализованные — открыта по умолчанию */}
      <CollapsibleSection title="Нормализованные сигналы (0–100)" defaultOpen={true}>
        <div className={styles.fieldGrid}>
          <Field
            label="S1 Normalized"
            value={fmt(imp.s1_normalized)}
            highlight={!!imp.s1_normalized && imp.s1_normalized > 50}
          />
          <Field label="S2 Normalized" value={fmt(imp.s2_normalized)} />
          <Field
            label="S3 Normalized"
            value={imp.s3_normalized !== null ? fmt(imp.s3_normalized) : 'null (iframe)'}
          />
          <Field label="S4 Normalized" value={fmt(imp.s4_normalized)} />
          <Field label="S5 Normalized" value={fmt(imp.s5_normalized)} />
          <Field
            label="S6 Normalized"
            value={imp.s6_normalized !== null && imp.s6_normalized !== undefined
              ? fmt(imp.s6_normalized)
              : 'null (не видео)'}
          />
          <Field label="S7 Normalized" value={fmt(imp.s7_normalized)} />
        </div>
      </CollapsibleSection>

      {/* Версии моделей — скрыта по умолчанию */}
      <CollapsibleSection title="Версии моделей сигналов" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field
            label="s1_model_version"
            value={imp.s1_model_version ?? 'Нет данных'}
            mono
          />
          <Field
            label="s3_model_version"
            value={imp.s3_model_version ?? 'Нет данных'}
            mono
          />
          <Field
            label="s4_model_version"
            value={imp.s4_model_version ?? 'Нет данных'}
            mono
          />
          <Field
            label="s5_model_version"
            value={imp.s5_model_version ?? 'Нет данных'}
            mono
          />
          <Field
            label="s6_model_version"
            value={imp.s6_model_version ?? 'Нет данных'}
            mono
          />
          <Field
            label="s7_model_version"
            value={imp.s7_model_version ?? 'Нет данных'}
            mono
          />
        </div>
      </CollapsibleSection>

      {/* F_Presence — открыта по умолчанию */}
      <CollapsibleSection title="F_Presence (raw)" defaultOpen={true}>
        <div className={styles.fieldGrid}>
          <Field
            label="last_user_event_timestamp"
            value={safeToIso(pr['last_user_event_timestamp'])}
            mono
          />
          <Field
            label="time_since_last_event_ms"
            value={fmt(pr['time_since_last_event_ms'] as number, 0, ' мс')}
          />
          <Field
            label="events_count_during_impression"
            value={String(pr['events_count_during_impression'] ?? 0)}
            highlight
          />
          <Field
            label="event_intervals_ms"
            value={fmtTechnicalInline(pr['event_intervals_ms'])}
            mono
          />
        </div>
      </CollapsibleSection>

      {/* Флаги — открыта по умолчанию */}
      <CollapsibleSection title="Флаги подозрительности" defaultOpen={true}>
        <div className={styles.flags}>
          <Flag label="no_events" value={imp.no_events} />
          <Flag label="tab_mostly_hidden" value={imp.tab_mostly_hidden} />
          <Flag label="anomaly_duration" value={imp.anomaly_duration} />
          <Flag label="is_suspicious" value={imp.is_suspicious} />
        </div>
      </CollapsibleSection>

      {/* S1 — скрыта по умолчанию */}
      <CollapsibleSection title="S1 — Time-in-View (raw)" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field
            label="time_in_view_sec"
            value={fmt(s1['time_in_view_sec'] as number, 3, ' сек')}
            highlight
          />
          <Field label="mrc_compliant" value={fmtBool(s1['mrc_compliant'] as boolean)} />
          <Field
            label="visible_pixels_pct"
            value={fmt(s1['visible_pixels_pct'] as number, 0, '%')}
          />
          <Field
            label="max_continuous_view_sec"
            value={fmt(s1['max_continuous_view_sec'] as number, 3, ' сек')}
          />
        </div>
      </CollapsibleSection>

      {/* S2 — скрыта по умолчанию */}
      <CollapsibleSection title="S2 — Share of Screen (raw)" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field
            label="share_of_screen_avg_pct"
            value={fmt(s2['share_of_screen_avg_pct'] as number, 2, '%')}
          />
          <Field
            label="share_of_screen_max_pct"
            value={fmt(s2['share_of_screen_max_pct'] as number, 2, '%')}
          />
        </div>
      </CollapsibleSection>

      {/* S3 — скрыта по умолчанию */}
      <CollapsibleSection title="S3 — Scroll Velocity (raw)" defaultOpen={false}>
        {s3 === null ? (
          <Field label="S3" value="null — cross-domain iframe" />
        ) : (
          <>
            <div className={styles.fieldGrid}>
              <Field
                label="scroll_speed_avg_px_s"
                value={fmt(s3['scroll_speed_avg_px_s'] as number, 1, ' px/s')}
              />
              <Field
                label="scroll_speed_max_px_s"
                value={fmt(s3['scroll_speed_max_px_s'] as number, 1, ' px/s')}
              />
              <Field
                label="scroll_speed_std_dev"
                value={fmt(s3['scroll_speed_std_dev'] as number, 2)}
              />
              <Field label="pause_count" value={String(s3['pause_count'] ?? 0)} />
              <Field
                label="pause_duration_total_ms"
                value={fmt(s3['pause_duration_total_ms'] as number, 0, ' мс')}
              />
              <Field label="scroll_streaks" value={String(s3['scroll_streaks'] ?? 0)} />
              <Field label="direction_changes" value={String(s3['direction_changes'] ?? 0)} />
              <Field
                label="reading_pattern"
                value={fmtBool(s3['reading_pattern_detected'] as boolean)}
              />
              <Field
                label="is_momentum_scroll"
                value={fmtBool(s3['is_momentum_scroll'] as boolean)}
              />
            </div>
          </>

        )}

      </CollapsibleSection>

      {/* S4 — скрыта по умолчанию */}
      <CollapsibleSection title="S4 — Tab Activity (raw)" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field
            label="tab_active_time_ms"
            value={fmt(s4['tab_active_time_ms'] as number, 0, ' мс')}
          />
          <Field
            label="tab_total_time_ms"
            value={fmt(s4['tab_total_time_ms'] as number, 0, ' мс')}
          />
          <Field label="tab_switches_count" value={String(s4['tab_switches_count'] ?? 0)} />
          <Field label="active_pct" value={fmt(imp.s4_raw_active_time_pct, 1, '%')} highlight />
        </div>
      </CollapsibleSection>

      {/* S5 — скрыта по умолчанию */}
      <CollapsibleSection title="S5 — Interaction Events (raw)" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field
            label="clicked"
            value={fmtBool(s5['clicked'] as boolean)}
            highlight={s5['clicked'] === true}
          />
          <Field label="hover_count" value={String(s5['hover_count'] ?? 'Нет данных')} />
          <Field
            label="hover_duration_max_ms"
            value={fmt(s5['hover_duration_max_ms'] as number, 0, ' мс')}
          />
          <Field
            label="hover_duration_total_ms"
            value={fmt(s5['hover_duration_total_ms'] as number, 0, ' мс')}
          />
          <Field
            label="hover_to_click_latency_ms"
            value={fmt(s5['hover_to_click_latency_ms'] as number, 0, ' мс')}
          />
          <Field
            label="cursor_proximity_min_px"
            value={fmt(s5['cursor_proximity_min_px'] as number, 0, ' px')}
          />
          <Field
            label="cursor_trajectory_entropy"
            value={fmt(s5['cursor_trajectory_entropy'] as number, 3)}
          />
          <Field label="tap_count" value={String(s5['tap_count'] ?? 'Нет данных')} />
          <Field
            label="touch_start_end_delta_ms"
            value={fmt(s5['touch_start_end_delta_ms'] as number, 0, ' мс')}
          />
          <Field label="zoom" value={fmtBool(s5['zoom'] as boolean)} />
          <Field label="swipe_count" value={String(s5['swipe_count'] ?? 'Нет данных')} />
          <Field label="top_event" value={imp.s5_raw_top_event} highlight />
        </div>
      </CollapsibleSection>

      {/* S6 — скрыта по умолчанию, только для video_creative */}
      <CollapsibleSection title="S6 — Video Engagement + Audibility (raw)" defaultOpen={false}>
        {s6 === null ? (
          <Field label="S6" value="null — не видео-креатив" />
        ) : (
          <>
            <div className={styles.fieldGrid}>
              <Field
                label="play_initiated"
                value={fmtBool(s6['play_initiated'] as boolean)}
                highlight={s6['play_initiated'] === true}
              />
              <Field label="quartile_25" value={fmtBool(s6['quartile_25'] as boolean)} />
              <Field label="quartile_50" value={fmtBool(s6['quartile_50'] as boolean)} />
              <Field label="quartile_75" value={fmtBool(s6['quartile_75'] as boolean)} />
              <Field
                label="completion"
                value={fmtBool(s6['completion'] as boolean)}
                highlight={s6['completion'] === true}
              />
              <Field
                label="completion_rate_pct"
                value={fmt(s6['completion_rate_pct'] as number, 1, '%')}
                highlight
              />
              <Field
                label="duration_sec"
                value={fmt(s6['duration_sec'] as number, 1, ' сек')}
              />
              <Field label="pause_initiated" value={fmtBool(s6['pause_initiated'] as boolean)} />
              <Field label="skipped" value={fmtBool(s6['skipped'] as boolean)} />
              <Field
                label="skippable"
                value={fmtBool(imp.s6_skippable ?? imp.skippable)}
              />
              <Field label="replay_count" value={String(s6['replay_count'] ?? 0)} />
              <Field label="muted_status" value={String(s6['muted_status'] ?? 'Нет данных')} />
              <Field
                label="volume_level"
                value={fmt(s6['volume_level'] as number, 0)}
              />
              <Field
                label="audio_connection"
                value={String(s6['audio_connection'] ?? 'unknown')}
              />
              <Field
                label="audible_time_sec"
                value={fmt(s6['audible_time_sec'] as number, 1, ' сек')}
              />
              <Field
                label="audible_quartile_25"
                value={fmtBool(s6['audible_quartile_25'] as boolean)}
              />
              <Field
                label="audible_quartile_50"
                value={fmtBool(s6['audible_quartile_50'] as boolean)}
              />
              <Field
                label="audible_quartile_75"
                value={fmtBool(s6['audible_quartile_75'] as boolean)}
              />
              <Field
                label="audible_quartile_100"
                value={fmtBool(s6['audible_quartile_100'] as boolean)}
              />
              <Field
                label="muted_throughout"
                value={fmtBool(s6['muted_throughout'] as boolean)}
              />
              <Field
                label="unmuted_by_user"
                value={fmtBool(s6['unmuted_by_user'] as boolean)}
                highlight={s6['unmuted_by_user'] === true}
              />
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* S7 — скрыта по умолчанию */}
      <CollapsibleSection title="S7 — Page Context (raw)" defaultOpen={false}>
        <div className={styles.fieldGrid}>
          <Field
            label="creative_position_y_px"
            value={fmt(s7['creative_position_y_px'] as number, 0, ' px')}
          />
          <Field
            label="page_height_total_px"
            value={fmt(s7['page_height_total_px'] as number, 0, ' px')}
          />
          <Field
            label="is_above_the_fold"
            value={fmtBool(s7['is_above_the_fold'] as boolean)}
          />
          <Field
            label="competing_ads_visible"
            value={String(s7['competing_ads_visible'] ?? 0)}
          />
          <Field
            label="viewability_persistence_pct"
            value={fmt(s7['viewability_persistence_pct'] as number, 1, '%')}
            highlight
          />
        </div>
      </CollapsibleSection>

    </div>
  );
}