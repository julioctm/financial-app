# Login Social com Google

**Status:** Draft
**Spec ID:** 002-social-auth
**Autor:** 
**Data:** 2026-10-08

## 1. Contexto e Motivação

O app financeiro lida com dados confidenciais de cada usuário. Muitos usuários valorizam a conveniência da autenticação social, sendo o login com Google a opção mais popular. Oferecer essa opção reduz atrito de cadastro, melhora taxas de conversão e atende à expectativa do usuário de acesso rápido.

## 2. Objetivo

Permitir que usuários acessem o app financeiro através de provedores OAuth, começando com Google. Implementar um fluxo seguro e consistente que mapeie contas sociais para perfis locais, permitindo vincular/desvincular provedores e migrar contas existente.

## 3. Fora de Escopo

- Autenticação multifator (MFA) — pode ser spec futura
- Login social para empresas/organizações (Google Workspace) — pode ser spec futura
- Recuperação de conta via provedores sociais (Google Account Recovery) — pode ser spec futura

## 4. Requisitos Funcionais

1. Usuário pode iniciar login social clicando no botão "Entrar com Google"
2. Usuário pode ser redirecionado para página de consentimento do Google
3. Usuário pode autenticar com conta Google e ser redirecionado de volta para o app
4. Usuário pode criar conta local se não tiver conta email/senha existente
5. Usuário pode fazer login com conta Google se já tiver conta (email/senha)
6. Usuário pode vincular conta Google à conta existente (após login com email/senha)
7. Usuário pode desvincular conta Google da conta
8. Usuário pode solicitar recuperação de senha através do login social (se não tiver email)

## 5. Requisitos Não-Funcionais

- OAuth2 com CSRF protection, estado validation e redirect URIs seguras
- Tokens armazenados criptografados no Supabase (JWT para ID token, refresh token para longevidade)
- Segurança: PKCE (Proof Key for Code Exchange) obrigatório
- A/W: Usuários podem habilitar/desabilitar provedores por conta
- A/W: Apenas provedores permitidos por ambiente (dev/prod)

## 6. Modelo de Dados

```
├── id (uuid, pk)
├── user_id (uuid, fk -> auth.users.id, único por provider)
├── provider (enum: google, apple, github)
├── provider_user_id (text, único por provider)
├── access_token (text, criptografado)
├── refresh_token (text, criptografado)
├── expires_at (timestamp)
├── created_at (timestamp)
└── updated_at (timestamp)
```

## 7. Regras de Negócio

- Garantir unicidade: (user_id + provider + provider_user_id) deve ser único
- Implementar lógica de "Primeiro Acesso": se usuário social novo → criar conta local
- Implementar lógica de "Vinculação": se usuário tem conta local → vincular conta social
- RLS: usuários só podem acessar/modificar suas próprias contas oauth
- Implementar rota de recuperação: se usuário social perde conta → pode usar provider para recuperar acesso
- Token refresh: refresh tokens expirados → solicitar novo do provider (refresh token flow)

## 8. Fluxos de UI/UX

### Tela de Login (Login Social)

- Botão central "Entrar com Google" usando ícone oficial do Google
- Texto: "Entrar com Google"
- Estado de carregamento durante redirecionamento OAuth
- Link abaixo: "Entrar com email e senha"
- Link abaixo: "Criar conta"

### Callback Handler (Pop-up/Redirect)

- Se app em mobile/web: pop-up janela Google OAuth
- Se web: redirect page with spinner
- Mostrar erro claro se usuário cancelar
- Mostrar erro se consentimento negado

### Gerenciar Contas (Configurações)

- Seção "Contas Vinculadas"
- Mostrar provedores habilitados
- Botão "Desvincular" por provider
- Modal de confirmação

## 9. Casos de Borda

- Usuário tenta fazer login com Google já vinculado → mostrar erro, oferta para deslogar conta social vinculada
- Google OAuth retorna erro (redirecionar com erro claro)
- Token OAuth expira, refresh falha → usuário deve refazer login social
- Usuário cancela login social a meio caminho → retornar à tela de login
- Redirecionar URL original após sucesso no login social (se fornecido)
- Usuário social sem email (Google retornando sub apenas) → pedir cadastro obrigatório
- Conflito de provider_user_id (conta Google já vinculada) → tratá como usuário existente

## 10. Critérios de Aceite

- [ ] Dado usuário não autenticado, quando clica em "Entrar com Google", então é redirecionado para página de consentimento do Google
- [ ] Dado usuário autentica com Google, quando retorna ao app, então usuário acessa app (cria ou acessa conta)
- [ ] Dado usuário tem conta local, quando autentica com Google, então conta Google é vinculada
- [ ] Dado usuário autenticado, quando clica em "Desvincular Google", então conta Google é removida
- [ ] Dado usuário sem email Google, quando tenta fazer login, então sistema pede preenchimento obrigatório de email

## 11. Perguntas Abertas

- Login social para Apple (provider específico para iOS/macOS) entra em qual fase do roadmap?
- Qual o tempo de expiração padrão de tokens OAuth (12h, 30d, custom)?
- Como lidar com reutilização de código em diferentes dispositivos (mobile vs web)?
- Qual o processo de recuperação de senha para usuários apenas de login social?
- Como lidar com alterações de política do Google (como mudanças no consentimento)?