'use client';

import {
    useCallback,
    useEffect,
    useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { fetchCreatives, updatePlacement } from '@/lib/admin/api';
import { ROTATION_MODE_OPTIONS } from '@/lib/config';
import type { CreativeListItem, PlacementDetail } from '@/lib/admin/api';
import type { PlacementCreativeSetItem } from '@cpmind/shared';
import styles from '@/styles/placement-creative-set.module.css';

interface Props {
    placement: PlacementDetail;
    onDone: () => void;
}

interface SetItem {
    creativeUuid: string;
    creativeName: string;
    weightPct: number;
}

const WEIGHT_TOTAL = 100;
const MAX_SET_SIZE = 20;

// Веса распределяются поровну, остаток от округления добавляется первому ролику:
// сумма должна быть ровно 100, иначе сервер отклонит набор
function distributeWeights(items: SetItem[]): SetItem[] {
    if (items.length === 0) return items;

    const share = Math.floor((WEIGHT_TOTAL / items.length) * 100) / 100;
    const remainder = Math.round((WEIGHT_TOTAL - share * items.length) * 100) / 100;

    return items.map((item, index) => ({
        ...item,
        weightPct: index === 0
            ? Math.round((share + remainder) * 100) / 100
            : share,
    }));
}

function sumWeights(items: SetItem[]): number {
    return Math.round(items.reduce((total, item) => total + item.weightPct, 0) * 100) / 100;
}

export function PlacementCreativeSetEditor({
    placement,
    onDone,
}: Props): React.ReactElement {
    const router = useRouter();

    const [items, setItems] = useState<SetItem[]>(
        placement.creativeSet
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((item) => ({
                creativeUuid: item.creativeUuid,
                creativeName: item.creativeName,
                weightPct: item.weightPct,
            })),
    );
    const [rotationMode, setRotationMode] = useState(placement.rotationMode);
    const [available, setAvailable] = useState<CreativeListItem[]>([]);
    const [selectedUuid, setSelectedUuid] = useState('');
    const [loadingList, setLoadingList] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Набор собирается только из видеокреативов той же кампании: сервер
    // отклоняет ролики других кампаний и баннеры
    useEffect(() => {
        let cancelled = false;

        void fetchCreatives()
            .then((list) => {
                if (cancelled) return;
                setAvailable(list.filter(
                    (creative) => creative.campaignUuid === placement.campaignUuid &&
                        creative.creativeType === 'video_creative',
                ));
            })
            .catch(() => {
                if (!cancelled) setError('Не удалось загрузить список креативов');
            })
            .finally(() => {
                if (!cancelled) setLoadingList(false);
            });

        return () => { cancelled = true; };
    }, [placement.campaignUuid]);

    const selectedUuids = new Set(items.map((item) => item.creativeUuid));
    const candidates = available.filter((creative) => !selectedUuids.has(creative.uuid));
    const weightSum = sumWeights(items);
    const isBalanced = items.length === 0 || Math.abs(weightSum - WEIGHT_TOTAL) <= 0.01;

    const handleAdd = useCallback((): void => {
        if (selectedUuid === '') return;

        const creative = available.find((item) => item.uuid === selectedUuid);
        if (creative === undefined) return;

        setItems((prev) => distributeWeights([
            ...prev,
            {
                creativeUuid: creative.uuid,
                creativeName: creative.name,
                weightPct: 0,
            },
        ]));
        setSelectedUuid('');
    }, [available, selectedUuid]);

    const handleRemove = useCallback((creativeUuid: string): void => {
        setItems((prev) => distributeWeights(
            prev.filter((item) => item.creativeUuid !== creativeUuid),
        ));
    }, []);

    const handleMove = useCallback((index: number, direction: -1 | 1): void => {
        setItems((prev) => {
            const target = index + direction;
            if (target < 0 || target >= prev.length) return prev;

            const next = prev.slice();
            const moved = next[index]!;
            next[index] = next[target]!;
            next[target] = moved;
            return next;
        });
    }, []);

    const handleWeightChange = useCallback((
        creativeUuid: string,
        value: string,
    ): void => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;

        setItems((prev) => prev.map((item) => (
            item.creativeUuid === creativeUuid
                ? { ...item, weightPct: parsed }
                : item
        )));
    }, []);

    const handleSave = async (): Promise<void> => {
        setSaving(true);
        setError(null);

        const creativeSet: PlacementCreativeSetItem[] = items.map((item, index) => ({
            creativeUuid: item.creativeUuid,
            weightPct: item.weightPct,
            displayOrder: index,
        }));

        try {
            await updatePlacement(placement.uuid, {
                creativeSet,
                rotationMode: rotationMode as 'weighted_random' | 'sequential',
            });
            router.refresh();
            onDone();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка сохранения набора');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.root}>
            <div className={styles.field}>
                <label className={styles.label} htmlFor="pcs-rotation">
                    Порядок показа
                </label>
                <select
                    id="pcs-rotation"
                    value={rotationMode}
                    onChange={(e) => setRotationMode(e.target.value)}
                    disabled={saving}
                >
                    {ROTATION_MODE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                            {item.label}
                        </option>
                    ))}
                </select>
                <span className={styles.hint}>
                    {placement.format === 'instream'
                        ? 'In-stream показывает один ролик за рекламную вставку, выбранный по весам.'
                        : rotationMode === 'sequential'
                            ? 'Ролики проигрываются по очереди и зацикливаются после последнего.'
                            : 'Ролик выбирается по весам, подряд один и тот же не повторяется.'}
                </span>
            </div>

            {items.length > 0 && (
                <div className={styles.list}>
                    {items.map((item, index) => (
                        <div key={item.creativeUuid} className={styles.row}>
                            <div className={styles.orderControls}>
                                <button
                                    type="button"
                                    className={styles.orderBtn}
                                    onClick={() => handleMove(index, -1)}
                                    disabled={saving || index === 0}
                                    aria-label="Выше"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className={styles.orderBtn}
                                    onClick={() => handleMove(index, 1)}
                                    disabled={saving || index === items.length - 1}
                                    aria-label="Ниже"
                                >
                                    ↓
                                </button>
                            </div>

                            <span className={styles.name}>{item.creativeName}</span>

                            <div className={styles.weightWrap}>
                                <input
                                    type="number"
                                    className={styles.weightInput}
                                    min={0.01}
                                    max={100}
                                    step={0.01}
                                    value={item.weightPct}
                                    onChange={(e) => handleWeightChange(item.creativeUuid, e.target.value)}
                                    disabled={saving}
                                    aria-label={`Вес ролика ${item.creativeName}`}
                                />
                                <span className={styles.weightUnit}>%</span>
                            </div>

                            <button
                                type="button"
                                className={styles.removeBtn}
                                onClick={() => handleRemove(item.creativeUuid)}
                                disabled={saving}
                                aria-label="Убрать из набора"
                            >
                                ×
                            </button>
                        </div>
                    ))}

                    <div className={`${styles.sumRow} ${isBalanced ? '' : styles.sumRowInvalid}`}>
                        <span>Сумма весов</span>
                        <span className={styles.sumValue}>{weightSum}%</span>
                    </div>
                </div>
            )}

            {items.length < MAX_SET_SIZE && (
                <div className={styles.addRow}>
                    <select
                        value={selectedUuid}
                        onChange={(e) => setSelectedUuid(e.target.value)}
                        disabled={saving || loadingList || candidates.length === 0}
                        aria-label="Добавить ролик"
                    >
                        <option value="">
                            {loadingList
                                ? 'Загрузка…'
                                : candidates.length === 0
                                    ? 'Нет доступных роликов'
                                    : 'Выберите ролик'}
                        </option>
                        {candidates.map((creative) => (
                            <option key={creative.uuid} value={creative.uuid}>
                                {creative.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className={styles.addBtn}
                        onClick={handleAdd}
                        disabled={saving || selectedUuid === ''}
                    >
                        Добавить
                    </button>
                </div>
            )}

            {items.length === 0 && (
                <span className={styles.hint}>
                    Без набора размещение показывает единственный креатив.
                    Сохранение пустого набора возвращает его к этому поведению.
                </span>
            )}

            {error !== null && (
                <span className={styles.error}>{error}</span>
            )}

            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={() => { void handleSave(); }}
                    disabled={saving || !isBalanced}
                >
                    {saving ? 'Сохранение…' : 'Сохранить набор'}
                </button>
                <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={onDone}
                    disabled={saving}
                >
                    Отмена
                </button>
            </div>
        </div>
    );
}