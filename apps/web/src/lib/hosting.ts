import 'server-only';
import { connection } from 'next/server';
import { dstackEndpoint } from './dstack';

/**
 * Whether this deployment runs inside a Phala Confidential VM, judged by the dstack guest agent's
 * socket being present. Copy that says our gateway, dashboard or database are in a TEE is shown
 * only when this is true. The interim deployment on standard cloud hosting says what is actually
 * true instead. Checked per request, so a page that calls it renders dynamically.
 */
export async function inConfidentialVm(): Promise<boolean> {
  await connection();
  return dstackEndpoint() !== null;
}
