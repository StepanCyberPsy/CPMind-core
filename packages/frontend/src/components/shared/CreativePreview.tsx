'use client';

import { BANNER_CREATIVE_TYPES } from '@/lib/config';
import type { AssetView } from '@/lib/admin/api';
import styles from '@/styles/creative-preview.module.css';

interface Props {
    creativeType: string;
    assets: AssetView[];

    // Адрес стороннего VAST-тега, если креатив задан тегом, а не файлом
    externalVastUrl?: string | null;
}

export function CreativePreview({
    creativeType,
    assets,
    externalVastUrl = null,
}: Props): React.ReactElement {
    // Креатив из стороннего тега не имеет ассетов и никогда их не получит:
    // ролик отдаёт адсервер клиента в момент показа. Общая ветка приняла бы
    // отсутствие ассета за незавершённую обработку
    if (externalVastUrl !== null) {
        return (
            <div className={styles.root}>
                <div className={styles.placeholder}>
                    <span className={styles.placeholderIcon}>▶</span>
                    <span className={styles.placeholderText}>
                        Внешний VAST-тег
                    </span>
                    <span className={styles.placeholderHint}>
                        Ролик отдаёт сторонний адсервер в момент показа,
                        поэтому превью недоступно
                    </span>
                    <code className={styles.placeholderUrl}>{externalVastUrl}</code>
                </div>
            </div>
        );
    }

    if (creativeType === 'video_creative') {
        const sourceAsset = assets.find((a) => a.role === 'source');
        const posterAsset = assets.find((a) => a.role === 'poster');

        if (sourceAsset === undefined) {
            return (
                <div className={styles.root}>
                    <div className={styles.placeholder}>
                        <span className={styles.placeholderIcon}>▶</span>
                        <span className={styles.placeholderText}>
                            Видео обрабатывается
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.root}>
                <video
                    className={styles.video}
                    controls
                    playsInline
                    preload="metadata"
                    poster={posterAsset?.cdnUrl}
                >
                    <source src={sourceAsset.cdnUrl} type={sourceAsset.mimeType} />
                </video>
            </div>
        );
    }

    if (BANNER_CREATIVE_TYPES.has(creativeType)) {
        if (creativeType === 'banner_html5') {
            const bundleAsset = assets.find((a) => a.role === 'source');

            if (bundleAsset === undefined) {
                return (
                    <div className={styles.root}>
                        <div className={styles.placeholder}>
                            <span className={styles.placeholderIcon}>{'</>'}</span>
                            <span className={styles.placeholderText}>
                                HTML5-баннер обрабатывается
                            </span>
                        </div>
                    </div>
                );
            }

            return (
                <div className={styles.root}>
                    <iframe
                        className={styles.iframe}
                        src={bundleAsset.cdnUrl}
                        sandbox="allow-scripts"
                        title="Превью HTML5-креатива"
                        loading="lazy"
                    />
                </div>
            );
        }

        const sourceAsset = assets.find((a) => a.role === 'source');

        if (sourceAsset === undefined) {
            return (
                <div className={styles.root}>
                    <div className={styles.placeholder}>
                        <span className={styles.placeholderText}>
                            Изображение обрабатывается
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.root}>
                <img
                    className={styles.image}
                    src={sourceAsset.cdnUrl}
                    alt="Превью креатива"
                />
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <div className={styles.placeholder}>
                <span className={styles.placeholderText}>Превью недоступно</span>
            </div>
        </div>
    );
}