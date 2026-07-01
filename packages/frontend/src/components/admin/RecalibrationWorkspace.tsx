'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ImpressionRow, WeightConfigRow, CalibrationFilters } from '@cpmind/shared';
import type { ListParams } from '@/lib/admin/api';
import type { CalibrationBatch, CalibrationItemListResponse } from '@/lib/admin/types';
import {
  createCalibrationBatch,
  fetchCalibrationBatch,
  fetchCalibrationBatchItems,
  approveCalibrationBatch,
  discardCalibrationBatch,
} from '@/lib/admin/api';
import { WeightVersionPicker } from './WeightVersionPicker';
import { RecalibrationTable } from './RecalibrationTable';
import { RecalibrationActionBar } from './RecalibrationActionBar';
import styles from '@/styles/recalibration.module.css';

const POLL_INTERVAL_PROCESSING_MS = 4000;
const POLL_INTERVAL_READY_MS = 20000;
const PREVIEW_PAGE_LIMIT = 200;

export type WorkspaceMode = 'select' | 'processing' | 'ready' | 'success' | 'error';

interface Props {
  initialData: ImpressionRow[];
  totalMatching: number;
  pageCount: number;
  currentPage: number;
  currentParams: ListParams;
  weightsConfigs: WeightConfigRow[];
}

function isValidDeviceType(value: string): value is 'desktop' | 'mobile' | 'tablet' {
  return value === 'desktop' || value === 'mobile' || value === 'tablet';
}

function buildCalibrationFilters(params: ListParams): CalibrationFilters {
  return {
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
    ...(params.creativeId !== undefined && { creativeId: params.creativeId }),
    ...(params.tagConstantsVersion !== undefined && { tagConstantsVersion: params.tagConstantsVersion }),
    ...(params.weightsVersion !== undefined && { weightsVersion: params.weightsVersion }),
    ...(params.deviceType !== undefined && isValidDeviceType(params.deviceType) && { deviceType: params.deviceType }),
    ...(params.isSuspicious !== undefined && { isSuspicious: params.isSuspicious }),
    ...(params.dateFrom !== undefined && { dateFrom: params.dateFrom }),
    ...(params.dateTo !== undefined && { dateTo: params.dateTo }),
    ...(params.scoreMin !== undefined && { scoreMin: params.scoreMin }),
    ...(params.scoreMax !== undefined && { scoreMax: params.scoreMax }),
    ...(params.s1Min !== undefined && { s1Min: params.s1Min }),
    ...(params.s1Max !== undefined && { s1Max: params.s1Max }),
    ...(params.s2Min !== undefined && { s2Min: params.s2Min }),
    ...(params.s2Max !== undefined && { s2Max: params.s2Max }),
    ...(params.s3Min !== undefined && { s3Min: params.s3Min }),
    ...(params.s3Max !== undefined && { s3Max: params.s3Max }),
    ...(params.s4Min !== undefined && { s4Min: params.s4Min }),
    ...(params.s4Max !== undefined && { s4Max: params.s4Max }),
    ...(params.s5Min !== undefined && { s5Min: params.s5Min }),
    ...(params.s5Max !== undefined && { s5Max: params.s5Max }),
    ...(params.s7Min !== undefined && { s7Min: params.s7Min }),
    ...(params.s7Max !== undefined && { s7Max: params.s7Max }),
  };
}

export function RecalibrationWorkspace({
  initialData,
  totalMatching,
  pageCount,
  currentPage,
  currentParams,
  weightsConfigs,
}: Props) {
  const [selectedWeightsConfigId, setSelectedWeightsConfigId] = useState<string | null>(null);
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<WorkspaceMode>('select');
  const [batch, setBatch] = useState<CalibrationBatch | null>(null);
  const [previewItems, setPreviewItems] = useState<CalibrationItemListResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approvedCount, setApprovedCount] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedCount = selectAllMode ? totalMatching : manualSelectedIds.size;

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => clearPoll, [clearPoll]);

  const loadPreview = useCallback(async (batchId: string) => {
    const items = await fetchCalibrationBatchItems(batchId, 1, PREVIEW_PAGE_LIMIT);
    setPreviewItems(items);
  }, []);

  const pollBatch = useCallback((batchId: string) => {
    clearPoll();

    async function tick(): Promise<void> {
      try {
        const fresh = await fetchCalibrationBatch(batchId);
        setBatch(fresh);

        if (fresh.status === 'ready') {
          await loadPreview(batchId);
          setMode('ready');
          clearPoll();
          pollRef.current = setInterval(tick, POLL_INTERVAL_READY_MS);
          return;
        }

        if (fresh.status === 'failed') {
          setErrorMessage('Не удалось рассчитать черновик. Попробуйте снова.');
          setMode('error');
          clearPoll();
          return;
        }

        if (fresh.status === 'expired' || fresh.status === 'discarded') {
          setErrorMessage('Черновик был автоматически отменен по истечении времени.');
          setMode('select');
          setBatch(null);
          setPreviewItems(null);
          clearPoll();
          return;
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Ошибка опроса статуса черновика');
      }
    }

    pollRef.current = setInterval(tick, POLL_INTERVAL_PROCESSING_MS);
    void tick();
  }, [clearPoll, loadPreview]);

  function toggleSelectAll(): void {
    if (selectAllMode) {
      setSelectAllMode(false);
      setManualSelectedIds(new Set());
    } else {
      setSelectAllMode(true);
      setManualSelectedIds(new Set());
    }
  }

  function toggleRow(id: string): void {
    if (selectAllMode) return;
    setManualSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRecalculate(): Promise<void> {
    if (selectedWeightsConfigId === null || selectedCount === 0) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const selection = selectAllMode
        ? { mode: 'filter' as const, filters: buildCalibrationFilters(currentParams) }
        : { mode: 'ids' as const, impressionIds: Array.from(manualSelectedIds) };

      const batchId = await createCalibrationBatch(selectedWeightsConfigId, selection);
      setMode('processing');
      pollBatch(batchId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось создать черновик');
      setMode('error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDiscard(): Promise<void> {
    if (batch === null) return;
    setSubmitting(true);
    try {
      await discardCalibrationBatch(batch.id);
      clearPoll();
      setMode('select');
      setBatch(null);
      setPreviewItems(null);
      setSelectAllMode(false);
      setManualSelectedIds(new Set());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось отменить черновик');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (batch === null) return;
    setSubmitting(true);
    try {
      const result = await approveCalibrationBatch(batch.id);
      clearPoll();
      setApprovedCount(result.approved.length);
      setMode('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'success') {
    return (
      <div className={styles.successPanel}>
        <div className={styles.successIcon}>✓</div>
        <div className={styles.successTitle}>Готово</div>
        <div className={styles.successText}>
          Обновлено {approvedCount} {approvedCount === 1 ? 'импрешен' : 'импрешенов'}.
        </div>
        <button type="button" className={styles.successCloseBtn} onClick={() => window.close()}>
          Закрыть вкладку
        </button>
      </div>
    );
  }

  const isDraftActive = mode === 'processing' || mode === 'ready';

  return (
    <div className={styles.workspace}>
      <WeightVersionPicker
        configs={weightsConfigs}
        selectedId={selectedWeightsConfigId}
        onSelect={setSelectedWeightsConfigId}
        disabled={isDraftActive}
      />

      {errorMessage !== null && (
        <div className={styles.errorBanner}>{errorMessage}</div>
      )}

      <RecalibrationActionBar
        mode={mode}
        selectedCount={selectedCount}
        totalMatching={totalMatching}
        canRecalculate={selectedWeightsConfigId !== null && selectedCount > 0 && mode === 'select'}
        submitting={submitting}
        expiresAt={batch?.expiresAt ?? null}
        onRecalculate={handleRecalculate}
        onDiscard={handleDiscard}
        onSave={handleSave}
      />

      <RecalibrationTable
        rows={initialData}
        pageCount={pageCount}
        currentPage={currentPage}
        mode={isDraftActive ? 'preview' : 'select'}
        previewItems={previewItems?.items ?? []}
        previewTotal={previewItems?.total ?? 0}
        selectAllMode={selectAllMode}
        manualSelectedIds={manualSelectedIds}
        onToggleSelectAll={toggleSelectAll}
        onToggleRow={toggleRow}
        disabled={isDraftActive}
      />
    </div>
  );
}