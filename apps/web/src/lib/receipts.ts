import 'server-only';
import { env } from './env';

export const RECEIPT_ID = /^rcpt-[A-Za-z0-9_-]{6,80}$/;

interface ReceiptEvent {
  type?: string;
  result?: string;
  required?: boolean;
  provider?: string;
  model_id?: string;
  session_id?: string;
}

export interface ReceiptSummary {
  verified: boolean;
  required: boolean | null;
  provider: string | null;
  modelId: string | null;
  sessionId: string | null;
  servedAt: string | null;
  workloadId: string | null;
  signed: boolean;
  events: { type: string }[];
}

/**
 * Fetch a receipt from Phala's attested gateway. Receipts need Sealcode's Phala key, so they are
 * proxied here; callers must first check the receipt belongs to the requester.
 */
export async function fetchReceipt(
  id: string,
): Promise<{ receipt: unknown; summary: ReceiptSummary } | null> {
  const e = env();
  const res = await fetch(`${e.receiptsBaseUrl}/v1/aci/receipts/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${e.PHALA_API_KEY || 'mock-phala-key'}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const receipt = (await res.json()) as {
    event_log?: ReceiptEvent[];
    served_at?: number;
    workload_id?: string;
    signature?: string;
  };
  const events = Array.isArray(receipt.event_log) ? receipt.event_log : [];
  const upstream = events.find((ev) => ev.type === 'upstream.verified');
  return {
    receipt,
    summary: {
      verified: upstream?.result === 'verified',
      required: typeof upstream?.required === 'boolean' ? upstream.required : null,
      provider: upstream?.provider ?? null,
      modelId: upstream?.model_id ?? null,
      sessionId: upstream?.session_id ?? null,
      servedAt: receipt.served_at ? new Date(receipt.served_at * 1000).toISOString() : null,
      workloadId: receipt.workload_id ?? null,
      signed: typeof receipt.signature === 'string' && receipt.signature.length > 0,
      events: events.map((ev) => ({ type: String(ev.type ?? 'unknown') })),
    },
  };
}
