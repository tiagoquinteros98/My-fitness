# My Fitness

Clon simple de MyFitnessPal con dos funciones:

- **Diario de comidas**: agregá alimentos a Desayuno, Almuerzo, Cena o Snacks, buscándolos por nombre o **escaneando el código de barras** con la cámara. Muestra calorías y macros (carbohidratos, grasas, proteínas) y las calorías restantes contra un objetivo diario.
- **Registro de peso**: un peso por día, gráfico de evolución, historial, cambio total y peso objetivo.

Los datos de los productos vienen de [Open Food Facts](https://world.openfoodfacts.org) (gratis, sin API key). Si un código no existe, podés crear el alimento a mano y queda guardado con ese código para la próxima vez.

Todo se guarda en el navegador (`localStorage`); no hay backend ni cuenta.

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

El sitio está protegido con usuario y contraseña (HTTP Basic Auth) mediante `middleware.ts`. Las credenciales se configuran como variables de entorno del proyecto en Vercel: `BASIC_AUTH_USER` y `BASIC_AUTH_PASSWORD`. Si faltan, el sitio no se sirve.
