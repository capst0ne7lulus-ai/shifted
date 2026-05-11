/**
 * js/map.js
 * Leaflet Map Controller — Shifted. Dashboard
 *
 * ✔ Map init, basemap switching
 * ✔ WMS Layer management (GeoServer)
 * ✔ plotPointPair — marker asal + hasil + garis putus-putus
 * ✔ Legend kotak info di pojok kiri bawah peta
 * ✔ Supabase Shapefile Layer (data_peta) — UTM 48S → WGS84
 */

'use strict';

// ══════════════════════════════════════════════
// ★ KONFIGURASI GEOSERVER
// ══════════════════════════════════════════════
const GEOSERVER = {
  url:       'http://localhost:8080/geoserver/Try2/wms',
  workspace: 'Try2',
};



// ══════════════════════════════════════════════
// ★ KONFIGURASI SUPABASE
// ══════════════════════════════════════════════

const SUPABASE_URL = 'https://vfbuxzluwafagicjuupc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lF1YmyuuZWn4AdO9wazrDQ_-2C_tEQD';
const SUPABASE_TABLE = 'Minas_Batak';
const SUPABASE_WKT_COL = 'WKT';
const SUPABASE_PAGE_SIZE = 100;

// ──────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────
let _map          = null;
let _baseTile     = null;
let _lineGroup    = null;
let _originGroup  = null;
let _resultGroup  = null;
let _markers      = null;
let _clickedCoord = null;



// Supabase layer state — data_peta (polygon)
let _supabaseLayer   = null;
let _supabaseLoaded  = false;
let _supabaseVisible = false;
let _supabaseClient  = null;

// Supabase layer state — data_jalan (linestring)
let _jalanLayer   = null;
let _jalanLoaded  = false;
let _jalanVisible = false;

// Supabase layer state — Well (point)
let _wellLayer   = null;
let _wellLoaded  = false;
let _wellVisible = false;

// Supabase layer state — WK_Rokan (polygon)
let _wkRokanLayer   = null;
let _wkRokanLoaded  = false;
let _wkRokanVisible = false;

// Supabase layer state — Pipeline (linestring)
let _pipelineLayer   = null;
let _pipelineLoaded  = false;
let _pipelineVisible = false;

// ──────────────────────────────────────────────
// BASEMAP DEFINITIONS
// ──────────────────────────────────────────────
const TILES = {
  osm: {
    url:  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    opts: {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    },
  },
  satellite: {
    url:  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    opts: { attribution: '© Google Maps', maxZoom: 20, subdomains: [] },
  },
  terrain: {
    url:  'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    opts: { attribution: '© OpenTopoMap', maxZoom: 17 },
  },
  dark: {
    url:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    opts: { attribution: '© CARTO', maxZoom: 19, subdomains: 'abcd' },
  },
};

// ──────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────
function initMap() {
  _map = L.map('map', {
    center: [0.5071, 101.4478],  // Pekanbaru, Riau
    zoom: 11,
    zoomControl: false,
    attributionControl: true,
  });

  _baseTile    = L.tileLayer(TILES.osm.url, TILES.osm.opts).addTo(_map);
  _lineGroup   = L.layerGroup().addTo(_map);
  _originGroup = L.layerGroup().addTo(_map);
  _resultGroup = L.layerGroup().addTo(_map);
  _markers     = L.layerGroup().addTo(_map);

  _supabaseLayer = L.featureGroup();  // belum ditambah ke map, menunggu toggle
  _jalanLayer    = L.featureGroup();  // layer data_jalan
  _wellLayer     = L.featureGroup();  // layer Well (point)
  _wkRokanLayer  = L.featureGroup();  // layer WK_Rokan (polygon)
  _pipelineLayer = L.featureGroup();  // layer Pipeline (linestring)

  _map.on('click',     _onMapClick);
  _map.on('mousemove', _onMouseMove);
  _map.on('mouseout',  _onMouseOut);

  // ★ Scale bar — disembunyikan dari peta, nilainya ditampilkan di status bar kanan bawah
  const _scaleCtrl = L.control.scale({
    position: 'bottomleft',
    metric:   true,
    imperial: false,
    maxWidth: 150,
  }).addTo(_map);

  // Sembunyikan elemen scale bar Leaflet setelah render
  setTimeout(() => {
    const scaleEl = document.querySelector('.leaflet-control-scale');
    if (scaleEl) scaleEl.style.display = 'none';
  }, 100);

  // Update teks skala di status bar setiap zoom berubah
  function _updateScaleStatus() {
    const scaleLineEl = document.querySelector('.leaflet-control-scale-line');
    const statusEl    = document.getElementById('scale-status');
    if (scaleLineEl && statusEl) {
      statusEl.textContent = scaleLineEl.textContent || '—';
    }
  }

  _map.on('zoomend',  _updateScaleStatus);
  _map.on('moveend',  _updateScaleStatus);
  setTimeout(_updateScaleStatus, 300);

  _injectStyles();

  // Inisialisasi Supabase client (butuh @supabase/supabase-js dimuat di HTML)
  if (window.supabase && window.supabase.createClient) {
    _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
}

// ──────────────────────────────────────────────
// BASEMAP SWITCHING
// ──────────────────────────────────────────────
function switchBasemap(key) {
  if (!_map || !TILES[key]) return;
  if (_baseTile) _map.removeLayer(_baseTile);
  _baseTile = L.tileLayer(TILES[key].url, TILES[key].opts).addTo(_map);
  _baseTile.setZIndex(0);
}



// ══════════════════════════════════════════════
// ★ SUPABASE SHAPEFILE LAYER
// ══════════════════════════════════════════════

/**
 * Konversi koordinat UTM Zone 47N → [lat, lon] WGS84
 * Digunakan untuk layer Minas_Batak (EPSG:32647).
 * Menggunakan proj4js bila tersedia, fallback aproksimasi jika tidak.
 */
function _utmToLatLng(x, y) {
  if (window.proj4) {
    // Definisi EPSG:32647 (UTM Zone 47 North)
    if (!proj4.defs('EPSG:32647')) {
      proj4.defs('EPSG:32647',
        '+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs');
    }
    const [lng, lat] = proj4('EPSG:32647', 'WGS84', [x, y]);
    return [lat, lng];
  }
  // Fallback aproksimasi Zone 47N (kurang akurat, pastikan proj4js dimuat)
  const lng = (x - 500000) / 111320 + 99;
  const lat = y / 110540;
  return [lat, lng];
}

/**
 * Parse WKT MULTIPOLYGON / POLYGON (dengan atau tanpa Z) ke GeoJSON.
 * Koordinat dikonversi UTM 48S → WGS84.
 */
function _parseWKTtoGeoJSON(wktStr) {
  if (!wktStr) return null;
  try {
    // Bersihkan dimensi Z
    const clean = wktStr
      .replace(/MULTIPOLYGON\s+Z/gi, 'MULTIPOLYGON')
      .replace(/POLYGON\s+Z/gi, 'POLYGON')
      // Hapus nilai Z (angka ketiga dalam tiap triplet koordinat)
      .replace(/(\-?\d+\.?\d*)\s+(\-?\d+\.?\d*)\s+0/g, '$1 $2');

    const type = clean.match(/^(MULTIPOLYGON|POLYGON)/i)?.[1]?.toUpperCase();
    if (!type) return null;

    // Ekstrak semua ring koordinat
    const ringRegex = /\(([^()]+)\)/g;
    const rings = [];
    let m;
    while ((m = ringRegex.exec(clean)) !== null) {
      const pts = m[1].trim().split(',').map(pair => {
        const [xStr, yStr] = pair.trim().split(/\s+/);
        const x = parseFloat(xStr), y = parseFloat(yStr);
        const [lat, lng] = _utmToLatLng(x, y);
        return [lng, lat]; // GeoJSON: [lon, lat]
      });
      if (pts.length >= 3) rings.push(pts);
    }

    if (!rings.length) return null;

    if (type === 'POLYGON') {
      return { type: 'Polygon', coordinates: rings };
    }

    // MULTIPOLYGON: grup rings per pasangan kurung terluar
    // Sederhana: setiap ring diperlakukan sebagai polygon terpisah
    const polys = rings.map(r => [r]);
    return { type: 'MultiPolygon', coordinates: polys };

  } catch (e) {
    console.warn('[map.js] WKT parse error:', e);
    return null;
  }
}

/** Ambil semua baris dari Supabase dengan pagination */
async function _fetchAllSupabaseRows() {
  if (!_supabaseClient) {
    throw new Error('Supabase client belum diinisialisasi. Pastikan @supabase/supabase-js dimuat.');
  }
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await _supabaseClient
      .from(SUPABASE_TABLE)
      .select('*')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows = rows.concat(data);
    from += SUPABASE_PAGE_SIZE;
    if (data.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

/** Render baris Supabase sebagai GeoJSON layer di peta */
function _renderSupabaseRows(rows) {
  _supabaseLayer.clearLayers();
  let count = 0;

  rows.forEach(row => {
    const geom = _parseWKTtoGeoJSON(row[SUPABASE_WKT_COL]);
    if (!geom) return;

    const geoLayer = L.geoJSON(geom, {
      style: {
        color:       '#f59f00',
        weight:      1.5,
        opacity:     0.9,
        fillColor:   '#f59f00',
        fillOpacity: 0.15,
      },
      onEachFeature(feature, lyr) {
        const idField = ['Field', 'FIELD', 'NAME', 'Id', 'OBJECTID']
          .find(f => row[f] !== null && row[f] !== undefined && row[f] !== '');
        if (idField) lyr.bindTooltip(String(row[idField]), {
          sticky: true, direction: 'top', className: 'map-layer-tooltip',
        });
        lyr.on({
          mouseover(e) {
            e.target.setStyle({ weight: 2.5, fillOpacity: 0.35, color: '#4f5ef7', fillColor: '#4f5ef7' });
          },
          mouseout(e) {
            e.target.setStyle({ weight: 1.5, fillOpacity: 0.15, color: '#f59f00', fillColor: '#f59f00' });
          },
          click() { _showSupabasePopup(row, lyr); }
        });
      }
    });

    _supabaseLayer.addLayer(geoLayer);
    count++;
  });

  return count;
}

/** Popup info fitur Supabase — ikuti gaya popup dashboard */
function _showSupabasePopup(row, lyr) {
  const SKIP = [SUPABASE_WKT_COL, 'geom', 'geometry', 'wkb_geometry'];
  const keys = Object.keys(row).filter(k => !SKIP.includes(k));

  const rows = keys.map(k => `
    <div class="map-popup-row">
      <div class="map-popup-label">${k}</div>
      <div class="map-popup-coord" style="color:var(--text-primary);font-size:11px;">
        ${row[k] !== null && row[k] !== '' ? row[k] : '<span style="color:var(--text-muted)">—</span>'}
      </div>
    </div>`).join('');

  const center = lyr.getBounds ? lyr.getBounds().getCenter() : lyr.getLatLng();
  L.popup({ maxWidth: 280, maxHeight: 320 })
    .setLatLng(center)
    .setContent(`
      <div class="map-popup" style="max-height:300px;overflow-y:auto;">
        <div class="map-popup-title" style="color:#f59f00;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="#f59f00" stroke-width="2.5" stroke-linecap="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/>
          </svg>
          Batas Lapangan
        </div>
        ${rows}
      </div>`)
    .openOn(_map);
}

/**
 * Toggle layer Supabase (data_peta).
 * Load data dari Supabase hanya sekali; berikutnya cukup show/hide.
 * @param {boolean} on
 */
async function toggleSupabaseLayer(on) {
  if (!_map) return;

  if (on) {
    _supabaseVisible = true;
    _map.addLayer(_supabaseLayer);

    if (!_supabaseLoaded) {
      window.UI?.showToast('Memuat data peta dari Supabase…', 'blue');
      try {
        const rows = await _fetchAllSupabaseRows();
        const count = _renderSupabaseRows(rows);
        _supabaseLoaded = true;
        window.UI?.showToast(`${count} fitur berhasil dimuat`, 'green');
      } catch (err) {
        console.error('[map.js] Gagal load Supabase:', err);
        window.UI?.showToast('Gagal memuat data peta: ' + (err.message || err), 'amber');
        _supabaseVisible = false;
        _map.removeLayer(_supabaseLayer);
        const chk = document.getElementById('toggle-supabase');
        if (chk) chk.checked = false;
        return;
      }
    }
    try {
      const bounds = _supabaseLayer.getBounds();
      if (bounds.isValid()) _map.fitBounds(bounds, { padding: [40, 40] });
    } catch (_) {}
  } else {
    _supabaseVisible = false;
    _map.removeLayer(_supabaseLayer);
  }
}

// ══════════════════════════════════════════════
// ★ DATA JALAN LAYER (MULTILINESTRING)
// ══════════════════════════════════════════════

/** Parse WKT MULTILINESTRING Z ke GeoJSON, konversi UTM 48S → WGS84 */
function _parseLinestringWKT(wktStr) {
  if (!wktStr) return null;
  try {
    // Hapus tipe Z dan strip nilai Z (angka ketiga tiap titik)
    const clean = wktStr
      .replace(/MULTILINESTRING\s+Z\s*/gi, 'MULTILINESTRING ')
      .replace(/LINESTRING\s+Z\s*/gi, 'LINESTRING ')
      // Strip Z value: setiap triplet "x y z" → "x y"
      .replace(/(-?\d+\.?\d*(?:e[+-]?\d+)?)\s+(-?\d+\.?\d*(?:e[+-]?\d+)?)\s+(-?\d+\.?\d*(?:e[+-]?\d+)?)/g, '$1 $2');

    const isMulti = /^MULTILINESTRING/i.test(clean.trim());
    const ringRegex = /\(([^()]+)\)/g;
    const lines = [];
    let m;
    while ((m = ringRegex.exec(clean)) !== null) {
      const pts = m[1].trim().split(',').map(pair => {
        const parts = pair.trim().split(/\s+/);
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (isNaN(x) || isNaN(y)) return null;
        const [lat, lng] = _utmToLatLng(x, y);
        return [lng, lat];
      }).filter(Boolean);
      if (pts.length >= 2) lines.push(pts);
    }
    if (!lines.length) return null;
    return isMulti
      ? { type: 'MultiLineString', coordinates: lines }
      : { type: 'LineString',      coordinates: lines[0] };
  } catch (e) {
    console.warn('[map.js] Jalan WKT parse error:', e);
    return null;
  }
}

/** Fetch semua baris data_jalan dengan pagination.
 *  Mencoba kolom "WKT" (quoted) dan "wkt" (lowercase) secara otomatis. */
async function _fetchJalanRows() {
  if (!_supabaseClient) throw new Error('Supabase client belum diinisialisasi.');
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await _supabaseClient
      .from('data_jalan')
      .select('*')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows = rows.concat(data);
    from += SUPABASE_PAGE_SIZE;
    if (data.length < SUPABASE_PAGE_SIZE) break;
  }

  // Deteksi nama kolom WKT otomatis (case-insensitive)
  if (rows.length > 0) {
    const sample = rows[0];
    const wktKey = Object.keys(sample).find(k => k.toLowerCase() === 'wkt');
    if (wktKey && wktKey !== 'WKT') {
      // Normalisasi semua baris supaya selalu pakai key 'WKT'
      rows = rows.map(r => ({ ...r, WKT: r[wktKey] }));
    }
    console.log(`[map.js] data_jalan: ${rows.length} baris, kolom WKT ditemukan sebagai "${wktKey}"`);
  }
  return rows;
}

/** Render baris data_jalan sebagai polyline layer */
function _renderJalanRows(rows) {
  _jalanLayer.clearLayers();
  let count = 0;
  const SKIP = ['WKT', 'geom', 'geometry', 'id'];

  rows.forEach(row => {
    const geom = _parseLinestringWKT(row['WKT']);
    if (!geom) return;

    const defaultStyle = { color: '#e64d3d', weight: 2, opacity: 0.85 };
    const hoverStyle   = { color: '#4f5ef7', weight: 3.5, opacity: 1 };

    const geoLayer = L.geoJSON(geom, {
      style: defaultStyle,
      onEachFeature(feature, lyr) {
        lyr.on({
          mouseover(e) { e.target.setStyle(hoverStyle); },
          mouseout(e)  { e.target.setStyle(defaultStyle); },
          click() {
            const keys  = Object.keys(row).filter(k => !SKIP.includes(k));
            const rows_ = keys.map(k => `
              <div class="map-popup-row">
                <div class="map-popup-label">${k}</div>
                <div class="map-popup-coord" style="color:var(--text-primary);font-size:11px;">
                  ${row[k] !== null && row[k] !== '' ? row[k] : '<span style="color:var(--text-muted)">—</span>'}
                </div>
              </div>`).join('');

            const center = lyr.getBounds ? lyr.getBounds().getCenter() : lyr.getLatLng();
            L.popup({ maxWidth: 280, maxHeight: 320 })
              .setLatLng(center)
              .setContent(`
                <div class="map-popup" style="max-height:300px;overflow-y:auto;">
                  <div class="map-popup-title" style="color:#e64d3d;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                         stroke="#e64d3d" stroke-width="2.5" stroke-linecap="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Data Jalan
                  </div>
                  ${rows_}
                </div>`)
              .openOn(_map);
          }
        });
      }
    });

    _jalanLayer.addLayer(geoLayer);
    count++;
  });
  return count;
}

/**
 * Toggle layer data_jalan.
 * @param {boolean} on
 */
async function toggleJalanLayer(on) {
  if (!_map) return;

  if (on) {
    _jalanVisible = true;
    _map.addLayer(_jalanLayer);

    if (!_jalanLoaded) {
      window.UI?.showToast('Memuat data jalan dari Supabase…', 'blue');
      try {
        console.log('[map.js] Mulai fetch data_jalan...');
        const rows  = await _fetchJalanRows();
        console.log(`[map.js] data_jalan: ${rows.length} baris diterima`);
        const count = _renderJalanRows(rows);
        console.log(`[map.js] data_jalan: ${count} fitur berhasil dirender`);
        _jalanLoaded = true;
        window.UI?.showToast(`${count} segmen jalan berhasil dimuat`, 'green');
      } catch (err) {
        console.error('[map.js] Gagal load data_jalan:', err);
        window.UI?.showToast('Gagal memuat data jalan: ' + (err.message || err), 'amber');
        _jalanVisible = false;
        _map.removeLayer(_jalanLayer);
        const chk = document.getElementById('toggle-jalan');
        if (chk) chk.checked = false;
      }
    }
  } else {
    _jalanVisible = false;
    _map.removeLayer(_jalanLayer);
  }
}

// ══════════════════════════════════════════════
// ★ WELL LAYER (POINT)
// ══════════════════════════════════════════════

const _WELL_COLOR = '#8b5cf6';

/** Parse WKT POINT (x y) UTM 47N → [lat, lng] */
function _parsePointWKT(wktStr) {
  if (!wktStr) return null;
  try {
    const m = wktStr.match(/POINT\s*\(([^)]+)\)/i);
    if (!m) return null;
    const parts = m[1].trim().split(/\s+/);
    const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
    if (isNaN(x) || isNaN(y)) return null;
    return _utmToLatLng(x, y);
  } catch (e) {
    console.warn('[map.js] Point WKT parse error:', e);
    return null;
  }
}

/** Fetch semua baris Well dengan pagination */
async function _fetchWellRows() {
  if (!_supabaseClient) throw new Error('Supabase client belum diinisialisasi.');
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await _supabaseClient
      .from('Well')
      .select('*')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows = rows.concat(data);
    from += SUPABASE_PAGE_SIZE;
    if (data.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

/** Render baris Well sebagai circleMarker di peta */
function _renderWellRows(rows) {
  _wellLayer.clearLayers();
  let count = 0;
  const SKIP = ['WKT', 'geom', 'geometry', 'Longitude', 'Latitude'];

  rows.forEach(row => {
    const latLng = _parsePointWKT(row['WKT']);
    if (!latLng) return;

    const marker = L.circleMarker(latLng, {
      radius:      5,
      color:       '#fff',
      weight:      1.5,
      fillColor:   _WELL_COLOR,
      fillOpacity: 0.9,
    });

    // Tooltip hover — tampilkan ID/nama well
    const idField = ['WELL_NAME', 'WELL_UWI', 'WELL_NAME_', 'OBJECTID']
      .find(f => row[f] !== null && row[f] !== undefined && row[f] !== '');
    const tooltipLabel = idField ? String(row[idField]) : '—';
    marker.bindTooltip(tooltipLabel, {
      permanent:  false,
      direction:  'top',
      offset:     [0, -6],
      className:  'map-well-tooltip',
    });

    marker.on({
      mouseover(e) {
        e.target.setStyle({ radius: 8, fillColor: '#4f5ef7' });
      },
      mouseout(e) {
        e.target.setStyle({ radius: 5, fillColor: _WELL_COLOR });
      },
      click() {
        const keys = Object.keys(row).filter(k => !SKIP.includes(k));
        const rowsHtml = keys.map(k => `
          <div class="map-popup-row">
            <div class="map-popup-label">${k}</div>
            <div class="map-popup-coord" style="color:var(--text-primary);font-size:11px;">
              ${row[k] !== null && row[k] !== '' ? row[k] : '<span style="color:var(--text-muted)">—</span>'}
            </div>
          </div>`).join('');

        L.popup({ maxWidth: 280, maxHeight: 320 })
          .setLatLng(latLng)
          .setContent(`
            <div class="map-popup" style="max-height:300px;overflow-y:auto;">
              <div class="map-popup-title" style="color:${_WELL_COLOR};">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="${_WELL_COLOR}" stroke-width="2.5" stroke-linecap="round">
                  <circle cx="12" cy="5" r="3"/>
                  <line x1="12" y1="8" x2="12" y2="22"/>
                  <line x1="8"  y1="14" x2="16" y2="14"/>
                </svg>
                Data Well
              </div>
              ${rowsHtml}
            </div>`)
          .openOn(_map);
      }
    });

    _wellLayer.addLayer(marker);
    count++;
  });
  return count;
}

/**
 * Toggle layer Well (point).
 * @param {boolean} on
 */
async function toggleWellLayer(on) {
  if (!_map) return;

  if (on) {
    _wellVisible = true;
    _map.addLayer(_wellLayer);

    if (!_wellLoaded) {
      window.UI?.showToast('Memuat data well dari Supabase…', 'blue');
      try {
        const rows  = await _fetchWellRows();
        const count = _renderWellRows(rows);
        _wellLoaded = true;
        window.UI?.showToast(`${count} well berhasil dimuat`, 'green');
      } catch (err) {
        console.error('[map.js] Gagal load Well:', err);
        window.UI?.showToast('Gagal memuat data well: ' + (err.message || err), 'amber');
        _wellVisible = false;
        _map.removeLayer(_wellLayer);
        const chk = document.getElementById('toggle-well');
        if (chk) chk.checked = false;
        return;
      }
    }
    try {
      const bounds = _wellLayer.getBounds();
      if (bounds.isValid()) _map.fitBounds(bounds, { padding: [40, 40] });
    } catch (_) {}
  } else {
    _wellVisible = false;
    _map.removeLayer(_wellLayer);
  }
}

// ══════════════════════════════════════════════
// ★ WK_ROKAN LAYER (MULTIPOLYGON)
// ══════════════════════════════════════════════

const _WK_ROKAN_COLOR = '#06b6d4';

/** Fetch semua baris WK_Rokan dengan pagination */
async function _fetchWkRokanRows() {
  if (!_supabaseClient) throw new Error('Supabase client belum diinisialisasi.');
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await _supabaseClient
      .from('WK_Rokan')
      .select('*')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows = rows.concat(data);
    from += SUPABASE_PAGE_SIZE;
    if (data.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

/** Render baris WK_Rokan sebagai polygon layer */
function _renderWkRokanRows(rows) {
  _wkRokanLayer.clearLayers();
  let count = 0;
  const SKIP = ['WKT', 'geom', 'geometry', 'Longitude', 'Latitude'];

  rows.forEach(row => {
    const geom = _parseWKTtoGeoJSON(row['WKT']);
    if (!geom) return;

    const geoLayer = L.geoJSON(geom, {
      style: {
        color:       _WK_ROKAN_COLOR,
        weight:      1.5,
        opacity:     0.9,
        fillColor:   _WK_ROKAN_COLOR,
        fillOpacity: 0.08,
      },
      onEachFeature(feature, lyr) {
        const idField = ['BLOCK_NAME', 'NAME', 'SMOGIS_A3_', 'OBJECTID']
          .find(f => row[f] !== null && row[f] !== undefined && row[f] !== '');
        if (idField) lyr.bindTooltip(String(row[idField]), {
          sticky: true, direction: 'top', className: 'map-layer-tooltip',
        });
        lyr.on({
          mouseover(e) {
            e.target.setStyle({ weight: 2.5, fillOpacity: 0.22, color: '#4f5ef7', fillColor: '#4f5ef7' });
          },
          mouseout(e) {
            e.target.setStyle({ weight: 1.5, fillOpacity: 0.08, color: _WK_ROKAN_COLOR, fillColor: _WK_ROKAN_COLOR });
          },
          click() {
            const keys = Object.keys(row).filter(k => !SKIP.includes(k) && row[k] !== null && row[k] !== '');
            const rowsHtml = keys.map(k => `
              <div class="map-popup-row">
                <div class="map-popup-label">${k}</div>
                <div class="map-popup-coord" style="color:var(--text-primary);font-size:11px;">
                  ${row[k]}
                </div>
              </div>`).join('');

            const center = lyr.getBounds ? lyr.getBounds().getCenter() : lyr.getLatLng();
            L.popup({ maxWidth: 280, maxHeight: 320 })
              .setLatLng(center)
              .setContent(`
                <div class="map-popup" style="max-height:300px;overflow-y:auto;">
                  <div class="map-popup-title" style="color:${_WK_ROKAN_COLOR};">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                         stroke="${_WK_ROKAN_COLOR}" stroke-width="2.5" stroke-linecap="round">
                      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/>
                    </svg>
                    WK Rokan
                  </div>
                  ${rowsHtml}
                </div>`)
              .openOn(_map);
          }
        });
      }
    });

    _wkRokanLayer.addLayer(geoLayer);
    count++;
  });
  return count;
}

/**
 * Toggle layer WK_Rokan.
 * @param {boolean} on
 */
async function toggleWkRokanLayer(on) {
  if (!_map) return;

  if (on) {
    _wkRokanVisible = true;
    _map.addLayer(_wkRokanLayer);

    if (!_wkRokanLoaded) {
      window.UI?.showToast('Memuat batas WK Rokan dari Supabase…', 'blue');
      try {
        const rows  = await _fetchWkRokanRows();
        const count = _renderWkRokanRows(rows);
        _wkRokanLoaded = true;
        window.UI?.showToast(`${count} fitur WK Rokan berhasil dimuat`, 'green');
      } catch (err) {
        console.error('[map.js] Gagal load WK_Rokan:', err);
        window.UI?.showToast('Gagal memuat WK Rokan: ' + (err.message || err), 'amber');
        _wkRokanVisible = false;
        _map.removeLayer(_wkRokanLayer);
        const chk = document.getElementById('toggle-wkrokan');
        if (chk) chk.checked = false;
        return;
      }
    }
    try {
      const bounds = _wkRokanLayer.getBounds();
      if (bounds.isValid()) _map.fitBounds(bounds, { padding: [40, 40] });
    } catch (_) {}
  } else {
    _wkRokanVisible = false;
    _map.removeLayer(_wkRokanLayer);
  }
}

// ══════════════════════════════════════════════
// ★ PIPELINE LAYER (MULTILINESTRING)
// ══════════════════════════════════════════════

const _PIPELINE_COLOR = '#e64d3d';

/** Fetch semua baris Pipeline dengan pagination */
async function _fetchPipelineRows() {
  if (!_supabaseClient) throw new Error('Supabase client belum diinisialisasi.');
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await _supabaseClient
      .from('pipelinerokan')
      .select('*')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows = rows.concat(data);
    from += SUPABASE_PAGE_SIZE;
    if (data.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

/** Render baris Pipeline sebagai polyline layer */
function _renderPipelineRows(rows) {
  _pipelineLayer.clearLayers();
  let count = 0;
  const SKIP = ['WKT', 'geom', 'geometry', 'Longitude', 'Latitude'];
  const defaultStyle = { color: _PIPELINE_COLOR, weight: 1.5, opacity: 0.85 };
  const hoverStyle   = { color: '#4f5ef7', weight: 3, opacity: 1 };

  rows.forEach(row => {
    const geom = _parseLinestringWKT(row['WKT']);
    if (!geom) return;

    const geoLayer = L.geoJSON(geom, {
      style: defaultStyle,
      onEachFeature(feature, lyr) {
        const idField = ['OBJECTID', 'ID', 'NAME', 'PIPE_ID']
          .find(f => row[f] !== null && row[f] !== undefined && row[f] !== '');
        if (idField) lyr.bindTooltip(`ID: ${row[idField]}`, {
          sticky: true, direction: 'top', className: 'map-layer-tooltip',
        });
        lyr.on({
          mouseover(e) { e.target.setStyle(hoverStyle); },
          mouseout(e)  { e.target.setStyle(defaultStyle); },
          click() {
            const keys = Object.keys(row).filter(k =>
              !SKIP.includes(k) && row[k] !== null && row[k] !== '' && row[k] !== 0
            );
            const rowsHtml = keys.map(k => `
              <div class="map-popup-row">
                <div class="map-popup-label">${k}</div>
                <div class="map-popup-coord" style="color:var(--text-primary);font-size:11px;">
                  ${row[k]}
                </div>
              </div>`).join('');

            const center = lyr.getBounds ? lyr.getBounds().getCenter() : lyr.getLatLng();
            L.popup({ maxWidth: 300, maxHeight: 340 })
              .setLatLng(center)
              .setContent(`
                <div class="map-popup" style="max-height:320px;overflow-y:auto;">
                  <div class="map-popup-title" style="color:${_PIPELINE_COLOR};">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                         stroke="${_PIPELINE_COLOR}" stroke-width="2.5" stroke-linecap="round">
                      <path d="M3 12h18M3 6h18M3 18h18"/>
                    </svg>
                    Pipeline WK Rokan
                  </div>
                  ${rowsHtml}
                </div>`)
              .openOn(_map);
          }
        });
      }
    });

    _pipelineLayer.addLayer(geoLayer);
    count++;
  });
  return count;
}

/**
 * Toggle layer Pipeline.
 * @param {boolean} on
 */
async function togglePipelineLayer(on) {
  if (!_map) return;

  if (on) {
    _pipelineVisible = true;
    _map.addLayer(_pipelineLayer);

    if (!_pipelineLoaded) {
      window.UI?.showToast('Memuat data pipeline dari Supabase…', 'blue');
      try {
        const rows  = await _fetchPipelineRows();
        const count = _renderPipelineRows(rows);
        _pipelineLoaded = true;
        window.UI?.showToast(`${count} segmen pipeline berhasil dimuat`, 'green');
      } catch (err) {
        console.error('[map.js] Gagal load Pipeline:', err);
        window.UI?.showToast('Gagal memuat pipeline: ' + (err.message || err), 'amber');
        _pipelineVisible = false;
        _map.removeLayer(_pipelineLayer);
        const chk = document.getElementById('toggle-pipeline');
        if (chk) chk.checked = false;
        return;
      }
    }
    try {
      const bounds = _pipelineLayer.getBounds();
      if (bounds.isValid()) _map.fitBounds(bounds, { padding: [40, 40] });
    } catch (_) {}
  } else {
    _pipelineVisible = false;
    _map.removeLayer(_pipelineLayer);
  }
}

// ══════════════════════════════════════════════
// ★ PLOT POINT PAIR
// ══════════════════════════════════════════════
function plotPointPair(latIn, lonIn, latOut, lonOut, id, fmtIn, fmtOut) {
  if (!_lineGroup || !_originGroup || !_resultGroup) return;

  const label   = id != null ? `#${id}` : '';
  const dist    = _haversine(latIn, lonIn, latOut, lonOut);
  const bearing = _bearing(latIn, lonIn, latOut, lonOut);
  const dir     = _bearingLabel(bearing);
  const distStr = dist >= 1000
    ? `${(dist / 1000).toFixed(3)} km`
    : `${dist.toFixed(2)} m`;

  const fIn  = fmtIn  || 'dd';
  const fOut = fmtOut || 'dd';
  const coordInStr  = _formatCoordStr(latIn,  lonIn,  fIn);
  const coordOutStr = _formatCoordStr(latOut, lonOut, fOut);

  const dashedLine = L.polyline(
    [[latIn, lonIn], [latOut, lonOut]],
    { color: '#4f5ef7', weight: 2.5, opacity: 0.8,
      dashArray: '7 9', lineJoin: 'round' }
  );

  const markerAsal = L.marker([latIn, lonIn], {
    icon: _makeIcon('#0ca678', `Asal ${label}`),
  });
  markerAsal.bindPopup(_popupAsal(coordInStr, label, fIn), { maxWidth: 260 });

  const markerHasil = L.marker([latOut, lonOut], {
    icon: _makeIcon('#4f5ef7', `Hasil ${label}`),
  });
  markerHasil.bindPopup(
    _popupHasil(coordOutStr, distStr, bearing, dir, label, fOut), { maxWidth: 280 }
  );

  _lineGroup.addLayer(dashedLine);
  _originGroup.addLayer(markerAsal);
  _resultGroup.addLayer(markerHasil);
}

// ──────────────────────────────────────────────
// CLEAR & FIT
// ──────────────────────────────────────────────
function clearAllPlots() {
  if (_lineGroup)   _lineGroup.clearLayers();
  if (_originGroup) _originGroup.clearLayers();
  if (_resultGroup) _resultGroup.clearLayers();
  if (_markers)     _markers.clearLayers();
  _hideLegend();
}

function fitToPlots() {
  if (!_map) return;
  const bounds = L.latLngBounds([]);
  [_lineGroup, _originGroup, _resultGroup].forEach(g => {
    if (!g) return;
    g.eachLayer(l => {
      if (l.getLatLng)  bounds.extend(l.getLatLng());
      if (l.getLatLngs) l.getLatLngs().forEach(p => bounds.extend(p));
    });
  });
  if (bounds.isValid()) {
    _map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true });
  }
}

function togglePlotLayer(key, on) {
  if (!_map) return;
  const group = key === 'origin' ? _originGroup : _resultGroup;
  if (!group) return;
  if (on) _map.addLayer(group);
  else    _map.removeLayer(group);
}

// ──────────────────────────────────────────────
// LEGENDS
// ──────────────────────────────────────────────
function showManualLegend(latIn, lonIn, latOut, lonOut, fmtIn, fmtOut) {
  const dist    = _haversine(latIn, lonIn, latOut, lonOut);
  const bearing = _bearing(latIn, lonIn, latOut, lonOut);
  const dir     = _bearingLabel(bearing);
  const distStr = dist >= 1000
    ? `${(dist / 1000).toFixed(3)} km`
    : `${dist.toFixed(2)} m`;

  const fin  = fmtIn  || 'dd';
  const fout = fmtOut || 'dd';

  _getLegendEl().innerHTML = `
    <div class="ml-title">📍 Hasil Transformasi</div>
    <div class="ml-row">
      <span class="ml-dot" style="background:#0ca678;"></span>
      <span class="ml-key">Asal</span>
      <span class="ml-val">${_formatCoordStr(latIn, lonIn, fin)}</span>
    </div>
    <div class="ml-row">
      <span class="ml-dot" style="background:#4f5ef7;"></span>
      <span class="ml-key">Hasil</span>
      <span class="ml-val">${_formatCoordStr(latOut, lonOut, fout)}</span>
    </div>
    <div class="ml-divider"></div>
    <div class="ml-row">
      <span class="ml-key">Jarak</span>
      <span class="ml-val" style="color:#4f5ef7;font-weight:600;">${distStr}</span>
    </div>
    <div class="ml-row">
      <span class="ml-key">Arah</span>
      <span class="ml-val">${bearing.toFixed(1)}° ${dir}</span>
    </div>
    <div class="ml-dash-legend">
      <span class="ml-dash-line"></span>
      <span class="ml-key" style="color:#9aa0b4;">Garis putus-putus = selisih datum</span>
    </div>
  `;
  _getLegendEl().style.display = 'block';
}

function showCSVLegend(count, totalDist, minDist, maxDist) {
  const fd = v => v >= 1000 ? `${(v/1000).toFixed(3)} km` : `${v.toFixed(2)} m`;

  _getLegendEl().innerHTML = `
    <div class="ml-title">📂 Batch Transformasi CSV</div>
    <div class="ml-row">
      <span class="ml-dot" style="background:#0ca678;"></span>
      <span class="ml-key">Titik Asal</span>
      <span class="ml-val">${count} titik</span>
    </div>
    <div class="ml-row">
      <span class="ml-dot" style="background:#4f5ef7;"></span>
      <span class="ml-key">Titik Hasil</span>
      <span class="ml-val">${count} titik</span>
    </div>
    <div class="ml-divider"></div>
    <div class="ml-row">
      <span class="ml-key">Min</span>
      <span class="ml-val">${fd(minDist)}</span>
    </div>
    <div class="ml-row">
      <span class="ml-key">Maks</span>
      <span class="ml-val">${fd(maxDist)}</span>
    </div>
    <div class="ml-row">
      <span class="ml-key">Rata-rata</span>
      <span class="ml-val" style="color:#4f5ef7;font-weight:600;">${fd(totalDist/count)}</span>
    </div>
    <div class="ml-dash-legend">
      <span class="ml-dash-line"></span>
      <span class="ml-key" style="color:#9aa0b4;">Garis = selisih per titik</span>
    </div>
  `;
  _getLegendEl().style.display = 'block';
}

function _getLegendEl() {
  let el = document.getElementById('map-legend');
  if (!el) {
    el = document.createElement('div');
    el.id = 'map-legend';
    document.body.appendChild(el);
  }
  return el;
}

function _hideLegend() {
  const el = document.getElementById('map-legend');
  if (el) el.style.display = 'none';
}

// ──────────────────────────────────────────────
// MAP CLICK POPUP
// ──────────────────────────────────────────────
function _onMapClick(e) {
  const { lat, lng } = e.latlng;
  _clickedCoord = { lat, lon: lng };

  let id74 = { lat: lat - 0.0002, lon: lng - 0.0003 };
  try { if (window.TE) id74 = window.TE.wgs84ToId74(lat, lng); } catch (_) {}

  L.popup({ maxWidth: 250, closeButton: true })
    .setLatLng(e.latlng)
    .setContent(`
      <div class="map-popup">
        <div class="map-popup-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="#4f5ef7" stroke-width="2.5" stroke-linecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Koordinat Klik
        </div>
        <div class="map-popup-row">
          <div class="map-popup-label">WGS 84</div>
          <div class="map-popup-coord">${lat.toFixed(7)}, ${lng.toFixed(7)}</div>
        </div>
        <div class="map-popup-row">
          <div class="map-popup-label">ID 74 (estimasi)</div>
          <div class="map-popup-coord" style="color:#0ca678;">
            ${id74.lat.toFixed(7)}, ${id74.lon.toFixed(7)}
          </div>
        </div>
        <div class="map-popup-divider"></div>
        <button class="btn-use-coord" onclick="MapController.useClickedCoord()">
          ⇄ Gunakan Koordinat Ini
        </button>
      </div>`)
    .openOn(_map);
}

// ──────────────────────────────────────────────
// MOUSE MOVE → STATUS BAR
// ──────────────────────────────────────────────
function _onMouseMove(e) {
  const el = document.getElementById('coord-status');
  if (el) el.innerHTML =
    `<span>${e.latlng.lat.toFixed(6)}</span>, <span>${e.latlng.lng.toFixed(6)}</span>`;
}
function _onMouseOut() {
  const el = document.getElementById('coord-status');
  if (el) el.innerHTML = '—';
}

// ──────────────────────────────────────────────
// ZOOM
// ──────────────────────────────────────────────
const zoomIn  = () => _map?.zoomIn();
const zoomOut = () => _map?.zoomOut();

// ──────────────────────────────────────────────
// USE CLICKED COORD
// ──────────────────────────────────────────────
function useClickedCoord() {
  if (!_clickedCoord) return;
  const inp = document.getElementById('coord-val');
  if (inp) inp.value = `${_clickedCoord.lat.toFixed(7)}, ${_clickedCoord.lon.toFixed(7)}`;
  _map?.closePopup();
  window.UI?.openPanel('panel-transform');
}

// ──────────────────────────────────────────────
// ICON HELPER
// ──────────────────────────────────────────────
function _makeIcon(color, labelText) {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:13px;height:13px;background:${color};border:2.5px solid #fff;
        border-radius:50%;box-shadow:0 2px 8px ${color}88;position:relative;">
        <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);
          background:${color};color:#fff;font-size:9px;font-weight:700;
          font-family:'Sora',sans-serif;padding:2px 6px;border-radius:10px;
          white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${labelText}</div>
      </div>`,
    iconSize:   [13, 13],
    iconAnchor: [6,  6],
  });
}

// ──────────────────────────────────────────────
// COORD FORMAT HELPERS
// ──────────────────────────────────────────────
function _formatCoordStr(lat, lon, fmt) {
  if (fmt === 'dms') return `${_toDMS(lat, true)}<br>${_toDMS(lon, false)}`;
  if (fmt === 'ddm') return `${_toDDM(lat, true)}<br>${_toDDM(lon, false)}`;
  if (fmt === 'utm' && window.TE?.latLonToUTM) {
    const u = window.TE.latLonToUTM(lat, lon);
    return `47N<br>E ${u.easting.toFixed(3)}<br>N ${u.northing.toFixed(3)}`;
  }
  return `${lat.toFixed(8)}<br>${lon.toFixed(8)}`;
}

function _toDMS(dd, isLat) {
  const abs = Math.abs(dd);
  const d   = Math.floor(abs);
  const mf  = (abs - d) * 60;
  const m   = Math.floor(mf);
  const s   = ((mf - m) * 60).toFixed(4);
  const dir = isLat ? (dd >= 0 ? 'N' : 'S') : (dd >= 0 ? 'E' : 'W');
  return `${d}°${String(m).padStart(2,'0')}'${s}" ${dir}`;
}

function _toDDM(dd, isLat) {
  const abs = Math.abs(dd);
  const d   = Math.floor(abs);
  const m   = ((abs - d) * 60).toFixed(5);
  const dir = isLat ? (dd >= 0 ? 'N' : 'S') : (dd >= 0 ? 'E' : 'W');
  return `${d}° ${m}' ${dir}`;
}

// ──────────────────────────────────────────────
// POPUP CONTENT HELPERS
// ──────────────────────────────────────────────
function _popupAsal(coordStr, label, fmt) {
  return `<div class="map-popup">
    <div class="map-popup-title" style="color:#0ca678;">🟢 Titik Asal ${label}</div>
    <div class="map-popup-row">
      <div class="map-popup-label">Koordinat Asal · <em>${fmt.toUpperCase()}</em></div>
      <div class="map-popup-coord" style="color:#0ca678;">${coordStr}</div>
    </div>
  </div>`;
}

function _popupHasil(coordStr, distStr, bearing, dir, label, fmt) {
  return `<div class="map-popup">
    <div class="map-popup-title" style="color:#4f5ef7;">🔵 Titik Hasil ${label}</div>
    <div class="map-popup-row">
      <div class="map-popup-label">Koordinat Hasil · <em>${fmt.toUpperCase()}</em></div>
      <div class="map-popup-coord" style="color:#4f5ef7;">${coordStr}</div>
    </div>
    <div class="map-popup-divider"></div>
    <div class="map-popup-row">
      <div class="map-popup-label">Jarak dari Asal</div>
      <div class="map-popup-coord" style="color:#f59f00;">${distStr}</div>
    </div>
    <div class="map-popup-row">
      <div class="map-popup-label">Arah Pergeseran</div>
      <div class="map-popup-coord" style="color:#f59f00;">${bearing.toFixed(2)}° (${dir})</div>
    </div>
  </div>`;
}

// ──────────────────────────────────────────────
// HAVERSINE + BEARING
// ──────────────────────────────────────────────
function _haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371000, r = Math.PI / 180;
  const p1 = lat1*r, p2 = lat2*r;
  const dp = (lat2-lat1)*r, dl = (lon2-lon1)*r;
  const a  = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _bearing(lat1, lon1, lat2, lon2) {
  const r  = Math.PI / 180;
  const dl = (lon2-lon1)*r;
  const y  = Math.sin(dl)*Math.cos(lat2*r);
  const x  = Math.cos(lat1*r)*Math.sin(lat2*r) - Math.sin(lat1*r)*Math.cos(lat2*r)*Math.cos(dl);
  return (Math.atan2(y, x)*180/Math.PI + 360) % 360;
}

function _bearingLabel(b) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(b/45) % 8];
}

// ──────────────────────────────────────────────
// INJECT ALL STYLES
// ──────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('shifted-map-styles')) return;
  const s = document.createElement('style');
  s.id = 'shifted-map-styles';
  s.textContent = `
    /* ── MAP LEGEND ── */
    #map-legend {
      position:fixed; bottom:90px; left:20px; z-index:700;
      width:264px;
      background:rgba(255,255,255,0.97);
      border:1px solid #dde1ec; border-radius:12px;
      padding:14px 16px;
      box-shadow:0 8px 32px rgba(26,29,46,0.13), 0 2px 8px rgba(26,29,46,0.06);
      display:none; backdrop-filter:blur(10px);
      font-family:'Sora',sans-serif;
      animation:legendIn .25s cubic-bezier(.4,0,.2,1);
    }
    @keyframes legendIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    .ml-title { font-size:12px;font-weight:700;color:#1a1d2e;margin-bottom:10px;
      border-bottom:1px solid #e4e7ee;padding-bottom:8px; }
    .ml-row   { display:flex;align-items:center;gap:7px;margin-bottom:5px; }
    .ml-dot   { width:9px;height:9px;border-radius:50%;flex-shrink:0;
      border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2); }
    .ml-key   { font-size:10.5px;color:#5a6278;flex-shrink:0;min-width:58px; }
    .ml-val   { font-size:10.5px;color:#1a1d2e;font-family:'JetBrains Mono',monospace;word-break:break-all; }
    .ml-divider { height:1px;background:#e4e7ee;margin:8px 0; }
    .ml-dash-legend { display:flex;align-items:center;gap:7px;margin-top:6px; }
    .ml-dash-line {
      display:inline-block;width:28px;height:2px;flex-shrink:0;
      background:repeating-linear-gradient(90deg,#4f5ef7 0,#4f5ef7 6px,transparent 6px,transparent 14px);
    }

    /* ── CSV PREVIEW TABLE ── */
    #table-preview {
      margin-top:14px;
      border:1px solid #e4e7ee; border-radius:8px;
      overflow:hidden;
    }
    .tbl-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:9px 12px; background:#f4f5f7;
      border-bottom:1px solid #e4e7ee;
    }
    .tbl-header-title {
      font-size:11px;font-weight:700;color:#1a1d2e;
      display:flex;align-items:center;gap:6px;
    }
    .tbl-badge {
      background:#4f5ef7;color:#fff;font-size:9px;font-weight:700;
      padding:2px 7px;border-radius:20px;
    }
    .tbl-scroll { max-height:240px;overflow-y:auto; }
    .tbl-scroll::-webkit-scrollbar { width:4px; }
    .tbl-scroll::-webkit-scrollbar-thumb { background:#dde1ec;border-radius:4px; }
    #preview-table {
      width:100%;border-collapse:collapse;font-size:10.5px;
      font-family:'JetBrains Mono',monospace;
    }
    #preview-table thead tr {
      background:#f8f9fb;position:sticky;top:0;z-index:1;
    }
    #preview-table th {
      padding:8px 10px;text-align:left;font-weight:700;
      color:#5a6278;font-size:10px;text-transform:uppercase;
      letter-spacing:.5px;border-bottom:1px solid #e4e7ee;
      white-space:nowrap;
    }
    #preview-table td {
      padding:7px 10px;border-bottom:1px solid #f0f2f6;
      color:#1a1d2e;vertical-align:middle;white-space:nowrap;
    }
    #preview-table tbody tr:last-child td { border-bottom:none; }
    #preview-table tbody tr:hover td { background:#f4f5f7; }
    #preview-table td.td-id   { font-weight:700;color:#4f5ef7; }
    #preview-table td.td-asal { color:#0ca678; }
    #preview-table td.td-hasil{ color:#4f5ef7; }
    #preview-table td.td-jarak{ color:#f59f00;font-weight:600; }
    #preview-table td.td-arah { color:#5a6278; }
    .tbl-summary {
      display:flex;gap:16px;padding:9px 12px;
      background:#f8f9fb;border-top:1px solid #e4e7ee;
      font-size:10px;color:#5a6278;font-family:'Sora',sans-serif;
    }
    .tbl-sum-item strong { color:#1a1d2e; }

    /* ── RESULT BOX ── */
    .result-box.show { display:block; }

    /* ── SUPABASE LAYER LOADING INDICATOR ── */
    .supabase-loading {
      display:inline-block;
      width:8px; height:8px;
      border:1.5px solid #e4e7ee;
      border-top-color:#f59f00;
      border-radius:50%;
      animation:sbSpin 0.7s linear infinite;
      margin-left:6px;
      vertical-align:middle;
    }
    @keyframes sbSpin { to { transform:rotate(360deg); } }

    /* ── MEASURE TOOL INFO BOX ── */
    #measure-info {
      position:fixed; top:82px; right:16px; z-index:800;
      width:220px;
      background:rgba(255,255,255,0.97);
      border:1px solid #dde1ec; border-radius:12px;
      padding:13px 15px;
      box-shadow:0 8px 32px rgba(26,29,46,0.13);
      display:none;
      font-family:'Sora',sans-serif;
      backdrop-filter:blur(10px);
      animation:legendIn .2s ease;
    }
    .mi-title {
      font-size:12px;font-weight:700;color:#1a1d2e;
      margin-bottom:10px;padding-bottom:8px;
      border-bottom:1px solid #e4e7ee;
    }
    .mi-row {
      display:flex;justify-content:space-between;
      align-items:baseline;margin-bottom:5px;
    }
    .mi-key { font-size:10.5px;color:#5a6278; }
    .mi-val { font-size:11px;font-family:'JetBrains Mono',monospace;color:#1a1d2e; }
    .mi-hint {
      font-size:10px;color:#9aa0b4;margin-top:8px;
      padding-top:8px;border-top:1px solid #e4e7ee;line-height:1.5;
    }
    .mi-clear {
      width:100%;margin-top:9px;padding:6px;
      background:#f4f5f7;border:1.5px solid #e4e7ee;
      border-radius:6px;font-size:11px;font-weight:600;
      font-family:'Sora',sans-serif;color:#5a6278;
      cursor:pointer;transition:all 0.18s;
    }
    .mi-clear:hover { background:#fee2e2;border-color:#fca5a5;color:#dc2626; }
    .measure-tooltip {
      background:#1a1d2e;color:#fff;border:none;
      border-radius:4px;font-size:10px;font-family:'JetBrains Mono',monospace;
      padding:2px 7px;box-shadow:0 2px 6px rgba(0,0,0,0.2);
    }
    .measure-tooltip::before { display:none; }
  `;
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════
// ★ MEASURE TOOL — Ukur Jarak & Luas
// ══════════════════════════════════════════════

const _measure = {
  active:   false,   // sedang aktif atau tidak
  mode:     'distance', // 'distance' | 'area'
  points:   [],      // array [lat, lng]
  markers:  null,    // LayerGroup untuk marker titik
  lines:    null,    // LayerGroup untuk garis
  polygon:  null,    // layer poligon (mode area)
  infoEl:   null,    // elemen info box di peta
};

/** Haversine jarak dua titik (meter) */
function _mDist(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
  const x  = Math.sin(dp/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

/** Luas poligon Shoelace di spherical (m²) — approx planar */
function _mArea(pts) {
  if (pts.length < 3) return 0;
  const R = 6371000, r = Math.PI / 180;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j][1] + pts[i][1]) * r * (pts[j][0] - pts[i][0]) * r;
  }
  return Math.abs(area / 2) * R * R;
}

function _mFmtDist(m) {
  if (m >= 1000) return `${(m/1000).toFixed(3)} km`;
  return `${m.toFixed(2)} m`;
}

function _mFmtArea(m2) {
  if (m2 >= 1e6) return `${(m2/1e6).toFixed(4)} km²`;
  if (m2 >= 1e4) return `${(m2/1e4).toFixed(4)} ha`;
  return `${m2.toFixed(2)} m²`;
}

/** Buat / update info box di pojok kanan atas peta */
function _mUpdateInfo() {
  if (!_measure.infoEl) {
    _measure.infoEl = document.createElement('div');
    _measure.infoEl.id = 'measure-info';
    document.body.appendChild(_measure.infoEl);
  }
  const el  = _measure.infoEl;
  const pts  = _measure.points;
  const mode = _measure.mode;

  if (!_measure.active || pts.length === 0) {
    el.style.display = 'none';
    return;
  }

  // Hitung nilai
  let totalDist = 0;
  for (let i = 1; i < pts.length; i++) totalDist += _mDist(pts[i-1], pts[i]);
  const area = mode === 'area' ? _mArea(pts) : 0;

  el.style.display = 'block';
  el.innerHTML = `
    <div class="mi-title">
      ${mode === 'distance' ? '📏 Ukur Jarak' : '⬡ Ukur Luas'}
    </div>
    <div class="mi-row">
      <span class="mi-key">Titik</span>
      <span class="mi-val">${pts.length}</span>
    </div>
    ${pts.length > 1 ? `
    <div class="mi-row">
      <span class="mi-key">Total Jarak</span>
      <span class="mi-val" style="color:#4f5ef7;font-weight:700;">${_mFmtDist(totalDist)}</span>
    </div>` : ''}
    ${mode === 'area' && pts.length > 2 ? `
    <div class="mi-row">
      <span class="mi-key">Luas</span>
      <span class="mi-val" style="color:#0ca678;font-weight:700;">${_mFmtArea(area)}</span>
    </div>` : ''}
    <div class="mi-hint">${mode === 'distance'
      ? 'Klik peta untuk tambah titik'
      : pts.length < 3
        ? 'Minimal 3 titik untuk hitung luas'
        : 'Klik peta untuk tambah titik'}
    </div>
    <button type="button" onclick="MapController.measureClear()" class="mi-clear">
      Hapus & Selesai
    </button>
  `;
}

/** Gambar ulang semua layer pengukuran */
function _mRedraw() {
  const pts = _measure.points;
  _measure.markers.clearLayers();
  _measure.lines.clearLayers();
  if (_measure.polygon) { _map.removeLayer(_measure.polygon); _measure.polygon = null; }

  pts.forEach((p, i) => {
    const isFirst = i === 0;
    const marker = L.circleMarker(p, {
      radius:      isFirst ? 7 : 5,
      color:       '#fff',
      weight:      2,
      fillColor:   isFirst ? '#f59f00' : '#4f5ef7',
      fillOpacity: 1,
    }).addTo(_measure.markers);

    // Tooltip jarak segmen
    if (i > 0) {
      const segDist = _mDist(pts[i-1], pts[i]);
      marker.bindTooltip(_mFmtDist(segDist), {
        permanent: true, direction: 'top', className: 'measure-tooltip',
      }).openTooltip();
    }
  });

  // Garis penghubung
  if (pts.length > 1) {
    L.polyline(pts, {
      color: '#4f5ef7', weight: 2.5, opacity: 0.9, dashArray: '6 5',
    }).addTo(_measure.lines);
  }

  // Poligon (mode area, min 3 titik)
  if (_measure.mode === 'area' && pts.length >= 3) {
    _measure.polygon = L.polygon(pts, {
      color:       '#0ca678',
      weight:      2,
      fillColor:   '#0ca678',
      fillOpacity: 0.15,
    }).addTo(_map);
  }

  _mUpdateInfo();
}

/** Handler klik peta saat measure aktif */
function _onMeasureClick(e) {
  if (!_measure.active) return;
  _measure.points.push([e.latlng.lat, e.latlng.lng]);
  _mRedraw();
}

/**
 * Aktifkan measure tool.
 * @param {'distance'|'area'} mode
 */
function measureStart(mode = 'distance') {
  // Jika sudah aktif di mode yang sama → toggle off
  if (_measure.active && _measure.mode === mode) {
    measureClear();
    return;
  }

  // Reset jika ganti mode
  _measure.points  = [];
  _measure.mode    = mode;
  _measure.active  = true;

  if (!_measure.markers) _measure.markers = L.layerGroup().addTo(_map);
  if (!_measure.lines)   _measure.lines   = L.layerGroup().addTo(_map);

  _measure.markers.clearLayers();
  _measure.lines.clearLayers();
  if (_measure.polygon) { _map.removeLayer(_measure.polygon); _measure.polygon = null; }

  // Tambah handler klik khusus measure (override default map click sementara)
  _map.on('click', _onMeasureClick);
  _map.getContainer().style.cursor = 'crosshair';

  // Update state tombol toolbar
  const btnDist = document.getElementById('tb-measure-dist');
  const btnArea = document.getElementById('tb-measure-area');
  if (btnDist) btnDist.classList.toggle('on', mode === 'distance');
  if (btnArea) btnArea.classList.toggle('on', mode === 'area');

  _mUpdateInfo();
}

/** Bersihkan semua pengukuran dan nonaktifkan tool */
function measureClear() {
  _measure.active = false;
  _measure.points = [];

  if (_measure.markers) _measure.markers.clearLayers();
  if (_measure.lines)   _measure.lines.clearLayers();
  if (_measure.polygon) { _map.removeLayer(_measure.polygon); _measure.polygon = null; }
  if (_measure.infoEl)  _measure.infoEl.style.display = 'none';

  // Hapus handler klik measure, restore default
  _map.off('click', _onMeasureClick);
  _map.on('click', _onMapClick);
  _map.getContainer().style.cursor = '';

  const btnDist = document.getElementById('tb-measure-dist');
  const btnArea = document.getElementById('tb-measure-area');
  if (btnDist) btnDist.classList.remove('on');
  if (btnArea) btnArea.classList.remove('on');
}

// ──────────────────────────────────────────────
// EXPOSE
// ──────────────────────────────────────────────
window.MapController = {
  initMap, switchBasemap, togglePlotLayer,
  plotPointPair, clearAllPlots, fitToPlots,
  showManualLegend, showCSVLegend,
  zoomIn, zoomOut, useClickedCoord,
  toggleSupabaseLayer, toggleWellLayer, toggleWkRokanLayer, togglePipelineLayer,
  measureStart, measureClear,
  get map() { return _map; },
};

window.plotPointPair = plotPointPair;
window.clearAllPlots = clearAllPlots;
window.fitToPlots    = fitToPlots;