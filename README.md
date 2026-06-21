# Grimorio Arcano

App de gestión de conjuros para D&D 3.5 (Mago / Hechicero), pensada para usar durante las sesiones de mesa desde el móvil.

## Funcionalidades

- **Conjuros conocidos**: marca los conjuros que tu personaje conoce, con filtros por nivel y escuela.
- **Preparados hoy**: elige qué conjuros conocidos quedan listos para lanzar, aplicando dotes de metamagia que ajustan el nivel de espacio efectivo.
- **Dotes de metamagia**: gestiona tus dotes con modificador de nivel editable, incluyendo dotes homebrew.
- **Todos los conjuros**: catálogo completo de 629 conjuros de Mago/Hechicero (Manual del Jugador 3.5 + Compendio de Conjuros), con opción de añadir conjuros propios.

Todo el estado del personaje se guarda en `localStorage` del navegador (sin backend ni cuentas de usuario).

## Desarrollo local

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build
npm run preview
```

## Despliegue

Proyecto listo para desplegar en [Vercel](https://vercel.com): importar el repositorio y Vercel detecta automáticamente la configuración de Vite (`npm run build`, carpeta de salida `dist`).

## Estructura

```
src/
  App.jsx          # Componente principal y toda la lógica de la app
  main.jsx         # Punto de entrada de React
  data/
    conjuros.json  # Base de datos de 629 conjuros
    dotes.json     # Dotes de metamagia
  assets/
    cover.jpg          # Portada (libro de cuero)
    page-header.jpg     # Cabecera de papiro (fija)
    page-middle.jpg      # Textura de papiro central (repetible)
    page-footer.jpg       # Pie de papiro
```
