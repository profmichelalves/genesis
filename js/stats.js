/* Genesis — helpers numéricos e distribuições de probabilidade.
   Implementações seguem Numerical Recipes (betacf/betai, gser/gcf) e
   aproximações clássicas (Lanczos para lgamma, A&S 7.1.26 para erf). */
(function () {
  'use strict';
  const S = {};

  /* ---------- estatística básica (ignora NaN) ---------- */
  S.mean = function (a) {
    let s = 0, c = 0;
    for (let i = 0; i < a.length; i++) if (isFinite(a[i])) { s += a[i]; c++; }
    return c ? s / c : NaN;
  };

  S.variance = function (a, ddof) {
    ddof = ddof === undefined ? 1 : ddof;
    const m = S.mean(a);
    let s = 0, c = 0;
    for (let i = 0; i < a.length; i++) if (isFinite(a[i])) { s += (a[i] - m) * (a[i] - m); c++; }
    const n = c - ddof;
    return n > 0 ? s / n : 0;
  };

  S.sd = function (a) { return Math.sqrt(S.variance(a, 1)); };

  S.sum = function (a) { let s = 0; for (let i = 0; i < a.length; i++) if (isFinite(a[i])) s += a[i]; return s; };

  S.median = function (a) {
    const b = a.filter((x) => isFinite(x)).sort((x, y) => x - y);
    const n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  };

  S.quantile = function (a, q) {
    const b = a.filter((x) => isFinite(x)).sort((x, y) => x - y);
    if (!b.length) return NaN;
    const pos = (b.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return b[base + 1] !== undefined ? b[base] + rest * (b[base + 1] - b[base]) : b[base];
  };

  S.scale = function (a) {
    const m = S.mean(a);
    const s = S.sd(a);
    if (!isFinite(s) || s === 0) return a.map(() => 0);
    return a.map((x) => (x - m) / s);
  };

  S.log2 = function (x) { return Math.log(x) / Math.LN2; };

  /* ---------- lgamma (Lanczos, g=7) ---------- */
  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  S.lgamma = function (z) {
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - S.lgamma(1 - z);
    }
    z -= 1;
    let a = LANCZOS[0];
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
  };

  /* ---------- beta incompleta regularizada I_x(a,b) ---------- */
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  S.betai = function (a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      S.lgamma(a + b) - S.lgamma(a) - S.lgamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  };

  /* ---------- gamma incompleta regularizada P(a,x) ---------- */
  function gser(a, x) {
    const ITMAX = 400, EPS = 3e-14;
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n <= ITMAX; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - S.lgamma(a));
  }
  function gcf(a, x) {
    const ITMAX = 400, EPS = 3e-14, FPMIN = 1e-300;
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i <= ITMAX; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return Math.exp(-x + a * Math.log(x) - S.lgamma(a)) * h;
  }
  S.gammp = function (a, x) {
    if (x < 0) return NaN;
    if (x === 0) return 0;
    if (x < a + 1) return gser(a, x);
    return 1 - gcf(a, x);
  };

  /* ---------- CDFs ---------- */
  S.tCDF = function (t, df) {
    const x = df / (df + t * t);
    return t >= 0 ? 1 - 0.5 * S.betai(df / 2, 0.5, x) : 0.5 * S.betai(df / 2, 0.5, x);
  };
  S.twoSidedTP = function (t, df) {
    return 2 * (1 - S.tCDF(Math.abs(t), df));
  };
  S.chi2CDF = function (x, df) { return S.gammp(df / 2, x / 2); };
  S.chi2P = function (x, df) { return 1 - S.chi2CDF(x, df); };

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - (
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    ) * Math.exp(-ax * ax);
    return sign * y;
  }
  S.erf = erf;
  S.normalCDF = function (x) { return 0.5 * (1 + erf(x / Math.SQRT2)); };
  S.normalP2 = function (z) { return 2 * (1 - S.normalCDF(Math.abs(z))); };

  /* ---------- trigamma (poli-gamma de ordem 1) ---------- */
  S.trigamma = function (x) {
    let v = 0, z = x;
    while (z < 7) { v += 1 / (z * z); z += 1; }
    const z2 = z * z;
    return v + 1 / z + 1 / (2 * z2) + 1 / (6 * z2 * z) - 1 / (30 * z2 * z2 * z) +
      1 / (42 * z2 * z2 * z2 * z) - 1 / (30 * z2 * z2 * z2 * z2 * z);
  };

  /* ---------- FDR (Benjamini–Hochberg) ---------- */
  S.bhFdr = function (pvals) {
    const n = pvals.length;
    if (n === 0) return [];
    const order = pvals.map((p, i) => i).sort((a, b) => pvals[a] - pvals[b]);
    const q = new Array(n);
    let prev = 1;
    for (let k = n; k >= 1; k--) {
      const i = order[k - 1];
      const val = Math.min(1, (pvals[i] * n) / k);
      prev = Math.min(prev, val);
      q[i] = prev;
    }
    return q;
  };

  /* ---------- log-sum-exp (estabilidade numérica) ---------- */
  S.logSumExp = function (a) {
    const m = Math.max.apply(null, a);
    if (!isFinite(m)) return -Infinity;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.exp(a[i] - m);
    return m + Math.log(s);
  };

  /* formatação de p-valor no estilo do R (survminer/format.pval) */
  S.fmtP = function (p) {
    if (!isFinite(p)) return 'p = NA';
    if (p < 0.0001) return 'p < 0.0001';
    return 'p = ' + parseFloat(p.toPrecision(3));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else window.TALL = window.TALL || {}, window.TALL.stats = S;
})();
