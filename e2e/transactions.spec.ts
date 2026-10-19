import { expect, test } from '@playwright/test';

import {
  addTransaction,
  createUser,
  createWorkspace,
  gridRows,
  login,
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
  expect(row).toContain('Ana 100%');
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
