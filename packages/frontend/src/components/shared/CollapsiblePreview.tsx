'use client';

import { useState } from 'react';
import { CreativePreview } from './CreativePreview';
import type { AssetView } from '@/lib/admin/api';
import styles from '@/styles/creative-detail.module.css';

interface Props {
    creativeType: string;
    assets: AssetView[];
}

export function CollapsiblePreview({ creativeType, assets }: Props): React.ReactElement {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className={`${styles.section} ${styles.previewSection}`}>
            <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Превью</span>
                <button
                    type="button"
                    className={styles.collapseBtn}
                    onClick={() => setCollapsed((v) => !v)}
                    aria-expanded={!collapsed}
                >
                    {collapsed ? '▸ Показать' : '▾ Скрыть'}
                </button>
            </div>
            {!collapsed && (
                <div className={styles.previewContent}>
                    <CreativePreview
                        creativeType={creativeType}
                        assets={assets}
                    />
                </div>
            )}
        </div>
    );
}