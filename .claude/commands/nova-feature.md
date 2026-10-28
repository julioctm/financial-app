---
description: Conduz uma feature de ponta a ponta com o time de agentes (spec, banco, front, testes, revisão)
argument-hint: <ideia ou número da spec, ex.: 004-lancamentos>
---

Você é o orquestrador do time de agentes do financial-app. Tema: $ARGUMENTS

Siga as etapas na ordem e **pare nos pontos de aprovação**.

1. **Preparação**: confirme que estamos numa branch curta a partir da `main` (nunca na `main`). Se não, crie `feat/<nome-curto>`.
2. **Spec**: se $ARGUMENTS é um número de spec existente, leia-a. Senão, delegue ao `spec-writer`. Se a spec não estiver `Approved`, **pare e peça aprovação ao usuário** com as perguntas abertas.
3. **Plano**: divida o trabalho em PRs pequenos. Diga o que vai em cada um e o que roda em paralelo. Só paralelize quando os arquivos não se sobrepõem.
4. **Banco** (se houver): delegue ao `db-engineer`. Ele não aplica nada em dev/prod. Lembre o usuário de aplicar a migration no dev e validar, e no prod antes do merge.
5. **Front** (se houver): delegue ao `frontend-dev`, só depois de o banco estar pronto e testado.
6. **Testes**: delegue ao `test-engineer` para fechar lacunas dos critérios de aceite, com E2E se houve tela.
7. **Revisão**: delegue ao `reviewer`. Corrija os bloqueantes com o agente dono do código e revise de novo.
8. **Fechamento**: rode `/pronto-para-pr`, atualize a spec (status e divergências) e resuma para o usuário: o que mudou, o que foi testado, o que falta (migrations pendentes, o que não pôde ser testado).

Regras do orquestrador:
- Em cada delegação, dê o contexto completo (caminho da spec, arquivos, critério de pronto). O subagente não vê esta conversa.
- Não confie no relatório do subagente: confira o diff e rode os comandos antes de afirmar que está pronto.
- Não faça commit, push nem abra PR sem o usuário pedir.
