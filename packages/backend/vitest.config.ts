import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageDir = path.dirname(fileURLToPath(import.meta.url));

// Скрипт dev получает переменные через tsx --env-file, vitest этого не делает.
// db/index.ts читает DATABASE_URL на этапе импорта модуля, поэтому загрузка
// выполняется до старта воркеров — они наследуют process.env родителя
process.loadEnvFile(path.resolve(packageDir, '../../.env'));

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',

        // Интеграционные тесты считают строки в ad_sessions до и после запроса:
        // параллельный прогон файлов делает результат недетерминированным
        fileParallelism: false,

        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});