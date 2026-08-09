/* Genesis — camada IndexedDB.
   Guarda: metadados, dados clínicos, mapa de genes, linhas de expressão
   (Float32Array por gene), agregação de mutações, resultados e histórico. */
(function () {
  'use strict';
  const DB_NAME = 'tall-explorer';
  const DB_VERSION = 1;
  const STORES = ['meta', 'clinical', 'genes', 'expr', 'mut', 'results', 'settings', 'history'];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function toPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const ST = {};

  ST.get = function (store, key) {
    return open().then((db) => toPromise(db.transaction(store, 'readonly').objectStore(store).get(key)))
      .then((v) => v || null);
  };

  ST.set = function (store, key, value) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value, key);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  };

  ST.del = function (store, key) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).delete(key);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  };

  ST.clear = function (store) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).clear();
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  };

  ST.keys = function (store) {
    return open().then((db) => toPromise(db.transaction(store, 'readonly').objectStore(store).getAllKeys()));
  };

  ST.getAll = function (store) {
    return open().then((db) => toPromise(db.transaction(store, 'readonly').objectStore(store).getAll()));
  };

  /* grava muitos valores em uma transação */
  ST.putMany = function (store, entries) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const [k, v] of entries) s.put(v, k);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
  else window.TALL = window.TALL || {}, window.TALL.storage = ST;
})();
