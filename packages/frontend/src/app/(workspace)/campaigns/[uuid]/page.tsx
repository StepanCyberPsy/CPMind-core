import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchCampaigns, fetchCreatives, fetchPlacements } from '@/lib/admin/api';
import { CreativeStatusBadge } from '@/components/shared/CreativeStatusBadge';
import { CreativeActivityBadge } from '@/components/shared/CreativeActivityBadge';
import { formatDateTime, formatCreativeType } from '@/lib/config';
import campaignStyles from '@/styles/campaigns.module.css';
import creativeStyles from '@/styles/creatives.module.css';

export default async function CampaignDetailPage({
    params,
}: {
    params: { uuid: string };
}): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const [allCampaigns, allCreatives, allPlacements] = await Promise.all([
        fetchCampaigns(cookieHeader),
        fetchCreatives(cookieHeader),
        fetchPlacements(cookieHeader),
    ]);

    const campaign = allCampaigns.find((c) => c.uuid === params.uuid);
    if (campaign === undefined) notFound();

    const creatives = allCreatives.filter((c) => c.campaignUuid === params.uuid);
    const activityByCreative = new Map<string, boolean>();
    // Тот же первый плейсмент, который выбирается в детальной карточке креатива.
    for (const placement of allPlacements) {
        if (!activityByCreative.has(placement.creativeUuid)) {
            activityByCreative.set(placement.creativeUuid, placement.isActive);
        }
    }

    return (
        <div className={campaignStyles.page}>
            <header className={campaignStyles.header}>
                <div className={campaignStyles.headerLeft}>
                    <Link href="/campaigns" className={campaignStyles.navLink}>
                        ← Кампании
                    </Link>
                    <span className={campaignStyles.headerTitle}>{campaign.name}</span>
                </div>
                <Link
                    href={`/campaigns/${params.uuid}/upload`}
                    className={campaignStyles.primaryLink}
                >
                    + Загрузить креатив
                </Link>
            </header>

            <div className={campaignStyles.content}>
                {creatives.length === 0 ? (
                    <div className={campaignStyles.empty}>
                        <div>Нет загруженных креативов.</div>
                        <div className={campaignStyles.emptyHint}>
                            <Link
                                href={`/campaigns/${params.uuid}/upload`}
                                className={campaignStyles.navLink}
                            >
                                Загрузите первый файл →
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className={creativeStyles.list}>
                        {creatives.map((c) => (
                            <Link
                                key={c.uuid}
                                href={`/creatives/${c.uuid}`}
                                className={creativeStyles.card}
                            >
                                <div className={creativeStyles.cardMain}>
                                    <span className={creativeStyles.cardName}>{c.name}</span>
                                    <span className={creativeStyles.cardType}>
                                        {formatCreativeType(c.creativeType)}
                                    </span>
                                </div>
                                <div className={`${creativeStyles.cardRight} ${creativeStyles.campaignCardRight}`}>
                                    <span className={creativeStyles.cardDate}>
                                        {formatDateTime(c.createdAt)}
                                    </span>
                                    <CreativeStatusBadge status={c.status} />
                                    <CreativeActivityBadge isActive={activityByCreative.get(c.uuid)} />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
