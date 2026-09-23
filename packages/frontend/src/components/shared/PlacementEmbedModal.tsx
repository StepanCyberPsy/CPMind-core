'use client';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import type { PlacementDetail } from '@/lib/admin/api';
import styles from '@/styles/placement-embed-modal.module.css';

interface CopyButtonProps {
    text: string;
}

function CopyButton({ text }: CopyButtonProps): React.ReactElement {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCopy = useCallback((): void => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 2000);
        });
    }, [text]);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    return (
        <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
            onClick={handleCopy}
            aria-label="Скопировать код"
        >
            {copied ? '✓ Скопировано' : 'Копировать'}
        </button>
    );
}

interface CodeBlockProps {
    code: string;
}

function CodeBlock({ code }: CodeBlockProps): React.ReactElement {
    return (
        <div className={styles.codeWrap}>
            <pre className={styles.code}>{code}</pre>
            <CopyButton text={code} />
        </div>
    );
}

interface Props {
    placement: PlacementDetail;
    onClose: () => void;
}

export function PlacementEmbedModal({ placement, onClose }: Props): React.ReactElement {
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Формат — источник истины: прежняя модель не различает sticky и pause-roll
    const isVideo = placement.format === 'instream' || placement.format === 'outstream';
    const isInstream = placement.format === 'instream';
    const isSticky = placement.subtype === 'sticky';

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Close on overlay click
    const onOverlayClick = (e: React.MouseEvent): void => {
        if (e.target === overlayRef.current) onClose();
    };

    const embedCode = placement.embedCode;
    const vastUrl = placement.vastUrl;
    const isReady = placement.currentVersionStatus === 'ready';

    if (!isReady || embedCode === null) {
        return (
            <div className={styles.overlay} ref={overlayRef} onClick={onOverlayClick}>
                <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Код размещения">
                    <div className={styles.header}>
                        <span className={styles.title}>Код размещения</span>
                        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">×</button>
                    </div>
                    <div className={styles.body}>
                        <div className={styles.warning}>
                            <span className={styles.warningIcon}>⚠</span>
                            <span>
                                Creative ещё не готов. Embed-код будет доступен после завершения обработки.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay} ref={overlayRef} onClick={onOverlayClick}>
            <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Код размещения">
                <div className={styles.header}>
                    <span className={styles.title}>Код размещения</span>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.block}>
                        <span className={styles.blockTitle}>Embed-код</span>
                        <span className={styles.blockDesc}>
                            {isInstream
                                ? placement.videoSelector !== null
                                    ? `Вставьте в любое место страницы. Реклама привязывается к видео, попадающим под селектор ${placement.videoSelector}.`
                                    : 'Вставьте в любое место страницы. Реклама привязывается ко всем видео на странице.'
                                : isSticky
                                    ? 'Вставьте в любое место страницы. Ролик закрепляется в углу окна и не занимает места в разметке.'
                                    : placement.slotId !== null
                                        ? 'Разместите div в нужном месте страницы, скрипт — в любом месте после него.'
                                        : 'Вставьте в HTML-код страницы. Креатив добавляется в конец страницы.'}
                        </span>
                        <CodeBlock code={embedCode} />
                    </div>

                    {isVideo && vastUrl !== null && (
                        <>
                            <div className={styles.divider} />
                            <div className={styles.block}>
                                <span className={styles.blockTitle}>VAST URL</span>
                                <div className={styles.warning}>
                                    <span className={styles.warningIcon}>⚠</span>
                                    <span>
                                        VAST-режим предоставляет только базовое отслеживание.
                                        Сигналы S1–S7 и CPMind Score недоступны.
                                        Используйте embed-код выше для полного измерения.
                                    </span>
                                </div>
                                <CodeBlock code={vastUrl} />
                            </div>
                        </>
                    )}

                    <div className={styles.divider} />

                    <button
                        type="button"
                        className={styles.diagnosticsToggle}
                        onClick={() => setShowDiagnostics((v) => !v)}
                        aria-expanded={showDiagnostics}
                    >
                        <span>{showDiagnostics ? '▾' : '▸'}</span>
                        <span>Диагностика и прямые ссылки</span>
                    </button>

                    {showDiagnostics && (
                        <div className={styles.diagnosticsSection}>
                            <div className={styles.warning}>
                                <span className={styles.warningIcon}>⚠</span>
                                <span>
                                    Прямые ссылки на файлы не запускают CPMind measurement.
                                    Используйте только для диагностики и проверки контента.
                                </span>
                            </div>
                            <div className={styles.block}>
                                <span className={styles.blockTitle}>Delivery token</span>
                                <CodeBlock code={placement.deliveryToken} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}