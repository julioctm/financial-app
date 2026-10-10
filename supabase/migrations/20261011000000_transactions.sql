-- Spec 004-lancamentos: payment accounts, ledger accounts, envelopes, categories,
-- transactions (with installments and per-person shares) and the monthly settlement.
--
-- Same authorization model as 003: every row carries workspace_id and is visible and
-- editable by members of that workspace. Cross-workspace references are impossible
-- because every foreign key is composite (id, workspace_id).

create type public.account_kind as enum ('credit_card', 'checking', 'cash', 'other');
create type public.ledger_kind as enum ('income', 'expense', 'investment');

-- ---------------------------------------------------------------------------
-- Catalogs
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind public.account_kind not null default 'credit_card',
  holder_person_id uuid,
  closing_day smallint check (closing_day between 1 and 31), -- only suggests the payment month
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (holder_person_id, workspace_id) references public.people (id, workspace_id)
);
create unique index accounts_name_key on public.accounts (workspace_id, lower(name));

create table public.envelopes ( -- "Tipos": Custo fixo, Conforto, Metas...
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index envelopes_name_key on public.envelopes (workspace_id, lower(name));

create table public.categories ( -- "Categorias": Essencial, Torra, Doações...
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index categories_name_key on public.categories (workspace_id, lower(name));

create table public.ledger_accounts ( -- "Títulos" (contas contábeis)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind public.ledger_kind not null default 'expense',
  category_id uuid,
  default_envelope_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id),
  foreign key (default_envelope_id, workspace_id) references public.envelopes (id, workspace_id)
);
create unique index ledger_accounts_name_key on public.ledger_accounts (workspace_id, lower(name));

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table public.installment_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  total_installments smallint not null check (total_installments >= 2),
  total_amount_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  purchase_date date not null,
  payment_month date not null check (payment_month = date_trunc('month', payment_month)::date),
  account_id uuid,
  ledger_account_id uuid not null,
  envelope_id uuid,
  description text not null default '' check (char_length(description) <= 255),
  amount_cents bigint not null check (amount_cents <> 0), -- negative = expense
  pay_to_person_id uuid,                                  -- "Pagar Para": who advanced the money
  installment_group_id uuid,
  installment_number smallint check (installment_number >= 1),
  external_id text,                                       -- legacy id, used by the importer
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check ((installment_group_id is null) = (installment_number is null)),
  foreign key (account_id, workspace_id) references public.accounts (id, workspace_id),
  foreign key (ledger_account_id, workspace_id) references public.ledger_accounts (id, workspace_id),
  foreign key (envelope_id, workspace_id) references public.envelopes (id, workspace_id),
  foreign key (pay_to_person_id, workspace_id) references public.people (id, workspace_id),
  foreign key (installment_group_id, workspace_id) references public.installment_groups (id, workspace_id)
);
create unique index transactions_external_key
  on public.transactions (workspace_id, external_id) where external_id is not null;
create index transactions_month_idx on public.transactions (workspace_id, payment_month);
create index transactions_ledger_idx on public.transactions (workspace_id, ledger_account_id);
create index transactions_account_idx on public.transactions (workspace_id, account_id);
create index transactions_purchase_idx on public.transactions (workspace_id, purchase_date);
create index transactions_group_idx on public.transactions (installment_group_id);

-- Snapshot of the split at creation time: changing the workspace default later
-- never touches existing transactions.
create table public.transaction_shares (
  transaction_id uuid not null,
  workspace_id uuid not null,
  person_id uuid not null,
  percent numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  amount_cents bigint not null,
  primary key (transaction_id, person_id),
  foreign key (transaction_id, workspace_id)
    references public.transactions (id, workspace_id) on delete cascade,
  foreign key (person_id, workspace_id) references public.people (id, workspace_id)
);
create index transaction_shares_person_idx on public.transaction_shares (workspace_id, person_id);

create function public.touch_transaction() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp(); -- moves on every write, even inside one transaction
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_transaction();

-- Invariant: shares always exist, sum to 100% and add up to the transaction amount.
-- Deferred so a transaction and its shares can be written in any order inside one tx.
create function public.check_transaction_shares() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tx uuid;
  amt bigint;
  n integer;
  s_amt bigint;
  s_pct numeric;
begin
  if tg_table_name = 'transactions' then
    tx := new.id;
  elsif tg_op = 'DELETE' then
    tx := old.transaction_id;
  else
    tx := new.transaction_id;
  end if;

  select amount_cents into amt from public.transactions where id = tx;
  if not found then
    return null; -- transaction was deleted (cascade)
  end if;

  select count(*), coalesce(sum(amount_cents), 0), coalesce(sum(percent), 0)
  into n, s_amt, s_pct from public.transaction_shares where transaction_id = tx;

  if n = 0 or s_amt <> amt or s_pct <> 100 then
    raise exception 'shares_inconsistent';
  end if;
  return null;
end;
$$;
create constraint trigger transactions_shares_check
  after insert or update of amount_cents on public.transactions
  deferrable initially deferred for each row execute function public.check_transaction_shares();
create constraint trigger shares_consistency_check
  after insert or update or delete on public.transaction_shares
  deferrable initially deferred for each row execute function public.check_transaction_shares();

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.envelopes enable row level security;
alter table public.categories enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.installment_groups enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_shares enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'envelopes', 'categories', 'ledger_accounts'] loop
    execute format('create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_workspace_member(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_workspace_member(workspace_id))', t || '_delete', t);
  end loop;
end $$;

create policy installment_groups_select on public.installment_groups
  for select using (public.is_workspace_member(workspace_id));
create policy transactions_select on public.transactions
  for select using (public.is_workspace_member(workspace_id));
create policy transactions_update on public.transactions
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy transaction_shares_select on public.transaction_shares
  for select using (public.is_workspace_member(workspace_id));

revoke all on public.accounts, public.envelopes, public.categories, public.ledger_accounts,
  public.installment_groups, public.transactions, public.transaction_shares
  from anon, authenticated;

grant select on public.accounts, public.envelopes, public.categories, public.ledger_accounts,
  public.installment_groups, public.transactions, public.transaction_shares to authenticated;

grant insert (workspace_id, name, kind, holder_person_id, closing_day) on public.accounts to authenticated;
grant update (name, kind, holder_person_id, closing_day, archived_at) on public.accounts to authenticated;
grant insert (workspace_id, name, sort_order) on public.envelopes, public.categories to authenticated;
grant update (name, sort_order, archived_at) on public.envelopes, public.categories to authenticated;
grant insert (workspace_id, name, kind, category_id, default_envelope_id) on public.ledger_accounts to authenticated;
grant update (name, kind, category_id, default_envelope_id, archived_at) on public.ledger_accounts to authenticated;
grant delete on public.accounts, public.envelopes, public.categories, public.ledger_accounts to authenticated;

-- Plain cell edits go straight to the table (spreadsheet view). Amount, shares,
-- creation, installments and deletion go through the functions below.
grant update (purchase_date, payment_month, account_id, ledger_account_id, envelope_id,
              description, pay_to_person_id) on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Splits an amount (in cents) by percentages without losing a cent: each share is
-- truncated and the leftover goes to the largest share (ties: lowest person id).
create function public.compute_shares(p_amount bigint, p_items jsonb)
returns table (person_id uuid, percent numeric, amount_cents bigint)
language sql immutable set search_path = '' as $$
  with items as (
    select x.person_id, x.percent
    from jsonb_to_recordset(p_items) as x (person_id uuid, percent numeric)
  ), base as (
    select i.person_id, i.percent,
           trunc(abs(p_amount) * i.percent / 100)::bigint as part,
           row_number() over (order by i.percent desc, i.person_id) as rn
    from items i
  ), leftover as (
    select abs(p_amount) - coalesce(sum(part), 0) as r from base
  )
  select b.person_id, b.percent,
         (case when p_amount < 0 then -1 else 1 end)
           * (b.part + case when b.rn = 1 then (select r from leftover) else 0 end)
  from base b;
$$;

create function public.validate_shares(p_workspace uuid, p_items jsonb, p_check_active boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  n integer;
  n_distinct integer;
  total numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'shares_invalid';
  end if;

  select count(*), count(distinct x.person_id), coalesce(sum(x.percent), 0)
  into n, n_distinct, total
  from jsonb_to_recordset(p_items) as x (person_id uuid, percent numeric);

  if n <> n_distinct or exists (
    select 1 from jsonb_to_recordset(p_items) as x (person_id uuid, percent numeric)
    where x.person_id is null or x.percent is null or x.percent < 0 or x.percent > 100
       or round(x.percent, 2) <> x.percent
  ) then
    raise exception 'shares_invalid';
  end if;

  if total <> 100 then
    raise exception 'shares_sum_not_100';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x (person_id uuid, percent numeric)
    where not exists (
      select 1 from public.people p
      where p.id = x.person_id and p.workspace_id = p_workspace
        and (p.is_active or not p_check_active)
    )
  ) then
    raise exception 'shares_person_invalid';
  end if;
end;
$$;

create function public.validate_transaction_refs(
  p_workspace uuid, p_account uuid, p_ledger uuid, p_envelope uuid, p_pay_to uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_ledger is not null and not exists (
    select 1 from public.ledger_accounts
    where id = p_ledger and workspace_id = p_workspace and archived_at is null) then
    raise exception 'ledger_invalid';
  end if;
  if p_account is not null and not exists (
    select 1 from public.accounts
    where id = p_account and workspace_id = p_workspace and archived_at is null) then
    raise exception 'account_invalid';
  end if;
  if p_envelope is not null and not exists (
    select 1 from public.envelopes
    where id = p_envelope and workspace_id = p_workspace and archived_at is null) then
    raise exception 'envelope_invalid';
  end if;
  if p_pay_to is not null and not exists (
    select 1 from public.people
    where id = p_pay_to and workspace_id = p_workspace and is_active) then
    raise exception 'pay_to_invalid';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public functions
-- ---------------------------------------------------------------------------

-- p_shares: [{"person_id": "<uuid>", "percent": 65}, ...] summing to 100.
-- p_installments > 1 creates N linked transactions, payment month advancing monthly.
-- p_amount_is_total: true = amount is the total to split across installments
-- (leftover cents go to the first one); false = amount is the value of each installment.
create function public.create_transaction(
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
  tx uuid;
  amt bigint;
  ids uuid[] := '{}';
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

    insert into public.transactions (
      workspace_id, purchase_date, payment_month, account_id, ledger_account_id, envelope_id,
      description, amount_cents, pay_to_person_id, installment_group_id, installment_number,
      created_by, updated_by
    ) values (
      p_workspace, p_purchase_date, (month0 + (i - 1) * interval '1 month')::date, p_account,
      p_ledger, p_envelope,
      btrim(coalesce(p_description, '')) || case when n > 1 then format(' (%s/%s)', i, n) else '' end,
      amt, p_pay_to, grp, case when n > 1 then i else null end, auth.uid(), auth.uid()
    ) returning id into tx;

    insert into public.transaction_shares (transaction_id, workspace_id, person_id, percent, amount_cents)
    select tx, p_workspace, c.person_id, c.percent, c.amount_cents
    from public.compute_shares(amt, p_shares) c;

    ids := ids || tx;
  end loop;

  return ids;
end;
$$;

-- Changes the amount and/or the split of one transaction. With p_shares null the
-- existing percentages are kept. p_expected enables optimistic concurrency.
-- Returns the new updated_at.
create function public.set_transaction_amount(
  p_tx uuid,
  p_amount_cents bigint,
  p_shares jsonb default null,
  p_expected timestamptz default null
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
  items jsonb;
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

  if p_shares is null then
    select jsonb_agg(jsonb_build_object('person_id', s.person_id, 'percent', s.percent))
    into items from public.transaction_shares s where s.transaction_id = p_tx;
  else
    perform public.validate_shares(t.workspace_id, p_shares, true);
    items := p_shares;
  end if;

  update public.transactions set amount_cents = p_amount_cents where id = p_tx
  returning updated_at into result;

  delete from public.transaction_shares where transaction_id = p_tx;
  insert into public.transaction_shares (transaction_id, workspace_id, person_id, percent, amount_cents)
  select p_tx, t.workspace_id, c.person_id, c.percent, c.amount_cents
  from public.compute_shares(p_amount_cents, items) c;

  return result;
end;
$$;

-- Applies the same change to one installment, the following ones, or the whole group.
-- p_changes keys (all optional; a present key with null clears the field where allowed):
-- ledger_account_id, account_id, envelope_id, pay_to_person_id, amount_cents.
create function public.update_installments(p_tx uuid, p_scope text, p_changes jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
  r record;
  items jsonb;
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
           and (p_scope = 'all' or x.installment_number >= t.installment_number))
    order by x.installment_number nulls first
  loop
    update public.transactions set
      ledger_account_id = new_ledger,
      account_id = new_account,
      envelope_id = new_envelope,
      pay_to_person_id = new_pay_to,
      amount_cents = coalesce(new_amount, amount_cents)
    where id = r.id;

    if new_amount is not null then
      select jsonb_agg(jsonb_build_object('person_id', s.person_id, 'percent', s.percent))
      into items from public.transaction_shares s where s.transaction_id = r.id;
      delete from public.transaction_shares where transaction_id = r.id;
      insert into public.transaction_shares (transaction_id, workspace_id, person_id, percent, amount_cents)
      select r.id, t.workspace_id, c.person_id, c.percent, c.amount_cents
      from public.compute_shares(new_amount, items) c;
    end if;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Deletes transactions. For installments, scope extends the deletion to the following
-- installments or the whole group. Empty groups are cleaned up. Returns rows deleted.
create function public.delete_transactions(p_ids uuid[], p_scope text default 'single')
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

-- Who owes whom for transactions of a payment month that someone else advanced.
-- Runs with the caller's rights, so RLS limits it to the caller's workspaces.
-- Each owner owes the payer their share; opposite debts between two people are netted.
create function public.settlement(p_workspace uuid, p_month date)
returns table (debtor_person_id uuid, creditor_person_id uuid, amount_cents bigint)
language sql stable set search_path = '' as $$
  with debts as (
    select s.person_id as debtor, t.pay_to_person_id as creditor, -s.amount_cents as amt
    from public.transactions t
    join public.transaction_shares s on s.transaction_id = t.id
    where t.workspace_id = p_workspace
      and t.payment_month = date_trunc('month', p_month)::date
      and t.pay_to_person_id is not null
      and s.person_id <> t.pay_to_person_id
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
  public.touch_transaction(), public.check_transaction_shares(),
  public.compute_shares(bigint, jsonb), public.validate_shares(uuid, jsonb, boolean),
  public.validate_transaction_refs(uuid, uuid, uuid, uuid, uuid),
  public.create_transaction(uuid, date, date, uuid, uuid, uuid, text, bigint, uuid, jsonb, integer, boolean),
  public.set_transaction_amount(uuid, bigint, jsonb, timestamptz),
  public.update_installments(uuid, text, jsonb),
  public.delete_transactions(uuid[], text),
  public.settlement(uuid, date)
from public, anon, authenticated;

grant execute on function
  public.create_transaction(uuid, date, date, uuid, uuid, uuid, text, bigint, uuid, jsonb, integer, boolean),
  public.set_transaction_amount(uuid, bigint, jsonb, timestamptz),
  public.update_installments(uuid, text, jsonb),
  public.delete_transactions(uuid[], text),
  public.settlement(uuid, date)
to authenticated;
