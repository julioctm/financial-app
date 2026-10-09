import './globals.css';

import type { Metadata } from 'next';

import { switchWorkspace } from '@/app/actions/workspace';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaces, pickActive } from '@/lib/workspace';

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
  const workspaces = user ? await getWorkspaces() : [];
  const active = pickActive(workspaces);

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
                {workspaces.length > 1 && (
                  <form action={switchWorkspace}>
                    <select
                      name="workspace_id"
                      defaultValue={active?.id}
                      aria-label="Workspace"
                      className="rounded border p-1 text-sm"
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <button className="ml-1 text-sm text-brand-600">
                      Trocar
                    </button>
                  </form>
                )}
                <a
                  href="/dashboard"
                  className="text-gray-700 hover:text-brand-600"
                >
                  Dashboard
                </a>
                <a
                  href="/settings"
                  className="text-gray-700 hover:text-brand-600"
                >
                  Configurações
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
