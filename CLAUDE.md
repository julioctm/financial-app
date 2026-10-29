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

## Time de agentes de IA

Os agentes ficam em `.claude/agents/`, os comandos em `.claude/commands/` e as permissões compartilhadas em `.claude/settings.json`. Todos seguem este arquivo; as regras acima valem para eles sem exceção.

| Agente | Função | Escreve em | Não faz |
|---|---|---|---|
| `spec-writer` | Spec em `specs/NNN-nome/` | `specs/` | Código; marcar `Approved` |
| `db-engineer` | Migrations, RLS, testes SQL | `supabase/` | Aplicar em dev/prod |
| `frontend-dev` | Telas e componentes | `src/` | Migrations |
| `test-engineer` | Testes unitários, SQL e E2E | testes | Enfraquecer teste |
| `reviewer` | Revisão do diff | nada (só leitura) | Editar arquivos |

Comandos: `/nova-feature <ideia ou spec>` conduz o fluxo completo e `/pronto-para-pr` roda a checagem antes da revisão.

### Guardrails para agentes (e para quem os orquestra)

- **Só com spec aprovada**: nenhum agente implementa sem spec `Approved`. A aprovação é do usuário.
- **Banco**: agentes só geram migrations e rodam `npm run test:db` localmente. Aplicar no dev/prod é sempre do usuário (no prod, antes do merge).
- **Git**: sem commit, push, PR ou merge sem o usuário pedir. Nunca na `main`. Sem `--no-verify`, `reset --hard` ou `clean`.
- **Segredos e dados**: agentes não leem nem editam `.env*` e `private/`. Nunca `service_role`/`sb_secret_` no código. Fixtures só com dados fictícios.
- **Testes**: proibido pular, apagar ou enfraquecer teste para ficar verde. Falha real é reportada, não escondida.
- **Escopo**: cada agente mexe só no que é seu (tabela acima). Trabalho paralelo só em arquivos que não se sobrepõem, de preferência em worktrees separados.
- **Contexto**: o subagente não vê a conversa. Toda delegação leva spec, arquivos e critério de pronto.
- **Verificar, não confiar**: o orquestrador confere o diff e roda os comandos antes de declarar algo pronto. Relatório de subagente não é prova.
- **Sem rede aberta**: sem `curl`/`wget` nem comandos de deploy (`vercel`). Dependência nova precisa de justificativa.
- **Dúvida vira pergunta**: requisito ambíguo vai para "Perguntas Abertas" da spec ou para o usuário, não vira suposição.
- **Rastreabilidade**: commits `tipo(escopo): resumo [spec]` e a spec atualizada se a implementação divergir.
