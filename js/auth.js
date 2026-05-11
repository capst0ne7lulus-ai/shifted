/* ═══════════════════════════════════════════════
   js/auth.js — Shifted. Auth Management
   Berisi semua logika: login, logout, guard halaman.
   Di-load oleh login.html DAN dashboard.html.

   Login yang didukung:
   1. Admin  → username: admin      | password: 12345
   2. User   → username: kolom Nama | password: kolom ID
   ═══════════════════════════════════════════════ */

var AUTH_KEY = 'isLogin';

// ⚠️ Ganti URL & KEY di bawah jika kamu pindah project Supabase
var _SB_URL = 'https://vfbuxzluwafagicjuupc.supabase.co';
var _SB_KEY = 'sb_publishable_lF1YmyuuZWn4AdO9wazrDQ_-2C_tEQD';
var _sbClient = null;

function _getClient() {
  if (_sbClient) return _sbClient;
  if (window.supabase && window.supabase.createClient) {
    _sbClient = window.supabase.createClient(_SB_URL, _SB_KEY);
  }
  return _sbClient;
}

// ──────────────────────────────────────────────
// SESSION HELPERS
// ──────────────────────────────────────────────
function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === 'true';
}

function _saveSession(user) {
  localStorage.setItem(AUTH_KEY, 'true');
  localStorage.setItem('shifted_user', JSON.stringify(user));
}

function getSession() {
  try {
    var raw = localStorage.getItem('shifted_user');
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────
async function login() {
  var user  = document.getElementById('login-user').value.trim();
  var pass  = document.getElementById('login-pass').value.trim();
  var errEl = document.getElementById('login-error');

  if (errEl) errEl.style.display = 'none';

  if (!user || !pass) {
    if (errEl) { errEl.textContent = 'Username dan password wajib diisi.'; errEl.style.display = 'block'; }
    return;
  }

  // ── 1. Cek admin hardcode ──
  if (user === 'admin' && pass === '12345') {
    _saveSession({ nama: 'Admin', tipe: 'Admin', nipnim: '-' });
    window.location.href = 'dashboard.html';
    return;
  }

  // ── 2. Cek user dari Supabase (nama = username, nip_nim = password) ──
  var client = _getClient();
  if (!client) {
    if (errEl) { errEl.textContent = 'Koneksi server gagal. Muat ulang halaman.'; errEl.style.display = 'block'; }
    return;
  }

  var btn = document.getElementById('btn-login') || document.querySelector('button[onclick="login()"]');
  var oriText = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Memverifikasi…'; btn.disabled = true; }

  try {
    var result = await client
      .from('users')
      .select('Nama, ID, Tipe')
      .ilike('Nama', user)
      .single();

    var data  = result.data;
    var error = result.error;

    if (error || !data) {
      if (errEl) { errEl.textContent = 'Username tidak ditemukan.'; errEl.style.display = 'block'; }
      return;
    }

    if (String(data.ID) !== String(pass)) {
      if (errEl) { errEl.textContent = 'Password salah.'; errEl.style.display = 'block'; }
      return;
    }

    _saveSession({ nama: data.Nama, tipe: data.Tipe, nipnim: data.ID });
    window.location.href = 'dashboard.html';

  } catch (err) {
    console.error('[auth.js]', err);
    if (errEl) { errEl.textContent = 'Terjadi kesalahan. Coba lagi.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = oriText; btn.disabled = false; }
  }
}

// ──────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────
function logout() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('shifted_user');
  window.location.href = 'index.html';
}

// ──────────────────────────────────────────────
// GUARD
// ──────────────────────────────────────────────
function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
  }
}

function redirectIfLoggedIn() {
  if (isLoggedIn()) {
    window.location.href = 'dashboard.html';
  }
}
