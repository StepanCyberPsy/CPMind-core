/// <reference types="node" />
import { build, context, type BuildOptions } from 'esbuild';
import { DEFAULT_TAG_CONSTANTS, TAG_BUILD_TARGETS } from '@cpmind/shared';
import type { TagConstantsValues } from '@cpmind/shared';

const isWatch = process.argv.includes('--watch');

export interface BuildTagBundleOptions {
  outfile: string;
  version: string;
  constants: TagConstantsValues;
}

// Базовая esbuild-конфигурация. Версия и константы подставляются через define —
// __CPMIND_CONSTANTS__/__CPMIND_TAG_VERSION__ читаются в src/constants.ts
function resolveBuildOptions(opts: BuildTagBundleOptions): BuildOptions {
  return {
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    target: [...TAG_BUILD_TARGETS],
    format: 'iife' as const,
    globalName: 'CPMindTag',
    outfile: opts.outfile,
    define: {
      'process.env.NODE_ENV': '"production"',
      __CPMIND_CONSTANTS__: JSON.stringify(opts.constants),
      __CPMIND_TAG_VERSION__: JSON.stringify(opts.version),
    },
    legalComments: 'none' as const,
  };
}

export async function buildTagBundle(opts: BuildTagBundleOptions): Promise<number> {
  const result = await build({ ...resolveBuildOptions(opts), metafile: true });
  const output = Object.values(result.metafile!.outputs)[0];
  return output?.bytes ?? 0;
}

export async function watchTagBundle(opts: BuildTagBundleOptions): Promise<void> {
  const ctx = await context(resolveBuildOptions(opts));
  await ctx.watch();
}

// CLI entry point — version 'dev', значения DEFAULT_TAG_CONSTANTS. Локальная сборка
// не привязана к реальной версии из БД, не требует запущенного backend
void (async () => {
  const opts: BuildTagBundleOptions = {
    outfile: 'dist/cpmind-tag.min.js',
    version: 'dev',
    constants: DEFAULT_TAG_CONSTANTS,
  };

  if (isWatch) {
    await watchTagBundle(opts);
    console.log('[CPMind tag] watching...');
  } else {
    const size = await buildTagBundle(opts);
    console.log(`[CPMind tag] built: ${(size / 1024).toFixed(1)} KB`);
  }
})();