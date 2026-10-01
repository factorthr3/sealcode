import type { Metadata } from 'next';
import Link from 'next/link';
import { SALES_EMAIL } from '@sealcode/shared';

export const metadata: Metadata = { title: 'Terms of service' };

export default function TermsPage() {
  return (
    <>
      <h1 className="font-display text-5xl tracking-tight text-ink">Terms of service</h1>
      <p>These terms govern use of Sealcode&rsquo;s website, dashboard, CLI and gateway.</p>
      <h2>The service</h2>
      <p>
        Sealcode provides a gateway that forwards AI coding requests to models running in trusted
        execution environments, with metering, limits and an audit log. Model output can be wrong:
        review it as you would any contributor&rsquo;s code.
      </p>
      <h2>Plans and pilots</h2>
      <p>
        Paid plans start when we countersign an order form. Fees, seats, allowances and overage are
        as stated in your order form. Pilots are free, time-limited evaluations with the limits we
        agree with you. We give at least 30 days&rsquo; notice of any change to prices or models
        that affects you.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Don&rsquo;t use Sealcode to break the law, to attack our systems or others&rsquo;, or to
        resell access without our agreement. You are responsible for your API keys and for the tools
        you connect.
      </p>
      <h2>Third-party tools</h2>
      <p>
        Sealcode works with clients such as Claude Code, OpenCode, Cline and Continue, which you
        install and use under their own terms. Claude and Claude Code are trademarks of Anthropic,
        PBC; Sealcode is not affiliated with or endorsed by Anthropic.
      </p>
      <h2>Data</h2>
      <p>
        We process your data as described in our <Link href="/legal/privacy">privacy policy</Link>{' '}
        and, for business customers, our data processing agreement. We never store the content of
        your requests.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
      </p>
    </>
  );
}
