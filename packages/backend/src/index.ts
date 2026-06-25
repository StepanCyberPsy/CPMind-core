import { eq } from 'drizzle-orm';
import { buildServer } from './server.js';
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { bootstrapAdmin, bootstrapTagConstants } from './services/bootstrap.js';
import { calibrationBatches } from './db/schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const directory_name = path.dirname(fileURLToPath(import.meta.url));

// Восстановление после аварийного перезапуска backend: батч, застрявший в processing
// (сервер упал посреди фоновой обработки), не должен тихо висеть вечно — фронтенд
// должен увидеть явный failed и предложить создать батч заново. Не блокирует старт
// сервера при ошибке — это восстановление консистентности, не критичная зависимость
async function recoverStuckCalibrationBatches(): Promise<void> {
  await db
    .update(calibrationBatches)
    .set({ status: 'failed', completedAt: new Date() })
    .where(eq(calibrationBatches.status, 'processing'));
}

async function main(): Promise<void> {
  try {
    await migrate(db, {
      migrationsFolder: path.join(directory_name, '..', 'drizzle', 'migrations'),
    });
  } catch (err) {
    console.error('[CPMind] Migration failed — server will not start:', err);
    process.exit(1);
  }

  try {
    await bootstrapAdmin();
  } catch (err) {
    console.error('[CPMind] Admin bootstrap failed — server will not start:', err);
    process.exit(1);
  }

  try {
    await bootstrapTagConstants();
  } catch (err) {
    console.error('[CPMind] Tag constants bootstrap failed — server will not start:', err);
    process.exit(1);
  }

  try {
    await recoverStuckCalibrationBatches();
  } catch (err) {
    console.error('[CPMind] Calibration batch recovery failed — continuing startup:', err);
  }

  const app = buildServer();
  const port = Number(process.env['PORT']) || 3001;
  const host = process.env['HOST'] ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error({ err }, 'Server failed to start');
    process.exit(1);
  }
}

main();