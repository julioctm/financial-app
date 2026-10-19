import { expect, test } from '@playwright/test';

import {
  addTransaction,
  createUser,
  createWorkspace,
  gridRows,
  login,
  waitForGrid,
} from './helpers';

test('quem não é membro não vê nada; quem aceita o convite vê os mesmos lançamentos', async ({
  page,
  browser,
}) => {
  // Ana creates the workspace with one transaction.
  const ana = await createUser('Ana');
  await login(page, ana.email);
  await createWorkspace(page, 'Casa');
  await page.goto('/lancamentos');
  await waitForGrid(page);
  await addTransaction(page, {
    description: 'segredo da casa',
    amount: '99,90',
  });
  await expect.poll(async () => (await gridRows(page)).length).toBe(1);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  const link = await page.getByLabel('Link do convite').inputValue();
  expect(link).toContain('/convite/');

  // Carla has an account but no invite: she must not see anything.
  const carla = await createUser('Carla');
  const carlaCtx = await browser.newContext({ locale: 'pt-BR' });
  const carlaPage = await carlaCtx.newPage();
  await login(carlaPage, carla.email);
  await expect(carlaPage).toHaveURL(/\/onboarding/);
  await carlaPage.goto('/lancamentos');
  await expect(carlaPage).toHaveURL(/\/onboarding/);

  // Bruno joins through the invite and sees the same data.
  const bruno = await createUser('Bruno');
  const brunoCtx = await browser.newContext({ locale: 'pt-BR' });
  const brunoPage = await brunoCtx.newPage();
  await login(brunoPage, bruno.email);
  await brunoPage.goto(link);
  await brunoPage.getByRole('button', { name: 'Entrar no workspace' }).click();
  await expect(brunoPage).toHaveURL(/\/dashboard/);
  await brunoPage.goto('/lancamentos');
  await waitForGrid(brunoPage);
  await expect
    .poll(async () => (await gridRows(brunoPage))[0])
    .toContain('segredo da casa');

  // The invite is single-use: a third person cannot reuse it.
  await carlaPage.goto(link);
  await expect(
    carlaPage.getByText('Este convite já foi utilizado.'),
  ).toBeVisible();

  await carlaCtx.close();
  await brunoCtx.close();
});
