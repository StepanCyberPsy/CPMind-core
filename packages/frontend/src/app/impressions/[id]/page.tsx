import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchImpressionById } from '@/lib/api';
import { ImpressionDetail } from '@/components/ImpressionDetail';

interface Props {
  params: { id: string };
}

export default async function ImpressionDetailPage({ params }: Props) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;

  const impression = await fetchImpressionById(params.id, cookieHeader);

  if (!impression) notFound();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117' }}>

      {/* Шапка */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 24px',
        backgroundColor: '#1a1f2e',
        borderBottom: '1px solid #2d3748',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link
          href="/impressions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#718096',
            textDecoration: 'none',
            fontSize: '13px',
            padding: '6px 12px',
            backgroundColor: '#0f1117',
            borderRadius: '6px',
            border: '1px solid #2d3748',
          }}
        >
          ← Назад
        </Link>

        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: '700',
            color: '#e2e8f0',
          }}>
            Импрешен
          </div>
          <div style={{
            fontSize: '11px',
            color: '#718096',
            fontFamily: 'monospace',
            marginTop: '2px',
          }}>
            {impression.impression_id}
          </div>
        </div>

        {/* Score в шапке */}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: '#718096', marginBottom: '2px' }}>
            CPMind Score
          </div>
          <div style={{
            fontSize: '22px',
            fontWeight: '800',
            color: impression.score_final >= 70 ? '#00ff88' :
              impression.score_final >= 40 ? '#f6ad55' : '#fc8181',
          }}>
            {impression.score_final.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Детальный вид */}
      <ImpressionDetail impression={impression} />

    </div>
  );
}