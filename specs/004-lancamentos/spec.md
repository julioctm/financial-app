# Lançamentos (Contas, Títulos e Transações)

**Status:** Draft
**Spec ID:** 004-lancamentos
**Autor:**
**Data:** 2026-10-09

## 1. Contexto e Motivação

O coração do controle atual é uma aba de **Transações** (mais de 10 mil linhas desde 2020) onde cada compra, parcela e despesa é digitada. Cada linha registra: data da compra, **mês de pagamento** (a fatura em que cai), cartão/conta, **Dono** (de quem é o gasto), **Pagar Para** (quem pagou e será reembolsado no acerto), descrição, título (conta contábil), tipo e valor.

O app precisa substituir isso mantendo o que a planilha tem de bom (velocidade, visão em tabela, edição direta) e eliminando o que dói (digitar parcelas uma a uma, rateio manual, cálculos de acerto).

Depende de [003-workspaces](../003-workspaces/spec.md).

## 2. Objetivo

Permitir cadastrar e consultar lançamentos de um workspace de duas formas: **janela de lançamento** (formulário) e **tabela editável estilo planilha**, com parcelas, rateio entre membros e acerto de contas, incluindo cadastro dos objetos de apoio (contas de pagamento, títulos, tipos e categorias) e **importação do histórico** das planilhas.

## 3. Fora de Escopo

- Orçamento planejado x real, premissas por tipo e indicadores (spec futura 005-orcamento)
- Despesas e receitas **recorrentes** automáticas
- Faturas de cartão com fechamento/vencimento e conciliação bancária (v1 só informa o mês de pagamento)
- Transferências entre contas, pagamento de fatura como lançamento
- Multi-moeda (v1: BRL)
- Anexos, recibos e importação de extratos (OFX/CSV de bancos)

## 4. Requisitos Funcionais

### Cadastros (todos criáveis, editáveis e arquiváveis pelos membros)

1. **Contas de pagamento** (cartão de crédito, conta corrente, dinheiro, outro): nome, tipo, pessoa titular opcional, dia de fechamento opcional
2. **Títulos** (contas contábeis, ex.: "Luz", "Mercado"): nome, natureza (receita, despesa, investimento), tipo e categoria opcionais
3. **Tipos** (agrupadores como "Custo fixo", "Conforto", "Metas") e **Categorias** (agrupadores como "Essencial", "Doações"): nome livre, criáveis pelo usuário. São dois eixos independentes; um título pode ter um de cada
4. Itens arquivados não aparecem em novos lançamentos, mas permanecem nos históricos

### Lançamento

5. Campos do lançamento: data da compra, **mês de pagamento**, conta de pagamento, título, descrição, valor, **Dono(s)** e **Pagar Para** (opcional)
6. O mês de pagamento é sempre informado/confirmado pelo usuário. Se a conta tem dia de fechamento, o sistema **sugere** o mês (compra após o fechamento sugere o mês seguinte); o usuário pode alterar
7. **Dono:** por padrão aplica-se o **rateio padrão do workspace** (spec 003) como ponto de partida; o usuário pode editar percentuais, escolher um único dono, ou excluir membros daquele lançamento
8. O rateio de cada lançamento é salvo como **cópia** (`transaction_shares`); mudar o padrão depois não altera lançamentos existentes
9. **Pagar Para:** pessoa que pagou e receberá no acerto. Vazio significa que cada dono arca com a própria parte
10. Valores em centavos; despesas negativas e receitas positivas. Divisão de centavos usa regra determinística: o resto vai ao dono com maior percentual, de modo que a soma das partes seja exata
11. **Parcelas:** ao lançar "N parcelas", o sistema gera N lançamentos com a mesma data de compra, mês de pagamento avançando mês a mês, descrição com sufixo "(i/N)" e vínculo a um grupo de parcelamento. O usuário informa o valor total ou o valor da parcela
12. Ao editar ou excluir uma parcela, o usuário escolhe: **só esta**, **esta e as seguintes** ou **todas**
13. Excluir exige confirmação; exclusão em lote também

### Tabela estilo planilha

14. Tela de lançamentos em **tabela** com uma linha por lançamento e colunas: data, mês de pagamento, conta, título, tipo, descrição, dono(s), pagar para, valor
15. **Edição direta na célula** (clique ou Enter), navegação por teclado (setas, Tab, Enter, Esc), com salvamento automático por célula e indicação de salvo/erro
16. Linha vazia no fim para **adicionar rapidamente**; copiar e colar de várias células/linhas (inclusive vindas do Google Sheets)
17. **Filtros e busca:** mês de pagamento, conta, título, tipo, categoria, dono, pagar para, texto livre e faixa de valor; **ordenação** por coluna; filtros salvos na URL
18. **Totais** das linhas filtradas (rodapé) e seleção múltipla com edição em lote (ex.: trocar título, mês de pagamento)
19. Escolher quais colunas exibir; selects (conta, título, pessoa) permitem **criar novo item na hora** quando não existe
20. Desempenho com 10 mil+ linhas (virtualização e paginação/consulta no servidor)

### Janela de lançamento

21. Botão "Novo lançamento" abre um modal com todos os campos, parcelamento e rateio, disponível em qualquer tela; atalho de teclado

### Acerto de contas

22. Tela de **acerto** por mês de pagamento: para cada par de pessoas, quanto um deve ao outro, calculado a partir dos lançamentos com `Pagar Para` preenchido (parte de cada dono que não é quem pagou). Somente leitura na v1, com detalhamento por lançamento

### Importação do histórico

23. Script local (fora do app, rodando contra o banco com credencial administrativa) importa o histórico da planilha `Transações` e cria contas, títulos, tipos, pessoas e lançamentos. Deve ser **idempotente** (id legado em `external_id`), ter modo **simulação** com relatório (linhas lidas, criadas, ignoradas, problemas) e rodar primeiro no projeto dev

## 5. Requisitos Não-Funcionais

- RLS: leitura e escrita somente para membros do workspace (`is_workspace_member`)
- Integridade no banco: soma de `transaction_shares` igual ao valor do lançamento; percentuais entre 0 e 100; chaves estrangeiras sempre dentro do mesmo workspace
- Criação de lançamento + partes + parcelas é **atômica** (função no banco / RPC)
- Edição concorrente: cada lançamento tem `updated_at`; salvar sobre versão mais nova avisa o usuário em vez de sobrescrever em silêncio
- Acessibilidade da tabela: navegação por teclado completa, foco visível, rótulos para leitores de tela
- Mobile: formulário utilizável; tabela com rolagem horizontal e modo de lista

## 6. Modelo de Dados

```
accounts                              -- contas de pagamento
├── id, workspace_id
├── name (text), kind (enum: credit_card, checking, cash, other)
├── holder_person_id (nullable, fk -> people.id)
├── closing_day (smallint, nullable)  -- apenas para sugerir mês de pagamento
└── archived_at (nullable)

envelopes                             -- "Tipos" (Custo fixo, Conforto...)
├── id, workspace_id, name, sort_order, archived_at

categories                            -- "Categorias" (Essencial, Torra...)
├── id, workspace_id, name, sort_order, archived_at

ledger_accounts                       -- "Títulos" (contas contábeis)
├── id, workspace_id, name
├── kind (enum: income, expense, investment)
├── envelope_id (nullable, fk), category_id (nullable, fk)
└── archived_at

installment_groups
├── id, workspace_id
├── total_installments (smallint), total_amount_cents (bigint)
└── created_at

transactions
├── id, workspace_id
├── purchase_date (date)
├── payment_month (date)                       -- sempre dia 1
├── account_id (fk, nullable), ledger_account_id (fk)
├── description (text)
├── amount_cents (bigint)                      -- negativo = despesa
├── pay_to_person_id (nullable, fk -> people.id)
├── installment_group_id (nullable), installment_number (smallint, nullable)
├── external_id (text, nullable, unique por workspace)   -- importação
├── created_by, updated_by, created_at, updated_at

transaction_shares                             -- cópia do rateio no momento do lançamento
├── transaction_id (fk), person_id (fk -> people.id)
├── percent (numeric(5,2)), amount_cents (bigint)
└── pk (transaction_id, person_id)
```

Índices: `(workspace_id, payment_month)`, `(workspace_id, ledger_account_id)`, `(workspace_id, account_id)`, `(workspace_id, purchase_date)`.

## 7. Regras de Negócio

- **Dono** = quem consome o gasto (`transaction_shares`). **Pagar Para** = quem adiantou e recebe no acerto (`pay_to_person_id`)
- Acerto: para cada lançamento com `pay_to_person_id`, cada dono diferente do pagador deve a ele sua parte (`amount_cents`); lançamentos sem `pay_to_person_id` não geram dívida
- Rateio inicial = `workspace_split_defaults` vigente no momento da criação; depois disso é independente
- Parcelas: `payment_month` = mês do primeiro pagamento + (i - 1); soma das parcelas = valor total (diferença de centavos na primeira parcela)
- Editar valor de um lançamento recalcula `amount_cents` das partes mantendo os percentuais
- Título arquivado ou conta arquivada não podem ser escolhidos em novos lançamentos
- Tipo e categoria exibidos num lançamento vêm do título (não são copiados); trocar o tipo do título altera a visão histórica (aceito na v1)

## 8. Fluxos de UI/UX

- **Lançamentos (tabela)** como tela principal do módulo, com barra de filtros, totais e botão "Novo lançamento"
- **Modal de lançamento:** campos na ordem de preenchimento rápido; seção "Rateio" (padrão aplicado, editável); seção "Parcelas" recolhida
- **Cadastros** em Configurações: contas, títulos, tipos e categorias (lista, criar, renomear, arquivar)
- **Acerto:** seletor de mês, resumo "X deve Y" e lista de lançamentos que compõem
- Estados: carregando, vazio ("Importe seu histórico ou crie o primeiro lançamento"), erro de salvamento por célula com opção de tentar novamente

## 9. Casos de Borda

- Lançamento sem conta (dinheiro, ajustes) → conta opcional
- Compra em dezembro com mês de pagamento em janeiro do ano seguinte
- Rateio que não fecha 100% ou com membro inativo → bloqueado com mensagem
- Parcelas em que a divisão não é exata (ex.: 100,00 em 3x)
- Excluir título/conta com lançamentos → só arquivar
- Colar dados com datas e números em formato brasileiro (dd/mm/aaaa, vírgula decimal)
- Duas pessoas editando a mesma célula ao mesmo tempo
- Importação: linhas sem dono, sem conta, sem mês ou com valor zero; nomes de pessoas externas; linhas de fórmulas vazias no fim da planilha
- Importação rodada duas vezes → não duplica

## 10. Critérios de Aceite

- [ ] Dado rateio padrão 65/35, quando abro "Novo lançamento", então o rateio já vem 65/35 e posso editá-lo
- [ ] Dado lançamento de R$ 100,00 no rateio 65/35, quando salvo, então as partes são R$ 65,00 e R$ 35,00 e a soma bate
- [ ] Dado que alterei o rateio padrão depois, então lançamentos antigos continuam com o rateio original
- [ ] Dado lançamento com `Pagar Para` = Ana e donos Ana 35% e Bruno 65%, então o acerto mostra Bruno devendo 65% do valor a Ana
- [ ] Dado "10 parcelas" a partir de março, então existem 10 lançamentos com meses de pagamento março a dezembro e soma igual ao total
- [ ] Dado a tabela, quando edito o valor de uma célula e saio dela, então o valor é salvo e o rodapé de totais é atualizado
- [ ] Dado 10 mil lançamentos, quando rolo e filtro a tabela, então a interface permanece fluida
- [ ] Dado conta com fechamento dia 10, quando lanço compra no dia 15, então o mês de pagamento sugerido é o seguinte e posso alterá-lo
- [ ] Dado um novo cartão criado pelo seletor da tabela, então ele já fica disponível no lançamento
- [ ] Dado a importação rodada duas vezes, então a contagem de lançamentos não muda na segunda vez
- [ ] Dado usuário fora do workspace, então não vê nenhum dos dados acima (RLS)

## 11. Perguntas Abertas

- **Tipo x Categoria:** na planilha há "Tipo" (Custo fixo, Conforto, Metas, Prazer, Liberdade Financeira, Conhecimento), com % da renda no orçamento doméstico, e "Categoria" (Essencial, Torra, Doações, Investimento), usada nos indicadores do orçamento individual. A spec os trata como dois eixos independentes sobre o título. Confirmar se faz sentido ou se são um só
- Biblioteca da tabela editável (candidatos: TanStack Table + virtualização, AG Grid Community) a decidir no plano de implementação
- Importação: linhas sem Dono (~15% do histórico) devem virar dono = quem? Linhas com tipo vazio herdam o tipo do título?
- Receitas entram na mesma tabela (valor positivo) ou têm tela própria?
- Quando o mês de pagamento é informado, o sistema deve impedir meses muito distantes da data da compra?
