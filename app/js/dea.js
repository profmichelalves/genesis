/* TARGET ALL Explorer — Expressão diferencial (estilo-limma) em JS.
   Para cada gene: β = diferença de médias entre grupos, variância agrupada (df = n-2),
   depois moderação bayesiana empírica (Smyth, 2004): estima-se d0 (graus de liberdade
   do prior) resolvendo var(log(s2)) = trigamma(df/2) + trigamma(d0/2) por bisseção,
   com s02 = média das variâncias observadas. t moderado tem df+d0. FDR BH ao final. */
(function () {
  'use strict';
  const st = (typeof module !== 'undefined' && module.exports)
    ? require('./stats.js') : window.TALL.stats;

  const D = {};

  function bisection(func, lo, hi, maxIter, tol) {
    let fLo = func(lo);
    for (let it = 0; it < maxIter; it++) {
      const mid = (lo + hi) / 2;
      const fMid = func(mid);
      if (Math.abs(fMid) < tol || (hi - lo) / 2 < tol) return mid;
      if (fLo * fMid < 0) { hi = mid; } else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
  }

  /* Estima d0 do prior: assume s2_i ~ s02 * χ²(df)/df * (1/F(d0/...)). Método dos momentos
     sobre var(log(s2)) — aproximação próxima do squeezeVar do limma. */
  function estimatePriorDF(variances, df) {
    const n = variances.length;
    const logs = variances.map(Math.log);
    const meanLog = st.mean(logs);
    let varLog = 0;
    for (let i = 0; i < n; i++) varLog += (logs[i] - meanLog) * (logs[i] - meanLog);
    varLog /= (n - 1);

    const base = st.trigamma(df / 2);
    const target = varLog - base;
    if (target <= 1e-6) return 100000; // variância já homogênea → sem moderação
    // busca d0 tal que trigamma(d0/2) ≈ target
    const lo = 0.001, hi = 5000;
    const f = (d0) => st.trigamma(d0 / 2) - target;
    if (f(lo) >= 0) return 0.5; // ajuste degenerado
    return bisection(f, lo, hi, 80, 1e-6);
  }

  /* Entrada: rows = [{gene, values:Float32Array/Array, entrez?}] alinhado a `groups`.
     groups: array 0/1 (1 = grupo de interesse, ex.: Relapse).
     transform: 'none' | 'log2' (aplica log2(x+1) antes de tudo).
     Retorna objeto { table: rows ordenadas, summary, n0, n1 }. */
  D.run = function (rows, groups, opts) {
    opts = opts || {};
    const transform = opts.transform || 'none';
    const n = rows.length;
    const g1 = new Set();
    for (let i = 0; i < groups.length; i++) if (groups[i] === 1) g1.add(i);
    const n0 = groups.length - g1.size;
    const n1 = g1.size;
    const df = n0 + n1 - 2;

    const raw = [];
    for (let gi = 0; gi < n; gi++) {
      const row = rows[gi];
      const vals = row.values;
      let m0 = 0, c0 = 0, m1 = 0, c1 = 0, mAll = 0;
      for (let i = 0; i < vals.length; i++) {
        let x = vals[i];
        if (!isFinite(x) || x === null) continue;
        if (transform === 'log2') x = Math.log2(x + 1);
        mAll += x;
        if (g1.has(i)) { m1 += x; c1++; } else { m0 += x; c0++; }
      }
      if (c0 === 0 || c1 === 0) continue;
      const mean0 = m0 / c0, mean1 = m1 / c1;
      let ss0 = 0, ss1 = 0;
      for (let i = 0; i < vals.length; i++) {
        let x = vals[i];
        if (!isFinite(x) || x === null) continue;
        if (transform === 'log2') x = Math.log2(x + 1);
        if (g1.has(i)) { const d = x - mean1; ss1 += d * d; } else { const d = x - mean0; ss0 += d * d; }
      }
      const s2 = (ss0 + ss1) / df;
      if (!isFinite(s2) || s2 <= 0) continue;
      raw.push({
        gene: row.gene, entrez: row.entrez,
        logFC: mean1 - mean0,
        AveExpr: mAll / (c0 + c1),
        s2: s2,
        varMean: (1 / c0 + 1 / c1)
      });
    }

    if (raw.length === 0) return { table: [], n0: n0, n1: n1, df: df };

    const s2s = raw.map((r) => r.s2);
    const s02 = st.mean(s2s);
    const d0 = estimatePriorDF(s2s, df);
    const dfPost = df + d0;

    const pvals = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const s2Post = (d0 * s02 + df * r.s2) / (d0 + df);
      const se = Math.sqrt(s2Post * r.varMean);
      const t = se > 0 ? r.logFC / se : 0;
      r.t = t;
      r['P.Value'] = st.twoSidedTP(t, dfPost);
      pvals[i] = r['P.Value'];
    }
    const q = st.bhFdr(pvals);
    for (let i = 0; i < raw.length; i++) raw[i]['adj.P.Val'] = q[i];

    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const a = r['adj.P.Val'], l = r.logFC;
      r.signif = (a < 0.01 && Math.abs(l) > 1.0) ? (l > 0 ? 'Up — Alta' : 'Down — Alta')
        : (a < 0.05 && Math.abs(l) > 0.5) ? (l > 0 ? 'Up — Moderada' : 'Down — Moderada')
        : 'NS';
      r.color_grp = r.signif === 'NS' ? 'NS' : (r.signif.indexOf('Up') === 0 ? 'Upregulado' : 'Downregulado');
    }

    raw.sort((a, b) => a['adj.P.Val'] - b['adj.P.Val']);
    return {
      table: raw,
      n0: n0, n1: n1, df: df,
      priorDF: d0, priorVar: s02,
      nDEG: raw.filter((r) => r.signif !== 'NS').length
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else window.TALL = window.TALL || {}, window.TALL.dea = D;
})();
