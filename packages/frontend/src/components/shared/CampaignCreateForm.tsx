'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign } from '@/lib/admin/api';
import styles from '@/styles/campaigns.module.css';

export function CampaignCreateForm(): React.ReactElement {
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
            setName('');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания кампании');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {error !== null && (
                <div className={styles.errorBox}>{error}</div>
            )}
            <form onSubmit={(e) => { void handleSubmit(e); }} className={styles.createForm}>
                <input
                    className={styles.createInput}
                    type="text"
                    placeholder="Название кампании"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={255}
                    disabled={loading}
                    aria-label="Название кампании"
                />
                <button
                    type="submit"
                    className={styles.createBtn}
                    disabled={loading || name.trim() === ''}
                >
                    {loading ? 'Создание…' : 'Создать'}
                </button>
            </form>
        </>
    );
}