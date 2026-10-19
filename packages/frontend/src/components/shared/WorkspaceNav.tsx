import Link from 'next/link';
import type { UserRole } from '@cpmind/shared';
import styles from '@/styles/workspace-nav.module.css';

interface Props {
    role: UserRole;
}

export function WorkspaceNav({ role }: Props): React.ReactElement {
    const analyticsHref = role === 'admin' ? '/admin/users_panel' : '/user/impressions';
    const analyticsLabel = role === 'admin' ? '← К пользователям' : '← Импрешены';

    return (
        <nav className={styles.nav} aria-label="Workspace навигация">
            <Link href="/campaigns" className={styles.logo}>
                CP<span className={styles.logoAccent}>Mind</span>
            </Link>
            <div className={styles.right}>
                <Link href={analyticsHref} className={styles.backLink}>
                    {analyticsLabel}
                </Link>
            </div>
        </nav>
    );
}
