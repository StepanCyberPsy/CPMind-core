import { join } from 'node:path';
import sharp from 'sharp';
import { MAX_IMAGE_DIMENSION_PX } from '../security/limits.js';
import {
    ProcessingError,
    type ProcessingResult,
} from '../types.js';

const LIMIT_PIXELS = MAX_IMAGE_DIMENSION_PX * MAX_IMAGE_DIMENSION_PX;

const FORMAT_CONFIG = {
    jpeg: {
        ext: 'jpg',
        mime: 'image/jpeg'
    },
    png: {
        ext: 'png',
        mime: 'image/png'
    },
    webp: {
        ext: 'webp',
        mime: 'image/webp'
    },
} as const;

type SupportedFormat = keyof typeof FORMAT_CONFIG;

function isSupportedFormat(f: string | undefined): f is SupportedFormat {
    return f !== undefined && f in FORMAT_CONFIG;
}

export async function processStaticImage(
    localPath: string,
    tempDir: string,
    signal: AbortSignal,
): Promise<ProcessingResult> {
    signal.throwIfAborted();

    const metadata = await sharp(localPath, {
        failOn: 'truncated',
        limitInputPixels: LIMIT_PIXELS,
        sequentialRead: true,
    }).metadata();

    if (!isSupportedFormat(metadata.format)) {
        throw new ProcessingError(
            'PROCESSING_INVALID_IMAGE',
            `Unsupported image format: ${metadata.format ?? 'unknown'}`,
        );
    }

    if (!metadata.width || !metadata.height) {
        throw new ProcessingError('PROCESSING_INVALID_IMAGE', 'Cannot read image dimensions');
    }

    if (metadata.width > MAX_IMAGE_DIMENSION_PX || metadata.height > MAX_IMAGE_DIMENSION_PX) {
        throw new ProcessingError(
            'PROCESSING_DIMENSION_EXCEEDED',
            `Image ${metadata.width}x${metadata.height} exceeds max ${MAX_IMAGE_DIMENSION_PX}px`,
        );
    }

    signal.throwIfAborted();

    const { ext, mime } = FORMAT_CONFIG[metadata.format];
    const outputPath = join(tempDir, `processed.${ext}`);

    const pipeline = sharp(localPath, {
        failOn: 'truncated',
        limitInputPixels: LIMIT_PIXELS,
        sequentialRead: true,
    });

    if (metadata.format === 'jpeg') {
        await pipeline
            .jpeg({ quality: 90, progressive: true, mozjpeg: false })
            .toFile(outputPath);
    } else if (metadata.format === 'png') {
        await pipeline
            .png({ compressionLevel: 9 })
            .toFile(outputPath);
    } else {
        await pipeline
            .webp({ quality: 90 })
            .toFile(outputPath);
    }

    return {
        sha256: '',
        files: [{
            localPath: outputPath,
            assetClass: 'image',
            mimeType: mime,
            extension: ext,
            role: 'source',
            priority: 0,
            width: metadata.width,
            height: metadata.height,
        }],
    };
}