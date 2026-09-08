'use client';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import styles from '@/styles/copyable-text.module.css';

interface Props {
    text: string;
    truncate?: boolean;
}

export function CopyableText({ text, truncate = false }: Props): React.ReactElement {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCopy = useCallback((e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 1_500);
        });
    }, [text]);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    const displayText = truncate ? `${text.slice(0, 8)}…` : text;

    return (
        <button
            type="button"
            className={styles.root}
            onClick={handleCopy}
            title={copied ? 'Скопировано' : `Копировать: ${text}`}
            aria-label={copied ? 'Скопировано' : `Копировать ${text}`}
        >
            <span className={styles.text}>{displayText}</span>
            <span className={copied ? styles.iconCopied : styles.icon}>
                {copied ? '✓' : '⧉'}
            </span>
        </button>
    );
}