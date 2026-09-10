import type { AssetClass } from '@cpmind/shared';

// Многофайловый ассет, разложенный процессором в delivery-бакет самостоятельно.
// Идентичность такого ассета определяется деревом целиком, а не отдельным файлом:
// sha256 считается по всем относительным путям и хешам, storageKey указывает на
// точку входа внутри общего префикса. При наличии bundle пайплайн не хеширует,
// не строит ключ и не загружает файл повторно
export interface ProcessedBundle {
    sha256: string;
    storageKey: string;
    sizeBytes: number;
}

export interface ProcessedFile {
    localPath: string;
    assetClass: AssetClass;
    mimeType: string;
    extension: string;
    role: string;
    priority: number;
    bundle?: ProcessedBundle;
    width?: number;
    height?: number;
    durationSec?: number;
    codec?: string;
    bitrateBps?: number;
}

export interface ProcessingResult {
    sha256: string;
    files: ProcessedFile[];
}

export class ProcessingError extends Error {
    constructor(
        public readonly code: string,
        message?: string,
    ) {
        super(message ?? code);
        this.name = 'ProcessingError';
    }
}