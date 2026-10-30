/// <reference types="node" />
import {
    build,
    context,
    type BuildOptions,
} from 'esbuild';
import { TAG_BUILD_TARGETS } from '@cpmind/shared';

const isWatch = process.argv.includes('--watch');
const version = process.env['OMID_RUNTIME_VERSION'] ?? '1';
const cdnBaseUrl = process.env['CDN_BASE_URL'] ?? 'https://cdn.cpmind.tech';
const simidVersion = process.env['SIMID_RUNTIME_VERSION'] ?? '1';

// Скрипт верификации исполняется плеером площадки: собственного окружения у него нет,
// все значения времени сборки передаются через define
function resolveBuildOptions(entry: string, outfile: string): BuildOptions {
    return {
        entryPoints: [entry],
        bundle: true,
        minify: true,
        platform: 'browser',
        target: [...TAG_BUILD_TARGETS],
        format: 'iife',
        outfile,
        define: {
            'process.env.NODE_ENV': '"production"',
            OMID_RUNTIME_VERSION: JSON.stringify(version),
            SIMID_RUNTIME_VERSION: JSON.stringify(simidVersion),
            CDN_BASE_URL: JSON.stringify(cdnBaseUrl),
        },
        legalComments: 'none',
    };
}

export async function buildOmidBundle(entry: string, outfile: string): Promise<number> {
    const result = await build({
        ...resolveBuildOptions(entry, outfile),
        metafile: true,
    });
    const output = Object.values(result.metafile!.outputs)[0];
    return output?.bytes ?? 0;
}

export async function watchOmidBundle(entry: string, outfile: string): Promise<void> {
    const ctx = await context(resolveBuildOptions(entry, outfile));
    await ctx.watch();
}

// Два независимых бандла IIFE: esbuild делит код только в формате esm,
// а загрузчик подключает вторую часть обычным тегом script.
// Ограниченные режимы — вероятное большинство показов — вторую часть не грузят
const BUNDLES: ReadonlyArray<{ entry: string; outfile: string; label: string }> = [
    {
        entry: 'src/index.ts',
        outfile: `dist/cpmind-omid_v${version}.min.js`,
        label: 'loader',
    },
    {
        entry: 'src/full.ts',
        outfile: `dist/cpmind-omid-full_v${version}.min.js`,
        label: 'full',
    },


    // src/simid.ts здесь намеренно отсутствует: задел по интерактивному креативу
    // SIMID не подключён к продукту. Причины — в docs/packages_information/OMID_LOGIC.md.
    // Значение SIMID_RUNTIME_VERSION остаётся в define, чтобы точка входа
    // собиралась без правок, когда и если задел будет подключён
];

void (async () => {
    for (const bundle of BUNDLES) {
        if (isWatch) {
            await watchOmidBundle(bundle.entry, bundle.outfile);
            console.log(`[CPMind omid] watching ${bundle.label}...`);
        } else {
            const size = await buildOmidBundle(bundle.entry, bundle.outfile);
            console.log(`[CPMind omid] built ${bundle.label}: ${(size / 1024).toFixed(1)} KB`);
        }
    }
})();
