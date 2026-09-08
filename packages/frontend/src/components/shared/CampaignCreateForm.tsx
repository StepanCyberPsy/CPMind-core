'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign } from '@/lib/admin/api';
import styles from '@/styles/campaigns.module.css';

interface Props {
    onSuccess: () => void;
    onCancel: () => void;
}

export function CampaignCreateForm({ onSuccess, onCancel }: Props): React.ReactElement {
    const router = useRouter();
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed === '') return;

        setLoading(true);
        setError(null);

        try {
            await createCampaign(trimmed);
            router.refresh();
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания кампании');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.formWrapper}>
            <form onSubmit={(e) => { void handleSubmit(e); }}>
                <div className={styles.formRow}>
                    <div className={styles.formInput}>
                        <input
                            type="text"
                            placeholder="Название кампании"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={255}
                            disabled={loading}
                            aria-label="Название кампании"
                            autoFocus
                        />
                    </div>
                    <div className={styles.formActions}>
                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={loading || name.trim() === ''}
                        >
                            {loading ? 'Создание…' : 'Создать'}
                        </button>
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Отмена
                        </button>
                    </div>
                </div>
                {error !== null && (
                    <div className={styles.errorBox}>{error}</div>
                )}
            </form>
        </div>
    );
}