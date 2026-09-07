import { build } from 'esbuild';
import { mkdir, rm, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TAG_BUILD_TARGETS } from '@cpmind/shared';
import type { TagConstantsValues } from '@cpmind/shared';

const directory_name = path.dirname(fileURLToPath(import.meta.url));

// Путь к entry point тега относительно скомпилированного/выполняемого этого файла.
// Структура backend/dist/services и backend/src/services одинаково глубокие
// относительно packages/, поэтому путь корректен и в dev (tsx), и в собранном виде
const TAG_ENTRY_POINT = path.join(directory_name, '../../../tag/src/index.ts');

// TAG_DIST_DIR — путь к общему volume с NGINX в production. Без переменной —
// fallback в packages/tag/dist для локальной разработки без Docker
function getTagDistDir(): string {
  return process.env['TAG_DIST_DIR'] ?? path.join(directory_name, '../../../tag/dist');
}

function getScriptFileName(version: string): string {
  return `cpmind-tag_${version}.min.js`;
}

export interface BuiltTagArtifact {
  scriptPath: string;
  fileSizeBytes: number;
}

// Собирает конкретную версию тега с заданными константами, зашитыми через esbuild
// define. __CPMIND_CONSTANTS__ и __CPMIND_TAG_VERSION__ — глобальные идентификаторы,
// которые packages/tag/src/constants.ts объявляет как ambient и переиспользует во
// всех сигнальных файлах. JSON.stringify(constants) — валидный JS object literal,
// esbuild подставляет его как есть на место идентификатора
export async function buildTagArtifact(
  version: string,
  constants: TagConstantsValues,
): Promise<BuiltTagArtifact> {
  const distDir = getTagDistDir();
  await mkdir(distDir, { recursive: true });

  const fileName = getScriptFileName(version);
  const outfile = path.join(distDir, fileName);

  await build({
    entryPoints: [TAG_ENTRY_POINT],
    bundle: true,
    minify: true,
    target: [...TAG_BUILD_TARGETS],
    format: 'iife' as const,
    globalName: 'CPMindTag',
    outfile,
    define: {
      'process.env.NODE_ENV': '"production"',
      __CPMIND_CONSTANTS__: JSON.stringify(constants),
      __CPMIND_TAG_VERSION__: JSON.stringify(version),
    },
    legalComments: 'none' as const,
  });

  const stats = await stat(outfile);

  return {
    scriptPath: `/tag/${fileName}`,
    fileSizeBytes: stats.size,
  };
}

// Удаляет физический файл версии при деактивации. force: true — не бросает
// ошибку, если файл уже отсутствует (повторная деактивация, ручное удаление)
export async function removeTagArtifact(version: string): Promise<void> {
  const distDir = getTagDistDir();
  const outfile = path.join(distDir, getScriptFileName(version));

  await rm(outfile, { force: true });
}