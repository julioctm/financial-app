import { expect, type Page } from '@playwright/test';

import { localSupabaseEnv } from './local-env';

const env = localSupabaseEnv();
export const PASSWORD = 'senha-e2e-123';

let counter = 0;

// Creates a confirmed user with a name, so tests skip e-mail confirmation and the profile step.
export async function createUser(firstName: string, lastName = 'Teste') {
  const email = `e2e-${Date.now()}-${counter++}@example.test`;
  // GoTrue admin API, called directly (the JS client needs WebSocket support we don't use here).
  const res = await fetch(`${env.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    }),
  });
  if (!res.ok)
    throw new Error(`createUser failed: ${res.status} ${await res.text()}`);
  return { email, firstName };
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('E-mail').fill(email);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function createWorkspace(page: Page, name: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByPlaceholder('Nome (ex.: Casa)').fill(name);
  await page.getByRole('button', { name: 'Criar workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// Visible text of every grid row: inputs by value, selects by selected option.
export async function gridRows(page: Page): Promise<string[][]> {
  return page.locator('.dsg-row').evaluateAll((rows) =>
    rows.slice(1).map((row) =>
      Array.from(row.querySelectorAll('.dsg-cell')).map((cell) => {
        const select = cell.querySelector('select');
        if (select)
          return select.selectedOptions[0]?.text.replace('—', '').trim() ?? '';
        const input = cell.querySelector('input');
        return input ? input.value : (cell.textContent ?? '').trim();
      }),
    ),
  );
}

// Creates a transaction through the dialog, creating the account and title inline
// the first time (when they do not exist yet).
export async function addTransaction(
  page: Page,
  opts: { description: string; amount: string; installments?: number },
) {
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  const dialog = page.getByRole('dialog');

  const account = dialog.getByLabel('Conta / cartão');
  if (!(await account.locator('option', { hasText: 'Cartão E2E' }).count())) {
    await account.selectOption({ label: '+ Nova conta ou cartão…' });
    const group = dialog.getByRole('group', { name: 'Nova conta ou cartão' });
    await group.getByLabel('Nome').fill('Cartão E2E');
    await group.getByLabel('Dono (titular)').selectOption({ index: 1 });
    await group.getByRole('button', { name: 'Criar e usar' }).click();
  }
  await account.selectOption({ label: 'Cartão E2E (cartão de crédito)' });

  const title = dialog.getByLabel(/^Título/);
  if (!(await title.locator('option', { hasText: 'Mercado' }).count())) {
    await title.selectOption({ label: '+ Novo título…' });
    const group = dialog.getByRole('group', { name: 'Novo título' });
    await group.getByLabel('Nome').fill('Mercado');
    await group.getByRole('button', { name: 'Criar e usar' }).click();
  }
  await title.selectOption({ label: 'Mercado' });

  await dialog.getByLabel('Descrição').fill(opts.description);
  await dialog.getByLabel(/^Valor/).fill(opts.amount);
  if (opts.installments)
    await dialog.getByLabel('Parcelas').fill(String(opts.installments));
  await dialog.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(dialog).toBeHidden();
}

export async function waitForGrid(page: Page) {
  await expect(page.locator('.dsg-container')).toBeVisible();
}
