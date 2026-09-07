import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function computeFileSha256(localPath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(localPath);

        stream.on('error', reject);
        hash.on('error', reject);

        stream.on('end', () => {
            resolve(hash.digest('hex'));
        });

        stream.pipe(hash);
    });
}