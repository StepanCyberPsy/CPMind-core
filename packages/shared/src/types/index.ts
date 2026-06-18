// Re-export всех публичных типов для удобства импорта

export type {
  ImpressionPayload,
  SignalsS1, SignalsS2, SignalsS3, SignalsS4, SignalsS5, SignalsS7,
  Presence,
} from '../schemas/impression.js';

export type {
  LoginPayload,
} from '../schemas/auth.js';

export type {
  ImpressionRow,
  ImpressionDetail,
  ImpressionListResponse,
  WeightConfigRow,
} from '../schemas/api.js';

export type {
  ScoreResult,
} from '../scoring/score.js';

export type {
  WeightsConfig,
  WeightsValues,
  EffectiveWeights,
} from '../scoring/weights.js';