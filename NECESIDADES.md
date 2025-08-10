# Necesidades del proyecto

Este documento consolida el estado actual, el alcance solicitado y un plan accionable para las próximas iteraciones.

## Contexto breve

- Proyecto: PWA “Almacén Offline” (sin backend), con importación de CSV a IndexedDB, búsqueda local, carrito “Copiar para SAP”, historial, ABM Empresas/Personas y panel de Chat (comandos locales).
- Stack objetivo: HTML + CSS + JS (ESM), dependencias por CDN o bundle: Dexie, PapaParse, MiniSearch. Service Worker, manifest e íconos. Scripts de desarrollo para servir local y Pages.
- Stack actual (repo): PWA base estática sin dependencias externas aún (HTML/CSS/JS), Service Worker básico, manifest con íconos SVG embebidos, GitHub Pages workflow y scripts `npm run start`/`serve`.

## Lo realizado

En repositorio (hecho):
- Base PWA mínima lista: `index.html`, `manifest.webmanifest`, `service-worker.js`, `offline.html`, `assets/app.js`, `assets/styles.css`.
- Rutas relativas para soportar subruta (GitHub Pages).
- Despliegue automático con GitHub Pages (workflow), `.nojekyll` y `404.html`.
- Soporte iOS (meta tags) y `apple-touch-icon`.
- Scripts locales (`package.json`): `npm run start` / `npm run serve`.

Alcance funcional solicitado (target):
- Materiales: búsqueda, lista, agregado al carrito, resaltado stock=0.
- Carrito: edición de cantidades, quitar ítems, “Copiar para SAP”.
- Historial: guarda snapshot al copiar, permite volver a copiar.
- Empresas/Personas: altas, edición, borrado, filtro postergable, vínculo 1-N.
- Chat (Beta): comandos “solo …”, “filtrar por matricula:…”, “limpiar filtros”.
- CSV import: diálogo con vista previa, mapeo de columnas, autodetección básica, inserción en lotes en IndexedDB.
- Utilidades: toasts, clipboard, indicador online, helpers varios.
- Estilos: layout responsive y dark theme.

Nota: El alcance funcional anterior está pendiente de implementación en el repo y se toma como objetivo de siguiente(s) sprint(s).

## Lo solicitado (requisitos cubiertos/objetivo)

- Offline-first, sin backend.
- Importar CSV y mapear columnas a catálogo de materiales.
- Búsqueda tolerante a errores tipográficos.
- Armar carrito y copiar formato “matrícula, cantidad” para SAP.
- Historial local de pedidos.
- ABM simple de Empresas y Personas.
- Publicable como estático (GitHub Pages).

## Lo que falta (gaps y pendientes)

Publicación:
- Confirmar Pages funcionando (raíz o subruta) y rutas de assets.

UX/Flujos:
- Progreso y cancelación durante importación de CSV grandes.
- Estado “actualización disponible” del Service Worker (skipWaiting + aviso para recargar).
- Indicador de filtros activos y botón “Limpiar filtros”.

Datos:
- Exportar/Importar backup (JSON/CSV) de toda la base local.
- Reglas de unicidad (matrícula única, nombre de empresa único) y validaciones.

Robustez:
- Sanitización extra de CSV (evitar fórmulas al exportar: =, +, -, @).
- Manejo de errores de red/CDN en modo offline.

Accesibilidad:
- Focus management en modales, ARIA roles/labels completos, navegación por teclado.

Observabilidad:
- Logs mínimos y reporting de errores (en cliente).

Automatización:
- Linter/formatter (ESLint/Prettier).
- GitHub Actions para Pages (si se introduce build) y chequeos básicos.

## Mejoras recomendadas

Bundling local (Vite):
- Empaquetar dependencias (Dexie, PapaParse, MiniSearch) para disponibilidad offline desde primera carga.
- Salida en carpeta `docs/` para Pages y hash de archivos para cache busting.

Performance UX:
- Virtualización de listas si el catálogo es grande.
- Debounce en búsqueda; reindexación incremental tras importación.
- Indicador de progreso por lotes al insertar.

Carrito/Historial:
- Totales/estimaciones si hay precios (opcional).
- Exportar pedido en CSV/Excel/PDF; imprimir.

ABM:
- Reemplazar prompt/confirm por modales coherentes con la UI.
- Búsqueda/paginación para Empresas/Personas.

Chat:
- Mostrar los filtros aplicados como chips; autocompletado de comandos.

## Plan para migrar y seguir con Copilot en VS Code

Preparar entorno
- Clona el repo y ábrelo en VS Code.
- Extensiones: GitHub Copilot, GitHub Copilot Chat, EditorConfig, ESLint, Prettier, Live Server (opcional).
- Node 18+.

Opcional: incorporar Vite (build a `docs/` para Pages)
- Objetivo: empaquetar dependencias y servir desde `docs`.

Prompts para Copilot (VS Code Chat)
- “Crea un package.json con scripts dev, build y preview para un proyecto Vite vanilla JS que toma como entrada public/index.html y emite a docs/.”
- “Genera un vite.config.js que copie manifest e íconos, mantenga rutas relativas (‘./’) y coloque la salida en docs/ para GitHub Pages.”
- “Refactoriza el registro del Service Worker para soportar actualización (skipWaiting + prompt de recarga).”
- “Ajusta imports para que Dexie, PapaParse y MiniSearch se sirvan desde el bundle y no desde CDN.”
- Luego: `npm i -D vite`; `npm run dev`; `npm run build`; configura Pages a main → /docs.

Calidad y automatización
- “Añade ESLint + Prettier al proyecto con configuración para ES Modules en navegador. Crea .eslintrc, .prettierrc y un script npm ‘lint’.”
- “Crea un workflow .github/workflows/pages.yml que haga npm ci, npm run build y publique docs/ a GitHub Pages.”

Funcionales pendientes prioritarios
- Importación CSV (progreso/cancelación):
   - “En csv-import.js, agrega un indicador de progreso por lotes y un botón ‘Cancelar importación’ que aborte el proceso de inserción.”
- Backup/restore:
   - “Implementa en utils/db una función exportarBase() que lea todas las tablas Dexie y descargue un JSON, y otra importarBase(json) con validación básica.”
   - “Añade botones ‘Exportar base’ e ‘Importar base’ en el header y su UI.”
- Filtros visibles:
   - “Agrega chips de filtros activos (texto y matrícula) sobre la lista de materiales y un botón ‘Limpiar filtros’.”
- SW update UX:
   - “Modifica el Service Worker para lanzar un evento ‘sw:update’ cuando haya una nueva versión y en index mostrar un toast con ‘Actualizar’ que haga skipWaiting + clientsClaim + recargar.”

Accesibilidad y UX
- “Añade roles ARIA y manejo de foco al modal de importación: focus trap, cierre con Esc y retorno del foco al botón que abrió el modal.”
- “Agrega atajos de teclado: Ctrl+K para la búsqueda, Ctrl+I para Importar CSV.”

Hardening y datos
- “Valida unicidad de matrícula al importar y al agregar manualmente al carrito: merge de cantidades en lugar de duplicar.”
- “Implementa sanitización de valores al exportar CSV para evitar CSV injection (prefijar ‘\t’ en celdas que comienzan con =, +, -, @).”

Publicación
- Si no usas Vite: mueve `public/` a `docs/` y configura Pages en main → /docs.
- Si usas Vite: ajusta `base` y `assetsDir` para rutas relativas; verifica que manifest e íconos queden en `docs/`.

## Checklist rápido

- [ ] Pages configurado y URL pública funcional.
- [ ] Dependencias empaquetadas (sin CDN) o plan claro para primer cacheo offline.
- [ ] Progreso/cancelación en importación CSV.
- [ ] Backup/restore de base local.
- [ ] Chips de filtros y botón limpiar.
- [ ] UX de actualización del SW.
- [ ] ESLint/Prettier y workflow de Pages.
