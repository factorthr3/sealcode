import 'server-only';
import { createHash } from 'node:crypto';
import { dstackEndpoint, dstackInfo, dstackQuote, type DstackInfo } from './dstack';
import { env } from './env';

/** Domain-separated so a Sealcode quote can't be replayed as an answer to another protocol. */
export const REPORT_DATA_PREFIX = 'sealcode-attestation:v1:';

export function reportDataFor(nonce: string): Buffer {
  return createHash('sha256')
    .update(REPORT_DATA_PREFIX + nonce)
    .digest();
}

export interface Attestation {
  mode: 'tee' | 'development';
  source: { repo: string; commit: string; composeUrl: string; treeUrl: string };
  appId?: string;
  instanceId?: string;
  appName?: string;
  composeHash?: string;
  osImageHash?: string;
  keyProvider?: string;
  tcb?: { mrtd: string; rtmr0: string; rtmr1: string; rtmr2: string; rtmr3: string };
  appCompose?: string;
  events?: { imr: number; event: string; payload: string }[];
  quote?: string;
  eventLog?: string;
  nonce?: string;
  reportData?: string;
  trustCenterUrl?: string;
  generatedAt: string;
}

function inCvm(): boolean {
  return dstackEndpoint() !== null;
}

function source() {
  const { SOURCE_REPO_URL: repo, SOURCE_COMMIT: commit } = env();
  return {
    repo,
    commit,
    treeUrl: `${repo}/tree/${commit}`,
    composeUrl: `${repo}/blob/${commit}/deploy/docker-compose.yml`,
  };
}

let infoCache: { at: number; value: DstackInfo } | null = null;

/**
 * The CVM's live attestation. With a nonce, the TDX quote's report data commits to it, so a
 * verifier knows the quote is fresh. Contains no customer data.
 */
export async function getAttestation(nonce?: string): Promise<Attestation> {
  const generatedAt = new Date().toISOString();
  if (!inCvm()) return { mode: 'development', source: source(), generatedAt };
  if (!infoCache || Date.now() - infoCache.at > 60_000)
    infoCache = { at: Date.now(), value: await dstackInfo() };
  const info = infoCache.value;
  const tcb = info.tcb_info;
  const events = Array.isArray(tcb.event_log) ? tcb.event_log : [];
  const base: Attestation = {
    mode: 'tee',
    source: source(),
    appId: info.app_id,
    instanceId: info.instance_id,
    appName: info.app_name,
    composeHash: info.compose_hash ?? tcb.compose_hash,
    osImageHash: info.os_image_hash ?? tcb.os_image_hash,
    keyProvider: info.key_provider_info,
    tcb: { mrtd: tcb.mrtd, rtmr0: tcb.rtmr0, rtmr1: tcb.rtmr1, rtmr2: tcb.rtmr2, rtmr3: tcb.rtmr3 },
    appCompose: tcb.app_compose,
    events: events
      .filter((e) => e.imr === 3)
      .map((e) => ({ imr: e.imr, event: e.event, payload: e.event_payload })),
    trustCenterUrl: `https://trust.phala.com/app/${info.app_id}`,
    generatedAt,
  };
  if (!nonce) return base;
  const reportData = reportDataFor(nonce);
  const quote = await dstackQuote(reportData);
  return {
    ...base,
    nonce,
    reportData: reportData.toString('hex'),
    quote: quote.quote,
    eventLog: quote.event_log,
  };
}
