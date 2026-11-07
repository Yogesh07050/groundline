import { createApp } from './app.js';
import { config } from './config/env.js';
import { openDatabase } from './db/client.js';
import { seedDatabase } from './db/seed.js';
import { logger } from './lib/logger.js';
import { createGroqClient } from './modules/chat/llm.js';

const db = openDatabase(config.databasePath);
seedDatabase(db, config, logger);

const llm = createGroqClient(config.groq);
const app = createApp({ db, llm, config, log: logger });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, database: config.databasePath }, `Groundline API listening on http://localhost:${config.port}`);
  if (!llm.configured) {
    logger.warn('GROQ_API_KEY is not set. The console works, but the assistant cannot reply until a key is added.');
  }
});

server.on('error', (err) => {
  logger.fatal({ err }, 'Server failed to start');
  process.exit(1);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Don't wait forever on open streaming connections.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
