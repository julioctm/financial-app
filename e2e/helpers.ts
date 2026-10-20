import { expect, type Locator, type Page } from '@playwright/test';

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

// Grid columns, in the spreadsheet's order (index 0 is the row-number gutter).
export const COL = {
  date: 1,
  month: 2,
  year: 3,
  card: 4,
  payTo: 5,
  owner: 6,
  description: 7,
  title: 8,
  type: 9,
  amount: 10,
  split: 11,
  category: 12,
} as const;

// Visible text of every grid row: inputs by value, selects by selected option.
export async function gridRows(page: Page): Promise<string[][]> {
  return page.locator('.dsg-row').evaluateAll((rows) =>
    rows
      .slice(1)
      .filter((row) => !row.classList.contains('dsg-draft-row'))
      .map((row) =>
        Array.from(row.querySelectorAll('.dsg-cell')).map((cell) => {
          // Dropdown cells show their label in a span (the input only holds what is being typed).
          if (cell.querySelector('input[role="combobox"]'))
            return (cell.querySelector('span')?.textContent ?? '').trim();
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
  opts: {
    description: string;
    amount: string;
    installments?: number;
    /** Custom split by person name, e.g. { Ana: '65', Vó: '35' }. */
    split?: Record<string, string>;
    /** Person who advanced the money ("Pagar para"). */
    payTo?: string;
  },
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
  if (opts.payTo)
    await dialog.getByLabel(/^Pagar para/).selectOption({ label: opts.payTo });
  if (opts.split) {
    await dialog
      .getByLabel('Dono do lançamento')
      .selectOption({ label: 'Personalizado…' });
    for (const [name, percent] of Object.entries(opts.split)) {
      await dialog.getByLabel(`Percentual de ${name}`).fill(percent);
    }
  }
  await dialog.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(dialog).toBeHidden();
}

export async function waitForGrid(page: Page) {
  await expect(page.locator('.dsg-container')).toBeVisible();
}

// People without login are added in Settings and then show up as owners / "pay to" options.
export async function addExternalPerson(page: Page, name: string) {
  await page.goto('/settings');
  await page.getByLabel('Nome da pessoa sem login').fill(name);
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: name }),
  ).toBeVisible();
}

// Reads grid rows as { owner, payTo, split, amount, description } for the split-related columns.
export async function splitRows(page: Page) {
  return (await gridRows(page)).map((r) => ({
    description: r[COL.description],
    amount: r[COL.amount],
    owner: r[COL.owner],
    payTo: r[COL.payTo],
    split: r[COL.split],
  }));
}

// Selects `cell` and pastes `text` the way a spreadsheet copy arrives (tab-separated columns,
// one line per row), by dispatching the paste event the grid listens to.
export async function pasteInto(page: Page, cell: Locator, text: string) {
  await cell.click();
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    document.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

// Cell of a draft row; `which` picks the first (the one being fixed) or the last (the blank
// row). Use the COL indexes.
export const draftCell = (
  page: Page,
  column: number,
  which: 'first' | 'last' = 'last',
) => {
  const rows = page.locator('.dsg-draft-row');
  return (which === 'first' ? rows.first() : rows.last())
    .locator('.dsg-cell')
    .nth(column);
};
