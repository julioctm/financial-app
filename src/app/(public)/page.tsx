import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonClass } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="space-y-6 text-center">
      <h1 className="text-3xl">Suas finanças, em um só lugar</h1>
      <p className="text-muted">
        Acompanhe gastos, divida despesas e planeje o futuro financeiro, sozinho
        ou em casa.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/login" className={buttonClass()}>
          Entrar
        </Link>
        <Link href="/signup" className={buttonClass({ variant: 'secondary' })}>
          Criar conta
        </Link>
      </div>
    </div>
  );
}
