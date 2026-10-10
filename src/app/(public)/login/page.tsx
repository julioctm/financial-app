'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage, Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read after mount to avoid a server/client hydration mismatch.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get('error') ===
      'link_invalido'
    ) {
      setError('Link inválido ou expirado. Solicite um novo.');
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    if (error) {
      setError('E-mail ou senha inválidos.');
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href =
      next && next.startsWith('/') && !next.startsWith('//')
        ? next
        : '/dashboard';
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1>Entrar</h1>
        <Input
          name="email"
          type="email"
          required
          placeholder="E-mail"
          aria-label="E-mail"
          autoComplete="email"
        />
        <Input
          name="password"
          type="password"
          required
          placeholder="Senha"
          aria-label="Senha"
          autoComplete="current-password"
        />
        {error && <FormMessage>{error}</FormMessage>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="flex justify-between text-sm">
          <Link
            href="/forgot-password"
            className="text-accent-ink hover:underline"
          >
            Esqueci minha senha
          </Link>
          <Link href="/signup" className="text-accent-ink hover:underline">
            Criar conta
          </Link>
        </p>
      </form>
    </Card>
  );
}
