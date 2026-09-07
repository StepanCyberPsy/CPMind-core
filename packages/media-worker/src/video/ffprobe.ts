import { spawn } from 'node:child_process';
import { ProcessingError } from '../types.js';

const SUPPORTED_CODECS = new Set([
    'h264',
    'vp8',
    'vp9',
    'mpeg4',
    'theora',
    'mpeg2video',
    'mjpeg',
]);

const REJECTED_CODECS = new Set([
    'hevc',
    'av1',
    'vp10',
]);

export interface VideoMetadata {
    width: number;
    height: number;
    durationSec: number;
    codec: string;
    hasAudio: boolean;
    bitrateKbps: number;
}

interface FfprobeStream {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    duration?: string;
    bit_rate?: string;
}

interface FfprobeFormat {
    duration?: string;
    bit_rate?: string;
}

interface FfprobeOutput {
    streams: FfprobeStream[];
    format: FfprobeFormat;
}

async function runFfprobe(
    inputPath: string,
    signal: AbortSignal,
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const proc = spawn(
            'ffprobe',
            [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_streams',
                '-show_format',
                inputPath,
            ],
            { signal },
        );

        let settled = false;
        let stdout = '';
        let stderr = '';

        const settle = (fn: () => void): void => {
            if (!settled) {
                settled = true;
                fn();
            }
        };

        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            if (signal.aborted) {
                settle(() => reject(new DOMException('ffprobe aborted', 'AbortError')));
                return;
            }
            if (code === 0) {
                settle(() => resolve(stdout));
            } else {
                settle(() => reject(new ProcessingError(
                    'VIDEO_PROBE_FAILED',
                    `ffprobe exited ${code}: ${stderr.slice(-512)}`,
                )));
            }
        });

        proc.on('error', (err) => {
            if (signal.aborted || err.name === 'AbortError') {
                settle(() => reject(err));
            } else {
                settle(() => reject(new ProcessingError(
                    'VIDEO_PROBE_FAILED',
                    `ffprobe spawn error: ${err.message}`,
                )));
            }
        });
    });
}

export async function probeVideo(
    inputPath: string,
    signal: AbortSignal,
): Promise<VideoMetadata> {
    signal.throwIfAborted();

    const raw = await runFfprobe(inputPath, signal);

    let parsed: FfprobeOutput;
    try {
        parsed = JSON.parse(raw) as FfprobeOutput;
    } catch {
        throw new ProcessingError('VIDEO_PROBE_FAILED', 'ffprobe returned invalid JSON');
    }

    const videoStream = parsed.streams.find((s) => s.codec_type === 'video');
    if (!videoStream) {
        throw new ProcessingError('VIDEO_PROBE_FAILED', 'No video stream found');
    }

    const codec = videoStream.codec_name.toLowerCase();

    if (REJECTED_CODECS.has(codec)) {
        throw new ProcessingError(
            'UNSUPPORTED_CODEC',
            `Codec ${codec} is not supported in v1`,
        );
    }

    if (!SUPPORTED_CODECS.has(codec)) {
        throw new ProcessingError(
            'UNSUPPORTED_CODEC',
            `Codec ${codec} is not in the supported list`,
        );
    }

    const { width, height } = videoStream;
    if (!width || !height) {
        throw new ProcessingError('VIDEO_PROBE_FAILED', 'Cannot read video dimensions');
    }

    const durationRaw = videoStream.duration ?? parsed.format.duration;
    const durationSec = durationRaw ? parseFloat(durationRaw) : 0;

    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new ProcessingError('VIDEO_PROBE_FAILED', 'Cannot read video duration');
    }

    const bitrateRaw = videoStream.bit_rate ?? parsed.format.bit_rate;
    const bitrateKbps = bitrateRaw
        ? Math.round(parseInt(bitrateRaw, 10) / 1000)
        : 0;

    const hasAudio = parsed.streams.some((s) => s.codec_type === 'audio');

    return { width, height, durationSec, codec, hasAudio, bitrateKbps };
}