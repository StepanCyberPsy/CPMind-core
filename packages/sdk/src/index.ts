// Public API
export {
    prepareMeasurementSession,
} from './public_api.js';
export type {
    MeasurementSession,
    MeasurementSessionState,
    PrepareMeasurementSessionInput,
    VideoSessionInitialState,
} from './public_api.js';

// Types
export type {
    Session,
    SdkSignalConfig,
    S6AccumulatorState,
    S6RawData,
    SignalsS3State,
    VisibilityEntry,
} from './types.js';

// Session
export {
    createSession,
    buildPayload,
    resetSessionForNewSegment,
    computeActiveTimeMsInRange,
} from './session.js';
export type {
    SessionPayloadMeta,
    CreateSessionInput,
    BuildPayloadOptions,
} from './session.js';

// Segment
export { startNewSegment } from './segment.js';

// Runtime config
export {
    createDefaultRuntimeConfig,
    applyServerRuntimeConfig,
    DEFAULT_PLAYER_TIMEOUTS,
} from './runtime_config.js';
export type { SdkRuntimeConfig } from './runtime_config.js';

// Signals — init
export { initS1, resetSegmentS1 } from './signals/s1.js';
export { initS2, resetSegmentS2 } from './signals/s2.js';
export { initS3, resetSegmentS3 } from './signals/s3.js';
export { initS4, resetSegmentS4 } from './signals/s4.js';
export {
    initS5,
    resetSegmentS5,
    recordFrameInteraction,
} from './signals/s5.js';
export { initS7, resetSegmentS7 } from './signals/s7.js';
export { initPresence } from './signals/presence.js';
export type { PresenceHandle } from './signals/presence.js';

// Signals — S6 accumulator
export {
    createS6AccumulatorState,
    onS6Play,
    onS6Pause,
    onS6Ended,
    onS6TimeUpdate,
    onS6Seeking,
    onS6Seeked,
    onS6VolumeChange,
    onS6Skip,
    onS6LoadedMetadata,
    onS6AudioConnectionDetected,
    getS6Data,
    resetS6Accumulator,
} from './signals/s6.js';

// Signals — utilities
export { collectFpHash } from './signals/headless.js';
export { waitForFirstFrame } from './signals/frame.js';

// Signals — HTML5 frame interactions
export {
    classifyFrameInteraction,
    FRAME_ENGAGEMENT_WINDOW_MS,
} from './signals/frame_trust.js';
export type {
    FrameInteractionKind,
    FrameInteractionTrust,
    FrameTrustObservation,
} from './signals/frame_trust.js';

// Transport
export {
    finalizeAndSend,
    attachUnloadHandlers,
    sendDeliveryEvent,
} from './transport/send.js';
export type {
    SendKind,
    SendOptions,
} from './transport/send.js';

// Utils
export { generateUUID } from './utils/uuid.js';
export { detectDeviceType } from './utils/device.js';
export {
    getPublisherDomain,
    isValidPublisherDomain,
} from './utils/publisher_domain.js';

// Surface
export { MeasurementSurface } from './surface/surface.js';
export { MeasuredElement } from './surface/element.js';

// Debug
export { DebugOverlay } from './debug/overlay.js';