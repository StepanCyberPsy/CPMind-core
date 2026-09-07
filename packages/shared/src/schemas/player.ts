import { z } from 'zod';
import { AudioConnectionSchema } from './asset.js';
import { AdSessionPlayerErrorCodeSchema } from './ad_session.js';

// Источник действия player
export const PlayerActionSourceSchema = z.enum([
    'user',
    'player',
    'browser',
    'programmatic',
    'unknown',
]);

// Состояние lifecycle player
export const PlayerLifecycleStateSchema = z.enum([
    'idle',
    'preparing',
    'requesting_vast',
    'loading_media',
    'ready',
    'playing',
    'paused',
    'completed',
    'skipped',
    'errored',
    'handing_off',
    'destroyed',
]);

// Терминальный исход player
export const PlayerTerminalOutcomeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('completed'),
    }).strict(),
    z.object({
        type: z.literal('skipped'),
        source: PlayerActionSourceSchema,
    }).strict(),
    z.object({
        type: z.literal('closed'),
        source: PlayerActionSourceSchema,
    }).strict(),
    z.object({
        type: z.literal('failed'),
        errorCode: AdSessionPlayerErrorCodeSchema,
    }).strict(),
    z.object({
        type: z.literal('timed_out'),
        errorCode: AdSessionPlayerErrorCodeSchema,
    }).strict(),
    z.object({
        type: z.literal('page_unloaded'),
    }).strict(),
    z.object({
        type: z.literal('creative_removed'),
    }).strict(),
    z.object({
        type: z.literal('destroyed'),
    }).strict(),
]);

const PlayerEventTimestampMsSchema = z.number().finite().min(0);
const VideoTimeSecSchema = z.number().finite().min(0);
const VideoDurationSecSchema = z.number().finite().positive();
const VideoVolumeSchema = z.number().finite().min(0).max(1);

const VideoQuartileSchema = z.union([
    z.literal(25),
    z.literal(50),
    z.literal(75),
    z.literal(100),
]);

// Событие video measurement
export const VideoMeasurementEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('play'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('pause'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('resume'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('progress'),
        currentTimeSec: VideoTimeSecSchema,
        durationSec: VideoDurationSecSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('seek'),
        fromSec: VideoTimeSecSchema,
        toSec: VideoTimeSecSchema,
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('mute'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('unmute'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('volume'),
        volume: VideoVolumeSchema,
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('skip'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('complete'),
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('replay'),
        source: PlayerActionSourceSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('duration_known'),
        durationSec: VideoDurationSecSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('quartile'),
        value: VideoQuartileSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
    z.object({
        type: z.literal('audio_connection'),
        connection: AudioConnectionSchema,
        timestampMs: PlayerEventTimestampMsSchema,
    }).strict(),
]).superRefine(
    (event, ctx) => {
        if (
            event.type === 'progress' &&
            event.currentTimeSec > event.durationSec + 0.5
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['currentTimeSec'],
                message: 'currentTimeSec must be less than or equal to durationSec',
            });
        }
    },
);

export type PlayerActionSource = z.infer<typeof PlayerActionSourceSchema>;
export type PlayerLifecycleState = z.infer<typeof PlayerLifecycleStateSchema>;
export type PlayerTerminalOutcome = z.infer<typeof PlayerTerminalOutcomeSchema>;
export type VideoMeasurementEvent = z.infer<typeof VideoMeasurementEventSchema>;