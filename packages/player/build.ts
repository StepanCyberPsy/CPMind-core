/// <reference types="node" />
import {
    build,
    context,
    type BuildOptions,
} from 'esbuild';
import { TAG_BUILD_TARGETS } from '@cpmind/shared';

const isWatch = process.argv.includes('--watch');
const version = process.env['PLAYER_RUNTIME_VERSION'] ?? '1';
const cdnHostname = process.env['CDN_HOSTNAME'] ?? 'cdn.cpmind.tech';

// CDN_HOSTNAME и PLAYER_RUNTIME_VERSION инжектируются через esbuild define.
// Браузерный контекст не имеет доступа к env-переменным — все конфигурационные
// константы времени сборки передаются через define, не через runtime config
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
            CDN_HOSTNAME: JSON.stringify(cdnHostname),
            PLAYER_RUNTIME_VERSION: JSON.stringify(version),
        },
        legalComments: 'none',
    };
}

export async function buildPlayerBundle(outfile: string): Promise<number> {
    const result = await build({ ...resolveBuildOptions(outfile), metafile: true });
    const output = Object.values(result.metafile!.outputs)[0];
    return output?.bytes ?? 0;
}

export async function watchPlayerBundle(outfile: string): Promise<void> {
    const ctx = await context(resolveBuildOptions(outfile));
    await ctx.watch();
}

// CLI entry point — локальная разработка и CI
void (async () => {
    const outfile = `dist/cpmind-player_v${version}.min.js`;

    if (isWatch) {
        await watchPlayerBundle(outfile);
        console.log('[CPMind player] watching...');
    } else {
        const size = await buildPlayerBundle(outfile);
        console.log(`[CPMind player] built: ${(size / 1024).toFixed(1)} KB`);
    }
})();