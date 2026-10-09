'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get('email'));
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Rate limiting is global (not per account), so reporting it does not leak
    // whether the email exists. Any other error gets the same generic success.
    if (error?.status === 429) {
      setError('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="card mx-auto max-w-sm">
        <p>
          Se o e-mail estiver cadastrado, você receberá um link para redefinir a
          senha.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Redefinir senha</h1>
      <input
        name="email"
        type="email"
        required
        placeholder="E-mail"
        className="w-full rounded border p-2"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn btn-primary w-full">
        Enviar link
      </button>
    </form>
  );
}
