/* TARGET ALL Explorer — exportações: CSV, imagens (Plotly) e relatório consolidado. */
(function () {
  'use strict';
  const E = {};

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function escCSV(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  E.csv = function (filename, headers, rows) {
    const lines = [headers.map(escCSV).join(';')];
    for (const r of rows) lines.push(r.map(escCSV).join(';'));
    download(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
  };

  E.png = async function (div, filename) {
    const img = await Plotly.toImage(document.getElementById(div), { format: 'png', width: 1200, height: 800, scale: 2 });
    download(await (await fetch(img)).blob(), filename);
  };

  E.svg = async function (div, filename) {
    const svg = await Plotly.toImage(document.getElementById(div), { format: 'svg', width: 1200, height: 800 });
    download(await (await fetch(svg)).blob(), filename);
  };

  /* Relatório em texto (Markdown) com os principais resultados */
  E.report = function (state) {
    const L = [];
    const now = new Date().toLocaleString('pt-BR');
    L.push('# Relatório TARGET ALL (B-ALL pediátrica)');
    L.push('');
    L.push('Gerado em: ' + now);
    L.push('');
    if (state.meta && state.meta.pack) {
      const p = state.meta.pack;
      L.push('## Escopo dos dados');
      L.push('- Modo: **' + (p.scope === 'completo' ? 'Completo' : 'Expresso (painel curado)') + '**');
      L.push('- Pacientes: ' + p.nPatients + ' | Amostras RNA: ' + p.rnaSampleIds.length + ' | Amostras WES: ' + p.seqSampleIds.length);
      L.push('- Genes com expressão: ' + (state.meta.geneMeta ? state.meta.geneMeta.length : '-'));
      L.push('- Construído em: ' + p.buildDate);
      L.push('');
    }
    if (state.mut && state.mut.byGene) {
      L.push('## Bloco 1 — Top genes mutados');
      const top = Object.values(state.mut.byGene).sort((a, b) => b.count - a.count).slice(0, 10);
      L.push('| Gene | N amostras |');
      L.push('|------|-----------|');
      for (const g of top) L.push('| ' + g.symbol + ' | ' + g.count + ' |');
      L.push('');
    }
    if (state.deaResult) {
      const d = state.deaResult;
      const sig = d.table.filter((r) => r.signif !== 'NS');
      const up = sig.filter((r) => r.color_grp === 'Upregulado');
      const down = sig.filter((r) => r.color_grp === 'Downregulado');
      L.push('## Bloco 2/3 — Expressão diferencial (Relapse vs Não)');
      L.push('- Transformação: ' + (d.transform === 'log2' ? 'log2(RPKM+1)' : 'sem transformação'));
      L.push('- Genes totais: ' + d.table.length + ' | DE (p<0.05): ' + sig.length + ' | Up: ' + up.length + ' | Down: ' + down.length);
      L.push('- Mediana de genes DE (log2FC): ' + (sig.length ? median(sig.map((r) => r.logFC)).toFixed(3) : '-'));
      L.push('');
    }
    const kmFirst = state.kmResults && Object.keys(state.kmResults)[0];
    if (kmFirst) {
      const k = state.kmResults[kmFirst];
      L.push('## Bloco 5 — Kaplan-Meier (OS, mediana de expressão)');
      L.push('- Cutoff: mediana por gene (' + k.medianCut.toFixed(2) + ')');
      L.push('- Log-rank (ex.: ' + kmFirst + '): χ²=' + k.logRank.chi2.toFixed(2) + ', p=' + k.logRank.p.toExponential(2));
      L.push('');
    }
    if (state.coxUni) {
      L.push('## Bloco 6 — Cox univariado');
      L.push('| Gene | HR | IC95% | p |');
      L.push('|------|----|-------|---|');
      const top = state.coxUni.slice(0, 10);
      for (const r of top) L.push('| ' + r.Gene + ' | ' + r.HR.toFixed(2) + ' | ' + r.HR_lower.toFixed(2) + '–' + r.HR_upper.toFixed(2) + ' | ' + r.p_value.toExponential(2) + ' |');
      L.push('');
    }
    download(new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' }), 'relatorio-tall.md');
  };

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  window.TALL = window.TALL || {}; window.TALL.export = E;
})();
