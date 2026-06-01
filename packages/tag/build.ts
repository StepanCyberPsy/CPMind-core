/// <reference types="node" />
import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  target: ['chrome90', 'firefox90', 'safari14', 'edge90'],
  format: 'iife' as const,
  globalName: 'CPMindTag',
  outfile: 'dist/cpmind-tag.min.js',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  legalComments: 'none' as const,
};

void (async () => {
  if (isWatch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('[CPMind tag] watching...');
  } else {
    const result = await build({ ...options, metafile: true });
    const output = Object.values(result.metafile!.outputs)[0];
    const size   = output?.bytes ?? 0;
    console.log(`[CPMind tag] built: ${(size / 1024).toFixed(1)} KB`);
  }
})();