import 'server-only';
import { env } from './env';
import { logger } from './logger';
import { errorFields } from '@sealcode/shared/logger';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Development only: recent emails, so sign-in works locally without an email provider. */
const globalForMail = globalThis as unknown as { sealcodeDevMailbox?: (Email & { at: number })[] };
export function devMailbox(): (Email & { at: number })[] {
  globalForMail.sealcodeDevMailbox ??= [];
  return globalForMail.sealcodeDevMailbox;
}

function html(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" style="color:#b93a0b">$1</a>',
  );
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#0e1726;max-width:560px">${linked
    .split('\n\n')
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join(
      '',
    )}<p style="color:#6b7280;font-size:12px">Sealcode · Confidential AI coding, with receipts.</p></div>`;
}

/** Transactional email via Resend. Without an API key (development), mail is kept in memory. */
export async function sendEmail(email: Email): Promise<void> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    if (e.production) throw new Error('RESEND_API_KEY is required in production');
    devMailbox().unshift({ ...email, at: Date.now() });
    devMailbox().splice(50);
    process.stdout.write(
      `\n[dev email] to=${email.to} subject="${email.subject}"\n${email.text}\n\n`,
    );
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: e.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: html(email.text),
    }),
  });
  if (!res.ok) {
    logger.error('email.send_failed', { status: res.status });
    throw new Error('email_failed');
  }
}

export async function trySendEmail(email: Email): Promise<boolean> {
  try {
    await sendEmail(email);
    return true;
  } catch (err) {
    logger.error('email.send_failed', errorFields(err));
    return false;
  }
}
