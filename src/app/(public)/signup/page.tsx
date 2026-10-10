'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage, Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirm'))) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    const { data, error } = await createClient().auth.signUp({
      email: String(form.get('email')),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // With email confirmation on, no session is returned until the link is clicked.
    if (data.session) window.location.href = '/dashboard';
    else setDone(true);
  }

  if (done) {
    return (
      <Card className="space-y-2">
        <h1>Confirme seu e-mail</h1>
        <p className="text-muted">
          Enviamos um link de confirmação. Clique nele para ativar a conta.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1>Criar conta</h1>
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
          minLength={8}
          placeholder="Senha (mín. 8 caracteres)"
          aria-label="Senha"
          autoComplete="new-password"
        />
        <Input
          name="confirm"
          type="password"
          required
          minLength={8}
          placeholder="Confirmar senha"
          aria-label="Confirmar senha"
          autoComplete="new-password"
        />
        {error && <FormMessage>{error}</FormMessage>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Criando…' : 'Criar conta'}
        </Button>
        <p className="text-sm">
          Já tem conta?{' '}
          <Link href="/login" className="text-accent-ink hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </Card>
  );
}
