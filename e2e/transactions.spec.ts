import { expect, test } from '@playwright/test';

import {
  addExternalPerson,
  addTransaction,
  COL,
  draftCell,
  createUser,
  createWorkspace,
  gridRows,
  login,
  pasteInto,
  splitRows,
  waitForGrid,
} from './helpers';

test.beforeEach(async ({ page }) => {
  const user = await createUser('Ana');
  await login(page, user.email);
  await createWorkspace(page, 'Casa');
  await page.goto('/lancamentos');
  await waitForGrid(page);
});

test('cria cadastros e um lançamento pelo modal, com dono e valor corretos', async ({
  page,
}) => {
  await addTransaction(page, { description: 'compra e2e', amount: '412,80' });

  await expect.poll(async () => (await gridRows(page)).length).toBe(1);
  const [row] = await gridRows(page);
  expect(row).toContain('compra e2e');
  expect(row).toContain('Mercado');
  expect(row).toContain('Cartão E2E');
  expect(row).toContain('-412,80');
  expect(row).toContain('Ana'); // Dono
  expect(row).not.toContain('Ana 100%');
  await expect(page.getByTestId('summary')).toContainText('412,80');
});

test('parcelamento gera uma parcela por mês, sem perder centavos', async ({
  page,
}) => {
  await addTransaction(page, {
    description: 'sofá',
    amount: '100,00',
    installments: 3,
  });

  await expect.poll(async () => (await gridRows(page)).length).toBe(1);
  expect((await gridRows(page))[0]).toEqual(
    expect.arrayContaining(['sofá (1/3)', '-33,34']),
  );

  await page.getByRole('link', { name: 'Próximo mês' }).click();
  await expect
    .poll(async () => (await gridRows(page))[0])
    .toEqual(expect.arrayContaining(['sofá (2/3)', '-33,33']));
  await page.getByRole('link', { name: 'Próximo mês' }).click();
  await expect
    .poll(async () => (await gridRows(page))[0])
    .toEqual(expect.arrayContaining(['sofá (3/3)', '-33,33']));
});

test('editar a descrição na tabela persiste depois de recarregar', async ({
  page,
}) => {
  await addTransaction(page, { description: 'antes', amount: '10,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  const cell = page
    .locator('.dsg-row')
    .nth(1)
    .locator('.dsg-cell')
    .nth(COL.description);
  await cell.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('depois');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Salvando…')).toBeHidden();

  await page.reload();
  await waitForGrid(page);
  await expect.poll(async () => (await gridRows(page))[0]).toContain('depois');
});

test('valor inválido é desfeito com aviso', async ({ page }) => {
  await addTransaction(page, { description: 'valor', amount: '25,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  const valueCell = page
    .locator('.dsg-row')
    .nth(1)
    .locator('.dsg-cell')
    .nth(COL.amount);
  await valueCell.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');

  await expect(page.getByText(/Valor inválido em "Valor"/)).toBeVisible();
  await expect.poll(async () => (await gridRows(page))[0]).toContain('-25,00');
});

test('excluir lançamento pela barra de seleção', async ({ page }) => {
  await addTransaction(page, { description: 'apagar', amount: '5,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  await page
    .locator('.dsg-row')
    .nth(1)
    .locator('.dsg-cell')
    .nth(COL.description)
    .click();
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();

  await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
});

test('excluir funciona em outro mês depois de selecionar uma linha no mês anterior', async ({
  page,
}) => {
  // 2 parcelas: uma neste mês e outra no próximo, ambas na primeira linha do seu mês.
  await addTransaction(page, {
    description: 'viagem',
    amount: '200,00',
    installments: 2,
  });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  // Seleciona a primeira linha deste mês (a grade pode recarregar por baixo; repete o clique até pegar).
  const firstRowCell = () =>
    page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(COL.description);
  await expect(async () => {
    await firstRowCell().click();
    await expect(page.getByText('1 selecionado(s)')).toBeVisible({
      timeout: 1500,
    });
  }).toPass();

  // ...vai para o mês seguinte e seleciona a primeira linha de lá (mesma posição na grade).
  await page.getByRole('link', { name: 'Próximo mês' }).click();
  await expect
    .poll(async () => (await gridRows(page))[0])
    .toContain('viagem (2/2)');
  await expect(async () => {
    await firstRowCell().click();
    await expect(page.getByText('1 selecionado(s)')).toBeVisible({
      timeout: 1500,
    });
  }).toPass();
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
});

test('editar depois de criar outro lançamento (sem recarregar) altera a linha certa', async ({
  page,
}) => {
  await addTransaction(page, { description: 'primeiro', amount: '10,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);
  await addTransaction(page, { description: 'segundo', amount: '20,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(2);

  // Edita a descrição da PRIMEIRA linha.
  const cell = page
    .locator('.dsg-row')
    .nth(1)
    .locator('.dsg-cell')
    .nth(COL.description);
  await cell.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('primeiro editado');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Salvando…')).toBeHidden();

  await page.reload();
  await waitForGrid(page);
  await expect
    .poll(async () => (await gridRows(page)).map((r) => r[COL.description]))
    .toEqual(['primeiro editado', 'segundo']);
});

test('compra dividida gera uma linha por dono, com Divisão e Pagar para', async ({
  page,
}) => {
  await addExternalPerson(page, 'Vó');
  await page.goto('/lancamentos');
  await waitForGrid(page);
  await addTransaction(page, {
    description: 'racha',
    amount: '100,00',
    split: { Ana: '65', Vó: '35' },
    payTo: 'Ana',
  });
  await expect.poll(async () => (await gridRows(page)).length).toBe(2);

  const rows = await splitRows(page);
  const ana = rows.find((r) => r.owner === 'Ana');
  const vo = rows.find((r) => r.owner === 'Vó');
  // Ana advanced the money: her own row pays to nobody; Vó's row pays to Ana.
  expect(ana).toMatchObject({ amount: '-65,00', split: '65%', payTo: '' });
  expect(vo).toMatchObject({ amount: '-35,00', split: '35%', payTo: 'Ana' });
  const summary = page.getByTestId('summary');
  await expect(summary.getByRole('row', { name: /^Ana/ })).toContainText(
    '65,00',
  );
  await expect(summary.getByRole('row', { name: /^Vó/ })).toContainText(
    '35,00',
  );
  await expect(summary.getByRole('row', { name: /^Total/ })).toContainText(
    '100,00',
  );
});

test('parcelas com dois donos geram uma linha por dono em cada mês', async ({
  page,
}) => {
  await addExternalPerson(page, 'Vó');
  await page.goto('/lancamentos');
  await waitForGrid(page);
  await addTransaction(page, {
    description: 'tv',
    amount: '100,00',
    installments: 2,
    split: { Ana: '50', Vó: '50' },
  });
  await expect.poll(async () => (await gridRows(page)).length).toBe(2);
  expect((await splitRows(page)).map((r) => r.amount).sort()).toEqual([
    '-25,00',
    '-25,00',
  ]);

  await page.getByRole('link', { name: 'Próximo mês' }).click();
  await expect
    .poll(async () => (await splitRows(page)).map((r) => r.description))
    .toEqual(['tv (2/2)', 'tv (2/2)']);
});

test('excluir "toda a compra" remove todos os donos de uma vez', async ({
  page,
}) => {
  await addExternalPerson(page, 'Vó');
  await page.goto('/lancamentos');
  await waitForGrid(page);
  await addTransaction(page, {
    description: 'dividido',
    amount: '80,00',
    split: { Ana: '50', Vó: '50' },
  });
  await expect.poll(async () => (await gridRows(page)).length).toBe(2);

  const firstRowCell = () =>
    page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(COL.description);
  await expect(async () => {
    await firstRowCell().click();
    await expect(page.getByText('1 selecionado(s)')).toBeVisible({
      timeout: 1500,
    });
  }).toPass();
  await page
    .getByLabel('Escopo da exclusão')
    .selectOption({ label: 'Toda a compra (todos os donos e parcelas)' });
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
});

test('sempre existe uma linha em branco no fim, mesmo sem lançamentos', async ({
  page,
}) => {
  await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
  await expect(page.locator('.dsg-draft-row')).toHaveCount(1);
});

test('colar linhas do Sheets cria um lançamento por linha (data, valor e sinal em pt-BR)', async ({
  page,
}) => {
  // Cria a conta e o título "Mercado" (e uma linha) pelo modal; depois cola mais três,
  // na ordem da planilha: Data, Mês, Ano, Cartão, Pagar Para, Dono, Descrição, Título, Tipo, Valor.
  await addTransaction(page, { description: 'base', amount: '1,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  await pasteInto(
    page,
    draftCell(page, COL.date),
    [
      '19/10/2026\tOUT\t2026\tCartão E2E\t\tAna\tcolado um\tMercado\t\tR$ 1.234,56',
      '20/10/2026\tout\t2026\t\t\tAna\tcolado dois\tmercado\t\t-50,25',
      '21/10/2026\t10\t26\t\t\tAna\tcolado três\tMercado\t\t10',
    ].join('\n'),
  );

  await expect.poll(async () => (await gridRows(page)).length).toBe(4);
  const rows = await gridRows(page);
  const byDesc = (d: string) => rows.find((r) => r.includes(d));
  expect(byDesc('colado um')?.slice(COL.date, COL.amount + 1)).toEqual([
    '19/10/2026',
    'OUT',
    '2026',
    'Cartão E2E',
    '',
    'Ana',
    'colado um',
    'Mercado',
    '',
    '-1.234,56',
  ]);
  // Despesa digitada com sinal positivo continua sendo saída; título casa sem diferenciar maiúsculas.
  expect(byDesc('colado três')).toContain('-10,00');
  expect(byDesc('colado dois')).toContain('-50,25');
  await expect(page.getByText(/linhas? incompletas?/)).toBeHidden();
});

test('título inexistente fica como rascunho, avisa e não cria nada', async ({
  page,
}) => {
  await addTransaction(page, { description: 'base', amount: '1,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  // Dono, Descrição, Título, Tipo, Valor
  await pasteInto(
    page,
    draftCell(page, COL.owner),
    'Ana\ttentativa\tMercadinho\t\t30,00',
  );

  await expect(page.getByText('1 linha incompleta')).toBeVisible();
  await expect(
    page.getByText(/Título “Mercadinho” não encontrado/).first(),
  ).toBeVisible();
  await page.waitForTimeout(800);
  expect((await gridRows(page)).length).toBe(1); // nada novo foi salvo

  // Corrigir o título na própria linha salva sozinho.
  await pasteInto(page, draftCell(page, COL.title, 'first'), 'Mercado');
  await expect.poll(async () => (await gridRows(page)).length).toBe(2);
  await expect(page.getByText(/linhas? incompletas?/)).toBeHidden();
});

test('linha incompleta mostra o que falta e pode ser descartada', async ({
  page,
}) => {
  await addTransaction(page, { description: 'base', amount: '1,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  // Descrição, Título, Tipo, Valor: sem título e sem dono
  await pasteInto(
    page,
    draftCell(page, COL.description),
    'só descrição e valor\t\t\t30,00',
  );
  await expect(page.getByText('1 linha incompleta')).toBeVisible();
  await expect(page.getByText(/falta o título, falta o dono/)).toBeVisible();

  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByText(/linhas? incompletas?/)).toBeHidden();
  expect((await gridRows(page)).length).toBe(1);
});

test('a linha em branco é realmente em branco (sem data nem mês preenchidos)', async ({
  page,
}) => {
  for (const col of [
    COL.date,
    COL.month,
    COL.year,
    COL.description,
    COL.amount,
  ]) {
    await expect(draftCell(page, col).locator('input')).toHaveValue('');
  }
});

test('as colunas seguem a ordem da planilha', async ({ page }) => {
  const headers = await page
    .locator('.dsg-row')
    .first()
    .locator('.dsg-cell')
    .allInnerTexts();
  expect(headers.map((h) => h.trim()).slice(1)).toEqual([
    'Data da transação',
    'Mês Pagamento',
    'Ano Pagamento',
    'Cartão',
    'Pagar Para',
    'Dono',
    'Descrição',
    'Título',
    'Tipo',
    'Valor',
    'Divisão',
    'Categoria',
  ]);
});

test('só com o teclado: Enter escolhe na lista e Tab aplica o valor e segue para a próxima célula', async ({
  page,
}) => {
  await addTransaction(page, { description: 'base', amount: '1,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  await draftCell(page, COL.owner).click();
  await page.keyboard.press('Enter'); // abre a lista de donos
  await page.keyboard.type('an'); // filtra: Ana
  await page.keyboard.press('Tab'); // aplica "Ana" e vai para Descrição
  await page.keyboard.type('feito no teclado'); // digitar já edita a célula ativa
  await page.keyboard.press('Tab'); // vai para Título
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); // setas movem na lista (não saem da célula)
  await page.keyboard.press('Tab'); // aplica o destacado e vai para Tipo
  await page.keyboard.press('Tab'); // Valor
  await page.keyboard.type('12,34');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await gridRows(page)).length).toBe(2);
  const row = (await gridRows(page)).find((r) =>
    r.includes('feito no teclado'),
  );
  expect(row?.[COL.owner]).toBe('Ana');
  expect(row?.[COL.title]).toBe('Mercado');
  expect(row?.[COL.amount]).toBe('-12,34');
});

test('trocar o mês de pagamento de uma linha salva a leva para outro mês', async ({
  page,
}) => {
  await addTransaction(page, { description: 'muda de mês', amount: '5,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  const monthCell = page
    .locator('.dsg-row')
    .nth(1)
    .locator('.dsg-cell')
    .nth(COL.month);
  await monthCell.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('dez');
  await page.keyboard.press('Enter');

  // Sai deste mês (a linha foi movida para dezembro).
  await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
});

test('depois de escolher na lista com Enter, as setas mudam de célula sem perder o valor', async ({
  page,
}) => {
  await addTransaction(page, { description: 'base', amount: '1,00' });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  const titleSpan = () =>
    draftCell(page, COL.title, 'first').locator('span').first();

  await draftCell(page, COL.title).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('merc');
  await page.keyboard.press('Enter'); // aplica "Mercado"
  await expect(titleSpan()).toHaveText('Mercado');

  // Andar com as setas e o Tab não desfaz nem muda o valor já aplicado.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(titleSpan()).toHaveText('Mercado');
  // E a linha continua sendo rascunho (faltam dono e valor), sem pular para o fim da tabela.
  await expect(page.getByText(/falta o dono, falta o valor/)).toBeVisible();
});
