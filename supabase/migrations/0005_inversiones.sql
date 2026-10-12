-- 0005 — Inversiones: lo que era gestor-acciones (la hoja «Fintual - Monitoreo
-- en vivo»), como tablas.
--
-- La regla que se trae de allá: la base entrega HECHOS (operaciones, precios,
-- alertas) y la página calcula posiciones y resultados con
-- src/inversiones/lib/cartera.js. No hay hojas derivadas (Posiciones,
-- Resultados, Dashboard): eran cálculos.
--
-- - `acciones_operaciones`: una fila por correo de Fintual (compra, venta,
--   dividendo, compra o venta de dólares). Los tipos ya vienen con los nombres
--   del contrato de gestor-acciones (docs/contrato.md de ese repo), no con los
--   de la hoja («Compra acción» → compra), así la página no traduce.
-- - `acciones_precios` y `acciones_mapa` son de todos: el precio de VOO o el
--   ticker de «Vanguard S&P 500 ETF» no son datos de nadie. Los lee cualquiera
--   con sesión y los escribe solo el trabajador.
-- - `acciones_alertas`: lo que antes era la hoja Alertas.
-- - Los umbrales y el correo de alertas van en `config` (0004).
--
-- Re-ejecutable.

create table if not exists acciones_operaciones (
  id           bigint generated always as identity primary key,
  usuario      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha        date not null,
  tipo         text not null check (tipo in ('compra', 'venta', 'dividendo', 'compraUsd', 'ventaUsd')),
  activo       text not null default '' check (char_length(activo) <= 200),
  ticker       text not null default '' check (char_length(ticker) <= 20),
  cantidad     numeric,
  usd          numeric,
  clp          numeric,
  tipo_cambio  numeric,
  comision_clp numeric,
  fuente       text not null default 'Correo Gmail' check (char_length(fuente) <= 40),
  -- Un correo entra una vez. Lo cargado a mano no tiene correo (null no choca).
  gmail_id     text check (char_length(gmail_id) <= 40),
  unique (usuario, gmail_id)
);
-- A igual fecha manda el orden de llegada (`id`): así ordenaba la hoja.
create index if not exists acciones_operaciones_usuario on acciones_operaciones (usuario, fecha, id);
alter table acciones_operaciones enable row level security;

create table if not exists acciones_precios (
  ticker      text primary key check (char_length(ticker) between 1 and 20),
  nombre      text not null default '' check (char_length(nombre) <= 200),
  precio      numeric,
  cambio_dia  numeric,
  actualizado timestamptz
);
alter table acciones_precios enable row level security;

-- Nombre del activo tal como lo escribe Fintual → ticker. Lo llena solo el
-- AUTO-MAPA del trabajador (busca en Yahoo y avisa para verificar).
create table if not exists acciones_mapa (
  nombre text primary key check (char_length(nombre) between 1 and 200),
  ticker text not null default '' check (char_length(ticker) <= 20)
);
alter table acciones_mapa enable row level security;

create table if not exists acciones_alertas (
  id      bigint generated always as identity primary key,
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha   timestamptz not null default now(),
  tipo    text not null default '' check (char_length(tipo) <= 60),
  detalle text not null default '' check (char_length(detalle) <= 4000)
);
create index if not exists acciones_alertas_usuario on acciones_alertas (usuario, fecha desc);
alter table acciones_alertas enable row level security;

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------
drop policy if exists acciones_operaciones_del_dueno on acciones_operaciones;
create policy acciones_operaciones_del_dueno on acciones_operaciones
  for all to authenticated using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));
drop policy if exists acciones_alertas_del_dueno on acciones_alertas;
create policy acciones_alertas_del_dueno on acciones_alertas
  for all to authenticated using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));
drop policy if exists acciones_precios_leer on acciones_precios;
create policy acciones_precios_leer on acciones_precios for select to authenticated using (true);
drop policy if exists acciones_mapa_leer on acciones_mapa;
create policy acciones_mapa_leer on acciones_mapa for select to authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;
  revoke all on acciones_operaciones, acciones_precios, acciones_mapa, acciones_alertas from anon, authenticated;
  -- La página corrige una operación (un ticker mal resuelto) o la borra; las
  -- crea el trabajador al leer los correos.
  grant select, update, delete on acciones_operaciones to authenticated;
  grant select, delete on acciones_alertas to authenticated;
  grant select on acciones_precios, acciones_mapa to authenticated;
end $$;

-- Rollback (en el papel):
--   drop table if exists acciones_alertas, acciones_mapa, acciones_precios, acciones_operaciones;
