import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import {
    join,
    resolve,
    normalize,
    basename,
} from 'node:path';
import unzipper from 'unzipper';
import {
    MAX_ZIP_ENTRIES,
    MAX_ZIP_COMPRESSION_RATIO,
    MAX_HTML5_DECOMPRESSED_BYTES,
} from './limits.js';
import { ProcessingError } from '../types.js';

export interface ExtractedArchive {
    destDir: string;
    entryCount: number;
    totalDecompressedBytes: number;
}

function assertSafePath(
    destDir: string,
    entryPath: string,
): string {
    if (entryPath.includes('\0')) {
        throw new ProcessingError(
            'SECURITY_ZIP_NULL_BYTE',
            `ZIP entry contains null byte: ${entryPath}`,
        );
    }

    if (normalize(entryPath).startsWith('/') || /^[a-zA-Z]:[\\/]/.test(entryPath)) {
        throw new ProcessingError(
            'SECURITY_ZIP_ABSOLUTE_PATH',
            `ZIP entry has absolute path: ${entryPath}`,
        );
    }

    const resolvedDest = resolve(destDir);
    const resolvedEntry = resolve(destDir, entryPath);

    if (!resolvedEntry.startsWith(resolvedDest + '/') && resolvedEntry !== resolvedDest) {
        throw new ProcessingError(
            'SECURITY_ZIP_SLIP',
            `ZIP Slip detected: ${entryPath}`,
        );
    }

    return resolvedEntry;
}

function assertCompressionRatio(
    compressedSize: number,
    decompressedSize: number,
    entryPath: string,
): void {
    if (compressedSize <= 0 || decompressedSize <= 0) return;

    const ratio = decompressedSize / compressedSize;

    if (ratio > MAX_ZIP_COMPRESSION_RATIO) {
        throw new ProcessingError(
            'SECURITY_ZIP_BOMB',
            `Suspicious compression ratio ${ratio.toFixed(1)}:1 for entry: ${entryPath}`,
        );
    }
}

export async function extractZip(
    archivePath: string,
    destDir: string,
): Promise<ExtractedArchive> {
    await mkdir(destDir, { recursive: true });

    const resolvedDest = resolve(destDir);
    let entryCount = 0;
    let totalDecompressedBytes = 0;

    const directory = await unzipper.Open.file(archivePath);

    if (directory.files.length > MAX_ZIP_ENTRIES) {
        throw new ProcessingError(
            'SECURITY_ZIP_TOO_MANY_ENTRIES',
            `ZIP has ${directory.files.length} entries, max is ${MAX_ZIP_ENTRIES}`,
        );
    }

    for (const entry of directory.files) {
        const entryPath = entry.path;

        const externalAttrs = (entry as unknown as { externalFileAttributes?: number })
            .externalFileAttributes ?? 0;
        const unixMode = (externalAttrs >>> 16) & 0xffff;
        const isSymlink = (unixMode & 0xf000) === 0xa000;

        if (isSymlink) {
            throw new ProcessingError(
                'SECURITY_ZIP_SYMLINK',
                `ZIP entry is a symlink: ${entryPath}`,
            );
        }

        if (entry.type === 'Directory') {
            const resolvedDir = assertSafePath(resolvedDest, entryPath);
            await mkdir(resolvedDir, { recursive: true });
            continue;
        }

        const compressedSize = entry.compressedSize ?? 0;
        const decompressedSize = entry.uncompressedSize ?? 0;

        assertCompressionRatio(compressedSize, decompressedSize, entryPath);

        const resolvedEntry = assertSafePath(resolvedDest, entryPath);
        const entryDir = resolvedEntry.slice(0, resolvedEntry.lastIndexOf('/'));

        if (entryDir && entryDir !== resolvedDest) {
            await mkdir(entryDir, { recursive: true });
        }

        const writeStream = createWriteStream(resolvedEntry);
        const readStream = entry.stream();
        let bytesWritten = 0;

        await new Promise<void>((resolve2, reject) => {
            readStream.on('data', (chunk: Buffer) => {
                bytesWritten += chunk.length;
                totalDecompressedBytes += chunk.length;

                if (totalDecompressedBytes > MAX_HTML5_DECOMPRESSED_BYTES) {
                    readStream.destroy(
                        new ProcessingError(
                            'SECURITY_ZIP_BOMB',
                            `Decompressed size exceeded ${MAX_HTML5_DECOMPRESSED_BYTES} bytes`,
                        ),
                    );
                }

                if (compressedSize > 0 && bytesWritten > 0) {
                    const ratio = bytesWritten / compressedSize;
                    if (ratio > MAX_ZIP_COMPRESSION_RATIO) {
                        readStream.destroy(
                            new ProcessingError(
                                'SECURITY_ZIP_BOMB',
                                `Runtime compression ratio exceeded for: ${entryPath}`,
                            ),
                        );
                    }
                }
            });

            pipeline(readStream, writeStream)
                .then(() => resolve2())
                .catch(reject);
        });

        entryCount++;
    }

    return {
        destDir: resolvedDest,
        entryCount,
        totalDecompressedBytes,
    };
}