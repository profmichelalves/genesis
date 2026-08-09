/* TARGET ALL Explorer — bootstrap e orquestração.
   Liga a UI aos motores (stats/dea/survival/cox) e aos dados (api/storage/datapack). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const S = {
    dp: null,
    deaResult: null,
    kmResults: {},
    coxUni: null,
    coxMulti: null,
    settings: { timeCol: 'OS_MONTHS', eventCol: 'OS_STATUS', groupCol: 'FIRST_EVENT' }
  };
  window.TALL.state = S;

  /* ============================================================
     Helpers de acesso aos dados
  ============================================================ */
  function clinVal(patientId, attr) {
    if (!S.dp) return null;
    const row = S.dp.clinical.rows.find((r) => r.PATIENT_ID === patientId || r.PATIENT_ID === String(patientId));
    return row ? (row[attr] === undefined ? null : row[attr]) : null;
  }
  function patientOfSample(sampleId) {
    return S.dp.sampleToPatient.get(sampleId);
  }
  function exprRow(gene) {
    return S.dp.expr.find((g) => g.symbol === gene);
  }

  /* vetores de sobrevida alinhados às amostras RNA (NaN onde sem dado) */
  function survivalArrays() {
    const n = S.dp.rnaSampleIds.length;
    const time = new Array(n).fill(NaN);
    const event = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const pid = patientOfSample(S.dp.rnaSampleIds[i]);
      const os = clinVal(pid, S.settings.timeCol);
      const st = clinVal(pid, S.settings.eventCol);
      if (os === null || os === undefined || isNaN(parseFloat(os))) continue;
      time[i] = parseFloat(os);
      const s = String(st || '');
      event[i] = /DECEASED/.test(s) || /^1/.test(s.trim()) ? 1 : 0;
    }
    return { time, event };
  }

  /* grupos para DEA: 1=Relapse, 0=None (alinhado às amostras RNA) */
  function deaGroups() {
    const n = S.dp.rnaSampleIds.length;
    const g = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const pid = patientOfSample(S.dp.rnaSampleIds[i]);
      const fe = String(clinVal(pid, S.settings.groupCol) || '');
      if (fe === 'Relapse') g[i] = 1;
      else if (fe === 'None') g[i] = 0;
    }
    return g;
  }

  /* ============================================================
     Dashboard
  ============================================================ */
  function renderDashboard() {
    $('#dash-study').textContent = TALL.api.STUDY_ID;
    if (!S.dp) {
      $('#dash-stats').innerHTML = '';
      $('#dash-first-event').innerHTML = '<p class="muted">Baixe os dados para ver as estatísticas.</p>';
      return;
    }
    const p = S.dp.pack;
    const nExpr = S.dp.expr.length;
    const stats = [
      { k: 'Pacientes', v: p.nPatients },
      { k: 'Amostras RNA', v: p.rnaSampleIds.length },
      { k: 'Amostras WES', v: p.seqSampleIds.length },
      { k: 'Genes', v: nExpr },
      { k: 'Modo', v: p.scope === 'completo' ? 'Completo' : 'Expresso' }
    ];
    $('#dash-stats').innerHTML = stats.map((s) =>
      '<div class="stat"><span class="value">' + s.v + '</span><span class="label">' + s.k + '</span></div>').join('');

    // distribuição FIRST_EVENT
    const counts = {};
    for (const r of S.dp.clinical.rows) {
      const v = r.FIRST_EVENT || '(sem dado)';
      counts[v] = (counts[v] || 0) + 1;
    }
    const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const base = { margin: { l: 40, r: 10, t: 10, b: 70 }, autosize: true, showlegend: false };
    base.xaxis = { tickangle: -30 };
    base.font = { color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1a1f2e' };
    base.paper_bgcolor = 'rgba(0,0,0,0)'; base.plot_bgcolor = 'rgba(0,0,0,0)';
    Plotly.react('dash-first-event', [{
      type: 'bar', x: labels, y: labels.map((l) => counts[l]),
      marker: { color: '#4c78a8' },
      hovertemplate: '%{x}: %{y}<extra></extra>'
    }], base, { displaylogo: false, responsive: true });
  }

  /* ============================================================
     Datapack
  ============================================================ */
  function datapackControls(containerId) {
    const el = $(containerId);
    if (!S.dp) {
      el.innerHTML =
        '<div class="row">' +
        '<div class="field"><label for="scope">Escopo de genes</label>' +
        '<select id="scope"><option value="expresso">Expresso — painel curado (~500 genes)</option>' +
        '<option value="completo">Completo — todos os genes (~26k, download pesado)</option></select></div>' +
        '<div class="field auto"><label>&nbsp;</label>' +
        '<button class="btn primary btn-build">Baixar estudo</button></div>' +
        '</div>' +
        '<p class="muted">Primeira execução baixa os dados do cBioPortal e os guarda no navegador (IndexedDB). As análises rodam 100% local, inclusive offline depois.</p>' +
        '<p class="muted" id="datapack-status"></p>';
      el.querySelector('.btn-build').addEventListener('click', () => buildDatapack(el.querySelector('#scope').value));
    } else {
      const p = S.dp.pack;
      el.innerHTML =
        '<div class="row"><div class="field auto"><button class="btn danger btn-datapack-clear">Apagar dados</button></div>' +
        '<div class="field auto"><button class="btn btn-datapack-rebuild">Reconstruir</button></div></div>' +
        '<p class="muted">Escopo: <b>' + (p.scope === 'completo' ? 'Completo' : 'Expresso') + '</b> · ' +
        p.nPatients + ' pacientes · ' + S.dp.expr.length + ' genes · construído ' + new Date(p.buildDate).toLocaleString('pt-BR') + '</p>';
      el.querySelector('.btn-datapack-clear').addEventListener('click', async () => {
        await TALL.datapack.clear();
        S.dp = null;
        datapackControls('#dash-datapack');
        renderDashboard();
        TALL.ui.toast('Dados apagados.', 'info');
      });
      el.querySelector('.btn-datapack-rebuild').addEventListener('click', () => buildDatapack(p.scope));
    }
  }

  async function buildDatapack(scope) {
    if (scope === 'completo') {
      TALL.ui.modal('Download completo',
        '<p>O escopo <b>Completo</b> baixa a expressão de todos os ~26.000 genes do estudo ' +
        '(centenas de MB). Isso pode demorar bastante e consumir muita rede/memória.</p>' +
        '<p>Recomenda-se o escopo <b>Expresso</b> para uso geral.</p>' +
        '<div class="row"><button class="btn primary" id="md-proceed">Continuar mesmo assim</button>' +
        '<button class="btn" id="md-cancel">Cancelar</button></div>');
      $('#md-proceed').addEventListener('click', () => { TALL.ui.closeModal(); doBuild('completo'); });
      $('#md-cancel').addEventListener('click', TALL.ui.closeModal);
      return;
    }
    doBuild(scope);
  }

  async function doBuild(scope) {
    const btns = document.querySelectorAll('.btn-build');
    btns.forEach((b) => b.disabled = true);
    try {
      await TALL.datapack.build({
        scope,
        onProgress: (p) => {
          TALL.ui.progress(p.pct, p.msg);
          const el = $('#datapack-status');
          if (el) el.textContent = p.msg + ' (' + p.pct + '%)';
        }
      });
      S.dp = await TALL.datapack.loadFromCache();
      datapackControls('#dash-datapack');
      renderDashboard();
      TALL.ui.toast('Estudo pronto! Navegue pelas abas.', 'ok');
      runAll();
    } catch (e) {
      console.error(e);
      TALL.ui.toast('Falha ao baixar: ' + e.message, 'error');
    } finally {
      document.querySelectorAll('.btn-build').forEach((b) => b.disabled = false);
      TALL.ui.progress(0, '');
    }
  }

  /* ============================================================
     Dados clínicos
  ============================================================ */
  let clinCache = null;
  function renderClinical() {
    if (!S.dp) return;
    const cols = S.dp.clinical.attributes.filter((a) => a !== 'PATIENT_ID');
    $('#clinical-sub').textContent = S.dp.clinical.rows.length + ' pacientes · ' + cols.length + ' atributos clínicos';
    clinCache = cols;
    updateClinicalTable('');
  }
  function updateClinicalTable(filter) {
    const rows = S.dp.clinical.rows;
    const f = filter.trim().toLowerCase();
    const out = [];
    for (const r of rows) {
      if (f && !Object.values(r).some((v) => String(v).toLowerCase().includes(f))) continue;
      out.push(colsDisplay(r));
    }
    TALL.ui.renderTable($('#clinical-table'), ['Paciente'].concat(clinCache), out, { limit: 500 });
    $('#clinical-count').textContent = out.length + ' linhas (exibindo até 500)';
  }
  function colsDisplay(r) {
    return [r.PATIENT_ID].concat(clinCache.map((c) => r[c] === undefined ? '' : r[c]));
  }

  /* ============================================================
     Bloco 1 — Top 30 mutados
  ============================================================ */
  function runTop30() {
    if (!S.dp) return TALL.ui.toast('Baixe os dados primeiro.', 'error');
    const byGene = (S.dp.mut && S.dp.mut.byGene) || {};
    const rows = Object.values(byGene).map((g) => ({ Gene: g.symbol, N: g.count }));
    rows.sort((a, b) => b.N - a.N);
    if (!rows.length) {
      $('#top30-sub').textContent = 'Nenhuma mutação encontrada.';
      $('#top30-chart').innerHTML = '<p class="muted">Sem dados de mutação — reconstrua o estudo (Apagar dados → Baixar estudo).</p>';
      TALL.ui.renderTable($('#top30-table'), ['Gene', 'N amostras', 'Frequência (%)'], []);
      return;
    }
    S.top30 = rows.slice(0, 30);
    $('#top30-sub').textContent = rows.length + ' genes mutados em ' + S.dp.mut.totalSamples + ' amostras sequenciadas';
    TALL.charts.top30('#top30-chart', rows);
    TALL.ui.renderTable($('#top30-table'),
      ['Gene', 'N amostras', 'Frequência (%)'],
      S.top30.map((r) => [r.Gene, r.N, (100 * r.N / S.dp.mut.totalSamples).toFixed(1)]));
  }

  /* ============================================================
     Blocos 2-4 — DEA
  ============================================================ */
  function runDea() {
    if (!S.dp) return TALL.ui.toast('Baixe os dados primeiro.', 'error');
    const groups = deaGroups();
    const n1 = groups.filter((g) => g === 1).length;
    const n0 = groups.filter((g) => g === 0).length;
    if (!n1 || !n0) return TALL.ui.toast('Sem grupos Relapse/None definidos.', 'error');

    const rows = S.dp.expr.map((g) => ({ gene: g.symbol, entrez: g.entrez, values: g.values }));
    TALL.ui.busy('Rodando DEA…');
    const res = TALL.dea.run(rows, groups, { transform: 'none' });

    // A (média) por gene para o MA plot
    for (const r of res.table) r.meanExpr = +r.AveExpr.toFixed(3);
    res.transform = 'none';
    S.deaResult = res;

    $('#dea-sub').textContent =
      (n1 + n0) + ' amostras (Relapse=' + n1 + ', None=' + n0 + ') · ' + res.table.length + ' genes testados · ' +
      res.nDEG + ' DE · prior df(d0)=' + res.priorDF.toFixed(1) + ' · s0²=' + res.priorVar.toExponential(2);
    $('#dea-summary').textContent = 'Tabela completa: ' + res.table.length + ' genes, ordenada por adj. p. Use os filtros para destacar os DE.';

    TALL.charts.volcano('#dea-volcano', res.table);
    TALL.charts.ma('#dea-ma', res.table);
    renderHeatmap(res);
    TALL.ui.renderTable($('#dea-table'),
      ['Gene', 'logFC', 'AveExpr', 't', 'P.Value', 'adj.P.Val', 'Classificação'],
      res.table.slice(0, 200).map((r) => [
        r.gene, r.logFC.toFixed(3), r.meanExpr, r.t.toFixed(2),
        r['P.Value'].toExponential(2), r['adj.P.Val'].toExponential(2), r.signif
      ]));
  }

  function renderHeatmap(res) {
    // Script.R: top 40 DEGs (signif != NS), ordenados por adj.P
    const top = res.table.filter((r) => r.signif !== 'NS').slice(0, 40);
    if (top.length < 2) {
      $('#dea-heatmap').innerHTML = '<p class="muted">Menos de 2 genes DE (limiares do Script.R: adj.P<0.05 e |log2FC|>0.5).</p>';
      return;
    }
    const n = S.dp.rnaSampleIds.length;
    const gidx = top.map((r) => S.dp.expr.findIndex((g) => g.symbol === r.gene)).filter((ix) => ix >= 0);
    const mat = gidx.map((ix) => Array.from(S.dp.expr[ix].values));
    const top2 = gidx.map((ix) => S.dp.expr[ix].symbol);
    // z-score por gene
    for (const row of mat) {
      const m = TALL.stats.mean(row), s = TALL.stats.sd(row);
      for (let i = 0; i < row.length; i++) if (isFinite(row[i])) row[i] = s > 0 ? (row[i] - m) / s : 0;
    }
    // ordem dos genes por clustering
    const geneOrder = TALL.cluster.orderByClustering(mat);
    // ordem das amostras: primeiro pelo grupo clínico (Relapse=0, None=1, outros=2), depois cluster
    const groups = deaGroups();
    const rank = groups.map((g) => (g === 1 ? 0 : g === 0 ? 1 : 2));
    const sampleOrder = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => rank[a] - rank[b] || a - b);
    const z = geneOrder.map((gi) => sampleOrder.map((si) => mat[gi][si]));
    TALL.charts.heatmap('#dea-heatmap', {
      genes: geneOrder.map((gi) => top2[gi]),
      sampleLabels: sampleOrder.map((si) => {
        const pid = patientOfSample(S.dp.rnaSampleIds[si]);
        return (clinVal(pid, S.settings.groupCol) || '?')[0];
      }),
      z
    });
  }

  /* ============================================================
     Bloco 5 — Kaplan-Meier
  ============================================================ */
  function runKm() {
    if (!S.dp) return TALL.ui.toast('Baixe os dados primeiro.', 'error');
    const input = $('#km-genes').value.trim();
    let genes = input ? input.split(/[,\s;]+/).map((g) => g.toUpperCase()).filter(Boolean) : defaultGenes();
    genes = genes.slice(0, 8);
    const { time, event } = survivalArrays();
    $('#km-panel').innerHTML = '';
    S.kmResults = {};
    const summaries = [];
    for (const gene of genes) {
      const er = exprRow(gene);
      if (!er) { summaries.push(gene + ': sem expressão'); continue; }
      const km = TALL.survival.analyze(time, event, Array.from(er.values));
      if (!km.km.length) { summaries.push(gene + ': sem dados'); continue; }
      S.kmResults[gene] = km;
      const divId = 'km-' + gene;
      $('#km-panel').insertAdjacentHTML('beforeend',
        '<div class="card"><h3>' + gene + '</h3><div id="' + divId + '" class="plot"></div>' +
        '<p class="muted">Corte: mediana (' + km.medianCut.toFixed(2) + ') · Alto n=' + km.nAlto +
        ' · Baixo n=' + km.nBaixo + ' · log-rank p=' + km.logRank.p.toExponential(2) + '</p>' +
        riskTableHtml(km) + '</div>');
      TALL.charts.km(divId, km, { title: 'KM — ' + gene });
      summaries.push(gene + ': p=' + km.logRank.p.toExponential(2));
    }
    $('#km-sub').textContent = summaries.join(' · ') || 'Nenhum gene válido.';
  }

  function defaultGenes() {
    // Script.R: km_candidates = top 10 DE (por adj.P) ∪ top 30 mutados ∩ expressos, máx 10
    const out = [];
    if (S.deaResult) {
      out.push(...S.deaResult.table.filter((r) => r.signif !== 'NS').slice(0, 10).map((r) => r.gene));
    }
    if (S.top30 && S.top30.length) {
      const inExpr = new Set(S.dp ? S.dp.expr.map((g) => g.symbol) : []);
      out.push(...S.top30.map((r) => r.Gene).filter((g) => inExpr.has(g)));
    }
    return Array.from(new Set(out)).slice(0, 10);
  }

  /* tabela de risco (n em risco em tempos selecionados) */
  function riskTableHtml(km) {
    const pick = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 144, 168];
    const rows = km.km.map((g) => {
      const cells = pick.map((tp) => {
        let ix = 0;
        for (let i = g.times.length - 1; i >= 0; i--) { if (g.times[i] <= tp) { ix = i; break; } }
        return g.nRisk[ix];
      });
      return '<tr><td>' + g.name + '</td>' + cells.map((c) => '<td>' + c + '</td>').join('') + '</tr>';
    });
    return '<div class="table-wrap" style="margin-top:8px"><table class="data risk"><tr><th>Grupo</th>' +
      pick.map((tp) => '<th>' + tp + '</th>').join('') + '</tr>' + rows.join('') + '</table></div>';
  }

  /* ============================================================
     Bloco 6 — Cox
  ============================================================ */
  function runCox() {
    if (!S.dp) return TALL.ui.toast('Baixe os dados primeiro.', 'error');
    const input = $('#cox-genes').value.trim();
    const genes = input ? input.split(/[,\s;]+/).map((g) => g.toUpperCase()).filter(Boolean) : defaultGenes();
    const { time, event } = survivalArrays();
    const exprMap = {};
    for (const g of S.dp.expr) exprMap[g.symbol] = g;

    S.coxUni = TALL.cox.univariate(time, event, genes, exprMap);
    if (!S.coxUni.length) return TALL.ui.toast('Nenhum gene com dados suficientes.', 'error');

    $('#cox-sub').textContent = S.coxUni.length + ' genes · hazard ratio por 1 DP de expressão (padronizada) · ' +
      'p<0.05 marcados com *';
    TALL.charts.forest('#cox-forest', S.coxUni);
    TALL.ui.renderTable($('#cox-table'),
      ['Gene', 'HR', 'IC95% inf', 'IC95% sup', 'p', 'signif'],
      S.coxUni.map((r) => [r.Gene, r.HR, r.HR_lower, r.HR_upper, r.p_value, r.p_signif]));

    // multivariado com genes p<0.1 (limite de 10 covariáveis)
    const cand = S.coxUni.filter((r) => r.p_value < 0.1).map((r) => r.Gene).slice(0, 10);
    if (cand.length >= 2) {
      const fit = TALL.cox.multivariate(time, event, cand, exprMap);
      if (fit) {
        S.coxMulti = fit;
        TALL.ui.renderTable($('#cox-multi-table'),
          ['Covariável', 'HR', 'IC95%', 'p'],
          fit.names.map((nm, j) => [nm, fit.HR[j].toFixed(3),
            fit.hrLower[j].toFixed(3) + '–' + fit.hrUpper[j].toFixed(3), fit.p[j].toExponential(2)]));
      }
    }
  }

  /* ============================================================
     Exportações
  ============================================================ */
  function wireExports() {
    $('#top30-csv').addEventListener('click', () => {
      if (S.top30) TALL.export.csv('top30.csv', ['Gene', 'N'], S.top30.map((r) => [r.Gene, r.N]));
    });
    $('#dea-csv').addEventListener('click', () => {
      if (S.deaResult) TALL.export.csv('dea.csv', ['Gene', 'logFC', 'AveExpr', 't', 'P.Value', 'adj.P.Val', 'signif'],
        S.deaResult.table.map((r) => [r.gene, r.logFC, r.meanExpr, r.t, r['P.Value'], r['adj.P.Val'], r.signif]));
    });
    $('#clin-csv').addEventListener('click', () => {
      if (!S.dp) return;
      const cols = S.dp.clinical.attributes;
      TALL.export.csv('clinicos.csv', cols, S.dp.clinical.rows.map((r) => cols.map((c) => r[c] === undefined ? '' : r[c])));
    });
    $('#cox-csv').addEventListener('click', () => {
      if (S.coxUni) TALL.export.csv('cox.csv', ['Gene', 'HR', 'HR_lower', 'HR_upper', 'p_value'],
        S.coxUni.map((r) => [r.Gene, r.HR, r.HR_lower, r.HR_upper, r.p_value]));
    });
  }

  /* ============================================================
     Executa as 4 análises do Script.R em sequência
  ============================================================ */
  function runAll() {
    if (!S.dp) return;
    const steps = [['Top30', runTop30], ['DEA', runDea], ['KM', runKm], ['Cox', runCox]];
    for (const [label, fn] of steps) {
      try { fn(); } catch (e) {
        console.error(label + ':', e);
        TALL.ui.toast(label + ': falhou — ' + (e && e.message ? e.message : e), 'error');
      }
    }
  }

  /* re-renderiza uma análise se os gráficos do painel ainda não foram criados
     (ex.: painel estava display:none quando runAll() rodou) */
  function rerenderIfEmpty(panel, fn) {
    if (!S.dp) return;
    const plots = panel.querySelectorAll('.plot');
    if (!plots.length) return;
    if (!panel.querySelector('.js-plotly-plot')) { try { fn(); } catch (e) { console.error('re-render:', e); } }
  }
  function wireOnShow() {
    TALL.ui.onShow.top30 = (panel) => rerenderIfEmpty(panel, runTop30);
    TALL.ui.onShow.dea = (panel) => rerenderIfEmpty(panel, runDea);
    TALL.ui.onShow.km = (panel) => rerenderIfEmpty(panel, runKm);
    TALL.ui.onShow.cox = (panel) => rerenderIfEmpty(panel, runCox);
  }

  /* ============================================================
     Bootstrap
  ============================================================ */
  async function init() {
    TALL.ui.init();

    // service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW falhou:', e));
    }

    // botão instalar
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $('#install-btn').hidden = false;
      $('#install-btn').addEventListener('click', () => {
        deferredPrompt.prompt();
      });
    });

    datapackControls('#dash-datapack');

    $('#top30-run').addEventListener('click', runTop30);
    $('#dea-run').addEventListener('click', runDea);
    $('#km-run').addEventListener('click', runKm);
    $('#cox-run').addEventListener('click', runCox);

    $('#clin-filter').addEventListener('input', (e) => updateClinicalTable(e.target.value));
    wireExports();
    wireOnShow();

    // carrega cache
    S.dp = await TALL.datapack.loadFromCache();
    if (S.dp) {
      datapackControls('#dash-datapack');
      renderDashboard();
      renderClinical();
      runAll();
      TALL.ui.toast('Dados carregados do cache local. Análises atualizadas.', 'ok');
    } else {
      renderDashboard();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
