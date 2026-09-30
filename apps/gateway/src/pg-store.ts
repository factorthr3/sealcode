import postgres from 'postgres';
import { createGatewayStore } from '@sealcode/db/gateway-store';
import type { GatewayStore } from '@sealcode/shared';
import { errorFields, type Logger } from '@sealcode/shared/logger';

export async function createPgStore(url: string, logger: Logger): Promise<GatewayStore> {
  const sql = postgres(url, {
    max: 10,
    // The driver must never print: notices and debug output can include query parameters.
    onnotice: () => undefined,
    debug: false,
    connection: { application_name: 'sealcode-gateway' },
  });
  try {
    await sql`select 1`;
  } catch (err) {
    logger.error('store.connect_failed', errorFields(err));
    throw err;
  }
  logger.info('store.postgres');
  return createGatewayStore(sql);
}
