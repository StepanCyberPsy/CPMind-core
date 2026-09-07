import type { AssetClass } from '@cpmind/shared';

export interface ProcessedFile {
    localPath: string;
    assetClass: AssetClass;
    mimeType: string;
    extension: string;
    role: string;
    priority: number;
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