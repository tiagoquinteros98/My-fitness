# My Fitness

Clon simple de MyFitnessPal con dos funciones:

- **Diario de comidas**: agregá alimentos a Desayuno, Almuerzo, Cena o Snacks, buscándolos por nombre o **escaneando el código de barras** con la cámara. Muestra calorías y macros (carbohidratos, grasas, proteínas) y las calorías restantes contra un objetivo diario.
- **Registro de peso**: un peso por día, gráfico de evolución, historial, cambio total y peso objetivo.

Los datos de los productos vienen de [Open Food Facts](https://world.openfoodfacts.org) (gratis, sin API key). Si un código no existe, podés crear el alimento a mano y queda guardado con ese código para la próxima vez.

Los datos viven en Upstash Redis (vía Vercel Marketplace) detrás de `/api/state`; el navegador guarda una copia en `localStorage` para abrir al instante y funcionar sin conexión, y sincroniza los cambios cuando puede. La primera vez que un navegador con datos abre la app, los sube al servidor.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

### Cámara en el celular

Los navegadores solo dan acceso a la cámara en `https` o `localhost`. Para probar el escáner desde el teléfono, desplegá el build (`dist/`) en un hosting con HTTPS (Vercel, Netlify, GitHub Pages) o usá un túnel HTTPS hacia `npm run dev -- --host`. Si no hay cámara, el escáner permite escribir el código a mano.

## Stack

React + TypeScript + Vite. Escaneo con [`@zxing/browser`](https://github.com/zxing-js/browser) (EAN-13, EAN-8, UPC-A, UPC-E, Code 128).

## Deploy (Vercel)

El sitio pide usuario y contraseña en `/login.html`; al ingresar queda una cookie de sesión firmada por un año (`middleware.ts` + `server/session.ts`). Cambiar la contraseña cierra la sesión en todos los dispositivos. Tras 10 intentos fallidos desde una IP, el login se bloquea 15 minutos.

Variables: `BASIC_AUTH_USER` y `BASIC_AUTH_PASSWORD` (las credenciales) y `SESSION_SECRET` (firma de la cookie). Si faltan, el sitio no se sirve.

### Instalar como app

Es una PWA (`manifest.webmanifest` + `sw.js`): en Chrome o Brave para Android, menú → "Agregar a la pantalla de inicio" / "Instalar app". Se abre a pantalla completa y funciona sin conexión.

## MCP para Claude

`/api/mcp/<MCP_SECRET>` es un servidor MCP (Streamable HTTP) para agregarlo como conector en Claude. Permite mandarle a Claude la foto de una tabla nutricional (o de un plato) con los gramos, y que registre la comida en el diario y la guarde en la base de alimentos, con su código de barras para que el escáner la encuentre después.

Herramientas: `search_my_foods`, `lookup_barcode`, `log_food`, `save_food`, `get_day_summary`, `delete_diary_entry`, `log_weight`.

La clave secreta en la URL es la credencial (los conectores no pueden iniciar sesión); está en la variable de entorno `MCP_SECRET` (mínimo 32 caracteres). Para rotarla, cambiá la variable, redeployá y actualizá la URL del conector.

Variables de entorno: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (las crea la integración de Upstash), `MCP_SECRET`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`, `SESSION_SECRET`. `DATA_PREFIX` (opcional) cambia el prefijo de las claves en Redis, útil para probar sin tocar los datos reales.

Para correr todo localmente (app + API + MCP): `vercel env pull .env.local && vercel dev`.
