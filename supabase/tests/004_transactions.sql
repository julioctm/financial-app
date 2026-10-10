-- Spec 004-lancamentos: transactions, installments, shares, settlement and RLS.
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
select pg_temp.check((select count(*) from public.ledger_accounts) = 2, 'member creates catalog items');
select pg_temp.throws(
  format($q$insert into public.accounts (workspace_id, name) values (%L, 'cartão BRUNO')$q$, current_setting('t.ws')),
  'duplicate key');

select set_config('t.split', json_build_array(
  json_build_object('person_id', current_setting('t.ana'), 'percent', 65),
  json_build_object('person_id', current_setting('t.bruno'), 'percent', 35))::text, true);

-- 1. Create a single transaction with a 65/35 split
select set_config('t.tx1', (public.create_transaction(
  pg_temp.id('ws'), '2026-10-03', '2026-10-15', pg_temp.id('acc'), pg_temp.id('led'), pg_temp.id('env'),
  '  Mercado semanal ', -10000, null, current_setting('t.split')::jsonb))[1]::text, true);
select pg_temp.check((select payment_month from public.transactions where id = pg_temp.id('tx1')) = '2026-10-01', 'payment month normalized to day 1');
select pg_temp.check((select description from public.transactions where id = pg_temp.id('tx1')) = 'Mercado semanal', 'description trimmed');
select pg_temp.check((select amount_cents from public.transaction_shares where transaction_id = pg_temp.id('tx1') and person_id = pg_temp.id('ana')) = -6500, 'ana share -65.00');
select pg_temp.check((select amount_cents from public.transaction_shares where transaction_id = pg_temp.id('tx1') and person_id = pg_temp.id('bruno')) = -3500, 'bruno share -35.00');

-- 2. No cent is lost on odd amounts (leftover goes to the largest share)
select set_config('t.tx2', (public.create_transaction(
  pg_temp.id('ws'), '2026-10-04', '2026-10-01', null, pg_temp.id('led'), null, 'Odd', -10001, null,
  current_setting('t.split')::jsonb))[1]::text, true);
select pg_temp.check((select amount_cents from public.transaction_shares where transaction_id = pg_temp.id('tx2') and person_id = pg_temp.id('ana')) = -6501, 'leftover cent goes to the largest share');
select pg_temp.check((select sum(amount_cents) from public.transaction_shares where transaction_id = pg_temp.id('tx2')) = -10001, 'shares add up to the amount');
select pg_temp.check((select sum(amount_cents) from public.transaction_shares where transaction_id = pg_temp.id('tx1')) = (select amount_cents from public.transactions where id = pg_temp.id('tx1')), 'invariant holds');

-- Income uses positive amounts
select set_config('t.inc', (public.create_transaction(pg_temp.id('ws'), '2026-10-10', '2026-10-01', null,
  (select id from public.ledger_accounts where name = 'Salário'), null, 'Salário', 9801,
  null, json_build_array(json_build_object('person_id', current_setting('t.ana'), 'percent', 100))::jsonb))[1]::text, true);
select pg_temp.check((select amount_cents from public.transaction_shares where transaction_id = pg_temp.id('inc')) = 9801, 'income is positive');

-- 3. Installments: total split, leftover on the first, months advance
select set_config('t.inst', array_to_string(public.create_transaction(
  pg_temp.id('ws'), '2026-03-20', '2026-03-01', pg_temp.id('acc'), pg_temp.id('led'), null, 'Notebook', -10000, null,
  current_setting('t.split')::jsonb, 3, true), ','), true);
select pg_temp.check((select count(*) from public.transactions where installment_group_id is not null) = 3, 'three installments');
select pg_temp.check((select array_agg(amount_cents order by installment_number) from public.transactions where installment_group_id is not null) = array[-3334, -3333, -3333]::bigint[], 'leftover on first installment');
select pg_temp.check((select array_agg(payment_month order by installment_number) from public.transactions where installment_group_id is not null) = array['2026-03-01', '2026-04-01', '2026-05-01']::date[], 'months advance');
select pg_temp.check((select description from public.transactions where installment_number = 2) = 'Notebook (2/3)', 'description suffix');
select pg_temp.check((select total_amount_cents from public.installment_groups) = -10000, 'group stores total');
select pg_temp.check((select count(*) from public.transactions t join (select transaction_id, sum(amount_cents) s from public.transaction_shares group by 1) x on x.transaction_id = t.id where x.s <> t.amount_cents) = 0, 'all installments consistent');

-- Installment value given per installment
select pg_temp.check((select count(*) from unnest(public.create_transaction(
  pg_temp.id('ws'), '2026-01-05', '2026-01-01', null, pg_temp.id('led'), null, 'Sofá', -5000, null,
  current_setting('t.split')::jsonb, 4, false))) = 4, 'per-installment amount creates 4 rows');
select pg_temp.check((select total_amount_cents from public.installment_groups where total_installments = 4) = -20000, 'total = n x installment');

-- 4. Validation errors
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

-- 5. Settlement: Ana advanced a purchase split 65/35 -> Bruno owes Ana 35%
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.tx3', (public.create_transaction(
  pg_temp.id('ws'), '2026-11-02', '2026-11-01', null, pg_temp.id('led'), null, 'Pago pela Ana', -10000,
  pg_temp.id('ana'), current_setting('t.split')::jsonb))[1]::text, true);
select pg_temp.check((select debtor_person_id from public.settlement(pg_temp.id('ws'), '2026-11-20')) = pg_temp.id('bruno'), 'bruno is the debtor');
select pg_temp.check((select creditor_person_id from public.settlement(pg_temp.id('ws'), '2026-11-20')) = pg_temp.id('ana'), 'ana is the creditor');
select pg_temp.check((select amount_cents from public.settlement(pg_temp.id('ws'), '2026-11-20')) = 3500, 'bruno owes 35.00');
-- Opposite debt nets out: Bruno advanced 50/50 R$ 40,00 -> Ana owes 20,00; net Bruno owes 15,00
select public.create_transaction(pg_temp.id('ws'), '2026-11-05', '2026-11-01', null, pg_temp.id('led'), null, 'Pago pelo Bruno', -4000,
  pg_temp.id('bruno'), json_build_array(json_build_object('person_id', current_setting('t.ana'), 'percent', 50),
                                        json_build_object('person_id', current_setting('t.bruno'), 'percent', 50))::jsonb);
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-11-01')) = 1, 'debts are netted into one row');
select pg_temp.check((select amount_cents from public.settlement(pg_temp.id('ws'), '2026-11-01')) = 1500, 'net amount is 15.00');
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-10-01')) = 0, 'no settlement for months without advances');

-- 6. Editing: cell edits, amount change, concurrency
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
update public.transactions set description = 'Editado pelo Bruno' where id = pg_temp.id('tx1');
select pg_temp.check((select description from public.transactions where id = pg_temp.id('tx1')) = 'Editado pelo Bruno', 'member edits a cell');
select pg_temp.check((select updated_by from public.transactions where id = pg_temp.id('tx1')) = 'bbbbbbbb-0000-0000-0000-000000000002', 'updated_by is set');
select pg_temp.throws($q$update public.transactions set amount_cents = -1$q$, 'permission denied');
select pg_temp.throws(format($q$update public.transactions set payment_month = '2026-10-15' where id = %L$q$, current_setting('t.tx1')), 'check constraint');

select set_config('t.stamp', (select updated_at::text from public.transactions where id = pg_temp.id('tx1')), true);
select public.set_transaction_amount(pg_temp.id('tx1'), -20000, null, current_setting('t.stamp')::timestamptz);
select pg_temp.check((select amount_cents from public.transaction_shares where transaction_id = pg_temp.id('tx1') and person_id = pg_temp.id('ana')) = -13000, 'amount change keeps percentages');
select pg_temp.throws(format($q$select public.set_transaction_amount(%L, -1000, null, %L::timestamptz)$q$, current_setting('t.tx1'), current_setting('t.stamp')), 'conflict');

select public.set_transaction_amount(pg_temp.id('tx1'), -20000, json_build_array(
  json_build_object('person_id', current_setting('t.ana'), 'percent', 50),
  json_build_object('person_id', current_setting('t.bruno'), 'percent', 50))::jsonb);
select pg_temp.check((select amount_cents from public.transaction_shares where transaction_id = pg_temp.id('tx1') and person_id = pg_temp.id('bruno')) = -10000, 'split can be changed per transaction');

-- Changing the workspace default does not touch existing transactions
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select public.set_split_defaults(pg_temp.id('ws'), json_build_array(
  json_build_object('person_id', current_setting('t.ana'), 'percent', 60),
  json_build_object('person_id', current_setting('t.bruno'), 'percent', 40))::jsonb);
select pg_temp.check((select percent from public.transaction_shares where transaction_id = pg_temp.id('tx2') and person_id = pg_temp.id('ana')) = 65, 'existing shares are not retroactive');

-- 7. Installment scopes
select set_config('t.i1', (select id::text from public.transactions where installment_number = 1 and description like 'Notebook%'), true);
select set_config('t.i2', (select id::text from public.transactions where installment_number = 2 and description like 'Notebook%'), true);
select pg_temp.check(public.update_installments(pg_temp.id('i2'), 'following', jsonb_build_object('envelope_id', current_setting('t.env'))) = 2, 'following touches installments 2 and 3');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%' and envelope_id is not null) = 2, 'installment 1 untouched by following');
select pg_temp.check(public.update_installments(pg_temp.id('i1'), 'all', jsonb_build_object('pay_to_person_id', current_setting('t.ana'), 'amount_cents', -6000)) = 3, 'all touches the whole group');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%' and amount_cents = -6000 and pay_to_person_id = pg_temp.id('ana')) = 3, 'changes applied to all installments');
select pg_temp.check((select count(*) from public.transactions t join (select transaction_id, sum(amount_cents) s from public.transaction_shares group by 1) x on x.transaction_id = t.id where x.s <> t.amount_cents) = 0, 'shares recomputed for every installment');
select public.update_installments(pg_temp.id('i1'), 'single', jsonb_build_object('account_id', null));
select pg_temp.check((select account_id from public.transactions where id = pg_temp.id('i1')) is null, 'null clears optional field');
select pg_temp.throws(format($q$select public.update_installments(%L, 'single', '{"ledger_account_id": null}'::jsonb)$q$, current_setting('t.i1')), 'ledger_invalid');

-- 8. Deleting
select pg_temp.check(public.delete_transactions(array[pg_temp.id('i2')], 'following') = 2, 'delete following removes 2');
select pg_temp.check((select count(*) from public.transactions where description like 'Notebook%') = 1, 'first installment remains');
select pg_temp.check(public.delete_transactions(array[pg_temp.id('i1')], 'single') = 1, 'delete single');
select pg_temp.check((select count(*) from public.installment_groups where total_installments = 3) = 0, 'empty group is cleaned up');
select pg_temp.check((select count(*) from public.transaction_shares where transaction_id in (pg_temp.id('i1'), pg_temp.id('i2'))) = 0, 'shares deleted with the transaction');

-- 9. The shares invariant is enforced at the database level
select pg_temp.as_admin();
do $$
begin
  begin
    insert into public.transactions (workspace_id, purchase_date, payment_month, ledger_account_id, amount_cents)
    values (pg_temp.id('ws'), '2026-12-01', '2026-12-01', pg_temp.id('led'), -100);
    set constraints all immediate;
    raise exception 'ASSERTION FAILED: transaction without shares was accepted';
  exception when others then
    if sqlerrm not like '%shares_inconsistent%' then raise; end if;
  end;
end $$;

-- 10. Outsiders: no reads, no writes, no cross-workspace references
select pg_temp.as_admin();
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from public.transactions) = 0, 'outsider sees no transactions');
select pg_temp.check((select count(*) from public.transaction_shares) = 0, 'outsider sees no shares');
select pg_temp.check((select count(*) from public.accounts) + (select count(*) from public.ledger_accounts) + (select count(*) from public.envelopes) + (select count(*) from public.categories) = 0, 'outsider sees no catalogs');
select pg_temp.check((select count(*) from public.settlement(pg_temp.id('ws'), '2026-11-01')) = 0, 'outsider sees no settlement');
select pg_temp.throws(format($q$select public.create_transaction(%L, '2026-10-01', '2026-10-01', null, %L, null, 'x', -100, null, %L::jsonb)$q$,
  current_setting('t.ws'), current_setting('t.led'), current_setting('t.split')), 'forbidden');
select pg_temp.throws(format($q$select public.delete_transactions(array[%L]::uuid[], 'single')$q$, current_setting('t.tx1')), 'forbidden');
select pg_temp.throws(format($q$select public.set_transaction_amount(%L, -5)$q$, current_setting('t.tx1')), 'not_found');
select pg_temp.throws(format($q$insert into public.accounts (workspace_id, name) values (%L, 'Invasor')$q$, current_setting('t.ws')), 'row-level security');
do $$
declare n integer;
begin
  update public.transactions set description = 'hacked';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'outsider cannot edit transactions');
end $$;

-- Another workspace cannot reference this workspace's catalog
select set_config('t.ws2', public.create_workspace('Outra')::text, true);
select pg_temp.throws(format($q$insert into public.ledger_accounts (workspace_id, name, category_id) values (%L, 'X', %L)$q$,
  current_setting('t.ws2'), current_setting('t.cat')), 'violates foreign key');

-- 11. Anonymous users have no access
reset role;
set local role anon;
select pg_temp.throws($q$select count(*) from public.transactions$q$, 'permission denied');
select pg_temp.throws($q$select public.settlement(gen_random_uuid(), '2026-11-01')$q$, 'permission denied');

reset role;
rollback;

select 'ALL TESTS PASSED' as result;
