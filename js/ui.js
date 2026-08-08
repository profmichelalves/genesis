/* TARGET ALL Explorer — UI: abas, toast, modal, tabelas, progresso, tema. */
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

    U.applyTheme(localStorage.getItem('tall-theme') || 'light');
  };

  U.goto = function (name) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.add('active');
    const tab = document.querySelector('.tab[data-panel="' + name + '"]');
    if (tab) tab.setAttribute('aria-selected', 'true');
    window.scrollTo({ top: 0 });
  };

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

  window.TALL = window.TALL || {}; window.TALL.ui = U;
})();
