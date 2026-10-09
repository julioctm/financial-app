# Infraestrutura: Supabase + Vercel

## 0. Pré-requisito local
Instalar Node 20 LTS (ex.: `brew install node@20` ou https://nodejs.org), depois `npm install`.

## 1. Supabase
1. Crie um projeto em https://supabase.com/dashboard (região próxima, ex.: South America – São Paulo). Guarde a senha do banco.
2. **Project Settings > API**: copie `Project URL` e a chave `anon` para `.env.local` (veja `.env.example`). Nunca use a `service_role` no front-end.
3. **Banco**: aplique `supabase/migrations/20261009000000_profiles.sql` no SQL Editor (ou via CLI: `npx supabase link --project-ref <ref>` e `npx supabase db push`).
4. **Authentication > Providers > Email**: manter habilitado, "Confirm email" ligado.
5. **Authentication > URL Configuration**:
   - Site URL: URL de produção (ex.: `https://seu-app.vercel.app`)
   - Redirect URLs (allowlist): `http://localhost:3000/**`, `https://seu-app.vercel.app/**` e `https://*-<seu-time>.vercel.app/**` (previews)
6. **SMTP**: o e-mail padrão do Supabase tem limite baixo (poucos e-mails/hora). Para produção configure um SMTP próprio (Resend, Postmark, SES) em Authentication > SMTP Settings.
7. **Google (spec 002)**:
   - Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web). Em "Authorized redirect URIs" coloque `https://<ref>.supabase.co/auth/v1/callback`.
   - Cole Client ID/Secret em Supabase > Authentication > Providers > Google.
   - Em Authentication, habilite "Manual linking" para usar `linkIdentity`.
8. Sugestão: criar um projeto separado para **dev** e outro para **prod**.

## 2. Vercel
1. Suba o repositório no GitHub (`gh repo create financial-app --private --source . --push`).
2. https://vercel.com/new > importe o repo (framework Next.js detectado automaticamente).
3. **Settings > Environment Variables** (Production, Preview e Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` (URL de produção)
4. Deploy. Depois, volte ao Supabase e confirme Site URL/Redirect URLs com o domínio real.
5. Cada PR gera um preview; use o projeto Supabase de dev para Preview, se separar ambientes.

## 3. Checklist de verificação
- [ ] Cadastro envia e-mail de confirmação; link cai em `/dashboard`
- [ ] Rota `/dashboard` deslogado redireciona para `/login`
- [ ] Reset de senha funciona ponta a ponta
- [ ] Em produção, perfil criado em `public.profiles` ao cadastrar

## 4. Templates de e-mail (obrigatório)
Authentication > Email Templates. O link padrão usa PKCE e só funciona no mesmo navegador que pediu o e-mail. Troque o link por um baseado em `token_hash`:

**Reset Password**
```
<h2>Redefinir senha</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Redefinir minha senha</a></p>
```

**Confirm signup**
```
<h2>Confirme seu e-mail</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirmar meu e-mail</a></p>
```
`{{ .SiteURL }}` vem de Authentication > URL Configuration (use `http://localhost:3000` no projeto dev).
