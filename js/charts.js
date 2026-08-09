/* TARGET ALL Explorer — wrappers Plotly para os 6 blocos do Script.R. */
(function () {
  'use strict';
  const C = {};

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function theme() {
    return {
      paper: cssVar('--card-bg', '#ffffff'),
      text: cssVar('--text', '#1a1f2e'),
      grid: cssVar('--border', '#e5e7eb')
    };
  }
  const CFG = { displaylogo: false, responsive: true };

  /* Plotly.getGraphDiv faz getElementById(id) — id com '#' nunca casa.
     Converte seletor '#x' → elemento DOM. */
  function resolve(sel) {
    return typeof sel === 'string' && sel.charAt(0) === '#' ? document.querySelector(sel) : sel;
  }
  const LAYOUT_BASE = () => {
    const t = theme();
    return {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: t.text, family: '-apple-system, Segoe UI, Roboto, sans-serif' },
      margin: { l: 70, r: 20, t: 40, b: 50 },
      autosize: true
    };
  };

  /* Bloco 1 — Top 30 genes mutados (rows: {Gene, N}) */
  C.top30 = function (div, rows) {
    const items = rows.slice().sort((a, b) => b.N - a.N).slice(0, 30).reverse();
    const data = [{
      type: 'bar', orientation: 'h',
      x: items.map((g) => g.N),
      y: items.map((g) => g.Gene),
      marker: { color: '#4c78a8' },
      hovertemplate: '%{y}: %{x} amostras<extra></extra>'
    }];
    const layout = Object.assign(LAYOUT_BASE(), {
      title: 'Top 30 genes mutados',
      xaxis: { title: 'Nº de amostras mutadas', gridcolor: theme().grid },
      yaxis: { automargin: true, tickfont: { size: 11 } },
      bargap: 0.35
    });
    Plotly.react(resolve(div), data, layout, CFG);
  };

  /* Bloco 2 — Volcano plot (DEA) */
  C.volcano = function (div, table) {
    const up = table.filter((r) => r.color_grp === 'Upregulado');
    const down = table.filter((r) => r.color_grp === 'Downregulado');
    const ns = table.filter((r) => r.color_grp === 'NS');
    const mk = (rows, color) => ({
      x: rows.map((r) => r.logFC), y: rows.map((r) => -Math.log10(Math.max(r['adj.P.Val'], 1e-300))),
      text: rows.map((r) => r.gene), mode: 'markers',
      type: 'scatter', name: '',
      marker: { size: 4, color, opacity: 0.7 },
      hovertemplate: '%{text}<br>log2FC=%{x:.2f}<br>-log10(adj.p)=%{y:.2f}<extra></extra>'
    });
    const data = [
      mk(up, '#d64545'), mk(down, '#2d6cdf'), mk(ns, '#9aa3af')
    ];
    const layout = Object.assign(LAYOUT_BASE(), {
      title: 'Volcano — Relapse vs None (adj. p)',
      xaxis: { title: 'log2FC', gridcolor: theme().grid },
      yaxis: { title: '-log10(adj. p)', gridcolor: theme().grid },
      shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: theme().grid, dash: 'dot' } }]
    });
    Plotly.react(resolve(div), data, layout, CFG);
  };

  /* Bloco 3 — MA plot */
  C.ma = function (div, table) {
    const mk = (rows, color) => ({
      x: rows.map((r) => r.meanExpr), y: rows.map((r) => r.logFC),
      text: rows.map((r) => r.gene), mode: 'markers', type: 'scatter',
      marker: { size: 4, color, opacity: 0.7 },
      hovertemplate: '%{text}<br>A=%{x:.2f}<br>M=%{y:.2f}<extra></extra>'
    });
    const up = table.filter((r) => r.color_grp === 'Upregulado');
    const down = table.filter((r) => r.color_grp === 'Downregulado');
    const ns = table.filter((r) => r.color_grp === 'NS');
    const data = [mk(up, '#d64545'), mk(down, '#2d6cdf'), mk(ns, '#9aa3af')];
    const layout = Object.assign(LAYOUT_BASE(), {
      title: 'MA plot (média vs razão)',
      xaxis: { title: 'Média de expressão (A)', gridcolor: theme().grid },
      yaxis: { title: 'log2FC (M)', gridcolor: theme().grid }
    });
    Plotly.react(resolve(div), data, layout, CFG);
  };

  /* Bloco 4 — Heatmap (z-score, ordenado por cluster e por grupo clínico) */
  C.heatmap = function (div, data) {
    // data: { genes: [...], sampleLabels: [...], groupColors: [...], z: [...], groupNames: [...] }
    const t = theme();
    const layout = Object.assign(LAYOUT_BASE(), {
      title: 'Heatmap — top genes por variância (z-score)',
      xaxis: { showticklabels: false, title: 'Amostras' },
      yaxis: { automargin: true },
      height: Math.max(360, 200 + data.genes.length * 14)
    });
    const trace = {
      type: 'heatmap',
      z: data.z, x: data.sampleLabels, y: data.genes,
      colorscale: [
        [0, '#2b4bd8'], [0.5, '#f7f7f7'], [1, '#c23b3b']
      ],
      zmid: 0, showscale: true,
      colorbar: { title: 'z-score', titleside: 'right' }
    };
    Plotly.react(resolve(div), [trace], layout, CFG);
  };

  /* Bloco 5 — Kaplan-Meier com tabela de risco.
     result: { km: [{name,n,times,surv,nRisk,censor}], logRank: {p} } */
  C.km = function (div, result, meta) {
    const t = theme();
    const palette = ['#c23b3b', '#2d6cdf', '#2f9e6e', '#b07a2e', '#7b4cc2'];
    const groups = result.km;
    const logRank = result.logRank;
    const traces = [];
    groups.forEach((g, i) => {
      const color = palette[i % palette.length];
      traces.push({
        type: 'scatter', mode: 'lines', name: g.name + ' (n=' + g.n + ')',
        x: g.times, y: g.surv,
        line: { color: color, width: 2.2 },
        hovertemplate: 't=%{x}<br>S=%{y:.3f}<extra>' + g.name + '</extra>'
      });
      const cTimes = g.times.filter((_, k) => g.censor[k] > 0);
      const cSurv = g.times.filter((_, k) => g.censor[k] > 0).map((_, k2) => g.surv[k2]);
      if (cTimes.length) {
        traces.push({
          type: 'scatter', mode: 'markers', name: g.name + ' censura',
          x: cTimes, y: cSurv,
          marker: { symbol: 'line-ns', size: 7, color: color }, showlegend: false,
          hoverinfo: 'skip'
        });
      }
    });
    const layout = Object.assign(LAYOUT_BASE(), {
      title: (meta && meta.title) || 'Sobrevivência global — Kaplan-Meier',
      xaxis: { title: 'Meses', gridcolor: t.grid },
      yaxis: { title: 'Probabilidade de sobrevida', gridcolor: t.grid, range: [0, 1] },
      annotations: [],
      height: Math.max(380, 300 + groups[0].nRisk.length * 18)
    });
    if (logRank) {
      layout.annotations.push({
        x: 0.98, y: 0.95, xref: 'paper', yref: 'paper', xanchor: 'right',
        text: 'p = ' + logRank.p.toExponential(2),
        showarrow: false, font: { size: 14, color: t.text },
        bgcolor: 'rgba(255,255,255,0.55)'
      });
    }
    Plotly.react(resolve(div), traces, layout, CFG);
  };

  /* Bloco 6 — Forest plot (Cox univariado: {Gene, HR, HR_lower, HR_upper, p_value}) */
  C.forest = function (div, rows) {
    const items = rows.slice().reverse();
    const t = theme();
    const data = [{
      type: 'scatter', mode: 'markers',
      x: items.map((r) => r.HR), y: items.map((r) => r.Gene),
      error_x: {
        type: 'data', symmetric: false,
        array: items.map((r) => r.HR_upper - r.HR),
        arrayminus: items.map((r) => r.HR - r.HR_lower)
      },
      marker: { color: items.map((r) => r.p_value < 0.05 ? '#d64545' : '#9aa3af'), size: 8 },
      hovertemplate: '%{y}<br>HR=%{x:.2f}<extra></extra>'
    }];
    const layout = Object.assign(LAYOUT_BASE(), {
      title: 'Cox univariado — HR por gene (OS)',
      xaxis: { title: 'Hazard ratio (log)', type: 'log', gridcolor: t.grid,
        range: [Math.log(Math.min.apply(null, items.map((r) => r.HR_lower))) / Math.LN10 - 0.3,
                Math.log(Math.max.apply(null, items.map((r) => r.HR_upper))) / Math.LN10 + 0.3] },
      yaxis: { automargin: true },
      shapes: [{ type: 'line', x0: 1, x1: 1, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: '#c23b3b', dash: 'dot' } }],
      height: Math.max(320, items.length * 22)
    });
    Plotly.react(resolve(div), [data], layout, CFG);
  };

  C.theme = theme;

  window.TALL = window.TALL || {}; window.TALL.charts = C;
})();
