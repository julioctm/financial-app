# financial-app

Aplicativo de finanças pessoais construído com Next.js 14, React, Tailwind CSS e Supabase (auth + Postgres).

## Começando

Pré-requisito: Node 20 LTS.

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
npm run dev
```

O app sobe em http://localhost:3000. A configuração do Supabase e da Vercel está em [`docs/INFRA.md`](docs/INFRA.md).

## Scripts

| Comando             | O que faz                                          |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento                        |
| `npm run build`     | Build de produção                                  |
| `npm start`         | Serve o build de produção                          |
| `npm run lint`      | ESLint (`next lint`)                               |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`)                 |
| `npm run test:db`   | Testes SQL das migrations (`supabase/tests`, PGlite) |

## Estrutura

- `src/` — código da aplicação
- `supabase/migrations/` — schema do banco; `supabase/tests/` — testes SQL
- `specs/` — especificações das features (Spec-Driven Development, veja [`specs/README.md`](specs/README.md))
- `docs/` — documentação de infraestrutura
