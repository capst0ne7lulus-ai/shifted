/**
 * js/event.js
 * Event Wiring — Shifted. Dashboard
 * DOM ready, keyboard shortcuts, toolbar wiring, resize handler
 */

'use strict';

// ──────────────────────────────────────────────
// DOM READY
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  MapController.initMap();
  _wireToolbar();

  const bms = document.getElementById('bm-status');
  if (bms) bms.textContent = 'OSM';

  setTimeout(() => UI.showToast('Dashboard Shifted. siap digunakan', 'green'), 600);
});

// ──────────────────────────────────────────────
// TOOLBAR WIRING
// ──────────────────────────────────────────────
function _wireToolbar() {
  const map = [
    ['tb-layer',     () => UI.togglePanel('panel-layer')],
    ['tb-basemap',   () => UI.togglePanel('panel-basemap')],
    ['tb-transform', () => UI.togglePanel('panel-transform')],
    ['tb-download',  () => UI.togglePanel('panel-download')],
    ['tb-history',   () => UI.togglePanel('panel-history')],
    ['tb-zoomin',    () => MapController.zoomIn()],
    ['tb-zoomout',   () => MapController.zoomOut()],
    ['tb-info',      () => UI.togglePanel('panel-info')],
  ];
  map.forEach(([id, fn]) => {
    document.getElementById(id)?.addEventListener('click', fn);
  });
}

// ──────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    UI.closeAllPanels();
    MapController.measureClear();
    return;
  }
  // Shortcut M = ukur jarak, N = ukur luas (tanpa Ctrl)
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    const tag = document.activeElement?.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!isInput) {
      if (e.key === 'm' || e.key === 'M') { MapController.measureStart('distance'); return; }
      if (e.key === 'n' || e.key === 'N') { MapController.measureStart('area');     return; }
    }
  }
  if (e.ctrlKey) {
    const actions = {
      '1': 'panel-layer',
      '2': 'panel-basemap',
      '3': 'panel-transform',
      '4': 'panel-download',
      '5': 'panel-info',
      '6': 'panel-history',
    };
    if (actions[e.key]) {
      e.preventDefault();
      UI.togglePanel(actions[e.key]);
    }
    if (e.key === '=' || e.key === '+') { e.preventDefault(); MapController.zoomIn(); }
    if (e.key === '-')                  { e.preventDefault(); MapController.zoomOut(); }
  }
});

// ──────────────────────────────────────────────
// RESIZE
// ──────────────────────────────────────────────
let _rTimer;
window.addEventListener('resize', () => {
  clearTimeout(_rTimer);
  _rTimer = setTimeout(() => {
    MapController.map?.invalidateSize();
  }, 160);
}); 