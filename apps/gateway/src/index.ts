import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createLogger, errorFields, silenceConsole } from '@sealcode/shared/logger';
import { hashApiKey } from '@sealcode/shared/node';
import { TRIAL } from '@sealcode/shared';
import { createGateway } from './app';
import { loadConfig } from './config';
import { MemoryStore, type GatewayStore } from './store';

if (process.env.NODE_ENV !== 'production') {
  const envFile = new URL('../../../.env', import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const config = loadConfig(process.env);
const logger = createLogger({ component: 'gateway', level: config.logLevel });

// Nothing may print request content: not our code, not a dependency, not a crash handler.
if (config.production) silenceConsole(logger);
process.on('uncaughtException', (err) => {
  logger.error('process.uncaught_exception', errorFields(err));
  process.exit(1);
});
process.on('unhandledRejection', (err) =>
  logger.error('process.unhandled_rejection', errorFields(err)),
);

async function createStore(): Promise<GatewayStore> {
  if (config.databaseUrl) {
    const { createPgStore } = await import('./pg-store');
    return createPgStore(config.databaseUrl, logger);
  }
  // Database-free development: one key from DEV_API_KEY on a trial org.
  const store = new MemoryStore();
  if (config.devApiKey) {
    store.addKey(hashApiKey(config.devApiKey, config.gateway.keyPepper), {
      keyId: 'dev-key',
      orgId: 'dev-org',
      userId: 'dev-user',
      revoked: false,
      orgStatus: 'trial',
      plan: 'trial',
      trialEndsAt: null,
      rateLimitRpm: TRIAL.rateLimitRpm,
      budgetMode: 'hard',
      orgBudgetTokens: TRIAL.pooledTokens,
      seatBudgetTokens: null,
    });
  }
  logger.warn('store.memory', { env: config.production ? 'production' : 'development' });
  return store;
}

const store = await createStore();
const app = createGateway({ store, logger, config: config.gateway });
const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) =>
  logger.info('gateway.listening', { port: info.port }),
);

function shutdown() {
  logger.info('gateway.shutdown');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 25_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
