import { readFile, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import archiver from 'archiver';
import { extractZip } from '../security/archive.js';
import {
    MAX_HTML5_COMPRESSED_BYTES,
} from '../security/limits.js';
import { getCdnBaseUrl } from '../config.js';
import { ProcessingError, type ProcessingResult } from '../types.js';

const INDEX_HTML = 'index.html';
const BRIDGE_VERSION = 'v1';

function buildBridgeScriptTag(cdnBaseUrl: string): string {
    const url = `${cdnBaseUrl}/runtime/cpmind-creative-bridge_${BRIDGE_VERSION}.min.js`;
    return `<script src="${url}"></script>`;
}

function injectBridgeScript(
    htmlContent: string,
    scriptTag: string,
): string {
    const bodyCloseRegex = /<\/body\s*>/i;
    const match = bodyCloseRegex.exec(htmlContent);

    if (match) {
        const insertAt = match.index;
        return (
            htmlContent.slice(0, insertAt) +
            `\n${scriptTag}\n` +
            htmlContent.slice(insertAt)
        );
    }

    return `${htmlContent}\n${scriptTag}\n`;
}

async function repackZip(
    sourceDir: string,
    outputPath: string,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const output = createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        void archive.finalize();
    });
}

export async function processHtml5(
    localPath: string,
    tempDir: string,
    signal: AbortSignal,
): Promise<ProcessingResult> {
    signal.throwIfAborted();

    // Проверка размера сжатого архива до extraction
    const compressedSize = statSync(localPath).size;
    if (compressedSize > MAX_HTML5_COMPRESSED_BYTES) {
        throw new ProcessingError(
            'PROCESSING_SIZE_EXCEEDED',
            `HTML5 ZIP compressed size ${compressedSize} exceeds max ${MAX_HTML5_COMPRESSED_BYTES} bytes`,
        );
    }

    const extractDir = join(tempDir, 'extracted');
    await extractZip(localPath, extractDir);

    signal.throwIfAborted();

    const indexPath = join(extractDir, INDEX_HTML);
    let indexContent: string;

    try {
        indexContent = await readFile(indexPath, 'utf8');
    } catch {
        throw new ProcessingError(
            'HTML5_MISSING_INDEX',
            'HTML5 bundle must contain index.html at root level',
        );
    }

    const cdnBaseUrl = getCdnBaseUrl();
    const scriptTag = buildBridgeScriptTag(cdnBaseUrl);
    const injected = injectBridgeScript(indexContent, scriptTag);

    await writeFile(indexPath, injected, 'utf8');

    signal.throwIfAborted();

    const outputPath = join(tempDir, 'bundle.zip');
    await repackZip(extractDir, outputPath);

    signal.throwIfAborted();

    const outputSize = statSync(outputPath).size;

    return {
        sha256: '',
        files: [{
            localPath: outputPath,
            assetClass: 'html_file',
            mimeType: 'application/zip',
            extension: 'zip',
            role: 'source',
            priority: 0,
        }],
    };
}