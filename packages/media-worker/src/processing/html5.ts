import {
    readdir,
    readFile,
    writeFile,
} from 'node:fs/promises';
import { statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
    extname,
    join,
    relative,
    sep,
} from 'node:path';
import { extractZip } from '../security/archive.js';
import {
    MAX_HTML5_COMPRESSED_BYTES,
} from '../security/limits.js';
import { getBridgeVersion, getCdnBaseUrl } from '../config.js';
import { uploadProcessedFile } from '../storage/assets.js';
import { html5BundleKey } from '../storage/keys.js';
import { computeFileSha256 } from '../hashing/sha256.js';
import { ProcessingError, type ProcessingResult } from '../types.js';

const INDEX_HTML = 'index.html';
const INDEX_CONTENT_TYPE = 'text/html; charset=utf-8';
const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

// Content-Type проставляется на каждый объект при загрузке: creative.cpmind.tech
// проксирует Object Storage напрямую, а X-Content-Type-Options: nosniff запрещает
// браузеру угадывать тип — без явного значения скрипты и стили бандла не применятся
const BUNDLE_CONTENT_TYPES: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
};

interface BundleFile {
    relativePath: string;
    localPath: string;
    sha256: string;
    sizeBytes: number;
}

function resolveContentType(relativePath: string): string {
    const extension = extname(relativePath).toLowerCase();
    return BUNDLE_CONTENT_TYPES[extension] ?? FALLBACK_CONTENT_TYPE;
}

function buildBridgeScriptTag(
    cdnBaseUrl: string,
    bridgeVersion: string,
): string {
    const url = `${cdnBaseUrl}/runtime/cpmind-creative-bridge_v${bridgeVersion}.min.js`;
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

// Обход только обычных файлов: extractZip уже отвергает симлинки, isFile()
// дополнительно отсекает всё, что не является регулярным файлом
async function collectBundleFiles(
    rootDir: string,
    currentDir: string,
    files: BundleFile[],
): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
        const localPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
            await collectBundleFiles(rootDir, localPath, files);
            continue;
        }

        if (!entry.isFile()) continue;

        files.push({
            relativePath: relative(rootDir, localPath).split(sep).join('/'),
            localPath,
            sha256: await computeFileSha256(localPath),
            sizeBytes: statSync(localPath).size,
        });
    }
}

// Дайджест дерева: отсортированные пары путь/хеш. Одинаковое содержимое бандла
// всегда даёт один и тот же ключ, поэтому дедупликация по sha256 корректна —
// хеш одного index.html такой гарантии не даёт
function computeBundleSha256(files: BundleFile[]): string {
    const hash = createHash('sha256');

    for (const file of files) {
        hash.update(file.relativePath);
        hash.update('\0');
        hash.update(file.sha256);
        hash.update('\n');
    }

    return hash.digest('hex');
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

    const scriptTag = buildBridgeScriptTag(getCdnBaseUrl(), getBridgeVersion());
    const injected = injectBridgeScript(indexContent, scriptTag);

    await writeFile(indexPath, injected, 'utf8');

    signal.throwIfAborted();

    const files: BundleFile[] = [];
    await collectBundleFiles(extractDir, extractDir, files);

    if (files.length === 0) {
        throw new ProcessingError(
            'PROCESSING_OUTPUT_INVALID',
            'HTML5 bundle contains no files after extraction',
        );
    }

    files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));

    const entryFile = files.find((file) => file.relativePath === INDEX_HTML);

    if (entryFile === undefined) {
        throw new ProcessingError(
            'HTML5_MISSING_INDEX',
            'HTML5 bundle must contain index.html at root level',
        );
    }

    const bundleSha256 = computeBundleSha256(files);
    const bundleSizeBytes = files.reduce(
        (total, file) => total + file.sizeBytes,
        0,
    );

    for (const file of files) {
        signal.throwIfAborted();

        await uploadProcessedFile(
            file.localPath,
            html5BundleKey(bundleSha256, file.relativePath),
            resolveContentType(file.relativePath),
        );
    }

    return {
        sha256: bundleSha256,
        files: [{
            localPath: entryFile.localPath,
            assetClass: 'html_file',
            mimeType: INDEX_CONTENT_TYPE,
            extension: 'html',
            role: 'source',
            priority: 0,
            bundle: {
                sha256: bundleSha256,
                storageKey: html5BundleKey(bundleSha256, INDEX_HTML),
                sizeBytes: bundleSizeBytes,
            },
        }],
    };
}