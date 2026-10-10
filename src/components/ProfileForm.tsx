'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateProfile } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { FormMessage, Input } from '@/components/ui/field';

export function ProfileForm({
  firstName,
  lastName,
  next,
}: {
  firstName: string;
  lastName: string;
  /** When set, redirects there after saving (first-time completion). */
  next?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        setSaved(false);
        start(async () => {
          const res = await updateProfile(
            String(data.get('first_name') ?? ''),
            String(data.get('last_name') ?? ''),
          );
          if (!res.ok) return setError(res.error);
          if (next) {
            const safe = next.startsWith('/') && !next.startsWith('//');
            window.location.href = safe ? next : '/dashboard';
          } else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Nome</span>
        <Input
          name="first_name"
          required
          maxLength={40}
          defaultValue={firstName}
          autoComplete="given-name"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Sobrenome</span>
        <Input
          name="last_name"
          maxLength={60}
          defaultValue={lastName}
          autoComplete="family-name"
        />
      </label>
      {error && <FormMessage>{error}</FormMessage>}
      {saved && <FormMessage kind="success">Perfil atualizado.</FormMessage>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : next ? 'Continuar' : 'Salvar'}
      </Button>
    </form>
  );
}
