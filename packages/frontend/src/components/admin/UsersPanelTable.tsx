'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { UserStatsRow } from '@cpmind/shared';
import { UserActionsMenu } from './UserActionsMenu';
import { CreateUserForm } from './CreateUserForm';
import styles from '@/styles/users_panel.module.css';

interface Props {
  initialUsers: UserStatsRow[];
  currentUserUuid: string;
}

type SortColumn = 'campaigns' | 'creatives' | 'impressions' | 'avgScore';

interface SortState {
  column: SortColumn;
  dir: 'asc' | 'desc';
}

function getSortValue(user: UserStatsRow, column: SortColumn): number | null {
  if (column === 'campaigns') return user.campaignsCount;
  if (column === 'creatives') return user.creativesCount;
  if (column === 'impressions') return user.impressionsCount;
  return user.avgScore;
}

function compareUsers(a: UserStatsRow, b: UserStatsRow, sort: SortState): number {
  const aValue = getSortValue(a, sort.column);
  const bValue = getSortValue(b, sort.column);

  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  const diff = aValue - bValue;
  return sort.dir === 'asc' ? diff : -diff;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}

function SortableHeader({ label, column, sort, onSort }: SortableHeaderProps) {
  const isActive = sort.column === column;
  return (
    <th className={`${styles.th} ${styles.thSortable}`} onClick={() => onSort(column)}>
      {label}
      <span className={`${styles.sortIcon} ${isActive ? styles.sortIconActive : ''}`}>
        {isActive ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  );
}

interface CopyableUuidProps {
  uuid: string;
}

function CopyableUuid({ uuid }: CopyableUuidProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event: React.MouseEvent): Promise<void> {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(uuid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API недоступен (например, без HTTPS-контекста) — кнопка остаётся доступной для повторной попытки
    }
  }

  return (
    <div className={styles.uuidCell}>
      <span className={styles.uuidText} title={uuid}>{uuid}</span>
      <button type="button" className={styles.copyBtn} onClick={handleCopy} aria-label="Скопировать UUID">
        {copied ? '✓' : '📋'}
      </button>
    </div>
  );
}

export function UsersPanelTable({ initialUsers, currentUserUuid }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>({ column: 'campaigns', dir: 'desc' });

  function handleSort(column: SortColumn): void {
    setSort((prev) => prev.column === column
      ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { column, dir: 'desc' });
  }

  function onLoginClick(userUuid: string): void {
    router.push(`/admin/impressions?userUuid=${userUuid}`);
  }

  function onAllImpressionsClick(): void {
    router.push('/admin/impressions');
  }

  const sortedRows = useMemo(() => {
    const admins = initialUsers.filter((u) => u.role === 'admin');
    const regularUsers = initialUsers.filter((u) => u.role === 'user');
    const sortedUsers = [...regularUsers].sort((a, b) => compareUsers(a, b, sort));
    return [...admins, ...sortedUsers];
  }, [initialUsers, sort]);

  return (
    <>
      <div className={styles.toolbar}>
        <CreateUserForm />
      </div>

      <div className={styles.wrapper}>
        <button type="button" className={styles.allImpressionsRow} onClick={onAllImpressionsClick}>
          <span className={styles.allImpressionsLabel}>Все импрешены</span>
          <span className={styles.allImpressionsArrow}>→</span>
        </button>

        <div className={styles.scrollContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Дата</th>
                <th className={styles.th}>Логин пользователя</th>
                <th className={styles.th}>UUID пользователя</th>
                <th className={styles.th}>Tag UUID</th>
                <SortableHeader label="Кампании" column="campaigns" sort={sort} onSort={handleSort} />
                <SortableHeader label="Креативы" column="creatives" sort={sort} onSort={handleSort} />
                <SortableHeader label="Импрешены" column="impressions" sort={sort} onSort={handleSort} />
                <SortableHeader label="Средний Score" column="avgScore" sort={sort} onSort={handleSort} />
                <th className={`${styles.th} ${styles.thActions}`} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.empty}>
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                sortedRows.map((user) => (
                  <tr key={user.uuid} className={`${styles.tr} ${!user.isActive ? styles.trInactive : ''}`}>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{formatDate(user.createdAt)}</span>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.loginCell}>
                        <button type="button" className={styles.loginLink} onClick={() => onLoginClick(user.uuid)}>
                          {user.login}
                        </button>
                        {user.role === 'admin' && (
                          <span className={styles.adminBadge}>admin</span>
                        )}
                        {!user.isActive && (
                          <span className={styles.inactiveBadge}>неактивен</span>
                        )}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <CopyableUuid uuid={user.uuid} />
                    </td>
                    <td className={styles.td}>
                      {user.tagUuid !== null
                        ? <CopyableUuid uuid={user.tagUuid} />
                        : <span className={styles.cellNull}>—</span>}
                    </td>
                    <td className={styles.td}>{user.campaignsCount}</td>
                    <td className={styles.td}>{user.creativesCount}</td>
                    <td className={styles.td}>{user.impressionsCount}</td>
                    <td className={styles.td}>
                      {user.avgScore !== null
                        ? <span className={styles.cellMono}>{user.avgScore.toFixed(1)}</span>
                        : <span className={styles.cellNull}>—</span>}
                    </td>
                    <td className={`${styles.td} ${styles.tdActions}`}>
                      {user.uuid !== currentUserUuid && (
                        <UserActionsMenu userUuid={user.uuid} isActive={user.isActive} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}