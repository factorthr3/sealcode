import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" aria-label="Sealcode home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
