'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createIvtListConfig,
  fetchIvtListConfig,
  activateIvtListConfig,
  deactivateIvtListConfig,
  // deleteIvtListConfig,
  createIvtThresholdsConfig,
  activateIvtThresholdsConfig,
  deactivateIvtThresholdsConfig,
  // deleteIvtThresholdsConfig,
} from '@/lib/admin/api';
import type {
  IvtListConfigListResponse,
  IvtThresholdsConfigListResponse,
} from '@cpmind/shared';
import { IvtListEntriesModal } from './IvtListEntriesModal';
import cStyles from '@/styles/components.module.css';
import styles from '@/styles/ivt-panel.module.css';

interface Props {
  listConfigs: IvtListConfigListResponse;
  thresholdsConfigs: IvtThresholdsConfigListResponse;
}

type ActiveTab = 'lists' | 'thresholds';

interface ThresholdsForm {
  version: string;
  description: string;
  timing_variance_min_ms: string;
  cursor_entropy_min: string;
  click_without_hover: boolean | null;
  repeat_fp_window_min: string;
  repeat_fp_max_creatives: string;
  confidence_confirm: string;
}

const DEFAULT_THRESHOLDS_FORM: ThresholdsForm = {
  version: '',
  description: '',
  timing_variance_min_ms: '',
  cursor_entropy_min: '',
  click_without_hover: null,
  repeat_fp_window_min: '',
  repeat_fp_max_creatives: '',
  confidence_confirm: '',
};

function parseNullableFloat(v: string): number | null {
  if (v.trim() === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseNullableInt(v: string): number | null {
  if (v.trim() === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
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

function formatThresholdValue(value: number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Включено' : 'Отключено';
  return String(value);
}

export function IvtPanel({ listConfigs, thresholdsConfigs }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('lists');
  const [actionId, setActionId] = useState<string | null>(null);
  const [modalConfigId, setModalConfigId] = useState<string | null>(null);
  const [modalVersion, setModalVersion] = useState<string>('');

  // Lists form state
  const [showListForm, setShowListForm] = useState(false);
  const [listVersion, setListVersion] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [listCsv, setListCsv] = useState('');
  const [listFormError, setListFormError] = useState<string | null>(null);
  const [listParseWarnings, setListParseWarnings] = useState<unknown[]>([]);
  const [listSubmitting, setListSubmitting] = useState(false);

  // Thresholds form state
  const [showThresholdsForm, setShowThresholdsForm] = useState(false);
  const [thresholdsForm, setThresholdsForm] = useState<ThresholdsForm>(DEFAULT_THRESHOLDS_FORM);
  const [thresholdsFormError, setThresholdsFormError] = useState<string | null>(null);
  const [thresholdsSubmitting, setThresholdsSubmitting] = useState(false);

  // List handlers
  const handleCancelList = useCallback(() => {
    setShowListForm(false);
    setListVersion('');
    setListDescription('');
    setListCsv('');
    setListFormError(null);
    setListParseWarnings([]);
  }, []);

  const handleSubmitList = useCallback(async () => {
    if (!listVersion.trim()) {
      setListFormError('Укажите название версии');
      return;
    }
    if (!listCsv.trim()) {
      setListFormError('Вставьте CSV-данные');
      return;
    }

    setListSubmitting(true);
    setListFormError(null);

    try {
      const result = await createIvtListConfig({
        version: listVersion.trim(),
        csv: listCsv.trim(),
        ...(listDescription.trim() && { description: listDescription.trim() }),
      });

      if (result.parseErrors && result.parseErrors.length > 0) {
        setListParseWarnings(result.parseErrors);
      }

      setShowListForm(false);
      setListVersion('');
      setListDescription('');
      setListCsv('');
      router.refresh();
    } catch (err) {
      setListFormError(err instanceof Error ? err.message : 'Ошибка загрузки списка');
    } finally {
      setListSubmitting(false);
    }
  }, [listVersion, listDescription, listCsv, router]);

  const handleActivateList = useCallback(async (id: string) => {
    setActionId(id);
    try {
      await activateIvtListConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка активации');
    } finally {
      setActionId(null);
    }
  }, [router]);

  const handleDeactivateList = useCallback(async (id: string) => {
    setActionId(id);
    try {
      await deactivateIvtListConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка деактивации');
    } finally {
      setActionId(null);
    }
  }, [router]);

  {/*
  const handleDeleteList = useCallback(async (id: string) => {
    if (!confirm('Удалить конфигурацию списка?')) return;
    setActionId(id);
    try {
      await deleteIvtListConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setActionId(null);
    }
  }, [router]);
  */}

  const handleOpenModal = useCallback((id: string, version: string) => {
    setModalConfigId(id);
    setModalVersion(version);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalConfigId(null);
    setModalVersion('');
  }, []);

  // Thresholds handlers
  const handleThresholdsFieldChange = useCallback((
    field: keyof ThresholdsForm,
    value: string | boolean | null,
  ) => {
    setThresholdsForm((prev) => ({ ...prev, [field]: value }));
    setThresholdsFormError(null);
  }, []);

  const handleCancelThresholds = useCallback(() => {
    setShowThresholdsForm(false);
    setThresholdsForm(DEFAULT_THRESHOLDS_FORM);
    setThresholdsFormError(null);
  }, []);

  const handleSubmitThresholds = useCallback(async () => {
    if (!thresholdsForm.version.trim()) {
      setThresholdsFormError('Укажите название версии');
      return;
    }

    setThresholdsSubmitting(true);
    setThresholdsFormError(null);

    try {
      await createIvtThresholdsConfig({
        version: thresholdsForm.version.trim(),
        thresholds: {
          timing_variance_min_ms: parseNullableFloat(thresholdsForm.timing_variance_min_ms),
          cursor_entropy_min: parseNullableFloat(thresholdsForm.cursor_entropy_min),
          click_without_hover: thresholdsForm.click_without_hover,
          repeat_fp_window_min: parseNullableInt(thresholdsForm.repeat_fp_window_min),
          repeat_fp_max_creatives: parseNullableInt(thresholdsForm.repeat_fp_max_creatives),
          confidence_confirm: parseNullableFloat(thresholdsForm.confidence_confirm),
        },
        ...(thresholdsForm.description.trim() && { description: thresholdsForm.description.trim() }),
      });
      setShowThresholdsForm(false);
      setThresholdsForm(DEFAULT_THRESHOLDS_FORM);
      router.refresh();
    } catch (err) {
      setThresholdsFormError(err instanceof Error ? err.message : 'Ошибка создания конфигурации');
    } finally {
      setThresholdsSubmitting(false);
    }
  }, [thresholdsForm, router]);

  const handleActivateThresholds = useCallback(async (id: string) => {
    setActionId(id);
    try {
      await activateIvtThresholdsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка активации');
    } finally {
      setActionId(null);
    }
  }, [router]);

  const handleDeactivateThresholds = useCallback(async (id: string) => {
    setActionId(id);
    try {
      await deactivateIvtThresholdsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка деактивации');
    } finally {
      setActionId(null);
    }
  }, [router]);

  {/*
  const handleDeleteThresholds = useCallback(async (id: string) => {
    if (!confirm('Удалить конфигурацию порогов?')) return;
    setActionId(id);
    try {
      await deleteIvtThresholdsConfig(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setActionId(null);
    }
  }, [router]);
  */}

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Управление IVT-трафиком</span>
        {!showListForm && !showThresholdsForm && (
          <button
            className={cStyles.primaryBtn}
            onClick={() => activeTab === 'lists' ? setShowListForm(true) : setShowThresholdsForm(true)}
          >
            {activeTab === 'lists' ? '+ Загрузить список' : '+ Новая версия'}
          </button>
        )}
      </div>

      <div className={styles.tabBar}>
        <button
          className={activeTab === 'lists' ? styles.tabActive : styles.tab}
          onClick={() => {
            setActiveTab('lists');
            setShowThresholdsForm(false);
          }}
        >
          GIVT-списки
        </button>
        <button
          className={activeTab === 'thresholds' ? styles.tabActive : styles.tab}
          onClick={() => {
            setActiveTab('thresholds');
            setShowListForm(false);
          }}
        >
          SIVT-пороги
        </button>
      </div>

      {activeTab === 'lists' && (
        <>
          <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Версия</th>
                    <th className={styles.th}>Записей</th>
                    <th className={styles.th}>Описание</th>
                    <th className={styles.th}>Создана</th>
                    <th className={`${styles.th} ${styles.thActions}`}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {listConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        Списки не загружены
                      </td>
                    </tr>
                  ) : (
                    listConfigs.map((cfg) => (
                      <tr
                        key={cfg.id}
                        className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''} ${styles.trClickable}`}
                        onClick={() => handleOpenModal(cfg.id, cfg.version)}
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
                          <span className={styles.cellMono}>{cfg.entriesCount}</span>
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
                            {!cfg.isActive ? (
                              <button
                                className={cStyles.ghostBtn}
                                onClick={(e) => { e.stopPropagation(); void handleActivateList(cfg.id); }}
                                disabled={actionId === cfg.id}
                              >
                                {actionId === cfg.id ? <span className={cStyles.spinner} /> : 'Активировать'}
                              </button>
                            ) : (
                              <button
                                className={cStyles.ghostBtn}
                                onClick={(e) => { e.stopPropagation(); void handleDeactivateList(cfg.id); }}
                                disabled={actionId === cfg.id}
                              >
                                {actionId === cfg.id ? <span className={cStyles.spinner} /> : 'Деактивировать'}
                              </button>
                            )}
                            {/*
                            <button
                              className={cStyles.dangerBtn}
                              onClick={(e) => { e.stopPropagation(); void handleDeleteList(cfg.id); }}
                              disabled={cfg.isActive || actionId === cfg.id}
                            >
                              Удалить
                            </button>
                            */}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {listParseWarnings.length > 0 && (
            <div className={styles.parseWarnings}>
              <div className={styles.parseWarningsTitle}>
                Список загружен с предупреждениями ({listParseWarnings.length} строк пропущено):
              </div>
              <ul className={styles.parseWarningsList}>
                {listParseWarnings.slice(0, 10).map((w, i) => (
                  <li key={i} className={styles.parseWarningsItem}>
                    {String((w as Record<string, unknown>)['reason'] ?? w)}
                  </li>
                ))}
                {listParseWarnings.length > 10 && (
                  <li className={styles.parseWarningsItem}>
                    ...и ещё {listParseWarnings.length - 10} предупреждений
                  </li>
                )}
              </ul>
            </div>
          )}

          {showListForm && (
            <div className={styles.formWrapper}>
              <div className={styles.formTitle}>Загрузить новый список</div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Версия</label>
                <input
                  type="text"
                  placeholder="например: v1.1_iab_2026q3"
                  value={listVersion}
                  onChange={(e) => {
                    setListVersion(e.target.value);
                    setListFormError(null);
                  }}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Описание</label>
                <input
                  type="text"
                  placeholder="Комментарий к версии (необязательно)"
                  value={listDescription}
                  onChange={(e) => setListDescription(e.target.value)}
                />
              </div>

              <div className={styles.formField}>
                <div className={styles.csvLabelRow}>
                  <label className={styles.formLabel} style={{ marginBottom: 0 }}>CSV-данные</label>
                  <label className={styles.csvFileLabel}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Загрузить файл
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className={styles.csvFileInput}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setListCsv((ev.target?.result as string) ?? '');
                          setListFormError(null);
                        };
                        reader.readAsText(file, 'UTF-8');
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className={styles.csvHint}>
                  Формат: <span className={styles.csvCode}>type,pattern,match_type,category,reason,source</span>
                </div>
                {listCsv.trim() && (
                  <div className={styles.csvFileLoaded}>
                    ✓ {listCsv.trim().split('\n').length - 1} строк загружено
                  </div>
                )}
                <textarea
                  className={styles.csvTextarea}
                  placeholder={'type,pattern,match_type,category,reason,source\nua,Googlebot,substring,givt_declared_bot,Google crawler,own'}
                  value={listCsv}
                  rows={10}
                  onChange={(e) => {
                    setListCsv(e.target.value);
                    setListFormError(null);
                  }}
                />
              </div>

              {listFormError && <div className={styles.formError}>{listFormError}</div>}

              <div className={styles.formActions}>
                <button className={cStyles.exportBtn} onClick={handleCancelList} disabled={listSubmitting}>
                  Отмена
                </button>
                <button className={cStyles.primaryBtn} onClick={handleSubmitList} disabled={listSubmitting}>
                  {listSubmitting ? <><span className={cStyles.spinner} />Загрузка...</> : 'Загрузить'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'thresholds' && (
        <>
          <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Версия</th>
                    <th className={styles.th}>Тайминг (мс)</th>
                    <th className={styles.th}>Энтропия</th>
                    <th className={styles.th}>Клик без hover</th>
                    <th className={styles.th}>Окно FP (мин)</th>
                    <th className={styles.th}>Макс. креативов</th>
                    <th className={styles.th}>Порог подтв.</th>
                    <th className={styles.th}>Создана</th>
                    <th className={`${styles.th} ${styles.thActions}`}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholdsConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.empty}>
                        Конфигурации не найдены
                      </td>
                    </tr>
                  ) : (
                    thresholdsConfigs.map((cfg) => (
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
                          <span className={styles.cellMono}>{formatThresholdValue(cfg.thresholds.timing_variance_min_ms)}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.cellMono}>{formatThresholdValue(cfg.thresholds.cursor_entropy_min)}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={cfg.thresholds.click_without_hover === null ? styles.cellNull : styles.cellMono}>
                            {formatThresholdValue(cfg.thresholds.click_without_hover)}
                          </span>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.cellMono}>{formatThresholdValue(cfg.thresholds.repeat_fp_window_min)}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.cellMono}>{formatThresholdValue(cfg.thresholds.repeat_fp_max_creatives)}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.cellMono}>{formatThresholdValue(cfg.thresholds.confidence_confirm)}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.cellMono}>{formatDate(cfg.createdAt)}</span>
                        </td>
                        <td className={`${styles.td} ${styles.tdActions}`}>
                          <div className={styles.actions}>
                            {!cfg.isActive ? (
                              <button
                                className={cStyles.ghostBtn}
                                onClick={() => handleActivateThresholds(cfg.id)}
                                disabled={actionId === cfg.id}
                              >
                                {actionId === cfg.id ? <span className={cStyles.spinner} /> : 'Активировать'}
                              </button>
                            ) : (
                              <button
                                className={cStyles.ghostBtn}
                                onClick={() => handleDeactivateThresholds(cfg.id)}
                                disabled={actionId === cfg.id}
                              >
                                {actionId === cfg.id ? <span className={cStyles.spinner} /> : 'Деактивировать'}
                              </button>
                            )}
                            {/*
                            <button
                              className={cStyles.dangerBtn}
                              onClick={() => handleDeleteThresholds(cfg.id)}
                              disabled={cfg.isActive || actionId === cfg.id}
                            >
                              Удалить
                            </button>
                            */}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showThresholdsForm && (
            <div className={styles.formWrapper}>
              <div className={styles.formTitle}>Новая конфигурация порогов</div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Версия</label>
                <input
                  type="text"
                  placeholder="например: v1.1_calibrated"
                  value={thresholdsForm.version}
                  onChange={(e) => handleThresholdsFieldChange('version', e.target.value)}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Описание</label>
                <input
                  type="text"
                  placeholder="Комментарий к версии (необязательно)"
                  value={thresholdsForm.description}
                  onChange={(e) => handleThresholdsFieldChange('description', e.target.value)}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Пороги детекции</label>
                <div className={styles.thresholdsHint}>Пустое поле = правило отключено</div>
                <div className={styles.thresholdsGrid}>
                  <div className={styles.thresholdField}>
                    <span className={styles.thresholdLabel}>Тайминговая регулярность (мс)</span>
                    <span className={styles.thresholdHint}>std_dev интервалов ниже порога → robotic_timing</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Пусто = отключено"
                      value={thresholdsForm.timing_variance_min_ms}
                      onChange={(e) => handleThresholdsFieldChange('timing_variance_min_ms', e.target.value)}
                    />
                  </div>

                  <div className={styles.thresholdField}>
                    <span className={styles.thresholdLabel}>Энтропия курсора [0–1]</span>
                    <span className={styles.thresholdHint}>Энтропия ниже порога при движениях → synthetic_cursor</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      placeholder="Пусто = отключено"
                      value={thresholdsForm.cursor_entropy_min}
                      onChange={(e) => handleThresholdsFieldChange('cursor_entropy_min', e.target.value)}
                    />
                  </div>

                  <div className={styles.thresholdField}>
                    <span className={styles.thresholdLabel}>Клик без hover/move</span>
                    <span className={styles.thresholdHint}>Клик без предшествующего движения → impossible_interaction</span>
                    <div className={styles.toggleRow}>
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${thresholdsForm.click_without_hover === true ? styles.toggleActive : ''}`}
                        onClick={() => handleThresholdsFieldChange(
                          'click_without_hover',
                          thresholdsForm.click_without_hover === true ? null : true,
                        )}
                      >
                        {thresholdsForm.click_without_hover === true ? 'Включено' : 'Отключено'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.thresholdField}>
                    <span className={styles.thresholdLabel}>Окно FP-анализа (мин)</span>
                    <span className={styles.thresholdHint}>Временное окно для частотного анализа fp_hash</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Пусто = отключено"
                      value={thresholdsForm.repeat_fp_window_min}
                      onChange={(e) => handleThresholdsFieldChange('repeat_fp_window_min', e.target.value)}
                    />
                  </div>

                  <div className={styles.thresholdField}>
                    <span className={styles.thresholdLabel}>Макс. креативов за окно</span>
                    <span className={styles.thresholdHint}>Превышение от одного fp_hash → botnet_frequency</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Пусто = отключено"
                      value={thresholdsForm.repeat_fp_max_creatives}
                      onChange={(e) => handleThresholdsFieldChange('repeat_fp_max_creatives', e.target.value)}
                    />
                  </div>

                  <div className={styles.thresholdField}>
                    <span className={styles.thresholdLabel}>Порог подтверждения [0–1]</span>
                    <span className={styles.thresholdHint}>Уверенность ≥ порога → sivt_confirmed</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      placeholder="Пусто = 0.85 по умолчанию"
                      value={thresholdsForm.confidence_confirm}
                      onChange={(e) => handleThresholdsFieldChange('confidence_confirm', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {thresholdsFormError && <div className={styles.formError}>{thresholdsFormError}</div>}

              <div className={styles.formActions}>
                <button className={cStyles.exportBtn} onClick={handleCancelThresholds} disabled={thresholdsSubmitting}>
                  Отмена
                </button>
                <button className={cStyles.primaryBtn} onClick={handleSubmitThresholds} disabled={thresholdsSubmitting}>
                  {thresholdsSubmitting ? <><span className={cStyles.spinner} />Создание...</> : 'Создать'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {modalConfigId !== null && (
        <IvtListEntriesModal
          configId={modalConfigId}
          version={modalVersion}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}