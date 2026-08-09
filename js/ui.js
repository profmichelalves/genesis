/* Genesis — UI: abas, toast, modal, tabelas, progresso, tema. */
(function () {
  'use strict';
  const U = {};

  const $ = (sel) => document.querySelector(sel);

  /* ---------- abas ---------- */
  U.init = function () {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => U.goto(btn.dataset.panel));
    });
    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => U.goto(btn.dataset.goto));
    });
    $('#theme-btn').addEventListener('click', U.toggleTheme);

    const root = document.getElementById('modal-root');
    root.addEventListener('click', (ev) => {
      if (ev.target === root) U.closeModal();
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') U.closeModal(); });

    // ajuda dos gráficos: ícone "i" ([data-help]) abre modal com a explicação
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest ? ev.target.closest('[data-help]') : null;
      if (!btn) return;
      const entry = helpMap[btn.getAttribute('data-help')];
      if (entry) U.modal(entry.title, entry.html);
    });

    U.applyTheme(localStorage.getItem('tall-theme') || 'light');
  };

  let helpMap = {};
  U.setHelp = function (map) { helpMap = map || {}; };

  U.goto = function (name) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.add('active');
    const tab = document.querySelector('.tab[data-panel="' + name + '"]');
    if (tab) tab.setAttribute('aria-selected', 'true');
    window.scrollTo({ top: 0 });
    // gráficos Plotly criados enquanto o painel estava oculto (display:none)
    // nascem com 0×0 — redimensiona ao exibir a aba e dá chance de
    // re-renderizar análises cujos plots ainda não foram criados.
    if (panel && window.Plotly) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        panel.querySelectorAll('.plot').forEach((el) => {
          try { if (el.classList.contains('js-plotly-plot')) Plotly.Plots.resize(el); } catch (e) {}
        });
        const fn = U.onShow[name];
        if (fn) { try { fn(panel); } catch (e) {} }
      }));
    }
  };

  /* callbacks por painel (ex.: re-renderizar análise se o plot ainda não existe) */
  U.onShow = {};

  /* ---------- tema ---------- */
  U.toggleTheme = function () {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    U.applyTheme(cur === 'dark' ? 'light' : 'dark');
    localStorage.setItem('tall-theme', document.documentElement.dataset.theme);
  };
  U.applyTheme = function (name) {
    document.documentElement.dataset.theme = name;
  };

  /* ---------- toast ---------- */
  let toastTimer = null;
  U.toast = function (msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 4200);
  };

  /* ---------- modal ---------- */
  U.modal = function (title, bodyHtml) {
    const root = document.getElementById('modal-root');
    root.className = 'modal-backdrop';
    root.innerHTML =
      '<div class="modal">' +
      '<div class="modal-head"><h3>' + title + '</h3><button class="icon-btn" data-close>✕</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div></div>';
    root.classList.add('open');
    root.querySelector('[data-close]').addEventListener('click', U.closeModal);
  };
  U.closeModal = function () {
    const root = document.getElementById('modal-root');
    root.classList.remove('open');
    root.innerHTML = '';
  };

  /* ---------- progresso (download de dados) ---------- */
  U.progress = function (pct, msg) {
    const bar = document.getElementById('progress-bar');
    bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    bar.classList.toggle('active', pct > 0 && pct < 100);
    if (msg) {
      const el = document.getElementById('datapack-status');
      if (el) el.textContent = msg;
    }
  };

  /* ---------- tabelas ---------- */
  U.renderTable = function (el, headers, rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) { el.innerHTML = '<tr><td class="muted">Sem dados</td></tr>'; return; }
    let html = '<thead><tr>' + headers.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>';
    const limit = opts.limit || rows.length;
    for (let i = 0; i < Math.min(rows.length, limit); i++) {
      html += '<tr>' + rows[i].map((v) => '<td>' + v + '</td>').join('') + '</tr>';
    }
    html += '</tbody>';
    el.innerHTML = html;
  };

  /* ---------- spinner / busy ---------- */
  U.busy = function (msg) {
    U.toast(msg || 'Processando…', 'info');
  };

  /* ---------- loading (overlay com o layout do ícone) ---------- */
  let loadingEl = null;
  U.loading = function (msg) {
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.className = 'loading-backdrop';
      loadingEl.setAttribute('role', 'status');
      loadingEl.setAttribute('aria-live', 'polite');
      loadingEl.innerHTML =
        '<div class="loading"><div class="loading-box">' +
        '<img class="loading-logo" src="icons/icon-192.png" alt="" />' +
        '<span class="loading-ring"></span></div>' +
        '<p class="loading-msg" id="loading-msg">Carregando…</p></div>';
      document.body.appendChild(loadingEl);
    }
    const m = loadingEl.querySelector('#loading-msg');
    if (msg) m.textContent = msg;
    loadingEl.classList.add('open');
  };
  U.endLoading = function () {
    if (loadingEl) loadingEl.classList.remove('open');
  };

  window.TALL = window.TALL || {}; window.TALL.ui = U;
})();
