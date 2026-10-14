# Pendientes para el PC de la casa

Lista de lo que quedó por hacer el 2026-10-14 (hito 0012). Se tacha y se
borra cuando esté hecho. El repo es público: aquí no van claves.

## 0. Antes de empezar

```
cd FinanzasMaker
git pull
npm ci
```

Copiar al otro PC a mano, **sin pasar por git**:

- `FinanzasMaker/.env`: las claves de los PDF de las cartolas, más las de
  Supabase que ese PC ya tiene. Juntar las dos.
- `FinanzasMaker/cartolas/`: los PDF. Solo hacen falta para
  `tests/cartolas-reales.test.mjs`; sin la carpeta, esa prueba se salta.

## 1. Desplegar la migración 0006 y la función `notificacion`

El orden importa. Al revés, la función llamaría a la base con un argumento
que todavía no existe y fallarían todos los avisos.

```
npx supabase login
npx supabase link --project-ref mbcswbrmgfgmpsssnfzh
npx supabase db push                                   # 1.º la base (0006_hora_del_aviso.sql)
npx supabase functions deploy notificacion --use-api   # 2.º la función
```

Para comprobarlo, en Ajustes → Celular los avisos siguen llegando. En la
tabla `notificaciones`, los que manda la app traen `publicada`.

## 2. Instalar la app Android en el celular

1. Abrir el Release v0.1.0 desde el celular:
   https://github.com/seiler18/FinanzasMaker-android/releases/tag/v0.1.0
   El repo es privado: hay que entrar con la cuenta de GitHub. Bajar
   `FinanzasMaker-0.1.0.apk` e instalarlo, permitiendo instalar desde el
   navegador.
2. En la página, Ajustes → Celular → **Vincular la app** → «Abrir la app y
   vincular». Si no abre, usar «Copiar clave» y, en la app, «Pegar clave».
3. En la app:
   - dar **acceso a las notificaciones**;
   - quitar la **optimización de batería**;
   - revisar qué bancos quedaron marcados.
4. Tocar **Probar conexión**. Debe aparecer «Prueba de conexión» en Ajustes →
   Celular.
5. Hacer una compra o una transferencia chica y ver que el aviso llega por la
   app.
6. **Recién entonces, apagar la macro de MacroDroid**, para no recibir cada
   aviso dos veces.

## 3. Respaldar la firma de la app

En **este** PC (el de la oficina), copiar a un lugar seguro, fuera de git:

- `FinanzasMaker-android/firma/finanzasmaker.jks`
- `FinanzasMaker-android/.env` (la contraseña del keystore)

GitHub los tiene como secretos para compilar, pero no se pueden descargar.
Si se pierden, ninguna versión nueva de la app se podrá instalar encima de la
actual.

## 4. Probar las cartolas en la página publicada

En Agregar → Subir una cartola, subir las cartolas de septiembre de MACH y
Copec Pay, y los estados de cuenta de las tarjetas MACH y Tenpo. Revisar:

- que diga «Cuadra al peso»;
- que lo marcado como faltante de verdad falte;
- que lo ya registrado aparezca como «Ya registrados».

Lo marcado se agrega a la base de verdad: se puede revisar antes en la demo
(`?demo`).

## 5. Más adelante

- **Lectores de notificaciones**, con una semana de avisos reales (hacia el
  2026-10-19): convertir los avisos crudos en movimientos.
- **Otras cartolas** vistas en el correo: Santander, Prex y Tenpo Inversiones.
  Dejar el PDF en `cartolas/` y su clave en `.env`, y pedir que se agregue
  el formato (skill `agregar-banco`).
- **Gradle 8.14.3** de la app: GitHub avisa que está desactualizado. Va en un
  cambio aparte.
- **Auditoría de ciberseguridad completa.**
