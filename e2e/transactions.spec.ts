import { expect, test } from '@playwright/test';

import {
  addExternalPerson,
  addTransaction,
  createUser,
  createWorkspace,
  gridRows,
  login,
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
  await expect(page.locator('dl')).toContainText('412,80');
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

  const cell = page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(3);
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

  const valueCell = page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(5);
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

  await page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(3).click();
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
    page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(3);
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
  const cell = page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(3);
  await cell.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('primeiro editado');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Salvando…')).toBeHidden();

  await page.reload();
  await waitForGrid(page);
  await expect
    .poll(async () => (await gridRows(page)).map((r) => r[3]))
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
  await expect(page.locator('dl')).toContainText('100,00');
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
    page.locator('.dsg-row').nth(1).locator('.dsg-cell').nth(3);
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
