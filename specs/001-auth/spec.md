# Autenticação de Usuários

**Status:** Implemented
**Spec ID:** 001-auth
**Autor:** 
**Data:** 2026-10-06

## 1. Contexto e Motivação

O app financeiro lida com dados sensíveis (transações, patrimônio, investimentos) de cada usuário. É necessário que cada pessoa só acesse seus próprios dados, com um fluxo de login seguro e simples.

## 2. Objetivo

Permitir que um usuário crie uma conta, faça login, faça logout, e tenha seus dados isolados de outros usuários, usando o Supabase Auth como provedor de identidade.

## 3. Fora de Escopo

- Login social (Google, Apple, etc.) — pode ser spec futura
- Autenticação multifator (MFA) — pode ser spec futura
- Recuperação de conta via suporte manual

## 4. Requisitos Funcionais

1. O usuário deve poder criar uma conta com e-mail e senha
2. O usuário deve poder fazer login com e-mail e senha
3. O usuário deve poder fazer logout
4. O usuário deve poder solicitar redefinição de senha via e-mail
5. Rotas protegidas do app devem redirecionar para o login quando o usuário não estiver autenticado
6. A sessão do usuário deve persistir entre visitas (até expirar ou fazer logout)

## 5. Requisitos Não-Funcionais

- Senhas nunca devem ser armazenadas ou logadas em texto plano (delegado ao Supabase Auth)
- Toda comunicação deve ocorrer via HTTPS (padrão da Vercel)

## 6. Modelo de Dados

A tabela de usuários é gerenciada pelo Supabase Auth (`auth.users`). Dados adicionais de perfil ficam em uma tabela própria:

```
profiles
├── id (uuid, pk, fk -> auth.users.id)
├── full_name (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)
```

## 7. Regras de Negócio

- Row Level Security (RLS) habilitado em todas as tabelas de dados do usuário: cada linha só é visível/editável pelo próprio `auth.uid()`
- E-mail deve ser único no sistema (garantido pelo Supabase Auth)
- Confirmação de e-mail obrigatória no cadastro
- Mensagem de redefinição de senha é a mesma exista ou não o e-mail (evita enumeração de contas)
- Senha com no mínimo 8 caracteres

## 8. Fluxos de UI/UX

- Tela de login (e-mail + senha, link para "esqueci minha senha", link para cadastro)
- Tela de cadastro (e-mail + senha + confirmação de senha)
- Tela de redefinição de senha
- Estado de carregamento durante autenticação
- Mensagens de erro claras (credenciais inválidas, e-mail já cadastrado, etc.)

## 9. Casos de Borda

- Tentativa de login com e-mail não cadastrado
- Tentativa de cadastro com e-mail já existente
- Sessão expirada durante uso do app (deve redirecionar para login sem perder contexto bruscamente)
- Usuário fecha o navegador no meio do cadastro

## 10. Critérios de Aceite

- [ ] Dado um e-mail e senha válidos, quando o usuário se cadastra, então uma conta é criada e o usuário é autenticado
- [ ] Dado um usuário já cadastrado, quando ele faz login com credenciais corretas, então ele acessa o app
- [ ] Dado um usuário não autenticado, quando ele tenta acessar uma rota protegida, então é redirecionado para o login
- [ ] Dado um usuário autenticado, quando ele faz logout, então a sessão é encerrada e ele é redirecionado para o login

## 11. Perguntas Abertas

- ~~Login social entra em qual fase do roadmap?~~ Resolvido: spec 002-social-auth, logo após esta.
- ~~Tempo de expiração de sessão?~~ Resolvido: padrão do Supabase (access token de 1h, renovado automaticamente via refresh token; sessão persiste até logout). Ajustável no dashboard do Supabase se necessário.
