'use client';

import { useState, useCallback, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_TAG_CONSTANTS } from '@cpmind/shared';
import type {
  TagConstantsConfig,
  TagConstantsValues,
  CreateTagConstantsPayload,
} from '@cpmind/shared';
import {
  createTagConstantsConfig,
  activateTagConstantsConfig,
  deactivateTagConstantsConfig,
  setDefaultTagConstantsConfig,
} from '@/lib/admin/api';
import cStyles from '@/styles/components.module.css';
import styles from '@/styles/tag-constants.module.css';

interface Props {
  initialConfigs: TagConstantsConfig[];
}

interface ConstantMeta {
  key: keyof TagConstantsValues;
  label: string;
  type: 'integer' | 'float' | 'thresholds';
  min?: number;
  minStrict?: boolean;
  max?: number;
  unit?: string;
  step?: number;
}

const CONSTANTS_META: ConstantMeta[] = [
  { key: 'PRESENCE_IDLE_TIMEOUT_MS', label: 'Таймаут простоя', type: 'integer', min: 1, unit: 'мс' },
  { key: 'S1_VIEWPORT_THRESHOLDS', label: 'Пороги видимости S1', type: 'thresholds' },
  { key: 'S2_SAMPLE_INTERVAL_MS', label: 'Интервал сэмплинга S2', type: 'integer', min: 1, unit: 'мс' },
  { key: 'SCROLL_ZONE_PX', label: 'Зона скролла S3', type: 'integer', min: 1, unit: 'px' },
  { key: 'PAUSE_THRESHOLD_MS', label: 'Порог паузы S3', type: 'integer', min: 1, unit: 'мс' },
  { key: 'STREAK_WINDOW_MS', label: 'Окно серии S3', type: 'integer', min: 1, unit: 'мс' },
  { key: 'STREAK_MIN_EVENTS', label: 'Мин. событий серии S3', type: 'integer', min: 1 },
  { key: 'STREAK_MIN_SPEED', label: 'Мин. скорость серии S3', type: 'float', min: 0, minStrict: true, step: 1 },
  { key: 'READING_SPEED_MAX', label: 'Макс. скорость чтения S3', type: 'float', min: 0, minStrict: true, step: 1 },
  { key: 'READING_TIME_MIN', label: 'Мин. время чтения S3', type: 'integer', min: 1, unit: 'мс' },
  { key: 'SWIPE_MIN_DISTANCE_PX', label: 'Мин. дистанция свайпа S5', type: 'integer', min: 1, unit: 'px' },
  { key: 'ENTROPY_ANGLE_THRESHOLD', label: 'Порог энтропии S5', type: 'float', min: 0, minStrict: true, max: 180, step: 0.5 },
  { key: 'PROXIMITY_TRACK_ZONE_PX', label: 'Зона близости S5', type: 'integer', min: 1, unit: 'px' },
  { key: 'PINCH_DELTA_MIN_PX', label: 'Мин. дельта pinch S5', type: 'integer', min: 1, unit: 'px' },
  { key: 'GESTURE_SCALE_DELTA_MIN', label: 'Мин. дельта масштаба S5', type: 'float', min: 0, minStrict: true, max: 1, step: 0.01 },
  { key: 'TAP_MAX_OFFSET_PX', label: 'Макс. смещение тапа S5', type: 'integer', min: 1, unit: 'px' },
  { key: 'TAP_MAX_DURATION_MS', label: 'Макс. длит. тапа S5', type: 'integer', min: 1, unit: 'мс' },
  { key: 'MOUSE_MOVE_DEDUP_PX', label: 'Дедупликация мыши S5', type: 'float', min: 0, step: 0.1 },
  { key: 'S7_SAMPLE_INTERVAL_MS', label: 'Интервал сэмплинга S7', type: 'integer', min: 1, unit: 'мс' },
];

interface FieldState {
  value: string;
  touched: boolean;
  error: string | null;
}

type FormState = Record<keyof TagConstantsValues, FieldState>;

function validateField(
  meta: ConstantMeta,
  value: string,
): string | null {
  if (meta.type === 'thresholds') {
    const trimmed = value.trim();
    if (!trimmed) return 'Обязательное поле';
    const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 1 || parts.length > 10) return 'От 1 до 10 значений';
    const nums = parts.map(Number);
    if (nums.some(n => isNaN(n))) return 'Только числа через запятую';
    if (nums.some(n => n < 0 || n > 1)) return 'Все значения от 0 до 1';
    for (let i = 1; i < nums.length; i++) {
      const curr = nums[i];
      const prev = nums[i - 1];
      if (curr === undefined || prev === undefined) continue;
      if (curr <= prev) return 'Значения должны строго возрастать';
    }
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return 'Обязательное поле';

  const n = parseFloat(trimmed);
  if (isNaN(n)) return 'Введите число';
  if (meta.type === 'integer' && !Number.isInteger(n)) return 'Только целое число';

  if (meta.minStrict === true && meta.min !== undefined) {
    if (n <= meta.min) {
      return meta.min === 0 ? 'Должно быть больше 0' : `Должно быть больше ${meta.min}`;
    }
  } else if (meta.min !== undefined && n < meta.min) {
    return meta.min === 0 ? 'Не может быть отрицательным' : `Минимум ${meta.min}`;
  }

  if (meta.max !== undefined && n > meta.max) {
    return `Максимум ${meta.max}`;
  }

  return null;
}

function initFormState(): FormState {
  return CONSTANTS_META.reduce<FormState>((acc, meta) => {
    const raw = DEFAULT_TAG_CONSTANTS[meta.key];
    const value = meta.type === 'thresholds'
      ? (raw as number[]).join(', ')
      : String(raw);
    acc[meta.key] = { value, touched: false, error: null };
    return acc;
  }, {} as FormState);
}

function displayConstantValue(
  meta: ConstantMeta,
  cfg: TagConstantsConfig,
): string {
  const value = cfg.constants[meta.key];
  if (meta.type === 'thresholds') {
    return (value as number[]).join(', ');
  }
  return String(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '—';
  return `${(bytes / 1024).toFixed(1)} КБ`;
}

// Причина запрета деактивации приходит с сервера: версия по умолчанию
// обязана оставаться активной, закреплённая за плейсментами — тоже
function deactivationHint(cfg: TagConstantsConfig): string | null {
  if (cfg.deactivationBlockedReason === 'DEFAULT_VERSION') {
    return 'Версия по умолчанию — сначала назначьте другую';
  }
  if (cfg.deactivationBlockedReason === 'PINNED_BY_PLACEMENTS') {
    return `Закреплена за плейсментами (${cfg.pinnedPlacementsCount}) — сначала снимите закрепление`;
  }
  return null;
}

export function TagConstantsPanel({ initialConfigs }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [defaultingId, setDefaultingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formFields, setFormFields] = useState<FormState>(initFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const metaByKey = useMemo(
    () => new Map(CONSTANTS_META.map(m => [m.key, m] as const)),
    [],
  );

  const hasErrors = useMemo(
    () => CONSTANTS_META.some(meta => validateField(meta, formFields[meta.key].value) !== null),
    [formFields],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleFieldChange = useCallback((
    key: keyof TagConstantsValues,
    value: string,
  ) => {
    const meta = metaByKey.get(key);
    if (!meta) return;
    setFormFields(prev => ({
      ...prev,
      [key]: { value, touched: true, error: validateField(meta, value) },
    }));
  }, [metaByKey]);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setFormFields(initFormState());
    setSubmitError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const next = { ...formFields };
    let anyError = false;

    for (const meta of CONSTANTS_META) {
      const field = next[meta.key];
      const error = validateField(meta, field.value);
      next[meta.key] = { ...field, touched: true, error };
      if (error !== null) anyError = true;
    }

    setFormFields(next);
    if (anyError) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const constants: Partial<Record<keyof TagConstantsValues, unknown>> = {};

      for (const meta of CONSTANTS_META) {
        const raw = formFields[meta.key].value;
        if (meta.type === 'thresholds') {
          constants[meta.key] = raw.split(',').map(s => parseFloat(s.trim()));
        } else if (meta.type === 'integer') {
          constants[meta.key] = parseInt(raw, 10);
        } else {
          constants[meta.key] = parseFloat(raw);
        }
      }

      const payload: CreateTagConstantsPayload = {
        constants: constants as TagConstantsValues,
      };

      await createTagConstantsConfig(payload);
      setShowForm(false);
      setFormFields(initFormState());
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Ошибка создания конфигурации');
    } finally {
      setSubmitting(false);
    }
  }, [formFields, router]);

  const handleActivate = useCallback(async (id: string) => {
    setActivatingId(id);
    try {
      await activateTagConstantsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка активации');
    } finally {
      setActivatingId(null);
    }
  }, [router]);

  const handleSetDefault = useCallback(async (id: string) => {
    if (!confirm(
      'Сделать версией по умолчанию? Плейсменты без закреплённой версии начнут получать её при следующей выдаче.',
    )) return;
    setDefaultingId(id);
    try {
      await setDefaultTagConstantsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка назначения версии по умолчанию');
    } finally {
      setDefaultingId(null);
    }
  }, [router]);

  const handleDeactivate = useCallback(async (id: string) => {
    if (!confirm(
      'Деактивировать версию? Физический файл тега будет удалён, прием новых показов с этой версией заблокируется.',
    )) return;
    setDeactivatingId(id);
    try {
      await deactivateTagConstantsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка деактивации');
    } finally {
      setDeactivatingId(null);
    }
  }, [router]);

  const handleCopy = useCallback(async (
    configId: string,
    text: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(configId);
      setTimeout(() => setCopiedId(prev => prev === configId ? null : prev), 1500);
    } catch (_err) { }
  }, []);

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Версии конфигурации тегов</span>
        {!showForm && (
          <button className={cStyles.primaryBtn} onClick={() => setShowForm(true)}>
            + Новый тег
          </button>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.scrollContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Версия</th>
                <th className={styles.th}>Плейсменты</th>
                <th className={styles.th}>Скрипт</th>
                <th className={styles.th}>Размер</th>
                <th className={styles.th}>Создана</th>
                <th className={`${styles.th} ${styles.thActions}`}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {initialConfigs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Конфигурации не найдены
                  </td>
                </tr>
              ) : (
                initialConfigs.map(cfg => (
                  <Fragment key={cfg.id}>
                    <tr className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}>
                      <td className={styles.td}>
                        <div className={styles.cellVersion}>
                          <button
                            className={styles.expandBtn}
                            onClick={() => handleToggleExpand(cfg.id)}
                            aria-label={expandedId === cfg.id ? 'Свернуть константы' : 'Развернуть константы'}
                          >
                            {expandedId === cfg.id ? '▼' : '▶'}
                          </button>
                          <span className={styles.cellMono}>{cfg.version}</span>
                          {cfg.isActive && (
                            <span className={styles.activeBadge}>
                              <span className={styles.activeDot} />
                              активна
                            </span>
                          )}
                          {cfg.isDefault && (
                            <span className={styles.defaultBadge}>
                              по умолчанию
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={styles.td}>
                        {cfg.pinnedPlacementsCount > 0 ? (
                          <span className={styles.pinnedCount}>
                            {cfg.pinnedPlacementsCount}
                          </span>
                        ) : (
                          <span className={styles.cellNull}>—</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        {cfg.scriptPath ? (
                          <div className={styles.scriptCell}>
                            <span className={`${styles.cellMono} ${styles.scriptPath}`}>
                              {cfg.scriptPath}
                            </span>
                            <button
                              type="button"
                              className={styles.copyBtn}
                              onClick={() => handleCopy(cfg.id, cfg.scriptPath)}
                              aria-label="Скопировать путь к скрипту"
                              title="Скопировать путь к скрипту"
                            >
                              {copiedId === cfg.id ? (
                                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.copyIcon}>
                                  <path d="M4.5 10.5L8 14L15.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.copyIcon}>
                                  <rect x="7" y="3" width="9" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                  <path d="M5 13H4C2.9 13 2 12.1 2 11V5C2 3.9 2.9 3 4 3H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className={styles.cellNull}>—</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <span className={styles.cellMono}>{formatFileSize(cfg.fileSizeBytes)}</span>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.cellMono}>{formatDate(cfg.createdAt)}</span>
                      </td>
                      <td className={`${styles.td} ${styles.tdActions}`}>
                        <div className={styles.actions}>
                          <button
                            className={cStyles.ghostBtn}
                            disabled={cfg.isActive || activatingId === cfg.id || deactivatingId === cfg.id}
                            onClick={() => handleActivate(cfg.id)}
                          >
                            {activatingId === cfg.id
                              ? <span className={cStyles.spinner} />
                              : 'Активировать'}
                          </button>
                          <button
                            className={cStyles.ghostBtn}
                            disabled={!cfg.isActive || cfg.isDefault || defaultingId === cfg.id}
                            onClick={() => handleSetDefault(cfg.id)}
                            title={cfg.isActive
                              ? undefined
                              : 'Версией по умолчанию может быть только активная версия'}
                          >
                            {defaultingId === cfg.id
                              ? <span className={cStyles.spinner} />
                              : 'Сделать по умолчанию'}
                          </button>
                          <button
                            className={cStyles.dangerBtn}
                            disabled={
                              !cfg.isActive ||
                              cfg.deactivationBlockedReason !== null ||
                              activatingId === cfg.id ||
                              deactivatingId === cfg.id
                            }
                            onClick={() => handleDeactivate(cfg.id)}
                            title={deactivationHint(cfg) ?? undefined}
                          >
                            {deactivatingId === cfg.id
                              ? <span className={cStyles.spinner} />
                              : 'Деактивировать'}
                          </button>
                        </div>
                        {deactivationHint(cfg) !== null && (
                          <div className={styles.blockedHint}>
                            {deactivationHint(cfg)}
                          </div>
                        )}
                      </td>
                    </tr>

                    {expandedId === cfg.id && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={6} className={styles.expandedCell}>
                          <div className={styles.constantsGrid}>
                            {CONSTANTS_META.map(meta => (
                              <div key={meta.key} className={styles.constantCard}>
                                <span className={styles.constantLabel}>
                                  {meta.label}
                                  {meta.unit && ` (${meta.unit})`}
                                </span>
                                <span className={styles.constantValue}>
                                  {displayConstantValue(meta, cfg)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className={styles.formWrapper}>
          <div className={styles.formTitle}>Новая конфигурация констант</div>

          <div className={styles.formSectionLabel}>Константы тега</div>
          <div className={styles.fieldsGrid}>
            {CONSTANTS_META.map(meta => {
              const field = formFields[meta.key];
              const showError = field.touched && field.error !== null;
              return (
                <div key={meta.key} className={styles.fieldItem}>
                  <label className={styles.fieldLabel}>
                    {meta.label}
                    {meta.unit && (
                      <span className={styles.fieldUnit}> ({meta.unit})</span>
                    )}
                  </label>
                  {meta.type === 'thresholds' ? (
                    <input
                      type="text"
                      value={field.value}
                      placeholder="например: 0, 0.5, 1"
                      onChange={e => handleFieldChange(meta.key, e.target.value)}
                      className={showError ? styles.inputError : ''}
                    />
                  ) : (
                    <input
                      type="number"
                      value={field.value}
                      min={meta.minStrict ? undefined : meta.min}
                      max={meta.max}
                      step={meta.type === 'integer' ? 1 : (meta.step ?? 'any')}
                      onChange={e => handleFieldChange(meta.key, e.target.value)}
                      className={showError ? styles.inputError : ''}
                    />
                  )}
                  {showError && (
                    <span className={styles.fieldError}>{field.error}</span>
                  )}
                </div>
              );
            })}
          </div>

          {submitError !== null && (
            <div className={styles.submitError}>{submitError}</div>
          )}

          <div className={styles.formActions}>
            <button
              className={cStyles.exportBtn}
              onClick={handleCancel}
              disabled={submitting}
            >
              Отмена
            </button>
            <button
              className={cStyles.primaryBtn}
              onClick={handleSubmit}
              disabled={submitting || hasErrors}
            >
              {submitting ? (
                <>
                  <span className={cStyles.spinner} />
                  Создание...
                </>
              ) : 'Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}