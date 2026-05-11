/**
 * js/search.js
 * Geocoding Search — Shifted. Dashboard
 * Uses Nominatim (OpenStreetMap) — no API key required
 * Search bar lives inside the header.
 */

'use strict';

const GeoSearch = (() => {
  let _results   = [];
  let _debounce  = null;
  let _activeIdx = -1;

  // ── Focus / Close ──────────────────────────────
  function open() {
    const inp = document.getElementById('search-input');
    if (inp) { inp.focus(); inp.select(); }
  }

  function close() {
    _clearResults();
    const inp = document.getElementById('search-input');
    if (inp) inp.blur();
  }

  // Toolbar button toggles focus / clears
  function toggle() {
    const inp = document.getElementById('search-input');
    if (!inp) return;
    if (document.activeElement === inp) { inp.blur(); _clearResults(); }
    else { inp.focus(); inp.select(); }
  }

  // ── Input handling ─────────────────────────────
  function onInput(e) {
    clearTimeout(_debounce);
    _activeIdx = -1;
    const q = e.target.value.trim();
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
    if (q.length < 3) { _clearResults(); return; }
    _showLoading();
    _debounce = setTimeout(() => _fetch(q), 420);
  }

  function onKeyDown(e) {
    const items = document.querySelectorAll('.search-result-item');
    if (!items.length) {
      if (e.key === 'Escape') close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
      _highlightItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = Math.max(_activeIdx - 1, 0);
      _highlightItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_activeIdx >= 0) selectResult(_activeIdx);
      else if (items.length) selectResult(0);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function _highlightItem(items) {
    items.forEach((el, i) => {
      el.style.background = i === _activeIdx ? 'var(--bg-hover)' : 'transparent';
    });
    items[_activeIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function clearInput() {
    const inp = document.getElementById('search-input');
    if (inp) { inp.value = ''; inp.focus(); }
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    _clearResults();
  }

  // ── Nominatim API ──────────────────────────────
  async function _fetch(q) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=7&addressdetails=1&countrycodes=id`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'id,en;q=0.5' } });
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      _results = data;
      _renderResults(data);
    } catch {
      _showError('Gagal mencari. Periksa koneksi internet.');
    }
  }

  // ── Render ─────────────────────────────────────
  function _showLoading() {
    const r = document.getElementById('search-results');
    if (!r) return;
    r.innerHTML = `
      <div style="padding:12px 14px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round"
             style="animation:spin 0.8s linear infinite;flex-shrink:0;">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        Mencari daerah...
      </div>`;
    r.style.display = 'block';
  }

  function _showError(msg) {
    const r = document.getElementById('search-results');
    if (!r) return;
    r.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--red);">${msg}</div>`;
    r.style.display = 'block';
  }

  function _clearResults() {
    _results   = [];
    _activeIdx = -1;
    const r = document.getElementById('search-results');
    if (r) { r.innerHTML = ''; r.style.display = 'none'; }
  }

  function _iconPath(type) {
    const city = 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z';
    const area = 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5';
    const pin  = 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z';
    if (['city','town','village'].includes(type)) return city;
    if (['administrative','county','state'].includes(type)) return area;
    return pin;
  }

  function _shortName(dn) { return dn.split(',')[0].trim(); }
  function _subName(dn)   { return dn.split(',').slice(1, 4).join(',').trim(); }

  function _renderResults(data) {
    const r = document.getElementById('search-results');
    if (!r) return;
    if (!data.length) {
      r.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--text-muted);">Daerah tidak ditemukan.</div>`;
      r.style.display = 'block';
      return;
    }
    r.innerHTML = data.map((item, i) => `
      <div class="search-result-item" onclick="GeoSearch.selectResult(${i})" style="
        padding:9px 14px; cursor:pointer; border-top:1px solid var(--border);
        display:flex; align-items:flex-start; gap:10px;
        transition:background 0.15s;
      "
      onmouseover="this.style.background='var(--bg-hover)'"
      onmouseout="this.style.background='transparent'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             style="margin-top:2px;flex-shrink:0;">
          <path d="${_iconPath(item.type)}"/>
        </svg>
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:1px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_shortName(item.display_name)}
          </div>
          <div style="font-size:11px;color:var(--text-muted);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_subName(item.display_name) || item.type}
          </div>
        </div>
      </div>`).join('');
    r.style.display = 'block';
  }

  // ── Select & Zoom ──────────────────────────────
  function selectResult(idx) {
    const item = _results[idx];
    if (!item) return;
    const map = MapController?.map;
    if (!map) return;

    if (item.boundingbox) {
      const bb = item.boundingbox;
      map.flyToBounds(
        L.latLngBounds(
          [parseFloat(bb[0]), parseFloat(bb[2])],
          [parseFloat(bb[1]), parseFloat(bb[3])]
        ),
        { padding: [50, 50], maxZoom: 16, duration: 1.4 }
      );
    } else {
      map.flyTo([parseFloat(item.lat), parseFloat(item.lon)], 13, { duration: 1.4 });
    }

    const inp = document.getElementById('search-input');
    if (inp) inp.value = _shortName(item.display_name);
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'flex';
    _clearResults();
  }

  // ── Init (dipanggil setelah header di-inject) ──
  function init() {
    const inp = document.getElementById('search-input');
    if (!inp) return;
    inp.addEventListener('input', onInput);
    inp.addEventListener('keydown', onKeyDown);

    // Tutup dropdown saat klik di luar area search
    document.addEventListener('click', e => {
      const wrap = document.querySelector('.header-search');
      if (wrap && !wrap.contains(e.target)) _clearResults();
    });
  }

  return { open, close, toggle, clearInput, selectResult, init };
})();

window.GeoSearch = GeoSearch;
