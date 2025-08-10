# Almacén Offline PWA

Base mínima de una Progressive Web App lista para funcionar sin conexión.

## Características
- Service Worker con precache y estrategia network-first para HTML
- Manifest listo para instalación
- Página offline

## Desarrollo
Puedes servir la carpeta con cualquier servidor estático. Con Node.js, por ejemplo:

```powershell
npm run start
```

Luego visita http://localhost:5173 y abre las DevTools > Application > Service Workers para verificar el registro.

## Estructura
- `index.html`: página principal
- `offline.html`: fallback sin conexión
- `manifest.webmanifest`: metadata PWA
- `service-worker.js`: caché y estrategias
- `assets/app.js`: registra SW y botón de instalación
- `assets/styles.css`: estilos básicos

## Despliegue
Sírvelo desde raíz en HTTPS (GitHub Pages, Vercel, Netlify). Los paths son relativos para soportar subrutas.

### GitHub Pages
Este repo incluye un workflow que publica desde `main` a GitHub Pages. Tras el primer push, habilita Pages en Settings > Pages con Source: GitHub Actions. La URL será:

- `https://<usuario>.github.io/almacen-offline-pwa/`
