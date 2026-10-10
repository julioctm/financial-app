import Link from 'next/link';

import { LogoMark } from '@/components/ui/logo';

// Focused layout for pages shown before a workspace is active (login, onboarding...).
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-5 py-4">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold">
          <LogoMark />
          Financial App
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
        {children}
      </main>
    </div>
  );
}
