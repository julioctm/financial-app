-- Spec 004-lancamentos: transactions (one row per owner), installments, settlement and RLS.
-- Rolled back at the end. Success = final row says "ALL TESTS PASSED".

begin;

create function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  set local role authenticated;
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end $$;

create function pg_temp.throws(q text, expected text) returns void language plpgsql as $$
declare
  failed boolean := false;
begin
  begin
    execute q;
  exception when others then
    failed := true;
    if position(expected in sqlerrm) = 0 then
      raise exception 'ASSERTION FAILED: expected "%" but got "%" for: %', expected, sqlerrm, q;
    end if;
  end;
  if not failed then
    raise exception 'ASSERTION FAILED: expected error "%" but succeeded: %', expected, q;
  end if;
end $$;

-- Shorthand to read a saved id
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;

select pg_temp.as_admin();
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'outsider@test.local');

-- Workspace with two members (Ana owner, Bruno member) and an external person
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.ws', public.create_workspace('Casa')::text, true);
select set_config('t.tok', public.create_invite(pg_temp.id('ws')), true);
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select public.accept_invite(current_setting('t.tok'));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.ana', (select person_id::text from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), true);
select set_config('t.bruno', (select person_id::text from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), true);
insert into public.people (workspace_id, display_name) values (pg_temp.id('ws'), 'Vó');
select set_config('t.vo', (select id::text from public.people where user_id is null), true);

-- Catalogs created by a plain member
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.accounts (workspace_id, name, kind, holder_person_id, closing_day)
  values (pg_temp.id('ws'), 'Cartão Bruno', 'credit_card', pg_temp.id('bruno'), 10);
insert into public.envelopes (workspace_id, name) values (pg_temp.id('ws'), 'Conforto');
insert into public.categories (workspace_id, name) values (pg_temp.id('ws'), 'Essencial');
select set_config('t.acc', (select id::text from public.accounts), true);
select set_config('t.env', (select id::text from public.envelopes), true);
select set_config('t.cat', (select id::text from public.categories), true);
insert into public.ledger_accounts (workspace_id, name, kind, category_id, default_envelope_id)
  values (pg_temp.id('ws'), 'Mercado', 'expense', pg_temp.id('cat'), pg_temp.id('env'));
insert into public.ledger_accounts (workspace_id, name, kind) values (pg_temp.id('ws'), 'Salário', 'income');
select set_config('t.led', (select id::text from public.ledger_accounts where name = 'Mercado'), true);
select set_config('t.inc', (select id::text from public.ledger_accounts where name = 'Salário'), true);
select pg_temp.check((select count(*) from public.ledger_accounts) = 2, 'member creates catalog items');
select pg_temp.throws(
  format($q$insert into public.accounts (workspace_id, name) values (%L, 'cartão BRUNO')$q$, current_setting('t.ws')),
  'duplicate key');

select set_config('t.split', json_build_array(
  json_build_object('person_id', current_setting('t.ana'), 'percent', 65),
  json_build_object('person_id', current_setting('t.bruno'), 'percent', 35))::text, true);
select set_config('t.only_ana', json_build_array(
  json_build_object('person_id', current_setting('t.ana'), 'percent', 100))::text, true);

-- 1. A shared purchase becomes one row per owner, linked by a split group
select set_config('t.ids1', array_to_string(public.create_transaction(
  pg_temp.id('ws'), '2026-10-03', '2026-10-15', pg_temp.id('acc'), pg_temp.id('led'), pg_temp.id('env'),
  '  Mercado semanal ', -10000, null, current_setting('t.split')::jsonb), ','), true);
select pg_temp.check((select count(*) from public.transactions where id = any (string_to_array(current_setting('t.ids1'), ',')::uuid[])) = 2, 'two rows: one per owner');
select pg_temp.check((select amount_cents from public.transactions where owner_person_id = pg_temp.id('ana') and description = 'Mercado semanal') = -6500, 'ana row is -65.00');
select pg_temp.check((select amount_cents from public.transactions where owner_person_id = pg_temp.id('bruno') and description = 'Mercado semanal') = -3500, 'bruno row is -35.00');
select pg_temp.check((select count(distinct split_group_id) from public.transactions where description = 'Mercado semanal') = 1, 'rows share one split group');
select pg_temp.check((select bool_and(split_group_id is not null) from public.transactions where description = 'Mercado semanal'), 'split group is set');
select pg_temp.check((select payment_month from public.transactions where description = 'Mercado semanal' limit 1) = '2026-10-01', 'payment month normalized to day 1');
select pg_temp.check((select bool_and(pay_to_person_id is null) from public.transactions where description = 'Mercado semanal'), 'no pay-to when nobody advanced');

-- 2. No cent is lost on odd amounts (leftover goes to the largest share)
select set_config('t.ids2', array_to_string(public.create_transaction(
  pg_temp.id('ws'), '2026-10-04', '2026-10-01', null, pg_temp.id('led'), null, 'Odd', -10001, null,
  current_setting('t.split')::jsonb), ','), true);
select pg_temp.check((select amount_cents from public.transactions where description = 'Odd' and owner_person_id = pg_temp.id('ana')) = -6501, 'leftover cent goes to the largest share');
select pg_temp.check((select sum(amount_cents) from public.transactions where description = 'Odd') = -10001, 'rows add up to the amount');

-- 3. One owner = one row, no split group; income is positive
select pg_temp.check(array_length(public.create_transaction(pg_temp.id('ws'), '2026-10-10', '2026-10-01', null, pg_temp.id('inc'), null, 'Salário', 9801,
  null, current_setting('t.only_ana')::jsonb), 1) = 1, 'single owner creates one row');
select pg_temp.check((select split_group_id from public.transactions where description = 'Salário') is null, 'no split group for a single owner');
select pg_temp.check((select amount_cents from public.transactions where description = 'Salário') = 9801, 'income is positive');
-- 0% owners do not get a row
select pg_temp.check(array_length(public.create_transaction(pg_temp.id('ws'), '2026-10-10', '2026-10-01', null, pg_temp.id('led'), null, 'ZeroPct', -500,
  null, json_build_array(json_build_object('person_id', current_setting('t.ana'), 'percent', 100),
                         json_build_object('person_id', current_setting('t.bruno'), 'percent', 0))::jsonb), 1) = 1, 'a 0% owner gets no row');

-- 4. "Pay to": the payer's own row has no pay-to; the others pay the payer (Ana advanced for both)
select public.create_transaction(pg_temp.id('ws'), '2026-11-02', '2026-11-01', null, pg_temp.id('led'), null, 'Pago pela Ana', -10000,
  pg_temp.id('ana'), current_setting('t.split')::jsonb);
select pg_temp.check((select pay_to_person_id from public.transactions where description = 'Pago pela Ana' and owner_person_id = pg_temp.id('ana')) is null, 'payer row pays to nobody');
select pg_temp.check((select pay_to_person_id from public.transactions where description = 'Pago pela Ana' and owner_person_id = pg_temp.id('bruno')) = pg_temp.id('ana'), 'other row pays to the payer');
-- A third person advanced: every row pays to them
select public.create_transaction(pg_temp.id('ws'), '2026-11-03', '2026-11-01', null, pg_temp.id('led'), null, 'Pago pela Vó', -1000,
  pg_temp.id('vo'), current_setting('t.split')::jsonb);
select pg_temp.check((select count(*) from public.transactions where description = 'Pago pela Vó' and pay_to_person_id = pg_temp.id('vo')) = 2, 'third-party payer: all rows pay to them');

-- 5. Installments x owners: one row per owner per installment, months advance
select public.create_transaction(pg_temp.id('ws'), '2026-03-20', '2026-03-01', pg_temp.id('acc'), pg_temp.id('led'), null, 'Notebook', -10000, null,
  current_setting('t.split')::jsonb, 3, true);
select pg_temp.check((select count(*) from public.transactions where installment_group_id is not null and description like 'Notebook%') = 6, '3 installments x 2 owners = 6 rows');
select pg_temp.check((select array_agg(s order by n) from (select installment_number n, sum(amount_cents)::bigint s from public.transactions where description like 'Notebook%' group by 1) x) = array[-3334, -3333, -3333]::bigint[], 'leftover cents on the first installment');
select pg_temp.check((select array_agg(distinct payment_month order by payment_month) from public.transactions where description like 'Notebook%') = array['2026-03-01', '2026-04-01', '2026-05-01']::date[], 'months advance');
select pg_temp.check((select count(distinct split_group_id) from public.transactions where description like 'Notebook%') = 3, 'each installment has its own split group');
select pg_temp.check((select count(*) from public.transactions where description = 'Notebook (2/3)') = 2, 'description suffix on both owners rows');
select pg_temp.check((select total_amount_cents from public.installment_groups where total_installments = 3) = -10000, 'plan stores the total');
select pg_temp.check((select count(*) from unnest(public.create_transaction(pg_temp.id('ws'), '2026-01-05', '2026-01-01', null, pg_temp.id('led'), null, 'Sofá', -5000, null,
  current_setting('t.only_ana')::jsonb, 4, false))) = 4, 'per-installment amount creates 4 rows');
select pg_temp.check((select total_amount_cents from public.installment_groups where total_installments = 4) = -20000, 'total = n x installment');

-- 6. Validation errors
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', 0, null, %L::jsonb)$q$,
  current_setting('t.ws'), current_setting('t.led'), current_setting('t.split')), 'amount_invalid');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -100, null, %L::jsonb)$q$,
  current_setting('t.ws'), current_setting('t.led'),
  json_build_array(json_build_object('person_id', current_setting('t.ana'), 'percent', 60),
                   json_build_object('person_id', current_setting('t.bruno'), 'percent', 30))::text), 'shares_sum_not_100');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -100, null, %L::jsonb)$q$,
  current_setting('t.ws'), current_setting('t.led'),
  json_build_array(json_build_object('person_id', gen_random_uuid(), 'percent', 100))::text), 'shares_person_invalid');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -100, null, %L::jsonb)$q$,
  current_setting('t.ws'), gen_random_uuid(), current_setting('t.split')), 'ledger_invalid');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -100, null, %L::jsonb, 200)$q$,
  current_setting('t.ws'), current_setting('t.led'), current_setting('t.split')), 'installments_invalid');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -1, null, %L::jsonb, 3, true)$q$,
  current_setting('t.ws'), current_setting('t.led'), current_setting('t.split')), 'amount_invalid');

-- 7. The derived split percentage (Divisão)
select pg_temp.check((select split_percent from public.transactions_view where description = 'Mercado semanal' and owner_person_id = pg_temp.id('ana')) = 65, 'ana split_percent 65');
select pg_temp.check((select split_percent from public.transactions_view where description = 'Mercado semanal' and owner_person_id = pg_temp.id('bruno')) = 35, 'bruno split_percent 35');
select pg_temp.check((select split_percent from public.transactions_view where description = 'Salário') is null, 'unsplit row has no percentage');

-- 8. Settlement: Ana advanced R$ 100 split 65/35 -> Bruno owes Ana 35.00
select pg_temp.check((select debtor_person_id from public.settlement(pg_temp.id('ws'), '2026-11-20') where creditor_person_id = pg_temp.id('ana')) = pg_temp.id('bruno'), 'bruno owes ana');
select pg_temp.check((select amount_cents from public.settlement(pg_temp.id('ws'), '2026-11-20') where creditor_person_id = pg_temp.id('ana')) = 3500, 'bruno owes 35.00');
-- Opposite debt nets out: Bruno advanced 40,00 split 50/50 -> Ana owes 20,00; net Bruno owes 15,00
select public.create_transaction(pg_temp.id('ws'), '2026-12-05', '2026-12-01', null, pg_temp.id('led'), null, 'Dez ana', -10000,
  pg_temp.id('ana'), current_setting('t.split')::jsonb);
select public.create_transaction(pg_temp.id('ws'), '2026-12-06', '2026-12-01', null, pg_temp.id('led'), null, 'Dez bruno', -4000,
  pg_temp.id('bruno'), json_build_array(json_build_object('person_id', current_setting('t.ana'), 'percent', 50),
                                        json_build_object('person_id', current_setting('t.bruno'), 'percent', 50))::jsonb);
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-12-01')) = 1, 'debts are netted into one row');
select pg_temp.check((select amount_cents from public.settlement(pg_temp.id('ws'), '2026-12-01')) = 1500, 'net amount is 15.00');
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-10-01')) = 0, 'no settlement for months without pay-to');
-- A row that pays to its own owner is not a debt
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-11-01') where debtor_person_id = creditor_person_id) = 0, 'self-debts never appear');

-- 9. Editing: cell edits (including owner), amount of a single row, concurrency
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select set_config('t.ana_row', (select id::text from public.transactions where description = 'Mercado semanal' and owner_person_id = pg_temp.id('ana')), true);
select set_config('t.bruno_row', (select id::text from public.transactions where description = 'Mercado semanal' and owner_person_id = pg_temp.id('bruno')), true);
update public.transactions set description = 'Editado pelo Bruno' where id = pg_temp.id('bruno_row');
select pg_temp.check((select description from public.transactions where id = pg_temp.id('bruno_row')) = 'Editado pelo Bruno', 'member edits a cell');
select pg_temp.check((select updated_by from public.transactions where id = pg_temp.id('bruno_row')) = 'bbbbbbbb-0000-0000-0000-000000000002', 'updated_by is set');
update public.transactions set owner_person_id = pg_temp.id('vo'), pay_to_person_id = pg_temp.id('ana') where id = pg_temp.id('bruno_row');
select pg_temp.check((select owner_person_id from public.transactions where id = pg_temp.id('bruno_row')) = pg_temp.id('vo'), 'owner can be changed in place');
update public.transactions set owner_person_id = pg_temp.id('bruno'), pay_to_person_id = null, description = 'Mercado semanal' where id = pg_temp.id('bruno_row');
select pg_temp.throws($q$update public.transactions set amount_cents = -1$q$, 'permission denied');
select pg_temp.throws(format($q$update public.transactions set payment_month = '2026-10-15' where id = %L$q$, current_setting('t.bruno_row')), 'check constraint');
select pg_temp.throws(format($q$update public.transactions set owner_person_id = gen_random_uuid() where id = %L$q$, current_setting('t.bruno_row')), 'violates foreign key');

select set_config('t.stamp', (select updated_at::text from public.transactions where id = pg_temp.id('bruno_row')), true);
select public.set_transaction_amount(pg_temp.id('bruno_row'), -5000, current_setting('t.stamp')::timestamptz);
select pg_temp.check((select amount_cents from public.transactions where id = pg_temp.id('bruno_row')) = -5000, 'amount changed on that row');
select pg_temp.check((select amount_cents from public.transactions where id = pg_temp.id('ana_row')) = -6500, 'sibling row untouched');
select pg_temp.check((select split_percent from public.transactions_view where id = pg_temp.id('bruno_row')) = round(5000 * 100 / 11500.0, 2), 'derived percentage follows the amounts');
select pg_temp.throws(format($q$select public.set_transaction_amount(%L, -1000, %L::timestamptz)$q$, current_setting('t.bruno_row'), current_setting('t.stamp')), 'conflict');
select pg_temp.throws(format($q$select public.set_transaction_amount(%L, 0)$q$, current_setting('t.bruno_row')), 'amount_invalid');

-- 10. Installment scopes act on the SAME owner's rows
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.odd_ana', (select id::text from public.transactions where description = 'Odd' and owner_person_id = pg_temp.id('ana')), true);
select set_config('t.ana_i2', (select id::text from public.transactions where description = 'Notebook (2/3)' and owner_person_id = pg_temp.id('ana')), true);
select set_config('t.ana_i1', (select id::text from public.transactions where description = 'Notebook (1/3)' and owner_person_id = pg_temp.id('ana')), true);
select pg_temp.check(public.update_installments(pg_temp.id('ana_i2'), 'following', jsonb_build_object('envelope_id', current_setting('t.env'))) = 2, 'following touches ana installments 2 and 3');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%' and envelope_id is not null) = 2, 'only ana rows of installments 2-3 changed');
select pg_temp.check(public.update_installments(pg_temp.id('ana_i1'), 'all', jsonb_build_object('pay_to_person_id', current_setting('t.bruno'), 'amount_cents', -1000)) = 3, 'all touches ana rows of the plan');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%' and owner_person_id = pg_temp.id('ana') and amount_cents = -1000 and pay_to_person_id = pg_temp.id('bruno')) = 3, 'changes applied to ana rows');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%' and owner_person_id = pg_temp.id('bruno') and amount_cents = -1000) = 0, 'bruno rows untouched');
select public.update_installments(pg_temp.id('ana_i1'), 'single', jsonb_build_object('account_id', null));
select pg_temp.check((select account_id from public.transactions where id = pg_temp.id('ana_i1')) is null, 'null clears an optional field');
select pg_temp.throws(format($q$select public.update_installments(%L, 'single', '{"ledger_account_id": null}'::jsonb)$q$, current_setting('t.ana_i1')), 'ledger_invalid');

-- 11. Deleting
select pg_temp.check(public.delete_transactions(array[pg_temp.id('ana_i2')], 'following') = 4, 'following removes installments 2-3 of every owner');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%') = 2, 'installment 1 (both owners) remains');
select pg_temp.check(public.delete_transactions(array[pg_temp.id('ana_i1')], 'single') = 1, 'single removes one row');
select pg_temp.check((select count(*) from public.installment_groups where total_installments = 3) = 1, 'plan with a remaining row is kept');
select pg_temp.check(public.delete_transactions((select array_agg(id) from public.transactions where description = 'Notebook (1/3)'), 'all') = 1, 'all removes the rest of the purchase');
select pg_temp.check((select count(*) from public.installment_groups where total_installments = 3) = 0, 'empty plan is cleaned up');
-- "all" on one row of a split purchase removes its siblings too
select pg_temp.check(public.delete_transactions(array[pg_temp.id('ana_row')], 'all') = 2, 'all removes both owners of a split purchase');
select pg_temp.check((select count(*) from public.transactions where description in ('Mercado semanal', 'Editado pelo Bruno')) = 0, 'siblings are gone');
-- "single" on one row leaves its sibling
select pg_temp.check(public.delete_transactions((select array_agg(id) from public.transactions where description = 'Odd' and owner_person_id = pg_temp.id('bruno')), 'single') = 1, 'single leaves the sibling');
select pg_temp.check((select count(*) from public.transactions where description = 'Odd') = 1, 'one sibling remains');

-- 12. Outsiders: no reads, no writes, no cross-workspace references
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from public.transactions) = 0, 'outsider sees no transactions');
select pg_temp.check((select count(*) from public.transactions_view) = 0, 'outsider sees nothing in the view');
select pg_temp.check((select count(*) from public.accounts) + (select count(*) from public.ledger_accounts) + (select count(*) from public.envelopes) + (select count(*) from public.categories) = 0, 'outsider sees no catalogs');
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-11-01')) = 0, 'outsider sees no settlement');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -100, null, %L::jsonb)$q$,
  current_setting('t.ws'), current_setting('t.led'), current_setting('t.split')), 'forbidden');
select pg_temp.throws(format($q$select public.delete_transactions(array[%L]::uuid[], 'single')$q$, current_setting('t.odd_ana')), 'forbidden');
select pg_temp.throws(format($q$select public.set_transaction_amount(%L, -5)$q$, current_setting('t.odd_ana')), 'not_found');
select pg_temp.throws(format($q$insert into public.accounts (workspace_id, name) values (%L, 'Invasor')$q$, current_setting('t.ws')), 'row-level security');
do $$
declare n integer;
begin
  update public.transactions set description = 'hacked';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'outsider cannot edit transactions');
end $$;

-- Another workspace cannot reference this workspace's catalog or people
select set_config('t.ws2', public.create_workspace('Outra')::text, true);
select pg_temp.throws(format($q$insert into public.ledger_accounts (workspace_id, name, category_id) values (%L, 'X', %L)$q$,
  current_setting('t.ws2'), current_setting('t.cat')), 'violates foreign key');

-- 13. Anonymous users have no access
reset role;
set local role anon;
select pg_temp.throws($q$select count(*) from public.transactions$q$, 'permission denied');
select pg_temp.throws($q$select count(*) from public.transactions_view$q$, 'permission denied');
select pg_temp.throws($q$select public.settlement(gen_random_uuid(), '2026-11-01')$q$, 'permission denied');

reset role;
rollback;

select 'ALL TESTS PASSED' as result;
