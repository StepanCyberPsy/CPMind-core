import { buildServer } from './server.js';
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';

const directory_name = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  try {
    await migrate(db, {
      migrationsFolder: path.join(directory_name, '..', 'drizzle', 'migrations'),
    });
  } catch (err) {
    console.error('[CPMind] Migration failed — server will not start:', err);
    process.exit(1);
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