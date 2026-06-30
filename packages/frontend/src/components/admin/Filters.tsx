'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Combobox } from '@/components/shared/Combobox';
import { ComboboxDatePicker } from '@/components/shared/ComboboxDatePicker';
import type { FiltersProps } from '@/lib/admin/types';
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

export function Filters({
  current,
  tagConstantsVersions,
  weightsVersions,
  campaignOptions,
  creativeOptions,
}: FiltersProps) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(current.campaignId ?? '');
  const [creativeId, setCreativeId] = useState(current.creativeId ?? '');
  const [tagConstantsVersion, setTagConstantsVersion] = useState(current.tagConstantsVersion ?? '');
  const [weightsVersion, setWeightsVersion] = useState(current.weightsVersion ?? '');
  const [deviceType, setDeviceType] = useState(current.deviceType ?? '');
  const [isSuspicious, setIsSuspicious] = useState<string>(
    current.isSuspicious === true ? 'true' :
      current.isSuspicious === false ? 'false' : '',
  );
  const [dateFrom, setDateFrom] = useState(current.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(current.dateTo ?? '');

  const applyFilters = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', '1');
    campaignId ? url.searchParams.set('campaignId', campaignId) : url.searchParams.delete('campaignId');
    creativeId ? url.searchParams.set('creativeId', creativeId) : url.searchParams.delete('creativeId');
    tagConstantsVersion ? url.searchParams.set('tagConstantsVersion', tagConstantsVersion) : url.searchParams.delete('tagConstantsVersion');
    weightsVersion ? url.searchParams.set('weightsVersion', weightsVersion) : url.searchParams.delete('weightsVersion');
    deviceType ? url.searchParams.set('deviceType', deviceType) : url.searchParams.delete('deviceType');
    isSuspicious ? url.searchParams.set('isSuspicious', isSuspicious) : url.searchParams.delete('isSuspicious');
    dateFrom ? url.searchParams.set('dateFrom', dateFrom) : url.searchParams.delete('dateFrom');
    dateTo ? url.searchParams.set('dateTo', dateTo) : url.searchParams.delete('dateTo');
    router.push(url.pathname + url.search);
  }, [router, campaignId, creativeId, tagConstantsVersion, weightsVersion, deviceType, isSuspicious, dateFrom, dateTo]);

  const exitSegmentView = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('sessionGroupId');
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }, [router]);

  const resetFilters = useCallback(() => {
    setCampaignId('');
    setCreativeId('');
    setTagConstantsVersion('');
    setWeightsVersion('');
    setDeviceType('');
    setIsSuspicious('');
    setDateFrom('');
    setDateTo('');
    const url = new URL(window.location.href);
    ['campaignId', 'creativeId', 'tagConstantsVersion', 'weightsVersion', 'deviceType', 'isSuspicious', 'dateFrom', 'dateTo'].forEach((k) =>
      url.searchParams.delete(k),
    );
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }, [router]);

  const campaignComboOptions = campaignOptions.map((value) => ({ value, label: value }));
  const creativeComboOptions = creativeOptions.map((value) => ({ value, label: value }));
  const tagVersionComboOptions = tagConstantsVersions.map((value) => ({ value, label: value }));
  const weightsVersionComboOptions = weightsVersions.map((value) => ({ value, label: value }));

  return (
    <div className={styles.filters}>
      {current.sessionGroupId && (
        <div className={styles.sessionContext}>
          <span className={styles.sessionContextLabel}>Просмотр сегментов показа</span>
          <span className={styles.sessionContextId}>{current.sessionGroupId}</span>
          <button type="button" className={styles.sessionContextClear} onClick={exitSegmentView}>
            Выйти из режима сегментов ×
          </button>
        </div>
      )}
      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label}>ID Кампании</label>
          <Combobox
            options={campaignComboOptions}
            value={campaignId}
            onChange={setCampaignId}
            placeholder="Все"
          />
        </div>

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
          <label className={styles.label}>Версия тега</label>
          <Combobox
            options={tagVersionComboOptions}
            value={tagConstantsVersion}
            onChange={setTagConstantsVersion}
            placeholder="Все"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Версия весов</label>
          <Combobox
            options={weightsVersionComboOptions}
            value={weightsVersion}
            onChange={setWeightsVersion}
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