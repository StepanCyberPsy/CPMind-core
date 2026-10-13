'use client';

import type { WeightConfigRow } from '@cpmind/shared';
import type { CreativeCategory } from '@cpmind/shared';
import styles from '@/styles/recalibration.module.css';

interface Props {
  configs: WeightConfigRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

const GROUP_LABELS: Record<CreativeCategory, string> = {
  banner: 'Баннеры',
  video: 'Видео',
  video_instream: 'Видео In-stream',
  video_outstream: 'Видео Out-stream',
};

const GROUPS: CreativeCategory[] = ['banner', 'video'];

function weightsLabel(w: WeightConfigRow['weights']): string {
  return [
    `S1 ${w.s1.toFixed(2)}`,
    `S2 ${w.s2.toFixed(2)}`,
    `S3 ${w.s3.toFixed(2)}`,
    `S4 ${w.s4.toFixed(2)}`,
    `S5 ${w.s5.toFixed(2)}`,
    `S6 ${(w.s6 ?? 0).toFixed(2)}`,
    `S7 ${w.s7.toFixed(2)}`,
  ].join(' · ');
}

export function WeightVersionPicker({
  configs,
  selectedId,
  onSelect,
  disabled,
}: Props) {
  return (
    <div className={styles.versionPicker}>
      <div className={styles.versionPickerTitle}>Версия весов для пересчёта</div>
      <div className={styles.versionList}>
        {GROUPS.map((group) => {
          const groupConfigs = configs.filter((c) => c.configType === group);
          if (groupConfigs.length === 0) return null;

          return (
            <div key={group} className={styles.versionGroup}>
              <div className={styles.versionGroupLabel}>
                {GROUP_LABELS[group]}
              </div>
              {groupConfigs.map((config) => {
                const isSelected = config.id === selectedId;
                return (
                  <div
                    key={config.id}
                    className={`${styles.versionRow} ${isSelected ? styles.versionRowSelected : ''}`}
                  >
                    <div className={styles.versionInfo}>
                      <span className={styles.versionName}>{config.version}</span>
                      {config.isActive && (
                        <span className={styles.versionActiveBadge}>активна</span>
                      )}
                      <span className={styles.versionWeights}>
                        {weightsLabel(config.weights)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={isSelected ? styles.versionSelectedBtn : styles.versionSelectBtn}
                      onClick={() => onSelect(config.id)}
                      disabled={disabled}
                    >
                      {isSelected ? 'Выбрано' : 'Выбрать версию'}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}