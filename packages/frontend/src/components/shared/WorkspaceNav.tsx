'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/admin/LogoutButton';
import type { UserRole } from '@cpmind/shared';
import styles from '@/styles/workspace-nav.module.css';

const NAV_LINKS = [
    { href: '/campaigns', label: 'Кампании' },
    { href: '/creatives', label: 'Креативы' },
    { href: '/uploads', label: 'Загрузить' },
    { href: '/placements', label: 'Размещения' },
];

interface Props {
    role: UserRole;
}

export function WorkspaceNav({ role }: Props): React.ReactElement {
    const pathname = usePathname();

    const analyticsHref = role === 'admin' ? '/admin/users_panel' : '/user/panel';
    const analyticsLabel = role === 'admin' ? '← Аналитика' : '← Моя аналитика';

    return (
        <nav className={styles.nav} aria-label="Workspace навигация">
            <Link href="/campaigns" className={styles.logo}>
                CP<span className={styles.logoAccent}>Mind</span>
            </Link>

            <div className={styles.links}>
                {NAV_LINKS.map(({ href, label }) => {
                    const isActive = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`${styles.link} ${isActive ? styles.linkActive : ''}`}
                        >
                            {label}
                        </Link>
                    );
                })}
            </div>

            <div className={styles.right}>
                <Link href={analyticsHref} className={styles.backLink}>
                    {analyticsLabel}
                </Link>
                <div className={styles.divider} />
                <LogoutButton />
            </div>
        </nav>
    );
}