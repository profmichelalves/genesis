/* Genesis — Sobrevida: estimador de Kaplan-Meier (produto-limite),
   teste log-rank (estatística χ²) e tabela de risco. */
(function () {
  'use strict';
  const st = (typeof module !== 'undefined' && module.exports)
    ? require('./stats.js') : window.TALL.stats;

  const SV = {};

  /* km por grupo.
     time/event: arrays numéricos; group: array de strings/labels.
     Os grupos são ordenados alfabeticamente — como os níveis de fator do R
     ('Alto' < 'Baixo'), garantindo a mesma ordem/cores do ggsurvplot.
     Retorna array de grupos: {name, n, times[], surv[], nRisk[], censor[],
     ciLo[], ciHi[], nEvents, nCensor} — IC do tipo log-log (default de
     survfit()/ggsurvplot(), conf.int=TRUE do Script.R). */
  SV.kmByGroup = function (time, event, group) {
    const labels = Array.from(new Set(group)).sort();
    const per = {};
    labels.forEach((l) => {
      per[l] = { name: l, n: 0, times: [], surv: [], nRisk: [], censor: [], ciLo: [], ciHi: [], nEvents: 0, nCensor: 0, obs: [] };
    });

    for (let i = 0; i < time.length; i++) {
      if (!isFinite(time[i]) || time[i] === null) continue;
      const rec = { t: time[i], e: event[i] ? 1 : 0 };
      per[group[i]].obs.push(rec);
      per[group[i]].n++;
    }

    labels.forEach((l) => {
      const obs = per[l].obs.slice().sort((a, b) => a.t - b.t);
      let nRisk = obs.length;
      let surv = 1;
      let gVar = 0; // variância de Greenwood para log(-log S)
      per[l].times.push(0);
      per[l].surv.push(1);
      per[l].nRisk.push(nRisk);
      per[l].censor.push(0);
      per[l].ciLo.push(1);
      per[l].ciHi.push(1);
      let i = 0;
      while (i < obs.length) {
        const t = obs[i].t;
        let d = 0, c = 0;
        while (i < obs.length && obs[i].t === t) {
          if (obs[i].e) d++; else c++;
          i++;
        }
        if (d > 0) {
          surv *= (1 - d / nRisk);
          per[l].nEvents += d;
          gVar += d / (nRisk * (nRisk - d));
        } else {
          per[l].nCensor += c;
        }
        per[l].times.push(t);
        per[l].surv.push(surv);
        per[l].censor.push(c);
        nRisk -= (d + c);
        per[l].nRisk.push(nRisk);
        // IC log-log (conf.type="log" do R): theta = log(-log S); se = sqrt(gVar)/|theta|
        let lo = surv, hi = surv;
        const theta = Math.log(-Math.log(surv));
        if (isFinite(theta) && theta !== 0 && isFinite(gVar) && gVar > 0) {
          const se = Math.sqrt(gVar) / Math.abs(theta);
          lo = Math.max(0, Math.pow(surv, Math.exp(1.959964 * se)));
          hi = Math.min(1, Math.pow(surv, Math.exp(-1.959964 * se)));
        }
        per[l].ciLo.push(lo);
        per[l].ciHi.push(hi);
      }
    });
    return labels.map((l) => per[l]);
  };

  /* teste log-rank para 2+ grupos */
  SV.logRank = function (time, event, group) {
    const labels = Array.from(new Set(group));
    const gIdx = group.map((g) => labels.indexOf(g));
    const n = time.length;
    const idxSorted = time.map((_, i) => i)
      .filter((i) => isFinite(time[i]) && time[i] !== null)
      .sort((a, b) => time[a] - time[b]);

    let O = new Array(labels.length).fill(0);
    let E = new Array(labels.length).fill(0);
    let V = new Array(labels.length).fill(0);
    let t = 0;
    while (t < idxSorted.length) {
      const tTime = time[idxSorted[t]];
      let dTotal = 0;
      const dByGroup = new Array(labels.length).fill(0);
      let k = t;
      while (k < idxSorted.length && time[idxSorted[k]] === tTime) {
        const i = idxSorted[k];
        if (event[i]) { dTotal++; dByGroup[gIdx[i]]++; }
        k++;
      }
      const nTotal = idxSorted.length - t;
      // contagem de risco por grupo: risco_g = nº de indivíduos do grupo com time >= tTime
      for (let g = 0; g < labels.length; g++) {
        let nG = 0;
        for (let m = t; m < idxSorted.length; m++) if (gIdx[idxSorted[m]] === g) nG++;
        const eG = dTotal * (nG / nTotal);
        E[g] += eG;
        O[g] += dByGroup[g];
        V[g] += (dTotal * (nTotal - dTotal) * nG * (nTotal - nG)) / (nTotal * nTotal * (nTotal - 1));
      }
      t = k;
    }

    const chi2 = V.reduce((s, v, g) => s + (O[g] - E[g]) * (O[g] - E[g]) / (v > 0 ? v : 1), 0);
    const df = labels.length - 1;
    const p = st.chi2P(chi2, df);
    return { chi2: chi2, df: df, p: p, O: O, E: E, labels: labels };
  };

  /* Interface de conveniência: dicotomiza pela mediana e retorna objeto pronto p/ plot.
     Espelha o plot_km() do Script.R: primeiro filtra as amostras com sobrevida válida
     (tempo > 0, evento e expressão presentes) e então dicotomiza pela mediana das
     amostras que efetivamente entram na análise. */
  SV.analyze = function (time, event, expr, medianCut) {
    const t2 = [], e2 = [], x2 = [];
    for (let i = 0; i < time.length; i++) {
      if (!isFinite(time[i]) || time[i] === null) continue;
      if (time[i] <= 0) continue;
      if (!isFinite(expr[i]) || expr[i] === null) continue;
      t2.push(time[i]);
      e2.push(event[i] ? 1 : 0);
      x2.push(expr[i]);
    }
    if (medianCut === undefined) medianCut = st.median(x2);
    const g2 = x2.map((x) => (x >= medianCut ? 'Alto' : 'Baixo'));
    const km = SV.kmByGroup(t2, e2, g2);
    const lr = SV.logRank(t2, e2, g2);
    return {
      km: km, logRank: lr, medianCut: medianCut,
      nAlto: g2.filter((g) => g === 'Alto').length,
      nBaixo: g2.filter((g) => g === 'Baixo').length
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SV;
  else window.TALL = window.TALL || {}, window.TALL.survival = SV;
})();
