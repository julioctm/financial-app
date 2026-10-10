-- Profile names: first_name / last_name. full_name is kept in sync for convenience.

alter table public.profiles
  add column first_name text check (char_length(btrim(first_name)) between 1 and 40),
  add column last_name text check (char_length(btrim(last_name)) between 1 and 60);

-- Backfill from any existing full_name ("Maria da Silva" -> Maria / da Silva).
update public.profiles
set first_name = nullif(split_part(btrim(full_name), ' ', 1), ''),
    last_name = nullif(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
where full_name is not null and btrim(full_name) <> '';

-- New users: take names from signup metadata (first_name/last_name), or split
-- full_name/name (e.g. coming from a social provider) at the first space.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  whole text := btrim(coalesce(meta ->> 'full_name', meta ->> 'name', ''));
  f text;
  l text;
begin
  f := nullif(btrim(coalesce(meta ->> 'first_name', split_part(whole, ' ', 1))), '');
  l := nullif(btrim(coalesce(meta ->> 'last_name',
         substr(whole, length(split_part(whole, ' ', 1)) + 1))), '');
  insert into public.profiles (id, first_name, last_name, full_name)
  values (new.id, f, l, nullif(btrim(coalesce(f, '') || ' ' || coalesce(l, '')), ''));
  return new;
end;
$$;

-- People show the first name (falls back to the e-mail prefix for incomplete profiles).
create or replace function public.default_display_name(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(btrim(p.first_name), ''),
    nullif(btrim(split_part(coalesce(p.full_name, ''), ' ', 1)), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Membro'
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = uid;
$$;

-- Profiles are written only through this function.
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Saves the caller's names. People whose display name still equals the previous
-- default (e-mail prefix or old first name) follow the new first name; names the
-- user customized per workspace are left alone.
create function public.update_profile(p_first_name text, p_last_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  f text := btrim(coalesce(p_first_name, ''));
  l text := nullif(btrim(coalesce(p_last_name, '')), '');
  old_default text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if f = '' or char_length(f) > 40 then
    raise exception 'first_name_required';
  end if;
  if l is not null and char_length(l) > 60 then
    raise exception 'last_name_invalid';
  end if;

  old_default := public.default_display_name(uid);

  update public.profiles
  set first_name = f, last_name = l, full_name = btrim(f || ' ' || coalesce(l, ''))
  where id = uid;

  update public.people set display_name = f
  where user_id = uid and display_name = old_default;
end;
$$;

revoke execute on function public.update_profile(text, text) from public, anon, authenticated;
grant execute on function public.update_profile(text, text) to authenticated;
