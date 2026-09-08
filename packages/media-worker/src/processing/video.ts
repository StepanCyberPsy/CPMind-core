import { join } from 'node:path';
import sharp from 'sharp';
import { probeVideo } from '../video/ffprobe.js';
import { transcodeVideo, generatePoster } from '../video/ffmpeg.js';
import { selectRenditions } from '../video/profiles.js';
import {
    MAX_VIDEO_DURATION_SEC,
    MAX_VIDEO_WIDTH_PX,
    MAX_VIDEO_HEIGHT_PX,
} from '../security/limits.js';
import {
    ProcessingError,
    type ProcessedFile,
    type ProcessingResult,
} from '../types.js';

async function getPosterMetadata(
    posterPath: string,
): Promise<{ width: number; height: number }> {
    const metadata = await sharp(posterPath, { failOn: 'truncated' }).metadata();
    return {
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
    };
}

export async function processVideo(
    localPath: string,
    tempDir: string,
    signal: AbortSignal,
): Promise<ProcessingResult> {
    signal.throwIfAborted();

    const meta = await probeVideo(localPath, signal);

    if (meta.width > MAX_VIDEO_WIDTH_PX || meta.height > MAX_VIDEO_HEIGHT_PX) {
        throw new ProcessingError(
            'PROCESSING_DIMENSION_EXCEEDED',
            `Video ${meta.width}x${meta.height} exceeds max ${MAX_VIDEO_WIDTH_PX}x${MAX_VIDEO_HEIGHT_PX}`,
        );
    }

    if (meta.durationSec > MAX_VIDEO_DURATION_SEC) {
        throw new ProcessingError(
            'PROCESSING_DURATION_EXCEEDED',
            `Video duration ${meta.durationSec}s exceeds max ${MAX_VIDEO_DURATION_SEC}s`,
        );
    }

    signal.throwIfAborted();

    const renditions = selectRenditions(meta.width);

    if (renditions.length === 0) {
        throw new ProcessingError(
            'PROCESSING_INVALID_VIDEO',
            `No renditions available for source width ${meta.width}px`,
        );
    }

    const files: ProcessedFile[] = [];

    // Транскодируем каждый профиль последовательно
    for (const [index, profile] of renditions.entries()) {

        signal.throwIfAborted();

        const outputPath = join(tempDir, `${profile.name}.mp4`);

        await transcodeVideo(
            localPath,
            outputPath,
            profile,
            meta.hasAudio,
            signal,
        );

        const renditionHeight = Math.round(
            (meta.height / meta.width) * profile.width,
        );

        files.push({
            localPath: outputPath,
            assetClass: 'video',
            mimeType: 'video/mp4',
            extension: 'mp4',
            role: index === 0 ? 'source' : profile.role,
            priority: profile.priority,
            width: profile.width,
            height: renditionHeight % 2 === 0 ? renditionHeight : renditionHeight + 1,
            durationSec: meta.durationSec,
            codec: 'h264',
            bitrateBps: meta.bitrateKbps * 1000,
        });
    }

    signal.throwIfAborted();

    const posterPath = await generatePoster(
        localPath,
        tempDir,
        meta.durationSec,
        signal
    );
    const posterMeta = await getPosterMetadata(posterPath);

    files.push({
        localPath: posterPath,
        assetClass: 'video_poster',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        role: 'poster',
        priority: 99,
        width: posterMeta.width,
        height: posterMeta.height,
    });

    return {
        sha256: '',
        files,
    };
}