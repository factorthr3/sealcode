import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DSTACK_EVENT_TYPE,
  eventDigest,
  expectedReportData,
  quoteFields,
  replayRtmr3,
  verifyAttestation,
  type EventLogEntry,
} from './verify';

const COMPOSE = `services:
  gateway:
    image: ghcr.io/factorthr3/sealcode-gateway@sha256:${'a'.repeat(64)}
  web:
    image: ghcr.io/factorthr3/sealcode-web@sha256:${'b'.repeat(64)}
`;
const APP_COMPOSE = JSON.stringify({
  manifest_version: 2,
  name: 'sealcode',
  runner: 'docker-compose',
  docker_compose_file: COMPOSE,
});
const COMPOSE_HASH = createHash('sha256').update(APP_COMPOSE).digest('hex');

function event(name: string, payloadHex: string): EventLogEntry {
  const e = {
    imr: 3,
    event_type: DSTACK_EVENT_TYPE,
    event: name,
    event_payload: payloadHex,
    digest: '',
  };
  return { ...e, digest: eventDigest(e) };
}

function fixture(
  nonce: string,
  overrides: { events?: EventLogEntry[]; appCompose?: string; rtmr3?: string } = {},
) {
  const events = overrides.events ?? [
    event('compose-hash', COMPOSE_HASH),
    event('instance-id', 'ab'.repeat(20)),
    event('key-provider', Buffer.from('{"name":"kms"}').toString('hex')),
  ];
  const quote = Buffer.alloc(48 + 584 + 100);
  Buffer.from(overrides.rtmr3 ?? replayRtmr3(events), 'hex').copy(quote, 48 + 472);
  expectedReportData(nonce).copy(quote, 48 + 520);
  return {
    mode: 'tee',
    nonce,
    composeHash: COMPOSE_HASH,
    appCompose: overrides.appCompose ?? APP_COMPOSE,
    quote: quote.toString('hex'),
    eventLog: JSON.stringify(events),
  };
}

const NONCE = 'c0ffee'.repeat(8);
const failed = (checks: ReturnType<typeof verifyAttestation>) =>
  checks.filter((c) => !c.ok).map((c) => c.name);

describe('verifyAttestation', () => {
  it('passes a consistent attestation', () => {
    expect(
      failed(verifyAttestation(fixture(NONCE), { nonce: NONCE, publishedCompose: COMPOSE })),
    ).toEqual([]);
  });

  it('reads RTMR3 and report data from the right offsets', () => {
    const f = fixture(NONCE);
    expect(
      quoteFields(f.quote).reportData.startsWith(expectedReportData(NONCE).toString('hex')),
    ).toBe(true);
  });

  it('rejects a replayed quote for someone else’s nonce', () => {
    expect(
      failed(
        verifyAttestation(fixture('00'.repeat(32)), { nonce: NONCE, publishedCompose: COMPOSE }),
      ),
    ).toContain('Quote is fresh');
  });

  it('rejects a compose file that differs from the published one', () => {
    const tampered = COMPOSE.replace('a'.repeat(64), 'c'.repeat(64));
    expect(
      failed(verifyAttestation(fixture(NONCE), { nonce: NONCE, publishedCompose: tampered })),
    ).toEqual(['Compose file matches the published source']);
  });

  it('rejects a swapped app-compose that no longer matches the measured hash', () => {
    const other = APP_COMPOSE.replace('sealcode', 'evil');
    expect(
      failed(
        verifyAttestation(fixture(NONCE, { appCompose: other }), {
          nonce: NONCE,
          publishedCompose: COMPOSE,
        }),
      ),
    ).toContain('Compose hash matches the attested configuration');
  });

  it('rejects an event log that does not replay to the quoted RTMR3', () => {
    expect(
      failed(
        verifyAttestation(fixture(NONCE, { rtmr3: 'ff'.repeat(48) }), {
          nonce: NONCE,
          publishedCompose: COMPOSE,
        }),
      ),
    ).toContain('RTMR3 replays from the event log');
  });

  it('rejects an event whose payload was edited after measurement', () => {
    const genuine = event('compose-hash', COMPOSE_HASH);
    const forged = { ...genuine, event_payload: 'd'.repeat(64) };
    const checks = verifyAttestation(fixture(NONCE, { events: [forged] }), {
      nonce: NONCE,
      publishedCompose: COMPOSE,
    });
    expect(failed(checks)).toContain('Event payloads match their measured digests');
  });

  it('rejects unpinned images', () => {
    const loose = COMPOSE.replace(/@sha256:a+/, ':latest');
    const app = JSON.stringify({ ...JSON.parse(APP_COMPOSE), docker_compose_file: loose });
    const doc = {
      ...fixture(NONCE, { appCompose: app }),
      composeHash: createHash('sha256').update(app).digest('hex'),
    };
    expect(failed(verifyAttestation(doc, { nonce: NONCE, publishedCompose: loose }))).toContain(
      'Every image is pinned by digest',
    );
  });

  it('fails outside a TEE', () => {
    expect(
      failed(verifyAttestation({ mode: 'development' }, { nonce: NONCE, publishedCompose: null })),
    ).toEqual(['Running in a TEE']);
  });
});
