import { describe, expect, it } from 'vitest';
import { emailDomain, isPersonalEmailDomain } from '../src';

describe('trial email policy', () => {
  it('extracts the domain', () => {
    expect(emailDomain(' Priya@Acme-Pay.co.uk ')).toBe('acme-pay.co.uk');
  });

  it('flags personal and disposable domains, not company ones', () => {
    for (const d of ['gmail.com', 'Outlook.com', 'btinternet.com', 'mailinator.com', 'proton.me']) {
      expect(isPersonalEmailDomain(d)).toBe(true);
    }
    for (const d of ['acme-pay.co.uk', 'nhs.net', 'mail.google.com.evil.io']) {
      expect(isPersonalEmailDomain(d)).toBe(false);
    }
  });
});
