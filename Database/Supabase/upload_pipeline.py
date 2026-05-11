"""
upload_pipeline.py
==================
Upload CSV WKT ke Supabase — tinggal jalankan, tidak perlu edit file.
Script akan menanyakan Connection String saat dijalankan.

CARA PAKAI:
1. Buka terminal/cmd
2. cd ke folder ini
3. python upload_pipeline.py
"""

import sys
import os
import time
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from tqdm import tqdm

# ══════════════════════════════════════════════
# KONFIGURASI (sudah diisi, tidak perlu diubah)
# ══════════════════════════════════════════════
TABLE_NAME             = "pipelinerokan"
CSV_FILE               = r"C:\Users\LENOVO\Documents\CAPSTONE\Dashboard\DASHBOARD FIX\Database\Supabase\Pipeline1.csv"
BATCH_SIZE             = 200
WKT_COLUMN             = "WKT"
TRUNCATE_BEFORE_UPLOAD = False


def ask_connection_string():
    print("=" * 60)
    print("  UPLOAD PIPELINE ROKAN -> SUPABASE")
    print("=" * 60)
    print()
    print("Ambil Connection String dari:")
    print("  Supabase Dashboard -> Settings -> Database")
    print("  -> Connection string -> tab URI")
    print()
    print("Formatnya:")
    print("  postgresql://postgres:PASSWORD@db.XXXXX.supabase.co:5432/postgres")
    print()
    conn_str = input("Paste Connection String di sini:\n> ").strip()
    if not conn_str.startswith("postgresql://"):
        print()
        print("Sepertinya bukan format yang benar (harus diawali postgresql://)")
        input("Tekan Enter untuk coba lagi...")
        return ask_connection_string()
    return conn_str


def load_csv(path):
    print()
    print("Membaca file CSV...")
    print("  " + path)
    if not os.path.exists(path):
        print()
        print("ERROR: File tidak ditemukan!")
        input("Tekan Enter untuk keluar...")
        sys.exit(1)
    df = pd.read_csv(path)
    print(f"OK: {len(df):,} baris, kolom: {list(df.columns)}")
    if WKT_COLUMN not in df.columns:
        print(f"ERROR: Kolom '{WKT_COLUMN}' tidak ada di CSV!")
        input("Tekan Enter untuk keluar...")
        sys.exit(1)
    size_mb = df.memory_usage(deep=True).sum() / 1024 / 1024
    print(f"Ukuran: {size_mb:.1f} MB")
    return df


def connect_db(conn_str):
    print()
    print("Menghubungkan ke Supabase...")
    try:
        conn = psycopg2.connect(conn_str, connect_timeout=30)
        conn.autocommit = False
        print("Koneksi berhasil!")
        return conn
    except psycopg2.OperationalError as e:
        print(f"KONEKSI GAGAL: {e}")
        print()
        print("Kemungkinan penyebab:")
        print("  1. Password salah")
        print("  2. Project Supabase di-pause")
        print("  3. Koneksi diblokir firewall/VPN")
        input("Tekan Enter untuk keluar...")
        sys.exit(1)


def upload_batches(conn, df, table_name):
    csv_cols = list(df.columns)
    total    = len(df)
    uploaded = 0
    failed   = 0
    skipped  = 0

    cols_quoted = ", ".join(f'"{c}"' for c in csv_cols)
    query = f'INSERT INTO "{table_name}" ({cols_quoted}) VALUES %s ON CONFLICT DO NOTHING'

    print()
    print(f"Mulai upload {total:,} baris ke tabel '{table_name}'")
    print(f"Batch size: {BATCH_SIZE} | Total batch: {(total + BATCH_SIZE - 1) // BATCH_SIZE}")
    print()

    start_time = time.time()

    with tqdm(total=total, unit="baris", ncols=65, colour="green") as pbar:
        for i in range(0, total, BATCH_SIZE):
            batch_df  = df.iloc[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            records   = [
                tuple(None if pd.isna(v) else v for v in row)
                for _, row in batch_df.iterrows()
            ]
            try:
                with conn.cursor() as cur:
                    execute_values(cur, query, records, page_size=BATCH_SIZE)
                conn.commit()
                uploaded += len(records)
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                skipped += len(records)
                tqdm.write(f"  Batch {batch_num}: duplikat, di-skip")
            except psycopg2.Error as e:
                conn.rollback()
                failed += len(records)
                tqdm.write(f"  Batch {batch_num} gagal: {str(e.pgerror or e)[:80]}")
                tqdm.write(f"  Mencoba per baris...")
                for j, rec in enumerate(records):
                    try:
                        with conn.cursor() as cur:
                            execute_values(cur, query, [rec])
                        conn.commit()
                        uploaded += 1
                        failed   -= 1
                    except psycopg2.Error:
                        conn.rollback()
                        tqdm.write(f"    Baris {i+j+1} gagal, dilewati")
            pbar.update(len(records))

    elapsed = time.time() - start_time
    rate    = uploaded / elapsed if elapsed > 0 else 0
    print()
    print("=" * 50)
    print(f"SELESAI dalam {elapsed:.1f} detik ({rate:.0f} baris/detik)")
    print(f"  Berhasil  : {uploaded:,} baris")
    print(f"  Duplikat  : {skipped:,} baris (di-skip)")
    print(f"  Gagal     : {failed:,} baris")
    print("=" * 50)
    return uploaded, skipped, failed


def verify_count(conn, table_name, expected):
    with conn.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{table_name}"')
        count = cur.fetchone()[0]
    print()
    print(f"Verifikasi tabel '{table_name}': {count:,} baris")
    if count >= expected:
        print("Semua data masuk!")
    else:
        print(f"Masih kurang {expected - count:,} baris")
    return count


def main():
    conn_str = ask_connection_string()
    df       = load_csv(CSV_FILE)

    print()
    print("Ringkasan:")
    print(f"  File  : {os.path.basename(CSV_FILE)}")
    print(f"  Tabel : {TABLE_NAME}")
    print(f"  Baris : {len(df):,}")
    print(f"  Kolom : {list(df.columns)}")
    print()
    confirm = input("Lanjut upload? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Upload dibatalkan.")
        sys.exit(0)

    conn = connect_db(conn_str)
    try:
        if TRUNCATE_BEFORE_UPLOAD:
            print(f"Menghapus data lama di '{TABLE_NAME}'...")
            with conn.cursor() as cur:
                cur.execute(f'TRUNCATE TABLE "{TABLE_NAME}"')
            conn.commit()

        upload_batches(conn, df, TABLE_NAME)
        verify_count(conn, TABLE_NAME, len(df))
    finally:
        conn.close()
        print()
        print("Koneksi ditutup.")
        print()
        input("Tekan Enter untuk keluar...")


if __name__ == "__main__":
    main()
