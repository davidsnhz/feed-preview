# Feed Preview

Aplicación web para ver cómo quedarían tus fotos en el feed de tu perfil antes de publicarlas. Gratis, sin registro y sin funciones de pago.

## Qué hace

- Sube una o varias fotos desde tu galería (o arrástralas / pégalas en el ordenador).
- Reordénalas: mantén pulsada una foto y arrástrala a su sitio.
- Toca una foto para ajustar el encuadre, reemplazarla, moverla al inicio o eliminarla.
- Cambia entre cuadrícula 3:4 (la actual) y 1:1 (la clásica).
- Edita el perfil de muestra: foto, usuario, nombre, biografía y contadores.
- Tema claro, oscuro o automático.
- Guarda una imagen del feed completo.
- Se puede instalar en el móvil desde el navegador («Añadir a pantalla de inicio»).

## Privacidad

Las fotos nunca salen de tu dispositivo: se guardan en el almacenamiento local del navegador (IndexedDB). No hay servidor ni cuentas. Si borras los datos del navegador, se borra el feed.

## Desarrollo

```bash
npm install
npm run dev
```

```bash
npm run build
```

Hecho con Vite y JavaScript sin framework. El reordenado usa [SortableJS](https://github.com/SortableJS/Sortable).
