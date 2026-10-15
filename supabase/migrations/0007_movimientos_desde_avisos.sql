-- 0007 — Movimientos desde los avisos del celular.
--
-- Hasta la 0006 los avisos de los bancos se guardaban crudos y nada los
-- convertía en movimientos: la página seguía leyendo solo lo que traía el
-- correo (Apps Script). Ahora la función `notificacion` lee el aviso
-- (supabase/functions/notificacion/lectores.js) y llama a `aplicar_aviso()`,
-- que crea el movimiento con origen 'notificacion'.
--
-- El problema de fondo es que MIENTRAS el correo siga activo, la misma compra
-- llega por los dos lados, y tiene que contarse UNA vez. Se resuelve en la
-- base, así el trabajador de Apps Script no necesita ningún cambio:
--
-- - Aviso primero, correo después (lo normal: el aviso llega en segundos y el
--   correo en hasta 30 minutos). El correo entra por el trigger
--   `absorber_aviso`: en vez de insertar una fila nueva, completa la del aviso
--   con lo suyo (comercio exacto, cuotas, tipo correcto) y pasa a origen
--   'correo'. Al trabajador le parece que insertó (2xx), y el correo se va a la
--   papelera como siempre.
-- - Correo primero, aviso después (el celular estuvo sin red): `aplicar_aviso`
--   busca el movimiento del correo y no crea otro.
-- - Dos compras idénticas el mismo día no se funden: cada movimiento del
--   correo se empareja con UN solo aviso (`notificaciones.movimiento`).
--
-- «Mismo» = mismo banco, producto y monto, con sentido compatible y a no más de
-- 4 horas. Lo que el aviso no trae (quién envió una transferencia) se deja
-- vacío y lo completa el correo; si el correo nunca llega, se corrige con la
-- cartola del mes.
--
-- Re-ejecutable.

alter table notificaciones add column if not exists movimiento text;

-- ¿Un aviso y un correo pueden ser la misma operación? El aviso no sabe si una
-- transferencia era entre tus cuentas, así que su «gasto» puede resultar
-- interna, inversión o pago de tarjeta cuando llega el correo.
create or replace function sentido_compatible(_aviso text, _correo text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case _aviso
    when 'gasto'   then _correo in ('gasto', 'interna', 'inversion', 'pago_tarjeta')
    when 'ingreso' then _correo in ('ingreso', 'interna', 'rescate')
    else false
  end
$$;

-- Lo que la función necesita del dueño para categorizar: sus reglas, en orden.
create or replace function contexto_aviso(_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _disp dispositivos;
begin
  select * into _disp from dispositivos
   where clave_hash = encode(sha256(convert_to(coalesce(_clave, ''), 'UTF8')), 'hex') and revocado is null;
  if not found then
    raise exception 'clave-invalida' using errcode = '28000';
  end if;
  return jsonb_build_object('reglas', coalesce(
    (select jsonb_agg(jsonb_build_object('patron', patron, 'categoria', categoria, 'tipo', tipo) order by id)
       from reglas where usuario = _disp.usuario), '[]'::jsonb));
end;
$$;

-- Cierra el trámite de un aviso ya guardado: lo marca ignorado, o lo convierte
-- en movimiento (o lo reconoce como uno que el correo ya trajo). Devuelve:
-- 'nueva' | 'ya-estaba' | 'ignorada' | 'cruda' | 'sin-aviso'.
create or replace function aplicar_aviso(
  _clave       text,
  _paquete     text,
  _titulo      text,
  _texto       text,
  _estado      text,
  _mov         jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _disp   dispositivos;
  _n      notificaciones;
  _gemelo movimientos;
  _id     text;
  _fecha  text;
begin
  select * into _disp from dispositivos
   where clave_hash = encode(sha256(convert_to(coalesce(_clave, ''), 'UTF8')), 'hex') and revocado is null;
  if not found then
    raise exception 'clave-invalida' using errcode = '28000';
  end if;

  -- El aviso recién guardado de este celular, todavía sin tramitar.
  select * into _n from notificaciones
   where dispositivo = _disp.id and estado = 'cruda'
     and paquete = left(btrim(coalesce(_paquete, '')), 120)
     and titulo = left(coalesce(_titulo, ''), 500)
     and texto = left(coalesce(_texto, ''), 4000)
   order by recibida desc limit 1
   for update;
  if not found then
    return 'sin-aviso';
  end if;

  if _estado = 'ignorada' then
    update notificaciones set estado = 'ignorada' where id = _n.id;
    return 'ignorada';
  end if;
  if _mov is null then
    return 'cruda';
  end if;

  _fecha := _mov->>'fecha';

  -- ¿El correo ya trajo este movimiento? Se toma el más cercano en la hora y
  -- que ningún otro aviso haya reclamado.
  select m.* into _gemelo from movimientos m
   where m.usuario = _disp.usuario and m.origen = 'correo'
     and m.banco = _mov->>'banco' and m.producto = _mov->>'producto' and m.moneda = 'CLP'
     and m.monto = (_mov->>'monto')::bigint
     and sentido_compatible(_mov->>'tipo', m.tipo)
     and abs(extract(epoch from (m.fecha::timestamp - _fecha::timestamp))) <= 4 * 3600
     and not exists (select 1 from notificaciones x where x.usuario = _disp.usuario and x.movimiento = m.id)
   order by abs(extract(epoch from (m.fecha::timestamp - _fecha::timestamp)))
   limit 1;
  if found then
    update notificaciones set estado = 'registrada', movimiento = _gemelo.id where id = _n.id;
    return 'ya-estaba';
  end if;

  insert into movimientos (usuario, fecha, banco, producto, tipo, monto, contraparte, categoria, cuotas, detalle, origen, registrado)
  values (
    _disp.usuario, _fecha, coalesce(_mov->>'banco', ''), coalesce(_mov->>'producto', 'Cuenta'), _mov->>'tipo',
    (_mov->>'monto')::bigint, coalesce(_mov->>'contraparte', ''), coalesce(_mov->>'categoria', ''),
    nullif(_mov->>'cuotas', '')::smallint, coalesce(_mov->>'detalle', ''), 'notificacion',
    to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI')
  )
  returning id into _id;
  update notificaciones set estado = 'registrada', movimiento = _id where id = _n.id;
  return 'nueva';
end;
$$;

-- El correo que llega después de su aviso completa la fila del aviso en vez de
-- duplicarla. `return null` en un BEFORE INSERT significa «no insertes»: el
-- trabajador ve un 2xx y sigue como siempre (regla 1: escribir antes de borrar).
create or replace function absorber_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _a movimientos;
begin
  select m.* into _a from movimientos m
   where m.usuario = new.usuario and m.origen = 'notificacion'
     and m.banco = new.banco and m.producto = new.producto and m.moneda = new.moneda and m.monto = new.monto
     and sentido_compatible(m.tipo, new.tipo)
     and abs(extract(epoch from (m.fecha::timestamp - new.fecha::timestamp))) <= 4 * 3600
   order by abs(extract(epoch from (m.fecha::timestamp - new.fecha::timestamp)))
   limit 1
   for update;
  if not found then
    return new;
  end if;
  -- Lo del correo es más preciso (comercio, cuotas, quién envió); la `nota` y
  -- el id se quedan, que ya pueden estar referidos.
  update movimientos set
    fecha = new.fecha, tipo = new.tipo, contraparte = new.contraparte, categoria = new.categoria,
    cuotas = new.cuotas, detalle = new.detalle, monto_original = new.monto_original,
    gmail_id = new.gmail_id, registrado = new.registrado, fecha_contable = new.fecha_contable, origen = 'correo'
   where id = _a.id;
  return null;
end;
$$;

drop trigger if exists absorber_aviso on movimientos;
create trigger absorber_aviso before insert on movimientos
  for each row when (new.origen = 'correo') execute function absorber_aviso();

revoke execute on function sentido_compatible(text, text) from public;
revoke execute on function contexto_aviso(text) from public;
revoke execute on function aplicar_aviso(text, text, text, text, text, jsonb) from public;
revoke execute on function absorber_aviso() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function sentido_compatible(text, text) from anon, authenticated;
    revoke execute on function contexto_aviso(text) from anon, authenticated;
    revoke execute on function aplicar_aviso(text, text, text, text, text, jsonb) from anon, authenticated;
    revoke execute on function absorber_aviso() from anon, authenticated;
    grant execute on function sentido_compatible(text, text) to service_role;
    grant execute on function contexto_aviso(text) to service_role;
    grant execute on function aplicar_aviso(text, text, text, text, text, jsonb) to service_role;
  end if;
end $$;

-- Rollback (en el papel): drop trigger absorber_aviso on movimientos; borrar las
-- cuatro funciones; alter table notificaciones drop column movimiento.
