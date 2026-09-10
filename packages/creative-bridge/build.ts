/// <reference types="node" />
import {
    build,
    context,
    type BuildOptions
} from 'esbuild';
import { TAG_BUILD_TARGETS } from '@cpmind/shared';

const isWatch = process.argv.includes('--watch');
const version = process.env['BRIDGE_VERSION'] ?? '1';

// BRIDGE_VERSION инжектируется через define: значение попадает и в имя артефакта,
// и в handshake cpmind:ready — хост и creative всегда согласованы по версии протокола
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
            BRIDGE_VERSION: JSON.stringify(version),
        },
        legalComments: 'none',
    };
}

export async function buildBridgeBundle(outfile: string): Promise<number> {
    const result = await build({ ...resolveBuildOptions(outfile), metafile: true });
    const output = Object.values(result.metafile!.outputs)[0];
    return output?.bytes ?? 0;
}

export async function watchBridgeBundle(outfile: string): Promise<void> {
    const ctx = await context(resolveBuildOptions(outfile));
    await ctx.watch();
}

void (async () => {
    const outfile = `dist/cpmind-creative-bridge_v${version}.min.js`;

    if (isWatch) {
        await watchBridgeBundle(outfile);
        console.log('[CPMind creative-bridge] watching...');
    } else {
        const size = await buildBridgeBundle(outfile);
        console.log(`[CPMind creative-bridge] built: ${(size / 1024).toFixed(1)} KB`);
    }
})();