import 'server-only';
import { formatTokens } from '@sealcode/shared';
import { errorFields } from '@sealcode/shared/logger';
import { acc, tenant } from './db';
import { sendEmail } from './email';
import { env } from './env';
import { logger } from './logger';

/** Send queued budget alerts to each org's owners and admins. */
export async function dispatchNotifications(): Promise<number> {
  const pending = await acc().pendingNotifications(20);
  let sent = 0;
  for (const n of pending) {
    try {
      if (n.kind === 'budget_alert' && n.orgId) {
        const org = await tenant(n.orgId).org();
        const to = await acc().orgAdminEmails(n.orgId);
        const p = n.payload;
        const scope = p.scope === 'seat' ? 'A seat in' : '';
        const seatEmail =
          p.scope === 'seat' && typeof p.userId === 'string'
            ? (await acc().userById(p.userId))?.email
            : null;
        const subject = `${org?.name ?? 'Your organisation'}: ${p.threshold}% of ${p.scope === 'seat' ? 'a seat' : 'the monthly'} token budget used`;
        const text = `${scope ? `${seatEmail ?? 'A member'} in ` : ''}${org?.name ?? 'Your organisation'} has used ${formatTokens(Number(p.used))} of its ${formatTokens(Number(p.budget))} ${p.scope === 'seat' ? 'seat' : 'monthly'} token budget (${p.threshold}%) for ${p.period}.\n\nReview budgets and usage: ${env().PUBLIC_SITE_URL}/app/budgets`;
        for (const address of to) await sendEmail({ to: address, subject, text });
      }
      await acc().markNotification(n.id, true);
      sent++;
    } catch (err) {
      logger.error('notification.failed', { kind: n.kind, ...errorFields(err) });
      await acc().markNotification(n.id, false);
    }
  }
  return sent;
}
