/**
 * js/transform.js
 * Koordinat Transformation Engine + Transform UI
 * — Shifted. Dashboard —
 *
 * ✔ Engine Molodensky-Badekas 10-parameter (ID74 ↔ WGS84)
 *   (7 param transformasi + 3 centroid/pivot)
 * ✔ [FIX 1] Ellipsoid ID74 diperbaiki: GRS67 (bukan Bessel 1841)
 * ✔ [FIX 2] Faktor skala diperbaiki: ds = delta skala (bukan faktor penuh)
 * ✔ [FIX 3] Koreksi epok time-dependent (Ve/Vn/Vup dari SRGI BIG)
 *           ID74(1980) → WGS84(2021) → koreksi → WGS84(2025 default / 2026 validasi)
 * ✔ molodensky7() — engine ECEF ↔ ECEF (titik pivot / centroid)
 * ✔ molodensky7param() — fungsi transformasi publik (geografis)
 * ✔ applyEpochCorrection() — koreksi epok ECEF
 * ✔ Validasi input kosong sebelum transformasi
 * ✔ Format koordinat INPUT dan OUTPUT terpisah
 * ✔ runTransform() — plot marker + garis + legend di peta
 * ✔ renderTable()  — tabel CSV lengkap + kolom Residual
 * ✔ calcResidual() — hitung residual per titik (forward → inverse → selisih)
 * ✔ Download CSV queue
 */

'use strict';

// ──────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────
let csvData = [];
let dlQueue = [];
let _legendControl = null;
let _lastResults = [];
let epochEffectEnabled = false;
let epochEffectYear    = 2026;   // tahun target default
let epochEffectMonth   = 1;      // bulan target default (1 = Januari)

// ──────────────────────────────────────────────
// EPOCH EFFECT — velocity-based (EpochTransformation.java)
//   X(t) = X(t0) + Vx * (t − t0)
//   Epok referensi t0 = 2021.0
//   Vx = −0.027 m/thn, Vy = −0.007 m/thn, Vz = −0.004 m/thn
//   dt dihitung dari tahun desimal: year + (month−1)/12
// ──────────────────────────────────────────────
const EPOCH_EFFECT_REF  = 2021.0;
const EPOCH_EFFECT_VELO = { Vx: -0.027, Vy: -0.007, Vz: -0.004 };  // m/tahun

function _epochDecimalYear() {
  return epochEffectYear + (epochEffectMonth - 1) / 12;
}

function _getEpochCorrection() {
  const dt = _epochDecimalYear() - EPOCH_EFFECT_REF;
  return {
    dX: EPOCH_EFFECT_VELO.Vx * dt,
    dY: EPOCH_EFFECT_VELO.Vy * dt,
    dZ: EPOCH_EFFECT_VELO.Vz * dt,
    dt,
  };
}

/** Format dt (dalam tahun desimal) menjadi "X thn Y bln" */
function _dtLabel() {
  const totalMonths = Math.round((_epochDecimalYear() - EPOCH_EFFECT_REF) * 12);
  const yrs = Math.floor(Math.abs(totalMonths) / 12);
  const mns = Math.abs(totalMonths) % 12;
  const sign = totalMonths < 0 ? '−' : '';
  if (yrs === 0) return `${sign}${mns} bln`;
  if (mns === 0) return `${sign}${yrs} thn`;
  return `${sign}${yrs} thn ${mns} bln`;
}

const _HISTORY_KEY = 'shifted_history';
const _HISTORY_MAX = 50;

// ──────────────────────────────────────────────
// WK ROKAN BOUNDING BOX
//   Parameter transformasi diestimasi dari titik sekutu
//   di wilayah WK Rokan (Riau). Transformasi di luar
//   area ini belum divalidasi.
// ──────────────────────────────────────────────
const WK_ROKAN_BOUNDS = {
  south:  0.0,   // °LU
  north:  2.7,   // °LU
  west:  99.5,   // °BT
  east:  102.5,  // °BT
};

function _isOutsideWKRokan(lat, lon) {
  return lat < WK_ROKAN_BOUNDS.south || lat > WK_ROKAN_BOUNDS.north
      || lon < WK_ROKAN_BOUNDS.west  || lon > WK_ROKAN_BOUNDS.east;
}

// ──────────────────────────────────────────────
// ELLIPSOID DEFINITIONS
// [FIX 1] ID74 memakai GRS67, BUKAN Bessel 1841.
//         Bessel 1841 adalah ellipsoid datum PKU (lokal Jawa).
//         ID74 berbasis GRS67 (geosentris) — sesuai proposal halaman 6.
// ──────────────────────────────────────────────
const ELLS = {
  bessel: { a: 6377397.155,  invf: 299.1528128   },  // PKU — bukan ID74
  grs67:  { a: 6378160.0,    invf: 298.247167427  },  // ID74 ← BENAR
  grs80:  { a: 6378137.0,    invf: 298.257222101  },
  wgs84:  { a: 6378137.0,    invf: 298.257223563  },
};

function ell(key) {
  const e = ELLS[key], f = 1 / e.invf;
  return { a: e.a, f, b: e.a * (1 - f), e2: 2 * f - f * f };
}

// ══════════════════════════════════════════════
// ★ PARAMETER MOLODENSKY-BADEKAS 10-PARAMETER
//   7 param transformasi + 3 centroid (Xc, Yc, Zc)
//
// [FIX 2] ds = DELTA SKALA, bukan faktor skala penuh.
//   Formula MB: X_tgt = T + (1 + ds) * R * (X - Xc) + Xc
//   ds_fwd = 0.999990508941089 - 1 = -9.491058911e-6
//   ds_inv = 1.00000948897926  - 1 = +9.48897926e-6
//
//   Sebelumnya kode memakai k=0.999990... langsung sebagai
//   faktor skala penuh di dalam molodensky7(), yang berarti
//   (1 + k) ≈ 1.9999905 — salah besar.
// ══════════════════════════════════════════════
const P_FWD = {
  dX: -21.19842214573270,
  dY: -28.40729066147050,
  dZ:   4.64619397366998,
  ds:  -9.491058911e-6,          // [FIX 2] delta skala
  rX:  -0.00008009778439665730,  // radian
  rY:  -0.00001172162087323510,
  rZ:   0.00000856025959727141,
  Xc:  -1249136.39553482,        // centroid/pivot ID74 (epok 2021)
  Yc:   6254162.39016529,
  Zc:     79114.45553701810,
};

const P_INV = {
  dX:  21.1984213025931,
  dY:  28.4072905075436,
  dZ:  -4.6461937321203,
  ds:   9.48897926e-6,            // [FIX 2] delta skala
  rX:   0.0000800997584898269,
  rY:   0.000011722237154875,
  rZ:  -0.00000856076405416893,
  Xc:  -1249157.59308889,         // centroid/pivot WGS84 (epok 2021)
  Yc:   6254133.98235556,
  Zc:     79119.09972222220,
};

// ══════════════════════════════════════════════
// ★ [FIX 3] KOREKSI EPOK — TIME-DEPENDENT
//
//   Kecepatan lempeng WK Rokan (SRGI BIG, 2025):
//     Ve  = -0.0265 m/tahun  (ke Timur)
//     Vn  = -0.0076 m/tahun  (ke Utara)
//     Vup = -0.0046 m/tahun  (vertikal)
//
//   Posisi sentral WK Rokan: ~1.3°LU, ~101.0°BT
//
//   Konversi Ve/Vn/Vup → Vx/Vy/Vz (ECEF):
//     Vx = -Ve*sin(lon) - Vn*sin(lat)*cos(lon) + Vup*cos(lat)*cos(lon)
//     Vy =  Ve*cos(lon) - Vn*sin(lat)*sin(lon) + Vup*cos(lat)*sin(lon)
//     Vz =               Vn*cos(lat)           + Vup*sin(lat)
//
//   Formula koreksi:
//     X(t2) = X(t1) + Vx * (t2 - t1)
//
//   Alur:
//     ID74(1980) → MB → WGS84(2021) → +Δt → WGS84(2025) default output
//                                    → +Δt → WGS84(2026) untuk validasi titik ikat
// ══════════════════════════════════════════════
const EPOCH = {
  param:     2021.0,   // epok saat parameter MB diestimasi
  ikat:      2026.0,   // epok titik ikat pengukuran validasi
  target:    2025.0,   // epok output default dashboard
  Ve:       -0.0265,   // m/tahun ke Timur
  Vn:       -0.0076,   // m/tahun ke Utara
  Vup:      -0.0046,   // m/tahun vertikal
  latCenter: 1.3,      // derajat LU — pusat WK Rokan
  lonCenter: 101.0,    // derajat BT
};

/**
 * Konversi kecepatan toposentrik (Ve/Vn/Vup) ke ECEF (Vx/Vy/Vz).
 * Dihitung sekali saat load menggunakan posisi sentral WK Rokan.
 */
function _computeVelocityECEF(latDeg, lonDeg) {
  const lat    = latDeg * Math.PI / 180;
  const lon    = lonDeg * Math.PI / 180;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  return {
    Vx: -EPOCH.Ve  * sinLon
        - EPOCH.Vn  * sinLat * cosLon
        + EPOCH.Vup * cosLat * cosLon,
    Vy:  EPOCH.Ve  * cosLon
        - EPOCH.Vn  * sinLat * sinLon
        + EPOCH.Vup * cosLat * sinLon,
    Vz:  EPOCH.Vn  * cosLat
        + EPOCH.Vup * sinLat,
  };
}

// Pre-hitung kecepatan ECEF satu kali saat file dimuat
const _V = _computeVelocityECEF(EPOCH.latCenter, EPOCH.lonCenter);

/**
 * Terapkan koreksi epok pada koordinat ECEF.
 * @param {{X,Y,Z}} ecef  - koordinat ECEF (meter)
 * @param {number}  tFrom - epok asal  (misal 2021)
 * @param {number}  tTo   - epok tujuan (misal 2025 atau 2026)
 * @returns {{X,Y,Z}}
 */
function applyEpochCorrection(ecef, tFrom, tTo) {
  const dt = tTo - tFrom;
  return {
    X: ecef.X + _V.Vx * dt,
    Y: ecef.Y + _V.Vy * dt,
    Z: ecef.Z + _V.Vz * dt,
  };
}

// ──────────────────────────────────────────────
// KONVERSI DERAJAT ↔ RADIAN
// ──────────────────────────────────────────────
const d2r = v => v * Math.PI / 180;
const r2d = v => v * 180 / Math.PI;

// ──────────────────────────────────────────────
// ECEF ↔ GEOGRAPHIC
// ──────────────────────────────────────────────
function toECEF(lat, lon, h, ellKey) {
  const { a, e2 } = ell(ellKey);
  const phi = d2r(lat), lam = d2r(lon);
  const sp = Math.sin(phi), cp = Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * sp * sp);
  return {
    X: (N + h) * cp * Math.cos(lam),
    Y: (N + h) * cp * Math.sin(lam),
    Z: (N * (1 - e2) + h) * sp,
  };
}

function fromECEF(X, Y, Z, ellKey) {
  const { a, e2 } = ell(ellKey);
  const lam = Math.atan2(Y, X);
  const p   = Math.sqrt(X * X + Y * Y);
  let phi   = Math.atan2(Z, p * (1 - e2));
  let h     = 0;
  for (let i = 0; i < 12; i++) {
    const sp = Math.sin(phi);
    const N  = a / Math.sqrt(1 - e2 * sp * sp);
    h   = p / Math.cos(phi) - N;
    phi = Math.atan2(Z + e2 * N * sp, p);
  }
  return { lat: r2d(phi), lon: r2d(lam), h };
}

// ══════════════════════════════════════════════
// ★ molodensky7 — Engine ECEF → ECEF
//
// [FIX 2] Formula: X_tgt = T + (1+ds)*R*(X-Xc) + Xc
//   ds = delta skala (bukan faktor penuh)
//
// [FIX 4] Sign convention rotasi: COORDINATE FRAME
//   Ada dua konvensi standar yang berbeda tanda rotasinya:
//
//   Position Vector  (salah untuk parameter ini):
//     [ dx + rZ*dy - rY*dz ]
//     [-rZ*dx + dy + rX*dz ]
//     [ rY*dx - rX*dy + dz ]
//
//   Coordinate Frame (benar untuk parameter ini) ← DIPAKAI
//     [ dx - rZ*dy + rY*dz ]
//     [ rZ*dx + dy - rX*dz ]
//     [-rY*dx + rX*dy + dz ]
//
//   Perbedaan ini menyebabkan error ~16 cm di komponen lat.
//   Parameter Helmert kamu menggunakan Coordinate Frame convention.
// ══════════════════════════════════════════════
function molodensky7(X, Y, Z, p) {
  const { dX, dY, dZ, ds, rX, rY, rZ, Xc, Yc, Zc } = p;
  const scale = 1.0 + ds;   // (1 + delta_skala)
  const dx = X - Xc;
  const dy = Y - Yc;
  const dz = Z - Zc;
  // Coordinate Frame convention (tanda rX/rY/rZ dibalik dari Position Vector)
  return {
    X: dX + scale * (dx    - rZ * dy + rY * dz) + Xc,
    Y: dY + scale * (rZ * dx + dy    - rX * dz) + Yc,
    Z: dZ + scale * (-rY * dx + rX * dy + dz)   + Zc,
  };
}

// ══════════════════════════════════════════════
// ★ PUBLIC TRANSFORM API
//
// [FIX 1+2+3] Semua perbaikan terintegrasi di sini.
//
//   Alur ID74(1980) → WGS84(epochTarget):
//     1. toECEF dengan GRS67   ← [FIX 1]
//     2. molodensky7 (ds fix)  ← [FIX 2] → WGS84 ECEF epok 2021
//     3. applyEpochCorrection(2021 → epochTarget) ← [FIX 3]
//     4. fromECEF dengan WGS84
//
//   Alur WGS84(epochTarget) → ID74(1980):
//     1. toECEF dengan WGS84
//     2. applyEpochCorrection(epochTarget → 2021)  ← balik arah [FIX 3]
//     3. molodensky7 inverse (ds fix) ← [FIX 2] → ID74 ECEF
//     4. fromECEF dengan GRS67 ← [FIX 1]
//
//   @param {number} [epochTarget] epok WGS84 output, default EPOCH.target (2025)
//                                 Gunakan EPOCH.ikat (2026) untuk validasi titik ikat
// ══════════════════════════════════════════════
function molodensky7param(lat, lon, dir, epochTarget) {
  // ──────────────────────────────────────────────────────────
  // PENTING: Parameter P_FWD / P_INV diestimasi dari titik
  // sekutu GNSS TANPA koreksi epoch. Epoch correction TIDAK
  // boleh diaplikasikan ke dalam alur utama transformasi.
  //
  // epochEffectEnabled hanya untuk keperluan analisis tambahan
  // (ditampilkan di UI sebagai informasi, bukan bagian kalkulasi).
  // ──────────────────────────────────────────────────────────
  const fwd = (dir === 'id74_wgs84');

  if (fwd) {
    // ID74(1980) → WGS84
    const ecef0  = toECEF(lat, lon, 0, 'grs67');                   // [GRS67]
    const ecef21 = molodensky7(ecef0.X, ecef0.Y, ecef0.Z, P_FWD);  // MB transform
    return fromECEF(ecef21.X, ecef21.Y, ecef21.Z, 'wgs84');

  } else {
    // WGS84 → ID74(1980)
    const ecefT  = toECEF(lat, lon, 0, 'wgs84');
    const ecef74 = molodensky7(ecefT.X, ecefT.Y, ecefT.Z, P_INV);  // MB inverse
    return fromECEF(ecef74.X, ecef74.Y, ecef74.Z, 'grs67');         // [GRS67]
  }
}

function id74ToWgs84(lat, lon, _h = 0, epochTarget) {
  return molodensky7param(lat, lon, 'id74_wgs84', epochTarget);
}

function wgs84ToId74(lat, lon, _h = 0, epochTarget) {
  return molodensky7param(lat, lon, 'wgs84_id74', epochTarget);
}

function passThrough(lat, lon, h = 0) { return { lat, lon, h }; }

function transform(lat, lon, from, to, h = 0, epochTarget) {
  if (from === to) return passThrough(lat, lon, h);
  const dir = (from === 'id74' && to === 'wgs84') ? 'id74_wgs84' : 'wgs84_id74';
  return molodensky7param(lat, lon, dir, epochTarget);
}

// ══════════════════════════════════════════════
// ★ RESIDUAL CALCULATOR
// ══════════════════════════════════════════════
function calcResidual(latIn, lonIn, latOut, lonOut, from, to) {
  const back = transform(latOut, lonOut, to, from);
  const residual = calcDistance(latIn, lonIn, back.lat, back.lon);
  return { residual, latBack: back.lat, lonBack: back.lon };
}

function residualClass(r) {
  if (r < 0.01)  return { label: 'Sangat Baik', color: '#0ca678', bg: '#e8f8f2' };
  if (r < 0.10)  return { label: 'Baik',        color: '#1098ad', bg: '#e3f8ff' };
  if (r < 0.50)  return { label: 'Cukup',       color: '#f59f00', bg: '#fff8e1' };
  if (r < 1.00)  return { label: 'Rendah',      color: '#fd7e14', bg: '#fff3e0' };
  return               { label: 'Buruk',        color: '#fa5252', bg: '#fff0f0' };
}

// ──────────────────────────────────────────────
// FORMAT UTILITIES
// ──────────────────────────────────────────────
function toDMS(dd, isLat) {
  const abs = Math.abs(dd);
  const d   = Math.floor(abs);
  const mf  = (abs - d) * 60;
  const m   = Math.floor(mf);
  const s   = ((mf - m) * 60).toFixed(8);
  const dir = isLat ? (dd >= 0 ? 'N' : 'S') : (dd >= 0 ? 'E' : 'W');
  return `${d}°${String(m).padStart(2, '0')}'${s}" ${dir}`;
}

function toDDM(dd, isLat) {
  const abs = Math.abs(dd);
  const d   = Math.floor(abs);
  const m   = ((abs - d) * 60).toFixed(5);
  const dir = isLat ? (dd >= 0 ? 'N' : 'S') : (dd >= 0 ? 'E' : 'W');
  return `${d}° ${m}' ${dir}`;
}

function formatCoord(lat, lon, fmt) {
  switch (fmt) {
    case 'dms': return { latStr: toDMS(lat, true),  lonStr: toDMS(lon, false), label: 'DMS' };
    case 'ddm': return { latStr: toDDM(lat, true),  lonStr: toDDM(lon, false), label: 'DDM' };
    case 'utm': {
      const u = _latLonToUTM(lat, lon);
      return {
        latStr:   u.easting.toFixed(3) + ' m',
        lonStr:   u.northing.toFixed(3) + ' m',
        label:    'UTM 47N',
        latLabel: 'E',
        lonLabel: 'N',
      };
    }
    default:    return { latStr: lat.toFixed(8),    lonStr: lon.toFixed(8),    label: 'DD'  };
  }
}

function formatCoordShort(lat, lon, fmt) {
  switch (fmt) {
    case 'dms': return `${toDMS(lat, true)}, ${toDMS(lon, false)}`;
    case 'ddm': return `${toDDM(lat, true)}, ${toDDM(lon, false)}`;
    case 'utm': {
      const u = _latLonToUTM(lat, lon);
      return `47N E${u.easting.toFixed(0)} N${u.northing.toFixed(0)}`;
    }
    default:    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

// ──────────────────────────────────────────────
// PARSE INPUT
// ──────────────────────────────────────────────
function parseLatLon(str, fmt) {
  if (!str || !str.trim()) return null;
  const s = str.trim();

  // UTM: "47N 722369.000 143752.000"
  const utmRe = /^(\d{1,2})([A-Za-z])\s+([\d.]+)\s+([\d.]+)$/;
  const utmM  = s.match(utmRe);
  if (utmM) {
    const zone     = parseInt(utmM[1]);
    const bandChar = utmM[2].toUpperCase();
    const easting  = parseFloat(utmM[3]);
    const northing = parseFloat(utmM[4]);
    if (zone >= 1 && zone <= 60 && easting >= 100000 && easting <= 900000) {
      // Band C–M = selatan, N–X = utara
      const hem = 'CDEFGHJKLM'.includes(bandChar) ? 'S' : 'N';
      const res = _utmToLatLon(zone, hem, easting, northing);
      if (!isNaN(res.lat) && !isNaN(res.lon)) return res;
    }
  }

  const ddMatch = s.match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
  if (ddMatch) {
    const lat = parseFloat(ddMatch[1]);
    const lon = parseFloat(ddMatch[2]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)
      return { lat, lon };
  }

  const dmsRe = /(\d+)[°d\s]+(\d+)['\s]+(\d+\.?\d*)["s]?\s*([NSEWnsew])/g;
  const dmsMatches = [...s.matchAll(dmsRe)];
  if (dmsMatches.length >= 2) {
    const parse1 = m => (parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600)
                        * (/[Ss]/i.test(m[4]) || /[Ww]/i.test(m[4]) ? -1 : 1);
    const lat = parse1(dmsMatches[0]);
    const lon = parse1(dmsMatches[1]);
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }

  const ddmRe = /(\d+)[°d\s]+(\d+\.?\d*)['m]?\s*([NSEWnsew])/g;
  const ddmMatches = [...s.matchAll(ddmRe)];
  if (ddmMatches.length >= 2) {
    const parse2 = m => (parseFloat(m[1]) + parseFloat(m[2]) / 60)
                        * (/[Ss]/i.test(m[3]) || /[Ww]/i.test(m[3]) ? -1 : 1);
    const lat = parse2(ddmMatches[0]);
    const lon = parse2(ddmMatches[1]);
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }

  return null;
}

// ──────────────────────────────────────────────
// CSV PARSE
// ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const hdr  = lines[0].toLowerCase().split(',').map(h => h.trim());
  const iId  = hdr.indexOf('id');
  const iLat = hdr.indexOf('lat');
  const iLon = hdr.indexOf('lon');
  if (iLat < 0 || iLon < 0) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const lat  = parseFloat(cols[iLat]);
    const lon  = parseFloat(cols[iLon]);
    if (!isNaN(lat) && !isNaN(lon))
      rows.push({ id: iId >= 0 ? (cols[iId]?.trim() || i) : i, lat, lon });
  }
  return rows.length ? rows : null;
}

function toCSVStr(results) {
  const h = 'id,lat_asal,lon_asal,lat_hasil,lon_hasil,jarak_m,arah_deg,residual_m,kualitas,datum_asal,datum_tujuan';
  const r = results.map(r => {
    const d   = calcDistance(r.latIn, r.lonIn, r.latOut, r.lonOut);
    const b   = calcBearing(r.latIn, r.lonIn, r.latOut, r.lonOut);
    const res = calcResidual(r.latIn, r.lonIn, r.latOut, r.lonOut, r.from, r.to);
    const cls = residualClass(res.residual);
    return `${r.id},${r.latIn},${r.lonIn},${r.latOut.toFixed(8)},${r.lonOut.toFixed(8)},`
         + `${d.toFixed(3)},${b.toFixed(2)},${res.residual.toFixed(6)},${cls.label},${r.from},${r.to}`;
  });
  return [h, ...r].join('\n');
}

// ──────────────────────────────────────────────
// JARAK & ARAH
// ──────────────────────────────────────────────
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = Math.PI / 180;
  const p1 = lat1 * r, p2 = lat2 * r;
  const dp = (lat2 - lat1) * r, dl = (lon2 - lon1) * r;
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcBearing(lat1, lon1, lat2, lon2) {
  const r  = Math.PI / 180, dl = (lon2 - lon1) * r;
  const y  = Math.sin(dl) * Math.cos(lat2 * r);
  const x  = Math.cos(lat1 * r) * Math.sin(lat2 * r)
            - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function bearingToText(b) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(b / 45) % 8];
}

// ══════════════════════════════════════════════
// ★ UTM CONVERSION (WGS84 ellipsoid)
//   Konversi menggunakan WGS84 untuk semua datum.
//   Selisih GRS67 vs WGS84 < 2 m — dapat diterima.
// ══════════════════════════════════════════════
function _latLonToUTM(lat, lon) {
  const a   = 6378137.0, f = 1 / 298.257223563;
  const e2  = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0  = 0.9996;
  const e4  = e2 * e2, e6 = e4 * e2;

  const zone = Math.floor((lon + 180) / 6) + 1;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi  = lat * Math.PI / 180;
  const lam  = lon * Math.PI / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lam - lam0);
  const M = a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)       * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024)   * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024)               * Math.sin(4 * phi)
    - (35 * e6 / 3072)                               * Math.sin(6 * phi)
  );

  const easting = k0 * N * (
    A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120
  ) + 500000;

  let northing = k0 * (
    M + N * Math.tan(phi) * (
      A ** 2 / 2
      + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
      + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720
    )
  );
  if (lat < 0) northing += 10000000;

  const BANDS   = 'CDEFGHJKLMNPQRSTUVWX';
  const bandIdx = Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)));
  const band    = (lat >= -80 && lat <= 84) ? BANDS[bandIdx] : '?';
  return { zone, band, easting, northing, hemisphere: lat >= 0 ? 'N' : 'S' };
}

function _utmToLatLon(zone, hemisphere, easting, northing) {
  const a   = 6378137.0, f = 1 / 298.257223563;
  const e2  = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0  = 0.9996;
  const e4  = e2 * e2, e6 = e4 * e2;

  const x   = easting - 500000;
  let   y   = northing;
  if (hemisphere === 'S') y -= 10000000;

  const lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const M    = y / k0;
  const mu   = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));

  const e1   = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32)               * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32)        * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96)                           * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512)                         * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D  = x / (N1 * k0);

  const phi = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2)                                  * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2)              * D ** 6 / 720
  );
  const lam = lam0 + (
    D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
  ) / Math.cos(phi1);

  return { lat: phi * 180 / Math.PI, lon: lam * 180 / Math.PI };
}

// ══════════════════════════════════════════════
// ★ RUN TRANSFORM
// ══════════════════════════════════════════════
function runTransform() {
  const mode   = document.querySelector('input[name="imode"]:checked')?.value || 'manual';
  const from   = document.getElementById('datum-asal')?.value;
  const to     = document.getElementById('datum-tujuan')?.value;
  const fmtIn  = document.getElementById('fmt-coord-input')?.value  || 'dd';
  const fmtOut = document.getElementById('fmt-coord-output')?.value || 'dd';

  if (window.clearAllPlots) window.clearAllPlots();

  // ══ MODE CSV ══════════════════════════════════
  if (mode === 'csv') {
    if (!csvData?.length) {
      _toast('Upload file CSV terlebih dahulu!', 'amber');
      return;
    }

    // Cek apakah ada titik di luar WK Rokan
    if (!_skipBoundsCheck && from !== to) {
      const outsideRow = csvData.find(r => _isOutsideWKRokan(parseFloat(r.lat), parseFloat(r.lon)));
      if (outsideRow) {
        _showOutsideBoundsWarning(() => runTransform());
        return;
      }
    }

    let totalDist = 0, minDist = Infinity, maxDist = -Infinity;
    const results = [];

    csvData.forEach(row => {
      const lat = parseFloat(row.lat);
      const lon = parseFloat(row.lon);
      const res = transform(lat, lon, from, to);
      const d   = calcDistance(lat, lon, res.lat, res.lon);

      totalDist += d;
      if (d < minDist) minDist = d;
      if (d > maxDist) maxDist = d;

      results.push({
        id: row.id, latIn: lat, lonIn: lon,
        latOut: res.lat, lonOut: res.lon, from, to,
      });

      if (window.plotPointPair) {
        window.plotPointPair(lat, lon, res.lat, res.lon, row.id, fmtIn, fmtOut);
      }
    });

    renderTable(results, fmtIn, fmtOut);
    if (window.fitToPlots) window.fitToPlots();
    _addToQueue(results, from, to);
    _pushHistory(results, from, to, 'csv');
    _lastResults = results;
    _showInverseBtn(from, to);
    _toast(`${csvData.length} titik berhasil ditransformasi!`, 'green');
    return;
  }

  // ══ MODE MANUAL ═══════════════════════════════
  if (mode === 'manual') {
    let parsed;

    if (fmtIn === 'utm') {
      // UTM 47N — zone dan hemisphere di-hardcode
      const eastingEl  = document.getElementById('utm-easting');
      const northingEl = document.getElementById('utm-northing');

      const easting  = parseFloat((eastingEl?.value  || '').replace(',', '.'));
      const northing = parseFloat((northingEl?.value || '').replace(',', '.'));

      if (isNaN(easting) || easting < 100000 || easting > 900000) {
        _toast('Easting tidak valid! (100000 – 900000 m)', 'amber');
        _shakeInput('utm-easting');
        return;
      }
      if (isNaN(northing) || northing < 0 || northing > 1000000) {
        _toast('Northing UTM 47N tidak valid! (~0 – 1000000 m)', 'amber');
        _shakeInput('utm-northing');
        return;
      }

      // Konversi UTM 47N → lat/lon (Northern hemisphere)
      parsed = _utmToLatLon(47, 'N', easting, northing);
      if (!parsed || isNaN(parsed.lat) || isNaN(parsed.lon)) {
        _toast('Konversi UTM gagal, periksa nilai koordinat!', 'amber');
        return;
      }

    } else {
      const val = document.getElementById('coord-val')?.value?.trim();

      if (!val) {
        _toast('Input koordinat tidak boleh kosong!', 'amber');
        _shakeInput('coord-val');
        return;
      }

      parsed = parseLatLon(val, fmtIn);
      if (!parsed) {
        const eg = fmtIn === 'dms'
          ? 'Contoh: 6°12\'31.68"S, 106°50\'44.16"E'
          : 'Contoh: -6.2088, 106.8456';
        _toast(`Format salah! ${eg}`, 'amber');
        _shakeInput('coord-val');
        return;
      }
    }

    if (parsed.lat < -90 || parsed.lat > 90) {
      _toast('Lintang harus antara -90 dan 90!', 'amber');
      return;
    }
    if (parsed.lon < -180 || parsed.lon > 180) {
      _toast('Bujur harus antara -180 dan 180!', 'amber');
      return;
    }

    // Cek apakah koordinat di luar area WK Rokan
    if (!_skipBoundsCheck && from !== to && _isOutsideWKRokan(parsed.lat, parsed.lon)) {
      _showOutsideBoundsWarning(() => runTransform());
      return;
    }

    const res = transform(parsed.lat, parsed.lon, from, to);
    const fmt = formatCoord(res.lat, res.lon, fmtOut);

    const resid = calcResidual(parsed.lat, parsed.lon, res.lat, res.lon, from, to);
    const cls   = residualClass(resid.residual);

    const rb = document.getElementById('result-box');
    const rv = document.getElementById('result-vals');
    const rf = document.getElementById('result-fmt');
    if (rb) rb.classList.add('show');
    if (rv) rv.innerHTML =
      `<span style="color:#5a6278;font-size:10px;font-weight:600;">${fmt.latLabel || 'LAT'}</span> ${fmt.latStr}<br>` +
      `<span style="color:#5a6278;font-size:10px;font-weight:600;">${fmt.lonLabel || 'LON'}</span> ${fmt.lonStr}<br>` +
      `<div style="margin-top:8px;padding:6px 8px;background:${cls.bg};border-radius:6px;
        display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:10px;color:#5a6278;font-weight:600;">RESIDUAL</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${cls.color};font-weight:700;">
          ${resid.residual < 0.001
            ? resid.residual.toExponential(3)
            : resid.residual.toFixed(6)} m
          &nbsp;<span style="font-size:9px;background:${cls.color};color:#fff;
            padding:1px 6px;border-radius:10px;">${cls.label}</span>
        </span>
      </div>`;
    if (rf) rf.textContent = `[${fmt.label}]`;

    if (window.plotPointPair) {
      window.plotPointPair(parsed.lat, parsed.lon, res.lat, res.lon, null, fmtIn, fmtOut);
    }
    if (window.fitToPlots) window.fitToPlots();

    const manualResult = [{
      id: 1, latIn: parsed.lat, lonIn: parsed.lon,
      latOut: res.lat, lonOut: res.lon, from, to,
    }];
    _addToQueue(manualResult, from, to);
    _pushHistory(manualResult, from, to, 'manual');
    _lastResults = manualResult;
    _showInverseBtn(from, to);

    _toast('Transformasi berhasil!', 'green');
  }
}

// ──────────────────────────────────────────────
// SHAKE ANIMATION
// ──────────────────────────────────────────────
function _shakeInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.transition = 'transform 0.07s ease, border-color 0.2s';
  el.style.borderColor = '#ef4444';
  const seq = ['-4px', '4px', '-4px', '4px', '0px'];
  let i = 0;
  const tick = () => {
    if (i >= seq.length) {
      el.style.transform = '';
      setTimeout(() => { el.style.borderColor = ''; }, 800);
      return;
    }
    el.style.transform = `translateX(${seq[i++]})`;
    setTimeout(tick, 70);
  };
  tick();
}

// ──────────────────────────────────────────────
// CSV FILE LOADER
// ──────────────────────────────────────────────
function onCSVLoad(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('csv-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    if (parsed) {
      csvData = parsed;
      _toast(`${csvData.length} titik berhasil dimuat`, 'green');
    } else {
      csvData = [];
      _toast('Format CSV tidak valid! Kolom wajib: id, lat, lon', 'amber');
    }
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════════════
// ★ RENDER TABLE — dengan kolom Residual
// ══════════════════════════════════════════════
function renderTable(results, fmtIn, fmtOut) {
  const wrapper = document.getElementById('table-preview');
  if (!wrapper) return;

  let totalDist = 0, minDist = Infinity, maxDist = -Infinity;
  let totalRes  = 0, minRes  = Infinity, maxRes  = -Infinity;

  const rows = results.map(r => {
    const d   = calcDistance(r.latIn, r.lonIn, r.latOut, r.lonOut);
    const b   = calcBearing(r.latIn, r.lonIn, r.latOut, r.lonOut);
    const t   = bearingToText(b);
    const dStr = d >= 1000 ? `${(d / 1000).toFixed(3)} km` : `${d.toFixed(2)} m`;

    const resid = calcResidual(r.latIn, r.lonIn, r.latOut, r.lonOut, r.from, r.to);
    const cls   = residualClass(resid.residual);
    const residStr = resid.residual < 0.001
      ? resid.residual.toExponential(3)
      : resid.residual.toFixed(6);

    totalDist += d;
    if (d < minDist) minDist = d;
    if (d > maxDist) maxDist = d;

    totalRes += resid.residual;
    if (resid.residual < minRes) minRes = resid.residual;
    if (resid.residual > maxRes) maxRes = resid.residual;

    return { r, d, dStr, b, t, resid, residStr, cls };
  });

  const fmtD   = v => v >= 1000 ? `${(v / 1000).toFixed(3)} km` : `${v.toFixed(2)} m`;
  const fmtR   = v => v < 0.001 ? v.toExponential(3) : v.toFixed(6);
  const avg    = results.length ? totalDist / results.length : 0;
  const avgRes = results.length ? totalRes  / results.length : 0;

  const rmse = Math.sqrt(
    results.reduce((sum, r) => {
      const res = calcResidual(r.latIn, r.lonIn, r.latOut, r.lonOut, r.from, r.to);
      return sum + res.residual ** 2;
    }, 0) / results.length
  );

  wrapper.innerHTML = `
    <div class="tbl-header">
      <div class="tbl-header-title">
        📊 Hasil Transformasi CSV
        <span class="tbl-badge">${results.length} titik</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;padding:10px 12px;background:#f8f9fb;
      border-bottom:1px solid #e4e7ee;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;padding:8px 12px;background:#fff;
        border:1px solid #e4e7ee;border-radius:8px;">
        <div style="font-size:9px;font-weight:700;color:#9aa0b4;text-transform:uppercase;
          letter-spacing:1px;margin-bottom:3px;">RMSE Residual</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;
          color:${residualClass(rmse).color};font-weight:700;">${fmtR(rmse)} m</div>
      </div>
      <div style="flex:1;min-width:120px;padding:8px 12px;background:#fff;
        border:1px solid #e4e7ee;border-radius:8px;">
        <div style="font-size:9px;font-weight:700;color:#9aa0b4;text-transform:uppercase;
          letter-spacing:1px;margin-bottom:3px;">Residual Min</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;
          color:${residualClass(minRes).color};font-weight:700;">${fmtR(minRes)} m</div>
      </div>
      <div style="flex:1;min-width:120px;padding:8px 12px;background:#fff;
        border:1px solid #e4e7ee;border-radius:8px;">
        <div style="font-size:9px;font-weight:700;color:#9aa0b4;text-transform:uppercase;
          letter-spacing:1px;margin-bottom:3px;">Residual Maks</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;
          color:${residualClass(maxRes).color};font-weight:700;">${fmtR(maxRes)} m</div>
      </div>
      <div style="flex:1;min-width:120px;padding:8px 12px;background:#fff;
        border:1px solid #e4e7ee;border-radius:8px;">
        <div style="font-size:9px;font-weight:700;color:#9aa0b4;text-transform:uppercase;
          letter-spacing:1px;margin-bottom:3px;">Rata-rata</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;
          color:${residualClass(avgRes).color};font-weight:700;">${fmtR(avgRes)} m</div>
      </div>
    </div>
    <div class="tbl-scroll">
      <table id="preview-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Koordinat Asal<br><em style="font-weight:400;color:#9aa0b4;">${(fmtIn||'dd').toUpperCase()}</em></th>
            <th>Koordinat Hasil<br><em style="font-weight:400;color:#9aa0b4;">${(fmtOut||'dd').toUpperCase()}</em></th>
            <th>Jarak</th>
            <th>Arah °</th>
            <th>Residual (m)</th>
            <th>Kualitas</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ r, d, dStr, b, t, resid, residStr, cls }) => `
            <tr>
              <td class="td-id">${r.id}</td>
              <td class="td-asal">${formatCoordShort(r.latIn,  r.lonIn,  fmtIn  || 'dd')}</td>
              <td class="td-hasil">${formatCoordShort(r.latOut, r.lonOut, fmtOut || 'dd')}</td>
              <td class="td-jarak">${dStr}</td>
              <td class="td-arah">${b.toFixed(2)}°</td>
              <td style="font-family:'JetBrains Mono',monospace;font-size:10.5px;
                color:${cls.color};font-weight:600;">${residStr}</td>
              <td>
                <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;
                  background:${cls.bg};color:${cls.color};white-space:nowrap;">
                  ${cls.label}
                </span>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="tbl-summary">
      <span>Jarak Min: <strong>${fmtD(minDist)}</strong></span>
      <span>Jarak Maks: <strong>${fmtD(maxDist)}</strong></span>
      <span>Rata-rata: <strong>${fmtD(avg)}</strong></span>
    </div>
  `;
  wrapper.style.display = 'block';
}

// ══════════════════════════════════════════════
// ★ EXPORT GeoJSON
// ══════════════════════════════════════════════
function toGeoJSON(results) {
  const features = [];
  results.forEach(r => {
    const resid = calcResidual(r.latIn, r.lonIn, r.latOut, r.lonOut, r.from, r.to);
    const cls   = residualClass(resid.residual);
    const dist  = calcDistance(r.latIn, r.lonIn, r.latOut, r.lonOut);
    const bear  = calcBearing(r.latIn, r.lonIn, r.latOut, r.lonOut);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lonIn, r.latIn] },
      properties: { id: r.id, tipe: 'Titik Asal', datum: r.from.toUpperCase(),
        lat: r.latIn, lon: r.lonIn, jarak_m: parseFloat(dist.toFixed(3)),
        arah_deg: parseFloat(bear.toFixed(2)), residual_m: parseFloat(resid.residual.toFixed(6)),
        kualitas: cls.label },
    });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lonOut, r.latOut] },
      properties: { id: r.id, tipe: 'Titik Hasil', datum: r.to.toUpperCase(),
        lat: r.latOut, lon: r.lonOut, jarak_m: parseFloat(dist.toFixed(3)),
        arah_deg: parseFloat(bear.toFixed(2)), residual_m: parseFloat(resid.residual.toFixed(6)),
        kualitas: cls.label },
    });
  });
  return JSON.stringify({
    type: 'FeatureCollection', name: 'Shifted_Transformasi',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features,
  }, null, 2);
}

function triggerDownloadGeoJSON(idx) {
  const entry = dlQueue[idx];
  if (!entry) return;
  const blob = new Blob([toGeoJSON(entry.results)], { type: 'application/geo+json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: `shifted_${Date.now()}.geojson` }).click();
  URL.revokeObjectURL(url);
  _toast('File GeoJSON berhasil diunduh!', 'green');
}


// ──────────────────────────────────────────────
// DOWNLOAD QUEUE
// ──────────────────────────────────────────────
function _addToQueue(results, from, to) {
  if (!results?.length) return;
  const csv   = toCSVStr(results);
  const label = `${from.toUpperCase()} → ${to.toUpperCase()} (${results.length} titik)`;
  const meta  = new Date().toLocaleTimeString('id-ID');
  dlQueue.unshift({ label, meta, csv, results: [...results], count: results.length });
  _refreshDlPanel();
}

function _refreshDlPanel() {
  const list  = document.getElementById('dl-list');
  const empty = document.getElementById('dl-empty');
  if (!list) return;
  list.querySelectorAll('.dl-item').forEach(i => i.remove());
  if (!dlQueue.length) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  dlQueue.forEach((entry, i) => {
    const div = document.createElement('div');
    div.className = 'dl-item';
    div.innerHTML = `
      <div class="dl-info">
        <div class="dl-name">${entry.label}</div>
        <div class="dl-meta">${entry.meta} · ${entry.count} titik</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0;">
        <button class="btn-dl-sm" onclick="triggerDownload(${i})" title="Download CSV"
          style="transition:all 0.18s ease;"
          onmouseover="this.style.background='#12b886';this.style.borderColor='#12b886';this.style.color='#fff';"
          onmouseout="this.style.background='';this.style.borderColor='';this.style.color='';">CSV</button>
        <button class="btn-dl-sm" onclick="triggerDownloadGeoJSON(${i})" title="Download GeoJSON"
          style="background:#e3f8ff;border-color:#99e9f2;color:#1098ad;transition:all 0.18s ease;"
          onmouseover="this.style.background='#1098ad';this.style.borderColor='#1098ad';this.style.color='#fff';"
          onmouseout="this.style.background='#e3f8ff';this.style.borderColor='#99e9f2';this.style.color='#1098ad';">GeoJSON</button>
      </div>`;
    list.appendChild(div);
  });
}

function triggerDownload(idx) {
  const entry = dlQueue[idx];
  if (!entry) return;
  const blob = new Blob([entry.csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: `shifted_${Date.now()}.csv` }).click();
  URL.revokeObjectURL(url);
  _toast('File CSV berhasil diunduh!', 'green');
}

function downloadResult() { if (dlQueue.length) triggerDownload(0); }

// ──────────────────────────────────────────────
// TOGGLE & UPDATE UI EFEK EPOK
// ──────────────────────────────────────────────
const _BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

function _updateEpochUI() {
  const corr  = _getEpochCorrection();
  const fmt   = v => (v * 1000).toFixed(2);  // meter → mm, 2 desimal

  const badge = document.getElementById('epoch-effect-badge');
  if (badge) {
    badge.textContent      = epochEffectEnabled ? 'Aktif' : 'Nonaktif';
    badge.style.background = epochEffectEnabled ? '#e8f8f2' : '#f4f5f7';
    badge.style.color      = epochEffectEnabled ? '#0ca678' : '#9aa0b4';
  }

  const infoEl = document.getElementById('epoch-effect-info');
  if (infoEl) {
    infoEl.innerHTML =
      `ΔX ${fmt(corr.dX)} mm &nbsp;·&nbsp; ΔY ${fmt(corr.dY)} mm &nbsp;·&nbsp; ΔZ ${fmt(corr.dZ)} mm`;
  }

  const totalEl = document.getElementById('epoch-total');
  if (totalEl) {
    const total3D = Math.sqrt(corr.dX ** 2 + corr.dY ** 2 + corr.dZ ** 2) * 1000;
    totalEl.textContent = total3D.toFixed(2);
  }

  const dtEl = document.getElementById('epoch-dt-label');
  if (dtEl) {
    dtEl.textContent = `dt = ${_dtLabel()} (${_BULAN_ID[epochEffectMonth - 1]} ${epochEffectYear})`;
  }
}

function toggleEpochEffect(enabled) {
  epochEffectEnabled = enabled;
  _updateEpochUI();
  _toast(
    enabled
      ? `Efek epok ${_BULAN_ID[epochEffectMonth - 1]} ${epochEffectYear} diaktifkan (${_dtLabel()})`
      : 'Efek epok dinonaktifkan',
    enabled ? 'green' : 'blue'
  );
}

function setEpochTargetYear(year) {
  epochEffectYear = parseInt(year);
  _updateEpochUI();
  if (epochEffectEnabled) {
    _toast(`Epok target: ${_BULAN_ID[epochEffectMonth - 1]} ${epochEffectYear} (${_dtLabel()})`, 'blue');
  }
}

function setEpochTargetMonth(month) {
  epochEffectMonth = parseInt(month);
  _updateEpochUI();
  if (epochEffectEnabled) {
    _toast(`Epok target: ${_BULAN_ID[epochEffectMonth - 1]} ${epochEffectYear} (${_dtLabel()})`, 'blue');
  }
}

// ══════════════════════════════════════════════
// ★ POPUP PERINGATAN LUAR WK ROKAN
// ══════════════════════════════════════════════
let _pendingTransformFn = null;
let _skipBoundsCheck    = false;

function _ensureBoundsWarningOverlay() {
  if (document.getElementById('bounds-warn-overlay')) return;
  const el = document.createElement('div');
  el.id = 'bounds-warn-overlay';
  el.style.cssText = `
    position:fixed;inset:0;z-index:9998;
    background:rgba(8,9,26,0.65);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
    display:none;align-items:center;justify-content:center;
    padding:24px;opacity:0;transition:opacity 0.22s ease;`;
  el.onclick = e => { if (e.target === el) closeBoundsWarning(); };
  el.innerHTML = `
    <div id="bounds-warn-box" style="
      background:#ffffff;border-radius:18px;
      padding:32px 28px 24px;width:100%;max-width:360px;
      text-align:center;
      box-shadow:0 20px 60px rgba(0,0,0,0.18),0 4px 16px rgba(0,0,0,0.08);
      transform:translateY(20px) scale(0.96);
      transition:transform 0.26s cubic-bezier(0.34,1.56,0.64,1);
      font-family:'Sora',sans-serif;">
      <div style="
        width:56px;height:56px;border-radius:50%;
        background:#fff7ed;border:2px solid #fed7aa;
        display:flex;align-items:center;justify-content:center;
        margin:0 auto 16px;color:#f97316;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17" stroke-width="3"/>
        </svg>
      </div>
      <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:4px;letter-spacing:-0.3px;">
        Peringatan
      </h3>
      <p style="font-size:12.5px;font-weight:600;color:#f97316;margin-bottom:10px;">
        Koordinat di Luar Area WK Rokan
      </p>
      <p style="font-size:12px;color:#64748b;line-height:1.65;margin-bottom:8px;">
        Parameter transformasi diestimasi dari titik sekutu di <strong>WK Rokan, Riau</strong>.
      </p>
      <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:24px;">
        Penggunaan di luar area ini belum divalidasi dan dapat menghasilkan <strong style="color:#f97316;">akurasi yang tidak terjamin</strong>.
      </p>
      <div style="display:flex;gap:10px;">
        <button onclick="closeBoundsWarning()" style="
          flex:1;padding:10px 14px;
          border:1.5px solid #e2e8f0;border-radius:10px;
          background:#f8fafc;color:#475569;
          font-size:12.5px;font-weight:600;font-family:'Sora',sans-serif;
          cursor:pointer;transition:background 0.2s,border-color 0.2s,color 0.2s;"
          onmouseover="this.style.background='#f1f5f9';this.style.borderColor='#cbd5e1';this.style.color='#1e293b';"
          onmouseout="this.style.background='#f8fafc';this.style.borderColor='#e2e8f0';this.style.color='#475569';">
          Batal
        </button>
        <button onclick="continueTransformAnyway()" style="
          flex:1;padding:10px 14px;
          border:none;border-radius:10px;
          background:#f97316;color:#fff;
          font-size:12.5px;font-weight:700;font-family:'Sora',sans-serif;
          cursor:pointer;
          box-shadow:0 4px 14px rgba(249,115,22,0.3);
          transition:background 0.2s,transform 0.15s,box-shadow 0.2s;"
          onmouseover="this.style.background='#ea6c0a';this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(249,115,22,0.4)';"
          onmouseout="this.style.background='#f97316';this.style.transform='translateY(0)';this.style.boxShadow='0 4px 14px rgba(249,115,22,0.3)';">
          Tetap Lanjutkan
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

function _showOutsideBoundsWarning(onContinue) {
  _ensureBoundsWarningOverlay();
  _pendingTransformFn = onContinue;
  const overlay = document.getElementById('bounds-warn-overlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    const box = document.getElementById('bounds-warn-box');
    if (box) box.style.transform = 'translateY(0) scale(1)';
  }));
}

function closeBoundsWarning() {
  const overlay = document.getElementById('bounds-warn-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  const box = document.getElementById('bounds-warn-box');
  if (box) box.style.transform = 'translateY(20px) scale(0.96)';
  setTimeout(() => { overlay.style.display = 'none'; }, 230);
  _pendingTransformFn = null;
}

function continueTransformAnyway() {
  closeBoundsWarning();
  if (_pendingTransformFn) {
    const fn = _pendingTransformFn;
    _pendingTransformFn = null;
    _skipBoundsCheck = true;
    setTimeout(() => { fn(); _skipBoundsCheck = false; }, 240);
  }
}

// ──────────────────────────────────────────────
// RESET TRANSFORM
// ──────────────────────────────────────────────
function resetTransform() {
  csvData = [];
  const coordVal = document.getElementById('coord-val');
  if (coordVal) { coordVal.value = ''; coordVal.style.borderColor = ''; coordVal.style.transform = ''; }
  // Reset field UTM
  const eastingEl = document.getElementById('utm-easting');
  if (eastingEl) { eastingEl.value = ''; eastingEl.style.borderColor = ''; }
  const northingEl = document.getElementById('utm-northing');
  if (northingEl) { northingEl.value = ''; northingEl.style.borderColor = ''; }
  // Kembalikan visibility input ke regular
  const fmtInEl = document.getElementById('fmt-coord-input');
  if (fmtInEl && fmtInEl.value === 'utm') {
    fmtInEl.value = 'dd';
    if (typeof updateCoordPlaceholder === 'function') updateCoordPlaceholder('dd');
  }
  const csvFile = document.getElementById('csv-upload');
  if (csvFile) {
    try { csvFile.value = ''; } catch (_) {
      const newFile = document.createElement('input');
      newFile.type = 'file'; newFile.id = 'csv-upload'; newFile.accept = '.csv';
      newFile.className = csvFile.className;
      newFile.onchange = function () { onCSVLoad(this); };
      csvFile.parentNode.replaceChild(newFile, csvFile);
    }
  }
  const csvName = document.getElementById('csv-name');
  if (csvName) csvName.textContent = 'Choose File';
  const rb = document.getElementById('result-box');
  if (rb) rb.classList.remove('show');
  const tp = document.getElementById('table-preview');
  if (tp) { tp.innerHTML = ''; tp.style.display = 'none'; }
  const rManual = document.getElementById('r-manual');
  const rCsv    = document.getElementById('r-csv');
  if (rManual) rManual.checked = true;
  if (rCsv)    rCsv.checked   = false;
  const secManual = document.getElementById('sec-manual');
  const secCsv    = document.getElementById('sec-csv');
  if (secManual) secManual.style.display = 'block';
  if (secCsv)    secCsv.style.display    = 'none';
  if (window.clearAllPlots) window.clearAllPlots();
  _lastResults = [];
  const invertBtn = document.getElementById('btn-invert-all');
  if (invertBtn) invertBtn.style.display = 'none';
  _toast('Input direset', 'blue');
}

// ══════════════════════════════════════════════
// ★ TRANSFORMASI BALIK
// ══════════════════════════════════════════════
function _showInverseBtn(from, to) {
  const btn   = document.getElementById('btn-invert-all');
  const label = document.getElementById('invert-label');
  if (!btn) return;
  btn.style.display = 'flex';
  btn.title = `Tukar datum seluruhnya: ${to.toUpperCase()} → ${from.toUpperCase()}`;
  if (label) label.textContent = `Tukar Datum Seluruh Titik: ${to.toUpperCase()} → ${from.toUpperCase()}`;
}

function invertAllPoints() {
  if (!_lastResults?.length) { _toast('Tidak ada titik di peta.', 'amber'); return; }
  const sample  = _lastResults[0];
  const newFrom = sample.to;
  const newTo   = sample.from;
  const fmtIn   = document.getElementById('fmt-coord-input')?.value  || 'dd';
  const fmtOut  = document.getElementById('fmt-coord-output')?.value || 'dd';
  if (window.clearAllPlots) window.clearAllPlots();
  const inverted = _lastResults.map(r => {
    const res = transform(r.latOut, r.lonOut, newFrom, newTo);
    return { id: r.id, latIn: r.latOut, lonIn: r.lonOut, latOut: res.lat, lonOut: res.lon, from: newFrom, to: newTo };
  });
  inverted.forEach(r => { if (window.plotPointPair) window.plotPointPair(r.latIn, r.lonIn, r.latOut, r.lonOut, r.id, fmtIn, fmtOut); });
  renderTable(inverted, fmtIn, fmtOut);
  if (window.fitToPlots) window.fitToPlots();
  _addToQueue(inverted, newFrom, newTo);
  _pushHistory(inverted, newFrom, newTo, _lastResults.length > 1 ? 'csv' : 'manual');
  _lastResults = inverted;
  const selAsal   = document.getElementById('datum-asal');
  const selTujuan = document.getElementById('datum-tujuan');
  if (selAsal)   selAsal.value   = newFrom;
  if (selTujuan) selTujuan.value = newTo;
  _showInverseBtn(newFrom, newTo);
  _toast(`${inverted.length} titik berhasil dibalik: ${newFrom.toUpperCase()} → ${newTo.toUpperCase()}`, 'green');
}

// ══════════════════════════════════════════════
// ★ RIWAYAT TRANSFORMASI
// ══════════════════════════════════════════════
function _loadHistory() { try { return JSON.parse(localStorage.getItem(_HISTORY_KEY) || '[]'); } catch (_) { return []; } }
function _saveHistory(list) { localStorage.setItem(_HISTORY_KEY, JSON.stringify(list.slice(0, _HISTORY_MAX))); }

function _pushHistory(results, from, to, mode) {
  if (!results?.length) return;
  const user = (() => { try { return JSON.parse(localStorage.getItem('shifted_user'))?.nama || '-'; } catch (_) { return '-'; } })();
  const residuals = results.map(r => calcResidual(r.latIn, r.lonIn, r.latOut, r.lonOut, r.from, r.to).residual);
  const rmse    = Math.sqrt(residuals.reduce((s, v) => s + v ** 2, 0) / residuals.length);
  const avgDist = results.reduce((s, r) => s + calcDistance(r.latIn, r.lonIn, r.latOut, r.lonOut), 0) / results.length;
  const entry = {
    id: Date.now(), timestamp: new Date().toLocaleString('id-ID'), mode,
    from: from.toUpperCase(), to: to.toUpperCase(), count: results.length,
    rmse: parseFloat(rmse.toFixed(6)), avgDist: parseFloat(avgDist.toFixed(3)), user,
    preview: results.slice(0, 3).map(r => ({ id: r.id, latIn: r.latIn, lonIn: r.lonIn,
      latOut: parseFloat(r.latOut.toFixed(8)), lonOut: parseFloat(r.lonOut.toFixed(8)) })),
    results,
  };
  const list = _loadHistory();
  list.unshift(entry);
  _saveHistory(list);
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-list');
  const emptyEl   = document.getElementById('history-empty');
  const countEl   = document.getElementById('history-count');
  if (!container) return;
  const list = _loadHistory();
  if (countEl) countEl.textContent = list.length;
  if (!list.length) { if (emptyEl) emptyEl.style.display = 'block'; container.innerHTML = ''; return; }
  if (emptyEl) emptyEl.style.display = 'none';
  const fmtR = v => v < 0.001 ? v.toExponential(3) : v.toFixed(6);
  const fmtD = v => v >= 1000 ? `${(v/1000).toFixed(2)} km` : `${v.toFixed(2)} m`;
  const cls  = v => residualClass(v);
  container.innerHTML = list.map((e, i) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;overflow:hidden;transition:border-color var(--trans);"
      onmouseover="this.style.borderColor='var(--border-focus)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--bg-input);border-bottom:1px solid var(--border);gap:8px;">
        <div style="display:flex;align-items:center;gap:7px;min-width:0;">
          <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--accent-soft);color:var(--accent);white-space:nowrap;">${e.from} → ${e.to}</span>
          <span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:10px;background:${e.mode==='csv'?'#e8f8f2':'#fff8e1'};color:${e.mode==='csv'?'#0ca678':'#f59f00'};white-space:nowrap;">${e.mode==='csv'?'📂 CSV':'✏️ Manual'}</span>
        </div>
        <button onclick="clearHistoryEntry(${e.id})" style="width:20px;height:20px;border-radius:4px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background var(--trans),color var(--trans);"
          onmouseover="this.style.background='#fee2e2';this.style.color='#dc2626';" onmouseout="this.style.background='transparent';this.style.color='var(--text-muted)';">×</button>
      </div>
      <div style="padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
          <span style="font-size:10px;color:var(--text-muted);">${e.timestamp}</span>
          <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">${e.count} titik</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <div style="flex:1;padding:5px 8px;background:var(--bg-input);border-radius:6px;border:1px solid var(--border);">
            <div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">RMSE</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:${cls(e.rmse).color};font-weight:700;">${fmtR(e.rmse)} m</div>
          </div>
          <div style="flex:1;padding:5px 8px;background:var(--bg-input);border-radius:6px;border:1px solid var(--border);">
            <div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Avg Jarak</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent);font-weight:700;">${fmtD(e.avgDist)}</div>
          </div>
          <div style="flex:1;padding:5px 8px;background:var(--bg-input);border-radius:6px;border:1px solid var(--border);">
            <div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">User</div>
            <div style="font-size:10px;color:var(--text-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.user}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px;">
          <button onclick="reloadHistory(${i})" style="flex:1;padding:5px 8px;font-size:10px;font-weight:600;font-family:var(--font);cursor:pointer;border-radius:var(--radius-xs);background:var(--accent-soft);border:1.5px solid rgba(79,94,247,0.2);color:var(--accent);transition:all var(--trans);"
            onmouseover="this.style.background='var(--accent)';this.style.color='#fff';" onmouseout="this.style.background='var(--accent-soft)';this.style.color='var(--accent)';">↩ Muat Ulang</button>
          <button onclick="downloadHistoryCSV(${i})" style="flex:1;padding:5px 8px;font-size:10px;font-weight:600;font-family:var(--font);cursor:pointer;border-radius:var(--radius-xs);background:var(--green-soft);border:1.5px solid #b2f2dc;color:var(--green);transition:all var(--trans);"
            onmouseover="this.style.background='var(--green)';this.style.color='#fff';" onmouseout="this.style.background='var(--green-soft)';this.style.color='var(--green)';">↓ CSV</button>
          <button onclick="downloadHistoryGeoJSON(${i})" style="flex:1;padding:5px 8px;font-size:10px;font-weight:600;font-family:var(--font);cursor:pointer;border-radius:var(--radius-xs);background:#e3f8ff;border:1.5px solid #99e9f2;color:#1098ad;transition:all var(--trans);"
            onmouseover="this.style.background='#1098ad';this.style.color='#fff';" onmouseout="this.style.background='#e3f8ff';this.style.color='#1098ad';">↓ GeoJSON</button>
        </div>
      </div>
    </div>`).join('');
}

function reloadHistory(idx) {
  const list = _loadHistory(); const entry = list[idx];
  if (!entry || !entry.results?.length) return;
  if (window.clearAllPlots) window.clearAllPlots();
  entry.results.forEach(r => { if (window.plotPointPair) window.plotPointPair(r.latIn, r.lonIn, r.latOut, r.lonOut, r.id, 'dd', 'dd'); });
  renderTable(entry.results, 'dd', 'dd');
  if (window.fitToPlots) window.fitToPlots();
  if (window.UI) { window.UI.closePanel('panel-history'); window.UI.openPanel('panel-transform'); }
  _toast(`Riwayat dimuat: ${entry.count} titik`, 'green');
}

function downloadHistoryCSV(idx) {
  const entry = _loadHistory()[idx]; if (!entry?.results?.length) return;
  const blob = new Blob([toCSVStr(entry.results)], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: `shifted_riwayat_${entry.id}.csv` }).click();
  URL.revokeObjectURL(url); _toast('CSV riwayat diunduh!', 'green');
}

function downloadHistoryGeoJSON(idx) {
  const entry = _loadHistory()[idx]; if (!entry?.results?.length) return;
  const blob = new Blob([toGeoJSON(entry.results)], { type: 'application/geo+json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: `shifted_riwayat_${entry.id}.geojson` }).click();
  URL.revokeObjectURL(url); _toast('GeoJSON riwayat diunduh!', 'green');
}

let _pendingDeleteHistoryFn = null;

function _showDeleteHistoryModal(title, msg, onConfirm) {
  const overlay = document.getElementById('confirm-delete-history-overlay');
  const titleEl = document.getElementById('confirm-delete-history-title');
  const msgEl   = document.getElementById('confirm-delete-history-msg');
  if (!overlay) { if (onConfirm) onConfirm(); return; }
  titleEl.textContent = title;
  msgEl.textContent   = msg;
  _pendingDeleteHistoryFn = onConfirm;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    document.getElementById('confirm-delete-history-box').style.transform = 'translateY(0) scale(1)';
  });
}

function closeDeleteHistoryConfirm() {
  const overlay = document.getElementById('confirm-delete-history-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  document.getElementById('confirm-delete-history-box').style.transform = 'translateY(20px) scale(0.96)';
  setTimeout(() => { overlay.style.display = 'none'; }, 230);
  _pendingDeleteHistoryFn = null;
}

function executeDeleteHistory() {
  const fn = _pendingDeleteHistoryFn;
  closeDeleteHistoryConfirm();
  if (typeof fn === 'function') fn();
}

function handleDeleteHistoryOverlay(e) {
  if (e.target === document.getElementById('confirm-delete-history-overlay')) closeDeleteHistoryConfirm();
}

function clearHistoryEntry(id) {
  _showDeleteHistoryModal(
    'Hapus Riwayat?',
    'Apakah Anda yakin ingin menghapus riwayat koordinat ini? Tindakan ini tidak dapat dibatalkan.',
    () => { const list = _loadHistory().filter(e => e.id !== id); _saveHistory(list); renderHistory(); _toast('Riwayat dihapus', 'blue'); }
  );
}

function clearAllHistory() {
  if (!_loadHistory().length) return;
  _showDeleteHistoryModal(
    'Hapus Semua Riwayat?',
    'Apakah Anda yakin ingin menghapus semua riwayat koordinat? Tindakan ini tidak dapat dibatalkan.',
    () => { localStorage.removeItem(_HISTORY_KEY); renderHistory(); _toast('Semua riwayat dihapus', 'blue'); }
  );
}

// ──────────────────────────────────────────────
// INTERNAL TOAST
// ──────────────────────────────────────────────
function _toast(msg, type = 'blue') {
  if (typeof window.showToast === 'function') window.showToast(msg, type);
  else console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ──────────────────────────────────────────────
// EXPOSE
// ──────────────────────────────────────────────
window.TE = {
  transform, molodensky7param, molodensky7,
  id74ToWgs84, wgs84ToId74,
  applyEpochCorrection, EPOCH,
  calcResidual, residualClass,
  P_FWD, P_INV,
  formatCoord, parseLatLon, parseCSV, toCSVStr, toGeoJSON,
  latLonToUTM: _latLonToUTM, utmToLatLon: _utmToLatLon,
};

window.runTransform             = runTransform;
window.resetTransform           = resetTransform;
window.toggleEpochEffect        = toggleEpochEffect;
window.setEpochTargetYear       = setEpochTargetYear;
window.setEpochTargetMonth      = setEpochTargetMonth;
window.closeBoundsWarning       = closeBoundsWarning;
window.continueTransformAnyway  = continueTransformAnyway;
window.onCSVLoad                = onCSVLoad;
window.downloadResult           = downloadResult;
window.triggerDownload          = triggerDownload;
window.triggerDownloadGeoJSON   = triggerDownloadGeoJSON;
window.invertAllPoints          = invertAllPoints;
window.renderHistory            = renderHistory;
window.reloadHistory            = reloadHistory;
window.downloadHistoryCSV       = downloadHistoryCSV;
window.downloadHistoryGeoJSON   = downloadHistoryGeoJSON;
window.clearHistoryEntry            = clearHistoryEntry;
window.clearAllHistory              = clearAllHistory;
window.closeDeleteHistoryConfirm    = closeDeleteHistoryConfirm;
window.executeDeleteHistory         = executeDeleteHistory;
window.handleDeleteHistoryOverlay   = handleDeleteHistoryOverlay;