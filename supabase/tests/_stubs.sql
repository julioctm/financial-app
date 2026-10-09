-- Minimal stand-ins for Supabase's auth schema and roles, used ONLY by the local
-- test runner (scripts/test-db.mjs). Never run this against a real Supabase project.
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
-- Mirror Supabase's default privileges so the migrations' REVOKEs are exercised.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
