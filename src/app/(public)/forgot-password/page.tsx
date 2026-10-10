'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage, Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get('email'));
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
      <Card className="space-y-2">
        <h1>Verifique seu e-mail</h1>
        <p className="text-muted">
          Se o e-mail estiver cadastrado, você receberá um link para redefinir a
          senha.
        </p>
        <Link href="/login" className="text-sm text-accent-ink hover:underline">
          Voltar para o login
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1>Redefinir senha</h1>
        <Input
          name="email"
          type="email"
          required
          placeholder="E-mail"
          aria-label="E-mail"
          autoComplete="email"
        />
        {error && <FormMessage>{error}</FormMessage>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>
    </Card>
  );
}
