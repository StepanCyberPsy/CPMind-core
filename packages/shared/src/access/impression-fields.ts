import { z } from 'zod';
import { ImpressionRowSchema } from '../schemas/api.js';

// Поля ImpressionRow, доступные роли user. Единый источник истины для API-ответа, CSV-экспорта и выборки колонок из БД на backend
export const USER_VISIBLE_IMPRESSION_FIELDS = [
  'impression_id',
  'campaign_id',
  'creative_id',
  'campaign_name',
  'creative_name',
  'creative_type',
  'format',
  'subtype',
  'device_type',
  'publisher_domain',
  'timestamp_start',
  'timestamp_end',
  's1_normalized',
  's2_normalized',
  's3_normalized',
  's4_normalized',
  's5_normalized',
  's6_normalized',
  's7_normalized',
  'score_final',
  'is_suspicious',
  'ivt_verdict',
  'ivt_category',
  'ivt_confidence',
  'score_reliable',
] as const satisfies readonly (keyof z.infer<typeof ImpressionRowSchema>)[];

export type UserVisibleImpressionField = typeof USER_VISIBLE_IMPRESSION_FIELDS[number];

const userVisibleFieldMask = Object.fromEntries(
  USER_VISIBLE_IMPRESSION_FIELDS.map((field) => [field, true] as const),
) as Record<UserVisibleImpressionField, true>;

// Урезанный контракт ответа API для роли user — производный pick от полного ImpressionRow, не отдельно поддерживаемая копия
export const UserImpressionRowSchema = ImpressionRowSchema.pick(userVisibleFieldMask);

export type UserImpressionRow = z.infer<typeof UserImpressionRowSchema>;

export const UserImpressionListResponseSchema = z.object({
  items: z.array(UserImpressionRowSchema),
  total: z.number().int(),
  pages: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export type UserImpressionListResponse = z.infer<typeof UserImpressionListResponseSchema>;

export function isUserVisibleImpressionField(field: string): field is UserVisibleImpressionField {
  return (USER_VISIBLE_IMPRESSION_FIELDS as readonly string[]).includes(field);
}