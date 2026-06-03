/* =========================================================================
   Sage — little delights
   Cursor-curious fireflies live in app.js; this file adds the playful bits:
   click to release a firefly, a couple of keyboard charms, and a hidden
   sage> shell whose unknown commands answer in Firefly's own voice.
   ========================================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fire(detail) {
    if (reduceMotion) return;
    window.dispatchEvent(new CustomEvent('sage:firefly', { detail: detail || {} }));
  }

  /* ---- click empty space to release a firefly ------------------------ */
  document.addEventListener('click', function (e) {
    if (reduceMotion) return;
    if (e.target.closest('a, button, input, textarea, label, .sage-repl, .flick-stage, .hamburger')) return;
    if (window.getSelection && String(window.getSelection())) return;   // not while selecting text
    fire({ x: e.clientX, y: e.clientY, count: 3 });
  });

  /* ---- the hidden sage repl ------------------------------------------ */
  var repl = null, out = null, input = null, opened = false;
  var history = [], hi = 0;

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function build() {
    repl = document.createElement('div');
    repl.className = 'sage-repl';
    repl.setAttribute('role', 'dialog');
    repl.setAttribute('aria-label', 'Sage REPL');
    repl.innerHTML =
      '<div class="repl-chrome">' +
        '<button class="dot dot-red repl-light" type="button" data-act="reset" aria-label="Close and reset" title="close + reset"></button>' +
        '<button class="dot dot-yellow repl-light" type="button" data-act="min" aria-label="Minimize" title="minimize"></button>' +
        '<button class="dot dot-green repl-light" type="button" data-act="spark" aria-label="Close with a sparkle" title="close \u2726"></button>' +
        '<span class="repl-title"><span class="glyph">\u2726</span> sage repl</span>' +
        '<button class="repl-close" type="button" aria-label="Close">esc</button>' +
      '</div>' +
      '<div class="repl-out"></div>' +
      '<div class="repl-input-row">' +
        '<span class="repl-prompt">sage&gt;</span>' +
        '<input class="repl-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="REPL input">' +
      '</div>';
    document.body.appendChild(repl);
    out = repl.querySelector('.repl-out');
    input = repl.querySelector('.repl-input');
    repl.querySelector('.repl-close').addEventListener('click', closeRepl);
    repl.querySelectorAll('.repl-light').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var act = b.dataset.act;
        if (act === 'reset') resetRepl();
        else if (act === 'min') toggleMin();
        else if (act === 'spark') sparkleClose();
      });
    });
    repl.querySelector('.repl-chrome').addEventListener('click', function (e) {
      if (e.target.closest('.repl-light') || e.target.closest('.repl-close')) return;
      if (repl.classList.contains('minimized')) { repl.classList.remove('minimized'); input.focus(); }
    });
    repl.addEventListener('mousedown', function (e) {
      if (e.target.closest('.repl-light') || e.target.closest('.repl-close')) return;
      if (e.target !== input) { e.preventDefault(); input.focus(); }
    });
    input.addEventListener('keydown', onKey);
  }

  function print(html, cls) {
    var row = document.createElement('div');
    row.className = 'row' + (cls ? ' ' + cls : '');
    row.innerHTML = html;
    out.appendChild(row);
    out.scrollTop = out.scrollHeight;
  }

  function openRepl() {
    if (!repl) build();
    repl.classList.add('open');
    if (!out.dataset.greeted) {
      print('<span class="firefly">\u2726</span> a little sage shell. type <span class="kw">help</span>. <span class="cmt">(esc closes)</span>');
      out.dataset.greeted = '1';
    }
    opened = true;
    setTimeout(function () { input.focus(); }, 60);
  }
  function closeRepl() {
    if (!repl) return;
    repl.classList.remove('open');
    opened = false;
    input.blur();
  }

  // red — close and wipe the slate clean
  function resetRepl() {
    out.innerHTML = '';
    delete out.dataset.greeted;
    history = []; hi = 0;
    input.value = '';
    repl.classList.remove('minimized');
    closeRepl();
  }
  // yellow — collapse to the title bar, but keep everything you typed
  function toggleMin() {
    if (repl.classList.toggle('minimized')) { input.blur(); }
    else { input.focus(); }
  }
  // green — send it off with a little shower of light
  function sparkleClose() {
    var r = repl.getBoundingClientRect();
    fire({ x: r.left + r.width / 2, y: r.top + 12, count: 8 });
    fire({ count: 6 });
    repl.classList.remove('minimized');
    closeRepl();
  }

  /* edit-distance, so Firefly can say "did you mean?" */
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
          d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
    }
    return d[m][n];
  }

  var COMMANDS = {
    help: function () {
      print('commands \u00b7 <span class="kw">hello</span> <span class="kw">sage</span> <span class="kw">firefly</span> <span class="kw">sparkle</span> <span class="kw">wish</span> <span class="kw">gc</span> <span class="kw">moss</span> <span class="kw">about</span> <span class="kw">clear</span>');
    },
    hello: function () { print('<span class="out">hello, world</span>'); },
    sage: function () {
      print('<span class="str">"a friendlier language, for kinder times."</span>');
      print('<span class="cmt"># you\u2019re already home. \u2726</span>');
    },
    firefly: function () { fire({ count: 10 }); print('<span class="firefly">\u2726</span> released a few fireflies into the night.'); },
    fireflies: function () { COMMANDS.firefly(); },
    sparkle: function () { fire({ count: 6 }); print('<span class="firefly">\u2726 \u2735 \u2726</span> <span class="cmt">a small shower of light.</span>'); },
    wish: function () { fire({ wish: true, count: 1 }); print('<span class="cmt"># make a wish.</span> <span class="firefly">\u2726</span>'); },
    gc: function () {
      print('<span class="out">SageGC swept the room.</span>');
      print('<span class="cmt"># collected 0 worries \u00b7 nothing to clean up.</span>');
    },
    moss: function () { print('<span class="cmt"># you find: a quiet pond, some moss, a jar of fireflies.</span>'); },
    about: function () { print('<span class="out">sage</span> <span class="cmt">\u00b7 alpha \u00b7 built honestly \u00b7 MIT license</span>'); },
    sudo: function () { print('<span class="cmt"># no need \u2014 sage already trusts you. \u2726</span>'); },
    clear: function () { out.innerHTML = ''; }
  };
  var ALIASES = { ls: 'moss', dir: 'moss', look: 'moss', version: 'about', cls: 'clear', '?': 'help' };

  function run(raw) {
    print('<span class="repl-prompt">sage&gt;</span> ' + esc(raw), 'echo');
    var cmd = raw.trim().toLowerCase();
    if (!cmd) return;
    if (ALIASES[cmd]) cmd = ALIASES[cmd];
    if (COMMANDS[cmd]) { COMMANDS[cmd](); return; }
    // Firefly-style suggestion — the same voice the errors section is proud of
    var best = null, bd = 99;
    Object.keys(COMMANDS).forEach(function (k) { var d = lev(cmd, k); if (d < bd) { bd = d; best = k; } });
    print('<span class="firefly">\u2726 Firefly</span>  <span class="str">\u2019' + esc(cmd) + '\u2019</span> isn\u2019t a command.' +
      (bd <= 3 ? ' did you mean <span class="kw">' + best + '</span>?' : ' try <span class="kw">help</span>.'));
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      var v = input.value;
      if (v.trim()) { history.push(v); hi = history.length; }
      run(v);
      input.value = '';
    } else if (e.key === 'Escape') {
      closeRepl();
    } else if (e.key === 'ArrowUp') {
      if (hi > 0) { hi--; input.value = history[hi] || ''; e.preventDefault(); }
    } else if (e.key === 'ArrowDown') {
      if (hi < history.length) { hi++; input.value = history[hi] || ''; }
    }
  }

  /* ---- keyboard charms: type "sage" or "firefly" anywhere ------------ */
  var seq = '';
  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!e.key || e.key.length !== 1) return;
    seq = (seq + e.key.toLowerCase()).slice(-10);
    if (/sage$/.test(seq)) openRepl();
    else if (/firefly$/.test(seq)) fire({ count: 12 });
  });

  /* ---- a quiet way in: the footer sparkle ---------------------------- */
  function wireFooter() {
    var fm = document.querySelector('.footer-mark');
    if (!fm) return;
    fm.style.cursor = 'pointer';
    fm.title = 'psst \u2726';
    fm.addEventListener('click', function () { opened ? closeRepl() : openRepl(); });
  }
  if (document.readyState !== 'loading') wireFooter();
  else document.addEventListener('DOMContentLoaded', wireFooter);
})();
