'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  IconHome2,
  IconLayoutDashboard,
  IconListDetails,
  IconLogout,
  IconMenu2,
  IconSettings,
  IconX,
} from '@tabler/icons-react';

import { switchWorkspace } from '@/app/actions/workspace';
import { LogoMark } from '@/components/ui/logo';

type WorkspaceItem = { id: string; name: string };

// Add modules here as they ship (Lançamentos, Orçamento, ...).
const NAV = [
  { href: '/dashboard', label: 'Visão geral', Icon: IconLayoutDashboard },
  { href: '/cadastros', label: 'Cadastros', Icon: IconListDetails },
  { href: '/settings', label: 'Configurações', Icon: IconSettings },
];

export function AppShell({
  workspaces,
  activeId,
  email,
  children,
}: {
  workspaces: WorkspaceItem[];
  activeId: string;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = workspaces.find((w) => w.id === activeId);

  // Close the drawer after navigating and on Escape; lock page scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="sidebar"
          className="-ml-1 rounded-lg p-1.5 text-xl text-ink hover:bg-line/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <IconMenu2 size={22} aria-hidden="true" />
        </button>
        <span className="font-semibold">{active?.name ?? 'Financial App'}</span>
      </header>

      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/35 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface p-3 transition-[transform,visibility] duration-200 md:sticky md:top-0 md:h-screen md:w-auto md:translate-x-0 md:visible ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-2 pb-4 pt-1">
          <LogoMark />
          <span className="font-semibold">Financial App</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="ml-auto rounded-lg p-1.5 text-lg text-muted hover:bg-line/60 md:hidden"
          >
            <IconX size={20} aria-hidden="true" />
          </button>
        </div>

        {workspaces.length > 1 ? (
          <form action={switchWorkspace} className="mb-3 px-1">
            <label className="sr-only" htmlFor="ws-select">
              Workspace
            </label>
            <select
              id="ws-select"
              name="workspace_id"
              defaultValue={activeId}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
            <IconHome2 size={18} className="text-muted" aria-hidden="true" />
            <span className="truncate font-medium">{active?.name}</span>
          </div>
        )}

        <nav aria-label="Principal" className="flex-1 space-y-0.5">
          {NAV.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  isActive
                    ? 'bg-accent-tint font-medium text-accent-ink'
                    : 'text-muted hover:bg-line/60 hover:text-ink'
                }`}
              >
                <item.Icon size={20} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line pt-3">
          <p className="truncate px-3 pb-2 text-xs text-muted">{email}</p>
          <form action="/auth/signout" method="post">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-line/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
              <IconLogout size={20} aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
