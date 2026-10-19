import { expect, test } from '@playwright/test';

import { createUser, createWorkspace, login } from './helpers';

test('rotas protegidas redirecionam para o login', async ({ page }) => {
  await page.goto('/lancamentos');
  await expect(page).toHaveURL(/\/login\?next=%2Flancamentos/);
});

test('login, criar workspace e ver a saudação com o primeiro nome', async ({
  page,
}) => {
  const user = await createUser('Ana');
  await login(page, user.email);
  await createWorkspace(page, 'Casa');
  await expect(page.getByRole('heading', { name: 'Casa' })).toBeVisible();
  await expect(page.getByText('Olá, Ana.')).toBeVisible();
});

test('senha errada mostra erro e não entra', async ({ page }) => {
  const user = await createUser('Ana');
  await page.goto('/login');
  await page.getByPlaceholder('E-mail').fill(user.email);
  await page.getByPlaceholder('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
