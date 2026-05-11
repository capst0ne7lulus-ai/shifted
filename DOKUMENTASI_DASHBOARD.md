# DOKUMENTASI LENGKAP DASHBOARD "SHIFTED."
### Sistem Transformasi Koordinat Geodetik Interaktif
**Capstone Project — Teknik Geodesi & Geomatika, ITB**

---

## DAFTAR ISI

1. [Gambaran Umum](#1-gambaran-umum)
2. [Apa yang Dilakukan Dashboard Ini?](#2-apa-yang-dilakukan-dashboard-ini)
3. [Struktur Folder Proyek](#3-struktur-folder-proyek)
4. [Teknologi yang Digunakan](#4-teknologi-yang-digunakan)
5. [Alur Kerja Aplikasi](#5-alur-kerja-aplikasi)
6. [Frontend — Tampilan & Interaksi](#6-frontend--tampilan--interaksi)
7. [Backend — Data & Database](#7-backend--data--database)
8. [Komponen JavaScript (Otak Aplikasi)](#8-komponen-javascript-otak-aplikasi)
9. [Fitur-Fitur Dashboard](#9-fitur-fitur-dashboard)
10. [Database & Data Spasial](#10-database--data-spasial)
11. [Cara Transformasi Koordinat Bekerja](#11-cara-transformasi-koordinat-bekerja)
12. [API Eksternal yang Digunakan](#12-api-eksternal-yang-digunakan)
13. [Keamanan & Autentikasi](#13-keamanan--autentikasi)
14. [Ringkasan Arsitektur](#14-ringkasan-arsitektur)

---

## 1. GAMBARAN UMUM

**Shifted.** adalah dashboard berbasis web yang dibuat untuk kebutuhan **transformasi koordinat geodetik** antara dua sistem datum:

- **WGS84** — Datum global modern yang digunakan GPS dan Google Maps
- **ID74** — Datum Indonesia lama (Indonesia Datum 1974) yang masih dipakai di peta-peta minyak & gas lama di Indonesia

Dashboard ini dibuat sebagai **Tugas Akhir (Capstone Project)** dengan fokus wilayah **WK Rokan, Riau** — salah satu lapangan minyak terbesar di Indonesia yang meliputi area Minas dan Kotabatak.

**Tim:** Firza, Hisa, Kamil, Nash, Zaza

---

## 2. APA YANG DILAKUKAN DASHBOARD INI?

Bayangkan kamu punya titik koordinat dari peta lama tahun 1970-an (pakai datum ID74), tapi kamu butuh koordinatnya dalam format GPS modern (WGS84) agar bisa dibuka di Google Maps atau QGIS. Dashboard ini yang menangani konversi itu.

**Fungsi utama:**
- Input satu titik atau banyak titik (batch via CSV)
- Pilih arah transformasi: ID74 → WGS84 atau WGS84 → ID74
- Dapatkan hasil koordinat yang sudah dikonversi
- Lihat visualisasi di peta interaktif
- Download hasilnya sebagai CSV

Selain transformasi, dashboard juga menampilkan **peta interaktif** dengan berbagai layer data spasial wilayah WK Rokan (batas lapangan, jaringan pipa, lokasi sumur, dll.).

---

## 3. STRUKTUR FOLDER PROYEK

```
DASHBOARD FIX/
│
├── index.html              ← Halaman landing (halaman pertama yang dibuka)
├── login.html              ← Halaman login
├── dashboard.html          ← Halaman utama dashboard (peta + panel)
├── header.html             ← Komponen header yang dimuat secara dinamis
│
├── js/                     ← SEMUA LOGIKA JAVASCRIPT
│   ├── auth.js             ← Mengurus login, sesi pengguna
│   ├── map.js              ← Mengurus peta Leaflet & layer data
│   ├── transform.js        ← Algoritma transformasi koordinat (inti fitur)
│   ├── ui.js               ← Mengurus panel UI (buka/tutup panel)
│   ├── event.js            ← Mengurus event klik, keyboard shortcuts
│   └── search.js           ← Fitur pencarian lokasi (Nominatim)
│
├── styles/
│   └── main.css            ← Semua styling visual (warna, font, layout)
│
├── image/                  ← Semua aset gambar
│   ├── Logo.png            ← Logo "Shifted."
│   ├── Nama.png            ← Nama brand
│   ├── Landing.png         ← Gambar background halaman landing
│   ├── Login.png           ← Gambar halaman login
│   ├── firza.png           ← Foto anggota tim
│   ├── hisa.png
│   ├── kamil.png
│   ├── nash.png
│   └── zaza.png
│
├── components/             ← Komponen HTML tambahan (tidak aktif dipakai)
│   ├── event.html
│   ├── header.html
│   └── sidebar.html
│
├── Database/               ← FILE DATA & SKEMA DATABASE
│   ├── ShapefileCaps.sql   ← Skema database PostgreSQL lengkap
│   ├── rls_policies.sql    ← Kebijakan keamanan database
│   ├── data_dummy_100.csv  ← Data uji coba (100 titik)
│   ├── Shapefile/          ← Data shapefile asli (Boundary, Pipeline, Well)
│   ├── Supabase/           ← Data yang sudah diekspor untuk Supabase (CSV, GeoJSON)
│   └── Support Data Capstone ITB/  ← Shapefile sumber dari ITB
│
└── Java Files              ← KODE JAVA (referensi algoritma, bukan dijalankan di browser)
    ├── DatumTransformationMolodensky.java   ← Algoritma transformasi
    ├── InverseTransformationMolodensky.java ← Algoritma invers
    └── Residue.java                         ← Perhitungan residual
```

---

## 4. TEKNOLOGI YANG DIGUNAKAN

### FRONTEND (Yang Dilihat & Diinteraksikan Pengguna)

| Teknologi | Fungsi | Keterangan |
|-----------|--------|------------|
| **HTML5** | Struktur halaman | Markup semantik standar |
| **CSS3** | Tampilan visual | Custom design system dengan variabel CSS |
| **JavaScript (ES6+)** | Logika interaksi | Vanilla JS, tanpa framework seperti React/Vue |
| **Leaflet.js v1.9.4** | Peta interaktif | Library peta open-source terpopuler |
| **Proj4js v2.9.0** | Proyeksi koordinat | Konversi antara sistem proyeksi (UTM, dll.) |

> **Catatan Penting:** Dashboard ini **tidak menggunakan framework seperti React, Vue, atau Angular**. Semuanya ditulis dalam JavaScript murni (Vanilla JS), yang berarti lebih ringan tapi membutuhkan lebih banyak kode manual.

### BACKEND (Sistem yang Bekerja di Belakang Layar)

| Teknologi | Fungsi | Keterangan |
|-----------|--------|------------|
| **Supabase** | Database + API otomatis | PostgreSQL berbasis cloud dengan PostGIS |
| **PostgreSQL + PostGIS** | Penyimpanan data spasial | Database yang bisa menyimpan data geometri (titik, garis, poligon) |
| **GeoServer** (opsional) | WMS layer server | Dijalankan lokal di `localhost:8080`, tidak wajib |

> **Supabase** adalah layanan Backend-as-a-Service (BaaS). Artinya, kita tidak perlu membuat server sendiri — Supabase sudah menyediakan database PostgreSQL di cloud beserta API-nya secara otomatis.

### DATA & TOOLS PENDUKUNG

| Item | Keterangan |
|------|------------|
| **Nominatim (OpenStreetMap)** | API pencarian lokasi gratis |
| **Google Maps Satellite** | Tiles peta satelit |
| **Shapefile (.shp, .dbf, .shx)** | Format data spasial standar industri |
| **GeoJSON** | Format data spasial berbasis JSON |
| **CSV dengan WKT** | Format data untuk diimpor ke Supabase |
| **Java** | Digunakan sebagai referensi algoritma transformasi (bukan dijalankan di browser) |

---

## 5. ALUR KERJA APLIKASI

```
Pengguna membuka browser
        │
        ▼
┌─────────────────┐
│   index.html    │  ← Halaman Landing (sambutan awal, info tim)
│   (Landing)     │
└────────┬────────┘
         │ Klik "Mulai" / "Login"
         ▼
┌─────────────────┐
│   login.html    │  ← Form username + password
│   (Login)       │
└────────┬────────┘
         │ Autentikasi berhasil
         │ (cek ke Supabase atau admin lokal)
         ▼
┌─────────────────────────────────────────────────────┐
│                  dashboard.html                      │
│                  (Peta Interaktif)                   │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Panel   │  │  Panel   │  │  Panel Transform │  │
│  │  Layer   │  │ Basemap  │  │  (Fitur Utama)   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Panel   │  │  Panel   │  │  Panel Informasi │  │
│  │Download  │  │ History  │  │                  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                      │
│  [Peta Leaflet mengisi seluruh layar di belakang]   │
└─────────────────────────────────────────────────────┘
```

---

## 6. FRONTEND — TAMPILAN & INTERAKSI

### 6.1 Halaman Landing (`index.html`)

Halaman pertama yang dilihat pengguna. Berisi:
- Logo dan nama brand **"Shifted."**
- Deskripsi singkat tentang dashboard
- Profil anggota tim (foto + nama)
- Tombol untuk masuk ke halaman login

**Tidak ada logika kompleks di sini** — hanya tampilan statis.

---

### 6.2 Halaman Login (`login.html`)

Halaman untuk autentikasi pengguna. Proses loginnya:

1. Pengguna memasukkan **username** dan **password**
2. Sistem mengecek ke dua sumber:
   - **Admin hardcoded:** username `admin`, password `12345` (untuk testing)
   - **Database Supabase:** tabel `users` (kolom `Nama` = username, `ID` = password)
3. Jika cocok → simpan status login di **localStorage** → redirect ke dashboard
4. Jika gagal → tampilkan pesan error

**File terkait:** `js/auth.js`

---

### 6.3 Halaman Dashboard (`dashboard.html`)

Ini adalah halaman utama. Terdiri dari dua lapisan:

**Lapisan Bawah: Peta Interaktif**
- Peta Leaflet yang memenuhi seluruh layar
- Dapat di-scroll, di-zoom, di-drag
- Menampilkan layer-layer data spasial

**Lapisan Atas: 6 Panel Mengambang**

Panel-panel ini bisa dibuka/ditutup dan bisa dipindahkan posisinya.

---

### 6.4 Sistem CSS (`styles/main.css`)

CSS menggunakan **design system** dengan variabel CSS:

```css
Warna utama:
--accent: #4f5ef7    ← Biru indigo (warna brand)
--green: #12b886     ← Hijau (titik asal)
--amber: #f59f00     ← Kuning (layer batas)
--red: #fa5252       ← Merah (layer jalan)
--cyan: #06b6d4      ← Cyan (batas WK Rokan)

Font:
--font: 'Sora'           ← Font utama (UI text)
--font-mono: 'JetBrains Mono'  ← Font koordinat angka
```

Penggunaan font mono untuk angka koordinat sangat penting agar angka-angka lurus dan mudah dibaca.

---

## 7. BACKEND — DATA & DATABASE

### 7.1 Supabase sebagai Backend

**Supabase** adalah layanan yang menyediakan:
- **Database PostgreSQL** di cloud (dengan ekstensi PostGIS untuk data spasial)
- **REST API otomatis** — setiap tabel otomatis punya endpoint API
- **Autentikasi pengguna** (tidak dipakai di sini, dipakai sistem manual)
- **Row Level Security (RLS)** — keamanan data per baris

Koneksi ke Supabase dikonfigurasi di `js/auth.js`:
```
URL: https://vfbuxzluwafagicjuupc.supabase.co
API Key: sb_publishable_lF1YmyuuZWn4AdO9wazrDQ_-2C_tEQD
```

### 7.2 Tabel-Tabel Database

| Nama Tabel | Jenis Data | Isi |
|------------|-----------|-----|
| `users` | Pengguna | Nama, ID (password), Tipe (Admin/User) |
| `Minas_Batak` | Poligon | Batas lapangan Minas & Kotabatak |
| `data_jalan` | Linestring | Data jalan/pipa di wilayah |
| `Well` | Point | Titik-titik lokasi sumur minyak |
| `WK_Rokan` | Poligon | Batas Wilayah Kerja Rokan |

### 7.3 Format Data Geometri

Data geometri disimpan dalam format **WKT (Well-Known Text)**, contohnya:
- Titik: `POINT(101.5 1.2)`
- Garis: `LINESTRING(101.0 1.0, 101.5 1.5, 102.0 1.0)`
- Poligon: `POLYGON((101.0 1.0, 102.0 1.0, 102.0 2.0, 101.0 2.0, 101.0 1.0))`

### 7.4 Kebijakan Keamanan (RLS)

File `Database/rls_policies.sql` berisi aturan Row Level Security. Ini memastikan pengguna hanya bisa mengakses data yang diizinkan sesuai tipe akun mereka.

### 7.5 GeoServer (Opsional)

GeoServer adalah server peta yang berjalan secara lokal:
```
URL: http://localhost:8080/geoserver/Try2/wms
```
Ini **tidak wajib** — dashboard tetap berjalan tanpa GeoServer. GeoServer dipakai jika kita ingin menampilkan layer dari shapefile lokal sebagai WMS (Web Map Service).

---

## 8. KOMPONEN JAVASCRIPT (OTAK APLIKASI)

Seluruh logika aplikasi dibagi ke dalam 6 file JavaScript. Masing-masing punya tanggung jawab yang berbeda.

---

### 8.1 `auth.js` — Autentikasi & Sesi

**Tanggung jawab:** Mengurus siapa yang boleh masuk ke dashboard.

**Yang dilakukan:**
- Menyimpan URL dan API Key Supabase
- Fungsi login: cek username/password
- Menyimpan status login di `localStorage` (key: `isLogin`)
- Fungsi logout: hapus data sesi
- Guard: jika pengguna belum login, redirect ke halaman login

**Alur login:**
```
Form submit → cek admin lokal → jika gagal, query Supabase → 
jika berhasil, simpan di localStorage → redirect ke dashboard.html
```

---

### 8.2 `map.js` — Peta & Layer Data

**Tanggung jawab:** Semua yang berkaitan dengan peta Leaflet.

**Yang dilakukan:**
- Inisialisasi peta Leaflet di tengah WK Rokan (`[1.3, 101.0]`, zoom 9)
- Mendefinisikan 4 basemap:
  - OpenStreetMap (default)
  - Google Satellite
  - OpenTopoMap (Terrain)
  - CARTO Dark
- Memuat layer dari Supabase (query → parse WKT → tampilkan di peta)
- Mengatur warna dan gaya tiap layer:
  - Batas lapangan: oranye, transparan
  - Jalan: merah
  - Well: ungu, marker bulat
  - WK Rokan: cyan
- Mengelola titik transformasi (hijau = asal, biru = hasil)
- Fitur pengukuran jarak (M) dan luas (N)

**Konstanta penting:**
```javascript
// Pusat peta WK Rokan, Pekanbaru, Riau
Map center: [1.3, 101.0]
Default zoom: 9

// Batas kotak wilayah WK Rokan
south: 0.0°, north: 2.7°, west: 99.5°, east: 102.5°
```

---

### 8.3 `transform.js` — Algoritma Transformasi (FILE PALING PENTING)

**Tanggung jawab:** Melakukan perhitungan transformasi koordinat.

**Yang dilakukan:**
- Implementasi algoritma **Molodensky-Badekas 10-parameter**
- Konversi antara format koordinat: DD, DMS, UTM 47S
- Koreksi **Epoch Effect** (pengaruh pergerakan lempeng tektonik terhadap waktu)
- Memproses satu titik maupun batch (file CSV)
- Menghitung jarak dan azimuth antara titik asal dan hasil

**Parameter transformasi yang digunakan:**
```
ΔX: -21.198 m  (pergeseran sumbu X)
ΔY: -28.407 m  (pergeseran sumbu Y)
ΔZ: +4.646 m   (pergeseran sumbu Z)
Faktor skala: 0.9999905

Kecepatan pergerakan (Epoch Effect):
Vx: -27 mm/tahun
Vy: -7 mm/tahun
Vz: -4 mm/tahun
Referensi epoch: 2021.0
```

**Definisi ellipsoid:**
```
GRS67 (untuk ID74):  a = 6.378.160 m, 1/f = 298.247167427
WGS84 (untuk GPS):   a = 6.378.137 m, 1/f = 298.257223563
```

---

### 8.4 `ui.js` — Panel & Antarmuka

**Tanggung jawab:** Mengatur tampilan panel-panel yang mengambang.

**Yang dilakukan:**
- Buka/tutup setiap panel (Layer, Basemap, Transform, Download, History, Info)
- Pastikan hanya satu panel yang terbuka dalam satu waktu (opsional)
- Animasi transisi panel masuk/keluar
- Update tampilan hasil transformasi di panel
- Tampilkan tabel CSV preview hasil batch
- Tampilkan toast notification (notifikasi pop-up kecil)

---

### 8.5 `event.js` — Event & Keyboard

**Tanggung jawab:** Menghubungkan semua interaksi pengguna dengan fungsi yang tepat.

**Yang dilakukan:**
- Mendaftarkan event listener (klik tombol, form submit, dll.)
- Keyboard shortcuts:
  - `Ctrl+1` → Panel Layer
  - `Ctrl+2` → Panel Basemap
  - `Ctrl+3` → Panel Transform
  - `Ctrl+4` → Panel Download
  - `Ctrl+5` → Panel Info
  - `Ctrl+6` → Panel History
  - `Esc` → Tutup semua panel
  - `M` → Aktifkan alat ukur jarak
  - `N` → Aktifkan alat ukur luas
  - `+` / `-` → Zoom in/out peta
- Event drag & drop untuk panel (panel bisa dipindahkan)
- Upload file CSV untuk batch transformasi

---

### 8.6 `search.js` — Pencarian Lokasi

**Tanggung jawab:** Fitur pencarian lokasi di peta.

**Yang dilakukan:**
- Menangkap input teks dari search bar
- Mengirim permintaan ke Nominatim API (OpenStreetMap)
- Menampilkan hasil pencarian sebagai dropdown
- Saat lokasi dipilih → peta fly ke lokasi tersebut
- Debounce input (tunggu 500ms setelah ketik terakhir baru kirim request, agar tidak spam)

---

## 9. FITUR-FITUR DASHBOARD

### 9.1 Panel Layer — Manajemen Lapisan Data

Panel untuk mengaktifkan/menonaktifkan layer data di peta.

| Layer | Warna | Jenis Geometri | Sumber |
|-------|-------|----------------|--------|
| Batas Lapangan (Minas & Kotabatak) | Oranye | Poligon | Supabase |
| Data Jalan | Merah | Linestring | Supabase |
| Data Well (Sumur) | Ungu | Titik | Supabase |
| Batas WK Rokan | Cyan | Poligon | Supabase |
| Titik Asal (input) | Hijau | Marker | Hasil transformasi |
| Titik Hasil (output) | Biru | Marker | Hasil transformasi |

Fitur tambahan: **slider opacity** untuk mengatur transparansi layer.

---

### 9.2 Panel Basemap — Pilihan Latar Peta

| Basemap | Tampilan | Kegunaan |
|---------|---------|---------|
| OpenStreetMap | Peta jalan standar | Default, umum digunakan |
| Google Satellite | Foto udara/satelit | Melihat kondisi lapangan nyata |
| OpenTopoMap | Kontur topografi | Melihat bentuk lahan |
| CARTO Dark | Peta gelap | Mode malam / estetika |

---

### 9.3 Panel Transform — Fitur Utama (Transformasi Koordinat)

Ini adalah panel terpenting. Alurnya:

**Langkah 1: Pilih arah transformasi**
- WGS84 → ID74
- ID74 → WGS84

**Langkah 2: Pilih mode input**

*Mode 1: Input Manual (satu titik)*
- Masukkan koordinat di kolom Lintang & Bujur
- Pilih format: DD (Desimal), DMS (Derajat-Menit-Detik), atau UTM 47S
- Pilih epoch (tahun pengukuran): 2021-2026
- Klik "Transform"

*Mode 2: Upload CSV (banyak titik)*
- Upload file CSV yang berisi kolom koordinat
- Dashboard baca dan proses semua baris
- Hasil ditampilkan sebagai tabel

**Langkah 3: Lihat hasil**
- Koordinat hasil transformasi ditampilkan
- Jarak perpindahan (dalam meter) ditampilkan
- Azimuth/bearing (arah) ditampilkan
- Titik divisualisasikan di peta (hijau = asal, biru = hasil, garis putus-putus = hubungan)

**Langkah 4: Download hasil**
- Klik tombol download → file CSV terunduh

---

### 9.4 Panel Download — Antrian Unduhan

Menyimpan daftar hasil transformasi yang siap diunduh. Berguna jika sudah melakukan beberapa kali transformasi dan ingin mengunduh semuanya.

---

### 9.5 Panel History — Riwayat Transformasi

- Menyimpan hingga **50 transformasi terakhir** di `localStorage` browser
- Pengguna bisa klik riwayat untuk memuat kembali hasilnya
- Bisa dihapus (clear all)
- Data tersimpan secara **persisten** — tidak hilang meski browser ditutup

---

### 9.6 Panel Informasi

Berisi dokumentasi internal:
- Versi dashboard (v1.0.0)
- Metode yang digunakan (Molodensky-Badekas 10-parameter)
- Parameter transformasi yang dipakai
- Datum yang didukung
- Daftar keyboard shortcuts
- Kredit library yang digunakan

---

### 9.7 Status Bar

Bar di bawah layar yang menampilkan informasi real-time:
- **Skala peta** — misal "1:50.000"
- **Basemap aktif** — nama basemap yang sedang dipakai
- **Koordinat kursor** — lintang/bujur dari posisi mouse di peta

---

## 10. DATABASE & DATA SPASIAL

### 10.1 File SQL

**`Database/ShapefileCaps.sql`** — File besar berisi:
- Perintah `CREATE TABLE` untuk semua tabel
- Definisi kolom dengan tipe data geometri (PostGIS)
- Indeks spasial untuk query cepat
- Constraint dan foreign key

**`Database/rls_policies.sql`** — Kebijakan Row Level Security:
- Aturan siapa yang bisa `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- Berdasarkan tipe pengguna (Admin vs User)

### 10.2 Data Shapefile

Folder `Database/Shapefile/` dan `Database/Support Data Capstone ITB/` berisi:
- **Boundary_MinasBatak** — Batas lapangan Minas & Kotabatak
- **Boundary_Rokan** — Batas Wilayah Kerja Rokan
- **Pipeline** — Jaringan pipa
- **Well** — Lokasi sumur

Format shapefile terdiri dari beberapa file pendamping:
- `.shp` — Geometri (bentuk)
- `.dbf` — Atribut (data tabel)
- `.shx` — Index geometri
- `.prj` — Informasi proyeksi koordinat
- `.cpg` — Encoding karakter

### 10.3 Data Dummy untuk Testing

`Database/data_dummy_100.csv` — Berisi 100 titik koordinat palsu untuk uji coba fitur batch transformasi.

### 10.4 File Quarto (.qmd)

File `.qmd` adalah format dokumen Quarto (mirip R Markdown). Digunakan untuk mendokumentasikan data dan analisis, bukan dijalankan di dashboard.

---

## 11. CARA TRANSFORMASI KOORDINAT BEKERJA

### 11.1 Konsep Dasar

Bumi bukan bola sempurna, melainkan berbentuk **ellipsoid** (sedikit pepat di kutub). Datum berbeda mendefinisikan ellipsoid berbeda:
- **ID74** menggunakan ellipsoid **GRS67** — dikalibrasi untuk wilayah Indonesia
- **WGS84** menggunakan ellipsoid **WGS84** — dikalibrasi untuk seluruh bumi

Karena ellipsoid berbeda, koordinat yang sama di dunia nyata memiliki nilai angka yang berbeda di kedua sistem.

### 11.2 Algoritma Molodensky-Badekas 10-Parameter

Ini adalah algoritma transformasi yang digunakan. "10-parameter" berarti ada 10 nilai yang mendefinisikan hubungan antara dua datum:

| No | Parameter | Nilai | Keterangan |
|----|-----------|-------|------------|
| 1 | ΔX | -21.198 m | Pergeseran pusat ellipsoid sumbu X |
| 2 | ΔY | -28.407 m | Pergeseran pusat ellipsoid sumbu Y |
| 3 | ΔZ | +4.646 m | Pergeseran pusat ellipsoid sumbu Z |
| 4 | Rx | (nilai rotasi) | Rotasi sumbu X (dalam radian) |
| 5 | Ry | (nilai rotasi) | Rotasi sumbu Y |
| 6 | Rz | (nilai rotasi) | Rotasi sumbu Z |
| 7 | ds | 0.9999905 | Faktor skala |
| 8-10 | Xp, Yp, Zp | (centroid) | Titik pusat rotasi (Molodensky-Badekas) |

### 11.3 Langkah-Langkah Transformasi

```
Koordinat Input (Lintang, Bujur, Tinggi)
        │
        ▼ [1] Konversi ke ECEF
Koordinat 3D Kartesian (X, Y, Z)
        │
        ▼ [2] Terapkan rotasi, translasi, skala (7-parameter Helmert)
Koordinat ECEF di datum tujuan
        │
        ▼ [3] Konversi balik ke Geodetik
Koordinat Output (Lintang, Bujur, Tinggi)
```

**ECEF** = Earth-Centered, Earth-Fixed — sistem koordinat 3D dengan pusat di tengah bumi.

### 11.4 Epoch Effect (Koreksi Waktu)

Lempeng tektonik bergerak sepanjang waktu. Wilayah WK Rokan bergerak dengan kecepatan:
- **-27 mm/tahun** di arah X
- **-7 mm/tahun** di arah Y
- **-4 mm/tahun** di arah Z

Jika koordinat diukur tahun 2024, ada perbedaan posisi ~3 tahun × kecepatan dibanding data referensi 2021. Dashboard mengoreksi ini otomatis berdasarkan epoch yang dipilih.

### 11.5 Format Koordinat yang Didukung

**DD (Decimal Degrees) — Format Desimal:**
```
Lintang: 1.234567
Bujur:   101.567890
```

**DMS (Degrees Minutes Seconds) — Format Derajat-Menit-Detik:**
```
Lintang: 1° 14' 4.4412" N
Bujur:   101° 34' 4.404" E
```

**UTM 47S — Universal Transverse Mercator Zone 47S:**
```
Easting:  234567 m
Northing: 9876543 m
```

### 11.6 Kode Java sebagai Referensi

File Java di folder proyek (`DatumTransformationMolodensky.java`, dll.) adalah **implementasi referensi** dari algoritma yang sama. Kode ini tidak dijalankan oleh browser — melainkan dijadikan panduan saat mengimplementasikan ulang logika yang sama dalam JavaScript di `transform.js`.

---

## 12. API EKSTERNAL YANG DIGUNAKAN

### 12.1 Nominatim (Pencarian Lokasi)
```
URL: https://nominatim.openstreetmap.org/search
Metode: GET
Parameter: q (query), format=json, limit=5
Autentikasi: Tidak perlu (gratis, open)
```
Digunakan oleh `search.js` untuk fitur autocomplete pencarian lokasi di search bar.

### 12.2 Tile Peta (Basemap)

Basemap peta diambil dari server tile eksternal:

```
OpenStreetMap:  https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
Google Satellite: https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}
OpenTopoMap:    https://tile.opentopomap.org/{z}/{x}/{y}.png
CARTO Dark:     https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
```

Format `{z}/{x}/{y}` adalah koordinat tile standar — z=zoom level, x=kolom tile, y=baris tile.

### 12.3 Supabase REST API

Setiap tabel Supabase secara otomatis menghasilkan endpoint API:
```
GET  https://[project].supabase.co/rest/v1/[tablename]
Authorization: Bearer [api_key]
```

Contoh query layer Minas_Batak:
```javascript
fetch('https://vfbuxzluwafagicjuupc.supabase.co/rest/v1/Minas_Batak?select=WKT', {
  headers: { 'apikey': SUPABASE_KEY }
})
```

---

## 13. KEAMANAN & AUTENTIKASI

### 13.1 Sistem Login

Dashboard menggunakan **autentikasi sederhana berbasis form** (bukan OAuth atau JWT):

1. Username & password dikirim ke browser (tidak ke server)
2. Dicek secara lokal atau via query Supabase
3. Status login disimpan di `localStorage`

> **Catatan:** Ini adalah sistem autentikasi sederhana untuk keperluan capstone. Untuk produksi nyata, sebaiknya menggunakan sistem autentikasi yang lebih aman seperti Supabase Auth atau JWT.

### 13.2 Session Management

- **Login tersimpan** di `localStorage` dengan key `isLogin`
- **Guard route:** Setiap kali dashboard dibuka, kode mengecek apakah pengguna sudah login. Jika tidak, redirect ke login.html
- **Logout:** Menghapus data dari localStorage

### 13.3 Row Level Security (RLS) Supabase

File `rls_policies.sql` mendefinisikan aturan akses database:
- Hanya pengguna terautentikasi yang bisa membaca data layer
- Admin mendapat akses lebih luas
- Pencegahan akses tidak sah dari luar aplikasi

### 13.4 API Key Supabase

API Key yang dipakai adalah **publishable key** (boleh ada di frontend). Key ini hanya punya akses baca dan hanya bisa menulis ke tabel yang diizinkan oleh RLS. Berbeda dengan **service_role key** yang tidak boleh diekspos ke frontend.

---

## 14. RINGKASAN ARSITEKTUR

### Diagram Besar

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER PENGGUNA                      │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ index.html  │  │  login.html  │  │  dashboard.html  │  │
│  │  (Landing)  │  │   (Login)    │  │  (Peta + Panel)  │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│                                               │              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              JAVASCRIPT MODULES                      │   │
│  │  auth.js  │  map.js  │  transform.js  │  ui.js      │   │
│  │  event.js │  search.js                              │   │
│  └───────────────────────┬─────────────────────────────┘   │
│                          │                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              LIBRARIES                               │   │
│  │  Leaflet.js (peta)  │  Proj4js (proyeksi)           │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTPS Request
           ┌───────────────┼──────────────────┐
           │               │                  │
    ┌──────▼──────┐  ┌─────▼──────┐  ┌───────▼──────┐
    │  Supabase   │  │ Nominatim  │  │  Tile Server  │
    │ (PostgreSQL │  │  (Search)  │  │  (Basemap)    │
    │ + PostGIS)  │  │            │  │               │
    └─────────────┘  └────────────┘  └───────────────┘
    Database Cloud   API Geocoding   Peta Tile HTTP
```

### Yang Murni Frontend (Berjalan di Browser)

- Semua file HTML
- Semua file CSS
- Semua file JavaScript
- Library Leaflet & Proj4js
- **Termasuk: Algoritma transformasi** (tidak ada server processing)

### Yang Butuh Koneksi Internet

- Memuat tile peta (basemap)
- Memuat data layer dari Supabase
- Fitur pencarian lokasi (Nominatim)
- Login pengguna dari database Supabase

### Yang Tersimpan Lokal di Browser

- Status login (`localStorage`)
- Riwayat transformasi (`localStorage`, maks 50 entri)
- Cache tile peta (dikelola browser otomatis)

---

## PENUTUP

Dashboard **Shifted.** adalah proyek fullstack ringan yang menggabungkan:

1. **Geodesi** — Ilmu transformasi koordinat dan datum geodetik
2. **Web Development** — Frontend modern dengan JavaScript modular
3. **Database** — PostgreSQL dengan kemampuan spasial PostGIS
4. **GIS** — Visualisasi data geospasial interaktif

Kekuatan proyek ini ada pada **algoritma Molodensky-Badekas** yang diimplementasikan langsung di browser tanpa server, sehingga transformasi koordinat berjalan cepat dan bisa dipakai offline setelah halaman dimuat.

Cocok sebagai **alat bantu profesional** untuk surveyor, insinyur minyak & gas, dan praktisi GIS yang bekerja di wilayah WK Rokan dan sekitarnya.

---
*Dokumentasi dibuat oleh Claude Code — Mei 2026*
*Proyek: Capstone Teknik Geodesi & Geomatika, ITB*
