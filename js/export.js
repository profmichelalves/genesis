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

  window.TALL = window.TALL || {}; window.TALL.export = E;
})();
