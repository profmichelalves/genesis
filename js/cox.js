/* Genesis — Regressão de Cox de riscos proporcionais.
   MLE via Newton–Raphson com aproximação de Efron para empates.
   Preditor de interesse é tipicamente pré-escalonado (padronizado), como no Script.R.
   Implementa: gradiente U, matriz de informação observada I (positiva definida),
   passo β += I⁻¹ U, erro padrão por diag(I⁻¹), p de Wald. */
(function () {
  'use strict';
  const st = (typeof module !== 'undefined' && module.exports)
    ? require('./stats.js') : window.TALL.stats;

  const CX = {};

  /* ---- álgebra linear densa ---- */
  function matMul(a, b) {
    const m = a.length, n = b[0].length, k = b.length;
    const out = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let p = 0; p < k; p++) s += a[i][p] * b[p][j];
        out[i][j] = s;
      }
    return out;
  }
  function matVecMul(a, v) {
    const out = new Array(a.length).fill(0);
    for (let i = 0; i < a.length; i++) {
      let s = 0;
      for (let j = 0; j < v.length; j++) s += a[i][j] * v[j];
      out[i] = s;
    }
    return out;
  }
  function matTranspose(a) {
    const n = a.length, m = a[0].length;
    return Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => a[i][j]));
  }
  function matInvert(a) {
    const n = a.length;
    const aug = a.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
      if (Math.abs(aug[piv][col]) < 1e-12) return null;
      const tmp = aug[col]; aug[col] = aug[piv]; aug[piv] = tmp;
      const d = aug[col][col];
      for (let j = 0; j < 2 * n; j++) aug[col][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = aug[r][col];
        for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j];
      }
    }
    return aug.map((row) => row.slice(n));
  }

  /* solve A x = b */
  function solveLinear(A, b) {
    const inv = matInvert(A);
    if (!inv) return null;
    return matVecMul(inv, b);
  }

  /* Ajusta modelo de Cox.
     rows: [{time, event(0/1), covariates: number[]}]
     Retorna { coef, se, z, p, HR, hrLower, hrUpper, n, nEvents, iters, converged }. */
  CX.coxph = function (rows, covNames) {
    const p = covNames.length;
    if (p === 0) return null;
    const n = rows.length;
    const events = rows.filter((r) => r.event).sort((a, b) => a.time - b.time);
    const nEvents = events.length;
    if (nEvents === 0) return null;

    let beta = new Array(p).fill(0);
    const jitter = 1e-8;
    let converged = false, iters = 0;

    for (iters = 1; iters <= 40; iters++) {
      const U = new Array(p).fill(0);
      const I = Array.from({ length: p }, () => new Array(p).fill(0));

      let i = 0;
      while (i < events.length) {
        const t = events[i].time;
        const dIdx = [];
        while (i < events.length && events[i].time === t) { dIdx.push(events[i]); i++; }
        const d = dIdx.length;

        // conjunto de risco: time >= t
        const risk = [];
        for (let r = 0; r < n; r++) {
          if (rows[r].time >= t) risk.push(rows[r]);
        }
        const nR = risk.length;

        // exp(X·β) e agregações
        let eSum = 0;
        const eX = new Array(p).fill(0);
        const eXX = Array.from({ length: p }, () => new Array(p).fill(0));
        for (let r = 0; r < nR; r++) {
          let z = 0;
          const X = risk[r].covariates;
          for (let j = 0; j < p; j++) z += X[j] * beta[j];
          const e = Math.exp(z);
          eSum += e;
          for (let a = 0; a < p; a++) {
            eX[a] += e * X[a];
            for (let b = a; b < p; b++) eXX[a][b] += e * X[a] * X[b];
          }
        }
        for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) eXX[b][a] = eXX[a][b];

        // somas apenas entre os eventos do empate (para subtração de Efron)
        let dE = 0;
        const dEX = new Array(p).fill(0);
        const dEXX = Array.from({ length: p }, () => new Array(p).fill(0));
        for (let q = 0; q < d; q++) {
          const X = dIdx[q].covariates;
          let z = 0;
          for (let j = 0; j < p; j++) z += X[j] * beta[j];
          const e = Math.exp(z);
          dE += e;
          for (let a = 0; a < p; a++) {
            dEX[a] += e * X[a];
            for (let b = a; b < p; b++) dEXX[a][b] += e * X[a] * X[b];
          }
        }
        for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) dEXX[b][a] = dEXX[a][b];

        for (let l = 0; l < d; l++) {
          const frac = l / d;
          const eSumL = eSum - frac * dE;
          const eXL = eX.map((v, a) => v - frac * dEX[a]);
          const eXXL = eXX.map((row, a) => row.map((v, b) => v - frac * dEXX[a][b]));
          const invDen = 1 / eSumL;
          for (let a = 0; a < p; a++) {
            U[a] += -eXL[a] * invDen;
            for (let b = a; b < p; b++) {
              I[a][b] += (eXXL[a][b] * eSumL - eXL[a] * eXL[b]) * invDen * invDen;
            }
          }
        }
        for (let q = 0; q < d; q++) {
          const X = dIdx[q].covariates;
          for (let a = 0; a < p; a++) U[a] += X[a];
        }
      }

      // estabilidade do Hessiano
      for (let a = 0; a < p; a++) I[a][a] += jitter;
      for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) I[b][a] = I[a][b];

      const delta = solveLinear(I, U);
      if (!delta) break;
      let maxDelta = 0;
      for (let j = 0; j < p; j++) { beta[j] += delta[j]; maxDelta = Math.max(maxDelta, Math.abs(delta[j])); }
      if (maxDelta < 1e-6) { converged = true; break; }
    }

    // Recomputar a matriz de informação no β final (correta)
    const I2 = Array.from({ length: p }, () => new Array(p).fill(0));
    {
      let i = 0;
      const eventsF = rows.filter((r) => r.event).sort((a, b) => a.time - b.time);
      while (i < eventsF.length) {
        const t = eventsF[i].time;
        const dIdx = [];
        while (i < eventsF.length && eventsF[i].time === t) { dIdx.push(eventsF[i]); i++; }
        const d = dIdx.length;
        const risk = [];
        for (let r = 0; r < n; r++) if (rows[r].time >= t) risk.push(rows[r]);
        let eSum = 0;
        const eX = new Array(p).fill(0);
        const eXX = Array.from({ length: p }, () => new Array(p).fill(0));
        for (let r = 0; r < risk.length; r++) {
          let z = 0;
          const X = risk[r].covariates;
          for (let j = 0; j < p; j++) z += X[j] * beta[j];
          const e = Math.exp(z);
          eSum += e;
          for (let a = 0; a < p; a++) {
            eX[a] += e * X[a];
            for (let b = a; b < p; b++) eXX[a][b] += e * X[a] * X[b];
          }
        }
        for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) eXX[b][a] = eXX[a][b];
        let dE = 0;
        const dEX = new Array(p).fill(0);
        const dEXX = Array.from({ length: p }, () => new Array(p).fill(0));
        for (let q = 0; q < d; q++) {
          const X = dIdx[q].covariates;
          let z = 0;
          for (let j = 0; j < p; j++) z += X[j] * beta[j];
          const e = Math.exp(z);
          dE += e;
          for (let a = 0; a < p; a++) {
            dEX[a] += e * X[a];
            for (let b = a; b < p; b++) dEXX[a][b] += e * X[a] * X[b];
          }
        }
        for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) dEXX[b][a] = dEXX[a][b];
        for (let l = 0; l < d; l++) {
          const frac = l / d;
          const eSumL = eSum - frac * dE;
          const eXL = eX.map((v, a) => v - frac * dEX[a]);
          const eXXL = eXX.map((row, a) => row.map((v, b) => v - frac * dEXX[a][b]));
          const invDen = 1 / eSumL;
          for (let a = 0; a < p; a++)
            for (let b = a; b < p; b++)
              I2[a][b] += (eXXL[a][b] * eSumL - eXL[a] * eXL[b]) * invDen * invDen;
        }
      }
      for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) I2[b][a] = I2[a][b];
    }

    const cov = matInvert(I2);
    const res = { coef: beta, n: n, nEvents: nEvents, iters: iters, converged: converged, names: covNames, se: [], z: [], p: [], HR: [], hrLower: [], hrUpper: [] };
    for (let j = 0; j < p; j++) {
      const se = cov ? Math.sqrt(Math.max(cov[j][j], 0)) : NaN;
      res.se.push(se);
      const z = isFinite(se) && se > 0 ? beta[j] / se : NaN;
      res.z.push(z);
      res.p.push(isFinite(z) ? st.normalP2(z) : NaN);
      res.HR.push(Math.exp(beta[j]));
      if (isFinite(se) && se > 0) {
        res.hrLower.push(Math.exp(beta[j] - 1.959964 * se));
        res.hrUpper.push(Math.exp(beta[j] + 1.959964 * se));
      } else {
        res.hrLower.push(NaN); res.hrUpper.push(NaN);
      }
    }
    return res;
  };

  /* Conveniência: univariado para um vetor de genes.
     time/event/exprs: exprs = {gene: Float32Array}, amostras alinhadas.
     Como no Script.R (cox_df_scaled): filtra amostras com sobrevida válida
     (tempo > 0) e padroniza a expressão sobre essas amostras do modelo. */
  CX.univariate = function (time, event, genes, exprRows) {
    const out = [];
    for (const gene of genes) {
      const row = exprRows[gene];
      if (!row) continue;
      const rows = [];
      for (let i = 0; i < time.length; i++) {
        if (!isFinite(time[i]) || time[i] === null) continue;
        if (time[i] <= 0) continue;
        if (!isFinite(row.values[i])) continue;
        rows.push({ time: time[i], event: event[i] ? 1 : 0, covariates: [row.values[i]] });
      }
      if (rows.length < 5) continue;
      const m = st.mean(rows.map((r) => r.covariates[0]));
      const s = st.sd(rows.map((r) => r.covariates[0]));
      for (const r of rows) r.covariates[0] = s > 0 ? (r.covariates[0] - m) / s : 0;
      const fit = CX.coxph(rows, [gene]);
      if (!fit) continue;
      out.push({
        Gene: gene,
        HR: +fit.HR[0].toFixed(3),
        HR_lower: +fit.hrLower[0].toFixed(3),
        HR_upper: +fit.hrUpper[0].toFixed(3),
        p_value: +fit.p[0].toFixed(4),
        p_signif: fit.p[0] < 0.05 ? '*' : '',
        n: fit.n, nEvents: fit.nEvents
      });
    }
    return out;
  };

  /* Conveniência: multivariado com os genes fornecidos (escalonados). */
  CX.multivariate = function (time, event, genes, exprRows) {
    const rows = [];
    for (let i = 0; i < time.length; i++) {
      if (!isFinite(time[i]) || time[i] === null) continue;
      if (time[i] <= 0) continue;
      const covs = [];
      let ok = true;
      for (const g of genes) {
        const r = exprRows[g];
        if (!r || !isFinite(r.values[i])) { ok = false; break; }
        covs.push(r.values[i]);
      }
      if (!ok) continue;
      rows.push({ time: time[i], event: event[i] ? 1 : 0, covariates: covs });
    }
    if (rows.length < genes.length + 2) return null;
    // escalona cada coluna
    for (let j = 0; j < genes.length; j++) {
      const col = rows.map((r) => r.covariates[j]);
      const m = st.mean(col), s = st.sd(col) || 1;
      for (let r = 0; r < rows.length; r++) rows[r].covariates[j] = (rows[r].covariates[j] - m) / s;
    }
    return CX.coxph(rows, genes);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CX;
  else window.TALL = window.TALL || {}, window.TALL.cox = CX;
})();
