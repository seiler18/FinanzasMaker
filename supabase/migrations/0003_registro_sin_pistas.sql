-- 0003 — El rechazo de un registro no cuenta cómo funciona por dentro.
--
-- La 0001 rechazaba con una pista («Agrega el correo a la tabla permitidos…»),
-- y Auth se la devuelve tal cual a quien intenta registrarse con la clave
-- pública: le decía a un desconocido que hay una lista y cómo se llama. No le
-- sirve para entrar (la tabla no se lee ni se escribe por la API), pero no
-- tiene por qué saberlo. Queda solo el mensaje fijo. La pista vive aquí y en
-- el README, que es donde la busca el dueño.
--
-- Re-ejecutable.

create or replace function solo_permitidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or not exists (select 1 from permitidos where email = lower(new.email)) then
    raise exception 'registro-cerrado' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function solo_permitidos() from public;

-- Rollback (en el papel): volver a la definición de 0001, con su `hint`.
