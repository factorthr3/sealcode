/**
 * Who can start a free trial: a work email, and one trial per company domain. Personal and
 * disposable addresses can still sign in and join a team by invitation.
 */

/** Consumer and disposable email providers. Matched on the exact domain after the @. */
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Global consumer mail
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'protonmail.ch',
  'pm.me',
  'gmx.com',
  'gmx.co.uk',
  'gmx.de',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'zohomail.eu',
  'yandex.com',
  'yandex.ru',
  'tutanota.com',
  'tuta.io',
  'tutamail.com',
  'fastmail.com',
  'fastmail.fm',
  'hey.com',
  'qq.com',
  '163.com',
  '126.com',
  'web.de',
  'orange.fr',
  'free.fr',
  'laposte.net',
  'libero.it',
  'mail.ru',
  'inbox.com',
  'hushmail.com',
  // UK ISPs
  'btinternet.com',
  'sky.com',
  'virginmedia.com',
  'talktalk.net',
  'ntlworld.com',
  'blueyonder.co.uk',
  // Disposable
  'mailinator.com',
  'guerrillamail.com',
  'sharklasers.com',
  '10minutemail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'dispostable.com',
  'getnada.com',
  'maildrop.cc',
  'throwawaymail.com',
]);

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@').pop() ?? '';
}

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}
