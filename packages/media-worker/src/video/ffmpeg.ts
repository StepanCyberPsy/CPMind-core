import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ProcessingError } from '../types.js';
import type { VideoProfile } from './profiles.js';

const MIN_POSTER_OFFSET_SEC = 0.1;
const PREFERRED_POSTER_OFFSET_SEC = 1.0;
const POSTER_OFFSET_RATIO = 0.3;

function safePosterOffset(durationSec: number): number {
    const fromRatio = durationSec * POSTER_OFFSET_RATIO;
    const preferred = Math.min(fromRatio, PREFERRED_POSTER_OFFSET_SEC);
    return Math.max(preferred, MIN_POSTER_OFFSET_SEC);
}

function formatSs(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
}

async function runFfmpeg(
    args: string[],
    signal: AbortSignal,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', args, { signal });

        let settled = false;
        let stderr = '';

        const settle = (fn: () => void): void => {
            if (!settled) {
                settled = true;
                fn();
            }
        };

        proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
            if (stderr.length > 8_192) {
                stderr = stderr.slice(-8_192);
            }
        });

        proc.on('close', (code) => {
            if (signal.aborted) {
                settle(() => reject(new DOMException('ffmpeg aborted', 'AbortError')));
                return;
            }
            if (code === 0) {
                settle(() => resolve());
            } else {
                settle(() => reject(new ProcessingError(
                    'TRANSCODE_FAILED',
                    `ffmpeg exited ${code}: ${stderr.slice(-512)}`,
                )));
            }
        });

        proc.on('error', (err) => {
            if (signal.aborted || err.name === 'AbortError') {
                settle(() => reject(err));
            } else {
                settle(() => reject(new ProcessingError(
                    'TRANSCODE_FAILED',
                    `ffmpeg spawn error: ${err.message}`,
                )));
            }
        });
    });
}

export async function transcodeVideo(
    inputPath: string,
    outputPath: string,
    profile: VideoProfile,
    hasAudio: boolean,
    signal: AbortSignal,
): Promise<void> {
    signal.throwIfAborted();

    const audioArgs: string[] = hasAudio
        ? ['-c:a', 'aac', '-ar', '44100', '-ac', '2']
        : ['-an'];

    const args = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level:v', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-crf', String(profile.crf),
        '-preset', profile.preset,
        '-vf', `scale=${profile.width}:-2`,
        ...audioArgs,
        '-y',
        outputPath,
    ];

    await runFfmpeg(args, signal);
}

export async function generatePoster(
    inputPath: string,
    tempDir: string,
    durationSec: number,
    signal: AbortSignal,
): Promise<string> {
    signal.throwIfAborted();

    const outputPath = join(tempDir, 'poster.jpg');
    const ssOffset = formatSs(safePosterOffset(durationSec));

    const args = [
        '-ss', ssOffset,
        '-i', inputPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath,
    ];

    await runFfmpeg(args, signal);

    return outputPath;
}