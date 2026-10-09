'use client';

import { useState } from 'react';

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
      <div className="card mx-auto max-w-sm">
        <h1 className="mb-2 text-2xl font-bold">Confirme seu e-mail</h1>
        <p>Enviamos um link de confirmação. Clique nele para ativar a conta.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Criar conta</h1>
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
        minLength={8}
        placeholder="Senha (mín. 8 caracteres)"
        autoComplete="new-password"
        className="w-full rounded border p-2"
      />
      <input
        name="confirm"
        type="password"
        required
        minLength={8}
        placeholder="Confirmar senha"
        autoComplete="new-password"
        className="w-full rounded border p-2"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn btn-primary w-full">
        {loading ? 'Criando…' : 'Criar conta'}
      </button>
      <p className="text-sm">
        Já tem conta?{' '}
        <a href="/login" className="text-brand-600">
          Entrar
        </a>
      </p>
    </form>
  );
}
