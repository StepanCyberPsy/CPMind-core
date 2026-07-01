import type { SortField } from '@/lib/shared/types';

export type SignalField =
  | 'score_final'
  | 's1_normalized'
  | 's2_normalized'
  | 's3_normalized'
  | 's4_normalized'
  | 's5_normalized'
  | 's7_normalized';

// S5 — фиксированный набор уровней взаимодействия
export interface S5EventOption {
  label: string;
  value: number;
}

export const S5_EVENT_OPTIONS: readonly S5EventOption[] = [
  { label: 'Клик', value: 100 },
  { label: 'Зум', value: 80 },
  { label: 'Свайп', value: 70 },
  { label: 'Тап', value: 60 },
  { label: 'Hover 500ms', value: 30 },
  { label: 'Hover', value: 20 },
  { label: 'Proximity', value: 10 },
  { label: 'Нет взаимодействия', value: 0 },
];

export type S5FilterMode = 'exact' | 'gte';

export interface SignalMeta {
  field: SignalField;
  label: string;
  shortLabel: string;
  sortValue: SortField;
  urlParam: string;
  isS5: boolean;
  allowSort: boolean;
  // Подсказка под инпутом — только для сигналов с необратимой нормализацией
  hint?: string;
}

export const SIGNALS_META: readonly SignalMeta[] = [
  {
    field: 'score_final',
    label: 'CPMind Score',
    shortLabel: 'Score',
    sortValue: 'scoreFinal',
    urlParam: 'score',
    isS5: false,
    allowSort: true,
  },
  {
    field: 's1_normalized',
    label: 'S1 — Time-in-View',
    shortLabel: 'S1',
    sortValue: 's1Normalized',
    urlParam: 's1',
    isS5: false,
    allowSort: true,
  },
  {
    field: 's2_normalized',
    label: 'S2 — Share of Screen',
    shortLabel: 'S2',
    sortValue: 's2Normalized',
    urlParam: 's2',
    isS5: false,
    allowSort: true,
  },
  {
    field: 's3_normalized',
    label: 'S3 — Scroll Velocity',
    shortLabel: 'S3',
    sortValue: 's3Normalized',
    urlParam: 's3',
    isS5: false,
    allowSort: true,
    hint: 'Нормализованное значение, 0–100',
  },
  {
    field: 's4_normalized',
    label: 'S4 — Tab Activity',
    shortLabel: 'S4',
    sortValue: 's4Normalized',
    urlParam: 's4',
    isS5: false,
    allowSort: true,
  },
  {
    field: 's5_normalized',
    label: 'S5 — Interaction Events',
    shortLabel: 'S5',
    sortValue: 's5Normalized',
    urlParam: 's5',
    isS5: false,
    // isS5: true,
    allowSort: false,
  },
  {
    field: 's7_normalized',
    label: 'S7 — Page Context',
    shortLabel: 'S7',
    sortValue: 's7Normalized',
    urlParam: 's7',
    isS5: false,
    allowSort: true,
    hint: 'Нормализованное значение, 0–100',
  },
];

export function getSignalMeta(field: SignalField): SignalMeta {
  const meta = SIGNALS_META.find((m) => m.field === field);
  if (!meta) throw new Error(`Unknown signal field: ${field}`);
  return meta;
}

// Обратный маппинг нормализованного значения S5 в текстовый лейбл.
// Используется в таблицах вместо числового значения — пользователь видит
// то же что выбирает в фильтре. Пороги >= вместо === для защиты от float4
export function s5NormalizedToLabel(value: number): string {
  if (value >= 100) return 'clicked';
  if (value >= 80) return 'zoom';
  if (value >= 70) return 'swipe';
  if (value >= 60) return 'tap';
  if (value >= 30) return 'hover_500ms';
  if (value >= 20) return 'hover';
  if (value >= 10) return 'proximity';
  return 'none';
}