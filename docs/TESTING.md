# Testes

| Camada | Comando | O que cobre | Precisa de |
|---|---|---|---|
| Banco (SQL) | `npm run test:db` | RLS, rateio, parcelas, acerto, perfil | só Node (PGlite, em memória) |
| Ponta a ponta | `npm run test:e2e` | Fluxos no navegador: login, workspace, convite, lançamentos | Docker + Supabase local |
| Tipos e lint | `npm run typecheck` / `npm run lint` | Erros de tipo e estilo | só Node |

## Supabase local (para os testes E2E)

Um Supabase completo e **descartável** roda no Docker da sua máquina. Nada toca o dev nem o prod.

```bash
npm run supabase:start   # sobe banco, auth e API locais (a 1ª vez baixa algumas imagens)
npm run test:e2e         # roda o Playwright contra ele
npm run supabase:stop    # desliga e libera memória
```

- O `playwright.config.ts` lê a URL e as chaves do Supabase local e **recusa rodar** contra qualquer endereço que não seja `localhost`.
- Cada teste cria seus próprios usuários (já confirmados, sem e-mail), então não há estado compartilhado nem necessidade de limpar.
- O servidor Next dos testes usa a porta 3100 e a pasta `.next-e2e`, sem interferir no `npm run dev`.
- E-mails enviados pelo Supabase local caem no Mailpit: http://127.0.0.1:54324
- Para recomeçar do zero: `npx supabase db reset` (reaplica todas as migrations).
- No macOS o Docker Desktop precisa estar aberto.

## Escrevendo testes E2E

Os helpers ficam em `e2e/helpers.ts` (`createUser`, `login`, `createWorkspace`, `addTransaction`, `gridRows`). A tabela é uma planilha (`react-datasheet-grid`): use `gridRows(page)` para ler as linhas e `expect.poll` para esperar atualizações.
