---
description: Roda a checagem completa antes de pedir revisão de PR
---

Rode, nesta ordem, e reporte o resultado real de cada um (não resuma falha como sucesso):

1. `git status` e `git branch --show-current` (não pode ser `main`).
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:unit`
5. `npm run test:db`
6. `npm run test:e2e`, só se houve mudança em telas ou fluxos. Precisa de Docker + `npm run supabase:start`; se não estiver rodando, diga que não foi executado.

Depois verifique no diff (`git diff main...HEAD`):
- Toda mudança de comportamento tem teste, e nenhum teste foi pulado/removido.
- Nenhuma migration antiga editada; migration nova tem teste SQL.
- Sem segredos, `.env*`, `private/` ou dados reais.
- Spec atualizada e mensagens de commit no formato `tipo(escopo): resumo [spec]`.

Termine com: **Pronto / Não pronto**, a lista do que falta e as ações que só o usuário pode fazer (migration no dev/prod, E2E, push, PR).
