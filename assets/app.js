// Register service worker and handle install prompt
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Register relative to current path for GitHub Pages subpath support
    const swUrl = new URL('service-worker.js', window.location.href).pathname;
    navigator.serviceWorker.register(swUrl).catch(console.error);
  });
}

let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // Hide button regardless of outcome
    installBtn.hidden = true;
    deferredPrompt = null;
    console.log('PWA install', outcome);
  });
}

// --- MVP: Dexie DB schema ---
const db = new Dexie('almacenOffline');
db.version(1).stores({
  materiales: '++id, matricula, nombre, stock, precio, updatedAt',
  historial: '++id, createdAt',
});

// MiniSearch for fuzzy search
let mini;
async function buildIndex() {
  const items = await db.materiales.toArray();
  mini = new MiniSearch({
    fields: ['nombre', 'matricula'],
    storeFields: ['id', 'matricula', 'nombre', 'stock', 'precio'],
    searchOptions: { fuzzy: 0.2, prefix: true }
  });
  mini.addAll(items.map((m) => ({ ...m, id: String(m.id) })));
}

// --- CSV Import with PapaParse (progress + cancel) ---
const csvFile = document.getElementById('csvFile');
const startImportBtn = document.getElementById('startImport');
const cancelImportBtn = document.getElementById('cancelImport');
const mappingDiv = document.getElementById('mapping');
const mapMatricula = document.getElementById('mapMatricula');
const mapNombre = document.getElementById('mapNombre');
const mapStock = document.getElementById('mapStock');
const mapPrecio = document.getElementById('mapPrecio');
const previewDiv = document.getElementById('preview');
const previewTable = document.getElementById('previewTable');
const importStatus = document.getElementById('importStatus');

let papaTask;
let parsedRows = [];

csvFile?.addEventListener('change', () => {
  const f = csvFile.files?.[0];
  if (!f) return;
  startImportBtn.disabled = false;
  importStatus.textContent = '';
  // Parse first 100 rows for preview
  Papa.parse(f, {
    header: true,
    preview: 100,
    skipEmptyLines: true,
    complete: (res) => {
      const cols = res.meta.fields || [];
      fillMapping(cols);
      renderPreview(res.data);
      parsedRows = [];
    },
    error: (err) => toast('Error al leer CSV: ' + err.message)
  });
});

function fillMapping(columns) {
  const selects = [mapMatricula, mapNombre, mapStock, mapPrecio];
  selects.forEach((sel) => {
    sel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '(sin asignar)';
    sel.appendChild(optNone);
    columns.forEach((c) => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
  });
  // heurística simple
  autoSelect(mapMatricula, columns, ['matricula', 'métrica', 'codigo', 'código', 'sku']);
  autoSelect(mapNombre, columns, ['nombre', 'descripcion', 'descripción', 'detalle']);
  autoSelect(mapStock, columns, ['stock', 'cantidad', 'disponible']);
  autoSelect(mapPrecio, columns, ['precio', 'importe', 'valor']);
  mappingDiv.hidden = false;
  previewDiv.hidden = false;
}

function autoSelect(select, columns, candidates) {
  const lower = columns.map((c) => c.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand);
    if (idx >= 0) {
      select.value = columns[idx];
      return;
    }
  }
}

function renderPreview(rows) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  previewTable.innerHTML = '';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  previewTable.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.slice(0, 20).forEach((r) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = r[c];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  previewTable.appendChild(tbody);
}

startImportBtn?.addEventListener('click', () => {
  const f = csvFile.files?.[0];
  if (!f) return;
  startImportBtn.disabled = true;
  cancelImportBtn.hidden = false;
  importStatus.textContent = 'Leyendo CSV...';
  parsedRows = [];

  papaTask = Papa.parse(f, {
    header: true,
    skipEmptyLines: true,
    chunkSize: 1024 * 64,
    chunk: (chunk) => {
      parsedRows.push(...chunk.data);
      importStatus.textContent = `Leídas ${parsedRows.length} filas...`;
    },
    complete: async () => {
      importStatus.textContent = 'Insertando en base local...';
      await insertInBatches(parsedRows);
      await buildIndex();
      importStatus.textContent = `Importación completa: ${parsedRows.length} filas.`;
      cancelImportBtn.hidden = true;
      startImportBtn.disabled = false;
      toast('Importación finalizada');
      renderSearch();
    },
    error: (err) => {
      toast('Error en importación: ' + err.message);
      cancelImportBtn.hidden = true;
      startImportBtn.disabled = false;
    }
  });
});

cancelImportBtn?.addEventListener('click', () => {
  if (papaTask && papaTask.abort) papaTask.abort();
  cancelImportBtn.hidden = true;
  startImportBtn.disabled = false;
  importStatus.textContent = 'Importación cancelada';
});

async function insertInBatches(rows) {
  const map = (r) => ({
    matricula: (r[mapMatricula.value] || '').toString().trim(),
    nombre: (r[mapNombre.value] || '').toString().trim(),
    stock: Number(r[mapStock.value] ?? 0) || 0,
    precio: Number(r[mapPrecio.value] ?? 0) || 0,
    updatedAt: Date.now(),
  });
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(map).filter((x) => x.matricula || x.nombre);
    // unicidad básica por matricula: si existe, actualiza
    await db.transaction('rw', db.materiales, async () => {
      for (const item of batch) {
        if (item.matricula) {
          const existing = await db.materiales.where('matricula').equals(item.matricula).first();
          if (existing) {
            await db.materiales.update(existing.id, { ...existing, ...item });
          } else {
            await db.materiales.add(item);
          }
        } else {
          await db.materiales.add(item);
        }
      }
    });
    importStatus.textContent = `Insertadas ${Math.min(i + BATCH, rows.length)} / ${rows.length}`;
    await sleep(0);
  }
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

// --- Search ---
const searchInput = document.getElementById('searchInput');
const resultsUl = document.getElementById('results');
const resultsCount = document.getElementById('resultsCount');

searchInput?.addEventListener('input', debounce(async () => {
  await ensureIndex();
  const q = searchInput.value.trim();
  const hits = q ? mini.search(q) : (await db.materiales.limit(100).toArray()).map((m) => ({ id: String(m.id), score: 1, ...m }));
  renderResults(hits);
}, 150));

async function ensureIndex() {
  if (!mini) await buildIndex();
}

function renderResults(hits) {
  resultsUl.innerHTML = '';
  resultsCount.textContent = `${hits.length} resultados`;
  hits.slice(0, 200).forEach((h) => {
    const li = document.createElement('li');
    li.className = 'row between';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${escapeHTML(h.nombre || '')}</strong><br/><small class="muted">${escapeHTML(h.matricula || '')}</small>`;
    const right = document.createElement('div');
    right.innerHTML = `<span class="tag ${h.stock <= 0 ? 'danger' : ''}">Stock: ${h.stock ?? 0}</span>`;
    li.appendChild(left);
    li.appendChild(right);
    resultsUl.appendChild(li);
  });
}

function escapeHTML(s) { return (s ?? '').toString().replace(/[&<>"]|'/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt','"':'&quot;','\'':'&#39;'}[c])); }

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
}

// --- UI Toast ---
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('show'); }, 10);
  setTimeout(() => { el.classList.remove('show'); el.remove(); }, 3000);
}

// Initial render
(async () => {
  await ensureIndex();
  const initial = await db.materiales.limit(50).toArray();
  renderResults(initial.map((m) => ({ id: String(m.id), score: 1, ...m })));
})();
