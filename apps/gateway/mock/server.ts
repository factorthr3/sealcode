/** Runs the mock upstream for local development on UPSTREAM_BASE_URL's port (default 8788). */
import { serve } from '@hono/node-server';
import { createMockUpstream } from './upstream';

const port = Number(process.env.MOCK_UPSTREAM_PORT ?? 8788);
const { app } = createMockUpstream({ chunkDelayMs: Number(process.env.MOCK_CHUNK_DELAY_MS ?? 25) });

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  process.stdout.write(`mock upstream (not a TEE) listening on http://127.0.0.1:${info.port}\n`);
});
