import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchPlacementDetail } from '@/lib/admin/api';
import { CreativeStatusBadge } from '@/components/shared/CreativeStatusBadge';
import {
    formatPlacement,
    formatStickyCorner,
    formatRotationMode,
    formatDomainEnforcement,
    formatAutoplayMode,
} from '@/lib/config';
import { PlacementActions } from './PlacementActions';
import styles from '@/styles/placement-detail.module.css';

export default async function PlacementDetailPage({
    params,
}: {
    params: { uuid: string };
}): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const placement = await fetchPlacementDetail(params.uuid, cookieHeader);
    if (placement === null) notFound();

    const isReady = placement.currentVersionStatus === 'ready';
    const isVideo = placement.format === 'instream' || placement.format === 'outstream';
    const isSticky = placement.subtype === 'sticky';
    const hasCreativeSet = placement.creativeSet.length > 0;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/placements" className={styles.navLink}>
                        ← Размещения
                    </Link>
                    <span className={styles.headerTitle}>
                        {placement.creativeName}
                    </span>
                </div>
            </header>

            <div className={styles.content}>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Статус</div>
                    <div className={styles.statusRow}>
                        <CreativeStatusBadge
                            status={placement.currentVersionStatus ?? 'draft'}
                        />
                        {placement.currentVersionError !== null && (
                            <span className={styles.errorText}>
                                {placement.currentVersionError}
                            </span>
                        )}
                    </div>
                    {!isReady && (
                        <div className={styles.processingNote}>
                            Embed-код будет доступен после завершения обработки файла.
                        </div>
                    )}
                </div>

                <div className={styles.card}>
                    <div className={styles.cardTitle}>Параметры</div>
                    <div className={styles.metaGrid}>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Размещение</span>
                            <span className={styles.metaValue}>
                                {formatPlacement(placement.format, placement.subtype)}
                            </span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Тип creative</span>
                            <span className={styles.metaValue}>{placement.creativeType}</span>
                        </div>

                        {isVideo && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Звук при старте</span>
                                <span className={styles.metaValue}>
                                    {placement.initialMuted ? 'Без звука' : 'Со звуком'}
                                    {!placement.initialMutedOverridden && (
                                        <span className={styles.metaNote}> — по умолчанию</span>
                                    )}
                                </span>
                            </div>
                        )}

                        {placement.format === 'outstream' && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Запуск ролика</span>
                                <span className={styles.metaValue}>
                                    {formatAutoplayMode(placement.autoplayMode)}
                                </span>
                            </div>
                        )}

                        {placement.format === 'instream' && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Пропуск</span>
                                <span className={styles.metaValue}>
                                    {placement.skippable
                                        ? `Через ${placement.skipOffsetSec ?? 0} с`
                                        : 'Недоступен'}
                                </span>
                            </div>
                        )}

                        {placement.width !== null && placement.height !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Размер</span>
                                <span className={styles.metaValue}>
                                    {placement.width} × {placement.height}
                                </span>
                            </div>
                        )}

                        {isSticky && (
                            <>
                                <div className={styles.metaItem}>
                                    <span className={styles.metaLabel}>Угол привязки</span>
                                    <span className={styles.metaValue}>
                                        {formatStickyCorner(placement.stickyCorner)}
                                    </span>
                                </div>
                                <div className={styles.metaItem}>
                                    <span className={styles.metaLabel}>Отступы</span>
                                    <span className={styles.metaValue}>
                                        {placement.stickyOffsetX ?? 0} × {placement.stickyOffsetY ?? 0} px
                                    </span>
                                </div>
                                <div className={styles.metaItem}>
                                    <span className={styles.metaLabel}>Размер поверхности</span>
                                    <span className={styles.metaValue}>
                                        {placement.stickyWidth ?? 0} × {placement.stickyHeight ?? 0} px
                                    </span>
                                </div>
                            </>
                        )}

                        {placement.slotId !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>ID слота</span>
                                <span className={styles.metaMono}>{placement.slotId}</span>
                            </div>
                        )}
                        {placement.videoSelector !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Селектор видео</span>
                                <span className={styles.metaMono}>{placement.videoSelector}</span>
                            </div>
                        )}

                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Домен площадки</span>
                            <span className={styles.metaValue}>
                                {placement.publisherDomain ?? 'Определяется автоматически'}
                            </span>
                        </div>

                        {placement.allowedDomains !== null && placement.allowedDomains.length > 0 && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Разрешённые домены</span>
                                <span className={styles.metaValue}>
                                    {placement.allowedDomains.join(', ')}
                                    <span className={styles.metaNote}>
                                        {' — '}{formatDomainEnforcement(placement.domainEnforcement)}
                                    </span>
                                </span>
                            </div>
                        )}

                        {placement.tagConstantsVersion !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Версия констант</span>
                                <span className={styles.metaMono}>{placement.tagConstantsVersion}</span>
                            </div>
                        )}

                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Delivery token</span>
                            <span className={styles.metaMono}>{placement.deliveryToken}</span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Создан</span>
                            <span className={styles.metaValue}>
                                {new Date(placement.createdAt).toLocaleDateString('ru-RU')}
                            </span>
                        </div>
                    </div>
                </div>

                {hasCreativeSet && (
                    <div className={styles.card}>
                        <div className={styles.cardTitle}>
                            Набор роликов · {formatRotationMode(placement.rotationMode)}
                        </div>
                        <div className={styles.setList}>
                            {placement.creativeSet.map((item) => (
                                <div key={item.creativeUuid} className={styles.setRow}>
                                    <span className={styles.setOrder}>{item.displayOrder + 1}</span>
                                    <span className={styles.setName}>{item.creativeName}</span>
                                    <span className={styles.setWeight}>{item.weightPct}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <PlacementActions placement={placement} />
            </div>
        </div>
    );
}