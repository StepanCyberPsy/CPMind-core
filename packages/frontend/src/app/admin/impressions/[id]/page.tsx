import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchImpressionById, fetchImpressions } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { ImpressionDetail } from '@/components/admin/ImpressionDetail';
import styles from '@/styles/detail-page.module.css';

interface Props {
  params: { id: string };
  searchParams: { userUuid?: string; back?: string };
}

export default async function ImpressionDetailPage({ params, searchParams }: Props) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;

  const backHref = searchParams.back
    ? decodeURIComponent(searchParams.back)
    : ownUuid !== null
      ? `/admin/impressions?userUuid=${ownUuid}`
      : '/admin/impressions';

  const impression = await fetchImpressionById(params.id, cookieHeader);
  if (!impression) notFound();

  const siblingSegments = (
    await fetchImpressions(
      { sessionGroupId: impression.session_group_id, limit: 50 },
      cookieHeader,
    )
  ).items;

  const scoreValue = impression.score_final;

  const scoreClass =
    scoreValue === null ? styles.scoreNegative :
      scoreValue >= 70 ? styles.scorePositive :
        scoreValue >= 40 ? styles.scoreModerate :
          styles.scoreNegative;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.backBtn}>
          ← Назад
        </Link>

        <div className={styles.headerMeta}>
          <div className={styles.headerTitle}>Импрешен</div>
          <div className={styles.headerId}>{impression.impression_id}</div>
        </div>

        <div className={styles.headerScore}>
          <div className={styles.headerScoreLabel}>CPMind Score</div>
          <div className={`${styles.headerScoreValue} ${scoreClass}`}>
            {scoreValue !== null ? scoreValue.toFixed(1) : '—'}
          </div>
        </div>
      </header>

      <ImpressionDetail impression={impression} siblingSegments={siblingSegments} />
    </div>
  );
}