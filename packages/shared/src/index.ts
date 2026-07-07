// Схемы
export {
    ImpressionPayloadSchema,
    SignalsS6Schema
} from './schemas/impression.js';
export {
    LoginSchema,
    MePayloadSchema,
} from './schemas/auth.js';
export {
    ImpressionRowSchema,
    ImpressionDetailSchema,
    ImpressionListResponseSchema,
    WeightConfigRowSchema,
} from './schemas/api.js';
export {
    UserRoleSchema,
    UserUuidSchema,
    UserSchema,
    UserListResponseSchema,
    UserStatsRowSchema,
    UserStatsListResponseSchema,
    UserCampaignStatsRowSchema,
    UserCampaignStatsListResponseSchema,
    CreateUserPayloadSchema,
    UpdateUserPayloadSchema,
    UserUuidParamSchema,
} from './schemas/user.js';
export {
    TagUuidSchema,
    TagSchema,
    TagListResponseSchema,
    CreateTagPayloadSchema,
    UpdateTagPayloadSchema,
    TagUuidParamSchema,
} from './schemas/tag.js';
export {
    CalibrationBatchIdSchema,
    CalibrationItemIdSchema,
    CalibrationBatchStatusSchema,
    CalibrationItemStatusSchema,
    CalibrationSelectionSchema,
    CreateCalibrationPayloadSchema,
    CalibrationBatchSchema,
    CalibrationBatchListResponseSchema,
    CalibrationItemSchema,
    CalibrationItemListResponseSchema,
    ApproveCalibrationItemsPayloadSchema,
    ApproveCalibrationResultSchema,
    CalibrationBatchIdParamSchema,
    CalibrationItemIdParamSchema,
} from './schemas/calibration.js';
export {
    TagConstantsConfigIdSchema,
    TagConstantsValuesSchema,
    TagConstantsConfigSchema,
    TagConstantsConfigListResponseSchema,
    CreateTagConstantsPayloadSchema,
    TagConstantsConfigIdParamSchema,
    DEFAULT_TAG_CONSTANTS,
    TAG_BUILD_TARGETS,
} from './schemas/tag-constants.js';

// Доступ
export {
    USER_VISIBLE_IMPRESSION_FIELDS,
    UserImpressionRowSchema,
    UserImpressionListResponseSchema,
    isUserVisibleImpressionField,
} from './access/impression-fields.js';

// Скоринг
export { applyAnomalyCapping } from './scoring/capping.js';
export {
    normalizeS1,
    normalizeS2,
    normalizeS3,
    normalizeS4,
    normalizeS5,
    normalizeS6,
    normalizeS7,
    normalizeAll,
    getS5TopEventLabel,
} from './scoring/normalize.js';
export {
    DEFAULT_BANNER_WEIGHTS,
    DEFAULT_VIDEO_WEIGHTS,
    computeEffectiveWeights,
    detectNullSignals,
} from './scoring/weights.js';
export {
    computeScore,
    recomputeScoreFromNormalized,
} from './scoring/score.js';
export {
    classifyIvtSync,
} from './scoring/ivt.js';

// Типы
// Схемы IVT
export {
    IvtVerdictSchema,
    IvtListEntrySchema,
    IvtThresholdsSchema,
    IvtListConfigRowSchema,
    IvtListConfigListResponseSchema,
    IvtThresholdsConfigRowSchema,
    IvtThresholdsConfigListResponseSchema,
    DEFAULT_IVT_THRESHOLDS,
} from './schemas/ivt.js';

// Типы
export type * from './types/index.js';