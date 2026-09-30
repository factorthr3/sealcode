import { ButtonLink } from '@/components/ui';
import { Logo } from '@/components/logo';

// Placeholder until the marketing site lands (Milestone 6).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <Logo />
      <h1 className="font-display text-6xl tracking-tight">
        Confidential AI coding, with receipts.
      </h1>
      <div className="flex gap-3">
        <ButtonLink href="/signup">Start free trial</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Sign in
        </ButtonLink>
      </div>
    </main>
  );
}
