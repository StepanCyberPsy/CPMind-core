import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
    fetchCreativeDetail,
    fetchCampaigns,
    fetchPlacements,
    fetchPlacementDetail,
} from '@/lib/admin/api';
import { CreativeStatusBadge } from '@/components/shared/CreativeStatusBadge';
import { CollapsiblePreview } from '@/components/shared/CollapsiblePreview';
import { InlinePlacementForm } from '@/components/shared/InlinePlacementForm';
import { CreativePlacementPanel } from '@/components/shared/CreativePlacementPanel';
import { ProcessingRefresh } from '@/components/shared/ProcessingRefresh';
import { CopyableText } from '@/components/shared/CopyableText';
import {
    formatCreativeType,
    formatDeliveryMode,
    formatDateTime,
} from '@/lib/config';
import styles from '@/styles/creative-detail.module.css';

export default async function CreativeDetailPage({
    params,
}: {
    params: { uuid: string };
}): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const [creative, allCampaigns, allPlacements] = await Promise.all([
        fetchCreativeDetail(params.uuid, cookieHeader),
        fetchCampaigns(cookieHeader),
        fetchPlacements(cookieHeader),
    ]);

    if (creative === null) notFound();

    const campaign = allCampaigns.find((c) => c.uuid === creative.campaignUuid);
    const existingPlacementItem = allPlacements.find((p) => p.creativeUuid === creative.uuid);

    const placementDetail = existingPlacementItem !== undefined
        ? await fetchPlacementDetail(existingPlacementItem.uuid, cookieHeader)
        : null;

    const latestVersion = creative.versions[0];
    const currentStatus = latestVersion?.status ?? creative.status;
    const isReady = currentStatus === 'ready';
    const isProcessing = currentStatus === 'processing';
    const isFailed = currentStatus === 'failed';
    const latestAssets = latestVersion?.assets ?? [];

    return (
        <div className={styles.page}>
            {isProcessing && <ProcessingRefresh />}

            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link
                        href={`/campaigns/${creative.campaignUuid}`}
                        className={styles.navLink}
                    >
                        ← {campaign?.name ?? 'Кампания'}
                    </Link>
                    <span className={styles.headerTitle}>{creative.name}</span>
                </div>
            </header>

            <div className={styles.content}>
                <div className={styles.mainGrid}>
                    {/* Левая колонка: параметры + размещение */}
                    <div className={styles.leftColumn}>

                        {/* Секция 1 — Статус и параметры */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>Статус и параметры</span>
                            </div>

                            <div className={styles.statusRow}>
                                <CreativeStatusBadge status={currentStatus} />
                                {isFailed &&
                                    latestVersion !== undefined &&
                                    latestVersion.processingError !== null && (
                                        <span className={styles.statusError}>
                                            {latestVersion.processingError}
                                        </span>
                                    )}
                            </div>

                            <div className={styles.metaGrid}>
                                <div className={styles.metaItem}>
                                    <span className={styles.metaLabel}>Тип</span>
                                    <span className={styles.metaValue}>
                                        {formatCreativeType(creative.creativeType)}
                                    </span>
                                </div>

                                {placementDetail !== null && (
                                    <div className={styles.metaItem}>
                                        <span className={styles.metaLabel}>Режим</span>
                                        <span className={styles.metaValue}>
                                            {formatDeliveryMode(placementDetail.mode)}
                                        </span>
                                    </div>
                                )}

                                {placementDetail !== null &&
                                    placementDetail.width !== null &&
                                    placementDetail.height !== null && (
                                        <div className={styles.metaItem}>
                                            <span className={styles.metaLabel}>Размер</span>
                                            <span className={styles.metaValue}>
                                                {placementDetail.width} × {placementDetail.height}
                                            </span>
                                        </div>
                                    )}

                                {placementDetail !== null && (
                                    <div className={styles.metaItem}>
                                        <span className={styles.metaLabel}>Delivery token</span>
                                        <span className={styles.metaMono}>
                                            <CopyableText
                                                text={placementDetail.deliveryToken}
                                                truncate
                                            />
                                        </span>
                                    </div>
                                )}

                                <div className={styles.metaItem}>
                                    <span className={styles.metaLabel}>Загружен</span>
                                    <span className={styles.metaValue}>
                                        {formatDateTime(creative.createdAt)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Секция 3 — Размещение */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>Размещение</span>
                            </div>

                            {isProcessing && (
                                <p className={styles.processingMessage}>
                                    Файл обрабатывается. Страница обновится автоматически.
                                </p>
                            )}

                            {isFailed && (
                                <>
                                    <p className={styles.errorMessage}>
                                        Обработка завершилась с ошибкой. Загрузите файл повторно.
                                    </p>
                                    <Link
                                        href={`/campaigns/${creative.campaignUuid}/upload`}
                                        className={styles.errorLink}
                                    >
                                        Загрузить снова →
                                    </Link>
                                </>
                            )}

                            {isReady && placementDetail === null && (
                                <InlinePlacementForm creative={creative} />
                            )}

                            {isReady && placementDetail !== null && (
                                <CreativePlacementPanel placement={placementDetail} />
                            )}
                        </div>
                    </div>

                    {/* Правая колонка: превью с коллапсом */}
                    <CollapsiblePreview
                        creativeType={creative.creativeType}
                        assets={latestAssets}
                    />
                </div>
            </div>
        </div>
    );
}