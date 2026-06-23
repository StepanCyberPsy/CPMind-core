'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ListParams } from '@/lib/api';
import styles from '@/styles/filters.module.css';

interface Props {
  current: ListParams;
}

export function Filters({ current }: Props) {
  const router = useRouter();
  const [sessionGroupId, setSessionGroupId] = useState(current.sessionGroupId ?? '');
  const [campaignId, setCampaignId] = useState(current.campaignId ?? '');
  const [creativeId, setCreativeId] = useState(current.creativeId ?? '');
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
    sessionGroupId ? url.searchParams.set('sessionGroupId', sessionGroupId) : url.searchParams.delete('sessionGroupId');
    campaignId ? url.searchParams.set('campaignId', campaignId) : url.searchParams.delete('campaignId');
    creativeId ? url.searchParams.set('creativeId', creativeId) : url.searchParams.delete('creativeId');
    deviceType ? url.searchParams.set('deviceType', deviceType) : url.searchParams.delete('deviceType');
    isSuspicious ? url.searchParams.set('isSuspicious', isSuspicious) : url.searchParams.delete('isSuspicious');
    dateFrom ? url.searchParams.set('dateFrom', dateFrom) : url.searchParams.delete('dateFrom');
    dateTo ? url.searchParams.set('dateTo', dateTo) : url.searchParams.delete('dateTo');
    router.push(url.pathname + url.search);
  }, [router, sessionGroupId, campaignId, creativeId, deviceType, isSuspicious, dateFrom, dateTo]);

  const exitSegmentView = useCallback(() => {
    setSessionGroupId('');
    const url = new URL(window.location.href);
    url.searchParams.delete('sessionGroupId');
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }, [router]);

  const resetFilters = useCallback(() => {
    setSessionGroupId('');
    setCampaignId('');
    setCreativeId('');
    setDeviceType('');
    setIsSuspicious('');
    setDateFrom('');
    setDateTo('');
    const url = new URL(window.location.href);
    ['sessionGroupId', 'campaignId', 'creativeId', 'deviceType', 'isSuspicious', 'dateFrom', 'dateTo'].forEach(k =>
      url.searchParams.delete(k),
    );
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }, [router]);

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
          <label className={styles.label}>Session Group ID</label>
          <input
            type="text"
            value={sessionGroupId}
            onChange={(e) => setSessionGroupId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="uuid сессии показа"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Campaign ID</label>
          <input
            type="text"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="camp_123"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Creative ID</label>
          <input
            type="text"
            value={creativeId}
            onChange={(e) => setCreativeId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="creat_456"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Устройство</label>
          <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>
            <option value="">Все</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Подозрительные</label>
          <select value={isSuspicious} onChange={(e) => setIsSuspicious(e.target.value)}>
            <option value="">Все</option>
            <option value="false">Только чистые</option>
            <option value="true">Только подозрительные</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Дата с</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Дата по</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
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