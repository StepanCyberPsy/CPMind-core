'use client';

import Link from 'next/link';
import type { ImpressionDetail, ImpressionRow } from '@cpmind/shared';
import styles from '@/styles/detail.module.css';

interface Props {
  impression: ImpressionDetail;
  siblingSegments?: ImpressionRow[];
}

function safeToIso(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  const d = new Date(n);
  if (isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function fmt(v: number | null | undefined, decimals = 2, suffix = ''): string {
  if (v === null || v === undefined) return 'n/a';
  return v.toFixed(decimals) + suffix;
}

function fmtBool(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return 'n/a';
  return v ? 'true' : 'false';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.fieldGrid}>{children}</div>
    </div>
  );
}

function Field({ label, value, mono = false, highlight = false }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`${styles.field} ${highlight ? styles.fieldHighlight : ''}`}>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={[
        styles.fieldValue,
        mono ? styles.fieldValueMono : '',
        highlight ? styles.fieldValueHighlight : '',
        (value === '—' || value === 'n/a') ? styles.fieldValueNull : '',
      ].join(' ')}>
        {value ?? '—'}
      </div>
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

  const raw = imp.signals_raw as Record<string, Record<string, unknown>> | null;
  const s1 = raw?.['s1'] ?? {};
  const s2 = raw?.['s2'] ?? {};
  const s3 = raw?.['s3'] as Record<string, unknown> | null ?? null;
  const s4 = raw?.['s4'] ?? {};
  const s5 = raw?.['s5'] ?? {};
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

      {/* Score block */}
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
        </div>
        <div className={styles.scoreDate}>{fmtDate(imp.created_at)}</div>
      </div>

      {/* Метаданные */}
      <Section title="Метаданные импрешена">
        <Field label="Impression ID" value={imp.impression_id} mono />
        <Field label="Campaign ID" value={imp.campaign_id} mono />
        <Field label="Creative ID" value={imp.creative_id} mono />
        <Field label="Creative Type" value={imp.creative_type} />
        <Field label="Device Type" value={imp.device_type} />
        <Field label="Timestamp Start" value={safeToIso(imp.timestamp_start)} mono />
        <Field label="Timestamp End" value={safeToIso(imp.timestamp_end)} mono />
        <Field label="Session Group ID" value={imp.session_group_id} mono />
        <Field label="Segment Index" value={String(imp.segment_index)} highlight={imp.segment_index > 0} />
      </Section>

      {sortedSegments.length > 1 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Сегменты показа ({sortedSegments.length})</div>
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
                    href={`/impressions/${seg.id}`}
                    className={`${styles.segmentCard} ${isCurrent ? styles.segmentCardCurrent : ''}`}
                  >
                    <div className={styles.segmentCardIndex}>Сегмент {seg.segment_index + 1}</div>
                    <div className={styles.segmentCardScore}>{seg.score_final.toFixed(1)}</div>
                    <div className={styles.segmentCardDate}>{fmtDate(seg.created_at)}</div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Нормализованные */}
      <Section title="Нормализованные сигналы (0–100)">
        <Field label="S1 Normalized" value={fmt(imp.s1_normalized)} highlight={!!imp.s1_normalized && imp.s1_normalized > 50} />
        <Field label="S2 Normalized" value={fmt(imp.s2_normalized)} />
        <Field label="S3 Normalized" value={imp.s3_normalized !== null ? fmt(imp.s3_normalized) : 'null (iframe)'} />
        <Field label="S4 Normalized" value={fmt(imp.s4_normalized)} />
        <Field label="S5 Normalized" value={fmt(imp.s5_normalized)} />
        <Field label="S7 Normalized" value={fmt(imp.s7_normalized)} />
        <Field label="F_Presence" value={imp.f_presence === 1 ? '1' : '0'} highlight={imp.f_presence === 1} />
      </Section>

      {/* S1 */}
      <Section title="S1 — Time-in-View (raw)">
        <Field label="time_in_view_sec" value={fmt(s1['time_in_view_sec'] as number, 3, ' сек')} highlight />
        <Field label="mrc_compliant" value={fmtBool(s1['mrc_compliant'] as boolean)} />
        <Field label="visible_pixels_pct" value={fmt(s1['visible_pixels_pct'] as number, 0, '%')} />
        <Field label="max_continuous_view_sec" value={fmt(s1['max_continuous_view_sec'] as number, 3, ' сек')} />
      </Section>

      {/* S2 */}
      <Section title="S2 — Share of Screen (raw)">
        <Field label="share_of_screen_avg_pct" value={fmt(s2['share_of_screen_avg_pct'] as number, 2, '%')} />
        <Field label="share_of_screen_max_pct" value={fmt(s2['share_of_screen_max_pct'] as number, 2, '%')} />
      </Section>

      {/* S3 */}
      <Section title="S3 — Scroll Velocity (raw)">
        {s3 === null ? (
          <Field label="S3" value="null — cross-domain iframe" />
        ) : (
          <>
            <Field label="scroll_speed_avg_px_s" value={fmt(s3['scroll_speed_avg_px_s'] as number, 1, ' px/s')} />
            <Field label="scroll_speed_max_px_s" value={fmt(s3['scroll_speed_max_px_s'] as number, 1, ' px/s')} />
            <Field label="scroll_speed_std_dev" value={fmt(s3['scroll_speed_std_dev'] as number, 2)} />
            <Field label="pause_count" value={String(s3['pause_count'] ?? 0)} />
            <Field label="pause_duration_total_ms" value={fmt(s3['pause_duration_total_ms'] as number, 0, ' мс')} />
            <Field label="scroll_streaks" value={String(s3['scroll_streaks'] ?? 0)} />
            <Field label="direction_changes" value={String(s3['direction_changes'] ?? 0)} />
            <Field label="reading_pattern" value={fmtBool(s3['reading_pattern_detected'] as boolean)} />
            <Field label="is_momentum_scroll" value={fmtBool(s3['is_momentum_scroll'] as boolean)} />
          </>
        )}
      </Section>

      {/* S4 */}
      <Section title="S4 — Tab Activity (raw)">
        <Field label="tab_active_time_ms" value={fmt(s4['tab_active_time_ms'] as number, 0, ' мс')} />
        <Field label="tab_total_time_ms" value={fmt(s4['tab_total_time_ms'] as number, 0, ' мс')} />
        <Field label="tab_switches_count" value={String(s4['tab_switches_count'] ?? 0)} />
        <Field label="active_pct" value={fmt(imp.s4_raw_active_time_pct, 1, '%')} highlight />
      </Section>

      {/* S5 */}
      <Section title="S5 — Interaction Events (raw)">
        <Field label="clicked" value={fmtBool(s5['clicked'] as boolean)} highlight={s5['clicked'] === true} />
        <Field label="hover_count" value={String(s5['hover_count'] ?? 'n/a')} />
        <Field label="hover_duration_max_ms" value={fmt(s5['hover_duration_max_ms'] as number, 0, ' мс')} />
        <Field label="hover_duration_total_ms" value={fmt(s5['hover_duration_total_ms'] as number, 0, ' мс')} />
        <Field label="hover_to_click_latency_ms" value={fmt(s5['hover_to_click_latency_ms'] as number, 0, ' мс')} />
        <Field label="cursor_proximity_min_px" value={fmt(s5['cursor_proximity_min_px'] as number, 0, ' px')} />
        <Field label="cursor_trajectory_entropy" value={fmt(s5['cursor_trajectory_entropy'] as number, 3)} />
        <Field label="tap_count" value={String(s5['tap_count'] ?? 'n/a')} />
        <Field label="touch_start_end_delta_ms" value={fmt(s5['touch_start_end_delta_ms'] as number, 0, ' мс')} />
        <Field label="zoom" value={fmtBool(s5['zoom'] as boolean)} />
        <Field label="swipe_count" value={String(s5['swipe_count'] ?? 'n/a')} />
        <Field label="top_event" value={imp.s5_raw_top_event} highlight />
      </Section>

      {/* S7 */}
      <Section title="S7 — Page Context (raw)">
        <Field label="creative_position_y_px" value={fmt(s7['creative_position_y_px'] as number, 0, ' px')} />
        <Field label="page_height_total_px" value={fmt(s7['page_height_total_px'] as number, 0, ' px')} />
        <Field label="is_above_the_fold" value={fmtBool(s7['is_above_the_fold'] as boolean)} />
        <Field label="competing_ads_visible" value={String(s7['competing_ads_visible'] ?? 0)} />
        <Field label="viewability_persistence_pct" value={fmt(s7['viewability_persistence_pct'] as number, 1, '%')} highlight />
      </Section>

      {/* F_Presence */}
      <Section title="F_Presence (raw)">
        <Field label="last_user_event_timestamp" value={safeToIso(pr['last_user_event_timestamp'])} mono />
        <Field label="time_since_last_event_ms" value={fmt(pr['time_since_last_event_ms'] as number, 0, ' мс')} />
        <Field label="events_count_during_impression" value={String(pr['events_count_during_impression'] ?? 0)} highlight />
      </Section>

      {/* Флаги */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Флаги подозрительности §5</div>
        <div className={styles.flags}>
          <Flag label="no_events" value={imp.no_events} />
          <Flag label="tab_mostly_hidden" value={imp.tab_mostly_hidden} />
          <Flag label="anomaly_duration" value={imp.anomaly_duration} />
          <Flag label="is_suspicious" value={imp.is_suspicious} />
        </div>
      </div>

    </div>
  );
}