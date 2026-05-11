"""
csv_to_sql.py
Konversi CSV Pipeline ke SQL INSERT untuk Supabase.
Jalankan: python csv_to_sql.py
Output  : pipeline_insert.sql  (copy-paste ke Supabase SQL Editor)
"""

import csv
import os

INPUT_CSV  = 'Supabase/Pipeline.csv'   # path relatif dari folder Database
OUTPUT_SQL = 'pipeline_insert.sql'
TABLE_NAME = 'Pipeline'
BATCH_SIZE = 200  # baris per INSERT, jaga ukuran query tetap kecil


def escape_sql(val):
    """Escape nilai untuk SQL string literal."""
    if val is None or val == '':
        return 'NULL'
    val = str(val).replace("'", "''")   # escape single quote
    return f"'{val}'"


def main():
    csv_path = os.path.join(os.path.dirname(__file__), INPUT_CSV)
    sql_path = os.path.join(os.path.dirname(__file__), OUTPUT_SQL)

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        rows = list(reader)

    print(f"Total baris CSV  : {len(rows)}")

    col_list = ', '.join(f'"{c}"' for c in columns)

    skipped = 0
    written = 0

    with open(sql_path, 'w', encoding='utf-8') as out:
        out.write(f'-- Pipeline INSERT — {len(rows)} baris\n')
        out.write(f'-- Dihasilkan oleh csv_to_sql.py\n\n')

        batch = []
        for i, row in enumerate(rows):
            vals = ', '.join(escape_sql(row.get(c)) for c in columns)
            batch.append(f'  ({vals})')

            if len(batch) == BATCH_SIZE or i == len(rows) - 1:
                out.write(f'INSERT INTO public."{TABLE_NAME}" ({col_list}) VALUES\n')
                out.write(',\n'.join(batch))
                out.write('\nON CONFLICT DO NOTHING;\n\n')
                written += len(batch)
                batch = []

    print(f"Baris ditulis    : {written}")
    print(f"Baris dilewati   : {skipped}")
    print(f"File output      : {sql_path}")
    print(f"\nLangkah berikutnya:")
    print(f"1. Buka Supabase → SQL Editor → New Query")
    print(f"2. Copy-paste isi {OUTPUT_SQL} lalu klik Run")
    print(f"   (Jika file terlalu besar, jalankan per bagian)")


if __name__ == '__main__':
    main()
