# Specs — Spec-Driven Development

Este projeto segue uma abordagem de **Spec-Driven Development (SDD)**: antes de implementar qualquer feature relevante, escrevemos uma especificação que define o que será construído, por quê, e como saberemos que está pronto.

## Fluxo de trabalho

1. **Criar a spec** — copie `_template/spec.md` para uma nova pasta `specs/NNN-nome-da-feature/`, usando o próximo número sequencial disponível.
2. **Preencher a spec** — detalhe contexto, requisitos, modelo de dados e critérios de aceite. Status inicial: `Draft`.
3. **Revisar** — releia a spec como se fosse implementá-la você mesmo (ou peça revisão, se estiver em equipe). Ajuste até fazer sentido. Status: `In Review` → `Approved`.
4. **Implementar** — a spec aprovada guia o desenvolvimento. Referencie o número da spec nos commits/PRs relacionados (ex: `feat(auth): login flow [001-auth]`).
5. **Atualizar status** — ao concluir, marque a spec como `Implemented`. Se a implementação divergir da spec original, atualize a spec para refletir a realidade (specs desatualizadas perdem valor).

## Convenção de numeração

- Specs são numeradas sequencialmente: `001-auth`, `002-transactions`, `003-budgets`, etc.
- O número reflete a ordem de criação da spec, não necessariamente a ordem de implementação.

## Estrutura de uma spec

Toda spec segue o template em [`_template/spec.md`](./_template/spec.md), com as seções:

1. Contexto e Motivação
2. Objetivo
3. Fora de Escopo
4. Requisitos Funcionais
5. Requisitos Não-Funcionais
6. Modelo de Dados
7. Regras de Negócio
8. Fluxos de UI/UX
9. Casos de Borda
10. Critérios de Aceite
11. Perguntas Abertas

## Specs existentes

| ID | Nome | Status |
|----|------|--------|
| [001-auth](./001-auth/spec.md) | Autenticação de Usuários | Implemented |
| [002-social-auth](./002-social-auth/spec.md) | Login Social com Google | In Review |
| [003-workspaces](./003-workspaces/spec.md) | Workspaces Compartilhados | Implemented |
| [004-lancamentos](./004-lancamentos/spec.md) | Lançamentos (Contas, Títulos e Transações) | Approved |
