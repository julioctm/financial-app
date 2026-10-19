# financial-app: guia para quem trabalha neste repositório

Aplicativo de finanças pessoais e do casal. Next.js 14 (App Router), React 18, TypeScript, Tailwind e Supabase (Auth + Postgres com RLS), publicado na Vercel. A interface e os textos para o usuário são em **português do Brasil**.

## Regra inegociável: toda implementação vem com testes

Nenhuma mudança de comportamento é considerada pronta sem testes automatizados. Isso vale para features, correções e refatorações, e vale para quem for humano ou agente.

| O que você mudou | Teste obrigatório | Onde |
|---|---|---|
| Função pura (parsing, formatação, regras de data/valor, mapeamento de erros) | **Unitário** (Vitest) | `src/**/*.test.ts` ao lado do código |
| Migration, RLS, função SQL, trigger | **Teste SQL** | `supabase/tests/NNN_nome.sql` (PGlite) |
| Fluxo de tela ou integração com o banco | **E2E** (Playwright + Supabase local) | `e2e/*.spec.ts` |
| Correção de bug | Um teste que **falha antes** da correção e passa depois | na camada onde o bug aparece |

Regras práticas:
- Escreva o teste junto com o código, no mesmo PR. "Testo depois" não vale.
- Para bug: reproduza com um teste primeiro; só então corrija.
- Teste de verdade, não só "renderiza": cubra caso feliz, bordas (zero, vazio, virada de mês/ano, centavos) e permissões (quem **não** pode).
- Ao criar um teste importante, quebre o código de propósito uma vez para ver o teste falhar.
- Dados de teste nunca usam informação real e nunca rodam contra dev/prod (o E2E recusa qualquer endereço que não seja `localhost`).
- Se algo realmente não puder ser testado automaticamente, diga isso no PR e explique o porquê.

Comandos: `npm run test:unit`, `npm run test:db`, `npm run test:e2e` (precisa de Docker + `npm run supabase:start`), e `npm run lint` e `npm run typecheck`. Detalhes em [`docs/TESTING.md`](docs/TESTING.md). O CI roda tudo a cada PR.

## Fluxo de trabalho

1. **Spec primeiro** (`specs/NNN-nome/spec.md`, veja `specs/README.md`): contexto, requisitos, critérios de aceite. Atualize a spec se a implementação divergir.
2. **Branch curta e PR pequeno** a partir da `main`. Nunca commitar direto na `main`.
3. **Migrations**: arquivo novo em `supabase/migrations/` (nunca editar uma já aplicada), com teste SQL. Aplicar no dev, validar, e **no prod antes do merge** do PR que depende dela.
4. Mensagens de commit no formato `tipo(escopo): resumo [spec]`.

## Convenções

- Dinheiro sempre em **centavos inteiros** (negativo = saída). Formatação e parsing só via `src/lib/money.ts`.
- Todo dado pertence a um **workspace**; o acesso é por membro (RLS via `is_workspace_member`). Toda tabela nova precisa de `workspace_id`, RLS e testes de quem não deve enxergar.
- Segredos só em variáveis de ambiente. Nunca a chave `service_role`/`sb_secret_` no código do app ou no navegador.
- Dados financeiros reais ficam fora do Git (pasta `private/` é ignorada).
- Acessibilidade: foco visível, rótulos nos campos, contraste AA. Textos curtos, em frases com inicial maiúscula, sem pontuação final em rótulos.
- Antes de pedir revisão: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db` (e `npm run test:e2e` se tocou em telas).
