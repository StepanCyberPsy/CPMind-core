import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchImpressionById, fetchImpressions } from '@/lib/api';
import { ImpressionDetail } from '@/components/ImpressionDetail';
import styles from '@/styles/detail-page.module.css';

interface Props {
  params: { id: string };
}

export default async function ImpressionDetailPage({ params }: Props) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;

  const impression = await fetchImpressionById(params.id, cookieHeader);
  if (!impression) notFound();

  const siblingSegments = (
    await fetchImpressions(
      { sessionGroupId: impression.session_group_id, limit: 50 },
      cookieHeader,
    )
  ).items;

  const scoreClass =
    impression.score_final >= 70 ? styles.scorePositive :
      impression.score_final >= 40 ? styles.scoreModerate :
        styles.scoreNegative;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/impressions" className={styles.backBtn}>
          ← Назад
        </Link>

        <div className={styles.headerMeta}>
          <div className={styles.headerTitle}>Импрешен</div>
          <div className={styles.headerId}>{impression.impression_id}</div>
        </div>

        <div className={styles.headerScore}>
          <div className={styles.headerScoreLabel}>CPMind Score</div>
          <div className={`${styles.headerScoreValue} ${scoreClass}`}>
            {impression.score_final.toFixed(1)}
          </div>
        </div>
      </header>

      <ImpressionDetail impression={impression} siblingSegments={siblingSegments} />
    </div>
  );
}