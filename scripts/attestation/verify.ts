/**
 * Offline checks on a Sealcode attestation. Pure functions, no network: the CLI in
 * scripts/verify-attestation.ts fetches the data and optionally asks Phala's public verifier to
 * check the quote's hardware signature.
 *
 * TDX quote v4 layout: a 48-byte header, then the 584-byte TD report body. In the body, RTMR3 is
 * bytes 472–520 and REPORTDATA bytes 520–584.
 */
import { createHash } from 'node:crypto';

export const REPORT_DATA_PREFIX = 'sealcode-attestation:v1:';
const HEADER = 48;
const RTMR3 = [HEADER + 472, HEADER + 520] as const;
const REPORT_DATA = [HEADER + 520, HEADER + 584] as const;
/** dstack's event type for application events (compose-hash, instance-id, key-provider). */
export const DSTACK_EVENT_TYPE = 0x08000001;

export interface EventLogEntry {
  imr: number;
  event_type: number;
  digest: string;
  event: string;
  event_payload: string;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest();
const sha384 = (data: Buffer) => createHash('sha384').update(data).digest();

export function expectedReportData(nonce: string): Buffer {
  return sha256(REPORT_DATA_PREFIX + nonce);
}

export function quoteFields(quoteHex: string): { rtmr3: string; reportData: string } {
  const quote = Buffer.from(quoteHex.replace(/^0x/, ''), 'hex');
  if (quote.length < REPORT_DATA[1])
    throw new Error(`quote is ${quote.length} bytes; too short for a TDX v4 quote`);
  return {
    rtmr3: quote.subarray(...RTMR3).toString('hex'),
    reportData: quote.subarray(...REPORT_DATA).toString('hex'),
  };
}

/** Replay RTMR3 from the event log, exactly as the hardware extended it. */
export function replayRtmr3(events: EventLogEntry[]): string {
  let mr = Buffer.alloc(48);
  for (const e of events.filter((ev) => ev.imr === 3)) {
    let digest = Buffer.from(e.digest, 'hex');
    if (digest.length < 48) digest = Buffer.concat([digest, Buffer.alloc(48 - digest.length)]);
    mr = sha384(Buffer.concat([mr, digest]));
  }
  return mr.toString('hex');
}

/** dstack event digest: sha384(event_type as u32 LE ‖ ":" ‖ event ‖ ":" ‖ payload). */
export function eventDigest(
  e: Pick<EventLogEntry, 'event_type' | 'event' | 'event_payload'>,
): string {
  const type = Buffer.alloc(4);
  type.writeUInt32LE(e.event_type);
  return sha384(
    Buffer.concat([
      type,
      Buffer.from(':'),
      Buffer.from(e.event),
      Buffer.from(':'),
      Buffer.from(e.event_payload, 'hex'),
    ]),
  ).toString('hex');
}

export interface AttestationDoc {
  mode: string;
  composeHash?: string;
  appCompose?: string;
  quote?: string;
  eventLog?: string;
  nonce?: string;
}

/**
 * Everything that can be checked without trusting the network: freshness, the compose hash and
 * its binding into RTMR3, and that the attested compose file matches the published one.
 */
export function verifyAttestation(
  doc: AttestationDoc,
  opts: { nonce: string; publishedCompose: string | null },
): Check[] {
  const checks: Check[] = [];
  const push = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  if (doc.mode !== 'tee' || !doc.quote || !doc.eventLog || !doc.appCompose || !doc.composeHash) {
    push('Running in a TEE', false, `The site reports mode "${doc.mode}" with no quote.`);
    return checks;
  }
  push('Running in a TEE', true, 'The site returned a TDX quote.');

  const fields = quoteFields(doc.quote);
  const expected = expectedReportData(opts.nonce).toString('hex');
  push(
    'Quote is fresh',
    fields.reportData.startsWith(expected) && doc.nonce === opts.nonce,
    fields.reportData.startsWith(expected)
      ? 'Report data commits to your random nonce.'
      : 'Report data does not match your nonce.',
  );

  const composeHash = sha256(doc.appCompose).toString('hex');
  push(
    'Compose hash matches the attested configuration',
    composeHash === doc.composeHash,
    `sha256(app-compose.json) = ${composeHash}`,
  );

  let events: EventLogEntry[];
  try {
    events = JSON.parse(doc.eventLog) as EventLogEntry[];
  } catch {
    push('Event log parses', false, 'The event log is not valid JSON.');
    return checks;
  }
  const replayed = replayRtmr3(events);
  push(
    'RTMR3 replays from the event log',
    replayed === fields.rtmr3,
    replayed === fields.rtmr3
      ? `RTMR3 = ${replayed.slice(0, 24)}…`
      : `replayed ${replayed.slice(0, 16)}… but the quote has ${fields.rtmr3.slice(0, 16)}…`,
  );

  const appEvents = events.filter((e) => e.imr === 3 && e.event_type === DSTACK_EVENT_TYPE);
  const badDigest = appEvents.find((e) => eventDigest(e) !== e.digest.toLowerCase());
  push(
    'Event payloads match their measured digests',
    !badDigest && appEvents.length > 0,
    badDigest
      ? `"${badDigest.event}" payload does not hash to its digest`
      : `${appEvents.length} application events checked`,
  );

  const composeEvent = appEvents.find((e) => e.event === 'compose-hash');
  push(
    'Compose hash is measured into RTMR3',
    composeEvent?.event_payload.toLowerCase() === doc.composeHash.toLowerCase(),
    composeEvent
      ? 'The compose-hash boot event carries the same hash.'
      : 'No compose-hash event in RTMR3.',
  );

  let attestedCompose = '';
  try {
    attestedCompose = String(
      (JSON.parse(doc.appCompose) as { docker_compose_file?: string }).docker_compose_file ?? '',
    );
  } catch {
    // Reported below.
  }
  if (opts.publishedCompose === null) {
    push(
      'Compose file matches the published source',
      false,
      'No published docker-compose.yml to compare with (use --compose or --ref).',
    );
  } else {
    const same = attestedCompose.trim() === opts.publishedCompose.trim();
    push(
      'Compose file matches the published source',
      same,
      same
        ? 'Byte-for-byte identical, ignoring surrounding whitespace.'
        : 'The running docker-compose.yml differs from the one you supplied.',
    );
  }

  const images = [...attestedCompose.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]!);
  const unpinned = images.filter((i) => !/@sha256:[0-9a-f]{64}$/.test(i));
  push(
    'Every image is pinned by digest',
    images.length > 0 && unpinned.length === 0,
    unpinned.length ? `Unpinned: ${unpinned.join(', ')}` : `${images.length} images pinned`,
  );

  return checks;
}
