import type { SortField } from '@/lib/shared/types';

export type SignalField =
  | 'score_final'
  | 's1_normalized'
  | 's2_normalized'
  | 's3_normalized'
  | 's4_normalized'
  | 's5_normalized'
  | 's7_normalized';

export interface SignalMeta {
  field: SignalField;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  urlParam: string;
  sortValue: SortField;
}

export const SIGNALS_META: readonly SignalMeta[] = [
  { field: 'score_final', label: 'CPMind Score', shortLabel: 'Score', min: 0, max: 100, urlParam: 'score', sortValue: 'scoreFinal' },
  { field: 's1_normalized', label: 'S1 — Time-in-View', shortLabel: 'S1', min: 0, max: 100, urlParam: 's1', sortValue: 's1Normalized' },
  { field: 's2_normalized', label: 'S2 — Share of Screen', shortLabel: 'S2', min: 0, max: 100, urlParam: 's2', sortValue: 's2Normalized' },
  { field: 's3_normalized', label: 'S3 — Scroll Velocity', shortLabel: 'S3', min: 0, max: 100, urlParam: 's3', sortValue: 's3Normalized' },
  { field: 's4_normalized', label: 'S4 — Tab Activity', shortLabel: 'S4', min: 0, max: 100, urlParam: 's4', sortValue: 's4Normalized' },
  { field: 's5_normalized', label: 'S5 — Interaction Events', shortLabel: 'S5', min: 0, max: 100, urlParam: 's5', sortValue: 's5Normalized' },
  { field: 's7_normalized', label: 'S7 — Page Context', shortLabel: 'S7', min: 0, max: 100, urlParam: 's7', sortValue: 's7Normalized' },
];

// Единая точка получения метаданных по полю — переиспользуется в ImpressionsTable и RecalibrationTable, не дублируется в каждом
export function getSignalMeta(field: SignalField): SignalMeta {
  const meta = SIGNALS_META.find((m) => m.field === field);
  if (!meta) throw new Error(`Unknown signal field: ${field}`);
  return meta;
}