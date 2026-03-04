/**
 * Power Analysis
 * A priori sample size calculation and post-hoc observed power analysis
 * for common statistical tests used in psychological/behavioral research.
 */

export type TestType = 't-test' | 'anova' | 'chi-square' | 'correlation';

export interface PowerParams {
  /** Desired significance level (default 0.05) */
  alpha?: number;
  /** Desired power (default 0.80, used for a priori) */
  power?: number;
  /** Effect size (Cohen's d for t-test, f for ANOVA, w for chi-square, r for correlation) */
  effectSize: number;
}

export interface TTestPowerParams extends PowerParams {
  /** Number of groups: 1 for one-sample, 2 for two-sample */
  groups?: 1 | 2;
  /** Allocation ratio n2/n1 for two-sample tests (default 1) */
  allocationRatio?: number;
}

export interface AnovaPowerParams extends PowerParams {
  /** Number of groups */
  numGroups: number;
}

export interface ChiSquarePowerParams extends PowerParams {
  /** Degrees of freedom */
  df: number;
}

export interface SampleSizeResult {
  /** Required sample size per group */
  sampleSizePerGroup: number;
  /** Total required sample size */
  totalSampleSize: number;
  /** Actual power achieved at this sample size */
  achievedPower: number;
  /** Parameters used */
  params: {
    alpha: number;
    targetPower: number;
    effectSize: number;
    test: TestType;
  };
}

export interface ObservedPowerResult {
  /** Observed (post-hoc) power */
  power: number;
  /** Effect size used */
  effectSize: number;
  /** Parameters used */
  params: {
    alpha: number;
    sampleSize: number;
    test: TestType;
  };
}

export class PowerAnalysis {
  private static instance: PowerAnalysis;

  private constructor() {}

  static getInstance(): PowerAnalysis {
    if (!PowerAnalysis.instance) {
      PowerAnalysis.instance = new PowerAnalysis();
    }
    return PowerAnalysis.instance;
  }

  // ============================================================================
  // A Priori Sample Size Calculation
  // ============================================================================

  /**
   * A priori sample size for t-test (one-sample or two-sample independent).
   * Uses Cohen's d as effect size.
   */
  sampleSizeTTest(params: TTestPowerParams): SampleSizeResult {
    const alpha = params.alpha ?? 0.05;
    const targetPower = params.power ?? 0.80;
    const d = params.effectSize;
    const groups = params.groups ?? 2;
    const ratio = params.allocationRatio ?? 1;

    if (d <= 0) throw new Error('Effect size must be positive');
    if (alpha <= 0 || alpha >= 1) throw new Error('Alpha must be between 0 and 1');
    if (targetPower <= 0 || targetPower >= 1) throw new Error('Power must be between 0 and 1');

    const zAlpha = this.zInverse(1 - alpha / 2);
    const zBeta = this.zInverse(targetPower);

    let nPerGroup: number;

    if (groups === 1) {
      // One-sample: n = ((z_alpha + z_beta) / d)^2
      nPerGroup = Math.ceil(((zAlpha + zBeta) / d) ** 2);
    } else {
      // Two-sample independent: n1 = ((z_alpha + z_beta)^2 * (1 + 1/ratio)) / d^2
      nPerGroup = Math.ceil(((zAlpha + zBeta) ** 2 * (1 + 1 / ratio)) / (d ** 2));
    }

    nPerGroup = Math.max(nPerGroup, 2);
    const totalN = groups === 1 ? nPerGroup : nPerGroup + Math.ceil(nPerGroup * ratio);
    const achievedPower = this.observedPowerTTest(nPerGroup, d, alpha, groups);

    return {
      sampleSizePerGroup: nPerGroup,
      totalSampleSize: totalN,
      achievedPower,
      params: { alpha, targetPower, effectSize: d, test: 't-test' }
    };
  }

  /**
   * A priori sample size for one-way ANOVA.
   * Uses Cohen's f as effect size (small=0.10, medium=0.25, large=0.40).
   */
  sampleSizeANOVA(params: AnovaPowerParams): SampleSizeResult {
    const alpha = params.alpha ?? 0.05;
    const targetPower = params.power ?? 0.80;
    const f = params.effectSize;
    const k = params.numGroups;

    if (f <= 0) throw new Error('Effect size must be positive');
    if (k < 2) throw new Error('ANOVA requires at least 2 groups');

    // Use iterative approach: increase n until target power is reached
    let nPerGroup = 2;
    const maxN = 100000;

    while (nPerGroup < maxN) {
      const power = this.anovaPower(nPerGroup, k, f, alpha);
      if (power >= targetPower) {
        return {
          sampleSizePerGroup: nPerGroup,
          totalSampleSize: nPerGroup * k,
          achievedPower: power,
          params: { alpha, targetPower, effectSize: f, test: 'anova' }
        };
      }
      // Adaptive step size for faster convergence
      if (nPerGroup < 10) nPerGroup++;
      else if (nPerGroup < 100) nPerGroup += 2;
      else if (nPerGroup < 1000) nPerGroup += 10;
      else nPerGroup += 100;
    }

    // Didn't converge — return what we have
    return {
      sampleSizePerGroup: maxN,
      totalSampleSize: maxN * k,
      achievedPower: this.anovaPower(maxN, k, f, alpha),
      params: { alpha, targetPower, effectSize: f, test: 'anova' }
    };
  }

  /**
   * A priori sample size for chi-square test.
   * Uses Cohen's w as effect size (small=0.10, medium=0.30, large=0.50).
   */
  sampleSizeChiSquare(params: ChiSquarePowerParams): SampleSizeResult {
    const alpha = params.alpha ?? 0.05;
    const targetPower = params.power ?? 0.80;
    const w = params.effectSize;
    const df = params.df;

    if (w <= 0) throw new Error('Effect size must be positive');
    if (df < 1) throw new Error('Degrees of freedom must be >= 1');

    // For chi-square: n = ((z_alpha + z_beta) / w)^2 approximately
    // More precise: use non-central chi-square distribution
    let n = 2;
    const maxN = 100000;

    while (n < maxN) {
      const power = this.chiSquarePower(n, w, df, alpha);
      if (power >= targetPower) {
        return {
          sampleSizePerGroup: n,
          totalSampleSize: n,
          achievedPower: power,
          params: { alpha, targetPower, effectSize: w, test: 'chi-square' }
        };
      }
      if (n < 10) n++;
      else if (n < 100) n += 2;
      else if (n < 1000) n += 10;
      else n += 100;
    }

    return {
      sampleSizePerGroup: maxN,
      totalSampleSize: maxN,
      achievedPower: this.chiSquarePower(maxN, w, df, alpha),
      params: { alpha, targetPower, effectSize: w, test: 'chi-square' }
    };
  }

  /**
   * A priori sample size for correlation test (Pearson r).
   * Uses |r| as effect size (small=0.10, medium=0.30, large=0.50).
   */
  sampleSizeCorrelation(params: PowerParams): SampleSizeResult {
    const alpha = params.alpha ?? 0.05;
    const targetPower = params.power ?? 0.80;
    const r = params.effectSize;

    if (r <= 0 || r >= 1) throw new Error('Effect size (r) must be between 0 and 1');

    const zAlpha = this.zInverse(1 - alpha / 2);
    const zBeta = this.zInverse(targetPower);

    // Fisher z-transform: z_r = 0.5 * ln((1+r)/(1-r))
    const zr = 0.5 * Math.log((1 + r) / (1 - r));

    // n = ((z_alpha + z_beta) / z_r)^2 + 3
    const n = Math.ceil(((zAlpha + zBeta) / zr) ** 2 + 3);
    const achievedPower = this.correlationPower(n, r, alpha);

    return {
      sampleSizePerGroup: n,
      totalSampleSize: n,
      achievedPower,
      params: { alpha, targetPower, effectSize: r, test: 'correlation' }
    };
  }

  // ============================================================================
  // Post-Hoc Observed Power
  // ============================================================================

  /**
   * Post-hoc power for t-test given observed effect size and sample size.
   */
  postHocTTest(
    sampleSize: number,
    effectSize: number,
    alpha: number = 0.05,
    groups: 1 | 2 = 2
  ): ObservedPowerResult {
    const power = this.observedPowerTTest(sampleSize, effectSize, alpha, groups);
    return {
      power,
      effectSize,
      params: { alpha, sampleSize, test: 't-test' }
    };
  }

  /**
   * Post-hoc power for ANOVA.
   */
  postHocANOVA(
    sampleSizePerGroup: number,
    numGroups: number,
    effectSize: number,
    alpha: number = 0.05
  ): ObservedPowerResult {
    const power = this.anovaPower(sampleSizePerGroup, numGroups, effectSize, alpha);
    return {
      power,
      effectSize,
      params: { alpha, sampleSize: sampleSizePerGroup * numGroups, test: 'anova' }
    };
  }

  /**
   * Post-hoc power for chi-square test.
   */
  postHocChiSquare(
    sampleSize: number,
    effectSize: number,
    df: number,
    alpha: number = 0.05
  ): ObservedPowerResult {
    const power = this.chiSquarePower(sampleSize, effectSize, df, alpha);
    return {
      power,
      effectSize,
      params: { alpha, sampleSize, test: 'chi-square' }
    };
  }

  /**
   * Post-hoc power for correlation test.
   */
  postHocCorrelation(
    sampleSize: number,
    effectSize: number,
    alpha: number = 0.05
  ): ObservedPowerResult {
    const power = this.correlationPower(sampleSize, effectSize, alpha);
    return {
      power,
      effectSize,
      params: { alpha, sampleSize, test: 'correlation' }
    };
  }

  // ============================================================================
  // Effect Size Conventions (Cohen)
  // ============================================================================

  static readonly EFFECT_SIZES = {
    tTest: { small: 0.2, medium: 0.5, large: 0.8 },
    anova: { small: 0.1, medium: 0.25, large: 0.4 },
    chiSquare: { small: 0.1, medium: 0.3, large: 0.5 },
    correlation: { small: 0.1, medium: 0.3, large: 0.5 }
  } as const;

  // ============================================================================
  // Internal Power Calculations
  // ============================================================================

  private observedPowerTTest(
    n: number,
    d: number,
    alpha: number,
    groups: 1 | 2
  ): number {
    const zAlpha = this.zInverse(1 - alpha / 2);

    let ncp: number; // non-centrality parameter
    if (groups === 1) {
      ncp = d * Math.sqrt(n);
    } else {
      ncp = d * Math.sqrt(n / 2);
    }

    // Power = P(Z > z_alpha - ncp) + P(Z < -z_alpha - ncp)
    const power = 1 - this.normalCDF(zAlpha - ncp) + this.normalCDF(-zAlpha - ncp);
    return Math.max(0, Math.min(1, power));
  }

  private anovaPower(
    nPerGroup: number,
    k: number,
    f: number,
    alpha: number
  ): number {
    // Non-centrality parameter: lambda = n * k * f^2
    const lambda = nPerGroup * k * f * f;
    const dfNum = k - 1;
    const dfDen = k * (nPerGroup - 1);

    // Critical F value
    const fCrit = this.fInverse(1 - alpha, dfNum, dfDen);

    // Power = P(F > fCrit | F ~ F(dfNum, dfDen, lambda))
    // Approximate using shifted central F distribution
    const power = 1 - this.nonCentralFCDF(fCrit, dfNum, dfDen, lambda);
    return Math.max(0, Math.min(1, power));
  }

  private chiSquarePower(
    n: number,
    w: number,
    df: number,
    alpha: number
  ): number {
    // Non-centrality parameter: lambda = n * w^2
    const lambda = n * w * w;

    // Critical chi-square value
    const chiCrit = this.chiSquareInverse(1 - alpha, df);

    // Power = P(X > chiCrit | X ~ chi-square(df, lambda))
    // Approximate: shift the distribution
    const shiftedCrit = (chiCrit - df - lambda) / Math.sqrt(2 * (df + 2 * lambda));
    const power = 1 - this.normalCDF(shiftedCrit);
    return Math.max(0, Math.min(1, power));
  }

  private correlationPower(
    n: number,
    r: number,
    alpha: number
  ): number {
    const zAlpha = this.zInverse(1 - alpha / 2);
    const zr = 0.5 * Math.log((1 + r) / (1 - r));
    const se = 1 / Math.sqrt(n - 3);
    const ncp = zr / se;

    const power = 1 - this.normalCDF(zAlpha - ncp) + this.normalCDF(-zAlpha - ncp);
    return Math.max(0, Math.min(1, power));
  }

  // ============================================================================
  // Distribution Functions
  // ============================================================================

  private normalCDF(z: number): number {
    const sign = z >= 0 ? 1 : -1;
    const x = Math.abs(z) / Math.sqrt(2);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  private zInverse(p: number): number {
    // Beasley-Springer-Moro approximation
    if (p <= 0 || p >= 1) throw new Error('p must be between 0 and 1');

    const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [0, -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [0, 7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let x: number;

    if (p < pLow) {
      const q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[6]! * q + c[5]!) * q + c[4]!) * q + c[3]!) * q + c[2]!) * q + c[1]!) / ((((d[4]! * q + d[3]!) * q + d[2]!) * q + d[1]!) * q + 1);
    } else if (p <= pHigh) {
      const q = p - 0.5;
      const r = q * q;
      x = (((((a[6]! * r + a[5]!) * r + a[4]!) * r + a[3]!) * r + a[2]!) * r + a[1]!) * q / (((((b[5]! * r + b[4]!) * r + b[3]!) * r + b[2]!) * r + b[1]!) * r + 1);
    } else {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[6]! * q + c[5]!) * q + c[4]!) * q + c[3]!) * q + c[2]!) * q + c[1]!) / ((((d[4]! * q + d[3]!) * q + d[2]!) * q + d[1]!) * q + 1);
    }

    return x;
  }

  /**
   * Approximate non-central F CDF using Patnaik's two-moment approximation
   */
  private nonCentralFCDF(
    x: number,
    df1: number,
    df2: number,
    lambda: number
  ): number {
    // Patnaik approximation: approximate non-central F with central F
    // with adjusted degrees of freedom
    const mean = df2 * (df1 + lambda) / (df1 * (df2 - 2));
    const variance = 2 * df2 * df2 * ((df1 + lambda) ** 2 + (df1 + 2 * lambda) * (df2 - 2)) /
      (df1 * df1 * (df2 - 2) ** 2 * (df2 - 4));

    if (df2 <= 4 || variance <= 0) {
      // Fallback: rough normal approximation
      const z = (x - mean) / Math.sqrt(Math.max(variance, 0.001));
      return this.normalCDF(z);
    }

    // Match first two moments to central F(df1', df2')
    const df2Prime = 2 * mean * mean / (variance * (1 - 2 / df2) ** 2 + mean * mean * 2 / df2);
    const df1Prime = df2Prime * mean * (df2Prime - 2) / df2Prime || 1;

    // Use central F CDF
    return this.fCDF(x * df1Prime / df1 * (df1 + lambda) / df1Prime, Math.max(1, df1Prime), Math.max(3, df2Prime));
  }

  /**
   * Central F CDF via incomplete beta function
   */
  private fCDF(f: number, df1: number, df2: number): number {
    if (f <= 0) return 0;
    const x = df2 / (df2 + df1 * f);
    return 1 - this.betaIncomplete(df2 / 2, df1 / 2, x);
  }

  /**
   * Approximate inverse F distribution via bisection
   */
  private fInverse(p: number, df1: number, df2: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;

    let lo = 0;
    let hi = 100;
    // Expand upper bound if needed
    while (this.fCDF(hi, df1, df2) < p) hi *= 2;

    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (this.fCDF(mid, df1, df2) < p) {
        lo = mid;
      } else {
        hi = mid;
      }
      if (hi - lo < 1e-8) break;
    }
    return (lo + hi) / 2;
  }

  /**
   * Approximate inverse chi-square via bisection
   */
  private chiSquareInverse(p: number, df: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;

    let lo = 0;
    let hi = Math.max(df * 4, 100);
    while (this.chiSquareCDF(hi, df) < p) hi *= 2;

    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (this.chiSquareCDF(mid, df) < p) {
        lo = mid;
      } else {
        hi = mid;
      }
      if (hi - lo < 1e-8) break;
    }
    return (lo + hi) / 2;
  }

  private chiSquareCDF(x: number, df: number): number {
    if (x <= 0) return 0;
    return this.regularizedGammaP(df / 2, x / 2);
  }

  private betaIncomplete(a: number, b: number, x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betaCF(a, b, x) / a;
    } else {
      return 1 - bt * this.betaCF(b, a, 1 - x) / b;
    }
  }

  private betaCF(a: number, b: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  private regularizedGammaP(a: number, x: number): number {
    if (x <= 0) return 0;
    if (x < a + 1) {
      return this.gammaPSeries(a, x);
    } else {
      return 1 - this.gammaQCF(a, x);
    }
  }

  private gammaPSeries(a: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < maxIter; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < eps * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  private gammaQCF(a: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= maxIter; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  private logGamma(z: number): number {
    const g = 7;
    const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);
    }
    z -= 1;
    let x = C[0]!;
    for (let i = 1; i < g + 2; i++) {
      x += C[i]! / (z + i);
    }
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
}
