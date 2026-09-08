'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UploadFlow } from '@/components/shared/UploadFlow';
import type { CampaignRow } from '@/lib/admin/api';

interface Props {
    campaign: CampaignRow;
}

export function UploadFlowClient({ campaign }: Props): React.ReactElement {
    return (
        <UploadFlow
            campaigns={[campaign]}
        />
    );
}