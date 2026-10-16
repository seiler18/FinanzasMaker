-- 0008 — Dejar de depender del correo, banco por banco.
--
-- La 0007 convirtió los avisos del celular en movimientos, pero el correo
-- seguía siendo la red de seguridad: completaba lo que el aviso no dice y
-- traía lo que ningún aviso trae. Esta migración prepara apagarlo (hito 0015):
--
-- 1. contexto_aviso() devuelve también el `titular` y las `cuentas_externas`
--    de Config: con eso el lector reconoce una transferencia a ti mismo
--    («has realizado una transferencia a Jesus Seiler», BancoEstado).
--
-- 2. Las dos patas de una transferencia entre tus cuentas llegan como dos
--    avisos de bancos distintos, y una de ellas no dice de quién viene («Has
--    recibido una transferencia por $X», MACH). Sola es un ingreso que no fue.
--    emparejar_aviso() las junta: mismo monto, bancos distintos, una sale y la
--    otra entra, a no más de 10 minutos → las dos pasan a `interna`. Solo toca
--    movimientos que vinieron por aviso; lo del correo ya viene resuelto.
--
-- 3. Config → `bancos_por_aviso`: para esos bancos el correo deja de crear
--    movimientos. Si su aviso ya está, el correo lo completa como siempre
--    (absorber_aviso). Si no, va a «Por revisar» en vez de entrar solo: así se
--    ve lo que el aviso no cubre, y se registra con un toque. Lo que inserta la
--    página (decidir_revisar, con sesión) no se desvía: es el dueño decidiendo.
--
-- Además, aplicar_aviso() se parte en dos: la búsqueda del aviso por la clave
-- del celular, y tramitar_aviso(), que trabaja por id y que también usa
-- scripts/releer-avisos.mjs para leer los avisos crudos cuando se suma un
-- lector nuevo.
--
-- Re-ejecutable.

-- Una interna por aviso salió de reconocer al titular o de emparejar las dos
-- patas: el correo, que es más preciso, puede decir que era otra cosa.
create or replace function sentido_compatible(_aviso text, _correo text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case _aviso
    when 'gasto'   then _correo in ('gasto', 'interna', 'inversion', 'pago_tarjeta')
    when 'ingreso' then _correo in ('ingreso', 'interna', 'rescate')
    when 'interna' then _correo in ('interna', 'gasto', 'ingreso', 'inversion', 'rescate', 'pago_tarjeta')
    else false
  end
$$;

-- Lo que la función necesita del dueño: sus reglas en orden, y quién es.
-- Sin fila en Config, vacío: nada se reconoce como propio (mejor un gasto que
-- una interna inventada).
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
  return jsonb_build_object(
    'reglas', coalesce(
      (select jsonb_agg(jsonb_build_object('patron', patron, 'categoria', categoria, 'tipo', tipo) order by id)
         from reglas where usuario = _disp.usuario), '[]'::jsonb),
    'titular', coalesce((select valor from config where usuario = _disp.usuario and clave = 'titular'), ''),
    'externas', coalesce((select valor from config where usuario = _disp.usuario and clave = 'cuentas_externas'), ''));
end;
$$;

-- Las dos patas de una transferencia entre tus cuentas. `_id` es un
-- movimiento recién creado por aviso; si calza con la otra pata, las dos pasan
-- a interna y se devuelve el id de la otra (null si no hubo pareja).
--
-- Qué es una pata:
-- - sale: un gasto sin destinatario (Tenpo no dice a quién), o una interna
--   que ya sabe a qué banco fue («Hacia MACH», BancoEstado);
-- - entra: un ingreso sin remitente (MACH no dice de quién).
-- Una interna «Hacia X» ya emparejada no se vuelve a usar: su pareja en X
-- quedó con «Desde <banco>».
--
-- Riesgo aceptado: mandar $X a un tercero desde un banco y recibir
-- exactamente $X de otro tercero en otro banco, en los mismos 10 minutos, se
-- tomaría como un movimiento entre tus cuentas. El correo o la cartola lo
-- corrigen.
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
    if not found then
      return null;
    end if;
    _sale := _o;
    _entra := _m;
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
    if not found then
      return null;
    end if;
    _sale := _m;
    _entra := _o;
  else
    return null;
  end if;

  update movimientos set tipo = 'interna', categoria = 'Entre mis cuentas',
         contraparte = case when contraparte = '' then 'Entre mis cuentas' else contraparte end,
         detalle = 'Hacia ' || _entra.banco
   where id = _sale.id;
  update movimientos set tipo = 'interna', categoria = 'Entre mis cuentas',
         contraparte = 'Entre mis cuentas', detalle = 'Desde ' || _sale.banco
   where id = _entra.id;
  return _o.id;
end;
$$;

-- El trámite de un aviso guardado y todavía crudo, por su id. Devuelve:
-- 'nueva' | 'ya-estaba' | 'ignorada' | 'cruda' | 'sin-aviso'.
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

  -- ¿El correo ya trajo este movimiento? Se toma el más cercano en la hora y
  -- que ningún otro aviso haya reclamado.
  select m.* into _gemelo from movimientos m
   where m.usuario = _n.usuario and m.origen = 'correo'
     and m.banco = _mov->>'banco' and m.producto = _mov->>'producto' and m.moneda = 'CLP'
     and m.monto = (_mov->>'monto')::bigint
     and sentido_compatible(_mov->>'tipo', m.tipo)
     and abs(extract(epoch from (m.fecha::timestamp - _fecha::timestamp))) <= 4 * 3600
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

-- Lo que llama la función `notificacion`: el aviso recién guardado de este
-- celular, todavía sin tramitar. Misma firma y mismas respuestas que en la 0007.
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
  _disp dispositivos;
  _nid  bigint;
begin
  select * into _disp from dispositivos
   where clave_hash = encode(sha256(convert_to(coalesce(_clave, ''), 'UTF8')), 'hex') and revocado is null;
  if not found then
    raise exception 'clave-invalida' using errcode = '28000';
  end if;

  select id into _nid from notificaciones
   where dispositivo = _disp.id and estado = 'cruda'
     and paquete = left(btrim(coalesce(_paquete, '')), 120)
     and titulo = left(coalesce(_titulo, ''), 500)
     and texto = left(coalesce(_texto, ''), 4000)
   order by recibida desc limit 1;
  if not found then
    return 'sin-aviso';
  end if;
  return tramitar_aviso(_nid, _estado, _mov);
end;
$$;

-- El correo que llega después de su aviso completa la fila del aviso en vez de
-- duplicarla (0007). Nuevo: si el banco está en `bancos_por_aviso` y no hay
-- aviso que completar, el correo va a «Por revisar».
--
-- `auth.uid() is null` = lo escribe el trabajador con la clave secreta. La
-- página escribe con sesión: lo que registra desde «Por revisar» tiene que
-- entrar, o el movimiento daría vueltas sin fin.
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
     and abs(extract(epoch from (m.fecha::timestamp - new.fecha::timestamp))) <= 4 * 3600
   order by abs(extract(epoch from (m.fecha::timestamp - new.fecha::timestamp)))
   limit 1
   for update;
  if found then
    -- Lo del correo es más preciso (comercio, cuotas, quién envió); la `nota` y
    -- el id se quedan, que ya pueden estar referidos.
    update movimientos set
      fecha = new.fecha, tipo = new.tipo, contraparte = new.contraparte, categoria = new.categoria,
      cuotas = new.cuotas, detalle = new.detalle, monto_original = new.monto_original,
      gmail_id = new.gmail_id, registrado = new.registrado, fecha_contable = new.fecha_contable, origen = 'correo'
     where id = _a.id;
    return null;
  end if;

  if auth.uid() is null and new.gmail_id <> '' then
    select valor into _bancos from config where usuario = new.usuario and clave = 'bancos_por_aviso';
    if exists (select 1 from unnest(string_to_array(coalesce(_bancos, ''), ',')) b
                where btrim(b) <> '' and lower(btrim(b)) = lower(new.banco)) then
      -- Al trabajador le parece que insertó (2xx) y manda el correo a la
      -- papelera como siempre: lo que importa del correo queda en `revisar`.
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

revoke execute on function emparejar_aviso(text) from public;
revoke execute on function tramitar_aviso(bigint, text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function emparejar_aviso(text) from anon, authenticated, service_role;
    revoke execute on function tramitar_aviso(bigint, text, jsonb) from anon, authenticated;
    grant execute on function tramitar_aviso(bigint, text, jsonb) to service_role;
  end if;
end $$;

-- Rollback (en el papel): volver a correr las definiciones de la 0007 de
-- sentido_compatible, contexto_aviso, aplicar_aviso y absorber_aviso; borrar
-- emparejar_aviso y tramitar_aviso.
