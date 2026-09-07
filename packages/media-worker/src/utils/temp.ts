import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getWorkerTempDir } from '../config.js';

const BASE_TEMP_DIR = getWorkerTempDir()

export async function createTempDir(jobId: string): Promise<string> {
    const dir = join(BASE_TEMP_DIR, jobId);
    await mkdir(dir, { recursive: true });
    return dir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
}