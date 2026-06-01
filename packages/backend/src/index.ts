import { buildServer } from './server.js';
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await migrate(db, {
    migrationsFolder: path.join(__dirname, '..', 'drizzle', 'migrations'),
  });

  const app = buildServer();
  const port = Number(process.env['PORT']) || 3001;
  const host = process.env['HOST'] ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();