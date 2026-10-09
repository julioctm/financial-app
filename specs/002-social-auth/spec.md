# Login Social com Google

**Status:** In Review
**Spec ID:** 002-social-auth
**Autor:**
**Data:** 2026-10-09

## 1. Contexto e Motivação

Login com Google reduz o atrito de cadastro e é a opção social mais esperada. Esta spec estende a [001-auth](../001-auth/spec.md) usando o suporte nativo do Supabase Auth a OAuth e *identity linking*, sem tabelas próprias de tokens.

## 2. Objetivo

Permitir entrar/criar conta com Google e vincular/desvincular o Google de uma conta existente, usando `auth.identities` do Supabase.

## 3. Fora de Escopo

- Outros provedores (Apple, GitHub) e MFA
- Google Workspace / contas corporativas
- Armazenar access/refresh tokens do Google (o app não chama APIs do Google; o Supabase gerencia a sessão)

## 4. Requisitos Funcionais

1. A tela de login e a de cadastro exibem o botão "Entrar com Google"
2. Ao clicar, o usuário vai ao consentimento do Google e retorna autenticado ao app
3. Se não existir conta com o e-mail, uma conta (e `profile`) é criada
4. Se já existir conta com o mesmo e-mail verificado, a identidade Google é vinculada a ela (sem duplicar usuário)
5. Usuário logado pode vincular o Google em Configurações (`linkIdentity`)
6. Usuário pode desvincular o Google (`unlinkIdentity`), desde que reste outro método de login (senha ou outra identidade)
7. Após o login, o usuário volta para a rota originalmente solicitada (`next`), validada como caminho relativo

## 5. Requisitos Não-Funcionais

- Fluxo OAuth com PKCE e validação de `state` (fornecido pelo Supabase)
- Redirect URIs restritas a uma allowlist por ambiente (local, preview, produção)
- Client secret do Google nunca no código; configurado apenas no painel do Supabase

## 6. Modelo de Dados

Sem tabelas novas. Usa `auth.identities` (gerenciada pelo Supabase). `profiles.full_name` pode ser preenchido a partir de `raw_user_meta_data` do Google pela trigger existente.

## 7. Regras de Negócio

- Só vincular automaticamente por e-mail quando o provedor retornar o e-mail como verificado
- Bloquear desvinculação da última identidade de login
- RLS inalterado: dados continuam isolados por `auth.uid()`

## 8. Fluxos de UI/UX

- Login/cadastro: botão "Entrar com Google" (ícone oficial), estado de loading durante o redirect
- Cancelamento ou consentimento negado: volta ao login com mensagem clara
- Configurações > "Contas vinculadas": lista de identidades, botão "Desvincular" com modal de confirmação

## 9. Casos de Borda

- Erro retornado pelo Google/Supabase no callback → login com mensagem de erro
- Usuário cancela no meio do fluxo → volta ao login
- Identidade Google já vinculada a outro usuário → erro claro, sem vincular
- Desvincular a única forma de login → bloqueado com explicação
- Usuário criado só com Google que quer senha → usar "esqueci minha senha" para definir uma

## 10. Critérios de Aceite

- [ ] Dado usuário não autenticado, ao clicar em "Entrar com Google", é levado ao consentimento do Google
- [ ] Dado novo e-mail, ao concluir o Google, conta e profile são criados e o usuário acessa o app
- [ ] Dado conta e-mail/senha existente com o mesmo e-mail, ao entrar com Google, a identidade é vinculada (um único usuário)
- [ ] Dado usuário logado, ao desvincular o Google tendo senha definida, a identidade é removida
- [ ] Dado usuário só com Google, ao tentar desvincular, a ação é bloqueada

## 11. Perguntas Abertas

- Apple Sign In entra em qual fase (exige conta Apple Developer paga)?
