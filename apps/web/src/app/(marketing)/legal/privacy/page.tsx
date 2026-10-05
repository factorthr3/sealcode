import type { Metadata } from 'next';
import Link from 'next/link';
import { SECURITY_EMAIL, SUPPORT_EMAIL } from '@sealcode/shared';
import { subprocessors } from '@/lib/content';
import { inConfidentialVm } from '@/lib/hosting';

export const metadata: Metadata = { title: 'Privacy policy' };

export default async function PrivacyPage() {
  const tee = await inConfidentialVm();
  return (
    <>
      <h1 className="font-display text-5xl tracking-tight text-ink">Privacy policy</h1>
      <p>
        This policy explains what personal data Sealcode handles when you use our website,
        dashboard, CLI and gateway, and why. It reflects how the service is built; the{' '}
        <Link href="/security">security page</Link> covers the technical detail.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> your name, work email address, organisation and role, and
          whether two-factor sign-in is enabled.
        </li>
        <li>
          <strong>Request metadata:</strong> for each gateway request, the time, member, API key,
          model, token counts, latency, status and receipt ID.
        </li>
        <li>
          <strong>Enquiries:</strong> what you tell us through the contact form.
        </li>
      </ul>
      <h2>What we don&rsquo;t collect</h2>
      <p>
        We never store the content of your requests: prompts, code and completions pass through our
        gateway to models running inside hardware enclaves, and aren&rsquo;t logged or retained. The
        playground on our homepage works the same way, and our website never sees what you type into
        it.
      </p>
      <h2>Why we use it</h2>
      <p>
        To provide the service (authentication, limits, usage, billing and the audit log your
        organisation relies on), to reply to enquiries, and to send transactional email such as
        sign-in links and budget alerts. We don&rsquo;t sell data or use advertising cookies. We set
        one session cookie when you sign in.
      </p>
      <h2>Analytics cookies</h2>
      <p>
        If you accept analytics cookies, Google Analytics measures visits to our public pages: which
        pages you view, roughly where you are and what device you use. It never runs on the
        dashboard, sign-in or invitation pages, and never sees what you type into the playground. If
        you decline, nothing is loaded. You can change your choice at any time with &ldquo;Cookie
        settings&rdquo; at the bottom of every public page.
      </p>
      <h2>Who processes it</h2>
      <ul>
        {subprocessors(tee).map((s) => (
          <li key={s.name}>
            <strong>{s.name}:</strong> {s.purpose.toLowerCase()}.
          </li>
        ))}
      </ul>
      <h2>Retention</h2>
      <p>
        Account data and request metadata are kept for the life of your organisation&rsquo;s account
        and deleted when it closes, unless we&rsquo;re required to keep invoicing records. Sign-in
        links expire after 15 minutes; sessions after 30 days.
      </p>
      <h2>Your rights</h2>
      <p>
        Under UK and EU GDPR you can ask to access, correct or delete your data, or object to how we
        use it. Where your organisation is the controller, we&rsquo;ll pass your request to them.
        Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>; for security matters,{' '}
        <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>. You can also complain to the
        Information Commissioner&rsquo;s Office.
      </p>
    </>
  );
}
