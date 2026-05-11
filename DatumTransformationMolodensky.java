package geodesi.transformasi;

/**
 * =========================================================================
 *   TRANSFORMASI DATUM 7 PARAMETER (MOLODENSKY-BADEKAS / HELMERT)
 *   Metode  : Iterative Weighted Least Squares (Gauss-Markov + bobot)
 *   Input   : Titik sumber (X,Y,Z), titik target (X2,Y2,Z2), matriks bobot
 *   Output  : tx, ty, tz, s, rx, ry, rz  +  statistik (sigma apost., std dev)
 *
 *   Capstone Project - Sistem Informasi Transformasi Datum
 *   Teknik Geodesi dan Geomatika
 * =========================================================================
 *
 *   CATATAN PENGGUNAAN:
 *   - Untuk Molodensky-Badekas : centroid dihitung dari rata-rata srcPoints (default).
 *   - Untuk Helmert 7-param    : set useCentroid = false  (Xm=Ym=Zm=0).
 *   - Bobot diisi sebagai matriks N×3 (stdX, stdY, stdZ) per titik.
 *   - Dependensi eksternal: TIDAK ADA (hanya Java SE).
 */
public class DatumTransformation7Param {

    // =========================================================================
    //   KELAS HASIL
    // =========================================================================
    public static class TransformationResult {
        public final double tx, ty, tz;   // translasi (m)
        public final double s;            // faktor skala
        public final double rx, ry, rz;  // rotasi (radian)
        public final double[] stdDev;     // std deviasi parameter [7]
        public final double sigmaApost;   // sigma a posteriori
        public final double chiVal;       // nilai chi-square
        public final double[] centroid;   // centroid yang digunakan [Xm, Ym, Zm]
        public final int iterations;      // jumlah iterasi

        public TransformationResult(double tx, double ty, double tz, double s,
                                    double rx, double ry, double rz,
                                    double[] stdDev, double sigmaApost, double chiVal,
                                    double[] centroid, int iterations) {
            this.tx = tx; this.ty = ty; this.tz = tz;
            this.s  = s;
            this.rx = rx; this.ry = ry; this.rz = rz;
            this.stdDev     = stdDev;
            this.sigmaApost = sigmaApost;
            this.chiVal     = chiVal;
            this.centroid   = centroid;
            this.iterations = iterations;
        }

        @Override
        public String toString() {
            return String.format(
                "=================================================================\n" +
                "  HASIL TRANSFORMASI DATUM 7 PARAMETER\n" +
                "=================================================================\n" +
                "  tx  = %.10f  m\n" +
                "  ty  = %.10f  m\n" +
                "  tz  = %.10f  m\n" +
                "  s   = %.10f\n"   +
                "  rx  = %.10f  rad\n" +
                "  ry  = %.10f  rad\n" +
                "  rz  = %.10f  rad\n" +
                "-----------------------------------------------------------------\n" +
                "  Centroid  : Xm=%.4f  Ym=%.4f  Zm=%.4f\n" +
                "  Iterasi   : %d\n"   +
                "  σ²apost   : %.10f\n" +
                "  chi_val   : %.10f\n" +
                "-----------------------------------------------------------------\n" +
                "  Std Dev Parameter:\n" +
                "  s(tx)=%.6f  s(ty)=%.6f  s(tz)=%.6f\n" +
                "  s(s) =%.6f  s(rx)=%.6f  s(ry)=%.6f  s(rz)=%.6f\n" +
                "=================================================================",
                tx, ty, tz, s, rx, ry, rz,
                centroid[0], centroid[1], centroid[2],
                iterations, sigmaApost, chiVal,
                stdDev[0], stdDev[1], stdDev[2],
                stdDev[3], stdDev[4], stdDev[5], stdDev[6]
            );
        }
    }

    // =========================================================================
    //   METODE UTAMA
    // =========================================================================

    /**
     * Hitung 7 parameter transformasi datum.
     *
     * @param srcPoints   koordinat sumber  [N][3]  {X, Y, Z}
     * @param tgtPoints   koordinat target  [N][3]  {X2, Y2, Z2}
     * @param bobot       matriks bobot     [N][3]  {stdX, stdY, stdZ}
     * @param useCentroid true = Molodensky-Badekas (centroid dari srcPoints)
     *                    false = Helmert (Xm=Ym=Zm=0)
     * @return TransformationResult
     */
    public static TransformationResult compute(double[][] srcPoints,
                                               double[][] tgtPoints,
                                               double[][] bobot,
                                               boolean useCentroid) {
        int N = srcPoints.length;

        // -----------------------------------------------------------------------
        // CENTROID
        // -----------------------------------------------------------------------
        double Xm = 0, Ym = 0, Zm = 0;
        if (useCentroid) {
            for (int q = 0; q < N; q++) {
                Xm += srcPoints[q][0];
                Ym += srcPoints[q][1];
                Zm += srcPoints[q][2];
            }
            Xm /= N; Ym /= N; Zm /= N;
        }
        double[] centroid = {Xm, Ym, Zm};

        // -----------------------------------------------------------------------
        // NILAI AWAL PARAMETER
        // -----------------------------------------------------------------------
        double tx0 = 0, ty0 = 0, tz0 = 0, s0 = 1, rx0 = 0, ry0 = 0, rz0 = 0;

        // -----------------------------------------------------------------------
        // ITERASI PERTAMA (inisialisasi — tanpa bobot Qe)
        // -----------------------------------------------------------------------
        double[][] A1 = new double[3 * N][7];
        double[]   C1 = new double[3 * N];

        fillACInitial(srcPoints, tgtPoints, N, Xm, Ym, Zm,
                      tx0, ty0, tz0, s0, rx0, ry0, rz0, A1, C1);

        double[][] S1   = multiply(transpose(A1), A1);
        double[][] invS1 = invertViaCofactor(S1);
        double[]   Xi   = multiplyMV(multiply(invS1, transpose(A1)), C1);

        // Update parameter awal
        tx0 += Xi[0]; ty0 += Xi[1]; tz0 += Xi[2];
        s0  += Xi[3];
        rx0 += Xi[4]; ry0 += Xi[5]; rz0 += Xi[6];

        // Simpan hasil iterasi pertama
        double tx01 = tx0, ty01 = ty0, tz01 = tz0;
        double s01  = s0;
        double rx01 = rx0, ry01 = ry0, rz01 = rz0;

        // -----------------------------------------------------------------------
        // ITERASI UTAMA (Gauss-Markov + bobot)
        // -----------------------------------------------------------------------
        int    maxIter = 1000;
        double epsilon = 1e-12;
        int    count   = 0;

        double[][] Xj_mat = null;
        double[][] WeOut  = null;
        double[][] A_out  = null;
        double[][] B_out  = null;
        double[]   C_out  = null;
        double[][] Q_out  = null;

        while (count < maxIter) {
            count++;

            double[][] A = new double[3 * N][7];
            double[][] B = new double[3 * N][6 * N];
            double[]   C = new double[3 * N];

            // Matriks bobot P2 (diagonal)
            double[][] P2 = buildP2(bobot, N);
            double[][] Q  = invertDiagonal(P2);   // Q = inv(P2)

            // Isi A, B, C
            fillABC(srcPoints, tgtPoints, N, Xm, Ym, Zm,
                    tx0, ty0, tz0, s0, rx0, ry0, rz0, A, B, C);

            // Qe = B * Q * B^T
            double[][] BQ  = multiply(B, Q);
            double[][] Qe  = multiply(BQ, transpose(B));
            double[][] We  = invert(Qe);                       // We = inv(Qe)

            // S = A^T * We * A
            double[][] AtWe = multiply(transpose(A), We);
            double[][] S    = multiply(AtWe, A);

            double[][] invS = invertViaCofactor(S);

            // Xj = -(invS) * A^T * We * C
            double[] AtWeC = multiplyMV(AtWe, C);
            double[] Xj    = new double[7];
            for (int r = 0; r < 7; r++) {
                double sum = 0;
                for (int c2 = 0; c2 < 7; c2++) sum += invS[r][c2] * AtWeC[c2];
                Xj[r] = -sum;
            }

            // Update parameter
            double prev_tx = tx0, prev_ty = ty0, prev_tz = tz0;
            double prev_s  = s0;
            double prev_rx = rx0, prev_ry = ry0, prev_rz = rz0;

            tx0 = Xj[0] + prev_tx;
            ty0 = Xj[1] + prev_ty;
            tz0 = Xj[2] + prev_tz;
            s0  = Xj[3] + prev_s;
            rx0 = Xj[4] + prev_rx;
            ry0 = Xj[5] + prev_ry;
            rz0 = Xj[6] + prev_rz;

            // Simpan untuk output statistik
            Xj_mat = new double[7][1];
            for (int r = 0; r < 7; r++) Xj_mat[r][0] = Xj[r];
            WeOut = We; A_out = A; B_out = B; C_out = C; Q_out = Q;

            // Kriteria berhenti
            if (Math.abs(tx0 - prev_tx) < epsilon &&
                Math.abs(ty0 - prev_ty) < epsilon &&
                Math.abs(tz0 - prev_tz) < epsilon &&
                Math.abs(s0  - prev_s)  < epsilon &&
                Math.abs(rx0 - prev_rx) < epsilon &&
                Math.abs(ry0 - prev_ry) < epsilon &&
                Math.abs(rz0 - prev_rz) < epsilon) {
                break;
            }
        }

        // -----------------------------------------------------------------------
        // STATISTIK PASCA-ITERASI
        // -----------------------------------------------------------------------
        // Ko = We * (C + A*Xj)
        double[] Xj_vec = new double[7];
        for (int r = 0; r < 7; r++) Xj_vec[r] = Xj_mat[r][0];

        double[] AXj = multiplyMV(A_out, Xj_vec);
        double[] CpAXj = new double[C_out.length];
        for (int r = 0; r < C_out.length; r++) CpAXj[r] = C_out[r] + AXj[r];

        double[] Ko = multiplyMV(WeOut, CpAXj);

        // ve = -Q * B^T * Ko
        double[] BtKo = multiplyMV(transpose(B_out), Ko);
        double[] ve   = multiplyMV(Q_out, BtKo);
        for (int r = 0; r < ve.length; r++) ve[r] = -ve[r];

        // apost = (ve^T * P2 * ve) / (2*N*3 - 7)   →  dof = 3N*2 - 7 = 14 untuk N=4
        double[][] P2final = buildP2(bobot, N);
        double[] P2ve = multiplyMV(P2final, ve);
        double vtPv = 0;
        for (int r = 0; r < ve.length; r++) vtPv += ve[r] * P2ve[r];
        int dof = 3 * N * 2 - 7;   // = 14 untuk N=4  (sesuai chi_val = 14*apost/1)
        double sigmaApost = vtPv / dof;

        // Qxx = (A^T * We^-1 * A)^-1  -- sudah diinvers, pakai invS dari iterasi terakhir
        double[][] AtWe_f = multiply(transpose(A_out), WeOut);
        double[][] S_f    = multiply(AtWe_f, A_out);
        double[][] Qxx    = invertViaCofactor(S_f);

        // sxx = diag(sigma_apost * Qxx)
        double[] stdDev = new double[7];
        for (int r = 0; r < 7; r++) {
            double val = sigmaApost * Qxx[r][r];
            stdDev[r] = val >= 0 ? Math.sqrt(val) : 0.0;
        }

        double chiVal = (double) dof * sigmaApost;

        return new TransformationResult(
            tx0, ty0, tz0, s0, rx0, ry0, rz0,
            stdDev, sigmaApost, chiVal,
            centroid, count
        );
    }

    // =========================================================================
    //   HELPER: ISI MATRIKS A, C  (iterasi pertama – tanpa bobot)
    // =========================================================================
    private static void fillACInitial(double[][] src, double[][] tgt, int N,
                                       double Xm, double Ym, double Zm,
                                       double tx, double ty, double tz, double s,
                                       double rx, double ry, double rz,
                                       double[][] A, double[] C) {
        for (int q = 0; q < N; q++) {
            double X  = src[q][0] - Xm, Y  = src[q][1] - Ym, Z  = src[q][2] - Zm;
            double X2 = tgt[q][0] - Xm, Y2 = tgt[q][1] - Ym, Z2 = tgt[q][2] - Zm;

            double r11 = Math.cos(ry)*Math.cos(rz);
            double r12 = Math.sin(rx)*Math.sin(ry)*Math.cos(rz) + Math.cos(rx)*Math.sin(rz);
            double r13 = -Math.cos(rx)*Math.sin(ry)*Math.cos(rz) + Math.sin(rx)*Math.sin(rz);
            double r21 = -Math.cos(ry)*Math.sin(rz);
            double r22 = -Math.sin(rx)*Math.sin(ry)*Math.sin(rz) + Math.cos(rx)*Math.cos(rz);
            double r23 = Math.cos(rx)*Math.sin(ry)*Math.sin(rz) + Math.sin(rx)*Math.cos(rz);
            double r31 = Math.sin(ry);
            double r32 = -Math.sin(rx)*Math.cos(ry);
            double r33 = Math.cos(rx)*Math.cos(ry);

            int row = q * 3;
            // Baris 1 (X)
            A[row][0]=1; A[row][1]=0; A[row][2]=0;
            A[row][3]=r11*X+r12*Y+r13*Z;
            A[row][4]=s*((Math.cos(rx)*Math.sin(ry)*Math.cos(rz)-Math.sin(rx)*Math.sin(rz))*Y
                        +(Math.sin(rx)*Math.sin(ry)*Math.cos(rz)+Math.cos(rx)*Math.sin(rz))*Z);
            A[row][5]=s*((-Math.sin(ry)*Math.cos(rz))*X+(Math.sin(rx)*Math.cos(ry)*Math.cos(rz))*Y
                        +(-Math.cos(rx)*Math.cos(ry)*Math.cos(rz))*Z);
            A[row][6]=s*((-Math.cos(ry)*Math.sin(rz))*X
                        +(-Math.sin(rx)*Math.sin(ry)*Math.sin(rz)+Math.cos(rx)*Math.cos(rz))*Y
                        +(Math.cos(rx)*Math.sin(ry)*Math.sin(rz)+Math.sin(rx)*Math.cos(rz))*Z);
            // Baris 2 (Y)
            A[row+1][0]=0; A[row+1][1]=1; A[row+1][2]=0;
            A[row+1][3]=r21*X+r22*Y+r23*Z;
            A[row+1][4]=s*((-Math.cos(rx)*Math.sin(ry)*Math.sin(rz)-Math.sin(rx)*Math.cos(rz))*Y
                           +(-Math.sin(rx)*Math.sin(ry)*Math.sin(rz)+Math.cos(rx)*Math.cos(rz))*Z);
            A[row+1][5]=s*((Math.sin(ry)*Math.sin(rz))*X+(-Math.sin(rx)*Math.cos(ry)*Math.sin(rz))*Y
                           +(Math.cos(rx)*Math.cos(ry)*Math.sin(rz))*Z);
            A[row+1][6]=s*((-Math.cos(ry)*Math.cos(rz))*X
                           +(-Math.sin(rx)*Math.sin(ry)*Math.cos(rz)-Math.cos(rx)*Math.sin(rz))*Y
                           +(Math.cos(rx)*Math.sin(ry)*Math.cos(rz)-Math.sin(rx)*Math.sin(rz))*Z);
            // Baris 3 (Z)
            A[row+2][0]=0; A[row+2][1]=0; A[row+2][2]=1;
            A[row+2][3]=r31*X+r32*Y+r33*Z;
            A[row+2][4]=s*((-Math.cos(rx)*Math.cos(ry))*Y+(-Math.sin(rx)*Math.cos(ry))*Z);
            A[row+2][5]=s*((Math.cos(ry))*X+(Math.sin(rx)*Math.sin(ry))*Y+(-Math.cos(rx)*Math.sin(ry))*Z);
            A[row+2][6]=0;

            // Vektor C
            C[row]   = X2 - (s*(r11*X+r12*Y+r13*Z) + tx);
            C[row+1] = Y2 - (s*(r21*X+r22*Y+r23*Z) + ty);
            C[row+2] = Z2 - (s*(r31*X+r32*Y+r33*Z) + tz);
        }
    }

    // =========================================================================
    //   HELPER: ISI MATRIKS A, B, C  (iterasi utama – linierisasi sederhana)
    // =========================================================================
    private static void fillABC(double[][] src, double[][] tgt, int N,
                                  double Xm, double Ym, double Zm,
                                  double tx, double ty, double tz, double s,
                                  double rx, double ry, double rz,
                                  double[][] A, double[][] B, double[] C) {
        for (int i = 0; i < N; i++) {
            double X  = src[i][0] - Xm, Y  = src[i][1] - Ym, Z  = src[i][2] - Zm;
            double X2 = tgt[i][0] - Xm, Y2 = tgt[i][1] - Ym, Z2 = tgt[i][2] - Zm;

            int row = i * 3;

            // Matriks desain A (Jacobian linier)
            A[row][0]=1; A[row][1]=0; A[row][2]=0;
            A[row][3]= X + rz*Y - ry*Z;
            A[row][4]= 0;
            A[row][5]= -s*Z;
            A[row][6]= s*Y;

            A[row+1][0]=0; A[row+1][1]=1; A[row+1][2]=0;
            A[row+1][3]= -rz*X + Y + rx*Z;
            A[row+1][4]= s*Z;
            A[row+1][5]= 0;
            A[row+1][6]= -s*X;

            A[row+2][0]=0; A[row+2][1]=0; A[row+2][2]=1;
            A[row+2][3]= ry*X - rx*Y + Z;
            A[row+2][4]= -s*Y;
            A[row+2][5]= s*X;
            A[row+2][6]= 0;

            // Vektor misclosure C
            C[row]   = tx + s*X + s*rz*Y - s*ry*Z - X2;
            C[row+1] = ty - s*rz*X + s*Y + s*rx*Z - Y2;
            C[row+2] = tz + s*ry*X - s*rx*Y + s*Z - Z2;

            // Blok submatriks B
            double[][] Bi = {
                { s,       s*rz,  -s*ry, -1,  0,  0 },
                { -s*rz,   s,      s*rx,  0, -1,  0 },
                { s*ry,   -s*rx,   s,     0,  0, -1 }
            };

            int startRow = i * 3;
            int startCol = i * 6;
            for (int r = 0; r < 3; r++)
                for (int c = 0; c < 6; c++)
                    B[startRow + r][startCol + c] = Bi[r][c];
        }
    }

    // =========================================================================
    //   HELPER: BANGUN MATRIKS P2 (diagonal, dari matriks bobot)
    // =========================================================================
    private static double[][] buildP2(double[][] bobot, int N) {
        double[][] P2 = new double[6 * N][6 * N];
        for (int j = 0; j < N; j++) {
            int row = j * 6;
            P2[row][row]     = bobot[j][0];   // stdX sumber
            P2[row+1][row+1] = bobot[j][1];   // stdY sumber
            P2[row+2][row+2] = bobot[j][2];   // stdZ sumber
            P2[row+3][row+3] = bobot[j][0];   // stdX target
            P2[row+4][row+4] = bobot[j][1];   // stdY target
            P2[row+5][row+5] = bobot[j][2];   // stdZ target
        }
        return P2;
    }

    // =========================================================================
    //   OPERASI MATRIKS
    // =========================================================================

    /** Transpose matriks */
    private static double[][] transpose(double[][] M) {
        int r = M.length, c = M[0].length;
        double[][] T = new double[c][r];
        for (int i = 0; i < r; i++)
            for (int j = 0; j < c; j++)
                T[j][i] = M[i][j];
        return T;
    }

    /** Perkalian matriks-matriks */
    private static double[][] multiply(double[][] A, double[][] B) {
        int m = A.length, k = A[0].length, n = B[0].length;
        double[][] C = new double[m][n];
        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                for (int p = 0; p < k; p++)
                    C[i][j] += A[i][p] * B[p][j];
        return C;
    }

    /** Perkalian matriks-vektor */
    private static double[] multiplyMV(double[][] A, double[] v) {
        int m = A.length, k = v.length;
        double[] res = new double[m];
        for (int i = 0; i < m; i++)
            for (int j = 0; j < k; j++)
                res[i] += A[i][j] * v[j];
        return res;
    }

    /**
     * Invers matriks kecil (7×7 atau lebih kecil) via kofaktor (adjugat).
     * Sesuai pendekatan MATLAB asli.
     */
    private static double[][] invertViaCofactor(double[][] M) {
        int n = M.length;
        double det = determinant(M);
        if (Math.abs(det) < 1e-30)
            throw new ArithmeticException("Matriks singular, tidak dapat diinvers (det ≈ 0).");

        double[][] adj = new double[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                double[][] sub = submatrix(M, i, j);
                double cofactor = Math.pow(-1, i + j) * determinant(sub);
                adj[j][i] = cofactor;   // transpose langsung
            }
        }

        double[][] inv = new double[n][n];
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                inv[i][j] = adj[i][j] / det;
        return inv;
    }

    /**
     * Invers matriks umum via eliminasi Gauss-Jordan.
     * Digunakan untuk Qe (berukuran 3N×3N, bisa besar).
     */
    private static double[][] invert(double[][] M) {
        int n = M.length;
        double[][] aug = new double[n][2 * n];
        for (int i = 0; i < n; i++) {
            System.arraycopy(M[i], 0, aug[i], 0, n);
            aug[i][n + i] = 1.0;
        }
        // Forward elimination
        for (int col = 0; col < n; col++) {
            // Pivot
            int maxRow = col;
            for (int row = col + 1; row < n; row++)
                if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
            double[] tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;

            double pivot = aug[col][col];
            if (Math.abs(pivot) < 1e-30)
                throw new ArithmeticException("Matriks Qe singular.");
            for (int j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

            for (int row = 0; row < n; row++) {
                if (row == col) continue;
                double factor = aug[row][col];
                for (int j = 0; j < 2 * n; j++)
                    aug[row][j] -= factor * aug[col][j];
            }
        }
        double[][] inv = new double[n][n];
        for (int i = 0; i < n; i++)
            System.arraycopy(aug[i], n, inv[i], 0, n);
        return inv;
    }

    /**
     * Invers matriks diagonal (P2).
     * Cukup membalik elemen diagonal.
     */
    private static double[][] invertDiagonal(double[][] D) {
        int n = D.length;
        double[][] inv = new double[n][n];
        for (int i = 0; i < n; i++) {
            if (Math.abs(D[i][i]) < 1e-30)
                throw new ArithmeticException("Elemen diagonal nol, tidak dapat diinvers.");
            inv[i][i] = 1.0 / D[i][i];
        }
        return inv;
    }

    /** Determinan rekursif (Laplace expansion) */
    private static double determinant(double[][] M) {
        int n = M.length;
        if (n == 1) return M[0][0];
        if (n == 2) return M[0][0]*M[1][1] - M[0][1]*M[1][0];
        double det = 0;
        for (int j = 0; j < n; j++) {
            det += Math.pow(-1, j) * M[0][j] * determinant(submatrix(M, 0, j));
        }
        return det;
    }

    /** Submatriks dengan baris i dan kolom j dihapus */
    private static double[][] submatrix(double[][] M, int skipRow, int skipCol) {
        int n = M.length;
        double[][] sub = new double[n - 1][n - 1];
        int ri = 0;
        for (int r = 0; r < n; r++) {
            if (r == skipRow) continue;
            int ci = 0;
            for (int c = 0; c < n; c++) {
                if (c == skipCol) continue;
                sub[ri][ci++] = M[r][c];
            }
            ri++;
        }
        return sub;
    }

    // =========================================================================
    //   MAIN: contoh penggunaan
    // =========================================================================
    public static void main(String[] args) {

        // Ganti dengan koordinat aktual dari file Excel Anda
        double[][] srcPoints = {
            { -1648971.234, 6045832.567, 112345.678 },
            { -1649102.345, 6045900.123, 112200.456 },
            { -1649250.456, 6046010.789, 112100.234 },
            { -1649380.567, 6046120.345, 112000.123 }
        };

        double[][] tgtPoints = {
            { -1648950.100, 6045810.300, 112320.500 },
            { -1649080.200, 6045878.400, 112175.600 },
            { -1649228.300, 6045988.500, 112075.700 },
            { -1649358.400, 6046098.600, 111975.800 }
        };

        // Matriks bobot: [stdX, stdY, stdZ] per titik
        double[][] bobot = {
            { 1.0, 1.0, 1.0 },
            { 1.0, 1.0, 1.0 },
            { 1.0, 1.0, 1.0 },
            { 1.0, 1.0, 1.0 }
        };

        // true  = Molodensky-Badekas (centroid dari srcPoints)
        // false = Helmert 7-parameter (Xm=Ym=Zm=0)
        TransformationResult result = compute(srcPoints, tgtPoints, bobot, true);
        System.out.println(result);
    }
}
