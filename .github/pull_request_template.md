## Resumo
<!-- O que muda e por quê. Referencie a spec, ex.: [004-lancamentos] -->

## Testes (obrigatório)
- [ ] **Unitários** para funções puras novas ou alteradas (`npm run test:unit`)
- [ ] **Teste SQL** para migration, RLS ou função de banco (`npm run test:db`)
- [ ] **E2E** para fluxos de tela afetados (`npm run test:e2e`)
- [ ] Se for correção de bug: há um teste que falhava antes da correção
- [ ] Se algo não foi testado automaticamente, expliquei o porquê aqui:

## Verificação
- [ ] `npm run lint` e `npm run typecheck` passam
- [ ] Spec atualizada (ou não há mudança de comportamento especificado)

## Banco (se houver migration)
- [ ] Aplicada no **dev** e validada
- [ ] Lembrete: aplicar no **prod antes do merge**
