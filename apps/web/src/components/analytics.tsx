'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Button } from './ui';

/**
 * Google Analytics for the public site, loaded only after the visitor accepts analytics cookies.
 * Mounted in the marketing layout only: dashboard, sign-in, invite and device pages can carry IDs
 * or tokens in their URLs, so hits are switched off whenever this layout isn't on screen.
 */
const GA_ID = 'G-BCVHTGRDY9';
const DISABLE_FLAG = `ga-disable-${GA_ID}`;
const CONSENT_KEY = 'sealcode-analytics-consent';
/** Production only, so local and preview builds don't send hits. */
const HOSTS = new Set(['sealcode.ai', 'www.sealcode.ai']);
export const COOKIE_SETTINGS_EVENT = 'sealcode:cookie-settings';

type Choice = 'granted' | 'denied';

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

function saveChoice(choice: Choice) {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

/** Remove Google Analytics cookies after consent is withdrawn. */
function clearGaCookies() {
  const domain = location.hostname.replace(/^www\./, '');
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (!name || !(name === '_ga' || name.startsWith('_ga_'))) continue;
    for (const d of [`; domain=.${domain}`, `; domain=${domain}`, '']) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    }
  }
}

export function Analytics() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [ready, setReady] = useState(false);
  const [enabledHost, setEnabledHost] = useState(false);

  useEffect(() => {
    setChoice(readChoice());
    setEnabledHost(HOSTS.has(location.hostname));
    setReady(true);
    const reopen = () => setChoice(null);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  // Hits are allowed only while the marketing layout is mounted. The cleanup runs before the
  // router records a navigation away, so dashboard URLs never reach Google.
  useLayoutEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w[DISABLE_FLAG] = false;
    return () => {
      w[DISABLE_FLAG] = true;
    };
  }, []);

  function decide(next: Choice) {
    const before = readChoice();
    saveChoice(next);
    setChoice(next);
    if (next === 'denied' && before === 'granted') {
      // The script is already running; reload so it's gone, and drop its cookies.
      clearGaCookies();
      location.reload();
    }
  }

  return (
    <>
      {enabledHost && choice === 'granted' ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </>
      ) : null}
      {ready && choice === null ? (
        <div
          role="region"
          aria-label="Cookie choice"
          className="fixed inset-x-0 bottom-0 z-50 p-3 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md sm:p-0"
        >
          <div className="rounded-xl border border-line bg-surface p-4 text-sm shadow-lg">
            <p className="text-ink-2">
              Can we use Google Analytics cookies to see how people find and use our public pages?
              Never on the dashboard, and never what you type into the playground.{' '}
              <Link href="/legal/privacy" className="underline underline-offset-2">
                Privacy
              </Link>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => decide('denied')}>
                Decline
              </Button>
              <Button variant="secondary" size="sm" onClick={() => decide('granted')}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Footer link that reopens the cookie choice. */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      className="underline underline-offset-2 hover:text-ink"
      onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}
    >
      Cookie settings
    </button>
  );
}
