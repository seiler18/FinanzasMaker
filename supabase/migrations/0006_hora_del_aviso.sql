-- 0006: la hora en que el celular mostró el aviso.
--
-- La app FinanzasMaker para Android (repo FinanzasMaker-android) manda
-- `publicada`: el `postTime` de la notificación, en milisegundos. MacroDroid
-- no lo manda. Sirve para dos cosas:
--
-- 1. La hora real de la compra. Un aviso que esperó en la cola del celular
--    (sin red, o recuperado al reiniciar el servicio) llega tarde; `recibida`
--    es cuándo llegó a la base, `publicada` cuándo pasó.
-- 2. La huella anti-repetidos. Era contenido + minuto de llegada; ahora es
--    contenido + minuto de `publicada` si viene. Así el mismo aviso mandado
--    otra vez horas después (la app revisa los avisos activos al reconectarse)
--    choca con el primero. Mientras convivan la app y MacroDroid, los dos
--    calzan casi siempre: el minuto de llegada de MacroDroid es el mismo en
--    que se publicó.
--
-- Una `publicada` absurda (más de 30 días atrás o más de 10 minutos en el
-- futuro: el reloj del celular mal puesto) se ignora y se usa la hora de llegada.

alter table notificaciones add column if not exists publicada timestamptz;

drop function if exists registrar_notificacion(text, text, text, text, text);

create or replace function registrar_notificacion(
  _clave       text,
  _paquete     text,
  _titulo      text default '',
  _texto       text default '',
  _texto_largo text default '',
  _publicada   bigint default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _disp    dispositivos;
  _paquete_limpio text := left(btrim(coalesce(_paquete, '')), 120);
  _cuando  timestamptz;
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
  -- Tope por celular: una app mal armada (o una clave robada) no llena la
  -- base. Ninguna persona recibe 60 avisos del banco en un minuto.
  if (select count(*) from notificaciones
       where dispositivo = _disp.id and recibida > now() - interval '1 minute') >= 60 then
    raise exception 'demasiadas' using errcode = 'P0001';
  end if;

  if _publicada is not null
     and _publicada between (extract(epoch from now() - interval '30 days') * 1000)::bigint
                        and (extract(epoch from now() + interval '10 minutes') * 1000)::bigint then
    _cuando := to_timestamp(_publicada / 1000.0);
  end if;

  insert into notificaciones (usuario, dispositivo, paquete, titulo, texto, texto_largo, publicada, huella)
  values (
    _disp.usuario, _disp.id, _paquete_limpio,
    left(coalesce(_titulo, ''), 500), left(coalesce(_texto, ''), 4000), left(coalesce(_texto_largo, ''), 4000),
    _cuando,
    encode(sha256(convert_to(concat_ws(E'\x1f', _paquete_limpio, _titulo, _texto,
      extract(epoch from date_trunc('minute', coalesce(_cuando, now())))::bigint::text), 'UTF8')), 'hex')
  )
  on conflict (usuario, huella) do nothing;
  get diagnostics _filas = row_count;

  update dispositivos set ultimo_uso = now() where id = _disp.id;
  return case when _filas = 1 then 'nueva' else 'repetida' end;
end;
$$;

revoke execute on function registrar_notificacion(text, text, text, text, text, bigint) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function registrar_notificacion(text, text, text, text, text, bigint) from anon, authenticated;
    grant execute on function registrar_notificacion(text, text, text, text, text, bigint) to service_role;
  end if;
end $$;

-- Rollback (en el papel): volver a crear la función de 0002 (cinco
-- argumentos) y `alter table notificaciones drop column publicada`.
