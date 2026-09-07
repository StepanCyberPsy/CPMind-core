import { open } from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';

const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/zip',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
]);

const SVG_PEEK_BYTES = 512;

const SVG_SIGNATURES = [
    Buffer.from('<?xml', 'utf8'),
    Buffer.from('<svg', 'utf8'),
    Buffer.from('\xEF\xBB\xBF<?xml', 'utf8'),  // UTF-8 BOM + <?xml
    Buffer.from('\xEF\xBB\xBF<svg', 'utf8'),   // UTF-8 BOM + <svg
];

async function peekFileBytes(
    localPath: string,
    byteCount: number,
): Promise<Buffer> {
    const handle = await open(localPath, 'r');
    try {
        const buffer = Buffer.alloc(byteCount);
        const { bytesRead } = await handle.read(buffer, 0, byteCount, 0);
        return buffer.slice(0, bytesRead);
    } finally {
        await handle.close();
    }
}

function hasSvgSignature(buffer: Buffer): boolean {
    const trimmed = skipWhitespaceBytes(buffer);
    return SVG_SIGNATURES.some(
        (sig) =>
            trimmed.length >= sig.length &&
            trimmed.slice(0, sig.length).equals(sig),
    );
}

function skipWhitespaceBytes(buffer: Buffer): Buffer {
    let start = 0;
    while (start < buffer.length) {
        const byte = buffer[start];
        if (
            byte === 0x09 || // \t
            byte === 0x0a || // \n
            byte === 0x0d || // \r
            byte === 0x20    // space
        ) {
            start++;
        } else {
            break;
        }
    }
    return buffer.slice(start);
}

async function verifySvgBySignature(localPath: string): Promise<boolean> {
    const bytes = await peekFileBytes(localPath, SVG_PEEK_BYTES);
    return hasSvgSignature(bytes);
}

export async function detectMime(
    localPath: string,
    declaredMime: string,
): Promise<string> {
    if (declaredMime === 'image/svg+xml') {
        const confirmed = await verifySvgBySignature(localPath);
        if (!confirmed) {
            throw new Error(`File declared as SVG but content is not XML: ${localPath}`);
        }
        return 'image/svg+xml';
    }

    const detected = await fileTypeFromFile(localPath);

    if (!detected) {
        throw new Error(`Cannot detect MIME type for file: ${localPath}`);
    }

    return detected.mime;
}

export function isAllowedMime(mime: string): boolean {
    return ALLOWED_MIMES.has(mime);
}