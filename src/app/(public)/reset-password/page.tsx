'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage, Input } from '@/components/ui/field';
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
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1>Nova senha</h1>
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Nova senha (mín. 8 caracteres)"
          aria-label="Nova senha"
          autoComplete="new-password"
        />
        {error && <FormMessage>{error}</FormMessage>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </Card>
  );
}
