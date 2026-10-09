-- Spec 003-workspaces: RLS and RPC behaviour.
-- Run in the Supabase SQL editor (dev project). Everything is rolled back at the end.
-- Success = the final row says "ALL TESTS PASSED"; any failure aborts with a message.

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

-- Runs q and requires it to fail with an error containing `expected`.
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
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'member@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'outsider@test.local');

-- 1. Owner creates a workspace
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.ws', public.create_workspace('  Casa  ')::text, true);
select pg_temp.check((select name from public.workspaces) = 'Casa', 'workspace name is trimmed');
select pg_temp.check((select count(*) from public.workspace_members) = 1, 'owner is the only member');
select pg_temp.check((select role from public.workspace_members) = 'owner', 'creator is owner');
select pg_temp.check((select percent from public.workspace_split_defaults) = 100, 'owner starts with 100% split');
select pg_temp.check((select display_name from public.people) = 'owner', 'display name defaults to email prefix');

-- 2. Outsider sees nothing and cannot write
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from public.workspaces) = 0, 'outsider sees no workspaces');
select pg_temp.check((select count(*) from public.people) = 0, 'outsider sees no people');
select pg_temp.check((select count(*) from public.workspace_members) = 0, 'outsider sees no members');
select pg_temp.check((select count(*) from public.workspace_split_defaults) = 0, 'outsider sees no split');
select pg_temp.throws($q$insert into public.workspaces (name) values ('x')$q$, 'permission denied');
select pg_temp.throws($q$select public.create_invite(current_setting('t.ws')::uuid)$q$, 'forbidden');

-- 3. Invites
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.token', public.create_invite(current_setting('t.ws')::uuid), true);
select pg_temp.check((select count(*) from public.workspace_invites) = 1, 'owner sees invites');
select pg_temp.check(
  (select token_hash from public.workspace_invites) <> current_setting('t.token'),
  'raw token is not stored');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.workspace_invites) = 0, 'non-owner sees no invites');
select pg_temp.check((select status from public.get_invite_preview(current_setting('t.token'))) = 'valid', 'preview valid');
select pg_temp.check((select workspace_name from public.get_invite_preview(current_setting('t.token'))) = 'Casa', 'preview shows name');
select pg_temp.check((select status from public.get_invite_preview('nope')) = 'invalid', 'preview invalid');
select pg_temp.check((select workspace_name from public.get_invite_preview('nope')) is null, 'invalid preview leaks nothing');

-- 4. Accept invite
select pg_temp.check(public.accept_invite(current_setting('t.token')) = current_setting('t.ws')::uuid, 'accept returns workspace id');
select pg_temp.check((select count(*) from public.workspaces) = 1, 'member sees workspace');
select pg_temp.check((select count(*) from public.workspace_members) = 2, 'member sees both members');
select pg_temp.check((select count(*) from public.people) = 2, 'member sees both people');
select pg_temp.check((select sum(percent) from public.workspace_split_defaults) = 100, 'split still sums to 100');
select pg_temp.check((select percent from public.workspace_split_defaults where person_id = (select person_id from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002')) = 0, 'new member starts at 0%');
select pg_temp.check(public.accept_invite(current_setting('t.token')) = current_setting('t.ws')::uuid, 'already-member re-open is a no-op');

-- 5. Used / invalid / expired invites
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.throws($q$select public.accept_invite(current_setting('t.token'))$q$, 'invite_used');
select pg_temp.throws($q$select public.accept_invite('bogus')$q$, 'invite_invalid');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.token2', public.create_invite(current_setting('t.ws')::uuid), true);
select pg_temp.as_admin();
update public.workspace_invites set expires_at = now() - interval '1 minute'
where used_at is null;
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.throws($q$select public.accept_invite(current_setting('t.token2'))$q$, 'invite_expired');
select pg_temp.check((select count(*) from public.workspace_members) = 0, 'expired invite did not add member');

-- 6. Members cannot administer
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.throws($q$select public.create_invite(current_setting('t.ws')::uuid)$q$, 'forbidden');
select pg_temp.throws($q$select public.remove_member(current_setting('t.ws')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001')$q$, 'forbidden');
select pg_temp.throws($q$select public.set_split_defaults(current_setting('t.ws')::uuid, '[]'::jsonb)$q$, 'forbidden');
select pg_temp.throws(
  $q$insert into public.people (workspace_id, display_name) values (current_setting('t.ws')::uuid, 'Externo')$q$,
  'row-level security');
select pg_temp.throws($q$delete from public.workspace_members$q$, 'permission denied');
do $$
declare n integer;
begin
  update public.people set display_name = 'hacked' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'member cannot rename other people directly');
  update public.workspaces set name = 'hacked';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'member cannot rename workspace');
end $$;
select public.update_my_display_name(current_setting('t.ws')::uuid, ' Maria ');
select pg_temp.check((select display_name from public.people where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'Maria', 'member renames self via RPC');

-- 7. Owner manages split
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.p_owner', (select person_id::text from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), true);
select set_config('t.p_member', (select person_id::text from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), true);

select public.set_split_defaults(current_setting('t.ws')::uuid, json_build_array(
  json_build_object('person_id', current_setting('t.p_owner'), 'percent', 65),
  json_build_object('person_id', current_setting('t.p_member'), 'percent', 35))::jsonb);
select pg_temp.check((select percent from public.workspace_split_defaults where person_id = current_setting('t.p_owner')::uuid) = 65, 'split 65 saved');
select pg_temp.check((select percent from public.workspace_split_defaults where person_id = current_setting('t.p_member')::uuid) = 35, 'split 35 saved');

select pg_temp.throws(format($q$select public.set_split_defaults(%L::uuid, %L::jsonb)$q$, current_setting('t.ws'),
  json_build_array(
    json_build_object('person_id', current_setting('t.p_owner'), 'percent', 60),
    json_build_object('person_id', current_setting('t.p_member'), 'percent', 30))::text), 'split_sum_not_100');
select pg_temp.throws(format($q$select public.set_split_defaults(%L::uuid, %L::jsonb)$q$, current_setting('t.ws'),
  json_build_array(json_build_object('person_id', current_setting('t.p_owner'), 'percent', 100))::text), 'split_members_mismatch');
select pg_temp.throws(format($q$select public.set_split_defaults(%L::uuid, %L::jsonb)$q$, current_setting('t.ws'),
  json_build_array(
    json_build_object('person_id', current_setting('t.p_owner'), 'percent', 66.666),
    json_build_object('person_id', current_setting('t.p_member'), 'percent', 33.334))::text), 'split_invalid_percent');
select pg_temp.check((select percent from public.workspace_split_defaults where person_id = current_setting('t.p_owner')::uuid) = 65, 'failed saves leave split untouched');

-- 8. External people
insert into public.people (workspace_id, display_name) values (current_setting('t.ws')::uuid, 'Vó');
select pg_temp.check((select count(*) from public.people where user_id is null) = 1, 'owner adds external person');
select pg_temp.throws(format($q$select public.set_split_defaults(%L::uuid, %L::jsonb)$q$, current_setting('t.ws'),
  json_build_array(
    json_build_object('person_id', current_setting('t.p_owner'), 'percent', 50),
    json_build_object('person_id', current_setting('t.p_member'), 'percent', 25),
    json_build_object('person_id', (select id::text from public.people where user_id is null), 'percent', 25))::text),
  'split_members_mismatch');
select pg_temp.throws($q$insert into public.people (workspace_id, display_name, user_id) values (current_setting('t.ws')::uuid, 'Fake', 'cccccccc-0000-0000-0000-000000000003')$q$, 'permission denied');

-- Soft-removing an external person: owner can, members cannot
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
do $$
declare n integer;
begin
  update public.people set is_active = false where user_id is null;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'member cannot deactivate external people');
end $$;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
update public.people set is_active = false where user_id is null;
select pg_temp.check((select count(*) from public.people where user_id is null and is_active) = 0, 'owner deactivates external person');
select pg_temp.check((select count(*) from public.people where user_id is null) = 1, 'external person row is kept');

-- 9. Removing members
select pg_temp.throws($q$select public.remove_member(current_setting('t.ws')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001')$q$, 'last_owner');
select public.remove_member(current_setting('t.ws')::uuid, 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.workspace_members) = 1, 'member removed');
select pg_temp.check((select is_active from public.people where id = current_setting('t.p_member')::uuid) = false, 'person kept but inactive');
select pg_temp.check((select percent from public.workspace_split_defaults) = 100 and (select count(*) from public.workspace_split_defaults) = 1, 'split renormalized to remaining members');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.workspaces) = 0, 'removed member loses access');
select pg_temp.check((select count(*) from public.people) = 0, 'removed member sees no people');

-- 10. Re-inviting a removed member reuses the same person
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('t.token3', public.create_invite(current_setting('t.ws')::uuid), true);
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select public.accept_invite(current_setting('t.token3'));
select pg_temp.check((select person_id from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = current_setting('t.p_member')::uuid, 'same person reused');
select pg_temp.check((select is_active from public.people where id = current_setting('t.p_member')::uuid), 'person reactivated');
select pg_temp.check((select sum(percent) from public.workspace_split_defaults) = 100, 'split sums to 100 after rejoin');

-- 11. Anonymous users have no access at all
reset role;
set local role anon;
select pg_temp.throws($q$select count(*) from public.workspaces$q$, 'permission denied');
select pg_temp.throws($q$select public.create_workspace('x')$q$, 'permission denied');

reset role;
rollback;

select 'ALL TESTS PASSED' as result;
