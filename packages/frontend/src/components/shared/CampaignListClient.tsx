'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CampaignCreateForm } from './CampaignCreateForm';
import { CopyableText } from './CopyableText';
import {
    CREATIVE_TYPE_CARD_LABELS,
    CREATIVE_TYPE_KEYS,
    formatDateTime,
} from '@/lib/config';
import type { CampaignRow } from '@/lib/admin/api';
import styles from '@/styles/campaigns.module.css';

interface Props {
    campaigns: CampaignRow[];
    isAdmin: boolean;
}

export function CampaignListClient({ campaigns, isAdmin }: Props): React.ReactElement {
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const filtered = search.trim() === ''
        ? campaigns
        : campaigns.filter((c) =>
            c.name.toLowerCase().includes(search.trim().toLowerCase()),
        );

    return (
        <>
            <div className={styles.toolbar}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Поиск по названию"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Поиск по названию"
                />
                <button
                    type="button"
                    className={styles.createToggleBtn}
                    onClick={() => setShowCreate((v) => !v)}
                >
                    {showCreate ? '× Свернуть' : '+ Создать кампанию'}
                </button>
            </div>

            {showCreate && (
                <CampaignCreateForm
                    onSuccess={() => setShowCreate(false)}
                    onCancel={() => setShowCreate(false)}
                />
            )}

            {campaigns.length === 0 && (
                <div className={styles.empty}>
                    Нет активных кампаний. Создайте первую.
                </div>
            )}

            {campaigns.length > 0 && filtered.length === 0 && (
                <div className={styles.noResults}>
                    Нет кампаний с таким названием.
                </div>
            )}

            {filtered.length > 0 && (
                <div className={styles.grid}>
                    {filtered.map((campaign) => {
                        const counts = CREATIVE_TYPE_KEYS
                            .map((key) => ({
                                key,
                                label: CREATIVE_TYPE_CARD_LABELS[key] ?? key,
                                count: campaign.creativeCounts?.[key] ?? 0,
                            }))
                            .filter(({ count }) => count > 0);

                        const total = campaign.creativeCounts?.total ?? 0;

                        return (
                            <Link
                                key={campaign.uuid}
                                href={`/campaigns/${campaign.uuid}`}
                                className={styles.campaignCard}
                            >
                                <span className={styles.cardName}>{campaign.name}</span>

                                {isAdmin && (
                                    <div className={styles.cardUuid}>
                                        <CopyableText
                                            text={campaign.uuid}
                                            truncate
                                        />
                                    </div>
                                )}

                                <span className={styles.cardDate}>
                                    {formatDateTime(campaign.createdAt)}
                                </span>

                                {total === 0 ? (
                                    <div className={styles.noCreatives}>
                                        Нет креативов
                                    </div>
                                ) : (
                                    <div className={styles.cardCountsSection}>
                                        {counts.map(({ key, label, count }) => (
                                            <div key={key} className={styles.countRow}>
                                                <span className={styles.countLabel}>
                                                    {label}
                                                </span>
                                                <span className={styles.countValue}>
                                                    {count}
                                                </span>
                                            </div>
                                        ))}
                                        <div className={styles.countTotal}>
                                            <span>Всего</span>
                                            <span>{total}</span>
                                        </div>
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}
        </>
    );
}