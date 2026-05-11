/**
 * js/ui.js
 * UI Controller — Shifted. Dashboard
 *
 * ✔ Manajemen panel (open / close / toggle)
 * ✔ Selektor basemap
 * ✔ Swap datum
 * ✔ Toggle input mode (manual / CSV)
 * ✔ Toggle layer
 * ✔ Toast notification
 * ✔ Panel riwayat transformasi
 */

'use strict';

// ──────────────────────────────────────────────
// PANEL STATE
// ──────────────────────────────────────────────
const _panelState = { active: null };

// ──────────────────────────────────────────────
// PANEL MANAGEMENT
// ──────────────────────────────────────────────
function openPanel(id) {
  if (_panelState.active && _panelState.active !== id) {
    _deactivate(_panelState.active);
  }
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  _panelState.active = id;
  _syncBtn(id, true);

  // Render riwayat setiap kali panel dibuka
  if (id === 'panel-history' && window.renderHistory) {
    window.renderHistory();
  }
}

function closePanel(id) {
  _deactivate(id);
  if (_panelState.active === id) _panelState.active = null;
}

function togglePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.contains('active') ? closePanel(id) : openPanel(id);
}

function closeAllPanels() {
  document.querySelectorAll('.floating-panel.active').forEach(p => _deactivate(p.id));
  _panelState.active = null;
}

function _deactivate(id) {
  document.getElementById(id)?.classList.remove('active');
  _syncBtn(id, false);
}

function _syncBtn(panelId, on) {
  const btnMap = {
    'panel-layer':     'tb-layer',
    'panel-basemap':   'tb-basemap',
    'panel-transform': 'tb-transform',
    'panel-download':  'tb-download',
    'panel-history':   'tb-history',
    'panel-info':      'tb-info',
  };
  const btnId = btnMap[panelId];
  if (btnId) document.getElementById(btnId)?.classList.toggle('on', on);
}

// ──────────────────────────────────────────────
// BASEMAP SELECTOR
// ──────────────────────────────────────────────
function selectBasemap(key) {
  document.querySelectorAll('.bm-card').forEach(c => c.classList.remove('on'));
  document.getElementById(`bm-${key}`)?.classList.add('on');
  MapController.switchBasemap(key);
  const labels = { osm: 'OSM', satellite: 'Google Sat', terrain: 'Terrain', dark: 'Dark' };
  const el = document.getElementById('bm-status');
  if (el) el.textContent = labels[key] || key;
  showToast(`Basemap: ${labels[key] || key}`, 'blue');
}

// ──────────────────────────────────────────────
// INPUT MODE TOGGLE
// ──────────────────────────────────────────────
function switchInputMode(mode) {
  document.getElementById('sec-manual').style.display = mode === 'manual' ? 'block' : 'none';
  document.getElementById('sec-csv').style.display    = mode === 'csv'    ? 'block' : 'none';
  // Re-apply UTM field visibility saat balik ke manual
  if (mode === 'manual') {
    const fmt = document.getElementById('fmt-coord-input')?.value || 'dd';
    updateCoordPlaceholder(fmt);
  }
}

// ──────────────────────────────────────────────
// DATUM SWAP
// ──────────────────────────────────────────────
function swapDatum() {
  const a = document.getElementById('datum-asal');
  const b = document.getElementById('datum-tujuan');
  if (!a || !b) return;
  [a.value, b.value] = [b.value, a.value];
  showToast('Datum ditukar', 'blue');
}

// ──────────────────────────────────────────────
// LAYER TOGGLE
// ──────────────────────────────────────────────
function toggleLayer(key, on) {
  if (key === 'pipeline' || key === 'onwj') {
    if (window.MapController?.toggleWMSLayer) {
      window.MapController.toggleWMSLayer(key, on);
    }
  }
  if (key === 'origin' || key === 'result') {
    if (window.MapController?.togglePlotLayer) {
      window.MapController.togglePlotLayer(key, on);
    }
  }
  const labels = {
    pipeline: 'Pipeline', onwj: 'WK ONWJ',
    origin: 'Titik Asal', result: 'Titik Hasil',
    boundary: 'Batas Wilayah', grid: 'Grid Koordinat',
  };
  showToast(`Layer "${labels[key] || key}" ${on ? 'diaktifkan' : 'dinonaktifkan'}`, 'blue');
}

// ──────────────────────────────────────────────
// COORD INPUT PLACEHOLDER
// ──────────────────────────────────────────────
function updateCoordPlaceholder(fmt) {
  const regular = document.getElementById('input-regular');
  const utm     = document.getElementById('input-utm');
  const el      = document.getElementById('coord-val');

  if (fmt === 'utm') {
    if (regular) regular.style.display = 'none';
    if (utm)     utm.style.display     = 'block';
  } else {
    if (regular) regular.style.display = 'block';
    if (utm)     utm.style.display     = 'none';
    const map = {
      dd:  '-6.2088, 106.8456',
      dms: '6°12\'31.68"S, 106°50\'44.16"E',
      ddm: '6° 12.528\' S, 106° 50.736\' E',
    };
    if (el) el.placeholder = map[fmt] || map.dd;
  }
}

// ──────────────────────────────────────────────
// OPACITY LAYER
// ──────────────────────────────────────────────
function onOpacityChange(val) {
  const lbl = document.getElementById('opacity-lbl');
  if (lbl) lbl.textContent = `${val}%`;
}

// ──────────────────────────────────────────────
// TOAST NOTIFICATION
// ──────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'blue') {
  const el  = document.getElementById('toast');
  const dot = document.getElementById('toast-dot');
  const txt = document.getElementById('toast-txt');
  if (!el || !dot || !txt) return;
  dot.className   = `toast-dot ${type}`;
  txt.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ──────────────────────────────────────────────
// EXPOSE
// ──────────────────────────────────────────────
window.UI = {
  openPanel, closePanel, togglePanel, closeAllPanels,
  selectBasemap, switchInputMode, swapDatum,
  onOpacityChange, toggleLayer, showToast,
  updateCoordPlaceholder,
};

window.closePanel             = closePanel;
window.selectBasemap          = selectBasemap;
window.swapDatum              = swapDatum;
window.switchInputMode        = switchInputMode;
window.onOpacityChange        = onOpacityChange;
window.toggleLayer            = toggleLayer;
window.showToast              = showToast;
window.updateCoordPlaceholder = updateCoordPlaceholder;