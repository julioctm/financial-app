import './globals.css';

import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Financial App',
  description: 'Acompanhe suas finanças em um só lugar.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <html lang="pt-BR">
      <body className="bg-gray-50">
        <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
          <a href="/" className="text-lg font-bold text-brand-600">
            Financial App
          </a>
          <nav className="flex items-center space-x-6">
            {user ? (
              <>
                <a href="/dashboard" className="text-gray-700 hover:text-brand-600">
                  Dashboard
                </a>
                <form action="/auth/signout" method="post">
                  <button className="text-gray-700 hover:text-brand-600">
                    Sair
                  </button>
                </form>
              </>
            ) : (
              <a href="/login" className="text-gray-700 hover:text-brand-600">
                Entrar
              </a>
            )}
          </nav>
        </header>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
