import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

// IAB не опубликовал XSD для VAST 4.3 — используем vast_4.2.xsd как ближайшую схему.
// Для prose-derived проверок (AdServingId required, UniversalAdId required и др.)
// требуется дополнительная валидация через VASTlint CLI или аналог.
const DEFAULT_XSD_PATH = join(
    fileURLToPath(new URL('.', import.meta.url)),
    'schema',
    'vast_4.2.xsd',
);

const VAST_XSD_PATH = process.env['VAST_XSD_PATH'] ?? DEFAULT_XSD_PATH;

export interface VastValidationResult {
    valid: boolean;
    errors: string[];
}

export async function validateVastXml(
    xml: string,
): Promise<VastValidationResult> {
    const suffix = randomBytes(8).toString('hex');
    const tmpFile = join(tmpdir(), `cpmind-vast-${suffix}.xml`);

    try {
        await writeFile(tmpFile, xml, 'utf8');

        await execFileAsync('xmllint', [
            '--noout',
            '--schema',
            VAST_XSD_PATH,
            tmpFile,
        ]);

        return { valid: true, errors: [] };

    } catch (err) {
        const raw = (err as { stderr?: string }).stderr ?? String(err);

        const errors = raw
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith(tmpFile));

        return { valid: false, errors };

    } finally {
        await unlink(tmpFile).catch(() => undefined);
    }
}