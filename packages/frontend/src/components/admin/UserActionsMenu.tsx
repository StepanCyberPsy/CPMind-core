'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePopover } from '@/lib/shared/use-popover';
import { updateUserStatus } from '@/lib/admin/api';
import styles from '@/styles/users_panel.module.css';

interface Props {
  userUuid: string;
  isActive: boolean;
}

export function UserActionsMenu({ userUuid, isActive }: Props) {
  const router = useRouter();
  const { open, setOpen, triggerRef, panelRef, coords } = usePopover();
  const [submitting, setSubmitting] = useState(false);

  async function handleToggle(nextActive: boolean): Promise<void> {
    setSubmitting(true);
    try {
      await updateUserStatus(userUuid, nextActive);
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось изменить статус пользователя');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.menuWrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.menuTrigger}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
        aria-label="Действия с пользователем"
        aria-expanded={open}
      >
        ⋮
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.menuPanel}
          style={coords ? { top: coords.top, left: coords.left } : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          {isActive ? (
            <button
              type="button"
              className={styles.menuItemDanger}
              onClick={() => handleToggle(false)}
              disabled={submitting}
            >
              Деактивировать
            </button>
          ) : (
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => handleToggle(true)}
              disabled={submitting}
            >
              Реактивировать
            </button>
          )}
        </div>
      )}
    </div>
  );
}