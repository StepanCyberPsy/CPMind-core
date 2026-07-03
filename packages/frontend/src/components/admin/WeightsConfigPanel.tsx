'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createWeightsConfig,
  activateWeightsConfig,
  deleteWeightsConfig,
} from '@/lib/admin/api';
import type { WeightConfigRow } from '@cpmind/shared';
import type { CreativeCategory } from '@cpmind/shared';
import cStyles from '@/styles/components.module.css';
import styles from '@/styles/weights-panel.module.css';

interface Props {
  initialConfigs: WeightConfigRow[];
}

type FormStep = 'type' | 'weights';

interface WeightsForm {
  version: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  s6: string;
  s7: string;
  description: string;
}

const DEFAULT_BANNER_FORM: WeightsForm = {
  version: '',
  s1: '0.30',
  s2: '0.20',
  s3: '0.15',
  s4: '0.15',
  s5: '0.15',
  s6: '0.00',
  s7: '0.05',
  description: '',
};

const DEFAULT_VIDEO_FORM: WeightsForm = {
  version: '',
  s1: '0.15',
  s2: '0.10',
  s3: '0.10',
  s4: '0.10',
  s5: '0.10',
  s6: '0.40',
  s7: '0.05',
  description: '',
};

const CONFIG_TYPE_LABELS: Record<CreativeCategory, string> = {
  banner: 'Баннеры',
  video: 'Видео',
};

function computeSum(form: WeightsForm): number {
  return (
    parseFloat(form.s1 || '0') +
    parseFloat(form.s2 || '0') +
    parseFloat(form.s3 || '0') +
    parseFloat(form.s4 || '0') +
    parseFloat(form.s5 || '0') +
    parseFloat(form.s6 || '0') +
    parseFloat(form.s7 || '0')
  );
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

export function WeightsConfigPanel({ initialConfigs }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CreativeCategory>('banner');
  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>('type');
  const [formConfigType, setFormConfigType] = useState<CreativeCategory | null>(null);
  const [form, setForm] = useState<WeightsForm>(DEFAULT_BANNER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const sum = computeSum(form);
  const sumValid = Math.abs(sum - 1.0) <= 0.001;
  const filteredConfigs = initialConfigs.filter((c) => c.configType === activeTab);

  const handleFieldChange = useCallback((
    field: keyof WeightsForm,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }, []);

  const handleSelectType = useCallback((type: CreativeCategory) => {
    setFormConfigType(type);
    setForm(type === 'video' ? { ...DEFAULT_VIDEO_FORM } : { ...DEFAULT_BANNER_FORM });
    setFormStep('weights');
  }, []);

  const handleBack = useCallback(() => {
    setFormStep('type');
    setFormConfigType(null);
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setFormStep('type');
    setFormConfigType(null);
    setForm(DEFAULT_BANNER_FORM);
    setFormError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formConfigType) return;
    if (!form.version.trim()) {
      setFormError('Укажите название версии');
      return;
    }
    if (!sumValid) {
      setFormError(`Сумма весов должна равняться 1.00 (сейчас: ${sum.toFixed(3)})`);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await createWeightsConfig({
        version: form.version.trim(),
        configType: formConfigType,
        weights: {
          s1: parseFloat(form.s1),
          s2: parseFloat(form.s2),
          s3: parseFloat(form.s3),
          s4: parseFloat(form.s4),
          s5: parseFloat(form.s5),
          s6: parseFloat(form.s6),
          s7: parseFloat(form.s7),
        },
        ...(form.description.trim() && { description: form.description.trim() }),
      });
      setShowForm(false);
      setFormStep('type');
      setFormConfigType(null);
      setForm(DEFAULT_BANNER_FORM);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ошибка создания конфигурации');
    } finally {
      setSubmitting(false);
    }
  }, [form, formConfigType, sum, sumValid, router]);

  const handleActivate = useCallback(async (id: string) => {
    setActionId(id);
    try {
      await activateWeightsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка активации');
    } finally {
      setActionId(null);
    }
  }, [router]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Удалить конфигурацию весов?')) return;
    setActionId(id);
    try {
      await deleteWeightsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setActionId(null);
    }
  }, [router]);

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Версии конфигурации весов</span>
        {!showForm && (
          <button
            className={cStyles.primaryBtn}
            onClick={() => setShowForm(true)}
          >
            + Новая версия
          </button>
        )}
      </div>

      <div className={styles.tabBar}>
        {(['banner', 'video'] as const).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab)}
          >
            {CONFIG_TYPE_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.scrollContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Версия</th>
                <th className={styles.th}>S1</th>
                <th className={styles.th}>S2</th>
                <th className={styles.th}>S3</th>
                <th className={styles.th}>S4</th>
                <th className={styles.th}>S5</th>
                <th className={styles.th}>S6</th>
                <th className={styles.th}>S7</th>
                <th className={styles.th}>Описание</th>
                <th className={styles.th}>Создана</th>
                <th className={`${styles.th} ${styles.thActions}`}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredConfigs.length === 0 ? (
                <tr>
                  <td colSpan={11} className={styles.empty}>
                    Конфигурации не найдены
                  </td>
                </tr>
              ) : (
                filteredConfigs.map((cfg) => (
                  <tr
                    key={cfg.id}
                    className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                  >
                    <td className={styles.td}>
                      <div className={styles.cellVersion}>
                        <span className={styles.cellMono}>{cfg.version}</span>
                        {cfg.isActive && (
                          <span className={styles.activeBadge}>
                            <span className={styles.activeDot} />
                            активна
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{cfg.weights.s1.toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{cfg.weights.s2.toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{cfg.weights.s3.toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{cfg.weights.s4.toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{cfg.weights.s5.toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{(cfg.weights.s6 ?? 0).toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{cfg.weights.s7.toFixed(2)}</span>
                    </td>
                    <td className={styles.td}>
                      {cfg.description ? (
                        <span className={styles.cellDescription}>{cfg.description}</span>
                      ) : (
                        <span className={styles.cellNull}>—</span>
                      )}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{formatDate(cfg.createdAt)}</span>
                    </td>
                    <td className={`${styles.td} ${styles.tdActions}`}>
                      <div className={styles.actions}>
                        {!cfg.isActive && (
                          <button
                            className={cStyles.ghostBtn}
                            onClick={() => handleActivate(cfg.id)}
                            disabled={actionId === cfg.id}
                          >
                            {actionId === cfg.id ? (
                              <span className={cStyles.spinner} />
                            ) : 'Активировать'}
                          </button>
                        )}
                        <button
                          className={cStyles.dangerBtn}
                          onClick={() => handleDelete(cfg.id)}
                          disabled={cfg.isActive || actionId === cfg.id}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className={styles.formWrapper}>
          {formStep === 'type' ? (
            <>
              <div className={styles.formTitle}>Новая конфигурация весов</div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Тип креатива</label>
                <div className={styles.typeGrid}>
                  <button
                    className={styles.typeCard}
                    onClick={() => handleSelectType('banner')}
                  >
                    <svg className={styles.typeCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="8.5" cy="10.5" r="1.5" />
                      <path d="M21 15l-5-5L5 19" />
                    </svg>
                    <span className={styles.typeCardLabel}>Баннер</span>
                    <span className={styles.typeCardHint}>banner_static / gif / html5</span>
                  </button>
                  <button
                    className={styles.typeCard}
                    onClick={() => handleSelectType('video')}
                  >
                    <svg className={styles.typeCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="14" height="12" rx="2" />
                      <path d="M16 10l6-3v10l-6-3V10z" />
                    </svg>
                    <span className={styles.typeCardLabel}>Видео</span>
                    <span className={styles.typeCardHint}>video_creative</span>
                  </button>
                </div>
              </div>
              <div className={styles.formActions}>
                <button className={cStyles.exportBtn} onClick={handleCancel}>
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.formBreadcrumb}>
                <button className={styles.formBreadcrumbBack} onClick={handleBack}>
                  ← Назад
                </button>
                <span className={styles.formBreadcrumbSep}>/</span>
                <span className={styles.formBreadcrumbCurrent}>
                  {formConfigType ? CONFIG_TYPE_LABELS[formConfigType] : ''} — новая версия
                </span>
              </div>

              <div className={styles.formTitle}>Новая конфигурация весов</div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Версия</label>
                <input
                  type="text"
                  placeholder="например: v1.1_calibrated"
                  value={form.version}
                  onChange={(e) => handleFieldChange('version', e.target.value)}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Веса сигналов</label>
                <div className={styles.weightsGrid}>
                  {(['s1', 's2', 's3', 's4', 's5', 's6', 's7'] as const).map((key) => (
                    <div key={key} className={styles.weightField}>
                      <span className={styles.weightLabel}>{key.toUpperCase()}</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={form[key]}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.weightSum}>
                  Сумма:{' '}
                  <span className={sumValid ? styles.weightSumValid : styles.weightSumInvalid}>
                    {sum.toFixed(3)}
                  </span>
                  {sumValid && ' ✓'}
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Описание</label>
                <input
                  type="text"
                  placeholder="Комментарий к версии (необязательно)"
                  value={form.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                />
              </div>

              {formError && (
                <div className={styles.formError}>{formError}</div>
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
                  disabled={submitting || !sumValid}
                >
                  {submitting ? (
                    <>
                      <span className={cStyles.spinner} />
                      Создание...
                    </>
                  ) : 'Создать'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}