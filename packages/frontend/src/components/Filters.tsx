'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ListParams } from '@/lib/api';

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  backgroundColor: '#0f1117',
  border: '1px solid #2d3748',
  borderRadius: '6px',
  color: '#e2e8f0',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: '#718096',
  marginBottom: '4px',
  fontWeight: '500',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const buttonStyle: React.CSSProperties = {
  padding: '7px 16px',
  backgroundColor: '#00ff88',
  color: '#0f1117',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  backgroundColor: 'transparent',
  color: '#718096',
  border: '1px solid #2d3748',
  borderRadius: '6px',
  fontSize: '13px',
  cursor: 'pointer',
};

interface Props {
  current: ListParams;
}

export function Filters({ current }: Props) {
  const router = useRouter();
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

    campaignId ? url.searchParams.set('campaignId', campaignId) : url.searchParams.delete('campaignId');
    creativeId ? url.searchParams.set('creativeId', creativeId) : url.searchParams.delete('creativeId');
    deviceType ? url.searchParams.set('deviceType', deviceType) : url.searchParams.delete('deviceType');
    isSuspicious ? url.searchParams.set('isSuspicious', isSuspicious) : url.searchParams.delete('isSuspicious');
    dateFrom ? url.searchParams.set('dateFrom', dateFrom) : url.searchParams.delete('dateFrom');
    dateTo ? url.searchParams.set('dateTo', dateTo) : url.searchParams.delete('dateTo');

    router.push(url.pathname + url.search);
  }, [router, campaignId, creativeId, deviceType, isSuspicious, dateFrom, dateTo]);

  const resetFilters = useCallback(() => {
    setCampaignId('');
    setCreativeId('');
    setDeviceType('');
    setIsSuspicious('');
    setDateFrom('');
    setDateTo('');

    const url = new URL(window.location.href);
    url.searchParams.delete('campaignId');
    url.searchParams.delete('creativeId');
    url.searchParams.delete('deviceType');
    url.searchParams.delete('isSuspicious');
    url.searchParams.delete('dateFrom');
    url.searchParams.delete('dateTo');
    url.searchParams.set('page', '1');

    router.push(url.pathname + url.search);
  }, [router]);

  return (
    <div style={{
      backgroundColor: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: '10px',
      padding: '16px 20px',
      marginBottom: '16px',
    }}>
      {/* Сетка фильтров */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '14px',
      }}>

        {/* campaign_id */}
        <div>
          <label style={labelStyle}>Campaign ID</label>
          <input
            type="text"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="camp_123"
            style={inputStyle}
          />
        </div>

        {/* creative_id */}
        <div>
          <label style={labelStyle}>Creative ID</label>
          <input
            type="text"
            value={creativeId}
            onChange={(e) => setCreativeId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="creat_456"
            style={inputStyle}
          />
        </div>

        {/* device_type */}
        <div>
          <label style={labelStyle}>Устройство</label>
          <select
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Все</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>

        {/* is_suspicious */}
        <div>
          <label style={labelStyle}>Подозрительные</label>
          <select
            value={isSuspicious}
            onChange={(e) => setIsSuspicious(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Все</option>
            <option value="false">Только чистые</option>
            <option value="true">Только подозрительные</option>
          </select>
        </div>

        {/* dateFrom */}
        <div>
          <label style={labelStyle}>Дата с</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ ...inputStyle, colorScheme: 'dark' }}
          />
        </div>

        {/* dateTo */}
        <div>
          <label style={labelStyle}>Дата по</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ ...inputStyle, colorScheme: 'dark' }}
          />
        </div>

      </div>

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={resetFilters} style={resetButtonStyle}>
          Сбросить
        </button>
        <button onClick={applyFilters} style={buttonStyle}>
          Применить
        </button>
      </div>
    </div>
  );
}