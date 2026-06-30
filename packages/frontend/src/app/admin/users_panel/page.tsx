import { cookies } from 'next/headers';
import { fetchUsersStats } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { UsersPanelTable } from '@/components/admin/UsersPanelTable';
import styles from '@/styles/users_panel.module.css';

export default async function UsersPanelPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const currentUserUuid = token ? decodeTokenUuid(token) : null;

  const users = await fetchUsersStats(cookieHeader);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          CP<span className={styles.logoAccent}>Mind</span>
        </div>
        <div className={styles.headerCenter}>
          Пользователи:{' '}
          <span className={styles.headerCount}>{users.length}</span>
        </div>
      </header>

      <div className={styles.content}>
        <UsersPanelTable initialUsers={users} currentUserUuid={currentUserUuid ?? ''} />
      </div>
    </div>
  );
}