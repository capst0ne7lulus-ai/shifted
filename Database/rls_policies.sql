-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES — Shifted. Dashboard
-- Jalankan script ini di Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. TABEL: users
--    Tujuan: hanya bisa dibaca (SELECT) oleh anon key.
--    Operasi tulis (INSERT/UPDATE/DELETE) diblokir sepenuhnya.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada (supaya tidak duplikat)
DROP POLICY IF EXISTS "anon_select_users" ON public.users;

-- Izinkan SELECT agar login dashboard bisa query username & ID
CREATE POLICY "anon_select_users"
  ON public.users
  FOR SELECT
  TO anon
  USING (true);

-- Blokir INSERT / UPDATE / DELETE dari anon key
-- (tidak perlu CREATE POLICY — tanpa policy, operasi tsb otomatis ditolak RLS)


-- ─────────────────────────────────────────────────────────────
-- 2. TABEL: Minas_Batak
--    Tujuan: hanya user yang sudah login di dashboard yang bisa
--    melihat layer. Di sisi database kita izinkan anon SELECT
--    karena autentikasi custom (localStorage) tidak bisa
--    diteruskan ke Supabase Auth.
--    Perlindungan akses dilakukan oleh requireLogin() di JS.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public."Minas_Batak" ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada
DROP POLICY IF EXISTS "anon_select_minas_batak" ON public."Minas_Batak";

-- Izinkan SELECT agar layer bisa ditampilkan di dashboard
CREATE POLICY "anon_select_minas_batak"
  ON public."Minas_Batak"
  FOR SELECT
  TO anon
  USING (true);

-- Blokir INSERT / UPDATE / DELETE dari anon key


-- ─────────────────────────────────────────────────────────────
-- 3. TABEL: pipelinerokan
--    Tujuan: sama seperti Minas_Batak — SELECT via anon key,
--    perlindungan akses nyata dilakukan requireLogin() di JS.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.pipelinerokan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pipelinerokan" ON public.pipelinerokan;

CREATE POLICY "anon_select_pipelinerokan"
  ON public.pipelinerokan
  FOR SELECT
  TO anon
  USING (true);

-- Blokir INSERT / UPDATE / DELETE dari anon key


-- ─────────────────────────────────────────────────────────────
-- CATATAN KEAMANAN
-- ─────────────────────────────────────────────────────────────
-- Karena anon key ada di source code JavaScript (client-side),
-- siapapun yang melihat source dapat query langsung ke Supabase.
-- Perlindungan yang diterapkan:
--   ✔ Tidak ada operasi tulis dari key publik
--   ✔ Halaman dashboard terlindungi requireLogin() di browser
--   ✔ Data tidak bisa diubah / dihapus via anon key
--
-- Untuk keamanan maksimal di masa depan:
--   → Gunakan Supabase Auth (email+password) menggantikan custom auth
--   → Terapkan RLS dengan auth.uid() agar per-user access control
-- ═══════════════════════════════════════════════════════════════
