import 'server-only';
import { NextResponse } from 'next/server';
import { isCustomPriced, monthlyStatement, OVERAGE_PER_MTOK, type PlanId } from '@sealcode/shared';
import { csvRow } from './csv';
import { tenant } from './db';

/** The month's statement as CSV: the same numbers Sealcode invoices from. */
export async function statementCsv(orgId: string, month: string) {
  const repo = tenant(orgId);
  const org = (await repo.org())!;
  const usage = await repo.monthTotals(month);
  const st = monthlyStatement({
    plan: org.plan as PlanId,
    seats: org.seats,
    interval: org.billingInterval,
    usage,
  });
  const rows: [string, unknown][] = [
    ['organisation', org.name],
    ['organisation_id', org.id],
    ['period', month],
    ['plan', st.plan],
    ['seats', st.seats],
    ['billing_interval', st.interval],
    ['seat_fees_usd', st.seatFeesUsd.toFixed(2)],
    ['platform_fee_usd', st.platformFeeUsd.toFixed(2)],
    ['requests', usage.requests],
    ['input_tokens', usage.inputTokens],
    ['cache_write_tokens', usage.cacheWriteTokens],
    ['cache_read_tokens', usage.cacheReadTokens],
    ['output_tokens', usage.outputTokens],
    ['used_tokens', st.usedTokens],
    ['allowance_tokens', st.allowanceTokens ?? 'custom'],
    ['overage_tokens', st.overageTokens],
    ['overage_rate_input_per_mtok_usd', OVERAGE_PER_MTOK.input],
    ['overage_rate_cached_input_per_mtok_usd', OVERAGE_PER_MTOK.cachedInput],
    ['overage_rate_output_per_mtok_usd', OVERAGE_PER_MTOK.output],
    ['overage_usd', st.overageUsd.toFixed(2)],
    ['total_usd_ex_vat', st.totalUsd.toFixed(2)],
  ];
  // Enterprise is priced per agreement: report usage, not the list-price calculation.
  const out = isCustomPriced(org.plan as PlanId)
    ? rows.map(([k, v]): [string, unknown] =>
        /_usd$|overage_rate/.test(k) ? [k, 'per agreement'] : [k, v],
      )
    : rows;
  const csv = csvRow(['field', 'value']) + out.map((r) => csvRow(r)).join('');
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sealcode-statement-${org.slug}-${month}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
