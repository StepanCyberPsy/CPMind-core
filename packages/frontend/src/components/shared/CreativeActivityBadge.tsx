import styles from '@/styles/creative-status-badge.module.css';

interface Props {
    isActive: boolean | undefined;
}

export function CreativeActivityBadge({ isActive }: Props): React.ReactElement | null {
    if (isActive === undefined) return null;

    return (
        <span className={`${styles.badge} ${isActive ? styles.ready : styles.archived}`}>
            <span className={styles.dot} aria-hidden="true" />
            {isActive ? 'Активно' : 'Неактивно'}
        </span>
    );
}
