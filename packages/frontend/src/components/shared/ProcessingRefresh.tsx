'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 5_000;

export function ProcessingRefresh(): null {
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(() => { router.refresh(); }, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [router]);

    return null;
}