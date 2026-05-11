package geodesi.transformasi;

/**
 * =========================================================================
 *   TRANSFORMASI KOORDINAT 7 PARAMETER (HELMERT / MOLODENSKY-BADEKAS)
 *   Menggunakan matriks rotasi penuh: R = Rx * Ry * Rz
 *
 *   Formula:
 *     tgtPoint = (srcPoint - centroid) * R^T * S + centroid + T
 *
 *   - Molodensky-Badekas : isi Xm, Ym, Zm dengan centroid titik sumber
 *   - Helmert 7-param    : set Xm = Ym = Zm = 0
 *
 *   Capstone Project - Sistem Informasi Transformasi Datum
 *   Teknik Geodesi dan Geomatika
 * =========================================================================
 */
public class HelmertTransformation {

    // =========================================================================
    //   PARAMETER TRANSFORMASI (nilai sesuai hasil estimasi)
    // =========================================================================
    private static final double DX =  -21.1984221457327;
    private static final double DY =  -28.4072906614705;
    private static final double DZ =    4.64619397366998;
    private static final double S  =    0.999990508941089;   // faktor skala
    private static final double RX =   -8.00977843966573e-05; // radian
    private static final double RY =   -1.17216208732351e-05;
    private static final double RZ =    8.56025959727141e-06;

    // Centroid (Molodensky-Badekas). Set ke 0 untuk Helmert murni.
    private static final double XM =  -1249136.39553482;
    private static final double YM =   6254162.39016529;
    private static final double ZM =     79114.4555370181;

    // =========================================================================
    //   KELAS HASIL
    // =========================================================================
    public static class TransformResult {
        public final double[][] srcPoints;   // koordinat input
        public final double[][] tgtPoints;   // koordinat referensi (dari Excel)
        public final double[][] transformed; // hasil transformasi
        public final double[][] residuals;   // |transformed - tgtPoints|

        public TransformResult(double[][] src, double[][] tgt,
                               double[][] transformed, double[][] residuals) {
            this.srcPoints   = src;
            this.tgtPoints   = tgt;
            this.transformed = transformed;
            this.residuals   = residuals;
        }
    }

    // =========================================================================
    //   METODE UTAMA
    // =========================================================================

    /**
     * Lakukan transformasi pada semua titik sumber.
     *
     * @param srcPoints  koordinat sumber [N][3]  {X, Y, Z}  meter
     * @param tgtPoints  koordinat target [N][3]  {X, Y, Z}  meter (untuk hitung residu)
     * @return TransformResult
     */
    public static TransformResult transform(double[][] srcPoints, double[][] tgtPoints) {
        return transform(srcPoints, tgtPoints, DX, DY, DZ, S, RX, RY, RZ, XM, YM, ZM);
    }

    /**
     * Overload: parameter transformasi dan centroid diisi secara eksplisit.
     * Berguna saat parameter diperoleh dari hasil estimasi (DatumTransformation7Param).
     *
     * @param srcPoints koordinat sumber [N][3]
     * @param tgtPoints koordinat target [N][3]
     * @param dx, dy, dz  translasi (m)
     * @param s           faktor skala
     * @param rx, ry, rz  rotasi (radian)
     * @param xm, ym, zm  centroid / titik pivot (0 untuk Helmert)
     */
    public static TransformResult transform(double[][] srcPoints, double[][] tgtPoints,
                                             double dx, double dy, double dz,
                                             double s,
                                             double rx, double ry, double rz,
                                             double xm, double ym, double zm) {
        int nPts = srcPoints.length;

        // -----------------------------------------------------------------------
        // 1. MATRIKS ROTASI PENUH: R = Rx * Ry * Rz
        // -----------------------------------------------------------------------
        double[][] Rx = {
            { 1,           0,          0       },
            { 0,  Math.cos(rx),  Math.sin(rx)  },
            { 0, -Math.sin(rx),  Math.cos(rx)  }
        };
        double[][] Ry = {
            {  Math.cos(ry), 0, -Math.sin(ry) },
            {  0,            1,  0            },
            {  Math.sin(ry), 0,  Math.cos(ry) }
        };
        double[][] Rz = {
            {  Math.cos(rz), Math.sin(rz), 0 },
            { -Math.sin(rz), Math.cos(rz), 0 },
            {  0,            0,            1 }
        };

        double[][] R    = multiply(multiply(Rx, Ry), Rz);
        // Catatan: formula Molodensky-Badekas: X_tgt = T + s*R*(X_src - Xp) + Xp
        // Gunakan R langsung (bukan transpose), sesuai konvensi rotasi aktif.

        // -----------------------------------------------------------------------
        // 2. VEKTOR TRANSLASI DAN CENTROID
        // -----------------------------------------------------------------------
        double[] T        = { dx, dy, dz };
        double[] centroid = { xm, ym, zm };

        // -----------------------------------------------------------------------
        // 3. TRANSFORMASI SETIAP TITIK
        //    tgtPoint = (src - centroid) * R^T * S + centroid + T
        //
        //    Catatan: dalam MATLAB ekspresi (src - centroid) * R^T
        //    menggunakan vektor baris. Di Java kita pakai vektor kolom,
        //    sehingga ekuivalen: R * (src - centroid)^T kemudian transpose.
        //    Namun karena R orthogonal: (v * R^T)^T = R * v^T
        //    Kita terapkan: result = R * (src - centroid) * S + centroid + T
        //    yang identik secara numerik.
        // -----------------------------------------------------------------------
        double[][] transformed = new double[nPts][3];
        double[][] residuals   = new double[nPts][3];

        for (int i = 0; i < nPts; i++) {
            // (a) Geser ke centroid
            double[] dVec = subtract(srcPoints[i], centroid);

            // (b) Rotasi: R * dVec  (formula Molodensky-Badekas: R*(src-pivot))
            double[] rotated = multiplyMV(R, dVec);

            // (c) Terapkan skala
            double[] scaled = scale(rotated, s);

            // (d) Kembalikan ke sistem asli + tambah translasi
            double[] result = add(add(scaled, centroid), T);
            transformed[i] = result;

            // (e) Residu = |transformed - target|
            if (tgtPoints != null && i < tgtPoints.length) {
                residuals[i][0] = Math.abs(transformed[i][0] - tgtPoints[i][0]);
                residuals[i][1] = Math.abs(transformed[i][1] - tgtPoints[i][1]);
                residuals[i][2] = Math.abs(transformed[i][2] - tgtPoints[i][2]);
            }
        }

        return new TransformResult(srcPoints, tgtPoints, transformed, residuals);
    }

    // =========================================================================
    //   CETAK HASIL
    // =========================================================================
    public static void printResults(TransformResult r) {
        int nPts = r.srcPoints.length;

        System.out.println("=================================================================");
        System.out.println("  HASIL TRANSFORMASI HELMERT / MOLODENSKY-BADEKAS 7 PARAMETER");
        System.out.println("  R = Rx * Ry * Rz  (rotasi penuh)");
        System.out.println("=================================================================\n");

        System.out.println("--- Parameter Transformasi ---");
        System.out.printf("  dx = %.13f  m%n",  DX);
        System.out.printf("  dy = %.13f  m%n",  DY);
        System.out.printf("  dz = %.13f  m%n",  DZ);
        System.out.printf("  s  = %.15f%n",     S);
        System.out.printf("  rx = %.15e  rad%n", RX);
        System.out.printf("  ry = %.15e  rad%n", RY);
        System.out.printf("  rz = %.15e  rad%n", RZ);
        System.out.printf("  Xm = %.8f  m%n",   XM);
        System.out.printf("  Ym = %.8f  m%n",   YM);
        System.out.printf("  Zm = %.8f  m%n%n", ZM);

        System.out.println("--- Titik Sumber (X, Y, Z)  [meter] ---");
        System.out.printf("  %-4s %-22s %-22s %-22s%n", "No", "X_src", "Y_src", "Z_src");
        for (int i = 0; i < nPts; i++)
            System.out.printf("  %-4d %-22.4f %-22.4f %-22.4f%n",
                i+1, r.srcPoints[i][0], r.srcPoints[i][1], r.srcPoints[i][2]);

        System.out.println("\n--- Titik Hasil Transformasi (X, Y, Z)  [meter] ---");
        System.out.printf("  %-4s %-22s %-22s %-22s%n", "No", "X_result", "Y_result", "Z_result");
        for (int i = 0; i < nPts; i++)
            System.out.printf("  %-4d %-22.4f %-22.4f %-22.4f%n",
                i+1, r.transformed[i][0], r.transformed[i][1], r.transformed[i][2]);

        if (r.tgtPoints != null) {
            System.out.println("\n--- Titik Target Referensi (X, Y, Z)  [meter] ---");
            System.out.printf("  %-4s %-22s %-22s %-22s%n", "No", "X_tgt", "Y_tgt", "Z_tgt");
            for (int i = 0; i < nPts; i++)
                System.out.printf("  %-4d %-22.4f %-22.4f %-22.4f%n",
                    i+1, r.tgtPoints[i][0], r.tgtPoints[i][1], r.tgtPoints[i][2]);

            System.out.println("\n--- Residu |Hasil - Target|  [meter] ---");
            System.out.printf("  %-4s %-22s %-22s %-22s%n", "No", "|dX|", "|dY|", "|dZ|");
            for (int i = 0; i < nPts; i++)
                System.out.printf("  %-4d %-22.6f %-22.6f %-22.6f%n",
                    i+1, r.residuals[i][0], r.residuals[i][1], r.residuals[i][2]);
        }

        System.out.println("\n=================================================================");
    }

    // =========================================================================
    //   HELPER: OPERASI VEKTOR & MATRIKS
    // =========================================================================

    /** Perkalian matriks 3×3 */
    private static double[][] multiply(double[][] A, double[][] B) {
        double[][] C = new double[3][3];
        for (int i = 0; i < 3; i++)
            for (int j = 0; j < 3; j++)
                for (int k = 0; k < 3; k++)
                    C[i][j] += A[i][k] * B[k][j];
        return C;
    }

    /** Transpose matriks 3×3 */
    private static double[][] transpose(double[][] M) {
        return new double[][] {
            { M[0][0], M[1][0], M[2][0] },
            { M[0][1], M[1][1], M[2][1] },
            { M[0][2], M[1][2], M[2][2] }
        };
    }

    /** y = M * x  (3×3 × 3) */
    private static double[] multiplyMV(double[][] M, double[] x) {
        return new double[]{
            M[0][0]*x[0] + M[0][1]*x[1] + M[0][2]*x[2],
            M[1][0]*x[0] + M[1][1]*x[1] + M[1][2]*x[2],
            M[2][0]*x[0] + M[2][1]*x[1] + M[2][2]*x[2]
        };
    }

    /** v = a - b */
    private static double[] subtract(double[] a, double[] b) {
        return new double[]{ a[0]-b[0], a[1]-b[1], a[2]-b[2] };
    }

    /** v = a + b */
    private static double[] add(double[] a, double[] b) {
        return new double[]{ a[0]+b[0], a[1]+b[1], a[2]+b[2] };
    }

    /** v = scalar * a */
    private static double[] scale(double[] a, double scalar) {
        return new double[]{ scalar*a[0], scalar*a[1], scalar*a[2] };
    }

    // =========================================================================
    //   MAIN: contoh penggunaan
    // =========================================================================
    public static void main(String[] args) {

        // Ganti dengan data aktual dari Excel Anda (Range B1:D9 dan E1:G9)
        double[][] srcPoints = {
            { -1249136.395, 6254162.390,  79114.456 },
            { -1249200.123, 6254100.456,  79050.789 },
            { -1249050.456, 6254050.789,  79200.123 },
            { -1249300.789, 6254200.123,  79000.456 },
            { -1249100.012, 6254300.456,  79100.789 },
            { -1249250.345, 6254250.789,  79150.012 },
            { -1249080.678, 6254180.012,  79080.345 },
            { -1249180.901, 6254080.345,  79180.678 },
            { -1249220.234, 6254220.678,  79220.901 }
        };

        double[][] tgtPoints = {
            { -1249157.593, 6254134.983,  79119.102 },
            { -1249221.320, 6254072.038,  79055.436 },
            { -1249071.653, 6254022.369,  79204.770 },
            { -1249321.987, 6254171.703,  79005.103 },
            { -1249121.209, 6254271.036,  79105.436 },
            { -1249271.542, 6254221.369,  79155.769 },
            { -1249101.875, 6254151.602,  79085.092 },
            { -1249202.108, 6254051.935,  79185.425 },
            { -1249241.441, 6254191.268,  79225.758 }
        };

        TransformResult result = transform(srcPoints, tgtPoints);
        printResults(result);
    }
}
