import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { MAX_IMAGE_DIMENSION_PX } from '../security/limits.js';
import {
    ProcessingError,
    type ProcessingResult,
} from '../types.js';

const LIMIT_PIXELS = MAX_IMAGE_DIMENSION_PX * MAX_IMAGE_DIMENSION_PX;

export async function processGif(
    localPath: string,
    tempDir: string,
    signal: AbortSignal,
): Promise<ProcessingResult> {
    signal.throwIfAborted();

    const metadata = await sharp(localPath, {
        failOn: 'truncated',
        limitInputPixels: LIMIT_PIXELS,
        animated: true,
    }).metadata();

    if (metadata.format !== 'gif') {
        throw new ProcessingError(
            'PROCESSING_INVALID_IMAGE',
            `Expected GIF, got: ${metadata.format ?? 'unknown'}`,
        );
    }

    if (!metadata.width || !metadata.height) {
        throw new ProcessingError(
            'PROCESSING_INVALID_IMAGE',
            'Cannot read GIF dimensions',
        );
    }

    if (
        metadata.width > MAX_IMAGE_DIMENSION_PX ||
        metadata.height > MAX_IMAGE_DIMENSION_PX
    ) {
        throw new ProcessingError(
            'PROCESSING_DIMENSION_EXCEEDED',
            `GIF ${metadata.width}x${metadata.height} exceeds max ${MAX_IMAGE_DIMENSION_PX}px`,
        );
    }

    signal.throwIfAborted();

    // GIF сохраняется as-is: re-encoding нарушит точность animation timing и palette
    const outputPath = join(tempDir, 'processed.gif');
    await copyFile(localPath, outputPath);

    return {
        sha256: '',
        files: [{
            localPath: outputPath,
            assetClass: 'animated_image',
            mimeType: 'image/gif',
            extension: 'gif',
            role: 'source',
            priority: 0,
            width: metadata.width,
            height: metadata.height,
        }],
    };
}