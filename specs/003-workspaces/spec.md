# Workspaces Compartilhados

**Status:** Approved
**Spec ID:** 003-workspaces
**Autor:**
**Data:** 2026-10-09

## 1. Contexto e Motivação

Hoje o controle financeiro do casal vive em planilhas compartilhadas: duas pessoas enxergam e editam os mesmos dados, mas cada uma tem seu próprio orçamento e os gastos podem ser individuais ou divididos. As specs 001 e 002 isolam dados **por usuário**; esse modelo não serve para o app. É preciso uma unidade compartilhada, o **workspace**, onde todos os membros enxergam e editam tudo.

Esta spec é a base de todos os módulos seguintes (lançamentos, orçamento, patrimônio, investimentos).

## 2. Objetivo

Introduzir workspaces com membros, convites e parâmetros padrão (incluindo o **rateio padrão** entre membros), e trocar o critério de acesso a dados de "dono da linha" para "membro do workspace".

## 3. Fora de Escopo

- Permissões granulares por módulo ou por registro (todo membro vê e edita tudo no workspace)
- Cobrança, planos ou limites por workspace
- Convite por e-mail enviado pelo app (v1 usa link de convite copiável)
- Transferência de dados entre workspaces

## 4. Requisitos Funcionais

1. Um usuário autenticado sem workspace deve ver uma tela inicial para **criar** um workspace (nome) ou **entrar** por um link de convite
2. Ao criar um workspace, o criador vira membro com papel `owner`
3. Um usuário pode pertencer a mais de um workspace e alternar entre eles; o workspace ativo fica salvo na sessão
4. Membros com papel `owner` podem **gerar convites**. O convite é um link com token de uso único, válido por 7 dias
5. Quem abrir o link logado (ou criar conta/entrar a partir dele) deve poder aceitar o convite e virar `member`
6. Todo membro pode ver e editar **todos** os dados do workspace
7. Cada membro corresponde a uma **pessoa** (`people`) do workspace, com nome de exibição editável; pessoas são as opções de "Dono" e "Pagar Para" nos lançamentos (spec 004)
8. O `owner` pode remover um membro. A pessoa e o histórico dela permanecem (marcada como inativa), apenas o acesso é revogado
9. O `owner` pode cadastrar **pessoas externas** (sem login), úteis para registrar gastos de terceiros (ex.: familiares) que aparecem como Dono ou Pagar Para
10. Em **Configurações do workspace**, o `owner` define o **rateio padrão**: um percentual por membro, somando 100%
11. O rateio padrão é usado como valor inicial ao criar qualquer lançamento (spec 004) e pode ser editado pontualmente no lançamento
12. **Alterar o rateio padrão não tem efeito retroativo**: lançamentos existentes mantêm o rateio com que foram criados

## 5. Requisitos Não-Funcionais

- RLS em todas as tabelas: acesso somente a membros do workspace, via função `is_workspace_member(workspace_id)` (security definer, `search_path` fixo)
- Tokens de convite armazenados apenas como hash; nunca logados
- Aceitar convite deve ser atômico (um único uso, mesmo com cliques concorrentes)
- Toda tabela de dados do app tem `workspace_id` e índice nele

## 6. Modelo de Dados

```
workspaces
├── id (uuid, pk)
├── name (text)
├── created_by (uuid, fk -> auth.users.id)
└── created_at (timestamptz)

people
├── id (uuid, pk)
├── workspace_id (uuid, fk -> workspaces.id)
├── display_name (text)
├── user_id (uuid, nullable, fk -> auth.users.id)   -- null = pessoa externa
├── is_active (boolean, default true)
└── unique (workspace_id, user_id) where user_id is not null

workspace_members
├── workspace_id (uuid, fk)
├── user_id (uuid, fk -> auth.users.id)
├── person_id (uuid, fk -> people.id)
├── role (enum: owner, member)
├── created_at (timestamptz)
└── pk (workspace_id, user_id)

workspace_invites
├── id (uuid, pk)
├── workspace_id (uuid, fk)
├── token_hash (text, unique)
├── invited_by (uuid, fk -> auth.users.id)
├── expires_at (timestamptz)
├── used_at (timestamptz, nullable)
└── used_by (uuid, nullable, fk -> auth.users.id)

workspace_split_defaults
├── workspace_id (uuid, fk)
├── person_id (uuid, fk -> people.id)       -- somente pessoas que são membros
├── percent (numeric(5,2))                  -- soma por workspace = 100
└── pk (workspace_id, person_id)
```

`profiles` (spec 001) continua guardando dados do usuário; `people.display_name` pode ser inicializado com `profiles.full_name` ou com o e-mail.

## 7. Regras de Negócio

- `is_workspace_member(ws)` é a única base de autorização dos dados do workspace
- Ações administrativas (convidar, remover membro, rateio padrão, pessoas externas) exigem `role = owner`
- O workspace deve ter ao menos um `owner`; não é possível remover ou rebaixar o último
- A soma dos percentuais do rateio padrão deve ser exatamente 100; só membros ativos participam
- Alterar o rateio padrão apenas atualiza `workspace_split_defaults`; os lançamentos guardam **cópia** do rateio (spec 004), por isso nada é recalculado
- Convite expirado, já usado ou de workspace inexistente deve ser rejeitado com mensagem clara
- Um usuário já membro que abre um convite do mesmo workspace é apenas redirecionado

## 8. Fluxos de UI/UX

- **Onboarding:** usuário sem workspace → "Criar workspace" ou "Tenho um convite"
- **Seletor de workspace** no cabeçalho (quando há mais de um)
- **Configurações > Membros:** lista de membros e pessoas externas, botão "Gerar convite" (exibe link para copiar, com validade), ação de remover
- **Configurações > Rateio padrão:** um campo de percentual por membro, indicador de soma (deve fechar 100%), aviso "não altera lançamentos já feitos"
- **Página de convite** (`/convite/<token>`): mostra nome do workspace e botão "Entrar"; se deslogado, leva ao login e retorna ao convite
- Estados de loading, erro (convite inválido) e vazio

## 9. Casos de Borda

- Convite aberto por quem não tem conta → cadastro/login e retorno ao convite
- Dois cliques simultâneos no mesmo convite → só um é aceito
- Membro removido ainda aparece em lançamentos antigos (como pessoa inativa)
- Rateio com dízimas (ex.: 3 membros, 33,33/33,33/33,34) → sistema exige soma exata de 100,00
- Último `owner` tenta sair ou ser removido → bloqueado
- Usuário removido de um workspace tem o workspace ativo apontando para ele → volta ao seletor/onboarding

## 10. Critérios de Aceite

- [ ] Dado usuário sem workspace, quando cria um, então vira `owner` e acessa o workspace
- [ ] Dado `owner`, quando gera convite e outro usuário o aceita, então ambos veem os mesmos dados do workspace
- [ ] Dado usuário que não é membro, quando consulta dados de um workspace, então não vê nenhuma linha (RLS)
- [ ] Dado convite usado ou expirado, quando alguém abre o link, então recebe erro e não vira membro
- [ ] Dado rateio 65/35 salvo, quando o `owner` altera para 60/40, então lançamentos criados antes permanecem 65/35
- [ ] Dado rateio cuja soma não é 100, quando tenta salvar, então a ação é bloqueada com mensagem
- [ ] Dado `owner` único, quando tenta remover a si mesmo, então a ação é bloqueada

## 11. Perguntas Abertas

- ~~Quem convida e administra?~~ Resolvido: somente o `owner`.
- ~~Pessoas externas (sem login) são aceitáveis?~~ Resolvido: sim.
- Convite por e-mail enviado pelo app entra em qual fase? (v1: link copiável, sem depender de service role nem SMTP; adiado)
