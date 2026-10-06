/**
 * Google Analytics with Consent Mode. The tag is in every public page's HTML, so Google can detect
 * it, but analytics cookies stay off until the visitor accepts; until then Google receives only
 * cookieless pings. Ad storage is never granted. Shared by the marketing layout (server) and the
 * cookie banner (client).
 */
export const GA_ID = 'G-BCVHTGRDY9';
export const CONSENT_KEY = 'sealcode-analytics-consent';
/** Production only, so local and preview builds send nothing. */
export const GA_HOSTS = ['sealcode.ai', 'www.sealcode.ai'];

export const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

/**
 * Runs before gtag.js processes its queue: consent defaults to denied, a stored "Accept" is
 * re-applied, then the tag is configured. Does nothing off the production host.
 */
export const GTAG_INIT = `(function(){
if (${JSON.stringify(GA_HOSTS)}.indexOf(location.hostname) < 0) return;
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});
try {
  if (localStorage.getItem('${CONSENT_KEY}') === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }
} catch (e) {}
gtag('js', new Date());
gtag('config', '${GA_ID}');
})();`;
