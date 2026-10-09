'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get('email'));
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Same message whether or not the email exists (avoids account enumeration).
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
      <button disabled={loading} className="btn btn-primary w-full">
        Enviar link
      </button>
    </form>
  );
}
