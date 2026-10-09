import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Handles the redirect from Supabase email links (confirm signup, reset password).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/dashboard';
  // Only allow same-origin relative paths to avoid open redirects.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (code) {
    const { error } = await createClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link_invalido`);
}
