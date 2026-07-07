'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Combobox } from '@/components/shared/Combobox';
import { ComboboxDatePicker } from '@/components/shared/ComboboxDatePicker';
import type { UserFiltersProps } from '@/lib/user/types';
import styles from '@/styles/filters.module.css';

const DEVICE_OPTIONS = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
];

const ANOMALY_OPTIONS = [
  { value: 'false', label: 'Только чистые' },
  { value: 'true', label: 'Только аномальные' },
];

const IVT_OPTIONS = [
  { value: 'valid', label: 'Только валидные' },
  { value: 'givt', label: 'GIVT-Нарушения' },
  { value: 'sivt_confirmed', label: 'SIVT-Нарушения' },
];

export function UserFilters({
  current,
  campaignOptions,
  creativeOptions,
  lockCampaignId,
}: UserFiltersProps) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(current.campaignId ?? '');
  const [creativeId, setCreativeId] = useState(current.creativeId ?? '');
  const [deviceType, setDeviceType] = useState(current.deviceType ?? '');
  const [isSuspicious, setIsSuspicious] = useState<string>(
    current.isSuspicious === true ? 'true' :
      current.isSuspicious === false ? 'false' : '',
  );
  const [ivtVerdict, setIvtVerdict] = useState(current.ivtVerdict ?? '');
  const [dateFrom, setDateFrom] = useState(current.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(current.dateTo ?? '');

  const applyFilters = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', '1');

    if (!lockCampaignId) {
      campaignId ? url.searchParams.set('campaignId', campaignId) : url.searchParams.delete('campaignId');
    }

    creativeId ? url.searchParams.set('creativeId', creativeId) : url.searchParams.delete('creativeId');
    deviceType ? url.searchParams.set('deviceType', deviceType) : url.searchParams.delete('deviceType');
    isSuspicious ? url.searchParams.set('isSuspicious', isSuspicious) : url.searchParams.delete('isSuspicious');
    ivtVerdict ? url.searchParams.set('ivtVerdict', ivtVerdict) : url.searchParams.delete('ivtVerdict');
    dateFrom ? url.searchParams.set('dateFrom', dateFrom) : url.searchParams.delete('dateFrom');
    dateTo ? url.searchParams.set('dateTo', dateTo) : url.searchParams.delete('dateTo');

    router.push(url.pathname + url.search);
  }, [
    router,
    lockCampaignId,
    campaignId,
    creativeId,
    deviceType,
    isSuspicious,
    ivtVerdict,
    dateFrom,
    dateTo,
  ]);

  const resetFilters = useCallback(() => {
    if (!lockCampaignId) setCampaignId('');
    setCreativeId('');
    setDeviceType('');
    setIsSuspicious('');
    setIvtVerdict('');
    setDateFrom('');
    setDateTo('');

    const url = new URL(window.location.href);
    [
      'creativeId',
      'deviceType',
      'isSuspicious',
      'ivtVerdict',
      'dateFrom',
      'dateTo'
    ].forEach((k) =>
      url.searchParams.delete(k),
    );
    if (!lockCampaignId) url.searchParams.delete('campaignId');
    url.searchParams.set('page', '1');

    router.push(url.pathname + url.search);
  }, [router, lockCampaignId]);

  const campaignComboOptions = campaignOptions.map((value) => ({ value, label: value }));
  const creativeComboOptions = creativeOptions.map((value) => ({ value, label: value }));

  return (
    <div className={styles.filters}>
      <div className={styles.grid}>
        {!lockCampaignId && (
          <div className={styles.field}>
            <label className={styles.label}>ID Кампании</label>
            <Combobox
              options={campaignComboOptions}
              value={campaignId}
              onChange={setCampaignId}
              placeholder="Все"
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>ID Креатива</label>
          <Combobox
            options={creativeComboOptions}
            value={creativeId}
            onChange={setCreativeId}
            placeholder="Все"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Устройство</label>
          <Combobox
            options={DEVICE_OPTIONS}
            value={deviceType}
            onChange={setDeviceType}
            placeholder="Все"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Наличие аномалий</label>
          <Combobox
            options={ANOMALY_OPTIONS}
            value={isSuspicious}
            onChange={setIsSuspicious}
            placeholder="Все"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>IVT-статус</label>
          <Combobox
            options={IVT_OPTIONS}
            value={ivtVerdict}
            onChange={setIvtVerdict}
            placeholder="Все"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Дата с</label>
          <ComboboxDatePicker
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="Не выбрано"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Дата по</label>
          <ComboboxDatePicker
            value={dateTo}
            onChange={setDateTo}
            placeholder="Не выбрано"
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.btnGhost} onClick={resetFilters}>
          Сбросить
        </button>
        <button className={styles.btnPrimary} onClick={applyFilters}>
          Применить
        </button>
      </div>
    </div>
  );
}