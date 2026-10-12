-- 0001 — Base: qué puede tocar un visitante sin sesión y quién puede crear cuenta.
--
-- El proyecto se creó SIN «Enable Automatic RLS», así que de fábrica nada
-- viene protegido: Supabase concede a `anon` (la clave pública, que va en la
-- página) todo sobre cada tabla, secuencia y función que se cree en `public`.
-- Esta migración da vuelta ese punto de partida antes de crear una sola tabla.
--
-- 1. `anon` no recibe nada en `public`. La página solo lee con sesión
--    (`authenticated`), y ahí mandan las políticas de cada tabla. Así, una
--    tabla nueva a la que se le olvide la política no queda abierta a internet:
--    queda cerrada para el visitante igual. Es la segunda puerta, la que no
--    depende de que nadie se acuerde de la primera.
-- 2. Ninguna función nueva es ejecutable por PUBLIC. Postgres concede
--    `execute` a PUBLIC sobre toda función, y `revoke … from anon` no lo
--    quita: anon lo hereda por PUBLIC. Cada migración concede lo que haga falta
--    a quien haga falta.
-- 3. RLS automático, lo mismo que hace la opción que no se marcó: toda tabla
--    que se cree en `public` sale con RLS activo. Si Supabase no deja crear el
--    disparador de eventos, la migración sigue (las pruebas de la base revisan
--    igual que toda tabla tenga RLS).
-- 4. Registro cerrado: solo los correos de `permitidos` pueden crear cuenta,
--    con cualquier método (Google, correo, teléfono, anónimo). Lo impone la
--    base, no un ajuste del panel que se pueda desmarcar sin querer.
--
-- Re-ejecutable: se puede pegar entera en el SQL Editor más de una vez.

-- ---------------------------------------------------------------------------
-- 1 y 2. Privilegios por defecto
--
-- En un `do` porque `anon` y `authenticated` son roles de Supabase: en el
-- Postgres desechable de las pruebas los crea `supabase-minimo.sql`, pero en
-- un Postgres pelado no existen y un `revoke` sobre un rol inexistente aborta.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;
  end if;

  alter default privileges in schema public revoke all on tables from anon;
  alter default privileges in schema public revoke all on sequences from anon;
  alter default privileges in schema public revoke all on functions from anon;
  -- La concesión a PUBLIC sobre funciones es global, no por esquema: solo se
  -- quita sin `in schema`.
  alter default privileges revoke execute on functions from public;

  revoke all on all tables in schema public from anon;
  revoke all on all sequences in schema public from anon;
  revoke all on all functions in schema public from anon;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RLS automático en toda tabla nueva de public
-- ---------------------------------------------------------------------------
create or replace function rls_automatico()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  _cmd record;
begin
  for _cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and schema_name = 'public'
      and object_type = 'table'
  loop
    execute format('alter table %s enable row level security', _cmd.object_identity);
  end loop;
end;
$$;

revoke execute on function rls_automatico() from public;

do $$
begin
  drop event trigger if exists rls_automatico;
  create event trigger rls_automatico on ddl_command_end
    when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    execute function rls_automatico();
exception when insufficient_privilege then
  raise notice 'Sin permiso para crear el disparador de eventos: cada tabla activa su RLS a mano (lo vigilan las pruebas).';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Registro cerrado
-- ---------------------------------------------------------------------------
create table if not exists permitidos (
  email  text primary key check (email = lower(email) and email like '%_@_%'),
  creado timestamptz not null default now()
);

-- Sin políticas, a propósito: nadie la lee ni la escribe por la API. Se
-- administra desde el SQL Editor o con la clave de servicio.
alter table permitidos enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on permitidos from anon, authenticated;
  end if;
end $$;

-- `security definer`: el que inserta en auth.users es el rol de Auth
-- (`supabase_auth_admin`), que no puede leer `permitidos`. La función corre
-- como su dueño, que sí.
create or replace function solo_permitidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or not exists (select 1 from permitidos where email = lower(new.email)) then
    raise exception 'registro-cerrado' using errcode = 'P0001',
      hint = 'Agrega el correo a la tabla permitidos antes de crear la cuenta.';
  end if;
  return new;
end;
$$;

revoke execute on function solo_permitidos() from public;

drop trigger if exists solo_permitidos on auth.users;
create trigger solo_permitidos
  before insert on auth.users
  for each row execute function solo_permitidos();

-- Rollback (en el papel):
--   drop trigger if exists solo_permitidos on auth.users;
--   drop function if exists solo_permitidos();
--   drop table if exists permitidos;
--   drop event trigger if exists rls_automatico;
--   drop function if exists rls_automatico();
--   (los privilegios por defecto se devuelven con los `grant` equivalentes)
