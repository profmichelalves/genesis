// Self-test do motor estatístico (stats/dea/survival/cox) em Node.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const stats = require('../app/js/stats.js');
const dea = require('../app/js/dea.js');
const survival = require('../app/js/survival.js');
const cox = require('../app/js/cox.js');
const cluster = require('../app/js/cluster.js');

let fails = 0;
function check(name, got, expected, tol) {
  tol = tol === undefined ? 1e-3 : tol;
  const ok = Math.abs(got - expected) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  (got=' + got + ', exp=' + expected + ')');
}

/* ---- stats ---- */
check('mean', stats.mean([1, 2, 3, 4]), 2.5);
check('mean NaN-aware', stats.mean([1, NaN, 2, 3, 4]), 2.5);
check('median', stats.median([3, 1, 2]), 2);
check('median NaN-aware', stats.median([3, NaN, 1, 2]), 2);
check('sd', stats.sd([1, 2, 3, 4]), 1.2909944487358056, 1e-6);
check('lgamma(0.5)', stats.lgamma(0.5), 0.5723649429247001, 1e-6);
check('lgamma(1)', stats.lgamma(1), 0, 1e-6);
check('lgamma(2)', stats.lgamma(2), 0, 1e-6);
check('normalP2(1.96)', stats.normalP2(1.96), 0.04999579029609544, 1e-6);
check('t two-sided t=1 df=10', stats.twoSidedTP(1, 10), 0.3408931220746439, 1e-4);
check('t two-sided t=2 df=10', stats.twoSidedTP(2, 10), 0.07339833684682904, 1e-4);
check('chi2P(3.841,1)', stats.chi2P(3.841, 1), 0.04998, 1e-3);
check('chi2P(7.815,3)', stats.chi2P(7.815, 3), 0.04997, 1e-3);
check('trigamma(1)', stats.trigamma(1), 1.6449340668482264, 1e-3);
check('quantile(0.5)', stats.quantile([1, 2, 3, 4], 0.5), 2.5);
check('scale', stats.scale([1, 2, 3, 4])[0], -1.161895003862225, 1e-6);

// FDR (Benjamini–Hochberg) — p=[0.01,0.02,0.2,0.3], m=4
const fdr = stats.bhFdr([0.01, 0.02, 0.2, 0.3]);
check('bhFdr[0]', fdr[0], 0.04, 1e-3);
check('bhFdr[2]', fdr[2], 0.266666, 1e-3);
check('bhFdr[3]', fdr[3], 0.3, 1e-3);
check('bhFdr monotônico', (fdr[0] <= fdr[1] + 1e-9 && fdr[1] <= fdr[2] + 1e-9 && fdr[2] <= fdr[3] + 1e-9) ? 1 : 0, 1, 0);

/* ---- DEA ---- */
// 20 genes, 10 vs 10, metade com efeito real
const rnd = mulberry32(42);
const rows = [], groups = [];
for (let i = 0; i < 20; i++) groups.push(i < 10 ? 0 : 1);
for (let g = 0; g < 20; g++) {
  const eff = g < 10 ? 0 : (g % 2 ? 1.2 : 0.1);
  const vals = [];
  for (let s = 0; s < 20; s++) vals.push(6 + eff * (s >= 10 ? 1 : 0) + rnd() * 1.5);
  rows.push({ gene: 'G' + g, values: Float32Array.from(vals) });
}
const dres = dea.run(rows, groups, { transform: 'none' });
console.log('DEA nDEG=' + dres.nDEG + ' priorDF=' + dres.priorDF.toFixed(2) + ' nDEG-signif...');
if (dres.table.length !== 20) { fails++; console.log('FAIL dea table length'); }
else console.log('PASS  dea table length 20');
const g10 = dres.table.find((r) => r.gene === 'G10'); // efeito 0.1
const g11 = dres.table.find((r) => r.gene === 'G11'); // efeito 1.2
if (g11['adj.P.Val'] < 0.05 && g10['adj.P.Val'] > 0.05) console.log('PASS  dea detecta efeito real (G11 sig, G10 não)');
else { fails++; console.log('FAIL  dea detecção: G10=' + g10['adj.P.Val'].toExponential(2) + ' G11=' + g11['adj.P.Val'].toExponential(2)); }
if (Math.abs(g11.logFC - 1.2) < 0.6) console.log('PASS  dea logFC G11 ~' + g11.logFC.toFixed(2));
else { fails++; console.log('FAIL  dea logFC G11=' + g11.logFC.toFixed(2)); }

/* ---- survival ---- */
const t = [], e = [], g = [];
for (let i = 0; i < 200; i++) {
  t.push(i * 0.5);
  e.push((i % 3 === 0) ? 1 : 0);
  g.push(i % 2 ? 'A' : 'B');
}
const km = survival.kmByGroup(t, e, g);
const a = km.find((k) => k.name === 'A');
if (a.n === 100 && a.times[0] === 0 && a.surv[0] === 1 && a.surv[a.surv.length - 1] < 1)
  console.log('PASS  km: n=100, passo decrescente (S_final=' + a.surv[a.surv.length - 1].toFixed(3) + ')');
else { fails++; console.log('FAIL  km'); }
const lr = survival.logRank(t, e, g);
// grupos idênticos → p deve ser alto (>0.05)
if (lr.p > 0.05) console.log('PASS  log-rank p=' + lr.p.toFixed(3) + ' (grupos iguais)');
else { fails++; console.log('FAIL  log-rank p=' + lr.p.toFixed(3)); }

/* ---- cox ---- */
// gene com HR real ~2
const tt = [], ee = [], xv = [];
for (let i = 0; i < 300; i++) {
  const x = rnd() < 0.5 ? 0 : 1;
  xv.push(x);
  const base = 60 * Math.random();
  const ev = Math.random() < (x ? 0.7 : 0.35);
  tt.push(ev ? base * Math.random() : 60);
  ee.push(ev ? 1 : 0);
}
const fit = cox.coxph(tt.map((t2, i) => ({ time: t2, event: ee[i], covariates: [xv[i]] })), ['x']);
console.log('Cox coef=' + fit.coef[0].toFixed(3) + ' HR=' + fit.HR[0].toFixed(3) + ' p=' + fit.p[0].toExponential(2) + ' conv=' + fit.converged);
if (fit.HR[0] > 1.3 && fit.p[0] < 0.001) console.log('PASS  cox HR>1 e significativo');
else { fails++; console.log('FAIL  cox'); }

// sobrevida com censura: mediana de expressão
const surv2 = survival.analyze(tt, ee, xv.map((x) => x * 10));
if (surv2.km.length === 2) console.log('PASS  analyze km 2 grupos');
else { fails++; console.log('FAIL  analyze'); }

/* ---- cluster ---- */
const mat = [
  [0, 0, 1, 1],
  [0, 0, 1, 1],
  [1, 1, 0, 0],
  [1, 1, 0, 0]
];
const order = cluster.orderByClustering(mat);
const okOrder = order.length === 4;
console.log(okOrder ? 'PASS  cluster order ' + order.join(',') : 'FAIL  cluster');
if (!okOrder) fails++;

console.log(fails ? '\nFALHAS: ' + fails : '\nTodos os testes passaram.');
process.exit(fails ? 1 : 0);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
