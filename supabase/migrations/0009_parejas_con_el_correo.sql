-- 0009 — Lo que mostró releer los avisos crudos contra lo que ya trajo el correo (hito 0016).
--
-- 1. Copec Pay no avisa al celular, pero su correo trae su pata de una
--    transferencia a MACH como `interna`. La pata de MACH llega por aviso como
--    ingreso sin remitente, y emparejar_aviso (0008) solo juntaba dos avisos:
--    el ingreso quedaba como ingreso, y los ingresos se inflaban. Ahora un
--    aviso sin contraparte también se empareja con una interna del correo de
--    OTRO banco, llegue antes (emparejar_aviso) o después (absorber_aviso). Se
--    toca solo la fila del aviso: la del correo ya está bien.
--
-- 2. Algunos correos traen solo la fecha, y el trabajador los guarda a las
--    00:00 (las transferencias de Tenpo). Con «a no más de 4 horas», el aviso
--    de las 12:38 no reconocía su propio correo y la transferencia se contaba
--    dos veces. Ahora una fecha a las 00:00 se compara por día: cerca().
--
-- Re-ejecutable.

-- ¿Dos fechas 'AAAA-MM-DD HH:MM' pueden ser la misma operación? A las 00:00
-- es «sin hora»: basta el mismo día. Riesgo aceptado: algo hecho de verdad a
-- medianoche se compara también por día.
create or replace function cerca(_a text, _b text, _segundos int)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when right(_a, 5) = '00:00' or right(_b, 5) = '00:00' then left(_a, 10) = left(_b, 10)
    else abs(extract(epoch from (_a::timestamp - _b::timestamp))) <= _segundos
  end
$$;

create or replace function emparejar_aviso(_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _m     movimientos;
  _o     movimientos;
  _sale  movimientos;
  _entra movimientos;
begin
  select * into _m from movimientos where id = _id and origen = 'notificacion' for update;
  if not found then
    return null;
  end if;

  if _m.tipo = 'ingreso' and _m.contraparte = '' then
    -- Primero la otra pata por aviso (0008).
    select o.* into _o from movimientos o
     where o.usuario = _m.usuario and o.origen = 'notificacion' and o.id <> _m.id
       and o.banco <> _m.banco and o.moneda = _m.moneda and o.monto = _m.monto
       and abs(extract(epoch from (o.fecha::timestamp - _m.fecha::timestamp))) <= 600
       and ((o.tipo = 'gasto' and o.contraparte = '')
         or (o.tipo = 'interna' and o.detalle = 'Hacia ' || _m.banco
             and not exists (
               select 1 from movimientos z
                where z.usuario = o.usuario and z.origen = 'notificacion' and z.tipo = 'interna'
                  and z.banco = _m.banco and z.monto = o.monto and z.detalle = 'Desde ' || o.banco
                  and abs(extract(epoch from (z.fecha::timestamp - o.fecha::timestamp))) <= 600)))
     order by abs(extract(epoch from (o.fecha::timestamp - _m.fecha::timestamp)))
     limit 1
     for update;
    if found then
      _sale := _o;
      _entra := _m;
    end if;
  elsif (_m.tipo = 'gasto' and _m.contraparte = '') or (_m.tipo = 'interna' and _m.detalle like 'Hacia %') then
    select o.* into _o from movimientos o
     where o.usuario = _m.usuario and o.origen = 'notificacion' and o.id <> _m.id
       and o.banco <> _m.banco and o.moneda = _m.moneda and o.monto = _m.monto
       and o.tipo = 'ingreso' and o.contraparte = ''
       and (_m.tipo = 'gasto' or _m.detalle = 'Hacia ' || o.banco)
       and abs(extract(epoch from (o.fecha::timestamp - _m.fecha::timestamp))) <= 600
     order by abs(extract(epoch from (o.fecha::timestamp - _m.fecha::timestamp)))
     limit 1
     for update;
    if found then
      _sale := _m;
      _entra := _o;
    end if;
  else
    return null;
  end if;

  if _sale.id is not null then
    update movimientos set tipo = 'interna', categoria = 'Entre mis cuentas',
           contraparte = case when contraparte = '' then 'Entre mis cuentas' else contraparte end,
           detalle = 'Hacia ' || _entra.banco
     where id = _sale.id;
    update movimientos set tipo = 'interna', categoria = 'Entre mis cuentas',
           contraparte = 'Entre mis cuentas', detalle = 'Desde ' || _sale.banco
     where id = _entra.id;
    return _o.id;
  end if;

  -- Si no, la otra pata por correo: una interna de otro banco que ningún
  -- aviso haya reclamado todavía. Solo para lo que el aviso no sabe (sin
  -- contraparte); una interna «Hacia X» ya sabe lo que es.
  if _m.tipo not in ('ingreso', 'gasto') then
    return null;
  end if;
  select o.* into _o from movimientos o
   where o.usuario = _m.usuario and o.origen = 'correo' and o.tipo = 'interna'
     and o.banco <> _m.banco and o.moneda = _m.moneda and o.monto = _m.monto
     and cerca(o.fecha, _m.fecha, 600)
     and not exists (
       select 1 from movimientos z
        where z.usuario = o.usuario and z.origen = 'notificacion' and z.tipo = 'interna'
          and z.monto = o.monto and z.detalle in ('Desde ' || o.banco, 'Hacia ' || o.banco)
          and cerca(o.fecha, z.fecha, 600))
   order by abs(extract(epoch from (o.fecha::timestamp - _m.fecha::timestamp)))
   limit 1;
  if not found then
    return null;
  end if;
  update movimientos set tipo = 'interna', categoria = 'Entre mis cuentas', contraparte = 'Entre mis cuentas',
         detalle = case when _m.tipo = 'ingreso' then 'Desde ' else 'Hacia ' end || _o.banco
   where id = _m.id;
  return _o.id;
end;
$$;

-- Igual que en la 0008, con cerca() para el correo que trae solo la fecha.
create or replace function tramitar_aviso(_id bigint, _estado text, _mov jsonb default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _n      notificaciones;
  _gemelo movimientos;
  _mid    text;
  _fecha  text;
begin
  select * into _n from notificaciones where id = _id and estado = 'cruda' for update;
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

  select m.* into _gemelo from movimientos m
   where m.usuario = _n.usuario and m.origen = 'correo'
     and m.banco = _mov->>'banco' and m.producto = _mov->>'producto' and m.moneda = 'CLP'
     and m.monto = (_mov->>'monto')::bigint
     and sentido_compatible(_mov->>'tipo', m.tipo)
     and cerca(m.fecha, _fecha, 4 * 3600)
     and not exists (select 1 from notificaciones x where x.usuario = _n.usuario and x.movimiento = m.id)
   order by abs(extract(epoch from (m.fecha::timestamp - _fecha::timestamp)))
   limit 1;
  if found then
    update notificaciones set estado = 'registrada', movimiento = _gemelo.id where id = _n.id;
    return 'ya-estaba';
  end if;

  insert into movimientos (usuario, fecha, banco, producto, tipo, monto, contraparte, categoria, cuotas, detalle, origen, registrado)
  values (
    _n.usuario, _fecha, coalesce(_mov->>'banco', ''), coalesce(_mov->>'producto', 'Cuenta'), _mov->>'tipo',
    (_mov->>'monto')::bigint, coalesce(_mov->>'contraparte', ''), coalesce(_mov->>'categoria', ''),
    nullif(_mov->>'cuotas', '')::smallint, coalesce(_mov->>'detalle', ''), 'notificacion',
    to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI')
  )
  returning id into _mid;
  update notificaciones set estado = 'registrada', movimiento = _mid where id = _n.id;
  perform emparejar_aviso(_mid);
  return 'nueva';
end;
$$;

-- Igual que en la 0008, más: cerca() para el correo sin hora, y una interna
-- del correo convierte en interna el aviso sin contraparte de otro banco que
-- era su otra pata.
create or replace function absorber_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _a      movimientos;
  _bancos text;
begin
  select m.* into _a from movimientos m
   where m.usuario = new.usuario and m.origen = 'notificacion'
     and m.banco = new.banco and m.producto = new.producto and m.moneda = new.moneda and m.monto = new.monto
     and sentido_compatible(m.tipo, new.tipo)
     and cerca(m.fecha, new.fecha, 4 * 3600)
   order by abs(extract(epoch from (m.fecha::timestamp - new.fecha::timestamp)))
   limit 1
   for update;
  if found then
    update movimientos set
      fecha = case when right(new.fecha, 5) = '00:00' then _a.fecha else new.fecha end,
      tipo = new.tipo, contraparte = new.contraparte, categoria = new.categoria,
      cuotas = new.cuotas, detalle = new.detalle, monto_original = new.monto_original,
      gmail_id = new.gmail_id, registrado = new.registrado, fecha_contable = new.fecha_contable, origen = 'correo'
     where id = _a.id;
    return null;
  end if;

  if new.tipo = 'interna' then
    update movimientos a set tipo = 'interna', categoria = 'Entre mis cuentas', contraparte = 'Entre mis cuentas',
           detalle = case when a.tipo = 'ingreso' then 'Desde ' else 'Hacia ' end || new.banco
     where a.id = (
       select m.id from movimientos m
        where m.usuario = new.usuario and m.origen = 'notificacion' and m.contraparte = ''
          and m.tipo in ('ingreso', 'gasto') and m.banco <> new.banco
          and m.moneda = new.moneda and m.monto = new.monto
          and cerca(m.fecha, new.fecha, 600)
        order by abs(extract(epoch from (m.fecha::timestamp - new.fecha::timestamp)))
        limit 1);
  end if;

  if auth.uid() is null and new.gmail_id <> '' then
    select valor into _bancos from config where usuario = new.usuario and clave = 'bancos_por_aviso';
    if exists (select 1 from unnest(string_to_array(coalesce(_bancos, ''), ',')) b
                where btrim(b) <> '' and lower(btrim(b)) = lower(new.banco)) then
      insert into revisar (usuario, gmail_id, fecha, remitente, asunto, motivo, tipo, monto, contraparte, banco, extracto)
      values (
        new.usuario, new.gmail_id, left(new.fecha, 20), left(new.banco, 200),
        left(format('%s · %s', new.banco, coalesce(nullif(new.contraparte, ''), nullif(new.categoria, ''), new.tipo)), 500),
        left(format('Llegó por correo y no por el celular (%s está en «bancos por aviso»)', new.banco), 300),
        new.tipo, new.monto, new.contraparte, new.banco,
        left(concat_ws(' · ', nullif(new.categoria, ''), nullif(new.detalle, ''),
                       case when new.cuotas > 1 then new.cuotas || ' cuotas' end), 1000)
      )
      on conflict (usuario, gmail_id) do nothing;
      if found then
        return null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function cerca(text, text, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function cerca(text, text, int) from anon, authenticated;
  end if;
end $$;

-- Rollback (en el papel): volver a correr las definiciones de la 0008 de
-- emparejar_aviso, tramitar_aviso y absorber_aviso; borrar cerca.
