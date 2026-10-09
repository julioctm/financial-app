-- Spec 003-workspaces: workspaces, people, members, invites and default split.
--
-- Authorization model: every data table carries workspace_id and is readable by
-- members of that workspace (is_workspace_member). Writes that must keep
-- invariants (membership, invites, split) go through security definer functions.

create type public.workspace_role as enum ('owner', 'member');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  user_id uuid references auth.users (id) on delete set null, -- null = external person
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index people_workspace_user_key
  on public.people (workspace_id, user_id) where user_id is not null;
create index people_workspace_idx on public.people (workspace_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (person_id, workspace_id) references public.people (id, workspace_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index workspace_invites_workspace_idx on public.workspace_invites (workspace_id);

create table public.workspace_split_defaults (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  person_id uuid not null,
  percent numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  primary key (workspace_id, person_id),
  foreign key (person_id, workspace_id) references public.people (id, workspace_id)
);

-- ---------------------------------------------------------------------------
-- Authorization helpers (security definer avoids RLS recursion)
-- ---------------------------------------------------------------------------

create function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create function public.is_workspace_owner(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.people enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_split_defaults enable row level security;

create policy workspaces_select on public.workspaces
  for select using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces
  for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));

create policy people_select on public.people
  for select using (public.is_workspace_member(workspace_id));
-- Owners add external people (no login). Member people are created by the RPCs below.
create policy people_insert on public.people
  for insert with check (user_id is null and public.is_workspace_owner(workspace_id));
create policy people_update on public.people
  for update using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

create policy members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

create policy invites_select on public.workspace_invites
  for select using (public.is_workspace_owner(workspace_id));

create policy split_defaults_select on public.workspace_split_defaults
  for select using (public.is_workspace_member(workspace_id));

-- Table privileges: read-only by default, writes only where a policy allows it.
revoke all on public.workspaces, public.people, public.workspace_members,
  public.workspace_invites, public.workspace_split_defaults from anon, authenticated;
grant select on public.workspaces, public.people, public.workspace_members,
  public.workspace_invites, public.workspace_split_defaults to authenticated;
grant update (name) on public.workspaces to authenticated;
grant insert (workspace_id, display_name) on public.people to authenticated;
grant update (display_name, is_active) on public.people to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the API)
-- ---------------------------------------------------------------------------

create function public.default_display_name(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(btrim(p.full_name), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Membro'
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = uid;
$$;

-- Rescales the default split so it sums to exactly 100 (used when membership changes).
create function public.normalize_split(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  total numeric;
  n integer;
  diff numeric;
begin
  select coalesce(sum(percent), 0), count(*) into total, n
  from public.workspace_split_defaults where workspace_id = ws;

  if n = 0 or total = 100 then
    return;
  end if;

  if total = 0 then
    update public.workspace_split_defaults
    set percent = trunc(100.0 / n, 2) where workspace_id = ws;
  else
    update public.workspace_split_defaults
    set percent = round(percent * 100 / total, 2) where workspace_id = ws;
  end if;

  select 100 - sum(percent) into diff
  from public.workspace_split_defaults where workspace_id = ws;

  update public.workspace_split_defaults
  set percent = percent + diff
  where workspace_id = ws
    and person_id = (
      select person_id from public.workspace_split_defaults
      where workspace_id = ws order by percent desc, person_id limit 1
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ws uuid;
  pid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.workspaces (name, created_by) values (btrim(p_name), uid)
  returning id into ws;

  insert into public.people (workspace_id, display_name, user_id)
  values (ws, public.default_display_name(uid), uid)
  returning id into pid;

  insert into public.workspace_members (workspace_id, user_id, person_id, role)
  values (ws, uid, pid, 'owner');

  insert into public.workspace_split_defaults (workspace_id, person_id, percent)
  values (ws, pid, 100);

  return ws;
end;
$$;

-- Returns the raw token once; only its hash is stored.
create function public.create_invite(p_workspace uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_workspace_owner(p_workspace) then
    raise exception 'forbidden';
  end if;

  insert into public.workspace_invites (workspace_id, token_hash, invited_by)
  values (p_workspace, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());

  return token;
end;
$$;

create function public.get_invite_preview(p_token text)
returns table (status text, workspace_name text, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.workspace_invites;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.workspace_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    return query select 'invalid'::text, null::text, false;
    return;
  end if;

  return query
  select
    case
      when exists (select 1 from public.workspace_members m
                   where m.workspace_id = inv.workspace_id and m.user_id = auth.uid()) then 'valid'
      when inv.used_at is not null then 'used'
      when inv.expires_at < now() then 'expired'
      else 'valid'
    end,
    (select w.name from public.workspaces w where w.id = inv.workspace_id),
    exists (select 1 from public.workspace_members m
            where m.workspace_id = inv.workspace_id and m.user_id = auth.uid());
end;
$$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.workspace_invites;
  pid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Row lock makes concurrent acceptance of the same invite safe.
  select * into inv from public.workspace_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'invite_invalid';
  end if;

  if exists (select 1 from public.workspace_members
             where workspace_id = inv.workspace_id and user_id = uid) then
    return inv.workspace_id;
  end if;

  if inv.used_at is not null then
    raise exception 'invite_used';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  -- Reuse the person of a previously removed member so history stays linked.
  select id into pid from public.people
  where workspace_id = inv.workspace_id and user_id = uid;

  if pid is null then
    insert into public.people (workspace_id, display_name, user_id)
    values (inv.workspace_id, public.default_display_name(uid), uid)
    returning id into pid;
  else
    update public.people set is_active = true where id = pid;
  end if;

  insert into public.workspace_members (workspace_id, user_id, person_id, role)
  values (inv.workspace_id, uid, pid, 'member');

  -- New members start at 0% so the existing default split keeps summing to 100.
  insert into public.workspace_split_defaults (workspace_id, person_id, percent)
  values (inv.workspace_id, pid, 0)
  on conflict do nothing;

  update public.workspace_invites set used_at = now(), used_by = uid where id = inv.id;

  return inv.workspace_id;
end;
$$;

create function public.remove_member(p_workspace uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.workspace_members;
begin
  if not public.is_workspace_owner(p_workspace) then
    raise exception 'forbidden';
  end if;

  select * into target from public.workspace_members
  where workspace_id = p_workspace and user_id = p_user for update;
  if not found then
    raise exception 'not_a_member';
  end if;

  if target.role = 'owner' and
     (select count(*) from public.workspace_members
      where workspace_id = p_workspace and role = 'owner') <= 1 then
    raise exception 'last_owner';
  end if;

  delete from public.workspace_members
  where workspace_id = p_workspace and user_id = p_user;

  -- The person (and history) stays, only access is revoked.
  update public.people set is_active = false where id = target.person_id;

  delete from public.workspace_split_defaults
  where workspace_id = p_workspace and person_id = target.person_id;

  perform public.normalize_split(p_workspace);
end;
$$;

-- p_items: [{"person_id": "<uuid>", "percent": 65}, ...] covering every member.
create function public.set_split_defaults(p_workspace uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n_items integer;
  n_members integer;
  n_valid integer;
  total numeric;
begin
  if not public.is_workspace_owner(p_workspace) then
    raise exception 'forbidden';
  end if;

  drop table if exists pg_temp.split_items;
  create temporary table pg_temp.split_items on commit drop as
  select x.person_id, x.percent
  from jsonb_to_recordset(p_items) as x (person_id uuid, percent numeric);

  select count(*), count(distinct person_id), coalesce(sum(percent), 0)
  into n_items, n_valid, total from pg_temp.split_items;

  select count(*) into n_members from public.workspace_members where workspace_id = p_workspace;

  if n_items <> n_valid or n_items <> n_members then
    raise exception 'split_members_mismatch';
  end if;

  if exists (
    select 1 from pg_temp.split_items i
    where i.percent is null or i.percent < 0 or i.percent > 100 or round(i.percent, 2) <> i.percent
  ) then
    raise exception 'split_invalid_percent';
  end if;

  if exists (
    select 1 from pg_temp.split_items i
    where not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace and m.person_id = i.person_id
    )
  ) then
    raise exception 'split_members_mismatch';
  end if;

  if total <> 100 then
    raise exception 'split_sum_not_100';
  end if;

  delete from public.workspace_split_defaults where workspace_id = p_workspace;
  insert into public.workspace_split_defaults (workspace_id, person_id, percent)
  select p_workspace, person_id, percent from pg_temp.split_items;
end;
$$;

create function public.update_my_display_name(p_workspace uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_workspace_member(p_workspace) then
    raise exception 'forbidden';
  end if;
  update public.people set display_name = btrim(p_name)
  where workspace_id = p_workspace and user_id = auth.uid();
end;
$$;

-- Functions are executable by PUBLIC by default; lock them down explicitly.
revoke execute on function
  public.is_workspace_member(uuid), public.is_workspace_owner(uuid),
  public.default_display_name(uuid), public.normalize_split(uuid),
  public.create_workspace(text), public.create_invite(uuid),
  public.get_invite_preview(text), public.accept_invite(text),
  public.remove_member(uuid, uuid), public.set_split_defaults(uuid, jsonb),
  public.update_my_display_name(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.is_workspace_member(uuid), public.is_workspace_owner(uuid),
  public.create_workspace(text), public.create_invite(uuid),
  public.get_invite_preview(text), public.accept_invite(text),
  public.remove_member(uuid, uuid), public.set_split_defaults(uuid, jsonb),
  public.update_my_display_name(uuid, text)
to authenticated;
