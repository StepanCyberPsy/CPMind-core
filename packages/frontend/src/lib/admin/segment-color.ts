export interface SegmentColor {
  border: string;
  text: string;
  bg: string;
}

const SEGMENT_PALETTE: readonly SegmentColor[] = [
  { border: '#2563eb', text: '#1d4ed8', bg: '#eff6ff' },
  { border: '#7c3aed', text: '#6d28d9', bg: '#f5f3ff' },
  { border: '#0891b2', text: '#0e7490', bg: '#ecfeff' },
  { border: '#059669', text: '#047857', bg: '#ecfdf5' },
  { border: '#d97706', text: '#b45309', bg: '#fffbeb' },
  { border: '#db2777', text: '#be185d', bg: '#fdf2f8' },
  { border: '#4f46e5', text: '#4338ca', bg: '#eef2ff' },
  { border: '#0d9488', text: '#0f766e', bg: '#f0fdfa' },
];

interface SegmentRow {
  session_group_id: string;
}

// Цвет назначается только группам с более чем одним сегментом среди переданных строк — одиночному сегменту нечего визуально отличать. Последовательное назначение по порядку первого появления в текущем наборе строк, не хэш от uuid — гарантирует отсутствие коллизий, пока количество фрагментированных групп в наборе не превышает размер палитры; при превышении — циклический повтор как осознанный, не случайный исход
export function buildSegmentColorMap(rows: readonly SegmentRow[]): Map<string, SegmentColor> {
  const occurrences = new Map<string, number>();
  for (const row of rows) {
    occurrences.set(row.session_group_id, (occurrences.get(row.session_group_id) ?? 0) + 1);
  }

  const colorMap = new Map<string, SegmentColor>();
  let nextIndex = 0;

  for (const row of rows) {
    const id = row.session_group_id;
    if (colorMap.has(id)) continue;
    if ((occurrences.get(id) ?? 0) <= 1) continue;

    colorMap.set(id, SEGMENT_PALETTE[nextIndex % SEGMENT_PALETTE.length]!);
    nextIndex += 1;
  }

  return colorMap;
}