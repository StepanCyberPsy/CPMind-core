'use client';

import { Fragment, useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePopover } from '@/lib/shared/use-popover';
import {
    activateS1WeibullConfig,
    deactivateS1WeibullConfig,
    scheduleS1WeibullDelete,
    cancelS1WeibullDelete,
    activateS3LogisticConfig,
    deactivateS3LogisticConfig,
    scheduleS3LogisticDelete,
    cancelS3LogisticDelete,
    activateS4Config,
    deactivateS4Config,
    scheduleS4ConfigDelete,
    cancelS4ConfigDelete,
    activateS5LogisticConfig,
    deactivateS5LogisticConfig,
    scheduleS5LogisticDelete,
    cancelS5LogisticDelete,
    activateS6LogisticConfig,
    deactivateS6LogisticConfig,
    scheduleS6LogisticDelete,
    cancelS6LogisticDelete,
    activateS7QuantileConfig,
    deactivateS7QuantileConfig,
    scheduleS7QuantileDelete,
    cancelS7QuantileDelete,
} from '@/lib/admin/api';
import type {
    SignalModelsPanelProps,
    S1WeibullConfigRow,
    S3LogisticConfigRow,
    S4ConfigRow,
    S5LogisticConfigRow,
    S6LogisticConfigRow,
    S7QuantileConfigRow,
} from '@/lib/admin/types';
import { FormulaCard } from './FormulaCard';
import cStyles from '@/styles/components.module.css';
import styles from '@/styles/signal-models.module.css';

type SignalTab = 's1' | 's3' | 's4' | 's5' | 's6' | 's7';
type SignalAction = 'activate' | 'deactivate' | 'scheduleDelete' | 'cancelDelete';
type S4DeviceTab = 'base' | 'desktop' | 'mobile';
type S5DeviceTab = 'desktop' | 'mobile';
type S6DeviceTab = 'desktop' | 'mobile' | 'tablet';
type S7DeviceTab = 'desktop' | 'mobile' | 'tablet';

// Константы и маппинги

const TAB_LABELS: Record<SignalTab, string> = {
    s1: 'S1 Weibull',
    s3: 'S3 Logistic',
    s4: 'S4 Config',
    s5: 'S5 Logistic',
    s6: 'S6 Logistic',
    s7: 'S7 Quantile',
};

const SIGNAL_ACTIONS: Record<SignalTab, Record<SignalAction, (id: string) => Promise<void>>> = {
    s1: {
        activate: activateS1WeibullConfig,
        deactivate: deactivateS1WeibullConfig,
        scheduleDelete: scheduleS1WeibullDelete,
        cancelDelete: cancelS1WeibullDelete,
    },
    s3: {
        activate: activateS3LogisticConfig,
        deactivate: deactivateS3LogisticConfig,
        scheduleDelete: scheduleS3LogisticDelete,
        cancelDelete: cancelS3LogisticDelete,
    },
    s4: {
        activate: activateS4Config,
        deactivate: deactivateS4Config,
        scheduleDelete: scheduleS4ConfigDelete,
        cancelDelete: cancelS4ConfigDelete,
    },
    s5: {
        activate: activateS5LogisticConfig,
        deactivate: deactivateS5LogisticConfig,
        scheduleDelete: scheduleS5LogisticDelete,
        cancelDelete: cancelS5LogisticDelete,
    },
    s6: {
        activate: activateS6LogisticConfig,
        deactivate: deactivateS6LogisticConfig,
        scheduleDelete: scheduleS6LogisticDelete,
        cancelDelete: cancelS6LogisticDelete,
    },
    s7: {
        activate: activateS7QuantileConfig,
        deactivate: deactivateS7QuantileConfig,
        scheduleDelete: scheduleS7QuantileDelete,
        cancelDelete: cancelS7QuantileDelete,
    },
};

// Ключи и метки колонок для сигналов с векторными параметрами

const S3_BETA_KEYS = [
    'beta0', 'beta1', 'beta2', 'beta3',
    'beta4', 'beta5', 'beta6', 'beta7',
] as const;

const S3_FEATURE_KEYS = [
    'speed', 'stddev', 'pause', 'direction', 'streak',
] as const;

const S3_FEATURE_LABELS: Record<string, string> = {
    speed: 'speed',
    stddev: 'stddev',
    pause: 'pause',
    direction: 'dir',
    streak: 'streak',
};

const S5_BETA_KEYS = [
    'beta0', 'beta1', 'beta2', 'beta3', 'beta4',
] as const;

const S6_BETA_KEYS = [
    'beta0', 'beta1', 'beta2', 'beta3', 'beta4',
    'beta5', 'beta6', 'beta7', 'beta8',
] as const;

const S6_FEATURE_KEYS = [
    'completion', 'quartile', 'audible', 'replay',
] as const;

const S6_FEATURE_LABELS: Record<string, string> = {
    completion: 'compl',
    quartile: 'quart',
    audible: 'audib',
    replay: 'repl',
};

// Количество колонок по сигналу (для colSpan сегментных заголовков)
// S1: дата(1) + k(1) + λ(1) + выборка(1) + ⋮(1)
// S3: дата(1) + β×8 + means×5 + stds×5 + точность(1) + выборка(1) + версия(1) + ⋮(1)
// S4: дата(1) + версия(1) + λ(1) + T_ref(1) + выборка(1) + ⋮(1)
// S5: дата(1) + β×5 + точность(1) + выборка(1) + версия(1) + ⋮(1)
// S6: дата(1) + β×9 + means×4 + stds×4 + точность(1) + выборка(1) + версия(1) + ⋮(1)
// S7: дата(1) + relYLow(1) + relYMid(1) + clutterMid(1) + clutterHigh(1) + выборка(1) + ⋮(1)

const S1_COLS = 5;
const S3_COLS = 1 + S3_BETA_KEYS.length + S3_FEATURE_KEYS.length + S3_FEATURE_KEYS.length + 4;
const S4_COLS = 6;
const S5_COLS = 1 + S5_BETA_KEYS.length + 4;
const S6_COLS = 1 + S6_BETA_KEYS.length + S6_FEATURE_KEYS.length + S6_FEATURE_KEYS.length + 4;
const S7_COLS = 7;

// Утилиты

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatCountdown(
    deletionScheduledAt: string,
    now: number,
): string {
    const msLeft = new Date(deletionScheduledAt).getTime() - now;
    if (msLeft <= 0) return 'истекает...';
    const totalSec = Math.floor(msLeft / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getVal(
    obj: Record<string, number>,
    key: string,
): string {
    const v = obj[key];
    return v !== undefined ? v.toFixed(4) : '—';
}

interface SortableConfig {
    isActive: boolean;
    deletionScheduledAt: string | null;
    fittedAt?: string;
    computedAt?: string;
    createdAt?: string;
}

function sortConfigs<T extends SortableConfig>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        if (a.deletionScheduledAt !== null && b.deletionScheduledAt !== null) {
            return (
                new Date(a.deletionScheduledAt).getTime() -
                new Date(b.deletionScheduledAt).getTime()
            );
        }
        if (a.deletionScheduledAt !== null) return -1;
        if (b.deletionScheduledAt !== null) return 1;
        const aDate = a.fittedAt ?? a.computedAt ?? a.createdAt ?? '';
        const bDate = b.fittedAt ?? b.computedAt ?? b.createdAt ?? '';
        return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
}

function groupByKey<T>(
    items: T[],
    getKey: (item: T) => string,
): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const key = getKey(item);
        const arr = map.get(key) ?? [];
        arr.push(item);
        map.set(key, arr);
    }
    return map;
}

function orderSegmentKeys(keys: string[]): string[] {
    const priority = ['global', 'default'];
    const prioritized = priority.filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !priority.includes(k)).sort();
    return [...prioritized, ...rest];
}

function filterGroups<T>(
    groups: Map<string, T[]>,
    predicate: (key: string) => boolean,
): Map<string, T[]> {
    const result = new Map<string, T[]>();
    for (const [key, rows] of groups) {
        if (predicate(key)) result.set(key, rows);
    }
    return result;
}

// Общие подкомпоненты

interface BaseTableProps {
    actionId: string | null;
    now: number;
    isCollapsed: (tab: SignalTab, segmentKey: string) => boolean;
    onToggleSegment: (tab: SignalTab, segmentKey: string) => void;
    onAction: (tab: SignalTab, action: SignalAction, id: string) => void;
}

interface SegmentHeaderProps {
    tab: SignalTab;
    segmentKey: string;
    colSpan: number;
    isCollapsed: boolean;
    onToggle: (tab: SignalTab, segmentKey: string) => void;
}

function SegmentHeader({
    tab,
    segmentKey,
    colSpan,
    isCollapsed,
    onToggle,
}: SegmentHeaderProps) {
    return (
        <tr
            className={styles.segmentRow}
            onClick={() => onToggle(tab, segmentKey)}
        >
            <td colSpan={colSpan} className={styles.segmentHeader}>
                <div className={styles.segmentHeaderInner}>
                    <span className={styles.segmentChevron}>
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                    <span className={styles.segmentKey}>{segmentKey}</span>
                </div>
            </td>
        </tr>
    );
}

function ActiveBadge() {
    return (
        <span className={styles.activeBadge}>
            <span className={styles.activeDot} />
            активна
        </span>
    );
}

function TtlBadge({
    deletionScheduledAt,
    now,
}: {
    deletionScheduledAt: string | null;
    now: number;
}) {
    if (deletionScheduledAt === null) return null;
    return (
        <span className={styles.ttlBadge}>
            {formatCountdown(deletionScheduledAt, now)}
        </span>
    );
}

interface ConfigActionsMenuProps {
    tab: SignalTab;
    cfg: {
        id: string;
        isActive: boolean;
        deletionScheduledAt: string | null;
    };
    actionId: string | null;
    onAction: (tab: SignalTab, action: SignalAction, id: string) => void;
}

function ConfigActionsMenu({
    tab,
    cfg,
    actionId,
    onAction,
}: ConfigActionsMenuProps) {
    const { open, setOpen, triggerRef, panelRef, coords } = usePopover();
    const prefix = `${tab}:${cfg.id}`;
    const isRowBusy = actionId?.startsWith(prefix) === true;

    return (
        <div className={styles.menuWrapper}>
            <button
                ref={triggerRef}
                type="button"
                className={styles.menuTrigger}
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                disabled={isRowBusy}
                aria-expanded={open}
                aria-label="Действия"
            >
                {isRowBusy ? <span className={cStyles.spinner} /> : '⋮'}
            </button>
            {open && (
                <div
                    ref={panelRef}
                    className={styles.menuPanel}
                    style={coords ? { top: coords.top, left: coords.left } : undefined}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className={styles.menuItem}
                        disabled={cfg.isActive || cfg.deletionScheduledAt !== null || isRowBusy}
                        onClick={() => { setOpen(false); onAction(tab, 'activate', cfg.id); }}
                    >
                        Активировать
                    </button>
                    <button
                        type="button"
                        className={styles.menuItem}
                        disabled={!cfg.isActive || isRowBusy}
                        onClick={() => { setOpen(false); onAction(tab, 'deactivate', cfg.id); }}
                    >
                        Деактивировать
                    </button>
                    <button
                        type="button"
                        className={styles.menuItem}
                        disabled={cfg.isActive || cfg.deletionScheduledAt !== null || isRowBusy}
                        onClick={() => { setOpen(false); onAction(tab, 'scheduleDelete', cfg.id); }}
                    >
                        Запланировать удаление
                    </button>
                    <button
                        type="button"
                        className={`${styles.menuItem} ${styles.menuItemDanger}`}
                        disabled={cfg.deletionScheduledAt === null || isRowBusy}
                        onClick={() => { setOpen(false); onAction(tab, 'cancelDelete', cfg.id); }}
                    >
                        Отменить удаление
                    </button>
                </div>
            )}
        </div>
    );
}

// Таблицы сигнальных конфигураций

interface S1TableProps extends BaseTableProps {
    groups: Map<string, S1WeibullConfigRow[]>;
}

function S1Table({
    groups,
    actionId,
    now,
    isCollapsed,
    onToggleSegment,
    onAction,
}: S1TableProps) {
    const TAB: SignalTab = 's1';
    const orderedKeys = orderSegmentKeys(Array.from(groups.keys()));

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Тип и дата</th>
                            <th className={styles.th}>Выборка</th>
                            <th className={styles.th}>k</th>
                            <th className={styles.th}>λ</th>
                            <th className={`${styles.th} ${styles.thActions}`} />
                        </tr>
                    </thead>
                    <tbody>
                        {orderedKeys.length === 0 ? (
                            <tr>
                                <td colSpan={S1_COLS} className={styles.empty}>
                                    Конфигурации не найдены
                                </td>
                            </tr>
                        ) : (
                            orderedKeys.map((segKey) => {
                                const rows = sortConfigs(groups.get(segKey) ?? []);
                                const collapsed = isCollapsed(TAB, segKey);
                                return (
                                    <Fragment key={segKey}>
                                        <SegmentHeader
                                            tab={TAB}
                                            segmentKey={segKey}
                                            colSpan={S1_COLS}
                                            isCollapsed={collapsed}
                                            onToggle={onToggleSegment}
                                        />
                                        {!collapsed && rows.map((cfg) => (
                                            <tr
                                                key={cfg.id}
                                                className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                                            >
                                                <td className={styles.td}>
                                                    <div className={styles.cellVersion}>
                                                        <span className={styles.cellMono}>{formatDate(cfg.fittedAt)}</span>
                                                        {cfg.isActive && <ActiveBadge />}
                                                    </div>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>
                                                        {cfg.sampleSize.toLocaleString('ru-RU')}
                                                    </span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.k.toFixed(4)}</span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.lambda.toFixed(4)}</span>
                                                </td>

                                                <td className={styles.tdActions}>
                                                    <div className={styles.actionsCell}>
                                                        <TtlBadge deletionScheduledAt={cfg.deletionScheduledAt} now={now} />
                                                        <ConfigActionsMenu
                                                            tab={TAB}
                                                            cfg={cfg}
                                                            actionId={actionId}
                                                            onAction={onAction}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface S3TableProps extends BaseTableProps {
    groups: Map<string, S3LogisticConfigRow[]>;
}

function S3Table({
    groups,
    actionId,
    now,
    isCollapsed,
    onToggleSegment,
    onAction,
}: S3TableProps) {
    const TAB: SignalTab = 's3';
    const orderedKeys = orderSegmentKeys(Array.from(groups.keys()));

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th} rowSpan={2}>Тип и дата</th>
                            <th className={styles.th} rowSpan={2}>Точность</th>
                            <th className={styles.th} rowSpan={2}>Выборка</th>
                            <th className={styles.th} rowSpan={2}>Версия констант</th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S3_BETA_KEYS.length}>
                                Коэффициенты β
                            </th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S3_FEATURE_KEYS.length}>
                                Средние признаков
                            </th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S3_FEATURE_KEYS.length}>
                                Станд. откл.
                            </th>

                            <th className={`${styles.th} ${styles.thActions}`} rowSpan={2} />
                        </tr>
                        <tr>
                            {S3_BETA_KEYS.map((k) => (
                                <th key={k} className={styles.thSub}>
                                    {k.replace('beta', 'β')}
                                </th>
                            ))}
                            {S3_FEATURE_KEYS.map((k) => (
                                <th key={`fm_${k}`} className={styles.thSub}>
                                    {S3_FEATURE_LABELS[k] ?? k}
                                </th>
                            ))}
                            {S3_FEATURE_KEYS.map((k) => (
                                <th key={`fs_${k}`} className={styles.thSub}>
                                    {S3_FEATURE_LABELS[k] ?? k}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orderedKeys.length === 0 ? (
                            <tr>
                                <td colSpan={S3_COLS} className={styles.empty}>
                                    Конфигурации не найдены
                                </td>
                            </tr>
                        ) : (
                            orderedKeys.map((segKey) => {
                                const rows = sortConfigs(groups.get(segKey) ?? []);
                                const collapsed = isCollapsed(TAB, segKey);
                                return (
                                    <Fragment key={segKey}>
                                        <SegmentHeader
                                            tab={TAB}
                                            segmentKey={segKey}
                                            colSpan={S3_COLS}
                                            isCollapsed={collapsed}
                                            onToggle={onToggleSegment}
                                        />
                                        {!collapsed && rows.map((cfg) => (
                                            <tr
                                                key={cfg.id}
                                                className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                                            >
                                                <td className={styles.td}>
                                                    <div className={styles.cellVersion}>
                                                        <span className={styles.cellMono}>{formatDate(cfg.fittedAt)}</span>
                                                        {cfg.isActive && <ActiveBadge />}
                                                    </div>
                                                </td>
                                                <td className={styles.td}>
                                                    {cfg.accuracy !== null ? (
                                                        <span className={styles.cellMono}>
                                                            {(cfg.accuracy * 100).toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className={styles.cellNull}>—</span>
                                                    )}
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>
                                                        {cfg.sampleSize.toLocaleString('ru-RU')}
                                                    </span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.tagConstantsVersion}</span>
                                                </td>
                                                {S3_BETA_KEYS.map((k) => (
                                                    <td key={k} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.coefficients, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                {S3_FEATURE_KEYS.map((k) => (
                                                    <td key={`fm_${k}`} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.featureMeans, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                {S3_FEATURE_KEYS.map((k) => (
                                                    <td key={`fs_${k}`} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.featureStds, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                <td className={styles.tdActions}>
                                                    <div className={styles.actionsCell}>
                                                        <TtlBadge deletionScheduledAt={cfg.deletionScheduledAt} now={now} />
                                                        <ConfigActionsMenu
                                                            tab={TAB}
                                                            cfg={cfg}
                                                            actionId={actionId}
                                                            onAction={onAction}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface S4TableProps extends BaseTableProps {
    groups: Map<string, S4ConfigRow[]>;
}

function S4Table({
    groups,
    actionId,
    now,
    isCollapsed,
    onToggleSegment,
    onAction,
}: S4TableProps) {
    const TAB: SignalTab = 's4';
    const orderedKeys = orderSegmentKeys(Array.from(groups.keys()));

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Создана</th>
                            <th className={styles.th}>Версия</th>
                            <th className={styles.th}>Выборка</th>
                            <th className={styles.th}>λ</th>
                            <th className={styles.th}>T_ref (мс)</th>
                            <th className={`${styles.th} ${styles.thActions}`} />
                        </tr>
                    </thead>
                    <tbody>
                        {orderedKeys.length === 0 ? (
                            <tr>
                                <td colSpan={S4_COLS} className={styles.empty}>
                                    Конфигурации не найдены
                                </td>
                            </tr>
                        ) : (
                            orderedKeys.map((segKey) => {
                                const rows = sortConfigs(groups.get(segKey) ?? []);
                                const collapsed = isCollapsed(TAB, segKey);
                                return (
                                    <Fragment key={segKey}>
                                        <SegmentHeader
                                            tab={TAB}
                                            segmentKey={segKey}
                                            colSpan={S4_COLS}
                                            isCollapsed={collapsed}
                                            onToggle={onToggleSegment}
                                        />
                                        {!collapsed && rows.map((cfg) => (
                                            <tr
                                                key={cfg.id}
                                                className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                                            >
                                                <td className={styles.td}>
                                                    <div className={styles.cellVersion}>
                                                        <span className={styles.cellMono}>{formatDate(cfg.fittedAt)}</span>
                                                        {cfg.isActive && <ActiveBadge />}
                                                    </div>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.version}</span>
                                                </td>
                                                <td className={styles.td}>
                                                    {cfg.sampleSize !== null ? (
                                                        <span className={styles.cellMono}>
                                                            {cfg.sampleSize.toLocaleString('ru-RU')}
                                                        </span>
                                                    ) : (
                                                        <span className={styles.cellNull}>—</span>
                                                    )}
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.lambda.toFixed(4)}</span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>
                                                        {cfg.tRefMs.toLocaleString('ru-RU')}
                                                    </span>
                                                </td>
                                                <td className={styles.tdActions}>
                                                    <div className={styles.actionsCell}>
                                                        <TtlBadge deletionScheduledAt={cfg.deletionScheduledAt} now={now} />
                                                        <ConfigActionsMenu
                                                            tab={TAB}
                                                            cfg={cfg}
                                                            actionId={actionId}
                                                            onAction={onAction}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface S5TableProps extends BaseTableProps {
    groups: Map<string, S5LogisticConfigRow[]>;
}

function S5Table({
    groups,
    actionId,
    now,
    isCollapsed,
    onToggleSegment,
    onAction,
}: S5TableProps) {
    const TAB: SignalTab = 's5';
    const orderedKeys = orderSegmentKeys(Array.from(groups.keys()));

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th} rowSpan={2}>Тип и дата</th>
                            <th className={styles.th} rowSpan={2}>Точность</th>
                            <th className={styles.th} rowSpan={2}>Выборка</th>
                            <th className={styles.th} rowSpan={2}>Версия констант</th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S5_BETA_KEYS.length}>
                                Коэффициенты β
                            </th>
                            <th className={`${styles.th} ${styles.thActions}`} rowSpan={2} />
                        </tr>
                        <tr>
                            {S5_BETA_KEYS.map((k) => (
                                <th key={k} className={styles.thSub}>
                                    {k.replace('beta', 'β')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orderedKeys.length === 0 ? (
                            <tr>
                                <td colSpan={S5_COLS} className={styles.empty}>
                                    Конфигурации не найдены
                                </td>
                            </tr>
                        ) : (
                            orderedKeys.map((segKey) => {
                                const rows = sortConfigs(groups.get(segKey) ?? []);
                                const collapsed = isCollapsed(TAB, segKey);
                                return (
                                    <Fragment key={segKey}>
                                        <SegmentHeader
                                            tab={TAB}
                                            segmentKey={segKey}
                                            colSpan={S5_COLS}
                                            isCollapsed={collapsed}
                                            onToggle={onToggleSegment}
                                        />
                                        {!collapsed && rows.map((cfg) => (
                                            <tr
                                                key={cfg.id}
                                                className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                                            >
                                                <td className={styles.td}>
                                                    <div className={styles.cellVersion}>
                                                        <span className={styles.cellMono}>{formatDate(cfg.fittedAt)}</span>
                                                        {cfg.isActive && <ActiveBadge />}
                                                    </div>
                                                </td>
                                                <td className={styles.td}>
                                                    {cfg.accuracy !== null ? (
                                                        <span className={styles.cellMono}>
                                                            {(cfg.accuracy * 100).toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className={styles.cellNull}>—</span>
                                                    )}
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>
                                                        {cfg.sampleSize.toLocaleString('ru-RU')}
                                                    </span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.tagConstantsVersion}</span>
                                                </td>
                                                {S5_BETA_KEYS.map((k) => (
                                                    <td key={k} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.coefficients, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                <td className={styles.tdActions}>
                                                    <div className={styles.actionsCell}>
                                                        <TtlBadge deletionScheduledAt={cfg.deletionScheduledAt} now={now} />
                                                        <ConfigActionsMenu
                                                            tab={TAB}
                                                            cfg={cfg}
                                                            actionId={actionId}
                                                            onAction={onAction}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface S6TableProps extends BaseTableProps {
    groups: Map<string, S6LogisticConfigRow[]>;
}

function S6Table({
    groups,
    actionId,
    now,
    isCollapsed,
    onToggleSegment,
    onAction,
}: S6TableProps) {
    const TAB: SignalTab = 's6';
    const orderedKeys = orderSegmentKeys(Array.from(groups.keys()));

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th} rowSpan={2}>Тип и дата</th>
                            <th className={styles.th} rowSpan={2}>Точность</th>
                            <th className={styles.th} rowSpan={2}>Выборка</th>
                            <th className={styles.th} rowSpan={2}>Версия констант</th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S6_BETA_KEYS.length}>
                                Коэффициенты β
                            </th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S6_FEATURE_KEYS.length}>
                                Средние признаков
                            </th>
                            <th className={`${styles.th} ${styles.thGroup}`} colSpan={S6_FEATURE_KEYS.length}>
                                Станд. откл.
                            </th>
                            <th className={`${styles.th} ${styles.thActions}`} rowSpan={2} />
                        </tr>
                        <tr>
                            {S6_BETA_KEYS.map((k) => (
                                <th key={k} className={styles.thSub}>
                                    {k.replace('beta', 'β')}
                                </th>
                            ))}
                            {S6_FEATURE_KEYS.map((k) => (
                                <th key={`fm_${k}`} className={styles.thSub}>
                                    {S6_FEATURE_LABELS[k] ?? k}
                                </th>
                            ))}
                            {S6_FEATURE_KEYS.map((k) => (
                                <th key={`fs_${k}`} className={styles.thSub}>
                                    {S6_FEATURE_LABELS[k] ?? k}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orderedKeys.length === 0 ? (
                            <tr>
                                <td colSpan={S6_COLS} className={styles.empty}>
                                    Конфигурации не найдены
                                </td>
                            </tr>
                        ) : (
                            orderedKeys.map((segKey) => {
                                const rows = sortConfigs(groups.get(segKey) ?? []);
                                const collapsed = isCollapsed(TAB, segKey);
                                return (
                                    <Fragment key={segKey}>
                                        <SegmentHeader
                                            tab={TAB}
                                            segmentKey={segKey}
                                            colSpan={S6_COLS}
                                            isCollapsed={collapsed}
                                            onToggle={onToggleSegment}
                                        />
                                        {!collapsed && rows.map((cfg) => (
                                            <tr
                                                key={cfg.id}
                                                className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                                            >
                                                <td className={styles.td}>
                                                    <div className={styles.cellVersion}>
                                                        <span className={styles.cellMono}>{formatDate(cfg.fittedAt)}</span>
                                                        {cfg.isActive && <ActiveBadge />}
                                                    </div>
                                                </td>
                                                <td className={styles.td}>
                                                    {cfg.accuracy !== null ? (
                                                        <span className={styles.cellMono}>
                                                            {(cfg.accuracy * 100).toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className={styles.cellNull}>—</span>
                                                    )}
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>
                                                        {cfg.sampleSize.toLocaleString('ru-RU')}
                                                    </span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.tagConstantsVersion}</span>
                                                </td>
                                                {S6_BETA_KEYS.map((k) => (
                                                    <td key={k} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.coefficients, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                {S6_FEATURE_KEYS.map((k) => (
                                                    <td key={`fm_${k}`} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.featureMeans, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                {S6_FEATURE_KEYS.map((k) => (
                                                    <td key={`fs_${k}`} className={styles.td}>
                                                        <span className={styles.cellMono}>
                                                            {getVal(cfg.featureStds, k)}
                                                        </span>
                                                    </td>
                                                ))}
                                                <td className={styles.tdActions}>
                                                    <div className={styles.actionsCell}>
                                                        <TtlBadge deletionScheduledAt={cfg.deletionScheduledAt} now={now} />
                                                        <ConfigActionsMenu
                                                            tab={TAB}
                                                            cfg={cfg}
                                                            actionId={actionId}
                                                            onAction={onAction}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface S7TableProps extends BaseTableProps {
    groups: Map<string, S7QuantileConfigRow[]>;
}

function S7Table({
    groups,
    actionId,
    now,
    isCollapsed,
    onToggleSegment,
    onAction,
}: S7TableProps) {
    const TAB: SignalTab = 's7';
    const orderedKeys = orderSegmentKeys(Array.from(groups.keys()));

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.scrollContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Вычислена</th>
                            <th className={styles.th}>Выборка</th>
                            <th className={styles.th}>relY low</th>
                            <th className={styles.th}>relY mid</th>
                            <th className={styles.th}>Clutter mid</th>
                            <th className={styles.th}>Clutter high</th>
                            <th className={`${styles.th} ${styles.thActions}`} />
                        </tr>
                    </thead>
                    <tbody>
                        {orderedKeys.length === 0 ? (
                            <tr>
                                <td colSpan={S7_COLS} className={styles.empty}>
                                    Конфигурации не найдены
                                </td>
                            </tr>
                        ) : (
                            orderedKeys.map((segKey) => {
                                const rows = sortConfigs(groups.get(segKey) ?? []);
                                const collapsed = isCollapsed(TAB, segKey);
                                return (
                                    <Fragment key={segKey}>
                                        <SegmentHeader
                                            tab={TAB}
                                            segmentKey={segKey}
                                            colSpan={S7_COLS}
                                            isCollapsed={collapsed}
                                            onToggle={onToggleSegment}
                                        />
                                        {!collapsed && rows.map((cfg) => (
                                            <tr
                                                key={cfg.id}
                                                className={`${styles.tr} ${cfg.isActive ? styles.trActive : ''}`}
                                            >
                                                <td className={styles.td}>
                                                    <div className={styles.cellVersion}>
                                                        <span className={styles.cellMono}>{formatDate(cfg.computedAt)}</span>
                                                        {cfg.isActive && <ActiveBadge />}
                                                    </div>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>
                                                        {cfg.sampleSize.toLocaleString('ru-RU')}
                                                    </span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.relativeYLow.toFixed(4)}</span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.relativeYMid.toFixed(4)}</span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.clutterMid.toFixed(2)}</span>
                                                </td>
                                                <td className={styles.td}>
                                                    <span className={styles.cellMono}>{cfg.clutterHigh.toFixed(2)}</span>
                                                </td>
                                                <td className={styles.tdActions}>
                                                    <div className={styles.actionsCell}>
                                                        <TtlBadge deletionScheduledAt={cfg.deletionScheduledAt} now={now} />
                                                        <ConfigActionsMenu
                                                            tab={TAB}
                                                            cfg={cfg}
                                                            actionId={actionId}
                                                            onAction={onAction}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Основной компонент

export function SignalModelsPanel({
    initialS1,
    initialS3,
    initialS4,
    initialS5,
    initialS6,
    initialS7,
}: SignalModelsPanelProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<SignalTab>('s1');
    const [actionId, setActionId] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [s4DeviceTab, setS4DeviceTab] = useState<S4DeviceTab>('base');
    const [s5DeviceTab, setS5DeviceTab] = useState<S5DeviceTab>('desktop');
    const [s6DeviceTab, setS6DeviceTab] = useState<S6DeviceTab>('desktop');
    const [s7DeviceTab, setS7DeviceTab] = useState<S7DeviceTab>('desktop');

    const s1Groups = useMemo(() => groupByKey(initialS1, (c) => c.segmentKey), [initialS1]);
    const s3Groups = useMemo(() => groupByKey(initialS3, (c) => c.segmentKey), [initialS3]);
    const s4Groups = useMemo(() => groupByKey(initialS4, (c) => c.segmentKey), [initialS4]);
    const s5Groups = useMemo(() => groupByKey(initialS5, (c) => c.segmentKey), [initialS5]);
    const s6Groups = useMemo(() => groupByKey(initialS6, (c) => c.segmentKey), [initialS6]);
    const s7Groups = useMemo(() => groupByKey(initialS7, (c) => c.deviceType), [initialS7]);

    const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(() => {
        const collapsed = new Set<string>();
        const addFromGroups = (tab: SignalTab, keys: IterableIterator<string>) => {
            for (const key of keys) {
                if (key !== 'global' && key !== 'default') collapsed.add(`${tab}:${key}`);
            }
        };
        addFromGroups('s1', groupByKey(initialS1, (c) => c.segmentKey).keys());
        addFromGroups('s3', groupByKey(initialS3, (c) => c.segmentKey).keys());
        addFromGroups('s4', groupByKey(initialS4, (c) => c.segmentKey).keys());
        addFromGroups('s5', groupByKey(initialS5, (c) => c.segmentKey).keys());
        addFromGroups('s6', groupByKey(initialS6, (c) => c.segmentKey).keys());
        addFromGroups('s7', groupByKey(initialS7, (c) => c.deviceType).keys());
        return collapsed;
    });

    const hasScheduledDeletion = useMemo(() => (
        [...initialS1, ...initialS3, ...initialS4, ...initialS5, ...initialS6, ...initialS7]
            .some((c) => c.deletionScheduledAt !== null)
    ), [initialS1, initialS3, initialS4, initialS5, initialS6, initialS7]);

    useEffect(() => {
        if (!hasScheduledDeletion) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [hasScheduledDeletion]);

    const handleToggleSegment = useCallback((
        tab: SignalTab,
        segmentKey: string,
    ) => {
        const key = `${tab}:${segmentKey}`;
        setCollapsedSegments((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const isCollapsed = useCallback((
        tab: SignalTab,
        segmentKey: string,
    ): boolean => collapsedSegments.has(`${tab}:${segmentKey}`), [collapsedSegments]);

    const handleAction = useCallback(async (
        tab: SignalTab,
        action: SignalAction,
        id: string,
    ) => {
        setActionId(`${tab}:${id}:${action}`);
        try {
            await SIGNAL_ACTIONS[tab][action](id);
            router.refresh();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Ошибка');
        } finally {
            setActionId(null);
        }
    }, [router]);

    const s4Filtered = useMemo(() => {
        if (s4DeviceTab === 'base') return filterGroups(s4Groups, (k) => k === 'default');
        if (s4DeviceTab === 'desktop') return filterGroups(s4Groups, (k) => k.startsWith('desktop_'));
        return filterGroups(s4Groups, (k) => k.startsWith('mobile_'));
    }, [s4Groups, s4DeviceTab]);

    const s5Filtered = useMemo(() => {
        if (s5DeviceTab === 'desktop') return filterGroups(s5Groups, (k) => k === 'desktop');
        return filterGroups(s5Groups, (k) => k === 'mobile_tablet');
    }, [s5Groups, s5DeviceTab]);

    const s6Filtered = useMemo(() => (
        filterGroups(s6Groups, (k) => k.startsWith(`${s6DeviceTab}|`))
    ), [s6Groups, s6DeviceTab]);

    const s7Filtered = useMemo(() => (
        filterGroups(s7Groups, (k) => k === s7DeviceTab)
    ), [s7Groups, s7DeviceTab]);

    const tableProps = {
        actionId,
        now,
        isCollapsed,
        onToggleSegment: handleToggleSegment,
        onAction: handleAction,
    };

    return (
        <div>
            <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Калибровка сигнальных моделей</span>
            </div>

            <div className={styles.tabBar}>
                {(Object.keys(TAB_LABELS) as SignalTab[]).map((tab) => (
                    <button
                        key={tab}
                        className={activeTab === tab ? styles.tabActive : styles.tab}
                        onClick={() => setActiveTab(tab)}
                    >
                        {TAB_LABELS[tab]}
                    </button>
                ))}
            </div>

            <FormulaCard signal={activeTab} />

            {activeTab === 's1' && <S1Table groups={s1Groups} {...tableProps} />}

            {activeTab === 's3' && <S3Table groups={s3Groups} {...tableProps} />}

            {activeTab === 's4' && (
                <>
                    <div className={styles.deviceTabBar}>
                        {([
                            ['base', 'Базовая'],
                            ['desktop', 'Десктоп'],
                            ['mobile', 'Мобильные'],
                        ] as const).map(([tab, label]) => (
                            <button
                                key={tab}
                                className={s4DeviceTab === tab ? styles.deviceTabActive : styles.deviceTab}
                                onClick={() => setS4DeviceTab(tab)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <S4Table groups={s4Filtered} {...tableProps} />
                </>
            )}

            {activeTab === 's5' && (
                <>
                    <div className={styles.deviceTabBar}>
                        {([
                            ['desktop', 'Десктоп'],
                            ['mobile', 'Мобильные'],
                        ] as const).map(([tab, label]) => (
                            <button
                                key={tab}
                                className={s5DeviceTab === tab ? styles.deviceTabActive : styles.deviceTab}
                                onClick={() => setS5DeviceTab(tab)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <S5Table groups={s5Filtered} {...tableProps} />
                </>
            )}

            {activeTab === 's6' && (
                <>
                    <div className={styles.deviceTabBar}>
                        {([
                            ['desktop', 'Десктоп'],
                            ['mobile', 'Мобильные'],
                            ['tablet', 'Планшет'],
                        ] as const).map(([tab, label]) => (
                            <button
                                key={tab}
                                className={s6DeviceTab === tab ? styles.deviceTabActive : styles.deviceTab}
                                onClick={() => setS6DeviceTab(tab)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <S6Table groups={s6Filtered} {...tableProps} />
                </>
            )}

            {activeTab === 's7' && (
                <>
                    <div className={styles.deviceTabBar}>
                        {([
                            ['desktop', 'Десктоп'],
                            ['mobile', 'Мобильные'],
                            ['tablet', 'Планшет'],
                        ] as const).map(([tab, label]) => (
                            <button
                                key={tab}
                                className={s7DeviceTab === tab ? styles.deviceTabActive : styles.deviceTab}
                                onClick={() => setS7DeviceTab(tab)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <S7Table groups={s7Filtered} {...tableProps} />
                </>
            )}
        </div>
    );
}