-- 0004 — Finanzas: las hojas de la planilla, como tablas.
--
-- Una tabla por hoja de backend/Code.gs (HOJAS), con las mismas columnas y los
-- mismos nombres, para que la importación y el código que ya existe calcen sin
-- traducir. Lo que cambia:
--
-- - Cada fila tiene `usuario`. Hoy hay un solo dueño, pero la RLS por usuario
--   cuesta lo mismo y deja la base lista para varios.
-- - Las fechas siguen siendo texto 'AAAA-MM-DD HH:MM' en hora de Chile, como
--   en la hoja: src/lib/analisis.js compara y corta esos textos, y pasarlas a
--   timestamptz obligaría a convertir en cada lado sin ganar nada. El CHECK
--   impide que entre otra forma.
-- - Lo que en la hoja era «vacío o número» (cuotas, monto_original) es un
--   número que admite null; la página recibe '' igual que antes.
-- - `revisar` gana dos columnas: la página ya no puede mandar un correo a la
--   papelera (eso es Gmail, y Gmail lo toca solo el trabajador de Apps Script),
--   así que marca `borrar_correo` y el trabajador lo hace en su próxima pasada.
--
-- Quién escribe qué:
-- - El trabajador de Apps Script escribe con la clave de servicio (se salta la
--   RLS) y pone `usuario` explícito.
-- - La página escribe con la sesión del dueño; las políticas y los privilegios
--   por columna dicen hasta dónde.
--
-- Re-ejecutable.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists movimientos (
  id             text primary key default ('M' || substr(md5(gen_random_uuid()::text), 1, 10))
                 check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  usuario        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha          text not null check (fecha ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'),
  banco          text not null default '' check (char_length(banco) <= 80),
  producto       text not null default 'Cuenta' check (char_length(producto) <= 80),
  tipo           text not null check (tipo in ('gasto', 'ingreso', 'interna', 'inversion', 'rescate', 'pago_tarjeta')),
  monto          bigint not null check (monto >= 0 and monto <= 10000000000),
  moneda         text not null default 'CLP' check (char_length(moneda) <= 10),
  monto_original numeric,
  contraparte    text not null default '' check (char_length(contraparte) <= 200),
  categoria      text not null default '' check (char_length(categoria) <= 80),
  cuotas         smallint check (cuotas between 0 and 99),
  detalle        text not null default '' check (char_length(detalle) <= 500),
  nota           text not null default '' check (char_length(nota) <= 500),
  origen         text not null default 'manual' check (origen in ('correo', 'manual', 'notificacion', 'cartola')),
  gmail_id       text not null default '' check (char_length(gmail_id) <= 40),
  registrado     text not null default '' check (char_length(registrado) <= 20),
  -- Si está, el movimiento cuenta en ESE día para los totales (hito 0007).
  fecha_contable text not null default '' check (fecha_contable = '' or fecha_contable ~ '^\d{4}-\d{2}-\d{2}$')
);
create index if not exists movimientos_usuario_fecha on movimientos (usuario, fecha desc);
alter table movimientos enable row level security;

create table if not exists inversiones (
  id          text primary key default ('I' || substr(md5(gen_random_uuid()::text), 1, 10))
              check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  usuario     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha       text not null check (fecha ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'),
  plataforma  text not null default '' check (char_length(plataforma) <= 80),
  operacion   text not null default '' check (char_length(operacion) <= 40),
  instrumento text not null default '' check (char_length(instrumento) <= 200),
  monto       numeric not null default 0,
  moneda      text not null default 'CLP' check (char_length(moneda) <= 10),
  detalle     text not null default '' check (char_length(detalle) <= 500),
  gmail_id    text not null default '' check (char_length(gmail_id) <= 40),
  registrado  text not null default '' check (char_length(registrado) <= 20)
);
create index if not exists inversiones_usuario_fecha on inversiones (usuario, fecha desc);
alter table inversiones enable row level security;

create table if not exists revisar (
  usuario        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gmail_id       text not null check (char_length(gmail_id) between 1 and 40),
  fecha          text not null default '' check (char_length(fecha) <= 20),
  remitente      text not null default '' check (char_length(remitente) <= 200),
  asunto         text not null default '' check (char_length(asunto) <= 500),
  motivo         text not null default '' check (char_length(motivo) <= 300),
  tipo           text not null default '' check (char_length(tipo) <= 20),
  monto          numeric,
  contraparte    text not null default '' check (char_length(contraparte) <= 200),
  banco          text not null default '' check (char_length(banco) <= 80),
  extracto       text not null default '' check (char_length(extracto) <= 1000),
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'registrado', 'descartado')),
  borrar_correo  boolean not null default false,
  correo_borrado boolean not null default false,
  primary key (usuario, gmail_id)
);
alter table revisar enable row level security;

-- Bitácora de cada correo procesado: el respaldo cuando el correo ya se borró,
-- y lo que evita procesar dos veces el mismo.
create table if not exists correos (
  usuario    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gmail_id   text not null check (char_length(gmail_id) between 1 and 40),
  fecha      text not null default '' check (char_length(fecha) <= 20),
  remitente  text not null default '' check (char_length(remitente) <= 200),
  asunto     text not null default '' check (char_length(asunto) <= 500),
  resultado  text not null default '' check (char_length(resultado) <= 20),
  lector     text not null default '' check (char_length(lector) <= 60),
  referencia text not null default '' check (char_length(referencia) <= 40),
  procesado  text not null default '' check (char_length(procesado) <= 20),
  primary key (usuario, gmail_id)
);
alter table correos enable row level security;

-- `id` guarda el orden: la primera regla que calza gana (categorizar_).
create table if not exists reglas (
  id        bigint generated always as identity primary key,
  usuario   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patron    text not null check (char_length(patron) between 1 and 200),
  categoria text not null default '' check (char_length(categoria) <= 80),
  tipo      text not null default '' check (tipo in ('', 'gasto', 'ingreso', 'interna', 'inversion', 'rescate', 'pago_tarjeta'))
);
create index if not exists reglas_usuario on reglas (usuario, id);
alter table reglas enable row level security;

create table if not exists presupuestos (
  usuario       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria     text not null check (char_length(categoria) between 1 and 80),
  monto_mensual bigint not null check (monto_mensual >= 0),
  primary key (usuario, categoria)
);
alter table presupuestos enable row level security;

create table if not exists config (
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  clave   text not null check (clave ~ '^[a-z_]{1,40}$'),
  valor   text not null default '' check (char_length(valor) <= 500),
  primary key (usuario, clave)
);
alter table config enable row level security;

-- Lo que antes eran propiedades del script y la página leía con `estado`:
-- cuándo terminó la última pasada y si hay una importación a medias.
create table if not exists estado_trabajador (
  usuario         uuid primary key references auth.users (id) on delete cascade,
  ultima          timestamptz,
  importando      boolean not null default false,
  resumen         jsonb not null default '{}',
  ultima_acciones timestamptz
);
alter table estado_trabajador enable row level security;

-- ---------------------------------------------------------------------------
-- Políticas: cada uno, lo suyo. Una sola política «del dueño» por tabla; lo
-- que puede hacer en cada una lo limitan los privilegios de abajo.
-- ---------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array['movimientos', 'inversiones', 'revisar', 'correos', 'reglas', 'presupuestos', 'config', 'estado_trabajador'] loop
    execute format('drop policy if exists %I on %I', _t || '_del_dueno', _t);
    execute format(
      'create policy %I on %I for all to authenticated using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()))',
      _t || '_del_dueno', _t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privilegios de la página (authenticated). anon no tiene nada (0001).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;
  revoke all on movimientos, inversiones, revisar, correos, reglas, presupuestos, config, estado_trabajador
    from anon, authenticated;

  -- Lo que la página crea, corrige y borra.
  grant select, insert, update, delete on movimientos, reglas, presupuestos, config to authenticated;
  grant select, update, delete on inversiones to authenticated;

  -- Lo que escribe el trabajador; la página solo decide y anota.
  grant select on revisar, correos, estado_trabajador to authenticated;
  grant update (estado, borrar_correo) on revisar to authenticated;
  grant update (resultado, referencia) on correos to authenticated;

  grant usage on sequence reglas_id_seq to authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- Decidir un «Por revisar», todo o nada: el movimiento, el estado y la
-- bitácora cambian juntos o no cambia ninguno. Antes lo hacía la acción
-- `revisar` de Code.gs.
--
-- `security invoker`: corre con la sesión de quien llama, así que la RLS y
-- los privilegios de arriba valen igual que si la página escribiera tabla por
-- tabla. El movimiento llega ya validado y categorizado desde la página
-- (src/lib/datos.js); aquí solo se guarda.
-- ---------------------------------------------------------------------------
create or replace function decidir_revisar(
  _gmail_id text,
  _decision text,
  _mov      jsonb default null,
  _borrar   boolean default false
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  _uid    uuid := auth.uid();
  _id     text := '';
  _borrar_registrado boolean;
begin
  if _uid is null then
    raise exception 'sin-sesion' using errcode = '28000';
  end if;
  perform 1 from revisar
   where usuario = _uid and gmail_id = _gmail_id and estado = 'pendiente'
   for update;
  if not found then
    raise exception 'ya-no-pendiente' using errcode = 'P0001';
  end if;

  if _decision = 'registrar' then
    if _mov is null then
      raise exception 'falta-movimiento' using errcode = '22023';
    end if;
    insert into movimientos (usuario, fecha, banco, producto, tipo, monto, contraparte, categoria, detalle, nota,
                             fecha_contable, origen, gmail_id, registrado)
    values (_uid, _mov->>'fecha', coalesce(_mov->>'banco', ''), coalesce(_mov->>'producto', 'Cuenta'), _mov->>'tipo',
            (_mov->>'monto')::bigint, coalesce(_mov->>'contraparte', ''), coalesce(_mov->>'categoria', ''),
            coalesce(_mov->>'detalle', ''), coalesce(_mov->>'nota', ''), coalesce(_mov->>'fecha_contable', ''),
            'correo', _gmail_id, coalesce(_mov->>'registrado', ''))
    returning id into _id;
    -- Registrar trata el correo como cualquiera leído: va a la papelera si
    -- Config → borrar_correos = si (lo de fábrica).
    select coalesce((select lower(valor) = 'si' from config where usuario = _uid and clave = 'borrar_correos'), true)
      into _borrar_registrado;
    update revisar set estado = 'registrado', borrar_correo = _borrar_registrado
     where usuario = _uid and gmail_id = _gmail_id;
  elsif _decision = 'descartar' then
    update revisar set estado = 'descartado', borrar_correo = coalesce(_borrar, false)
     where usuario = _uid and gmail_id = _gmail_id;
  else
    raise exception 'decision-invalida' using errcode = '22023';
  end if;

  update correos set resultado = case when _decision = 'registrar' then 'registrado' else 'descartado' end, referencia = _id
   where usuario = _uid and gmail_id = _gmail_id;
  return _id;
end;
$$;

revoke execute on function decidir_revisar(text, text, jsonb, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function decidir_revisar(text, text, jsonb, boolean) from anon;
    grant execute on function decidir_revisar(text, text, jsonb, boolean) to authenticated;
  end if;
end $$;

-- Rollback (en el papel):
--   drop function if exists decidir_revisar(text, text, jsonb, boolean);
--   drop table if exists estado_trabajador, config, presupuestos, reglas, correos, revisar, inversiones, movimientos;
