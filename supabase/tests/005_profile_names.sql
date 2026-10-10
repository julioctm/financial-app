-- Profile names: signup metadata, first-name display and update_profile. Rolled back at the end.

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

select pg_temp.as_admin();
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@test.local', '{"first_name": "Ana", "last_name": "Souza Lima"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@test.local', '{"full_name": "Bruno Carlos Dias"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'carla@test.local', '{}');

-- 1. Signup metadata fills the profile
select pg_temp.check((select first_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ana', 'first_name from metadata');
select pg_temp.check((select last_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Souza Lima', 'last_name from metadata');
select pg_temp.check((select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ana Souza Lima', 'full_name kept in sync');
select pg_temp.check((select first_name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'Bruno', 'full_name is split at the first space');
select pg_temp.check((select last_name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'Carlos Dias', 'remaining words become last_name');
select pg_temp.check((select first_name from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003') is null, 'no metadata leaves names empty');

-- 2. Workspaces use the first name
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.ws', public.create_workspace('Casa')::text, true);
select pg_temp.check((select display_name from public.people where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ana', 'person shows the first name');

-- 3. Incomplete profile falls back to the e-mail prefix, then follows update_profile
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select set_config('t.ws3', public.create_workspace('Outra')::text, true);
select pg_temp.check((select display_name from public.people where user_id = 'cccccccc-0000-0000-0000-000000000003') = 'carla', 'fallback to e-mail prefix');
select public.update_profile('  Carla ', 'Mendes');
select pg_temp.check((select display_name from public.people where user_id = 'cccccccc-0000-0000-0000-000000000003') = 'Carla', 'default display name follows the profile');
select pg_temp.check((select full_name from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003') = 'Carla Mendes', 'full_name updated');

-- 4. Customized display names are not overwritten
select public.update_my_display_name(current_setting('t.ws3')::uuid, 'Carlinha');
select public.update_profile('Carolina', 'Mendes');
select pg_temp.check((select display_name from public.people where user_id = 'cccccccc-0000-0000-0000-000000000003') = 'Carlinha', 'custom name preserved');
select pg_temp.check((select first_name from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003') = 'Carolina', 'profile still updated');

-- 5. Validation and permissions
select pg_temp.throws($q$select public.update_profile('   ', 'x')$q$, 'first_name_required');
select pg_temp.throws($q$select public.update_profile(null, null)$q$, 'first_name_required');
select public.update_profile('Carolina', '');
select pg_temp.check((select last_name from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003') is null, 'empty last name is stored as null');
select pg_temp.throws($q$update public.profiles set first_name = 'Hack' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'permission denied');
select pg_temp.check((select count(*) from public.profiles) = 1, 'a user only sees their own profile');
select pg_temp.check((select first_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') is null, 'other profiles are invisible');

select pg_temp.as_admin();
select pg_temp.check((select first_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ana', 'other profile untouched');

reset role;
set local role anon;
select pg_temp.throws($q$select public.update_profile('X', 'Y')$q$, 'permission denied');

reset role;
rollback;

select 'ALL TESTS PASSED' as result;
