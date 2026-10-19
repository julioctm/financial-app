// One-off check for supabase/migrations/20261020000000_owner_rows.sql: builds data in the
// OLD model (transactions with shares), applies the migration, and verifies the conversion.
// Run: node scripts/verify-owner-rows-migration.mjs
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const NEW = '20261020000000_owner_rows.sql';

const db = new PGlite();
await db.exec(read('tests', '_stubs.sql'));
for (const f of fs.readdirSync(path.join(root, 'migrations')).sort()) {
  if (f < NEW) await db.exec(read('migrations', f));
}

const ANA = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRUNO = 'bbbbbbbb-0000-0000-0000-000000000002';
await db.exec(`
  insert into auth.users (id, email) values ('${ANA}', 'ana@t.local'), ('${BRUNO}', 'bruno@t.local');
  select set_config('request.jwt.claims', json_build_object('sub', '${ANA}')::text, false);
`);
const ws = (await db.query(`select public.create_workspace('Casa') as id`)).rows[0].id;
const tok = (await db.query(`select public.create_invite('${ws}') as t`)).rows[0].t;
await db.exec(`select set_config('request.jwt.claims', json_build_object('sub', '${BRUNO}')::text, false);`);
await db.query(`select public.accept_invite('${tok}')`);
await db.exec(`select set_config('request.jwt.claims', json_build_object('sub', '${ANA}')::text, false);`);
const person = async (u) =>
  (await db.query(`select person_id from public.workspace_members where user_id = '${u}'`)).rows[0].person_id;
const ana = await person(ANA);
const bruno = await person(BRUNO);
await db.exec(`insert into public.ledger_accounts (workspace_id, name) values ('${ws}', 'Mercado')`);
const led = (await db.query(`select id from public.ledger_accounts`)).rows[0].id;
const split = JSON.stringify([
  { person_id: ana, percent: 65 },
  { person_id: bruno, percent: 35 },
]);
const only = JSON.stringify([{ person_id: ana, percent: 100 }]);

// OLD-model data: shared with pay-to=ana, shared 2x with pay-to=bruno, single owner.
const create = (desc, amount, payTo, shares, n = 1) =>
  db.query(
    `select public.create_transaction('${ws}', '2026-10-03', '2026-10-01', null, '${led}', null, $1, $2, $3, $4::jsonb, $5, true)`,
    [desc, amount, payTo, shares, n],
  );
await create('shared', -10001, ana, split);
await create('plan', -10000, bruno, split, 2);
await create('solo', -500, null, only);
const before = (await db.query(`select count(*)::int as n from public.transactions`)).rows[0].n;
assert.equal(before, 4, 'old model: shared, plan x2, solo = 4 rows');

await db.exec(read('migrations', NEW));

const rows = (await db.query(`
  select description, owner_person_id as owner, amount_cents::int as amount, pay_to_person_id as pay_to,
         split_group_id as grp, installment_number as inst
  from public.transactions order by description, owner_person_id`)).rows;
const by = (d) => rows.filter((r) => r.description === d);

// shared (-10001, 65/35): two rows, cents preserved, payer row has no pay-to
assert.equal(by('shared').length, 2);
assert.equal(by('shared').reduce((s, r) => s + r.amount, 0), -10001);
assert.equal(by('shared').find((r) => r.owner === ana).amount, -6501);
assert.equal(by('shared').find((r) => r.owner === ana).pay_to, null);
assert.equal(by('shared').find((r) => r.owner === bruno).pay_to, ana);
assert.equal(new Set(by('shared').map((r) => r.grp)).size, 1);
assert.ok(by('shared')[0].grp);

// plan (2 installments, shared): 4 rows, one split group per installment
assert.equal(rows.filter((r) => r.description.startsWith('plan')).length, 4);
const plan = rows.filter((r) => r.description.startsWith('plan'));
assert.equal(new Set(plan.map((r) => r.grp)).size, 2);
assert.equal(plan.find((r) => r.owner === bruno && r.inst === 1).pay_to, null);
assert.equal(plan.find((r) => r.owner === ana && r.inst === 1).pay_to, bruno);

// solo: untouched, no split group
assert.equal(by('solo').length, 1);
assert.equal(by('solo')[0].grp, null);

// derived percentage and cleanup
const pct = (await db.query(`select split_percent::float as p from public.transactions_view where description='shared' and owner_person_id='${ana}'`)).rows[0].p;
assert.ok(Math.abs(pct - 65) < 0.02, `split_percent ~65, got ${pct}`);
const gone = (await db.query(`select to_regclass('public.transaction_shares') as t`)).rows[0].t;
assert.equal(gone, null, 'transaction_shares dropped');
const total = (await db.query(`select sum(amount_cents)::int as s from public.transactions`)).rows[0].s;
assert.equal(total, -10001 - 10000 - 500, 'no cent created or lost by the conversion');

console.log('owner-rows migration conversion: OK');
