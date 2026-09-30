/**
 * The trust center end to end without a CVM: a fake dstack guest agent serves a synthetic but
 * internally consistent TDX quote and event log; the web app's attestation code turns it into
 * the public JSON; and the customer verifier accepts it only when it matches the published
 * docker-compose.yml.
 */
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DSTACK_EVENT_TYPE,
  eventDigest,
  replayRtmr3,
  verifyAttestation,
  type EventLogEntry,
} from '../../../scripts/attestation/verify';

const COMPOSE = `services:\n  gateway:\n    image: ghcr.io/factorthr3/sealcode-gateway@sha256:${'1'.repeat(64)}\n`;
const APP_COMPOSE = JSON.stringify({
  manifest_version: 2,
  name: 'sealcode',
  runner: 'docker-compose',
  docker_compose_file: COMPOSE,
});
const COMPOSE_HASH = createHash('sha256').update(APP_COMPOSE).digest('hex');
const ev = (event: string, payload: string): EventLogEntry => {
  const e = { imr: 3, event_type: DSTACK_EVENT_TYPE, event, event_payload: payload, digest: '' };
  return { ...e, digest: eventDigest(e) };
};
const EVENTS = [
  ev('compose-hash', COMPOSE_HASH),
  ev('instance-id', 'ab'.repeat(20)),
  ev('key-provider', '7b7d'),
];
const RTMR3 = replayRtmr3(EVENTS);

let server: http.Server;

beforeAll(async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://unused',
    KEY_PEPPER: 'p'.repeat(40),
    PLAYGROUND_TOKEN_SECRET: 's'.repeat(40),
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    SOURCE_COMMIT: 'abc1234',
  });
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/Info') {
        res.end(
          JSON.stringify({
            app_id: 'app-123',
            instance_id: 'inst-1',
            app_name: 'sealcode',
            compose_hash: COMPOSE_HASH,
            os_image_hash: 'os'.repeat(16),
            key_provider_info: 'kms',
            tcb_info: JSON.stringify({
              mrtd: 'aa',
              rtmr0: 'b',
              rtmr1: 'c',
              rtmr2: 'd',
              rtmr3: RTMR3,
              app_compose: APP_COMPOSE,
              event_log: EVENTS,
            }),
          }),
        );
      } else if (req.url === '/GetQuote') {
        const { report_data } = JSON.parse(body) as { report_data: string };
        const quote = Buffer.alloc(48 + 584 + 64);
        Buffer.from(RTMR3, 'hex').copy(quote, 48 + 472);
        Buffer.from(report_data, 'hex').copy(quote, 48 + 520);
        res.end(
          JSON.stringify({ quote: quote.toString('hex'), event_log: JSON.stringify(EVENTS) }),
        );
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.DSTACK_SIMULATOR_ENDPOINT = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  delete process.env.DSTACK_SIMULATOR_ENDPOINT;
});

describe('trust center attestation', () => {
  it('passes the customer verifier against the published compose file', async () => {
    const { getAttestation } = await import('../src/lib/attestation');
    const nonce = randomBytes(32).toString('hex');
    const doc = await getAttestation(nonce);
    expect(doc).toMatchObject({
      mode: 'tee',
      appId: 'app-123',
      composeHash: COMPOSE_HASH,
      trustCenterUrl: 'https://trust.phala.com/app/app-123',
    });
    expect(doc.source.composeUrl).toContain('/blob/abc1234/deploy/docker-compose.yml');
    const checks = verifyAttestation(doc, { nonce, publishedCompose: COMPOSE });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it('fails the verifier when the published compose differs', async () => {
    const { getAttestation } = await import('../src/lib/attestation');
    const nonce = randomBytes(32).toString('hex');
    const doc = await getAttestation(nonce);
    const failed = verifyAttestation(doc, {
      nonce,
      publishedCompose: COMPOSE.replace('1', '2'),
    }).filter((c) => !c.ok);
    expect(failed.map((c) => c.name)).toEqual(['Compose file matches the published source']);
  });

  it('omits the quote when no nonce is given', async () => {
    const { getAttestation } = await import('../src/lib/attestation');
    const doc = await getAttestation();
    expect(doc.quote).toBeUndefined();
    expect(doc.events?.map((e) => e.event)).toEqual([
      'compose-hash',
      'instance-id',
      'key-provider',
    ]);
  });
});
