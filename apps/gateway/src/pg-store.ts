import type { Logger } from '@sealcode/shared/logger';
import type { GatewayStore } from './store';

// Implemented in Milestone 2 with the Drizzle schema.
export async function createPgStore(_url: string, _logger: Logger): Promise<GatewayStore> {
  throw new Error('Postgres store not implemented yet');
}
