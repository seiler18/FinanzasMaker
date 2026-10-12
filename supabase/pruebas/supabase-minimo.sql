-- Lo mínimo de Supabase que las migraciones dan por hecho, sobre un Postgres
-- 17 cualquiera. Copia recortada de la de Seregenera (regenera-market).
--
-- Dos usos:
-- 1. `npm run test:base` lo aplica antes de las migraciones en un Postgres
--    desechable (tests/base.test.mjs).
-- 2. Es la lista exacta de lo que habría que darle a un Postgres propio (una
--    VPS, Neon…) para que las migraciones corran sin cambiar una línea.
--
-- Si una migración usa algo de Supabase que no está aquí, las pruebas fallan
-- al aplicarla: es la alarma de que el acoplamiento creció. Se agrega aquí,
-- imitando lo que hace Supabase.
--
-- Las funciones de `auth` leen el mismo ajuste que PostgREST escribe en cada
-- petición (`request.jwt.claims`): por eso una prueba entra «como» un usuario
-- igual que la página, con `set local role authenticated` más los claims.

-- ---------------------------------------------------------------------------
-- Roles. En Supabase existen antes de la primera migración.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- `bypassrls`: es la clave de servicio, la que se salta toda política.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to current_user;

-- Lo que Supabase concede de fábrica sobre `public` (visto en el proyecto
-- real con `pg_default_acl`): todo, a los tres roles. 0001 se lo quita a anon.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth: solo las columnas que leen las migraciones.
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              varchar(255),
  phone              text,
  raw_user_meta_data jsonb not null default '{}',
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt() ->> 'sub'
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  )::text;
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role()
  to anon, authenticated, service_role;
