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
  // SAP: "Matrícula" suele ser código de material; "Texto breve de material" = nombre
  autoSelect(mapMatricula, columns, ['matricula', 'matrícula', 'codigo', 'código', 'sku', 'material', 'id material']);
  autoSelect(mapNombre, columns, ['nombre', 'descripcion', 'descripción', 'detalle', 'texto breve de material', 'texto']);
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
const stockFilter = document.getElementById('stockFilter');
const suggestions = document.getElementById('suggestions');
const resultsUl = document.getElementById('results');
const resultsCount = document.getElementById('resultsCount');

searchInput?.addEventListener('input', debounce(async () => {
  await ensureIndex();
  const q = searchInput.value.trim();
  if (q) renderSuggestions(q); else hideSuggestions();
  const hits = await searchWithStock(q, stockFilter?.value || 'all');
  renderResults(hits);
}, 150));

stockFilter?.addEventListener('change', async () => {
  const q = searchInput.value.trim();
  const hits = await searchWithStock(q, stockFilter.value);
  renderResults(hits);
});

async function searchWithStock(q, stockMode) {
  let hits;
  if (q) {
    // search by name or matricula; ensure both are indexed
    hits = mini.search(q).map((h) => ({ ...h }));
  } else {
    hits = (await db.materiales.limit(200).toArray()).map((m) => ({ id: String(m.id), score: 1, ...m }));
  }
  if (stockMode === '>0') hits = hits.filter((x) => (x.stock ?? 0) > 0);
  if (stockMode === '=0') hits = hits.filter((x) => (x.stock ?? 0) === 0);
  return hits;
}

function renderSuggestions(q) {
  const hits = mini.search(q, { prefix: true });
  suggestions.innerHTML = '';
  hits.slice(0, 8).forEach((h) => {
    const li = document.createElement('li');
    li.textContent = `${h.nombre} — ${h.matricula}`;
    li.addEventListener('click', () => {
      searchInput.value = h.nombre;
      hideSuggestions();
      renderResults([h]);
    });
    suggestions.appendChild(li);
  });
  suggestions.hidden = hits.length === 0;
}

function hideSuggestions() { suggestions.hidden = true; suggestions.innerHTML = ''; }

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
    right.innerHTML = `<span class=\"tag ${h.stock <= 0 ? 'danger' : ''}\">Stock: ${h.stock ?? 0}</span> <button class="small secondary" data-add="${h.id}">Agregar</button>`;
    li.appendChild(left);
    li.appendChild(right);
    resultsUl.appendChild(li);
  });
  resultsUl.querySelectorAll('button[data-add]').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = Number(e.currentTarget.getAttribute('data-add'));
    const item = await db.materiales.get(id);
    if (!item) return;
    addToCart(item);
  }));
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

// --- Cart & History ---
const cartList = document.getElementById('cartList');
const copyForSAP = document.getElementById('copyForSAP');
const clearCart = document.getElementById('clearCart');
const historyList = document.getElementById('historyList');

let cart = loadCart();
renderCart();
renderHistory();

function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}
function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }

function addToCart(item) {
  const idx = cart.findIndex((c) => c.id === item.id);
  if (idx >= 0) cart[idx].qty += 1; else cart.push({ id: item.id, matricula: item.matricula, nombre: item.nombre, qty: 1 });
  saveCart();
  renderCart();
  toast('Agregado al carrito');
}

async function renderCart() {
  cartList.innerHTML = '';
  for (const line of cart) {
    const li = document.createElement('li');
    li.className = 'row between';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${escapeHTML(line.nombre)}</strong><br/><small class="muted">${escapeHTML(line.matricula)}</small>`;
    const right = document.createElement('div');
    right.innerHTML = `<input type="number" min="1" value="${line.qty}" data-qty="${line.id}" /> <button class="small secondary" data-del="${line.id}">Quitar</button>`;
    li.appendChild(left);
    li.appendChild(right);
    cartList.appendChild(li);
  }
  cartList.querySelectorAll('input[data-qty]').forEach((inp) => inp.addEventListener('change', (e) => {
    const id = Number(e.target.getAttribute('data-qty'));
    const val = Math.max(1, Number(e.target.value) || 1);
    const idx = cart.findIndex((c) => c.id === id);
    if (idx >= 0) { cart[idx].qty = val; saveCart(); }
  }));
  cartList.querySelectorAll('button[data-del]').forEach((btn) => btn.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.getAttribute('data-del'));
    cart = cart.filter((c) => c.id !== id);
    saveCart();
    renderCart();
  }));
}

copyForSAP?.addEventListener('click', async () => {
  if (!cart.length) { toast('Carrito vacío'); return; }
  const lines = cart.map((l) => `${l.matricula}, ${l.qty}`);
  const text = lines.join('\n');
  await navigator.clipboard.writeText(text);
  toast('Copiado para SAP');
  await saveHistorySnapshot();
});

clearCart?.addEventListener('click', () => {
  cart = []; saveCart(); renderCart();
});

async function saveHistorySnapshot() {
  const snap = { createdAt: Date.now(), items: cart.slice() };
  const id = await db.historial.add(snap);
  renderHistory();
  return id;
}

async function renderHistory() {
  const rows = await db.historial.orderBy('createdAt').reverse().limit(20).toArray();
  historyList.innerHTML = '';
  for (const h of rows) {
    const li = document.createElement('li');
    const date = new Date(h.createdAt).toLocaleString();
    const count = h.items?.length || 0;
    li.className = 'row between';
    li.innerHTML = `<div><strong>Pedido</strong> <span class="muted">${date}</span><br/><small class="muted">${count} líneas</small></div><div><button class="small secondary" data-copy="${h.id}">Copiar</button></div>`;
    historyList.appendChild(li);
  }
  historyList.querySelectorAll('button[data-copy]').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = Number(e.currentTarget.getAttribute('data-copy'));
    const h = await db.historial.get(id);
    if (!h) return;
    const text = (h.items || []).map((l) => `${l.matricula}, ${l.qty}`).join('\n');
    await navigator.clipboard.writeText(text);
    toast('Copiado');
  }));
}

// --- Service Worker update UX ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // page reloaded or new SW controlling
  });
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW?.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateToast(reg);
        }
      });
    });
  });
}

function showUpdateToast(reg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = 'Nueva versión disponible <button class="small primary" id="reloadNow">Actualizar</button>';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  el.querySelector('#reloadNow')?.addEventListener('click', async () => {
    // Try skipWaiting then reload
    try { await reg.update(); } catch {}
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => window.location.reload(), 300);
  });
}
