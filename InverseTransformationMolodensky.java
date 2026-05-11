package geodesi.transformasi;

/**
 * =========================================================================
 *   TRANSFORMASI KOORDINAT 7 PARAMETER (MOLODENSKY-BADEKAS): ID74 <-> WGS84
 *
 *   Formula:
 *     X_target = T + (1 + m) * R * (X_src - Xp) + Xp
 *
 *   Capstone Project - Sistem Informasi Transformasi Datum
 *   Teknik Geodesi dan Geomatika
 * =========================================================================
 */
public class MolodenskyBadekas {

    // =========================================================================
    //   PARAMETER TRANSFORMASI MAJU  (ID74 --> WGS84)
    // =========================================================================
    private static final double DX_FWD   = -21.1984221457327;
    private static final double DY_FWD   = -28.4072906614705;
    private static final double DZ_FWD   =   4.64619397366998;
    private static final double RX_SEC_FWD = -0.0000800977843966573;  // radian
    private static final double RY_SEC_FWD = -0.0000117216208732351;  // radian
    private static final double RZ_SEC_FWD =  0.00000856025959727141; // radian
    private static final double M_PPM_FWD  =  0.999990508941089;      // faktor skala penuh (bukan ppm)

    // =========================================================================
    //   PARAMETER TRANSFORMASI BALIK  (WGS84 --> ID74)
    // =========================================================================
    private static final double DX_INV   =  21.1984213025931;
    private static final double DY_INV   =  28.4072905075436;
    private static final double DZ_INV   =  -4.6461937321203;
    private static final double RX_SEC_INV =  0.0000800997584898269;   // radian
    private static final double RY_SEC_INV =  0.000011722237154875;    // radian
    private static final double RZ_SEC_INV = -0.00000856076405416893;  // radian
    private static final double M_PPM_INV  =  1.00000948897926;        // faktor skala penuh (bukan ppm)


    // =========================================================================
    //   KELAS HASIL
    // =========================================================================
    public static class TransformResult {
        public final double[][] srcPoints;     // ID74
        public final double[][] tgtPoints;     // WGS84 (hasil maju)
        public final double[][] backPoints;    // kembali ke ID74 (hasil balik)
        public final double[][] residuals;     // srcPoints - backPoints
        public final double[]   res3D;         // jarak residu 3D per titik
        public final double[]   pivotFwd;      // centroid ID74  [Xp, Yp, Zp]
        public final double[]   pivotInv;      // centroid WGS84 [Xp, Yp, Zp]

        public TransformResult(double[][] src, double[][] tgt, double[][] back,
                               double[][] res, double[] res3D,
                               double[] pivotFwd, double[] pivotInv) {
            this.srcPoints  = src;
            this.tgtPoints  = tgt;
            this.backPoints = back;
            this.residuals  = res;
            this.res3D      = res3D;
            this.pivotFwd   = pivotFwd;
            this.pivotInv   = pivotInv;
        }
    }

    // =========================================================================
    //   METODE UTAMA
    // =========================================================================

    /**
     * Jalankan transformasi maju (ID74 -> WGS84) dan balik (WGS84 -> ID74).
     *
     * @param srcPoints  koordinat ID74  [N][3]  {X, Y, Z}  meter
     * @return TransformResult berisi semua hasil dan statistik
     */
    public static TransformResult transform(double[][] srcPoints) {
        int nPts = srcPoints.length;

        // -----------------------------------------------------------------------
        // 2. TITIK PIVOT MAJU = centroid ID74 dari proses estimasi parameter
        //    (fixed — bukan dihitung dari srcPoints, agar valid untuk titik baru)
        // -----------------------------------------------------------------------
        double[] pivotFwd = { -1249136.39553482, 6254162.39016529, 79114.45553701810 };

        // -----------------------------------------------------------------------
        // 4. PARAMETER SUDAH dalam radian dan faktor skala penuh — tidak perlu konversi
        //    rX/rY/rZ: dalam radian (bukan arcsecond)
        //    M_FWD/M_INV: faktor skala penuh (bukan ppm), gunakan langsung
        // -----------------------------------------------------------------------
        double rxFwd = RX_SEC_FWD;   // sudah radian
        double ryFwd = RY_SEC_FWD;
        double rzFwd = RZ_SEC_FWD;
        double mFwd  = M_PPM_FWD;    // faktor skala penuh, bukan delta ppm

        double rxInv = RX_SEC_INV;
        double ryInv = RY_SEC_INV;
        double rzInv = RZ_SEC_INV;
        double mInv  = M_PPM_INV;

        // -----------------------------------------------------------------------
        // 5. MATRIKS ROTASI (small-angle approximation)
        // -----------------------------------------------------------------------
        double[][] Rfwd = buildRotation(rxFwd, ryFwd, rzFwd);
        double[]   Tfwd = { DX_FWD, DY_FWD, DZ_FWD };

        double[][] Rinv = buildRotation(rxInv, ryInv, rzInv);
        double[]   Tinv = { DX_INV, DY_INV, DZ_INV };

        // -----------------------------------------------------------------------
        // 6. TRANSFORMASI MAJU: ID74 --> WGS84
        //    X_wgs = T + (1 + m) * R * (X_id74 - Xp) + Xp
        // -----------------------------------------------------------------------
        double[][] tgtPoints = new double[nPts][3];
        for (int i = 0; i < nPts; i++) {
            double[] dX = subtract(srcPoints[i], pivotFwd);
            double[] Rd = multiplyMV(Rfwd, dX);
            double[] scaled = scale(Rd, mFwd);  // mFwd = faktor skala penuh
            double[] result = add(add(Tfwd, scaled), pivotFwd);
            tgtPoints[i] = result;
        }

        // -----------------------------------------------------------------------
        // 7. TRANSFORMASI BALIK: WGS84 --> ID74
        //    Pivot balik = centroid WGS84 (dari parameter P_INV)
        // -----------------------------------------------------------------------
        double[] pivotInv = { -1249157.59308889, 6254133.98235556, 79119.09972222220 };

        double[][] backPoints = new double[nPts][3];
        for (int i = 0; i < nPts; i++) {
            double[] dX = subtract(tgtPoints[i], pivotInv);
            double[] Rd = multiplyMV(Rinv, dX);
            double[] scaled = scale(Rd, mInv);  // mInv = faktor skala penuh
            double[] result = add(add(Tinv, scaled), pivotInv);
            backPoints[i] = result;
        }

        // -----------------------------------------------------------------------
        // 8. RESIDU
        // -----------------------------------------------------------------------
        double[][] residuals = new double[nPts][3];
        double[]   res3D     = new double[nPts];
        for (int i = 0; i < nPts; i++) {
            residuals[i][0] = srcPoints[i][0] - backPoints[i][0];
            residuals[i][1] = srcPoints[i][1] - backPoints[i][1];
            residuals[i][2] = srcPoints[i][2] - backPoints[i][2];
            res3D[i] = Math.sqrt(
                residuals[i][0]*residuals[i][0] +
                residuals[i][1]*residuals[i][1] +
                residuals[i][2]*residuals[i][2]
            );
        }

        return new TransformResult(srcPoints, tgtPoints, backPoints,
                                   residuals, res3D, pivotFwd, pivotInv);
    }

    // =========================================================================
    //   CETAK HASIL (mirip fprintf MATLAB)
    // =========================================================================
    public static void printResults(TransformResult r) {
        int nPts = r.srcPoints.length;

        System.out.printf("Titik Pivot (centroid ID74):%n");
        System.out.printf("  Xp = %.4f m%n", r.pivotFwd[0]);
        System.out.printf("  Yp = %.4f m%n", r.pivotFwd[1]);
        System.out.printf("  Zp = %.4f m%n%n", r.pivotFwd[2]);

        System.out.println("=================================================================");
        System.out.println("  HASIL TRANSFORMASI MOLODENSKY-BADEKAS 7 PARAMETER");
        System.out.println("  ID74  <-->  WGS84");
        System.out.println("=================================================================\n");

        System.out.printf("--- Titik Pivot ---%n");
        System.out.printf("  Pivot Maju  (centroid ID74)  : [%.3f, %.3f, %.3f] m%n",
            r.pivotFwd[0], r.pivotFwd[1], r.pivotFwd[2]);
        System.out.printf("  Pivot Balik (centroid WGS84) : [%.3f, %.3f, %.3f] m%n%n",
            r.pivotInv[0], r.pivotInv[1], r.pivotInv[2]);

        System.out.println("--- Parameter Transformasi MAJU (ID74 --> WGS84) ---");
        System.out.printf("  dX = %15.9f  m%n",  DX_FWD);
        System.out.printf("  dY = %15.9f  m%n",  DY_FWD);
        System.out.printf("  dZ = %15.9f  m%n",  DZ_FWD);
        System.out.printf("  Rx = %20.16f  det%n", RX_SEC_FWD);
        System.out.printf("  Ry = %20.16f  det%n", RY_SEC_FWD);
        System.out.printf("  Rz = %20.16f  det%n", RZ_SEC_FWD);
        System.out.printf("  m  = %15.9f  ppm%n%n", M_PPM_FWD);

        System.out.println("--- Parameter Transformasi BALIK (WGS84 --> ID74) ---");
        System.out.printf("  dX = %15.9f  m%n",  DX_INV);
        System.out.printf("  dY = %15.9f  m%n",  DY_INV);
        System.out.printf("  dZ = %15.9f  m%n",  DZ_INV);
        System.out.printf("  Rx = %20.16f  det%n", RX_SEC_INV);
        System.out.printf("  Ry = %20.16f  det%n", RY_SEC_INV);
        System.out.printf("  Rz = %20.16f  det%n", RZ_SEC_INV);
        System.out.printf("  m  = %15.9f  ppm%n%n", M_PPM_INV);

        System.out.println("--- Titik Sumber ID74 (X, Y, Z)  [meter] ---");
        System.out.printf("  %-4s %-18s %-18s %-18s%n", "No","X_src","Y_src","Z_src");
        for (int i = 0; i < nPts; i++)
            System.out.printf("  %-4d %-18.4f %-18.4f %-18.4f%n",
                i+1, r.srcPoints[i][0], r.srcPoints[i][1], r.srcPoints[i][2]);

        System.out.println("\n--- Titik Target WGS84 (X, Y, Z)  [meter] ---");
        System.out.printf("  %-4s %-18s %-18s %-18s%n", "No","X_wgs","Y_wgs","Z_wgs");
        for (int i = 0; i < nPts; i++)
            System.out.printf("  %-4d %-18.4f %-18.4f %-18.4f%n",
                i+1, r.tgtPoints[i][0], r.tgtPoints[i][1], r.tgtPoints[i][2]);

        System.out.println("\n--- Titik Transformasi Balik ke ID74 (X, Y, Z)  [meter] ---");
        System.out.printf("  %-4s %-18s %-18s %-18s%n", "No","X_back","Y_back","Z_back");
        for (int i = 0; i < nPts; i++)
            System.out.printf("  %-4d %-18.4f %-18.4f %-18.4f%n",
                i+1, r.backPoints[i][0], r.backPoints[i][1], r.backPoints[i][2]);

        System.out.println("\n--- Residu (ID74_awal - Transformasi_Balik)  [meter] ---");
        System.out.printf("  %-4s %-18s %-18s %-18s %-18s%n",
            "No","dX","dY","dZ","|d| (3D)");
        for (int i = 0; i < nPts; i++)
            System.out.printf("  %-4d %-18.6f %-18.6f %-18.6f %-18.6f%n",
                i+1, r.residuals[i][0], r.residuals[i][1],
                     r.residuals[i][2], r.res3D[i]);

        double maxRes = 0, minRes = Double.MAX_VALUE, sumRes = 0, sumSq = 0;
        for (double v : r.res3D) {
            if (v > maxRes) maxRes = v;
            if (v < minRes) minRes = v;
            sumRes += v;
            sumSq  += v * v;
        }
        double meanRes = sumRes / nPts;
        double rmse    = Math.sqrt(sumSq / nPts);

        System.out.println("\n--- Statistik Residu ---");
        System.out.printf("  Residu 3D maks  : %.6f  m%n", maxRes);
        System.out.printf("  Residu 3D min   : %.6f  m%n", minRes);
        System.out.printf("  Residu 3D rata2 : %.6f  m%n", meanRes);
        System.out.printf("  RMSE (3D)       : %.6f  m%n%n", rmse);
    }

    // =========================================================================
    //   HELPER: VEKTOR & MATRIKS
    // =========================================================================

    /** Matriks rotasi small-angle 3×3 — Coordinate Frame convention (sesuai parameter) */
    private static double[][] buildRotation(double rx, double ry, double rz) {
        return new double[][] {
            {  1.0, -rz,  ry },
            {  rz,   1.0, -rx },
            { -ry,   rx,   1.0 }
        };
    }

    /** Centroid kolom [X, Y, Z] */
    private static double[] centroid(double[][] pts) {
        double sx = 0, sy = 0, sz = 0;
        for (double[] p : pts) { sx += p[0]; sy += p[1]; sz += p[2]; }
        int n = pts.length;
        return new double[]{ sx/n, sy/n, sz/n };
    }

    /** v = a - b */
    private static double[] subtract(double[] a, double[] b) {
        return new double[]{ a[0]-b[0], a[1]-b[1], a[2]-b[2] };
    }

    /** v = a + b */
    private static double[] add(double[] a, double[] b) {
        return new double[]{ a[0]+b[0], a[1]+b[1], a[2]+b[2] };
    }

    /** v = s * a */
    private static double[] scale(double[] a, double s) {
        return new double[]{ s*a[0], s*a[1], s*a[2] };
    }

    /** y = M * x  (3×3 × 3) */
    private static double[] multiplyMV(double[][] M, double[] x) {
        return new double[]{
            M[0][0]*x[0] + M[0][1]*x[1] + M[0][2]*x[2],
            M[1][0]*x[0] + M[1][1]*x[1] + M[1][2]*x[2],
            M[2][0]*x[0] + M[2][1]*x[1] + M[2][2]*x[2]
        };
    }

    // =========================================================================
    //   MAIN: contoh penggunaan
    // =========================================================================
    public static void main(String[] args) {

        // Ganti dengan koordinat ID74 aktual dari file Excel Anda
        double[][] srcPoints = {
            { -1648971.234, 6045832.567, 112345.678 },
            { -1649102.345, 6045900.123, 112200.456 },
            { -1649250.456, 6046010.789, 112100.234 },
            { -1649380.567, 6046120.345, 112000.123 }
        };

        TransformResult result = transform(srcPoints);
        printResults(result);
    }
}
