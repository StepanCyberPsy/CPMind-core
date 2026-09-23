'use client';

import {
  useState,
  useCallback,
  useEffect,
} from 'react';
import { useRouter } from 'next/navigation';
import { Combobox } from '@/components/shared/Combobox';
import { ComboboxDatePicker } from '@/components/shared/ComboboxDatePicker';
import {
  CREATIVE_TYPE_KEYS,
  CREATIVE_TYPE_LABELS,
  PLACEMENT_FORMAT_LABELS,
  FORMAT_SUBTYPE_OPTIONS,
} from '@/lib/config';
import type { UserFiltersProps } from '@/lib/user/types';
import styles from '@/styles/filters.module.css';

const CREATIVE_TYPE_OPTIONS = CREATIVE_TYPE_KEYS.map((value) => ({
  value,
  label: CREATIVE_TYPE_LABELS[value] ?? value,
}));

const FORMAT_OPTIONS = Object.entries(PLACEMENT_FORMAT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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
  { value: 'sivt_suspected', label: 'SIVT-Подозрение' },
  { value: 'sivt_confirmed', label: 'SIVT-Подтвержден' },
];

export function UserFilters({
  current,
  campaignOptions,
  creativeOptions,
  lockCampaignId,
  domainView = false,
  domainOptions = [],
}: UserFiltersProps) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(current.campaignId ?? '');
  const [creativeId, setCreativeId] = useState(current.creativeId ?? '');
  const [creativeType, setCreativeType] = useState(current.creativeType ?? '');
  const [format, setFormat] = useState(current.format ?? '');
  const [subtype, setSubtype] = useState(current.subtype ?? '');
  const [deviceType, setDeviceType] = useState(current.deviceType ?? '');

  useEffect(() => {
    setCreativeId(current.creativeId ?? '');
  }, [current.creativeId]);
  const [isSuspicious, setIsSuspicious] = useState<string>(
    current.isSuspicious === true ? 'true' :
      current.isSuspicious === false ? 'false' : '',
  );
  const [ivtVerdict, setIvtVerdict] = useState(current.ivtVerdict ?? '');
  const [dateFrom, setDateFrom] = useState(current.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(current.dateTo ?? '');

  // Подтипы принадлежат конкретному формату: смена формата делает выбранный
  // подтип недопустимым, и фильтр вернул бы пустой результат
  const onFormatChange = useCallback((value: string) => {
    setFormat(value);
    setSubtype('');
  }, []);

  const subtypeOptions = format !== ''
    ? (FORMAT_SUBTYPE_OPTIONS[format] ?? [])
    : [];

  const applyFilters = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', '1');

    if (!lockCampaignId) {
      campaignId ? url.searchParams.set('campaignId', campaignId) : url.searchParams.delete('campaignId');
    }

    creativeId ? url.searchParams.set('creativeId', creativeId) : url.searchParams.delete('creativeId');
    creativeType ? url.searchParams.set('creativeType', creativeType) : url.searchParams.delete('creativeType');
    format ? url.searchParams.set('format', format) : url.searchParams.delete('format');
    subtype ? url.searchParams.set('subtype', subtype) : url.searchParams.delete('subtype');
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
    creativeType,
    format,
    subtype,
    deviceType,
    isSuspicious,
    ivtVerdict,
    dateFrom,
    dateTo,
  ]);

  const resetFilters = useCallback(() => {
    if (!lockCampaignId) setCampaignId('');
    setCreativeId('');
    setCreativeType('');
    setFormat('');
    setSubtype('');
    setDeviceType('');
    setIsSuspicious('');
    setIvtVerdict('');
    setDateFrom('');
    setDateTo('');

    const url = new URL(window.location.href);
    [
      'creativeId',
      'creativeType',
      'format',
      'subtype',
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

  const exitDomainView = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('domainView');
    url.searchParams.delete('publisherDomain');
    url.searchParams.delete('creativeId');
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }, [router]);

  const onDomainChange = useCallback((value: string) => {
    const url = new URL(window.location.href);
    value !== ''
      ? url.searchParams.set('publisherDomain', value)
      : url.searchParams.delete('publisherDomain');
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }, [router]);

  const campaignComboOptions = campaignOptions.map((value) => ({ value, label: value }));
  const creativeComboOptions = creativeOptions.map((value) => ({ value, label: value }));
  const domainComboOptions = domainOptions.map((v) => ({ value: v, label: v }));

  return (
    <div className={styles.filters}>
      {domainView && (
        <div className={styles.sessionContext}>
          <span className={styles.sessionContextLabel}>Площадка размещения</span>
          <div className={styles.sessionContextCombobox}>
            <Combobox
              options={domainComboOptions}
              value={current.publisherDomain ?? ''}
              onChange={onDomainChange}
              placeholder="Все площадки"
              allLabel="Все площадки"
            />
          </div>
          <button
            type="button"
            className={`${styles.sessionContextClear} ${styles.sessionContextClearEnd}`}
            onClick={exitDomainView}
          >
            Выйти из режима площадки ×
          </button>
        </div>
      )}
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
          <label className={styles.label}>Тип креатива</label>
          <Combobox
            options={CREATIVE_TYPE_OPTIONS}
            value={creativeType}
            onChange={setCreativeType}
            placeholder="Все"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Формат размещения</label>
          <Combobox
            options={FORMAT_OPTIONS}
            value={format}
            onChange={onFormatChange}
            placeholder="Все"
          />
        </div>

        {subtypeOptions.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>Тип размещения</label>
            <Combobox
              options={subtypeOptions}
              value={subtype}
              onChange={setSubtype}
              placeholder="Все"
            />
          </div>
        )}

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