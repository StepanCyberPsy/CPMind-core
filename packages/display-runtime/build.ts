/// <reference types="node" />
import {
    build,
    context,
    type BuildOptions,
} from 'esbuild';
import { TAG_BUILD_TARGETS } from '@cpmind/shared';

const isWatch = process.argv.includes('--watch');
const version = process.env.DISPLAY_RUNTIME_VERSION ?? '1';

// Базовая esbuild-конфигурация — браузерный IIFE bundle.
// SDK и shared инлайнятся; define убирает dev-only ветки.
// define-инжекция runtime-конфигурации отсутствует — конфиг читается
// из window.__CPMIND_QUEUE__ в runtime, не подставляется при сборке
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
        },
        legalComments: 'none',
    };
}

export async function buildDisplayBundle(outfile: string): Promise<number> {
    const result = await build({ ...resolveBuildOptions(outfile), metafile: true });
    const output = Object.values(result.metafile!.outputs)[0];
    return output?.bytes ?? 0;
}

export async function watchDisplayBundle(outfile: string): Promise<void> {
    const ctx = await context(resolveBuildOptions(outfile));
    await ctx.watch();
}

// CLI entry point — локальная разработка и CI.
// Версия из DISPLAY_RUNTIME_VERSION, по умолчанию '1'
void (async () => {
    const outfile = `dist/cpmind-display_v${version}.min.js`;

    if (isWatch) {
        await watchDisplayBundle(outfile);
        console.log('[CPMind display-runtime] watching...');
    } else {
        const size = await buildDisplayBundle(outfile);
        console.log(`[CPMind display-runtime] built: ${(size / 1024).toFixed(1)} KB`);
    }
})();