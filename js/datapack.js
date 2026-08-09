/* TARGET ALL Explorer — pipeline de dados.
   Baixa, normaliza e agrega: clínicos → mapa de genes → mutações → expressão.
   Escopos: 'expresso' (painel curado) e 'completo' (todos os genes). */
(function () {
  'use strict';
  const D = {};
  const API = TALL.api;
  const ST = TALL.storage;

  /* versão do formato de dados — incrementar ao mudar a estrutura dos pacotes
     (ex.: pivotClinical) para invalidar datapacks antigos no IndexedDB */
  const DATA_VERSION = 2;

  const CLIN_ATTRS = [
    'PATIENT_ID', 'OS_MONTHS', 'OS_STATUS', 'DAYS_TO_EVENT', 'FIRST_EVENT',
    'AGE_IN_DAYS', 'GENDER', 'MOLECULAR_SUBTYPE', 'ANALYSIS_COHORT',
    'MRD_PERCENT_DAY_29', 'WBC', 'RNA_SEQ_SAMPLE', 'WES_SEQ_SAMPLE', 'AFFY_RMA_CALL'
  ];

  /* ---------- helpers ---------- */

  function pool(items, limit, worker) {
    let idx = 0, active = 0;
    return new Promise((resolve, reject) => {
      let firstErr = null, finished = 0;
      function next() {
        if (firstErr) return;
        if (idx >= items.length && active === 0) return resolve();
        while (active < limit && idx < items.length) {
          const item = items[idx++];
          active++;
          Promise.resolve(worker(item))
            .catch((e) => { firstErr = e; })
            .then(() => { active--; next(); });
        }
      }
      next();
    });
  }

  function loadGeneMap(onProgress) {
    return ST.get('genes', 'map').then((cached) => {
      if (cached) return cached;
      return API.getGenes(onProgress).then((list) => {
        const map = { sym2entrez: {}, entrez2sym: {} };
        for (const g of list) {
          if (!g.hugoGeneSymbol) continue;
          map.sym2entrez[g.hugoGeneSymbol] = g.entrezGeneId;
          map.entrez2sym[g.entrezGeneId] = g.hugoGeneSymbol;
        }
        ST.set('genes', 'map', map);
        return map;
      });
    });
  }

  function patientIdOfSample(s) {
    if (s.patientId) return s.patientId;
    return String(s.sampleId).replace(/\.\d+$/, '').replace(/-[0-9A-Za-z]+$/, '');
  }

  /* pivota linhas de clinical-data em {attributes, rows} */
  function pivotClinical(records) {
    const attrOrder = [];
    const rows = new Map();
    for (const r of records) {
      if (!rows.has(r.patientId)) { rows.set(r.patientId, {}); }
      const row = rows.get(r.patientId);
      row[r.clinicalAttributeId] = r.value;
      row.PATIENT_ID = r.patientId;
    }
    const rowArr = Array.from(rows.values());
    for (const r of records) if (!attrOrder.includes(r.clinicalAttributeId)) attrOrder.push(r.clinicalAttributeId);
    return { attributes: attrOrder, rows: rowArr };
  }

  /* ---------- fases ---------- */

  async function phaseClinical(patientIds) {
    const records = await API.fetchClinical(CLIN_ATTRS, patientIds);
    return pivotClinical(records);
  }

  async function phaseMutations(sampleIds, geneMap) {
    const raw = await API.fetchMutations(sampleIds);
    const byGene = {};
    for (const m of raw) {
      const sym = geneMap.entrez2sym[m.entrezGeneId] || String(m.entrezGeneId);
      if (!byGene[sym]) byGene[sym] = { symbol: sym, entrez: m.entrezGeneId, count: 0, samples: [], proteinChanges: {} };
      const g = byGene[sym];
      if (!g.samples.includes(m.sampleId)) {
        g.samples.push(m.sampleId);
        g.count++;
      }
      const pc = m.proteinChange || m.mutationType || '?';
      g.proteinChanges[pc] = (g.proteinChanges[pc] || 0) + 1;
    }
    return { byGene, totalSamples: sampleIds.length };
  }

  async function phaseExpression(sampleIds, genes, onProgress) {
    // genes: [{symbol, entrez}] já restritos ao mapa
    const sampleChunks = [];
    for (let i = 0; i < sampleIds.length; i += 40) sampleChunks.push(sampleIds.slice(i, i + 40));
    const geneChunks = [];
    for (let i = 0; i < genes.length; i += 1000) geneChunks.push(genes.slice(i, i + 1000));

    const perGene = new Map(); // entrez -> Float32Array
    let done = 0;
    const total = geneChunks.length * sampleChunks.length;

    await pool(geneChunks, 2, async (gc) => {
      for (const sc of sampleChunks) {
        const { json } = await API.post(
          '/molecular-profiles/' + API.PROFILE_RNA + '/molecular-data/fetch',
          { sampleIds: sc, entrezGeneIds: gc.map((g) => g.entrez) }
        );
        for (const r of json) {
          const arr = perGene.get(r.entrezGeneId);
          if (!arr) perGene.set(r.entrezGeneId, Array.from({ length: sampleIds.length }, () => NaN));
          const si = sampleIds.indexOf(r.sampleId);
          if (si >= 0) perGene.get(r.entrezGeneId)[si] = parseFloat(r.value);
        }
        done++;
        if (onProgress) onProgress(done, total);
      }
    });

    const out = [];
    for (const g of genes) {
      const values = perGene.get(g.entrez);
      if (values) out.push({ symbol: g.symbol, entrez: g.entrez, values: Float32Array.from(values) });
    }
    return out;
  }

  /* ---------- build ---------- */

  D.build = async function ({ scope, onProgress }) {
    onProgress({ phase: 'start', pct: 0, msg: 'Conectando ao cBioPortal…' });

    // 1) amostras + listas
    const samples = await API.getSamples();
    const lists = await API.getSampleLists();
    const listById = Object.fromEntries(lists.map((l) => [l.sampleListId, l]));

    // amostras RNA
    let rnaSampleIds;
    const rnaList = listById[API.PROFILE_RNA];
    if (rnaList) rnaSampleIds = await API.getSampleListIds(API.PROFILE_RNA);
    else rnaSampleIds = samples.filter((s) => s.sampleType === 'RNA' || (s.sampleId + '').startsWith('TARGET-')).map((s) => s.sampleId);
    rnaSampleIds = rnaSampleIds.filter((id) => !String(id).includes('.'));
    onProgress({ phase: 'samples', pct: 5, msg: rnaSampleIds.length + ' amostras RNA' });

    // amostras sequenciadas (mutações)
    let seqSampleIds;
    const seqList = listById[API.PROFILE_MUT] ||
      Object.values(listById).find((l) => /sequenced/i.test(l.sampleListId)) ||
      Object.values(listById).find((l) => /mutation_data/i.test(l.category || ''));
    if (seqList) seqSampleIds = await API.getSampleListIds(seqList.sampleListId);
    else seqSampleIds = rnaSampleIds;
    seqSampleIds = seqSampleIds.filter((id) => !String(id).includes('.'));

    // pacientes únicos a partir das amostras RNA
    const sampleToPatient = new Map();
    for (const s of samples) sampleToPatient.set(s.sampleId, patientIdOfSample(s));
    const patients = Array.from(new Set(rnaSampleIds.map((id) => sampleToPatient.get(id)).filter(Boolean)));
    onProgress({ phase: 'samples', pct: 10, msg: patients.length + ' pacientes' });

    // 2) dados clínicos
    onProgress({ phase: 'clinical', pct: 12, msg: 'Baixando dados clínicos…' });
    const clinical = await phaseClinical(patients);
    onProgress({ phase: 'clinical', pct: 18, msg: 'Clínicos OK (' + clinical.rows.length + ' pacientes)' });

    // 3) mapa de genes
    onProgress({ phase: 'genes', pct: 20, msg: 'Baixando mapa de genes…' });
    const geneMap = await loadGeneMap();
    onProgress({ phase: 'genes', pct: 24, msg: 'Mapa de genes OK (' + Object.keys(geneMap.sym2entrez).length + ' símbolos)' });

    // 4) mutações
    onProgress({ phase: 'mutations', pct: 26, msg: 'Baixando mutações (' + seqSampleIds.length + ' amostras)…' });
    const mut = await phaseMutations(seqSampleIds, geneMap);
    onProgress({ phase: 'mutations', pct: 34, msg: 'Mutações OK (' + Object.keys(mut.byGene).length + ' genes mutados)' });

    // 5) expressão — escolha do escopo
    let genes;
    if (scope === 'completo') {
      genes = Object.entries(geneMap.sym2entrez).map(([symbol, entrez]) => ({ symbol, entrez }));
    } else {
      const curated = TALL.CURATED_GENES.map((sym) => geneMap.sym2entrez[sym] ? { symbol: sym, entrez: geneMap.sym2entrez[sym] } : null).filter(Boolean);
      const mutated = Object.entries(mut.byGene).map(([sym, g]) => ({ symbol: sym, entrez: g.entrez }));
      const seen = new Set();
      genes = curated.concat(mutated).filter((g) => { if (seen.has(g.symbol)) return false; seen.add(g.symbol); return true; });
    }

    onProgress({ phase: 'expression', pct: 35, msg: 'Baixando expressão (' + genes.length + ' genes × ' + rnaSampleIds.length + ' amostras)…' });
    const expr = await phaseExpression(rnaSampleIds, genes, (d, t) => {
      onProgress({ phase: 'expression', pct: 35 + Math.round(60 * d / t), msg: 'Expressão: ' + d + '/' + t + ' blocos' });
    });
    onProgress({ phase: 'expression', pct: 96, msg: 'Expressão OK (' + expr.length + ' genes)' });

    // 6) persistência
    const geneMeta = expr.map((g) => ({ symbol: g.symbol, entrez: g.entrez }));
    const pack = {
      scope,
      dataVersion: DATA_VERSION,
      buildDate: new Date().toISOString(),
      rnaSampleIds, seqSampleIds,
      sampleToPatient: Object.fromEntries(sampleToPatient),
      nPatients: patients.length
    };
    await ST.set('meta', 'pack', pack);
    await ST.set('clinical', 'all', clinical);
    await ST.set('mut', 'agg', mut);
    await ST.set('expr', 'meta', { sampleIds: rnaSampleIds, geneMeta });
    await ST.putMany('expr', expr.map((g) => ['expr:' + g.entrez, g.values]));

    onProgress({ phase: 'done', pct: 100, msg: 'Pronto!' });
    return pack;
  };

  /* monta datapack em memória a partir do cache (para análises) */
  D.loadFromCache = async function () {
    const pack = await ST.get('meta', 'pack');
    if (!pack) return null;
    if (pack.dataVersion !== DATA_VERSION) return null;
    const clinical = await ST.get('clinical', 'all');
    const mut = await ST.get('mut', 'agg');
    const emeta = await ST.get('expr', 'meta');
    const geneMeta = emeta.geneMeta;
    const expr = [];
    for (const g of geneMeta) {
      const vals = await ST.get('expr', 'expr:' + g.entrez);
      if (vals) expr.push({ symbol: g.symbol, entrez: g.entrez, values: vals });
    }
    return {
      pack, clinical, mut, rnaSampleIds: emeta.sampleIds,
      sampleToPatient: new Map(Object.entries(pack.sampleToPatient || {})),
      geneMeta, expr
    };
  };

  D.clear = async function () {
    await ST.clear('clinical'); await ST.clear('mut'); await ST.clear('expr');
    await ST.clear('meta'); await ST.clear('results');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else window.TALL = window.TALL || {}, window.TALL.datapack = D;
})();
