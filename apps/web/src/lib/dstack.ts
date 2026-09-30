import 'server-only';
import { existsSync } from 'node:fs';
import http from 'node:http';

/**
 * A minimal client for the dstack guest agent, which exposes the CVM's attestation over a Unix
 * socket. Only the two calls the trust center needs, so the enclave image carries no SDK and its
 * dependencies. Mirrors @phala/dstack-sdk's `info()` and `getQuote()`.
 */
const SOCKETS = [
  '/var/run/dstack.sock',
  '/run/dstack.sock',
  '/var/run/dstack/dstack.sock',
  '/run/dstack/dstack.sock',
];

export interface DstackEvent {
  imr: number;
  event_type: number;
  digest: string;
  event: string;
  event_payload: string;
}

export interface DstackInfo {
  app_id: string;
  instance_id: string;
  app_name: string;
  compose_hash?: string;
  os_image_hash?: string;
  key_provider_info?: string;
  tcb_info: {
    mrtd: string;
    rtmr0: string;
    rtmr1: string;
    rtmr2: string;
    rtmr3: string;
    app_compose: string;
    event_log: DstackEvent[];
    compose_hash?: string;
    os_image_hash?: string;
  };
}

export interface DstackQuote {
  quote: string;
  event_log: string;
  report_data?: string;
}

export function dstackEndpoint(): string | null {
  if (process.env.DSTACK_SIMULATOR_ENDPOINT) return process.env.DSTACK_SIMULATOR_ENDPOINT;
  return SOCKETS.find((p) => existsSync(p)) ?? null;
}

function rpc<T>(path: string, body: unknown): Promise<T> {
  const endpoint = dstackEndpoint();
  if (!endpoint) return Promise.reject(new Error('dstack guest agent not available'));
  const payload = JSON.stringify(body);
  const url = endpoint.startsWith('http') ? new URL(path, endpoint) : null;
  const target = url
    ? { host: url.hostname, port: url.port, path: url.pathname }
    : { socketPath: endpoint, path };
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        ...target,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
        timeout: 15_000,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as T & { error?: string };
            if (parsed && typeof parsed === 'object' && 'error' in parsed && parsed.error)
              reject(new Error('dstack_error'));
            else resolve(parsed);
          } catch {
            reject(new Error('dstack_bad_response'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('dstack_timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

export async function dstackInfo(): Promise<DstackInfo> {
  const raw = await rpc<
    Omit<DstackInfo, 'tcb_info'> & { tcb_info: string | DstackInfo['tcb_info'] }
  >('/Info', {});
  return {
    ...raw,
    tcb_info: typeof raw.tcb_info === 'string' ? JSON.parse(raw.tcb_info) : raw.tcb_info,
  };
}

export async function dstackQuote(reportData: Buffer): Promise<DstackQuote> {
  if (reportData.length > 64) throw new Error('report data must be at most 64 bytes');
  return rpc<DstackQuote>('/GetQuote', { report_data: reportData.toString('hex') });
}
