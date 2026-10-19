-- Spec 004-lancamentos, revised model: one transaction row = one owner.
--
-- Before: a transaction carried a list of "shares" (owners with percentages).
-- Now (like the spreadsheet): a purchase shared by N people becomes N rows, each with its own
-- owner, amount and optional "pay to". Rows created together share a split_group_id, and the
-- percentage shown in the "Divisão" column is derived from the amounts of the group.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column owner_person_id uuid,
  add column split_group_id uuid;

-- The shares invariant (sum = amount) no longer applies; remove it before converting data.
drop trigger if exists transactions_shares_check on public.transactions;
drop trigger if exists shares_consistency_check on public.transaction_shares;

-- ---------------------------------------------------------------------------
-- 2. Convert existing data: each share becomes its own row
-- ---------------------------------------------------------------------------

do $$
declare
  t record;
  s record;
  n integer;
  grp uuid;
  is_first boolean;
  new_pay_to uuid;
  fallback_owner uuid;
begin
  for t in select * from public.transactions loop
    select count(*) into n from public.transaction_shares where transaction_id = t.id;

    if n = 0 then
      select m.person_id into fallback_owner from public.workspace_members m
      where m.workspace_id = t.workspace_id order by m.created_at limit 1;
      update public.transactions set owner_person_id = fallback_owner where id = t.id;
      continue;
    end if;

    grp := case when n > 1 then gen_random_uuid() end;
    is_first := true;

    for s in
      select * from public.transaction_shares
      where transaction_id = t.id order by percent desc, person_id
    loop
      new_pay_to := case when t.pay_to_person_id = s.person_id then null else t.pay_to_person_id end;

      if is_first then
        update public.transactions
        set owner_person_id = s.person_id,
            amount_cents = s.amount_cents,
            pay_to_person_id = new_pay_to,
            split_group_id = grp
        where id = t.id;
        is_first := false;
      elsif s.amount_cents <> 0 then
        insert into public.transactions (
          workspace_id, purchase_date, payment_month, account_id, ledger_account_id, envelope_id,
          description, amount_cents, pay_to_person_id, installment_group_id, installment_number,
          created_by, updated_by, created_at, owner_person_id, split_group_id
        ) values (
          t.workspace_id, t.purchase_date, t.payment_month, t.account_id, t.ledger_account_id,
          t.envelope_id, t.description, s.amount_cents, new_pay_to, t.installment_group_id,
          t.installment_number, t.created_by, t.updated_by, t.created_at, s.person_id, grp
        );
      end if;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Constraints, indexes, grants
-- ---------------------------------------------------------------------------

alter table public.transactions alter column owner_person_id set not null;
alter table public.transactions
  add foreign key (owner_person_id, workspace_id) references public.people (id, workspace_id);

create index transactions_owner_idx on public.transactions (workspace_id, owner_person_id);
create index transactions_split_idx on public.transactions (split_group_id);

grant update (owner_person_id) on public.transactions to authenticated;

drop table public.transaction_shares;
drop function public.check_transaction_shares();
drop function public.set_transaction_amount(uuid, bigint, jsonb, timestamptz);

-- ---------------------------------------------------------------------------
-- 4. View with the derived split percentage
-- ---------------------------------------------------------------------------

-- split_percent: this row's share of everything created together (same split_group_id).
-- NULL when the row was not split. security_invoker keeps RLS of the caller.
create view public.transactions_view with (security_invoker = true) as
select
  t.*,
  case
    when t.split_group_id is null then null
    else round(
      abs(t.amount_cents)::numeric * 100
      / nullif(sum(abs(t.amount_cents)) over (partition by t.split_group_id), 0),
      2)
  end as split_percent
from public.transactions t;

revoke all on public.transactions_view from anon, authenticated;
grant select on public.transactions_view to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Functions
-- ---------------------------------------------------------------------------

-- p_shares: [{"person_id": "<uuid>", "percent": 65}, ...] summing to 100; each owner with
-- percent > 0 gets their own row. p_pay_to = who advanced the money: that person's own row
-- has no "pay to", the other rows pay to them.
-- p_installments > 1 creates N installments (payment month advancing monthly), each split
-- across the owners. p_amount_is_total: true = amount is the total (leftover cents go to the
-- first installment); false = amount is the value of each installment.
-- Returns every row created.
create or replace function public.create_transaction(
  p_workspace uuid,
  p_purchase_date date,
  p_payment_month date,
  p_account uuid,
  p_ledger uuid,
  p_envelope uuid,
  p_description text,
  p_amount_cents bigint,
  p_pay_to uuid,
  p_shares jsonb,
  p_installments integer default 1,
  p_amount_is_total boolean default true
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  n integer := coalesce(p_installments, 1);
  month0 date := date_trunc('month', p_payment_month)::date;
  sign integer := case when p_amount_cents < 0 then -1 else 1 end;
  a bigint := abs(p_amount_cents);
  base_abs bigint;
  rem_abs bigint;
  total bigint;
  grp uuid;
  split_grp uuid;
  tx uuid;
  amt bigint;
  ids uuid[] := '{}';
  items jsonb;
  n_owners integer;
  sh record;
  i integer;
begin
  if not public.is_workspace_member(p_workspace) then
    raise exception 'forbidden';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 or p_purchase_date is null or p_payment_month is null then
    raise exception 'amount_invalid';
  end if;
  if n < 1 or n > 120 then
    raise exception 'installments_invalid';
  end if;
  if p_ledger is null then
    raise exception 'ledger_invalid';
  end if;
  perform public.validate_shares(p_workspace, p_shares, true);
  perform public.validate_transaction_refs(p_workspace, p_account, p_ledger, p_envelope, p_pay_to);

  select coalesce(jsonb_agg(e), '[]'::jsonb) into items
  from jsonb_array_elements(p_shares) e where (e ->> 'percent')::numeric > 0;
  n_owners := jsonb_array_length(items);

  if n > 1 then
    if p_amount_is_total then
      base_abs := a / n;
      rem_abs := a - base_abs * n;
      total := p_amount_cents;
    else
      base_abs := a;
      rem_abs := 0;
      total := p_amount_cents * n;
    end if;
    if base_abs = 0 then
      raise exception 'amount_invalid';
    end if;
    insert into public.installment_groups (workspace_id, total_installments, total_amount_cents)
    values (p_workspace, n, total) returning id into grp;
  end if;

  for i in 1..n loop
    amt := case when n = 1 then p_amount_cents
                else sign * (base_abs + case when i = 1 then rem_abs else 0 end) end;
    split_grp := case when n_owners > 1 then gen_random_uuid() end;

    for sh in select * from public.compute_shares(amt, items) loop
      continue when sh.amount_cents = 0;

      insert into public.transactions (
        workspace_id, purchase_date, payment_month, account_id, ledger_account_id, envelope_id,
        description, amount_cents, pay_to_person_id, installment_group_id, installment_number,
        owner_person_id, split_group_id, created_by, updated_by
      ) values (
        p_workspace, p_purchase_date, (month0 + (i - 1) * interval '1 month')::date, p_account,
        p_ledger, p_envelope,
        btrim(coalesce(p_description, '')) || case when n > 1 then format(' (%s/%s)', i, n) else '' end,
        sh.amount_cents,
        case when p_pay_to = sh.person_id then null else p_pay_to end,
        grp, case when n > 1 then i else null end,
        sh.person_id, split_grp, auth.uid(), auth.uid()
      ) returning id into tx;

      ids := ids || tx;
    end loop;
  end loop;

  return ids;
end;
$$;

-- Changes the amount of ONE row (its siblings are untouched; the split percentage is
-- derived, so it moves with the amounts). p_expected enables optimistic concurrency.
-- Returns the new updated_at.
create function public.set_transaction_amount(
  p_tx uuid,
  p_amount_cents bigint,
  p_expected timestamptz default null
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
  result timestamptz;
begin
  select * into t from public.transactions where id = p_tx for update;
  if not found or not public.is_workspace_member(t.workspace_id) then
    raise exception 'not_found';
  end if;
  if p_expected is not null and t.updated_at <> p_expected then
    raise exception 'conflict';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'amount_invalid';
  end if;

  update public.transactions set amount_cents = p_amount_cents where id = p_tx
  returning updated_at into result;
  return result;
end;
$$;

-- Applies the same change to the SAME OWNER's rows in one installment, the following ones, or
-- the whole plan ("this line across the months"). p_changes keys (all optional; a present key
-- with null clears the field where allowed):
-- ledger_account_id, account_id, envelope_id, pay_to_person_id, amount_cents.
create or replace function public.update_installments(p_tx uuid, p_scope text, p_changes jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
  r record;
  new_amount bigint;
  n integer := 0;
  new_ledger uuid;
  new_account uuid;
  new_envelope uuid;
  new_pay_to uuid;
begin
  if p_scope not in ('single', 'following', 'all') then
    raise exception 'scope_invalid';
  end if;

  select * into t from public.transactions where id = p_tx;
  if not found or not public.is_workspace_member(t.workspace_id) then
    raise exception 'not_found';
  end if;

  new_ledger := case when p_changes ? 'ledger_account_id'
                     then (p_changes ->> 'ledger_account_id')::uuid else t.ledger_account_id end;
  new_account := case when p_changes ? 'account_id'
                      then (p_changes ->> 'account_id')::uuid else t.account_id end;
  new_envelope := case when p_changes ? 'envelope_id'
                       then (p_changes ->> 'envelope_id')::uuid else t.envelope_id end;
  new_pay_to := case when p_changes ? 'pay_to_person_id'
                     then (p_changes ->> 'pay_to_person_id')::uuid else t.pay_to_person_id end;
  if new_ledger is null then
    raise exception 'ledger_invalid';
  end if;
  -- Only validate what is being changed, so unrelated edits keep working after archiving.
  perform public.validate_transaction_refs(
    t.workspace_id,
    case when p_changes ? 'account_id' then new_account end,
    case when p_changes ? 'ledger_account_id' then new_ledger end,
    case when p_changes ? 'envelope_id' then new_envelope end,
    case when p_changes ? 'pay_to_person_id' then new_pay_to end
  );

  if p_changes ? 'amount_cents' then
    new_amount := (p_changes ->> 'amount_cents')::bigint;
    if new_amount is null or new_amount = 0 then
      raise exception 'amount_invalid';
    end if;
  end if;

  for r in
    select x.id from public.transactions x
    where x.id = p_tx
       or (p_scope <> 'single' and t.installment_group_id is not null
           and x.installment_group_id = t.installment_group_id
           and x.owner_person_id = t.owner_person_id
           and (p_scope = 'all' or x.installment_number >= t.installment_number))
  loop
    update public.transactions set
      ledger_account_id = new_ledger,
      account_id = new_account,
      envelope_id = new_envelope,
      pay_to_person_id = new_pay_to,
      amount_cents = coalesce(new_amount, amount_cents)
    where id = r.id;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Deletes transactions. Scope extends the deletion beyond the given rows:
--   single:    only the given rows
--   following: also every row (any owner) of the later installments of the same plan
--   all:       the whole purchase: every row of the installment plan and of the split group
-- Empty installment plans are cleaned up. Returns rows deleted.
create or replace function public.delete_transactions(p_ids uuid[], p_scope text default 'single')
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  victims uuid[];
  groups uuid[];
  n integer;
begin
  if p_scope not in ('single', 'following', 'all') then
    raise exception 'scope_invalid';
  end if;

  if exists (
    select 1 from public.transactions t
    where t.id = any (p_ids) and not public.is_workspace_member(t.workspace_id)
  ) then
    raise exception 'forbidden';
  end if;

  select coalesce(array_agg(distinct v.id), '{}') into victims from (
    select t.id from public.transactions t where t.id = any (p_ids)
    union
    select t2.id
    from public.transactions t1
    join public.transactions t2 on t2.installment_group_id = t1.installment_group_id
    where t1.id = any (p_ids) and p_scope <> 'single'
      and (p_scope = 'all' or t2.installment_number >= t1.installment_number)
    union
    select t3.id
    from public.transactions t1
    join public.transactions t3 on t3.split_group_id = t1.split_group_id
    where t1.id = any (p_ids) and p_scope = 'all'
  ) v;

  select coalesce(array_agg(distinct t.installment_group_id), '{}') into groups
  from public.transactions t
  where t.id = any (victims) and t.installment_group_id is not null;

  delete from public.transactions where id = any (victims);
  get diagnostics n = row_count;

  delete from public.installment_groups g
  where g.id = any (groups)
    and not exists (select 1 from public.transactions t where t.installment_group_id = g.id);

  return n;
end;
$$;

-- Who owes whom for a payment month: a row whose "pay to" is someone other than its owner
-- means the owner owes that person the row's amount. Opposite debts are netted.
-- Runs with the caller's rights, so RLS limits it to the caller's workspaces.
create or replace function public.settlement(p_workspace uuid, p_month date)
returns table (debtor_person_id uuid, creditor_person_id uuid, amount_cents bigint)
language sql stable set search_path = '' as $$
  with debts as (
    select t.owner_person_id as debtor, t.pay_to_person_id as creditor, -t.amount_cents as amt
    from public.transactions t
    where t.workspace_id = p_workspace
      and t.payment_month = date_trunc('month', p_month)::date
      and t.pay_to_person_id is not null
      and t.owner_person_id <> t.pay_to_person_id
  ), pairs as (
    select least(debtor, creditor) as a, greatest(debtor, creditor) as b,
           sum(case when debtor < creditor then amt else -amt end) as net
    from debts group by 1, 2
  )
  select case when net > 0 then a else b end,
         case when net > 0 then b else a end,
         abs(net)::bigint
  from pairs where net <> 0;
$$;

revoke execute on function
  public.create_transaction(uuid, date, date, uuid, uuid, uuid, text, bigint, uuid, jsonb, integer, boolean),
  public.set_transaction_amount(uuid, bigint, timestamptz),
  public.update_installments(uuid, text, jsonb),
  public.delete_transactions(uuid[], text),
  public.settlement(uuid, date)
from public, anon, authenticated;

grant execute on function
  public.create_transaction(uuid, date, date, uuid, uuid, uuid, text, bigint, uuid, jsonb, integer, boolean),
  public.set_transaction_amount(uuid, bigint, timestamptz),
  public.update_installments(uuid, text, jsonb),
  public.delete_transactions(uuid[], text),
  public.settlement(uuid, date)
to authenticated;
