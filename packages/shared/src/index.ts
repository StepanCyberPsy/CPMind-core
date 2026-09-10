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
    PublisherDomainAggregateSchema,
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
    fitWeibullMLE,
} from './scoring/weibull_mle_fit.js';
export {
    fitLogisticMLE,
} from './scoring/logistic_mle_fit.js';
export {
    DEFAULT_WEIBULL_PARAMS,
    DEFAULT_LOGISTIC_PARAMS,
    DEFAULT_S4_CONFIGS,
    DEFAULT_S5_DESKTOP,
    DEFAULT_S5_MOBILE_TABLET,
    DEFAULT_S6_LOGISTIC_PARAMS,
    DEFAULT_S7_THRESHOLDS,
} from './scoring/signal_defaults.js';
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

// Креативы
export {
    CreativeTypeSchema,
    CreativeStatusSchema,
    DeviceTypeSchema,
} from './schemas/creative.js';

// Ассеты
export {
    AssetClassSchema,
    AssetStatusSchema,
    AudioConnectionSchema,
    AssetRowSchema,
} from './schemas/asset.js';

// Загрузка
export {
    MAX_UPLOAD_SIZE_BYTES,
    UploadStatusSchema,
    UploadStrategySchema,
    CreateUploadPayloadSchema,
    UploadPartPresignedUrlSchema,
    UploadSessionResponseSchema,
    CompleteMultipartPartSchema,
    CompleteUploadPayloadSchema,
    UploadSessionStatusSchema,
} from './schemas/upload.js';

// Delivery
export {
    DeliveryModeSchema,
    MeasurementModeSchema,
    MeasurementFinalizationReasonSchema,
    AdSessionIdSchema,
    PlayerTimeoutsSchema,
    DeliveryRuntimeConfigSchema,
    DeliverySessionRequestSchema,
    DeliverySessionResponseSchema,
    DeliveryTimingSchema,
    VIDEO_DELIVERY_MODES,
    INSTREAM_DELIVERY_MODES,
    SELF_MOUNTED_DELIVERY_MODES,
} from './schemas/delivery.js';

// Placements
export {
    PlcmtSchema,
    AutoplayModeSchema,
    PlacementRowSchema,
    CreatePlacementPayloadSchema,
    UpdatePlacementPayloadSchema,
    PlacementListResponseSchema,
    PlacementUuidParamSchema,
} from './schemas/placement.js';

// Рекламные сессии
export {
    AdSessionIdentitySchema,
    AdSessionAutoplayOutcomeSchema,
    AdSessionPlayerErrorCodeSchema,
    AdSessionPlaybackQualitySchema,
    AdSessionDeliveryEventTypeSchema,
    DeliveryEventPayloadSchema,
    AdSessionRowSchema,
} from './schemas/ad_session.js';

// Player
export {
    PlayerActionSourceSchema,
    PlayerLifecycleStateSchema,
    PlayerTerminalOutcomeSchema,
    VideoMeasurementEventSchema,
} from './schemas/player.js';

// VAST
export {
    VastVerificationSchema,
    VastTrackingUriTemplateSchema,
    VastMediaFileUrlSchema,
    VastClickThroughUrlSchema,
    VastLinearTrackingEventTypeSchema,
    VastTrackingRequestEventSchema,
    VastErrorCodeSchema,
    VastTrackingEventParamSchema,
    VastTrackingQuerySchema,
    VastTrackingRequestSchema,
    VastTimeOffsetSchema,
    VastTrackingResourceSchema,
    VastMediaFileSchema,
    VastImpressionSchema,
    VastAdSystemSchema,
    VastUniversalAdIdSchema,
    VastClickThroughSchema,
    VastClickTrackingSchema,
    VastVideoClicksSchema,
    VastParsedAdSchema,
} from './schemas/vast.js';

// Типы
export type * from './types/index.js';