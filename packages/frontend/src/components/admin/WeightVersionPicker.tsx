'use client';

import type { WeightConfigRow } from '@cpmind/shared';
import styles from '@/styles/recalibration.module.css';

interface Props {
  configs: WeightConfigRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

export function WeightVersionPicker({ configs, selectedId, onSelect, disabled }: Props) {
  return (
    <div className={styles.versionPicker}>
      <div className={styles.versionPickerTitle}>Версия весов для пересчёта</div>
      <div className={styles.versionList}>
        {configs.map((config) => {
          const isSelected = config.id === selectedId;
          return (
            <div key={config.id} className={`${styles.versionRow} ${isSelected ? styles.versionRowSelected : ''}`}>
              <div className={styles.versionInfo}>
                <span className={styles.versionName}>{config.version}</span>
                {config.isActive && <span className={styles.versionActiveBadge}>активна</span>}
                <span className={styles.versionWeights}>
                  S1 {config.weights.s1.toFixed(2)} · S2 {config.weights.s2.toFixed(2)} · S3 {config.weights.s3.toFixed(2)} · S4 {config.weights.s4.toFixed(2)} · S5 {config.weights.s5.toFixed(2)} · S7 {config.weights.s7.toFixed(2)}
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
    </div>
  );
}