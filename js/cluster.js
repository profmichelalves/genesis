/* Genesis — Agrupamento hierárquico aglomerativo (complete linkage)
   usado para ordenar linhas/colunas do heatmap (análogo ao pheatmap do R).
   Retorna a ordem das folhas (itens originais). */
(function () {
  'use strict';
  const C = {};

  function euclidean(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  /* rows: matriz de distâncias entre itens é derivada de `matrix` (linhas = itens, colunas = dimensões).
     Retorna array com índices originais na ordem do dendrograma. */
  C.orderByClustering = function (matrix) {
    const n = matrix.length;
    if (n <= 1) return matrix.map((_, i) => i);
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) D[i][j] = D[j][i] = euclidean(matrix[i], matrix[j]);

    // clusters: cada um com {members: [idx originais]}
    let clusters = matrix.map((_, i) => ({ members: [i] }));
    const links = []; // {a, b, dist, size}
    let active = clusters.map((_, i) => i);

    while (active.length > 1) {
      let bestA = -1, bestB = -1, bestD = Infinity;
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i], b = active[j];
          // complete linkage: máxima distância entre membros
          let dMax = 0;
          for (const m of clusters[a].members)
            for (const k of clusters[b].members) dMax = Math.max(dMax, D[m][k]);
          if (dMax < bestD) { bestD = dMax; bestA = i; bestB = j; }
        }
      }
      const ca = clusters[active[bestA]], cb = clusters[active[bestB]];
      const merged = { members: ca.members.concat(cb.members), a: ca, b: cb };
      links.push({ a: ca, b: cb, dist: bestD, size: merged.members.length });
      clusters.push(merged);
      const newIdx = clusters.length - 1;
      active.splice(Math.max(bestA, bestB), 1);
      active.splice(Math.min(bestA, bestB), 1);
      active.push(newIdx);
    }

    // ordena folhas pelo dendrograma com heurística de mediana para reduzir cruzamentos
    const order = [];
    function visit(node, depth) {
      if (!node.a) { order.push(node.members[0]); return; }
      const aMedian = medianOf(node.a.members.map((i) => i));
      const bMedian = medianOf(node.b.members.map((i) => i));
      visit(aMedian < bMedian ? node.a : node.b, depth + 1);
      visit(aMedian < bMedian ? node.b : node.a, depth + 1);
    }
    visit(links[links.length - 1], 0);
    return order;
  };

  function medianOf(arr) {
    const s = arr.slice().sort((x, y) => x - y);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else window.TALL = window.TALL || {}, window.TALL.cluster = C;
})();
