'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({
      password: String(new FormData(e.currentTarget).get('password')),
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Nova senha</h1>
      <input name="password" type="password" required minLength={8} placeholder="Nova senha" autoComplete="new-password" className="w-full rounded border p-2" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="btn btn-primary w-full">Salvar</button>
    </form>
  );
}
