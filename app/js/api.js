/* TARGET ALL Explorer — cliente da API pública do cBioPortal.
   Endpoints validados em 2026-08-08 (ver PLANO_APP.md, seção 3). */
(function () {
  'use strict';
  const API = {};
  API.BASE = 'https://www.cbioportal.org/api';
  API.STUDY_ID = 'all_phase2_target_2018_pub';
  API.PROFILE_MUT = 'all_phase2_target_2018_pub_mutations';
  API.PROFILE_RNA = 'all_phase2_target_2018_pub_rna_seq_mrna';

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  API.chunkArray = chunkArray;

  async function httpJson(url, opts) {
    const maxAttempts = 4;
    let lastErr = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url, opts);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error('HTTP ' + res.status + ' — ' + text.slice(0, 160));
        }
        const total = res.headers.get('total-count');
        return { json: await res.json(), totalCount: total ? parseInt(total, 10) : null };
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastErr;
  }

  API.get = (path) => httpJson(API.BASE + path, { headers: { Accept: 'application/json' } });
  API.post = (path, body) =>
    httpJson(API.BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });

  API.getStudy = async () => (await API.get('/studies/' + API.STUDY_ID)).json;
  API.getSamples = async () => (await API.get('/studies/' + API.STUDY_ID + '/samples')).json;
  API.getSampleLists = async () => (await API.get('/studies/' + API.STUDY_ID + '/sample-lists')).json;
  API.getSampleListIds = async (listId) => (await API.get('/sample-lists/' + listId + '/sample-ids')).json;
  API.getClinicalAttributes = async () => (await API.get('/studies/' + API.STUDY_ID + '/clinical-attributes')).json;

  /* dados clínicos por paciente, paginado por chunks de ids */
  API.fetchClinical = async function (attributeIds, patientIds, onChunk) {
    const out = [];
    const chunks = chunkArray(patientIds, 400);
    for (let i = 0; i < chunks.length; i++) {
      const { json } = await API.post(
        '/studies/' + API.STUDY_ID + '/clinical-data/fetch?clinicalDataType=PATIENT&projection=DETAILED&pageSize=10000',
        { attributeIds: attributeIds, ids: chunks[i] }
      );
      for (const r of json) out.push(r);
      if (onChunk) onChunk(i + 1, chunks.length);
    }
    return out;
  };

  /* mutações (MAF), paginado por chunks de amostras */
  API.fetchMutations = async function (sampleIds, onChunk) {
    const out = [];
    const chunks = chunkArray(sampleIds, 40);
    for (let i = 0; i < chunks.length; i++) {
      const { json } = await API.post(
        '/molecular-profiles/' + API.PROFILE_MUT + '/mutations/fetch?projection=DETAILED',
        { sampleIds: chunks[i] }
      );
      for (const r of json) out.push(r);
      if (onChunk) onChunk(i + 1, chunks.length);
    }
    return out;
  };

  /* dados moleculares (expressão RPKM) — requer entrezGeneIds para respeitar o
     filtro de amostras. Paginado por genes e por amostras. */
  API.fetchMolecularData = async function (sampleIds, entrezGeneIds, onProgress) {
    const out = [];
    const geneChunks = chunkArray(entrezGeneIds, 1000);
    const sampleChunks = chunkArray(sampleIds, 40);
    const total = geneChunks.length * sampleChunks.length;
    let done = 0;
    for (const gc of geneChunks) {
      for (const sc of sampleChunks) {
        const { json } = await API.post(
          '/molecular-profiles/' + API.PROFILE_RNA + '/molecular-data/fetch',
          { sampleIds: sc, entrezGeneIds: gc }
        );
        for (const r of json) out.push(r);
        done++;
        if (onProgress) onProgress(done, total, out.length);
      }
    }
    return out;
  };

  /* lista completa de genes (símbolo ↔ entrez), paginado */
  API.getGenes = async function (onProgress) {
    const out = [];
    const pageSize = 1000;
    for (let page = 0; page < 40; page++) {
      const { json } = await API.get('/genes?pageSize=' + pageSize + '&pageNumber=' + page);
      for (const g of json) out.push(g);
      if (onProgress) onProgress(out.length);
      if (json.length < pageSize) break;
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else window.TALL = window.TALL || {}, window.TALL.api = API;
})();
