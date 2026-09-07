/// <reference types="node" />
import { build, context, type BuildOptions } from 'esbuild';
import { TAG_BUILD_TARGETS } from '@cpmind/shared';

const isWatch = process.argv.includes('--watch');
const cdnBaseUrl = process.env['CDN_BASE_URL'] ?? 'https://cdn.cpmind.tech';

function resolveBuildOptions(outfile: string): BuildOptions {
    return {
        entryPoints: ['src/index.ts'],
        bundle: true,
        minify: true,
        platform: 'browser',
        target: [...TAG_BUILD_TARGETS],
        format: 'iife',
        outfile,
        define: {
            'process.env.NODE_ENV': '"production"',
            CDN_BASE_URL: JSON.stringify(cdnBaseUrl),
        },
        legalComments: 'none',
    };
}

export async function buildLoaderBundle(outfile: string): Promise<number> {
    const result = await build({ ...resolveBuildOptions(outfile), metafile: true });
    const output = Object.values(result.metafile!.outputs)[0];
    return output?.bytes ?? 0;
}

export async function watchLoaderBundle(outfile: string): Promise<void> {
    const ctx = await context(resolveBuildOptions(outfile));
    await ctx.watch();
}

void (async () => {
    const outfile = 'dist/cpmind-loader_v1.min.js';

    if (isWatch) {
        await watchLoaderBundle(outfile);
        console.log('[CPMind loader] watching...');
    } else {
        const size = await buildLoaderBundle(outfile);
        console.log(`[CPMind loader] built: ${(size / 1024).toFixed(1)} KB`);
    }
})();