import { z } from 'zod';

export const IvtVerdictSchema = z.enum([
  'valid',
  'givt',
  'sivt_suspected',
  'sivt_confirmed',
]);

export type IvtVerdict = z.infer<typeof IvtVerdictSchema>;

export const IvtListEntrySchema = z.object({
  type: z.enum(['ua', 'ip']),
  pattern: z.string().min(1),
  match_type: z.enum(['exact', 'substring', 'regex', 'cidr']),
  category: z.string().min(1),
  reason: z.string().optional(),
  source: z.enum(['iab', 'arir', 'own']).optional(),
}).refine(
  (e) => (e.type === 'ip') === (e.match_type === 'cidr'),
  { message: 'ip → cidr; ua → exact|substring|regex' },
);

export type IvtListEntry = z.infer<typeof IvtListEntrySchema>;

export const IvtThresholdsSchema = z.object({
  timing_variance_min_ms: z.number().nonnegative().nullable(),
  cursor_entropy_min: z.number().min(0).max(1).nullable(),
  click_without_hover: z.boolean().nullable(),
  repeat_fp_window_min: z.number().positive().nullable(),
  repeat_fp_max_creatives: z.number().int().positive().nullable(),
  confidence_confirm: z.number().min(0).max(1).nullable(),
});

export type IvtThresholds = z.infer<typeof IvtThresholdsSchema>;

export const DEFAULT_IVT_THRESHOLDS: IvtThresholds = {
  timing_variance_min_ms: null,
  cursor_entropy_min: null,
  click_without_hover: null,
  repeat_fp_window_min: null,
  repeat_fp_max_creatives: null,
  confidence_confirm: null,
};

export const IvtListConfigRowSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  entriesCount: z.number().int(),
  createdAt: z.string(),
});

export type IvtListConfigRow = z.infer<typeof IvtListConfigRowSchema>;

export const IvtListConfigListResponseSchema = z.array(IvtListConfigRowSchema);

export type IvtListConfigListResponse = z.infer<typeof IvtListConfigListResponseSchema>;

export const IvtThresholdsConfigRowSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  thresholds: IvtThresholdsSchema,
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type IvtThresholdsConfigRow = z.infer<typeof IvtThresholdsConfigRowSchema>;

export const IvtThresholdsConfigListResponseSchema = z.array(IvtThresholdsConfigRowSchema);

export type IvtThresholdsConfigListResponse = z.infer<typeof IvtThresholdsConfigListResponseSchema>;