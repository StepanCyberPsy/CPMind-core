import styles from '@/styles/creative-status-badge.module.css';

type CreativeStatus =
    | 'draft'
    | 'processing'
    | 'ready'
    | 'active'
    | 'archived'
    | 'failed'
    | 'created'
    | 'uploading'
    | 'uploaded'
    | 'expired';

interface Props {
    status: CreativeStatus | string;
}

function resolveVariant(status: string): { cls: string; label: string } {
    switch (status) {
        case 'ready':
        case 'active':
            return { cls: styles.ready!, label: 'Готов' };
        case 'processing':
        case 'uploaded':
            return { cls: styles.processing!, label: 'Обработка' };
        case 'failed':
            return { cls: styles.failed!, label: 'Ошибка' };
        case 'draft':
        case 'created':
            return { cls: styles.draft!, label: 'Черновик' };
        case 'uploading':
            return { cls: styles.uploading!, label: 'Загрузка' };
        case 'archived':
            return { cls: styles.archived!, label: 'Архив' };
        case 'expired':
            return { cls: styles.expired!, label: 'Истёк' };
        default:
            return { cls: styles.draft!, label: status };
    }
}

export function CreativeStatusBadge({ status }: Props): React.ReactElement {
    const { cls, label } = resolveVariant(status);
    return (
        <span className={`${styles.badge} ${cls}`}>
            <span className={styles.dot} aria-hidden="true" />
            {label}
        </span>
    );
}