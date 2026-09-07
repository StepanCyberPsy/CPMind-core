import type {
    UploadSessionResponse,
    UploadPartPresignedUrl,
    CompleteMultipartPart,
} from '@cpmind/shared';

const PART_CONCURRENCY = 4;

// XHR PUT одной части или целого файла.
// fetch не предоставляет upload progress — XHR обязателен.
// Возвращает ETag из ответа Object Storage (нужен для CompleteMultipartUpload)
function uploadChunkXhr(
    url: string,
    data: Blob,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
            if (e.lengthComputable) onProgress(e.loaded, e.total);
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // Object Storage возвращает ETag в кавычках — нормализуем
                const raw = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('Etag') ?? '';
                resolve(raw.replace(/^"|"$/g, ''));
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Upload network error'));
        });

        xhr.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
        });

        signal.addEventListener('abort', () => xhr.abort(), { once: true });

        xhr.open('PUT', url);
        xhr.send(data);
    });
}

// Параллельная загрузка частей с ограничением PART_CONCURRENCY.
// Прогресс агрегируется по всем активным частям на основе byte offsets
async function uploadFileMultipart(
    parts: readonly UploadPartPresignedUrl[],
    file: File,
    onProgress: (pct: number) => void,
    signal: AbortSignal,
): Promise<CompleteMultipartPart[]> {
    const partCount = parts.length;
    const partSize = Math.ceil(file.size / partCount);
    const loadedPerPart = new Map<number, number>();
    const results: CompleteMultipartPart[] = [];

    function emitProgress(): void {
        let totalLoaded = 0;
        for (const loaded of loadedPerPart.values()) totalLoaded += loaded;
        onProgress(Math.min(100, Math.round((totalLoaded / file.size) * 100)));
    }

    for (let batchStart = 0; batchStart < partCount; batchStart += PART_CONCURRENCY) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const batch = parts.slice(batchStart, batchStart + PART_CONCURRENCY);

        const batchResults = await Promise.all(
            batch.map((part) => {
                const byteStart = (part.partNumber - 1) * partSize;
                const byteEnd = Math.min(byteStart + partSize, file.size);
                const chunk = file.slice(byteStart, byteEnd);

                loadedPerPart.set(part.partNumber, 0);

                return uploadChunkXhr(
                    part.uploadUrl,
                    chunk,
                    (loaded) => {
                        loadedPerPart.set(part.partNumber, loaded);
                        emitProgress();
                    },
                    signal,
                ).then((etag): CompleteMultipartPart => ({
                    partNumber: part.partNumber,
                    etag,
                }));
            }),
        );

        results.push(...batchResults);
    }

    // Возвращаем в порядке partNumber — Object Storage требует строгого порядка
    return results.sort((a, b) => a.partNumber - b.partNumber);
}

// Загрузка одного файла целиком через presigned PUT URL
async function uploadFileSingle(
    uploadUrl: string,
    file: File,
    onProgress: (pct: number) => void,
    signal: AbortSignal,
): Promise<void> {
    await uploadChunkXhr(
        uploadUrl,
        file,
        (loaded, total) => {
            onProgress(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0);
        },
        signal,
    );
}

// Оркестратор: определяет стратегию из session и выполняет загрузку.
// Возвращает ETags для multipart (передаются в completeUploadSession),
// null для single (complete вызывается без частей)
export async function uploadFile(
    session: UploadSessionResponse,
    file: File,
    onProgress: (pct: number) => void,
    signal: AbortSignal,
): Promise<CompleteMultipartPart[] | null> {
    if (session.strategy === 'multipart') {
        return uploadFileMultipart(session.parts, file, onProgress, signal);
    }

    await uploadFileSingle(session.uploadUrl, file, onProgress, signal);
    return null;
}