'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <form onSubmit={onSubmit} className="card mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Entrar</h1>
      <input
        name="email"
        type="email"
        required
        placeholder="E-mail"
        autoComplete="email"
        className="w-full rounded border p-2"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Senha"
        autoComplete="current-password"
        className="w-full rounded border p-2"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn btn-primary w-full">
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="text-sm">
        <a href="/forgot-password" className="text-brand-600">
          Esqueci minha senha
        </a>
        {' · '}
        <a href="/signup" className="text-brand-600">
          Criar conta
        </a>
      </p>
    </form>
  );
}
