-- 0002 — Notificaciones del celular: el canal que no depende del correo.
--
-- MacroDroid (y más adelante una app propia) manda cada notificación de las
-- apps de los bancos a la función `notificacion` (supabase/functions/), que
-- llama a `registrar_notificacion()` con la clave de servicio. Aquí se guardan
-- tal cual llegan, «crudas»: primero se junta una semana de notificaciones
-- reales (el relevamiento) y recién después se escriben los lectores que las
-- convierten en movimientos. Es el mismo camino que se hizo con los correos.
--
-- Un celular se identifica con una clave larga al azar que vive en él. La base
-- guarda solo su SHA-256: quien leyera la tabla no podría hacerse pasar por el
-- celular, y la clave en claro se muestra una sola vez, al crearla.
--
-- Re-ejecutable.

-- ---------------------------------------------------------------------------
-- Dispositivos
-- ---------------------------------------------------------------------------
create table if not exists dispositivos (
  id         uuid primary key default gen_random_uuid(),
  usuario    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 60),
  clave_hash text not null unique check (clave_hash ~ '^[0-9a-f]{64}$'),
  creado     timestamptz not null default now(),
  ultimo_uso timestamptz,
  revocado   timestamptz
);
create index if not exists dispositivos_usuario on dispositivos (usuario);
alter table dispositivos enable row level security;

-- El dueño ve y revoca sus dispositivos, pero no lee el hash (no le sirve a
-- la página y es lo único que identifica al celular) ni puede crear uno con
-- un hash elegido por él: eso pasa solo por `crear_dispositivo()`.
drop policy if exists dispositivos_ver on dispositivos;
create policy dispositivos_ver on dispositivos
  for select to authenticated using (usuario = (select auth.uid()));
drop policy if exists dispositivos_cambiar on dispositivos;
create policy dispositivos_cambiar on dispositivos
  for update to authenticated using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));
drop policy if exists dispositivos_borrar on dispositivos;
create policy dispositivos_borrar on dispositivos
  for delete to authenticated using (usuario = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on dispositivos from anon, authenticated;
    grant select (id, usuario, nombre, creado, ultimo_uso, revocado) on dispositivos to authenticated;
    grant update (nombre, revocado) on dispositivos to authenticated;
    grant delete on dispositivos to authenticated;
  end if;
end $$;

-- Devuelve la clave en claro, la única vez que existe fuera del celular.
-- `gen_random_uuid()` sale del generador fuerte de Postgres; dos seguidos dan
-- 244 bits al azar, sin depender de pgcrypto.
create or replace function crear_dispositivo(_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _clave text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if _uid is null then
    raise exception 'sin-sesion' using errcode = '28000';
  end if;
  if (select count(*) from dispositivos where usuario = _uid and revocado is null) >= 5 then
    raise exception 'demasiados-dispositivos' using errcode = 'P0001';
  end if;
  insert into dispositivos (usuario, nombre, clave_hash)
  values (_uid, left(btrim(coalesce(_nombre, '')), 60), encode(sha256(convert_to(_clave, 'UTF8')), 'hex'));
  return _clave;
end;
$$;

revoke execute on function crear_dispositivo(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function crear_dispositivo(text) from anon;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------------
create table if not exists notificaciones (
  id          bigint generated always as identity primary key,
  usuario     uuid not null references auth.users (id) on delete cascade,
  dispositivo uuid references dispositivos (id) on delete set null,
  paquete     text not null check (char_length(paquete) between 1 and 120),
  titulo      text not null default '' check (char_length(titulo) <= 500),
  texto       text not null default '' check (char_length(texto) <= 4000),
  texto_largo text not null default '' check (char_length(texto_largo) <= 4000),
  recibida    timestamptz not null default now(),
  -- Contenido + minuto. MacroDroid a veces dispara dos veces por la misma
  -- notificación (la app la actualiza); la segunda choca con la huella y no
  -- entra. Dos compras idénticas en el mismo minuto se juntarían en una: se
  -- acepta, y la cartola del mes lo corrige.
  huella      text not null check (huella ~ '^[0-9a-f]{64}$'),
  estado      text not null default 'cruda'
              check (estado in ('cruda', 'registrada', 'ignorada', 'revisar')),
  unique (usuario, huella)
);
create index if not exists notificaciones_usuario_recibida on notificaciones (usuario, recibida desc);
alter table notificaciones enable row level security;

drop policy if exists notificaciones_ver on notificaciones;
create policy notificaciones_ver on notificaciones
  for select to authenticated using (usuario = (select auth.uid()));
drop policy if exists notificaciones_cambiar on notificaciones;
create policy notificaciones_cambiar on notificaciones
  for update to authenticated using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));
drop policy if exists notificaciones_borrar on notificaciones;
create policy notificaciones_borrar on notificaciones
  for delete to authenticated using (usuario = (select auth.uid()));

-- Nadie inserta por la API, ni siquiera el dueño: una notificación entra solo
-- por `registrar_notificacion()`, que sabe de qué celular viene.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on notificaciones from anon, authenticated;
    grant select, delete on notificaciones to authenticated;
    grant update (estado) on notificaciones to authenticated;
  end if;
end $$;

-- La llama solo la función `notificacion` con la clave de servicio. Devuelve
-- 'nueva' o 'repetida'; los errores llevan un mensaje fijo que la función
-- traduce a un código HTTP (clave-invalida → 401, demasiadas → 429).
create or replace function registrar_notificacion(
  _clave       text,
  _paquete     text,
  _titulo      text default '',
  _texto       text default '',
  _texto_largo text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _disp    dispositivos;
  _paquete_limpio text := left(btrim(coalesce(_paquete, '')), 120);
  _filas   int;
begin
  select * into _disp from dispositivos
   where clave_hash = encode(sha256(convert_to(coalesce(_clave, ''), 'UTF8')), 'hex')
     and revocado is null;
  if not found then
    raise exception 'clave-invalida' using errcode = '28000';
  end if;
  if _paquete_limpio = '' then
    raise exception 'paquete-vacio' using errcode = '22023';
  end if;
  -- Tope por celular: una macro mal armada (o una clave robada) no llena la
  -- base. Ninguna persona recibe 60 avisos del banco en un minuto.
  if (select count(*) from notificaciones
       where dispositivo = _disp.id and recibida > now() - interval '1 minute') >= 60 then
    raise exception 'demasiadas' using errcode = 'P0001';
  end if;

  insert into notificaciones (usuario, dispositivo, paquete, titulo, texto, texto_largo, huella)
  values (
    _disp.usuario, _disp.id, _paquete_limpio,
    left(coalesce(_titulo, ''), 500), left(coalesce(_texto, ''), 4000), left(coalesce(_texto_largo, ''), 4000),
    encode(sha256(convert_to(concat_ws(E'\x1f', _paquete_limpio, _titulo, _texto,
      extract(epoch from date_trunc('minute', now()))::bigint::text), 'UTF8')), 'hex')
  )
  on conflict (usuario, huella) do nothing;
  get diagnostics _filas = row_count;

  update dispositivos set ultimo_uso = now() where id = _disp.id;
  return case when _filas = 1 then 'nueva' else 'repetida' end;
end;
$$;

revoke execute on function registrar_notificacion(text, text, text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function registrar_notificacion(text, text, text, text, text) from anon, authenticated;
    grant execute on function registrar_notificacion(text, text, text, text, text) to service_role;
  end if;
end $$;

-- Rollback (en el papel):
--   drop function if exists registrar_notificacion(text, text, text, text, text);
--   drop table if exists notificaciones;
--   drop function if exists crear_dispositivo(text);
--   drop table if exists dispositivos;
